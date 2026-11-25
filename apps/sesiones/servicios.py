"""Casos de uso de la sesión. Lo que depende del estado lo decide el objeto de estado (``estados.py``)."""
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.grupos.assignments import format_window_value
from apps.grupos.models import Grupo
from apps.simulation.models import AttemptStatus, CaseVersion, CaseVersionStatus, SimulationAttempt
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError

from . import convocatorias
from .consultas import obtener
from .models import AutorizacionRepeticion, EstadoConvocatoria, EstadoSesion, Sesion
from .nombres import nombre_de

ACCIONES = ("iniciar", "pausar", "reanudar", "finalizar", "cancelar")
_AUDITORIA = {
    "iniciar": "SESION_INICIADA", "pausar": "SESION_PAUSADA", "reanudar": "SESION_REANUDADA",
    "finalizar": "SESION_FINALIZADA", "cancelar": "SESION_CANCELADA",
}
_MARCAS = {EstadoSesion.EN_CURSO: "iniciada_en", EstadoSesion.FINALIZADA: "finalizada_en", EstadoSesion.CANCELADA: "cancelada_en"}
_CAMPOS = {
    "inicio": "inicio", "fin": "fin",
    "tiempoMaximoMin": "tiempo_maximo_min", "lugar": "lugar", "mensaje": "mensaje",
}
_INTENTO = {AttemptStatus.IN_PROGRESS: "JUGANDO", AttemptStatus.PAUSED: "EN_PAUSA", AttemptStatus.COMPLETED: "TERMINADO"}


# ─── Biblioteca ──────────────────────────────────────────────────────────────────────────────────
def biblioteca():
    return (
        CaseVersion.objects.select_related("simulation_case__created_by")
        .filter(status=CaseVersionStatus.PUBLISHED, simulation_case__active=True,
                validated_at__isnull=False, definition_hash__isnull=False)
        .order_by("simulation_case__title", "-pk")
    )


def caso_dto(version):
    caso = version.simulation_case
    return {
        "caseVersionId": version.pk, "titulo": caso.title, "version": version.semantic_version,
        "autor": nombre_de(caso.created_by), "tiempoEstimadoMin": version.estimated_minutes, "descripcion": caso.description or "",
    }


# ─── DTO ─────────────────────────────────────────────────────────────────────────────────────────
def _iso(fecha):
    return format_window_value(fecha)


def dto(sesion):
    total = getattr(sesion, "total_convocados", None)
    if total is None:
        total = sesion.convocatorias.filter(estado=EstadoConvocatoria.ACTIVA).count()
    return {
        "id": sesion.pk, "estado": sesion.estado, "acciones": sesion.estado_actual().acciones(),
        "grupo": {"id": sesion.grupo_id, "nombre": sesion.grupo.nombre} if sesion.grupo_id else None,
        "caso": {"caseVersionId": sesion.case_version_id, "titulo": sesion.case_version.simulation_case.title},
        "inicio": _iso(sesion.inicio), "fin": _iso(sesion.fin),
        "tiempoMaximoMin": sesion.tiempo_maximo_min, "lugar": sesion.lugar, "mensaje": sesion.mensaje,
        "totalConvocados": total, "iniciadaEn": _iso(sesion.iniciada_en),
        "finalizadaEn": _iso(sesion.finalizada_en), "canceladaEn": _iso(sesion.cancelada_en),
    }


def detalle_dto(sesion):
    filas = list(sesion.convocatorias.select_related("estudiante").order_by("estudiante__apellido", "estudiante__nombre", "estudiante__email"))
    ultimo = {}
    if sesion.iniciada_en:
        intentos = SimulationAttempt.objects.filter(
            student_id__in=[c.estudiante_id for c in filas], case_version=sesion.case_version,
            is_rehearsal=False, started_at__gte=sesion.iniciada_en,
        ).order_by("started_at", "pk")
        for intento in intentos:
            ultimo[intento.student_id] = intento.status
    pendientes = set(AutorizacionRepeticion.objects.filter(convocatoria__sesion=sesion, usada=False)
                     .values_list("convocatoria__estudiante_id", flat=True))
    gestiona = sesion.estado_actual().puede_gestionar_convocados()
    convocados = []
    for convocatoria in filas:
        status = ultimo.get(convocatoria.estudiante_id)
        intento = "SIN_EMPEZAR" if status is None else _INTENTO.get(status, "INCOMPLETO")
        convocados.append({
            "estudianteId": convocatoria.estudiante_id, "nombre": nombre_de(convocatoria.estudiante),
            "email": convocatoria.estudiante.email, "estadoConvocatoria": convocatoria.estado, "intento": intento,
            "puedeRepetir": gestiona and convocatoria.estado == EstadoConvocatoria.ACTIVA
            and intento in ("TERMINADO", "INCOMPLETO") and convocatoria.estudiante_id not in pendientes,
        })
    return {**dto(sesion), "convocados": convocados}


