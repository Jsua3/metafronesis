"""Autoría y edición compartida de casos (``apps/autoria/autoria.py``).

El autor de un caso es quien lo creó y no cambia; otro docente lo edita creando una versión nueva (clon de una
publicada) que solo él ve y edita mientras es borrador; al publicarla el ADMIN, el caso conserva su autor y la persona
aparece en «Editado por».
"""
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.autoria import autoria
from apps.sesiones import servicios as sesiones
from apps.simulation.models import (CaseReview, CaseVersion, DecisionOption, Rubric, RubricCriterion, SimulationCase,
                                    SimulationNode, SimulationRubricAssignment)
from apps.users.models import CustomUser, PermisoDeAutoria
from shared.policies import ADMIN, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-26")]

BASE = "/api/authoring/cases"


def _version(caso, semver, creador, estado="DRAFT"):
    """Una versión que pasa la validación: inicio con pregunta, dos respuestas a un final y una rúbrica activa."""
    sellada = estado in ("PUBLISHED", "ARCHIVED")
    version = CaseVersion.objects.create(
        simulation_case=caso, semantic_version=semver, created_by=creador, status=estado, estimated_minutes=30,
        validated_at=timezone.now() if sellada else None, definition_hash="sha256:" + "b" * 64 if sellada else None)
    inicio = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Inicio",
                                           start_node=True, decision_prompt="¿Qué hacer?")
    fin = SimulationNode.objects.create(case_version=version, node_key="fin", title="Fin", narrative="Fin", terminal_node=True)
    for i, clase in enumerate(("RECOMMENDED", "ACCEPTABLE")):
        DecisionOption.objects.create(case_version=version, source_node=inicio, target_node=fin, option_key=f"opcion-{i}",
                                      text="Opción", response_class=clase, feedback_text="Explicación", theory_basis="Fundamento")
    rubrica = Rubric.objects.create(name=f"Rúbrica {semver}", created_by=creador)
    RubricCriterion.objects.create(rubric=rubrica, competency="C", title="Criterio", weight=100)
    SimulationRubricAssignment.objects.create(case_version=version, rubric=rubrica, assigned_by=creador)
    return version


@pytest.fixture
def gente(db):
    admin = CustomUser.objects.create_user(email="admin-compartida@example.test", role=ADMIN, nombre="Ada", apellido="Admin")
    docentes = {}
    for clave, nombre in (("autora", "Ana"), ("beto", "Beto"), ("carla", "Carla")):
        docentes[clave] = CustomUser.objects.create_user(email=f"{clave}-compartida@example.test", role=PROFESOR,
                                                         nombre=nombre, apellido="Docente")
        PermisoDeAutoria.objects.create(docente=docentes[clave], otorgado_por=admin)
    sin_permiso = CustomUser.objects.create_user(email="sin-permiso-compartida@example.test", role=PROFESOR, nombre="Saúl")
    return {"admin": admin, "sin_permiso": sin_permiso, **docentes}


@pytest.fixture
def caso(gente):
    """El caso de Ana: la 1.0.0 publicada y su borrador 1.1.0."""
    caso = SimulationCase.objects.create(code="COMPARTIDO", title="Caso compartido", created_by=gente["autora"])
    publicada = _version(caso, "1.0.0", gente["autora"], "PUBLISHED")
    borrador = _version(caso, "1.1.0", gente["autora"])
    return {"caso": caso, "publicada": publicada, "borrador": borrador}


def cliente(usuario):
    cliente = APIClient()
    cliente.force_authenticate(usuario)
    return cliente


def clonar(usuario, version):
    return cliente(usuario).post(f"{BASE}/{version.pk}/clone-version", {}, format="json")


def editar(usuario, version):
    version.refresh_from_db()
    return cliente(usuario).put(f"{BASE}/{version.pk}/brief", {"narrativeContext": "Cambio", "revision": version.version},
                                format="json")


def lista(usuario):
    respuesta = cliente(usuario).get(BASE)
    assert respuesta.status_code == 200
    return {fila["versionId"]: fila for fila in respuesta.data["data"]}


def clon_de(respuesta):
    assert respuesta.status_code == 201, respuesta.data
    return CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])


# ─── Ver en «Casos» ──────────────────────────────────────────────────────────────────────────────────────────────────
def test_el_docente_ve_las_publicadas_ajenas_pero_no_sus_borradores_ni_archivadas(gente, caso):
    archivada = _version(caso["caso"], "0.9.0", gente["autora"], "ARCHIVED")
    en_revision = _version(caso["caso"], "1.2.0", gente["autora"], "IN_REVIEW")
    filas = lista(gente["beto"])
    assert caso["publicada"].pk in filas
    assert not {caso["borrador"].pk, archivada.pk, en_revision.pk} & set(filas)


