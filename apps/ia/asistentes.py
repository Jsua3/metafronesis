from django.conf import settings
from django.http import Http404

from apps.simulation.models import AttemptStatus, SimulationAttempt
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from .privacidad import sin_datos_personales
from .proveedores import proveedor_para


INSTRUCCIONES = "Responde usando únicamente el contexto proporcionado."


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


