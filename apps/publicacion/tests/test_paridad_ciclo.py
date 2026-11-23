"""Paridad con v3: huella y clonado de los campos nuevos, lectura del ciclo de vida y devolver a borrador con nota."""
import pytest

from apps.publicacion.huella import huella_de
from apps.simulation.models import AuditLog, CaseReview, CaseVersion
from apps.users.models import CustomUser
from shared.policies import ADMIN

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-238")]


def ruta(caso, accion):
    return f"/api/authoring/cases/{caso['version'].pk}/{accion}"


def admin(caso):
    usuario = CustomUser.objects.create_user(email="admin-ciclo@example.test", password="test-only", role=ADMIN)
    caso["cliente"].force_authenticate(usuario)
    return usuario


def test_la_huella_y_el_clon_incluyen_las_advertencias_de_contenido(caso):
    version = caso["version"]
    inicial = huella_de(version)
    version.content_warnings = '["Violencia de pareja"]'
    version.save()
    actual = huella_de(version)
    assert actual != inicial
    version.status = "PUBLISHED"
    version.save()
    respuesta = caso["cliente"].post(ruta(caso, "clone-version"), {}, format="json")
    copia = CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])
    assert copia.content_warnings == '["Violencia de pareja"]' and huella_de(copia) == actual


def test_la_huella_cubre_los_campos_de_escena_y_decision(caso):
    version = caso["version"]
    base = huella_de(version)
    for campo, valor in (("support_resources_json", '["x"]'), ("required_tools_json", '["y"]'), ("sensitive_content", True),
                         ("safe_exit_required", True), ("warning_message", "aviso"), ("position_x", 9), ("intensity", "HIGH")):
        setattr(caso["inicio"], campo, valor)
        caso["inicio"].save()
        cambiada = huella_de(version)
        assert cambiada != base, campo
        base = cambiada
    for campo, valor in (("prohibition_reason", "motivo"), ("immediate_feedback", "ahora"), ("consequence_text", "luego"), ("effects", '{"persona":{"bond":1}}')):
        setattr(caso["opciones"][0], campo, valor)
        caso["opciones"][0].save()
        cambiada = huella_de(version)
        assert cambiada != base, campo
        base = cambiada


def test_clon_copia_los_campos_de_escena_y_decision(caso):
    inicio, opcion = caso["inicio"], caso["opciones"][0]
    inicio.support_resources_json, inicio.sensitive_content, inicio.position_x, inicio.intensity = '["x"]', True, 9, "HIGH"
    inicio.save()
    opcion.consequence_text, opcion.effects = "luego", '{"persona":{"bond":1}}'
    opcion.save()
    caso["version"].status = "PUBLISHED"
    caso["version"].save()
    copia = CaseVersion.objects.get(pk=caso["cliente"].post(ruta(caso, "clone-version"), {}, format="json").data["data"]["versionId"])
    nodo = copia.nodes.get(node_key="inicio")
    assert (nodo.support_resources_json, nodo.sensitive_content, nodo.position_x, nodo.intensity) == ('["x"]', True, 9, "HIGH")
    clon = copia.decisions.get(option_key=opcion.option_key)
    assert (clon.consequence_text, clon.effects) == ("luego", '{"persona":{"bond":1}}')


def test_lifecycle_se_lee_con_estado_transiciones_y_lista(caso):
    respuesta = caso["cliente"].get(ruta(caso, "lifecycle"))
    assert respuesta.status_code == 200
    datos = respuesta.data["data"]
    assert datos["caseVersionId"] == caso["version"].pk and datos["state"] == "DRAFT"
    assert datos["allowedTransitions"] == ["submit"]
    assert [item["code"] for item in datos["checklist"]["items"]][0] == "contentOriginal" and "review" not in datos
    assert "blockedReason" not in datos
    caso["inicio"].decision_prompt = ""
    caso["inicio"].save()
    bloqueado = caso["cliente"].get(ruta(caso, "lifecycle")).data["data"]
    assert bloqueado["blockedReason"]["code"] == "NODE_NO_QUESTION"


def test_lifecycle_del_admin_ofrece_aprobar_y_devolver_y_ajeno_es_404(caso):
    caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "submit"}, format="json")
    admin(caso)
    datos = caso["cliente"].get(ruta(caso, "lifecycle")).data["data"]
    assert datos["state"] == "IN_REVIEW" and datos["allowedTransitions"] == ["approve", "reject"]
    otro = CustomUser.objects.create_user(email="otro-docente@example.test", password="test-only", role="PROFESOR")
    caso["cliente"].force_authenticate(otro)
    assert caso["cliente"].get(ruta(caso, "lifecycle")).status_code == 404


def test_transicion_devuelve_el_ciclo_junto_a_lo_de_siempre(caso):
    datos = caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "submit"}, format="json").data["data"]
    assert datos["status"] == "IN_REVIEW" and datos["versionId"] == caso["version"].pk
    assert datos["state"] == "IN_REVIEW" and datos["allowedTransitions"] == []


def test_admin_devuelve_a_borrador_con_nota_y_motivo(caso):
    caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "submit"}, format="json")
    usuario = admin(caso)
    respuesta = caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "reject", "reason": "CONTENIDO", "note": "Falta el protocolo"}, format="json")
    assert respuesta.status_code == 200 and respuesta.data["data"]["state"] == "DRAFT"
    version = caso["version"]
    version.refresh_from_db()
    assert version.status == "DRAFT" and version.validated_at is None and version.definition_hash is None
    revision = CaseReview.objects.get(case_version=version)
    assert (revision.decision, revision.reason, revision.note, revision.decided_by) == ("REJECTED", "CONTENIDO", "Falta el protocolo", usuario)
    assert respuesta.data["data"]["review"]["note"] == "Falta el protocolo" and respuesta.data["data"]["review"]["reason"] == "CONTENIDO"
    assert AuditLog.objects.filter(action="CASE_REJECTED").exists()
    assert caso["cliente"].get(ruta(caso, "lifecycle")).data["data"]["review"]["decision"] == "REJECTED"


@pytest.mark.parametrize("cuerpo", [{"reason": "CONTENIDO", "note": ""}, {"reason": "OTRO", "note": "x"}, {"note": "x"}])
def test_devolver_exige_motivo_y_nota(caso, cuerpo):
    caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "submit"}, format="json")
    admin(caso)
    assert caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "reject", **cuerpo}, format="json").status_code == 400
    caso["version"].refresh_from_db()
    assert caso["version"].status == "IN_REVIEW"


def test_el_docente_no_devuelve_y_solo_se_devuelve_lo_que_esta_en_revision(caso):
    caso["cliente"].post(ruta(caso, "lifecycle"), {"action": "submit"}, format="json")
    cuerpo = {"action": "reject", "reason": "FORMA", "note": "x"}
    assert caso["cliente"].post(ruta(caso, "lifecycle"), cuerpo, format="json").status_code == 403
    admin(caso)
    caso["version"].status = "DRAFT"
    caso["version"].save()
    respuesta = caso["cliente"].post(ruta(caso, "lifecycle"), cuerpo, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "INVALID_TRANSITION"
