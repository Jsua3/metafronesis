"""Lectura y plantilla del archivo .xlsx de la importación de estudiantes.

Separado de ``services.py`` (antes un único módulo de 838 líneas con grupos, membresías, importación y
asignaciones): aquí solo vive el formato del archivo. Comprueba el archivo antes de leerlo, extrae las filas con
defusedxml y arma la plantilla descargable; no toca la base de datos ni decide nada sobre grupos o cuentas.
"""
import io
import re
import time
import zipfile
import zlib

from defusedxml import DefusedXmlException, DTDForbidden, EntitiesForbidden, ExternalReferenceForbidden
from defusedxml import ElementTree as SafeET
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import ValidationError

from shared.exceptions import ApiError

from .import_contract import (
    IGNORED_STUDENT_IMPORT_COLUMNS,
    REQUIRED_STUDENT_IMPORT_COLUMNS,
    STUDENT_IMPORT_COLUMNS,
)



IMPORT_HEADER_ALIASES = {
    "email": "email",
    "correo": "email",
    "correo electronico": "email",
    "correo electrónico": "email",
    "correo institucional": "email",
    "mail": "email",
    "nombre": "nombre",
    "nombres": "nombre",
    "name": "nombre",
    "apellido": "apellido",
    "apellidos": "apellido",
    "last name": "apellido",
    "password": "password",
    "contraseña": "password",
    "contrasena": "password",
    "contraseña temporal": "password",
    "contrasena temporal": "password",
    "clave": "password",
    "clave temporal": "password",
    "n": "_skip",
    "no": "_skip",
    "numero": "_skip",
    "número": "_skip",
    "#": "_skip",
}
REQUIRED_IMPORT_FIELDS = {"email", "nombre", "apellido"}


def _normalize_header(value):
    value = str(value or "").strip().lower()
    value = value.replace("°", "").replace("º", "").replace("#", "")
    value = re.sub(r"[\s_\-]+", " ", value).strip()
    return IMPORT_HEADER_ALIASES.get(value, value)


def _cell_text(cell):
    if cell is None:
        return ""
    value = str(cell).strip()
    if value.endswith(".0") and value[:-2].isdigit():
        return value[:-2]
    return value


def _import_invalid(message):
    return ApiError("IMPORT_INVALID", message, status.HTTP_400_BAD_REQUEST)


