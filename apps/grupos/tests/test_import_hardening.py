"""E2-9 · La importación de estudiantes valida el archivo antes de leerlo (LS-10, RNF-01).

Un ``.xlsx`` es un ZIP de XML: se rechaza por tamaño, por firma, por «bomba de descompresión»
(poco comprimido, muchísimo al abrirlo), por número de filas, por una declaración ``DOCTYPE``
(entidades: XXE y «billion laughs») y por tiempo. Todo **antes** de crear una sola cuenta.
"""
import io
import time
import zipfile

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.grupos import services
from apps.grupos.tests.test_grupos import _xlsx_upload

pytestmark = [pytest.mark.req("LS-10"), pytest.mark.req("RNF-01")]

User = get_user_model()
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="hard_prof@x.com", password="Profe-Segura-2026!", nombre="Pro", apellido="Fe", role="PROFESOR"
    )


@pytest.fixture
def grupo(profesor):
    client = APIClient()
    client.force_authenticate(user=profesor)
    data = client.post("/api/grupos", {"nombre": "G", "codigo": "HARD1"}, format="json").data["data"]
    return client, data["id"]


def _post(grupo, upload):
    client, grupo_id = grupo
    return client.post(f"/api/grupos/{grupo_id}/estudiantes/import/", {"file": upload}, format="multipart")


def _workbook(sheet_xml):
    """Un libro mínimo con la hoja dada (para fabricar archivos hostiles)."""
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        zf.writestr("xl/workbook.xml", f'<?xml version="1.0"?><workbook xmlns="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="E" sheetId="1" r:id="rId1"/></sheets></workbook>')
        zf.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return SimpleUploadedFile("hostil.xlsx", data.getvalue(), content_type=XLSX)


def _no_accounts_were_created():
    return not User.objects.filter(email__endswith="@hostil.test").exists()


def test_a_fifty_megabyte_file_is_refused_by_size(grupo):
    upload = SimpleUploadedFile("enorme.xlsx", b"PK\x03\x04" + b"0" * (50 * 1024 * 1024), content_type=XLSX)

    response = _post(grupo, upload)

    # S2-6a: un sobre de más de 3 MiB lo corta el tope del cuerpo antes de que la vista lo lea. El FILE_TOO_LARGE
    # de la vista se prueba para archivos de 2 a 3 MiB en test_import_limites.py.
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"


def test_a_file_that_is_not_a_zip_is_refused(grupo):
    response = _post(grupo, SimpleUploadedFile("falso.xlsx", b"esto no es un libro de excel", content_type=XLSX))

    assert response.status_code == 400
    assert response.data["code"] == "IMPORT_INVALID"


def test_a_small_decompression_bomb_is_refused_before_parsing(grupo):
    """Unos cientos de KB comprimidos que al abrirse pesan decenas de MB."""
    filler = " " * (60 * 1024 * 1024)
    sheet = f'<?xml version="1.0"?><worksheet xmlns="{NS}"><sheetData>{filler}</sheetData></worksheet>'
    upload = _workbook(sheet)
    assert upload.size < 2 * 1024 * 1024  # el archivo en sí es pequeño

    response = _post(grupo, upload)

    assert response.status_code == 400
    assert response.data["code"] == "IMPORT_INVALID"


def test_too_many_rows_are_refused(grupo, settings):
    settings.IMPORT_MAX_ROWS = 50
    rows = [["nombre", "apellido", "email"]] + [[f"N{i}", "A", f"u{i}@hostil.test"] for i in range(60)]

    response = _post(grupo, _xlsx_upload(rows))

    assert response.status_code == 400
    assert response.data["code"] == "IMPORT_INVALID"
    assert _no_accounts_were_created()


def test_a_doctype_declaration_is_refused(grupo):
    sheet = (
        '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]>'
        f'<worksheet xmlns="{NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lol;</t></is></c></row>'
        "</sheetData></worksheet>"
    )

    response = _post(grupo, _workbook(sheet))

    assert response.status_code == 400
    assert response.data["code"] == "IMPORT_INVALID"


