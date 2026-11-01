"""E1-0b · Todo error del envoltorio trae ``code`` estable (§2.7 del plan estructural).

El cliente no depende de los textos: decide por ``code``. Los campos propios de un
error de dominio (``existingAttemptId``…) viajan en la raíz, junto a ``message``.
"""
import json
import logging
import secrets
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import Throttled
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate
from rest_framework.views import APIView

from shared import exceptions as shared_exceptions
from shared.exceptions import ApiError, Conflict, custom_exception_handler
from shared.jsonlog import JsonFormatter, RequestIdFilter

pytestmark = pytest.mark.req("RNF-06")

User = get_user_model()


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="codigo_error@x.com", password=secrets.token_urlsafe(24), nombre="Cod", apellido="Err", role="ESTUDIANTE"
    )


def _logged(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _call(view_class, method="get"):
    request = getattr(APIRequestFactory(), method)("/prueba")
    return view_class.as_view()(request)


def test_api_error_lleva_code_y_los_campos_extra_en_la_raiz():
    class Boom(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise ApiError(
                "ATTEMPT_ALREADY_OPEN", "Ya tienes un intento abierto", 409, existingAttemptId="abc-123"
            )

    response = _call(Boom)

    assert response.status_code == 409
    assert response.data == {
        "success": False,
        "code": "ATTEMPT_ALREADY_OPEN",
        "message": "Ya tienes un intento abierto",
        "existingAttemptId": "abc-123",
    }


def test_api_error_sin_estado_explicito_es_400():
    class Boom(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise ApiError("REQUEST_ID_INVALID", "requestId inválido")

    assert _call(Boom).status_code == 400


def test_conflict_existente_trae_code_conflict():
    class Boom(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Conflict("Este caso fue modificado en otra sesión.")

    response = _call(Boom)

    assert response.status_code == 409
    assert response.data["code"] == "CONFLICT"
    assert response.data["message"] == "Este caso fue modificado en otra sesión."


def test_no_encontrado_trae_not_found(estudiante):
    response = _logged(estudiante).get(
        f"/api/simulation/attempts/{uuid.uuid4()}", HTTP_X_SIEP_ATTEMPT_TOKEN="token-que-no-existe"
    )

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"
    assert response.data["success"] is False


def test_sin_autenticar_trae_unauthenticated():
    response = APIClient().get("/api/simulation/cases")

    assert response.status_code == 401
    assert response.data["code"] == "UNAUTHENTICATED"


def test_rol_incorrecto_trae_forbidden(estudiante):
    response = _logged(estudiante).get("/api/instructor/attempts/recent")

    assert response.status_code == 403
    assert response.data["code"] == "FORBIDDEN"


def test_cuerpo_invalido_trae_validation_error(estudiante):
    response = _logged(estudiante).post("/api/simulation/attempts", {}, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "caseVersionId" in response.data["message"]


def test_error_no_controlado_trae_internal_error():
    response = custom_exception_handler(RuntimeError("boom"), {})

    assert response.status_code == 500
    assert response.data == {
        "success": False,
        "code": "INTERNAL_ERROR",
        "message": "Error interno del servidor",
    }


@pytest.mark.req("DJA-2")
@pytest.mark.security
def test_limite_de_peticiones_trae_throttled_con_la_espera_en_el_cuerpo_y_en_la_cabecera():
    class Limitado(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Throttled(wait=42)

    response = _call(Limitado)

    assert response.status_code == 429
    assert response.data == {
        "success": False,
        "code": "THROTTLED",
        "message": "Demasiados intentos. Espera 42 s e inténtalo de nuevo.",
        "retryAfter": 42,
    }
    assert response["Retry-After"] == "42"


@pytest.mark.req("DJA-2")
@pytest.mark.security
def test_limite_sin_espera_conocida_pide_un_segundo():
    class Limitado(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Throttled()

    response = _call(Limitado)

    assert response.status_code == 429
    assert response.data["retryAfter"] == 1
    assert response["Retry-After"] == "1"


@pytest.mark.req("DJA-2")
@pytest.mark.security
@pytest.mark.parametrize(
    ("segundos", "legible"),
    [
        (1, "1 s"),
        (119, "119 s"),
        (120, "2 min"),
        (121, "3 min"),
        (7199, "120 min"),
        (7200, "2 h"),
        (7201, "3 h"),
        (57600, "16 h"),
    ],
)
def test_la_espera_se_dice_en_segundos_minutos_u_horas_hacia_arriba(segundos, legible):
    assert shared_exceptions._espera_legible(segundos) == legible


@pytest.mark.req("DJA-2")
@pytest.mark.security
def test_una_espera_larga_se_dice_en_horas_y_la_cabecera_sigue_en_segundos():
    class Limitado(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Throttled(wait=57600)

    response = _call(Limitado)

    assert response.status_code == 429
    assert response.data == {
        "success": False,
        "code": "THROTTLED",
        "message": "Demasiados intentos. Espera 16 h e inténtalo de nuevo.",
        "retryAfter": 57600,
    }
    assert response["Retry-After"] == "57600"


# ── S4-3 · una excepción no controlada deja UNA línea ERROR con su causa ─────────────────────────────


class VistaRota(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        raise RuntimeError("fallo sin control")


@pytest.fixture
def lineas_de_siep_error():
    """Las líneas que escribe ``siep.error``, con el formateador JSON de verdad (``shared.jsonlog``)."""
    lineas = []

    class Manejador(logging.Handler):
        def emit(self, record):
            lineas.append(self.format(record))

    manejador = Manejador()
    manejador.setFormatter(JsonFormatter())
    manejador.addFilter(RequestIdFilter())
    registrador = logging.getLogger("siep.error")
    registrador.addHandler(manejador)
    try:
        yield lineas
    finally:
        registrador.removeHandler(manejador)


def _peticion_que_falla(usuario):
    peticion = APIRequestFactory().get("/prueba/roto")
    force_authenticate(peticion, user=usuario)
    return VistaRota.as_view()(peticion)


def _afirmar_una_linea_con_la_causa(lineas, usuario):
    registros = [json.loads(linea) for linea in lineas]
    errores = [r for r in registros if r["level"] == "ERROR" and r["logger"] == "siep.error"]
    assert len(errores) == 1
    causa = errores[0]
    assert causa["message"] == "unhandled_exception"
    assert "RuntimeError: fallo sin control" in causa["exc"]
    assert causa["path"] == "/prueba/roto"
    assert causa["method"] == "GET"
    assert causa["view"] == "VistaRota"
    assert causa["actor_id"] == usuario.pk
    assert "request_id" in causa


def test_error_no_controlado_deja_una_sola_linea_error_con_la_causa(estudiante, lineas_de_siep_error):
    respuesta = _peticion_que_falla(estudiante)

    assert respuesta.status_code == 500
    assert respuesta.data == {"success": False, "code": "INTERNAL_ERROR", "message": "Error interno del servidor"}
    _afirmar_una_linea_con_la_causa(lineas_de_siep_error, estudiante)


def test_control_negativo_sin_la_linea_error_la_causa_no_queda(estudiante, lineas_de_siep_error, monkeypatch):
    monkeypatch.setattr(shared_exceptions, "_registrar_no_controlada", lambda exc, context: None)
    _peticion_que_falla(estudiante)

    with pytest.raises(AssertionError):
        _afirmar_una_linea_con_la_causa(lineas_de_siep_error, estudiante)
