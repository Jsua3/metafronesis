"""S2-6a · Límites de la importación de estudiantes: el sobre multipart y la lectura segura del .xlsx (RNF-002).

El middleware corta el sobre a 3 MiB antes de que la vista lo lea; la vista sigue cortando el archivo a 2 MiB por su
cuenta; y el .xlsx se lee con ``defusedxml``, que no expande entidades ni sigue referencias externas.
"""

import tracemalloc
import xml.etree.ElementTree as stdlib_et

import pytest
from defusedxml import DefusedXmlException, EntitiesForbidden
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.grupos import services
from apps.grupos.tests.test_grupos import _xlsx_upload
from apps.grupos.tests.test_import_hardening import (
    NS,
    XLSX,
    _bad_request,
    _book,
    _post,
    _upload,
    grupo,
    profesor,
)

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

MIB = 1024 * 1024


def _entidades_anidadas():
    """Nueve niveles de entidades («billion laughs»): sin guarda, el texto se expandiría a 10⁸ copias de «lol»."""
    declaraciones = ['<!ENTITY lol "lol">']
    for nivel in range(2, 10):
        declaraciones.append(f'<!ENTITY lol{nivel} "' + f"&lol{nivel - 1};" * 10 + '">')
    hoja = (
        f'<worksheet xmlns="{NS}"><sheetData>'
        '<row r="1"><c r="A1" t="inlineStr"><is><t>&lol9;</t></is></c></row>'
        "</sheetData></worksheet>"
    )
    return '<?xml version="1.0"?><!DOCTYPE lolz [' + "".join(declaraciones) + "]>" + hoja


ENTIDADES_ANIDADAS = _entidades_anidadas()


class _EspiaDeParser:
    """Envuelve el parser de ``services`` y anota los rechazos de defusedxml (la biblioteca estándar no los lanza)."""

    def __init__(self, parser):
        self._parser = parser
        self.ParseError = parser.ParseError
        self.rechazos = []

    def fromstring(self, texto, *args, **kwargs):
        try:
            return self._parser.fromstring(texto, *args, **kwargs)
        except DefusedXmlException as exc:
            self.rechazos.append(type(exc))
            raise


def _medido(operacion):
    """Ejecuta ``operacion`` y devuelve su resultado y el pico de memoria Python que trajo."""
    tracemalloc.start()
    try:
        resultado = operacion()
        _, pico = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    return resultado, pico


def _subir_entidades_sin_la_guarda(grupo, monkeypatch, parser=None):
    """Sube el libro con entidades saltándose la comprobación de DOCTYPE de ``_read_xml``: el parser decide.

    Devuelve la respuesta, los rechazos que lanzó el parser y el pico de memoria.
    """
    monkeypatch.setattr(services, "_read_xml", lambda zf, name: zf.read(name))
    espia = _EspiaDeParser(parser if parser is not None else services.SafeET)
    monkeypatch.setattr(services, "SafeET", espia)
    respuesta, pico = _medido(lambda: _post(grupo, _upload(_book(ENTIDADES_ANIDADAS))))
    return respuesta, espia.rechazos, pico


# ── El .xlsx con entidades ───────────────────────────────────────────────────────────────────


def test_un_libro_con_entidades_se_rechaza_sin_expandirlas(grupo):
    respuesta, pico = _medido(lambda: _post(grupo, _upload(_book(ENTIDADES_ANIDADAS))))

    _bad_request(respuesta)
    assert pico < 20 * MIB


def test_el_parser_rechaza_las_entidades_aunque_no_hubiera_guarda_de_doctype(grupo, monkeypatch):
    respuesta, rechazos, pico = _subir_entidades_sin_la_guarda(grupo, monkeypatch)

    _bad_request(respuesta)
    assert EntitiesForbidden in rechazos
    assert pico < 20 * MIB


def test_control_negativo_con_el_parser_de_la_biblioteca_estandar_no_hay_rechazo(grupo, monkeypatch):
    _, rechazos, _ = _subir_entidades_sin_la_guarda(grupo, monkeypatch, parser=stdlib_et)

    with pytest.raises(AssertionError):
        assert EntitiesForbidden in rechazos


# ── Los dos topes de la importación ──────────────────────────────────────────────────────────


def test_un_archivo_de_2_5_mib_lo_rechaza_la_vista_por_su_propio_tope(grupo):
    upload = SimpleUploadedFile("grande.xlsx", b"PK\x03\x04" + b"0" * (2_621_440 - 4), content_type=XLSX)

    respuesta = _post(grupo, upload)

    assert respuesta.status_code == 413
    assert respuesta.data["code"] == "FILE_TOO_LARGE"


def test_el_sobre_de_la_importacion_corta_en_3_mib_mas_uno(grupo):
    cliente, grupo_id = grupo

    respuesta = cliente.post(
        f"/api/grupos/{grupo_id}/estudiantes/import/",
        data=b"x" * (3 * MIB + 1),
        content_type="multipart/form-data; boundary=sobre",
    )

    assert respuesta.status_code == 413
    assert respuesta.json()["code"] == "REQUEST_TOO_LARGE"


def test_el_sobre_en_el_tope_exacto_llega_a_la_vista(grupo):
    cliente, grupo_id = grupo

    respuesta = cliente.post(
        f"/api/grupos/{grupo_id}/estudiantes/import/",
        data=b"x" * (3 * MIB),
        content_type="multipart/form-data; boundary=sobre",
    )

    assert respuesta.status_code != 413


def test_un_xlsx_normal_sigue_importando(grupo):
    filas = [["nombre", "apellido", "email"], ["Ana", "Rojas", "ana.limites@hostil.test"]]

    respuesta = _post(grupo, _xlsx_upload(filas))

    assert respuesta.status_code == 200
    assert respuesta.data["data"]["created"] == 1