def test_el_docente_ve_sus_versiones_en_casos_ajenos_y_su_borrador_es_privado(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    assert clon.pk in lista(gente["beto"])
    assert clon.pk not in lista(gente["autora"])  # ni la autora del caso ve el borrador ajeno
    assert clon.pk not in lista(gente["carla"])
    assert cliente(gente["autora"]).get(f"{BASE}/{clon.pk}/editor").status_code == 404


def test_la_autora_ve_todas_las_versiones_de_su_caso_que_no_son_borradores_ajenos(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    clon.status = "IN_REVIEW"
    clon.save(update_fields=["status"])
    archivada = _version(caso["caso"], "0.9.0", gente["autora"], "ARCHIVED")
    assert {caso["publicada"].pk, caso["borrador"].pk, archivada.pk, clon.pk} <= set(lista(gente["autora"]))


def test_el_admin_lo_ve_todo(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    assert {caso["publicada"].pk, caso["borrador"].pk, clon.pk} <= set(lista(gente["admin"]))


def test_la_fila_lleva_autor_editores_y_lo_que_se_puede_hacer(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    de_beto = lista(gente["beto"])
    publicada, propio = de_beto[caso["publicada"].pk], de_beto[clon.pk]
    ana = {"id": gente["autora"].pk, "nombre": "Ana Docente"}
    beto = {"id": gente["beto"].pk, "nombre": "Beto Docente"}
    assert publicada["autor"] == ana and propio["autor"] == ana
    assert publicada["editadoPor"] == [beto]
    assert publicada["caseId"] == caso["caso"].pk and publicada["semanticVersion"] == "1.0.0"
    assert (publicada["puedeEditar"], publicada["puedeCrearVersion"]) == (False, True)
    assert (propio["puedeEditar"], propio["puedeCrearVersion"]) == (True, False)
    de_ana = lista(gente["autora"])
    assert (de_ana[caso["borrador"].pk]["puedeEditar"], de_ana[caso["publicada"].pk]["puedeCrearVersion"]) == (True, True)
    sin_permiso = lista(gente["sin_permiso"])[caso["publicada"].pk]
    assert (sin_permiso["puedeEditar"], sin_permiso["puedeCrearVersion"]) == (False, False)


# ─── Editar un borrador ──────────────────────────────────────────────────────────────────────────────────────────────
def test_solo_quien_creo_el_borrador_lo_edita(gente, caso):
    assert editar(gente["beto"], caso["borrador"]).status_code == 404
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    assert editar(gente["autora"], clon).status_code == 404  # la autora del caso tampoco edita el borrador ajeno
    assert editar(gente["beto"], clon).status_code == 200
    assert editar(gente["autora"], caso["borrador"]).status_code == 200


def test_la_publicada_ajena_se_abre_pero_no_se_edita(gente, caso):
    assert cliente(gente["beto"]).get(f"{BASE}/{caso['publicada'].pk}/editor").status_code == 200
    respuesta = editar(gente["beto"], caso["publicada"])
    assert respuesta.status_code == 409 and respuesta.data["code"] == "VERSION_NOT_EDITABLE"


def test_el_admin_edita_el_borrador_de_otro_docente(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    assert editar(gente["admin"], clon).status_code == 200


# ─── Crear una versión nueva ─────────────────────────────────────────────────────────────────────────────────────────
def test_el_docente_crea_una_version_de_la_publicada_ajena_sin_cambiar_el_autor(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    assert (clon.status, clon.created_by_id, clon.cloned_from_id) == ("DRAFT", gente["beto"].pk, caso["publicada"].pk)
    assert clon.simulation_case_id == caso["caso"].pk
    caso["caso"].refresh_from_db()
    assert caso["caso"].created_by_id == gente["autora"].pk


def test_no_se_clona_la_archivada_ajena_ni_sin_permiso_de_autoria(gente, caso):
    archivada = _version(caso["caso"], "0.9.0", gente["autora"], "ARCHIVED")
    assert clonar(gente["beto"], archivada).status_code == 404
    assert clonar(gente["autora"], archivada).status_code == 201
    respuesta = clonar(gente["sin_permiso"], caso["publicada"])
    assert respuesta.status_code == 403 and respuesta.data["code"] == "AUTHORING_NOT_ALLOWED"
    assert clonar(gente["beto"], caso["borrador"]).status_code == 404  # el borrador ajeno ni se ve


def test_el_ciclo_de_la_publicada_ajena_ofrece_crear_version(gente, caso):
    datos = cliente(gente["beto"]).get(f"{BASE}/{caso['publicada'].pk}/lifecycle").data["data"]
    assert datos["allowedTransitions"] == ["clone"]
    datos = cliente(gente["autora"]).get(f"{BASE}/{caso['publicada'].pk}/lifecycle").data["data"]
    assert datos["allowedTransitions"] == ["archive", "clone"]


def test_dos_docentes_que_clonan_la_misma_publicada_reciben_versiones_distintas(gente, caso):
    de_beto = clon_de(clonar(gente["beto"], caso["publicada"]))
    de_carla = clon_de(clonar(gente["carla"], caso["publicada"]))
    assert {de_beto.semantic_version, de_carla.semantic_version} == {"1.2.0", "1.3.0"}


def test_la_version_siguiente_sale_de_la_mayor_del_caso(gente, caso):
    _version(caso["caso"], "2.0.0", gente["autora"], "PUBLISHED")
    assert clon_de(clonar(gente["beto"], caso["publicada"])).semantic_version == "2.1.0"


# ─── Enviar, archivar y publicar ─────────────────────────────────────────────────────────────────────────────────────
def test_envia_a_revision_quien_creo_la_version(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    ruta = f"{BASE}/{clon.pk}/lifecycle"
    assert cliente(gente["autora"]).post(ruta, {"action": "submit"}, format="json").status_code == 404
    assert cliente(gente["beto"]).get(ruta).data["data"]["allowedTransitions"] == ["submit"]
    assert cliente(gente["beto"]).post(ruta, {"action": "submit"}, format="json").status_code == 200
    assert cliente(gente["beto"]).post(f"{BASE}/{caso['borrador'].pk}/lifecycle", {"action": "submit"},
                                       format="json").status_code == 404


def test_archiva_solo_la_autora_del_caso(gente, caso):
    ruta = f"{BASE}/{caso['publicada'].pk}/lifecycle"
    assert cliente(gente["beto"]).post(ruta, {"action": "archive"}, format="json").status_code == 404
    assert cliente(gente["autora"]).post(ruta, {"action": "archive"}, format="json").status_code == 200


def test_publicar_la_version_de_otro_docente_conserva_el_autor(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    assert cliente(gente["beto"]).post(f"{BASE}/{clon.pk}/lifecycle", {"action": "submit"}, format="json").status_code == 200
    assert cliente(gente["beto"]).post(f"{BASE}/{clon.pk}/publish", {}, format="json").status_code == 403
    assert cliente(gente["admin"]).post(f"{BASE}/{clon.pk}/publish", {}, format="json").status_code == 200
    clon.refresh_from_db()
    caso["caso"].refresh_from_db()
    assert clon.status == "PUBLISHED" and caso["caso"].created_by_id == gente["autora"].pk
    fila = lista(gente["carla"])[clon.pk]
    assert fila["autor"]["id"] == gente["autora"].pk and [p["id"] for p in fila["editadoPor"]] == [gente["beto"].pk]


def test_la_revision_devuelta_la_pidio_quien_creo_la_version(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    cliente(gente["beto"]).post(f"{BASE}/{clon.pk}/lifecycle", {"action": "submit"}, format="json")
    respuesta = cliente(gente["admin"]).post(f"{BASE}/{clon.pk}/lifecycle",
                                             {"action": "reject", "reason": "FORMA", "note": "Revisa el final"}, format="json")
    assert respuesta.status_code == 200
    assert CaseReview.objects.get(case_version=clon).requested_by_id == gente["beto"].pk
    assert respuesta.data["data"]["review"]["requestedBy"] == "Beto Docente"
    assert editar(gente["beto"], clon).status_code == 200  # el borrador devuelto sigue siendo de quien lo creó


# ─── «Editado por» ───────────────────────────────────────────────────────────────────────────────────────────────────
def test_editado_por_sigue_el_orden_de_la_primera_version_y_excluye_al_autor(gente, caso):
    for docente in ("carla", "beto", "carla", "autora"):
        clon_de(clonar(gente[docente], caso["publicada"]))
    editores = autoria.editores(caso["caso"])
    assert [p["id"] for p in editores] == [gente["carla"].pk, gente["beto"].pk]
    assert [p["nombre"] for p in editores] == ["Carla Docente", "Beto Docente"]
    vista = cliente(gente["beto"]).get(f"{BASE}/{caso['publicada'].pk}/editor").data["data"]
    assert vista["autor"] == {"id": gente["autora"].pk, "nombre": "Ana Docente"}
    assert [p["id"] for p in vista["editadoPor"]] == [gente["carla"].pk, gente["beto"].pk]


def test_un_caso_sin_otras_manos_no_tiene_editores(gente, caso):
    assert autoria.editores(caso["caso"]) == []
    assert lista(gente["autora"])[caso["publicada"].pk]["editadoPor"] == []


def test_la_biblioteca_de_sesiones_trae_editado_por(gente, caso):
    clon = clon_de(clonar(gente["beto"], caso["publicada"]))
    clon.status, clon.validated_at, clon.definition_hash = "PUBLISHED", timezone.now(), "sha256:" + "c" * 64
    clon.save(update_fields=["status", "validated_at", "definition_hash"])
    respuesta = cliente(gente["carla"]).get("/api/sesiones/casos")
    assert respuesta.status_code == 200
    filas = {fila["caseVersionId"]: fila for fila in respuesta.data["data"]}
    assert filas[clon.pk]["autor"] == "Ana Docente" and filas[clon.pk]["editadoPor"] == ["Beto Docente"]
    assert filas[caso["publicada"].pk]["editadoPor"] == ["Beto Docente"]
    assert sesiones.caso_dto(clon)["editadoPor"] == ["Beto Docente"]