def test_a_file_that_takes_too_long_is_refused(grupo, settings, monkeypatch):
    settings.IMPORT_MAX_SECONDS = 1
    clock = iter([0.0] + [5.0] * 10_000)
    monkeypatch.setattr(services.time, "monotonic", lambda: next(clock))
    rows = [["nombre", "apellido", "email"]] + [[f"N{i}", "A", f"u{i}@hostil.test"] for i in range(20)]

    response = _post(grupo, _xlsx_upload(rows))

    assert response.status_code == 400
    assert response.data["code"] == "IMPORT_INVALID"
    assert _no_accounts_were_created()


def test_a_normal_file_still_imports(grupo):
    rows = [["nombre", "apellido", "email"], ["Ana", "Rojas", "ana.ok@hostil.test"]]

    response = _post(grupo, _xlsx_upload(rows))

    assert response.status_code == 200
    assert response.data["data"]["created"] == 1


def test_the_time_budget_is_a_wall_clock_of_a_few_seconds_by_default():
    from django.conf import settings

    assert 0 < settings.IMPORT_MAX_SECONDS <= 10
    assert 0 < settings.IMPORT_MAX_BYTES <= 5 * 1024 * 1024
    assert 0 < settings.IMPORT_MAX_ROWS <= 5000
    assert time.monotonic() >= 0


# ─── Revisión de fase E2 · lo que un libro hostil todavía lograba ────────────────────────────────────
def _cell(ref, text):
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def _row(number, *texts, extra=""):
    cells = "".join(_cell(f"{'ABC'[i]}{number}", text) for i, text in enumerate(texts))
    return f'<row r="{number}">{cells}{extra}</row>'


def _sheet(*rows):
    return f'<?xml version="1.0"?><worksheet xmlns="{NS}"><sheetData>{"".join(rows)}</sheetData></worksheet>'


HEADER_ROW = _row(1, "nombre", "apellido", "email")