def _guard_upload(uploaded_file):
    """Comprueba el archivo ANTES de leerlo (LS-10): tamaño, firma ZIP y tamaño descomprimido.

    Un ``.xlsx`` es un ZIP de XML; sin estos topes un archivo pequeño que se expande a
    gigabytes (bomba de descompresión) agota la memoria del servidor.
    """
    size = getattr(uploaded_file, "size", None)
    if size is not None and size > settings.IMPORT_MAX_BYTES:
        raise ApiError(
            "FILE_TOO_LARGE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El archivo pesa demasiado: el máximo es {settings.IMPORT_MAX_BYTES // (1024 * 1024)} MB.",
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    uploaded_file.seek(0)
    if uploaded_file.read(4) != b"PK\x03\x04":
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El archivo no es un libro de Excel (.xlsx) válido.")
    uploaded_file.seek(0)
    try:
        with zipfile.ZipFile(uploaded_file) as zf:
            members = zf.infolist()
            if len(members) > settings.IMPORT_MAX_ZIP_MEMBERS:
                raise _import_invalid("El libro de Excel trae demasiados componentes.")
            if sum(m.file_size for m in members) > settings.IMPORT_MAX_UNCOMPRESSED_BYTES:
                raise _import_invalid("El libro de Excel es demasiado grande al abrirse.")
    except zipfile.BadZipFile:
        raise _import_invalid("El archivo no es un libro de Excel (.xlsx) válido.") from None
    uploaded_file.seek(0)


#: Lo que puede fallar al abrir y leer un ZIP corrupto, cifrado, con un método no soportado o con
#: referencias rotas: todo es «el archivo no sirve» (400), nunca un 500.
_UNREADABLE_BOOK = (
    zipfile.BadZipFile,
    zipfile.LargeZipFile,
    zlib.error,
    EOFError,
    RuntimeError,
    NotImplementedError,
    KeyError,
    ValueError,
    IndexError,
    OverflowError,
    SafeET.ParseError,
    # defusedxml (S2-6a): entidades, DTD y referencias externas. Son ValueError, pero se nombran por claridad.
    DefusedXmlException,
    DTDForbidden,
    EntitiesForbidden,
    ExternalReferenceForbidden,
)
_XML_ENCODING = re.compile(
    rb"""^(?:\xef\xbb\xbf)?\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']""", re.I
)
_UTF8_NAMES = (b"utf-8", b"utf8", b"us-ascii", b"ascii")
#: Referencia de celda de OOXML: hasta 3 letras de columna (A..XFD) y la fila.
_CELL_REF = re.compile(r"^([A-Za-z]{1,3})[0-9]*$")


def _read_xml(zf, name):
    """El XML de un componente del libro, sin declaraciones de tipo de documento (DOCTYPE).

    Un libro legítimo no las trae; con ellas se abre la puerta a la expansión de entidades
    («billion laughs») y a las entidades externas (XXE).
    """
    data = zf.read(name)
    # La comprobación de DOCTYPE mira bytes ASCII: solo vale si el XML está en UTF-8. En UTF-16/32
    # (o con NUL, o declarando otra codificación) la cadena ``<!DOCTYPE`` no aparecería tal cual y
    # expat la procesaría igual: se rechaza todo lo que no sea UTF-8.
    declared = _XML_ENCODING.match(data[:256])
    if (
        b"\x00" in data
        or data[:2] in (b"\xff\xfe", b"\xfe\xff")
        or (declared and declared.group(1).lower() not in _UTF8_NAMES)
    ):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El libro de Excel debe estar codificado en UTF-8.")
    lowered = data.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El libro de Excel contiene definiciones no permitidas.")
    return data


def _xlsx_shared_strings(zf):
    try:
        xml = _read_xml(zf, "xl/sharedStrings.xml")
    except KeyError:
        return []
    root = SafeET.fromstring(xml)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values = []
    for si in root.findall("x:si", ns):
        parts = [node.text or "" for node in si.findall(".//x:t", ns)]
        values.append("".join(parts))
    return values


def _xlsx_first_sheet_path(zf):
    try:
        workbook = SafeET.fromstring(_read_xml(zf, "xl/workbook.xml"))
        rels = SafeET.fromstring(_read_xml(zf, "xl/_rels/workbook.xml.rels"))
    except KeyError:
        raise ValidationError("El archivo Excel no tiene una hoja válida")
    ns = {
        "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    sheet = workbook.find("x:sheets/x:sheet", ns)
    if sheet is None:
        raise ValidationError("El archivo Excel no tiene hojas")
    rel_id = sheet.attrib.get(f"{{{ns['r']}}}id")
    for rel in rels.findall("rel:Relationship", ns):
        if rel.attrib.get("Id") == rel_id:
            target = rel.attrib.get("Target", "")
            if target.startswith("/"):
                return target.lstrip("/")
            return f"xl/{target}".replace("xl/worksheets/../", "xl/")
    raise ValidationError("No fue posible leer la primera hoja del Excel")


def _column_index(ref):
    """Índice (desde 0) de la columna de una referencia ``A1``; ``ValueError`` si no es una."""
    match = _CELL_REF.match(ref or "")
    if not match:
        raise ValueError("referencia de celda no válida")
    idx = 0
    for ch in match.group(1).upper():
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _too_slow():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return _import_invalid("El archivo tardó demasiado en leerse: divídelo en partes más pequeñas.")


def _parse_xlsx_rows(uploaded_file):
    started = time.monotonic()
    try:
        with zipfile.ZipFile(uploaded_file) as zf:
            shared = _xlsx_shared_strings(zf)
            sheet_path = _xlsx_first_sheet_path(zf)
            root = SafeET.fromstring(_read_xml(zf, sheet_path))
        return _sheet_rows(root, shared, started)
    except _UNREADABLE_BOOK:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El libro de Excel no se puede leer: revisa que el archivo no esté dañado.") from None


def _sheet_rows(root, shared, started):
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows = []
    cells_read = 0
    for row in root.findall(".//x:sheetData/x:row", ns):
        if len(rows) > settings.IMPORT_MAX_ROWS:
            raise _import_invalid(f"El archivo supera el máximo de {settings.IMPORT_MAX_ROWS} filas.")
        if time.monotonic() - started > settings.IMPORT_MAX_SECONDS:
            raise _too_slow()
        values = []
        for cell in row.findall("x:c", ns):
            cells_read += 1
            if cells_read % 256 == 0 and time.monotonic() - started > settings.IMPORT_MAX_SECONDS:
                raise _too_slow()
            ref = cell.attrib.get("r")
            idx = _column_index(ref) if ref else len(values)
            cell_type = cell.attrib.get("t")
            value_node = cell.find("x:v", ns)
            inline_node = cell.find("x:is/x:t", ns)
            if cell_type == "s" and value_node is not None:
                raw = value_node.text or ""
                value = shared[int(raw)] if raw.isdecimal() and int(raw) < len(shared) else ""
            elif inline_node is not None:
                value = inline_node.text or ""
            else:
                value = value_node.text if value_node is not None else ""
            if idx >= settings.IMPORT_MAX_COLUMNS:
                # Una celda lejana sin dato (formato, ancho de columna) se ignora; una con dato no
                # se carga: rellenar hasta ahí con vacíos agotaría la memoria (``XFD1`` = 16 384).
                if _cell_text(value):
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                    raise _import_invalid(
                        f"El libro trae datos más allá de la columna {settings.IMPORT_MAX_COLUMNS}."
                    )
                continue
            while len(values) <= idx:
                values.append("")
            values[idx] = _cell_text(value)
        rows.append(values)
    return rows


def _xml_escape(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _column_name(index):
    index += 1
    name = ""
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def _worksheet_xml(rows):
    sheet_rows = []
    for r_idx, row in enumerate(rows, start=1):
        cells = []
        for c_idx, value in enumerate(row):
            ref = f"{_column_name(c_idx)}{r_idx}"
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{_xml_escape(value)}</t></is></c>')
        sheet_rows.append(f'<row r="{r_idx}">{"".join(cells)}</row>')
    cols = '<cols><col min="1" max="4" width="28" customWidth="1"/></cols>'
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{cols}<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'


def student_import_template_bytes():
    data = io.BytesIO()
    rows = [
        list(STUDENT_IMPORT_COLUMNS),
        ["Ana", "Rojas", "ana.rojas@example.edu.co"],
    ]
    instructions = [
        ["Campo", "Obligatorio", "Instruccion"],
        ["nombre", "Si", "Primer nombre o nombres del estudiante."],
        ["apellido", "Si", "Apellidos del estudiante."],
        ["email", "Si", "Correo institucional o academico valido. No debe repetirse."],
        # BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (VD-23).
        ["cuenta", "-", "Las cuentas nuevas quedan pendientes de aprobacion; cada persona fija su contrasena al entrar."],
    ]
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""")
        zf.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        zf.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Estudiantes" sheetId="1" r:id="rId1"/>
    <sheet name="Instrucciones" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>""")
        zf.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>""")
        zf.writestr("xl/worksheets/sheet1.xml", _worksheet_xml(rows))
        zf.writestr("xl/worksheets/sheet2.xml", _worksheet_xml(instructions))
    return data.getvalue()


def _parse_student_import(uploaded_file):
    name = (uploaded_file.name or "").lower()
    if not name.endswith(".xlsx"):
        raise ValidationError("Carga un archivo .xlsx")
    _guard_upload(uploaded_file)
    rows = _parse_xlsx_rows(uploaded_file)
    rows = [row for row in rows if any(_cell_text(cell) for cell in row)]
    if not rows:
        raise ValidationError("El archivo no tiene estudiantes para importar")

    headers = [_normalize_header(cell) for cell in rows[0]]
    duplicates = sorted({
        header for header in headers
        if header and header != "_skip" and headers.count(header) > 1
    })
    if duplicates:
        raise ValidationError(f"Columnas duplicadas: {', '.join(duplicates)}")

    ignored = [header for header in headers if header in IGNORED_STUDENT_IMPORT_COLUMNS]
    unknown = [
        header for header in headers
        if header and header != "_skip"
        and header not in STUDENT_IMPORT_COLUMNS and header not in IGNORED_STUDENT_IMPORT_COLUMNS
    ]
    if unknown:
        raise ValidationError(f"Columnas no permitidas: {', '.join(unknown)}")

    missing = [column for column in REQUIRED_STUDENT_IMPORT_COLUMNS if column not in headers]
    if missing:
        readable = ", ".join(missing)
        raise ValidationError(f"Faltan columnas obligatorias: {readable}")

    parsed = []
    for offset, row in enumerate(rows[1:], start=2):
        item = {"row": offset}
        for idx, header in enumerate(headers):
            # Una columna ignorada (contraseña) NO se lee: el docente no fija contraseñas.
            if header in STUDENT_IMPORT_COLUMNS:
                item[header] = _cell_text(row[idx] if idx < len(row) else "")
        parsed.append(item)
    if not parsed:
        raise ValidationError("El archivo no tiene filas de estudiantes")
    return parsed, ignored


