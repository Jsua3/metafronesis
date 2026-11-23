from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections
from rest_framework.test import APIClient

from apps.revision.tests.test_revision import datos
from apps.simulation.models import AttemptEvent, AuditLog

pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.req("SIEP-32", "SIEP-43")]


def ruta(intento):
    return f"/api/instructor/attempts/{intento.pk}/replace"


@pytest.mark.parametrize("estado", ["IN_PROGRESS", "PAUSED"])
def test_docente_reemplaza_intento_abierto_y_registra_evidencia(datos, estado):
    intento = datos["intento"]
    intento.status = estado
    intento.save(update_fields=["status"])
    respuesta = datos["cliente"].post(ruta(intento), {"reason": "  Solicitud del estudiante  "}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data == {"success": True, "data": {"attemptId": str(intento.pk), "status": "REPLACED", "reason": "Solicitud del estudiante", "replacedAt": respuesta.data["data"]["replacedAt"]}}
    assert respuesta.data["data"]["replacedAt"]
    intento.refresh_from_db()
    assert intento.replaced_by_id == datos["docente"].pk
    assert intento.replace_reason == "Solicitud del estudiante"
    assert intento.ended_at == intento.locked_at
    evento = AttemptEvent.objects.get(attempt=intento, event_type="ATTEMPT_REPLACED")
    assert evento.detail == intento.replace_reason and evento.node_id == intento.current_node_id
    assert AuditLog.objects.filter(action="ATTEMPT_REPLACED", resource_id=str(intento.pk)).count() == 1


def test_alcance_roles_y_motivo_obligatorio(datos):
    cliente = datos["cliente"]
    intento = datos["intento"]
    assert cliente.post(ruta(datos["intento_ajeno"]), {"reason": "Motivo"}, format="json").status_code == 404
    for motivo in ("", "   ", "a" * 501):
        respuesta = cliente.post(ruta(intento), {"reason": motivo}, format="json")
        assert respuesta.status_code == 400 and respuesta.data["success"] is False
    assert cliente.post(ruta(intento), {}, format="json").status_code == 400
    cliente.force_authenticate(datos["alumno"])
    assert cliente.post(ruta(intento), {"reason": "Motivo"}, format="json").status_code == 403
    cliente.force_authenticate(datos["admin"])
    assert cliente.post(ruta(datos["intento_ajeno"]), {"reason": "Motivo"}, format="json").status_code == 200


@pytest.mark.parametrize("estado", ["COMPLETED", "INCOMPLETE", "SAFE_EXITED", "REPLACED"])
def test_intento_cerrado_no_se_reemplaza(datos, estado):
    intento = datos["intento"]
    intento.status = estado
    intento.save(update_fields=["status"])
    respuesta = datos["cliente"].post(ruta(intento), {"reason": "Motivo"}, format="json")
    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "ATTEMPT_NOT_OPEN"
    assert not AttemptEvent.objects.filter(attempt=intento, event_type="ATTEMPT_REPLACED").exists()


def test_reemplazos_concurrentes_solo_cierran_una_vez(datos):
    barrera = Barrier(2)
    intento = datos["intento"]
    docente = datos["docente"]

    def solicitar():
        close_old_connections()
        cliente = APIClient()
        cliente.force_authenticate(docente)
        barrera.wait(timeout=10)
        respuesta = cliente.post(ruta(intento), {"reason": "Solicitud"}, format="json")
        close_old_connections()
        return respuesta.status_code

    with ThreadPoolExecutor(max_workers=2) as ejecutor:
        estados = list(ejecutor.map(lambda indice: solicitar(), range(2)))
    assert sorted(estados) == [200, 409]
    assert AttemptEvent.objects.filter(attempt=intento, event_type="ATTEMPT_REPLACED").count() == 1
    assert AuditLog.objects.filter(action="ATTEMPT_REPLACED", resource_id=str(intento.pk)).count() == 1


def test_contrato_openapi_del_reemplazo(datos):
    from drf_spectacular.generators import SchemaGenerator
    from shared.contract_testing import assert_matches, response_schema

    documento = SchemaGenerator().get_schema(public=True)
    camino = "/api/instructor/attempts/{attempt_id}/replace"
    operacion = documento["paths"][camino]["post"]
    assert set(operacion["responses"]) >= {"200", "400", "401", "403", "404", "409"}
    respuesta = datos["cliente"].post(ruta(datos["intento"]), {"reason": "Solicitud"}, format="json")
    assert_matches(respuesta.data, response_schema(documento, camino, "POST"), documento)
