from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from drf_spectacular.generators import SchemaGenerator
from PIL import Image, PngImagePlugin
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo
from apps.publicacion.clonado import clonar
from apps.simulation.models import AuditLog, CaseVersion
from apps.users.models import PermisoDeAutoria
from shared.contract_testing import assert_matches, response_schema
from .test_borrador import crear

pytestmark = pytest.mark.django_db
EDITOR = "/api/authoring/cases"
SIMULACION = "/api/simulation"


@pytest.fixture
def version(cliente):
    return CaseVersion.objects.get(pk=crear(cliente).data["data"]["versionId"])


def imagen(formato="PNG", dimensiones=(240, 132)):
    salida = BytesIO()
    metadatos = PngImagePlugin.PngInfo()
    metadatos.add_text("Comment", "texto privado")
    extra = {"pnginfo": metadatos} if formato == "PNG" else {}
    Image.new("RGB", dimensiones, "purple").save(salida, formato, **extra)
    return salida.getvalue()


def subir(cliente, version, contenido, **datos):
    archivo = SimpleUploadedFile("nombre-del-docente.svg", contenido, content_type="image/svg+xml")
    return cliente.put(f"{EDITOR}/{version.pk}/cover", {"imagen": archivo, **datos}, format="multipart",
                       HTTP_X_CASE_REVISION=str(version.version))


@pytest.mark.parametrize("formato,extension", [("PNG", "png"), ("JPEG", "jpg"), ("WEBP", "webp")])
def test_docente_sube_por_contenido_y_la_url_sirve_la_imagen_limpia(cliente, version, formato, extension):
    respuesta = subir(cliente, version, imagen(formato), pixelArt="true")
    assert respuesta.status_code == 200, respuesta.data
    datos = respuesta.data["data"]
    assert datos["revision"] == version.version + 1 and datos["portadaPixelArt"] is True
    publica = APIClient().get(datos["portada"], HTTP_ACCEPT=f"image/{formato.lower()}")
    assert publica.status_code == 200
    assert publica["Content-Type"] == f"image/{formato.lower()}"
    assert "nombre-del-docente" not in publica["Content-Disposition"]
    assert publica["Content-Disposition"].endswith(f'.{extension}"')
    with Image.open(BytesIO(publica.content)) as limpia:
        assert limpia.format == formato and limpia.size == (240, 132)
        assert "Comment" not in limpia.info
    assert AuditLog.objects.filter(action="CASE_COVER_UPDATED", resource_id=str(version.pk)).exists()


@pytest.mark.parametrize("contenido,codigo", [
    (lambda: b"<svg xmlns='http://www.w3.org/2000/svg'/>", "CASE_COVER_INVALID"),
    (lambda: b"\x89PNG\r\n\x1a\n" + b"archivo falso", "CASE_COVER_INVALID"),
    (lambda: imagen()[:60], "CASE_COVER_INVALID"),
    (lambda: imagen(dimensiones=(63, 132)), "CASE_COVER_DIMENSIONS"),
    (lambda: imagen(dimensiones=(2049, 132)), "CASE_COVER_DIMENSIONS"),
    (lambda: imagen() + bytes(2 * 1024 * 1024), "CASE_COVER_TOO_LARGE"),
])
def test_rechaza_archivos_invalidos_sin_cambiar_la_portada(cliente, version, contenido, codigo):
    original = subir(cliente, version, imagen()).data["data"]["portada"]
    version.refresh_from_db()
    respuesta = subir(cliente, version, contenido())
    assert respuesta.status_code == 400 and respuesta.data["code"] == codigo
    assert cliente.get(f"{EDITOR}/{version.pk}/editor").data["data"]["portada"] == original


def test_tope_del_cuerpo_antes_de_leerlo(cliente, version):
    respuesta = subir(cliente, version, bytes(3 * 1024 * 1024))
    assert respuesta.status_code == 413 and respuesta.json()["code"] == "REQUEST_TOO_LARGE"


def test_acepta_hasta_2_mb_y_quita_los_bytes_anexados(cliente, version):
    archivo = imagen().ljust(2 * 1024 * 1024, b"x")
    respuesta = subir(cliente, version, archivo)
    assert respuesta.status_code == 200, respuesta.data
    portada = APIClient().get(respuesta.data["data"]["portada"])
    assert len(portada.content) < len(archivo)


def test_rechaza_imagen_animada(cliente, version):
    salida = BytesIO()
    primera = Image.new("RGB", (240, 132), "purple")
    segunda = Image.new("RGB", (240, 132), "orange")
    primera.save(salida, "WEBP", save_all=True, append_images=[segunda], duration=100)
    respuesta = subir(cliente, version, salida.getvalue())
    assert respuesta.status_code == 400 and respuesta.data["code"] == "CASE_COVER_INVALID"


