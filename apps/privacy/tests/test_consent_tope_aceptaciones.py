"""S3-2a2 (2) · Tope de aceptaciones NUEVAS por persona y hora (``consent_user``: 30 por hora).

Cada aceptación nueva deja una fila en ``consent_records`` y dos en la auditoría, que es de solo añadir. Sin tope, un
estudiante que ciclara aceptar y retirar llenaría las dos tablas. Se cuenta en el servicio con el limitador compartido (la
ruta sigue sin ``throttle_classes``). El reenvío idempotente de una aceptación vigente no cuenta, y retirar nunca se limita.
"""
import pytest
from rest_framework.exceptions import Throttled

from apps.privacy import consent_service
from apps.privacy.models import ConsentRecord, ConsentType
from apps.security import limiter
from apps.security.limits import LIMITS

from .support import cliente, url_consentimiento

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]

TOPE = 30
#: Múltiplo de 3600: la ventana empieza justo en este instante, así que ``retryAfter`` vale exactamente 3600.
INSTANTE = 1_800_000_000.0


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador_encendido(settings, reloj):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


def _aceptar(persona, version_id, aviso):
    return cliente(persona).post(url_consentimiento(version_id), {"noticeVersion": aviso}, format="json")


def _retirar(persona, version_id):
    return cliente(persona).delete(url_consentimiento(version_id))


def _ciclo(persona, version_id, aviso):
    """Una aceptación nueva (201) y su retiro (200)."""
    assert _aceptar(persona, version_id, aviso).status_code == 201
    assert _retirar(persona, version_id).status_code == 200


def test_el_tope_es_de_30_aceptaciones_nuevas_por_hora():
    assert LIMITS["consent_user"] == (TOPE, 3600)


def test_treinta_ciclos_pasan_y_la_treintaiunava_aceptacion_responde_429(settings, limitador_encendido, estudiante_a, version_publicada):
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    for _ in range(TOPE):
        _ciclo(estudiante_a, version_publicada.id, aviso)

    respuesta = _aceptar(estudiante_a, version_publicada.id, aviso)

    assert respuesta.status_code == 429
    assert (respuesta.data["success"], respuesta.data["code"]) == (False, "THROTTLED")
    assert respuesta.data["retryAfter"] == 3600 and respuesta["Retry-After"] == "3600"
    assert ConsentRecord.objects.filter(person=estudiante_a).count() == TOPE  # la rechazada no deja fila


def test_el_reenvio_de_una_aceptacion_vigente_no_cuenta(settings, limitador_encendido, estudiante_a, version_publicada):
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    assert _aceptar(estudiante_a, version_publicada.id, aviso).status_code == 201

    reenvios = [_aceptar(estudiante_a, version_publicada.id, aviso).status_code for _ in range(TOPE + 10)]

    assert reenvios == [200] * (TOPE + 10)
    assert limiter.peek("consent_user", limiter.key_hash(estudiante_a.pk)) == 1
    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 1


def test_retirar_responde_200_aunque_el_tope_este_agotado(settings, limitador_encendido, estudiante_a, version_publicada):
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    for _ in range(TOPE - 1):
        _ciclo(estudiante_a, version_publicada.id, aviso)
    assert _aceptar(estudiante_a, version_publicada.id, aviso).status_code == 201  # la trigésima: el tope queda agotado

    retiro = _retirar(estudiante_a, version_publicada.id)
    retiro_otra_vez = _retirar(estudiante_a, version_publicada.id)

    assert retiro.status_code == 200 and retiro.data["data"]["withdrawnAt"] is not None
    assert retiro_otra_vez.status_code == 200 and retiro_otra_vez.data["data"]["withdrawnAt"] is None
    assert _aceptar(estudiante_a, version_publicada.id, aviso).status_code == 429  # agotado: aceptar otra vez no pasa


def test_el_tope_es_por_persona(settings, limitador_encendido, estudiante_a, estudiante_b, version_publicada):
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    for _ in range(TOPE):
        _ciclo(estudiante_a, version_publicada.id, aviso)
    assert _aceptar(estudiante_a, version_publicada.id, aviso).status_code == 429

    assert _aceptar(estudiante_b, version_publicada.id, aviso).status_code == 201


def test_la_ventana_es_de_una_hora(settings, limitador_encendido, reloj, estudiante_a, version_publicada):
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    for _ in range(TOPE):
        _ciclo(estudiante_a, version_publicada.id, aviso)
    assert _aceptar(estudiante_a, version_publicada.id, aviso).status_code == 429

    reloj["t"] += LIMITS["consent_user"].window

    assert _aceptar(estudiante_a, version_publicada.id, aviso).status_code == 201


def test_el_tratamiento_de_datos_cuenta_en_el_mismo_tope(settings, limitador_encendido, estudiante_a, version_publicada):
    settings.SIEP_DATA_TREATMENT_NOTICE_VERSION = "datos-1"
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    for _ in range(TOPE):
        _ciclo(estudiante_a, version_publicada.id, aviso)

    with pytest.raises(Throttled):
        consent_service.accept_data_treatment(estudiante_a, "datos-1")

    assert not ConsentRecord.objects.filter(consent_type=ConsentType.DATA_TREATMENT).exists()


def test_con_el_limitador_apagado_el_tope_no_se_aplica(settings, estudiante_a, version_publicada):
    settings.SIEP_THROTTLE_ENABLED = False
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    for _ in range(TOPE + 5):
        _ciclo(estudiante_a, version_publicada.id, aviso)