# ─── Validaciones ────────────────────────────────────────────────────────────────────────────────
def _grupo_propio(usuario, grupo_id):
    grupo = Grupo.objects.filter(pk=grupo_id, profesor=usuario, activo=True).first()
    if grupo is None:
        raise Http404
    return grupo


def _version_de_biblioteca(version_id):
    if not CaseVersion.objects.filter(pk=version_id).exists():
        raise Http404
    version = biblioteca().filter(pk=version_id).first()
    if version is None:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("CASE_NOT_PUBLISHED", "La versión debe estar publicada y activa.", 400, field="caseVersionId")
    return version


def _validar_tiempo(version, minutos):
    if not version.estimated_minutes or minutos > version.estimated_minutes:
        raise ApiError("INVALID_TIME_LIMIT", "El tiempo máximo supera el tiempo estimado o este no está definido.", 400,
                       field="tiempoMaximoMin")


def _exigir_miembros(grupo):
    if not convocatorias.miembros_activos(grupo).exists():
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("GROUP_EMPTY", "El grupo no tiene estudiantes activos.", 400, field="grupoId")


# ─── Crear y editar ──────────────────────────────────────────────────────────────────────────────
@auditable("SESION_CREADA", "SESION", resource_id=lambda args, kwargs, result: result.pk)
@transaction.atomic
def crear(usuario, datos):
    grupo = _grupo_propio(usuario, datos["grupoId"])
    version = _version_de_biblioteca(datos["caseVersionId"])
    _validar_tiempo(version, datos["tiempoMaximoMin"])
    _exigir_miembros(grupo)
    sesion = Sesion.objects.create(
        case_version=version, grupo=grupo, creada_por=usuario,
        inicio=datos["inicio"], fin=datos["fin"], tiempo_maximo_min=datos["tiempoMaximoMin"],
        lugar=datos.get("lugar", ""), mensaje=datos.get("mensaje", ""),
    )
    convocatorias.convocar_grupo(sesion)
    return sesion


@auditable("SESION_EDITADA", "SESION", resource_id_param_index=1)
@transaction.atomic
def editar(usuario, pk, cambios):
    sesion = obtener(usuario, pk, lock=True)
    sesion.estado_actual().exigir_edicion()
    if "caseVersionId" in cambios:
        sesion.case_version = _version_de_biblioteca(cambios["caseVersionId"])
    for clave, campo in _CAMPOS.items():
        if clave in cambios:
            setattr(sesion, campo, cambios[clave])
    if sesion.fin <= sesion.inicio:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ValidationError({"fin": "Debe ser posterior al inicio."})
    _validar_tiempo(sesion.case_version, sesion.tiempo_maximo_min)
    cambia_grupo = "grupoId" in cambios and cambios["grupoId"] != sesion.grupo_id
    if cambia_grupo:
        sesion.grupo = _grupo_propio(usuario, cambios["grupoId"])
        _exigir_miembros(sesion.grupo)
    sesion.save()
    if cambia_grupo:
        convocatorias.rehacer(sesion)
    return sesion


# ─── Transiciones (patrón State) ─────────────────────────────────────────────────────────────────
def aplicar(sesion, destino):
    """Pone el estado destino, su marca de tiempo (la primera vez) y corre sus efectos. Quien llama tiene la fila
    bloqueada y una transacción abierta."""
    if destino.valor == sesion.estado:
        return sesion
    campos = ["estado"]
    marca = _MARCAS.get(destino.valor)
    if marca and getattr(sesion, marca) is None:
        setattr(sesion, marca, timezone.now())
        campos.append(marca)
    sesion.estado = destino.valor
    destino.al_entrar(sesion)
    sesion.save(update_fields=campos)
    return sesion


def _transicion(accion):
    @auditable(_AUDITORIA[accion], "SESION", resource_id_param_index=1)
    @transaction.atomic
    def ejecutar(usuario, pk):
        sesion = obtener(usuario, pk, lock=True)
        destino = getattr(sesion.estado_actual(), accion)(sesion)
        return aplicar(sesion, destino)

    ejecutar.__name__ = ejecutar.__qualname__ = accion
    return ejecutar


iniciar = _transicion("iniciar")
pausar = _transicion("pausar")
reanudar = _transicion("reanudar")
finalizar = _transicion("finalizar")
cancelar = _transicion("cancelar")
