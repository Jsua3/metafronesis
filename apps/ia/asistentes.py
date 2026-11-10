import re

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from apps.autoria.guardas import versiones_visibles
from apps.simulation.models import AttemptStatus, AuthoringAssistantUsage, SimulationAttempt
from apps.simulation.services.audit_service import auditable
from apps.users.models import CustomUser
from shared.exceptions import ApiError
from .proveedores import proveedor_para


def _version(usuario, version_id):
    version = versiones_visibles(usuario).filter(pk=version_id).first()
    if version is None:
        raise Http404
    return version


#: Correos y secuencias largas de dígitos (teléfonos, documentos) no salen hacia el proveedor (Ley 1581).
_CORREO = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_NUMERO_LARGO = re.compile(r"\d(?:[\s.-]?\d){6,}")
INSTRUCCIONES = "Responde usando únicamente el contexto proporcionado."


def sin_datos_personales(texto: str) -> str:
    return _NUMERO_LARGO.sub("[número]", _CORREO.sub("[correo]", texto))


def _responder(nombre, clave, modelo, texto, pregunta):
    proveedor = proveedor_para(nombre, clave, modelo)
    contenido = sin_datos_personales(f"{texto}\n{pregunta}")
    return proveedor.responder(INSTRUCCIONES, [{"role": "user", "content": contenido}])


def _texto(version):
    caso = version.simulation_case
    return "\n".join(filter(None, [caso.title, caso.description, version.narrative_context]))


@auditable("AI_ASSISTANT_QUERY", "attempt", resource_id_param_index=1)
def consultar(usuario, intento_id, pregunta):
    intento = SimulationAttempt.objects.select_related("case_version__simulation_case", "current_node").filter(
        pk=intento_id, student=usuario
    ).first()
    if intento is None:
        raise Http404
    if intento.status != AttemptStatus.IN_PROGRESS:
        raise ApiError("ATTEMPT_NOT_IN_PROGRESS", "El intento no está en curso.", 409)
    texto = "\n".join(filter(None, [_texto(intento.case_version), intento.current_node.narrative]))
    return _responder(settings.AI_ASSISTANT_PROVIDER, settings.AI_ASSISTANT_API_KEY, settings.AI_ASSISTANT_MODEL, texto, pregunta)


def estado(usuario, version_id):
    _version(usuario, version_id)
    return {"enabled": settings.AI_AUTHORING_ENABLED}


@auditable("AI_AUTHORING_PROPOSE", "case_version", resource_id_param_index=1)
@transaction.atomic
def proponer(usuario, version_id, pregunta):
    version = _version(usuario, version_id)
    CustomUser.objects.select_for_update().get(pk=usuario.pk)
    uso, _ = AuthoringAssistantUsage.objects.get_or_create(user=usuario, day=timezone.localtime().date() if settings.USE_TZ else timezone.now().date())
    if uso.count >= settings.AI_AUTHORING_DAILY_LIMIT_PER_USER:
        raise ApiError("DAILY_LIMIT_EXCEEDED", "Se alcanzó el límite diario.", 429)
    respuesta = _responder(settings.AI_AUTHORING_PROVIDER, settings.AI_AUTHORING_API_KEY, settings.AI_AUTHORING_MODEL, _texto(version), pregunta)
    uso.count += 1
    uso.save(update_fields=["count"])
    return respuesta


@auditable("AI_AUTHORING_GUIDE", "case_version", resource_id_param_index=1)
def guiar(usuario, version_id, pregunta):
    version = _version(usuario, version_id)
    return _responder(settings.AI_AUTHORING_PROVIDER, settings.AI_AUTHORING_API_KEY, settings.AI_AUTHORING_MODEL, _texto(version), pregunta)