def test_permisos_de_edicion_y_estado(cliente, usuarios, version):
    ruta = f"{EDITOR}/{version.pk}/cover"
    assert APIClient().delete(ruta).status_code == 401
    cliente.force_authenticate(usuarios[2])
    assert subir(cliente, version, imagen()).status_code == 403
    cliente.force_authenticate(usuarios[1])
    assert subir(cliente, version, imagen()).status_code == cliente.delete(ruta).status_code == 404
    cliente.force_authenticate(usuarios[0])
    PermisoDeAutoria.objects.filter(docente=usuarios[0]).delete()
    assert subir(cliente, version, imagen()).data["code"] == "AUTHORING_NOT_ALLOWED"
    permiso = PermisoDeAutoria.objects.get(docente=usuarios[1])
    cliente.force_authenticate(permiso.otorgado_por)
    assert subir(cliente, version, imagen()).status_code == 200
    version.refresh_from_db()
    version.status = "PUBLISHED"
    version.save(update_fields=["status"])
    assert subir(cliente, version, imagen()).status_code == cliente.delete(ruta).status_code == 409


def test_reemplaza_y_quita_en_el_clon_sin_tocar_la_version_asignada(cliente, usuarios, version):
    original = subir(cliente, version, imagen(), pixelArt="true").data["data"]["portada"]
    version.refresh_from_db()
    version.status = "PUBLISHED"
    version.save(update_fields=["status"])
    clon = clonar(usuarios[1], version.pk)
    cliente.force_authenticate(usuarios[1])
    ruta = f"{EDITOR}/{clon.pk}"
    assert cliente.get(f"{ruta}/editor").data["data"]["portada"] == original
    reemplazo = subir(cliente, clon, imagen("WEBP")).data["data"]
    assert reemplazo["portada"] != original and not reemplazo["portadaPixelArt"]
    assert cliente.delete(f"{ruta}/cover", HTTP_X_CASE_REVISION=str(clon.version)).data["code"] == "REVISION_CONFLICT"
    quitada = cliente.delete(f"{ruta}/cover", HTTP_X_CASE_REVISION=str(reemplazo["revision"]))
    assert quitada.data["data"]["portada"] is None
    assert APIClient().get(reemplazo["portada"]).status_code == 404
    assert APIClient().get(original).status_code == 200
    assert AuditLog.objects.filter(action="CASE_COVER_REMOVED", resource_id=str(clon.pk)).exists()


def test_contratos_de_subida_catalogo_y_ficha(cliente, usuarios, version):
    documento = SchemaGenerator().get_schema(public=True)
    ruta = f"{EDITOR}/{{case_version_id}}/cover"
    operacion = documento["paths"][ruta]["put"]
    peticion = operacion["requestBody"]["content"]["multipart/form-data"]["schema"]
    if "$ref" in peticion:
        peticion = documento["components"]["schemas"][peticion["$ref"].rsplit("/", 1)[-1]]
    assert peticion["properties"]["imagen"]["format"] == "binary"
    subida = subir(cliente, version, imagen(), pixelArt="true")
    assert_matches(subida.json(), response_schema(documento, ruta, "put"), documento)
    vencida = subir(cliente, version, imagen())
    assert vencida.status_code == 409
    assert_matches(vencida.json(), response_schema(documento, ruta, "put", "409"), documento)
    portada = subida.data["data"]["portada"]
    editor = f"{EDITOR}/{{case_version_id}}/editor"
    respuesta = cliente.get(f"{EDITOR}/{version.pk}/editor")
    assert_matches(respuesta.json(), response_schema(documento, editor, "get"), documento)
    assert respuesta.data["data"]["portada"] == portada
    exportado = cliente.get(f"{EDITOR}/{version.pk}/export").data["data"]
    assert {"portada", "portadaPixelArt"}.isdisjoint(exportado["ficha"])

    CaseVersion.objects.filter(pk=version.pk).update(
        status="PUBLISHED", validated_at=timezone.now(), definition_hash="sha256:" + "a" * 64)
    grupo = Grupo.objects.create(nombre="Grupo de prueba", codigo="CUBIERTA", profesor=usuarios[0])
    CaseAssignment.objects.create(case_version=version, grupo=grupo, assigned_by=usuarios[0])
    respuesta = cliente.get("/api/assignments")
    assert_matches(respuesta.json(), response_schema(documento, "/api/assignments", "get"), documento)
    assert respuesta.data["data"][0]["portada"] == portada
    CaseAssignment.objects.create(case_version=version, estudiante=usuarios[2], assigned_by=usuarios[0])
    cliente.force_authenticate(usuarios[2])
    for ruta, url in [
        (f"{SIMULACION}/catalog", f"{SIMULACION}/catalog"),
        (f"{SIMULACION}/cases/{{case_version_id}}/brief", f"{SIMULACION}/cases/{version.pk}/brief"),
    ]:
        respuesta = cliente.get(url)
        assert respuesta.status_code == 200, respuesta.data
        cuerpo = respuesta.json()
        assert_matches(cuerpo, response_schema(documento, ruta, "get"), documento)
        datos = cuerpo[0] if isinstance(cuerpo, list) else cuerpo["data"]
        assert datos["portada"] == portada and datos["portadaPixelArt"] is True
