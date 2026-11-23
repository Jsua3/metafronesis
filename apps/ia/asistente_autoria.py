"""El asistente de autoría del editor de casos: estado, propuestas de cambios validadas y guía.

``estado`` dice si está listo y cuánto cupo le queda a quien lo usa. ``proponer`` y ``guiar`` siguen la misma plantilla
(``_ejecutar``): propiedad del caso (404) y apagado (404), versión en borrador (409), cupo RESERVADO antes de llamar al
proveedor y devuelto si este falla (502), llamada, y una fila de auditoría con pantalla, modelo, recuento de cambios,
duración y resultado: nunca el texto de la petición ni el de la respuesta. Al cliente solo le llegan mensajes fijos: ni
la clave ni el texto del proveedor salen del servidor.

Proponer NO escribe nada en el caso: el cliente aplica los cambios ya validados.
"""
import logging
import time

from apps.autoria import editor as editor_de_autoria
from apps.simulation.models import CaseVersionStatus
from apps.simulation.services.audit_service import _VALOR_SEGURO, record
from shared.exceptions import ApiError

from .asistente import config as config_del_asistente
from .asistente import guia, limites, propuestas
from .asistente.errores import ErrorDeProveedor

logger = logging.getLogger(__name__)

MENSAJE_NO_DISPONIBLE = "El asistente no está disponible"
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MENSAJE_PROVEEDOR = "La IA no respondió. Inténtalo de nuevo en un momento."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MENSAJE_RECHAZO = "La IA no puede ayudar con esa petición. Prueba a pedirla de otra forma."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MENSAJE_PROPUESTA_INVALIDA = "La propuesta no se pudo usar. Pídela de nuevo con otras palabras."


def _version(usuario, version_id):
    """La versión si es de ``usuario`` (o es admin); 404 si no existe o es ajena, 403 si no puede autorar."""
    return editor_de_autoria.version_visible(usuario, version_id)


def estado(usuario, version_id):
    """Si el asistente está listo (``connected``) o no (``disabled``) y lo que le queda hoy a ``usuario``."""
    _version(usuario, version_id)
    config = config_del_asistente.actual()
    listo = config.conectado
    return {
        "enabled": listo,
        "mode": "connected" if listo else "disabled",
        "remainingToday": limites.restante_hoy(usuario, config),
    }


def _auditar_propuesta(usuario, version_id, contexto):
    record("AI_AUTHORING_PROPOSE", "CASE_VERSION", version_id, contexto, actor=usuario)


def _auditar_guia(usuario, version_id, contexto):
    record("AI_AUTHORING_GUIDE", "CASE_VERSION", version_id, contexto, actor=usuario)


def _ejecutar(usuario, version_id, *, pantalla, modelo_por_defecto, llamar, auditar):
    """La plantilla de ``proponer`` y ``guiar``: compuerta, cupo, llamada y auditoría."""
    version = _version(usuario, version_id)
    config = config_del_asistente.actual()
    if not config.enabled:
        # Mismo texto que el asistente del estudiante.
        raise ApiError("NOT_FOUND", MENSAJE_NO_DISPONIBLE, 404)
    if version.status != CaseVersionStatus.DRAFT:
        raise ApiError("VERSION_NOT_EDITABLE", "La versión no es editable.", 409)
    limites.consumir(usuario)  # 429 sin fila de auditoría

    inicio = time.monotonic()
    modelo, cambios = modelo_por_defecto(config), 0

    def auditar_con(resultado):
        contexto = {"model": modelo, "changes": cambios, "duration_ms": int((time.monotonic() - inicio) * 1000),
                    "outcome": resultado}
        if pantalla:
            contexto["screen"] = pantalla
        auditar(usuario, version_id, contexto)

    try:
        resultado = llamar(config, version)
    except ErrorDeProveedor as error:
        logger.warning("Asistente de autoría: fallo del proveedor (kind=%s)", error.tipo)
        if error.tipo == "refusal":
            auditar_con("refusal")
            raise ApiError("AI_REFUSED", MENSAJE_RECHAZO, 422) from None
        limites.devolver(usuario)
        auditar_con("error")
        raise ApiError("AI_PROVIDER_ERROR", MENSAJE_PROVEEDOR, 502) from None
    except propuestas.PropuestaInvalida as invalida:
        # La llamada ocurrió: el cupo se gasta. Al cliente solo le llega el motivo fijo, nunca texto del modelo.
        auditar_con("invalid")
        raise ApiError("AI_PROPOSAL_INVALID", MENSAJE_PROPUESTA_INVALIDA, 422, motivo=invalida.motivo) from None
    except Exception:
        limites.devolver(usuario)
        raise
    if isinstance(resultado.get("model"), str) and _VALOR_SEGURO.fullmatch(resultado["model"]):
        modelo = resultado["model"]
    if isinstance(resultado.get("changes"), int) and not isinstance(resultado["changes"], bool):
        cambios = resultado["changes"]
    auditar_con("ok")
    return resultado


def proponer(usuario, version_id, datos):
    """``{mensaje, cambios, modo, model, changes}``: cambios validados contra el caso, sin escribir nada."""
    return _ejecutar(
        usuario, version_id, pantalla=datos["pantalla"], modelo_por_defecto=lambda config: config.model_capable,
        llamar=lambda config, version: propuestas.proponer(
            config=config, version=version, peticion=datos["peticion"], pantalla=datos["pantalla"],
            seleccion=datos.get("seleccion"),
        ),
        auditar=_auditar_propuesta,
    )


def guiar(usuario, version_id, datos):
    """``{accionId, modo, mensaje, model, changes}``: la acción del catálogo que responde la pregunta."""
    return _ejecutar(
        usuario, version_id, pantalla="", modelo_por_defecto=lambda config: config.model_fast,
        llamar=lambda config, version: guia.responder(config=config, pregunta=datos["pregunta"], acciones=datos["acciones"]),
        auditar=_auditar_guia,
    )
