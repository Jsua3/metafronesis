import pytest
from django.core.exceptions import ImproperlyConfigured
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, SimulationAttempt, SimulationCase, SimulationNode
from apps.users.models import CustomUser
from shared.policies import PROFESOR


@pytest.fixture
def contexto(db):
    docente = CustomUser.objects.create_user(email="docente@example.test", password="clave", role=PROFESOR)
    estudiante = CustomUser.objects.create_user(email="alumna@example.test", password="clave", nombre="Alumna")
    caso = SimulationCase.objects.create(code="S4", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", created_by=docente)
    escena = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Contexto", start_node=True)
    intento = SimulationAttempt.objects.create(case_version=version, student=estudiante, current_node=escena, attempt_token_hash="hash-s4")
    cliente = APIClient()
    cliente.force_authenticate(estudiante)
    return docente, estudiante, version, intento, cliente


@pytest.mark.req("SIEP-52")
def test_apagado_404(contexto):
    *_, intento, cliente = contexto
    respuesta = cliente.post("/api/simulation/ai-assistant", {"attemptId": str(intento.pk), "question": "Ayuda"}, format="json")
    assert respuesta.status_code == 404


@pytest.mark.req("SIEP-52")
def test_con_proveedor_falso_responde(contexto, settings):
    settings.AI_ASSISTANT_ENABLED = True
    settings.AI_ASSISTANT_PROVIDER = "falso"
    *_, intento, cliente = contexto
    respuesta = cliente.post("/api/simulation/ai-assistant", {"attemptId": str(intento.pk), "question": "Ayuda"}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["answer"]


@pytest.mark.req("SIEP-52")
def test_registro_rechaza_desconocido():
    from apps.ia.proveedores import proveedor_para
    with pytest.raises(ImproperlyConfigured):
        proveedor_para("desconocido")


@pytest.mark.req("SIEP-52")
def test_tope_diario_429(contexto, settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    settings.AI_AUTHORING_DAILY_LIMIT_PER_USER = 1
    docente, _, version, _, cliente = contexto
    cliente.force_authenticate(docente)
    ruta = f"/api/authoring/cases/{version.pk}/assistant/propose"
    assert cliente.post(ruta, {"question": "Ayuda"}, format="json").status_code == 200
    assert cliente.post(ruta, {"question": "Ayuda"}, format="json").status_code == 429


@pytest.mark.req("SIEP-52")
def test_no_envia_correo_ni_nombre(contexto, settings, monkeypatch):
    from apps.ia.proveedores import ProveedorFalso
    settings.AI_ASSISTANT_ENABLED = True
    settings.AI_ASSISTANT_PROVIDER = "falso"
    recibido = []
    monkeypatch.setattr(ProveedorFalso, "responder", lambda self, instrucciones, mensajes: recibido.append((instrucciones, mensajes)) or "Respuesta")
    *_, intento, cliente = contexto
    respuesta = cliente.post("/api/simulation/ai-assistant", {"attemptId": str(intento.pk), "question": "Ayuda"}, format="json")
    assert respuesta.status_code == 200
    assert "alumna@example.test" not in str(recibido)
    assert "Alumna" not in str(recibido)


@pytest.mark.req("SIEP-52")
def test_acceso_y_estado_del_intento(contexto, settings):
    settings.AI_ASSISTANT_ENABLED = True
    settings.AI_ASSISTANT_PROVIDER = "falso"
    _, _, _, intento, cliente = contexto
    intento.status = "COMPLETED"
    intento.save(update_fields=["status"])
    respuesta = cliente.post("/api/simulation/ai-assistant", {"attemptId": str(intento.pk), "question": "Ayuda"}, format="json")
    assert respuesta.status_code == 409


@pytest.mark.req("SIEP-52")
def test_autoria_no_accede_a_caso_ajeno(contexto, settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    _, _, version, _, cliente = contexto
    otro = CustomUser.objects.create_user(email="otro@example.test", password="clave", role=PROFESOR)
    cliente.force_authenticate(otro)
    ruta = f"/api/authoring/cases/{version.pk}/assistant"
    assert cliente.get(ruta + "/status").status_code == 404
    assert cliente.post(ruta + "/guide", {"question": "Ayuda"}, format="json").status_code == 404


@pytest.mark.req("SIEP-52")
def test_estado_y_guia(contexto, settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    docente, _, version, _, cliente = contexto
    cliente.force_authenticate(docente)
    ruta = f"/api/authoring/cases/{version.pk}/assistant"
    assert cliente.get(ruta + "/status").status_code == 200
    assert cliente.post(ruta + "/guide", {"question": "Ayuda"}, format="json").status_code == 200