def _book(sheet, target="worksheets/sheet1.xml"):
    """Como ``_workbook`` pero con el destino de la relación a la hoja a elección."""
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        zf.writestr("xl/workbook.xml", f'<?xml version="1.0"?><workbook xmlns="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="E" sheetId="1" r:id="rId1"/></sheets></workbook>')
        zf.writestr("xl/_rels/workbook.xml.rels", f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="{target}"/></Relationships>')
        zf.writestr("xl/worksheets/sheet1.xml", sheet)
    return data.getvalue()


def _upload(raw):
    return SimpleUploadedFile("hostil.xlsx", raw, content_type=XLSX)


def _central_entry(raw, name):
    """Posición del registro del directorio central del componente ``name``."""
    marker = b"PK\x01\x02"
    at = raw.find(marker)
    while at != -1:
        name_len = int.from_bytes(raw[at + 28:at + 30], "little")
        if raw[at + 46:at + 46 + name_len] == name.encode():
            return at
        at = raw.find(marker, at + 4)
    raise AssertionError(f"{name} no está en el directorio central")


def _bad_request(response):
    assert response.status_code == 400, response.data
    assert response.data["code"] == "IMPORT_INVALID"
    assert _no_accounts_were_created()


def test_a_value_far_to_the_right_is_refused_instead_of_padding_the_row(grupo):
    far = _cell("XFD2", "x")
    sheet = _sheet(HEADER_ROW, _row(2, "Ana", "Rojas", "ana@hostil.test", extra=far))

    _bad_request(_post(grupo, _upload(_book(sheet))))


def test_the_parsed_rows_never_grow_past_the_column_cap(settings):
    sheet = _sheet(f'<row r="1">{_cell("A1", "nombre")}<c r="ZZZ1" s="1"/></row>')

    rows = services._parse_xlsx_rows(io.BytesIO(_book(sheet)))

    assert max(len(row) for row in rows) <= settings.IMPORT_MAX_COLUMNS


def test_an_empty_styled_cell_far_to_the_right_is_harmless(grupo):
    far = '<c r="ZZ2" s="3"/>'
    sheet = _sheet(HEADER_ROW, _row(2, "Ana", "Rojas", "ana.styled@hostil.test", extra=far))

    response = _post(grupo, _upload(_book(sheet)))

    assert response.status_code == 200
    assert response.data["data"]["created"] == 1


def test_a_cell_reference_with_a_huge_column_is_an_import_error_not_a_hang(grupo):
    sheet = _sheet(f'<row r="1">{_cell("ZZZZZZZZ1", "x")}</row>')

    _bad_request(_post(grupo, _upload(_book(sheet))))


def test_a_corrupt_deflate_stream_is_an_import_error_not_a_500(grupo):
    raw = bytearray(_book(_sheet(HEADER_ROW, _row(2, "Ana", "Rojas", "ana@hostil.test"))))
    name = b"xl/worksheets/sheet1.xml"
    at = raw.find(name)
    extra_len = int.from_bytes(raw[at - 2:at], "little")
    start = at + len(name) + extra_len
    raw[start:start + 12] = b"\xff" * 12

    _bad_request(_post(grupo, _upload(bytes(raw))))


def test_an_encrypted_member_is_an_import_error_not_a_500(grupo):
    raw = bytearray(_book(_sheet(HEADER_ROW, _row(2, "Ana", "Rojas", "ana@hostil.test"))))
    entry = _central_entry(bytes(raw), "xl/worksheets/sheet1.xml")
    raw[entry + 8] |= 0x01  # bit de «cifrado» de las banderas generales

    _bad_request(_post(grupo, _upload(bytes(raw))))


def test_an_unsupported_compression_method_is_an_import_error_not_a_500(grupo):
    raw = bytearray(_book(_sheet(HEADER_ROW, _row(2, "Ana", "Rojas", "ana@hostil.test"))))
    entry = _central_entry(bytes(raw), "xl/worksheets/sheet1.xml")
    raw[entry + 10:entry + 12] = (9).to_bytes(2, "little")  # Deflate64: no soportado

    _bad_request(_post(grupo, _upload(bytes(raw))))


def test_a_relationship_to_a_missing_sheet_is_an_import_error_not_a_500(grupo):
    sheet = _sheet(HEADER_ROW, _row(2, "Ana", "Rojas", "ana@hostil.test"))

    _bad_request(_post(grupo, _upload(_book(sheet, target="worksheets/no-existe.xml"))))


def test_a_superscript_digit_as_a_shared_string_index_is_not_a_500(grupo):
    sheet = _sheet('<row r="1"><c r="A1" t="s"><v>²</v></c></row>')

    response = _post(grupo, _upload(_book(sheet)))

    assert response.status_code == 400
    assert response.data["code"] != "INTERNAL_ERROR"


@pytest.mark.parametrize("encoding", ["utf-16", "utf-16-le", "utf-16-be"])
def test_an_xml_in_utf16_cannot_smuggle_a_doctype(grupo, encoding):
    text = (
        '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE lolz [<!ENTITY lol "ana">]>'
        f'<worksheet xmlns="{NS}"><sheetData>{HEADER_ROW}{_row(2, "&lol;", "Rojas", "ana@hostil.test")}'
        "</sheetData></worksheet>"
    )

    _bad_request(_post(grupo, _upload(_book(text.encode(encoding)))))


def test_an_xml_declaring_another_ascii_compatible_encoding_is_refused(grupo):
    text = (
        '<?xml version="1.0" encoding="cp037"?>'
        f'<worksheet xmlns="{NS}"><sheetData>{HEADER_ROW}</sheetData></worksheet>'
    )

    _bad_request(_post(grupo, _upload(_book(text.encode("utf-8")))))


def test_a_name_longer_than_the_column_is_a_row_error_not_a_500(grupo):
    response = _post(grupo, _xlsx_upload([["nombre", "apellido", "email"], ["N" * 101, "Rojas", "largo@hostil.test"]]))

    assert response.status_code == 400
    errors = response.data["data"]["errors"]
    assert [(e["row"], e["field"]) for e in errors] == [(2, "nombre")]
    assert _no_accounts_were_created()


def test_an_email_longer_than_the_column_is_a_row_error_not_a_500(grupo):
    long_email = "a" * 250 + "@hostil.test"

    response = _post(grupo, _xlsx_upload([["nombre", "apellido", "email"], ["Ana", "Rojas", long_email]]))

    assert response.status_code == 400
    assert [e["field"] for e in response.data["data"]["errors"]] == ["email"]


def test_the_uncompressed_cap_is_small_enough_for_the_memory_of_a_worker():
    from django.conf import settings

    assert settings.IMPORT_MAX_UNCOMPRESSED_BYTES <= 10 * 1024 * 1024
    assert settings.IMPORT_MAX_COLUMNS <= 64
