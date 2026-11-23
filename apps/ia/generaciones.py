"""Generación de casos con IA por etapas: límites por docente, cerrojos, reparación y auditoría.

Cada función pública recibe ``actor``, exige permiso de autoría y comprueba la propiedad (404 si la generación no es suya,
también para ADMIN). Con la bandera ``AI_AUTHORING_GENERATIONS_ENABLED`` apagada, todo es un 404 salvo el estado.

Las etapas que llaman al proveedor (esqueleto y escena) siguen la misma plantilla (``_etapa``):

1. **Reserva corta** (``transaction.atomic`` + ``select_for_update`` de la fila): propiedad, transición, etapa en curso y tope
   de llamadas; marca la etapa en curso con una marca de tiempo y suma 1 a ``calls``. Se confirma.
2. **Llamada al proveedor sin transacción abierta**, con su estrategia (``proveedores.proveedor_para``).
3. **Validación** con ``comprobaciones``: lo que no cumple cuenta como ``malformed``.
4. **Guardado corto** con cerrojo: resultado o error y estado. Si la generación se canceló mientras tanto, o la marca de la
   etapa ya no es la nuestra, el resultado se descarta.
5. **Auditoría** fuera de la transacción, sin texto de la docente ni del modelo.

``ensamblar`` no llama a la red: toma la fila con ``nowait`` y la conserva durante todo el ensamblado, así dos ensamblados a
la vez no crean dos borradores y el segundo recibe ``GENERATION_BUSY``.
"""
import json
import logging
import re
import socket
import time
from datetime import datetime, timedelta, timezone as zona_utc
from urllib.error import URLError

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as ErrorDeValidacion
from django.db import IntegrityError, OperationalError, connection, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.biblioteca.services import lugares
from apps.simulation.models import CaseGeneration, GenerationStatus
from apps.simulation.services.audit_service import record
from apps.users.permisos import exigir_autoria
from shared.exceptions import ApiError
from shared.plain_text import plain_text_problem

from .generacion import ciclo, comprobaciones, contexto as contexto_del_lugar, ensamblado, prompts
from .generacion.comprobaciones import GeneracionInvalida
from .proveedores import REGISTRO, proveedor_para

logger = logging.getLogger(__name__)

MINIMO_DESCRIPCION = 40
MAXIMO_DESCRIPCION = prompts.MAXIMO_DESCRIPCION
CERROJO_GLOBAL = 7302611
ESTADO_BLOQUEO_NO_DISPONIBLE = "55P03"
CLAVE_ESQUELETO_RECHAZADO = "__esqueleto__"

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología.
MENSAJES = {
    "timeout": "La IA tardó demasiado en responder. Vuelve a intentarlo.",
    "http": "No pudimos hablar con la IA. Vuelve a intentarlo en un momento.",
    "malformed": "La IA respondió algo que no pudimos usar. Vuelve a intentarlo.",
}
MENSAJE_DESHABILITADA = "La generación con IA no está disponible."
MENSAJE_EN_CURSO = "Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro."
MENSAJE_OCUPADA = "Esta parte ya se está escribiendo. Espera un momento."
MENSAJE_ESTADO = "Ese paso no corresponde ahora. Vuelve a cargar el avance."
MENSAJE_SIN_LLAMADAS = "Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo."
MENSAJE_LIMITE_DIARIO = "Llegaste al límite de casos generados por hoy."
MENSAJE_LIMITE_GLOBAL = "La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana."
MENSAJE_SIN_LUGAR = "Elige el lugar donde pasa el caso."
MENSAJE_CORTA = "Cuéntanos un poco más: al menos 40 caracteres."
MENSAJE_LARGA = "La descripción puede tener hasta 2000 caracteres."
MENSAJE_NO_PLANA = "La descripción debe ser texto plano, sin etiquetas, enlaces ni caracteres especiales."
MENSAJE_NO_EXISTE = "La generación no existe."
MENSAJE_REPARACION = "El parámetro repair solo admite 1."


# ─── errores ──────────────────────────────────────────────────────────────────────────────────────


def _validacion(campo: str, mensaje: str) -> ApiError:
    return ApiError("VALIDATION_ERROR", mensaje, 400, field=campo)


def _ocupada() -> ApiError:
    return ApiError("GENERATION_BUSY", MENSAJE_OCUPADA, 409)


def _estado_invalido() -> ApiError:
    return ApiError("GENERATION_STATE", MENSAJE_ESTADO, 409)


def _limite_diario(mensaje: str) -> ApiError:
    return ApiError("AI_LIMIT_EXCEEDED", mensaje, 429, scope="daily")


def _falla_del_proveedor(tipo: str) -> ApiError:
    return ApiError("AI_PROVIDER_ERROR", MENSAJES[tipo], 502, kind=tipo)


def disponible() -> bool:
    """Encendida y con un proveedor conocido: sin una de las dos cosas, la generación no existe."""
    return bool(settings.AI_AUTHORING_GENERATIONS_ENABLED) and settings.AI_AUTHORING_GENERATIONS_PROVIDER in REGISTRO


def exigir_disponible() -> None:
    if not disponible():
        raise ApiError("NOT_FOUND", MENSAJE_DESHABILITADA, 404)


# ─── lectura y vista ──────────────────────────────────────────────────────────────────────────────


def cargar_json(texto, defecto):
    try:
        valor = json.loads(texto) if texto else defecto
    except (TypeError, ValueError):
        return defecto
    return valor if isinstance(valor, type(defecto)) else defecto


def fecha(valor: datetime | None) -> str | None:
    """``valor`` en UTC con ``Z``. Con ``USE_TZ=False`` los ``datetime`` de la base son ingenuos y de ``TIME_ZONE``."""
    if valor is None:
        return None
    if timezone.is_naive(valor):
        valor = timezone.make_aware(valor, timezone.get_default_timezone())
    return valor.astimezone(zona_utc.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _leer_fecha(valor) -> datetime | None:
    try:
        return datetime.fromisoformat(valor) if valor else None
    except (TypeError, ValueError):
        return None


def _estado_de_escena(entrada: dict, ahora: datetime, tiempo_agotado: dict) -> dict:
    if entrada.get("state") == "running" and ciclo.vencida(_leer_fecha(entrada.get("started_at")), ahora):
        return {"state": "error", "error": dict(tiempo_agotado)}
    return {"state": entrada.get("state", "pending"), "error": entrada.get("error")}


def vista(generacion: CaseGeneration) -> dict:
    """La ``Generation`` del contrato. Sin ``document_json`` y sin texto del modelo salvo los títulos del esqueleto."""
    ahora = timezone.now()
    esqueleto = cargar_json(generacion.skeleton_json, {})
    escenas = cargar_json(generacion.scenes_json, {})
    esquema = esqueleto.get("escenas", [])
    reparacion = cargar_json(generacion.repair_json, {})
    ultimo_error = cargar_json(generacion.last_error_json, {})
    tiempo_agotado = {"kind": "timeout", "message": MENSAJES["timeout"]}
    if not ultimo_error and ciclo.vencida(generacion.skeleton_started_at, ahora):
        ultimo_error = {"stage": "skeleton", "clave": None, **tiempo_agotado}
    terminada = generacion.status in (GenerationStatus.IMPORTED, GenerationStatus.FAILED)
    return {
        "id": str(generacion.pk), "lugarId": generacion.lugar_id, "descripcion": generacion.description,
        "status": generacion.status,
        "skeleton": {
            "titulo": esqueleto["titulo"],
            "escenas": [{"clave": escena["sala"], "titulo": escena["titulo"], "final": bool(escena["final"])} for escena in esquema],
        } if esquema else None,
        "scenes": [
            {"clave": escena["sala"], "titulo": escena["titulo"], **_estado_de_escena(escenas.get(escena["sala"]) or {}, ahora, tiempo_agotado)}
            for escena in esquema
        ],
        "repairRounds": generacion.repair_rounds,
        "repair": {
            "round": reparacion.get("round", generacion.repair_rounds), "scenes": reparacion.get("scenes", []),
            "issues": reparacion.get("issues", {}),
        } if generacion.status == GenerationStatus.NEEDS_REPAIR and reparacion else None,
        "lastError": ultimo_error or None,
        "caseVersionId": generacion.case_version_id if generacion.status == GenerationStatus.IMPORTED else None,
        "issues": cargar_json(generacion.report_json, []) if terminada else [],
        "callsUsed": generacion.calls, "callsLimit": settings.AI_AUTHORING_GENERATION_MAX_CALLS,
        "createdAt": fecha(generacion.created_at), "updatedAt": fecha(generacion.updated_at),
    }


def propia(actor, identificador, *, bloquear=False, sin_esperar=False) -> CaseGeneration:
    """La generación de ``actor`` (404 si no existe o es de otra persona), con cerrojo de fila si se pide."""
    consulta = CaseGeneration.objects.select_for_update(nowait=sin_esperar) if bloquear else CaseGeneration.objects
    try:
        return consulta.get(pk=identificador, owner=actor)
    except (CaseGeneration.DoesNotExist, ValueError, TypeError, ErrorDeValidacion):
        raise NotFound(MENSAJE_NO_EXISTE) from None


# ─── auditoría ────────────────────────────────────────────────────────────────────────────────────


def _auditar_etapa(generacion_id, actor, etapa: str, resultado: str, *, inicio=None, tipo=None, ronda=0) -> None:
    """Una fila sin la descripción ni texto del modelo: la lista blanca del contexto lo garantiza también."""
    contexto = {"stage": etapa, "outcome": resultado, "round": ronda}
    if inicio is not None:
        contexto["duration_ms"] = int((time.monotonic() - inicio) * 1000)
    if tipo:
        contexto["kind"] = tipo
    record("AI_GENERATION_STAGE", "CASE_GENERATION", generacion_id, contexto, actor=actor)


# ─── estado, crear, leer, cancelar ────────────────────────────────────────────────────────────────


def caducar(actor) -> None:
    """Cancela las generaciones en curso de la docente que llevan 24 horas o más sin cambios."""
    limite = timezone.now() - timedelta(hours=ciclo.HORAS_ABANDONO)
    CaseGeneration.objects.filter(owner=actor, status__in=GenerationStatus.IN_PROGRESS, updated_at__lte=limite).update(
        status=GenerationStatus.CANCELLED,
    )


def _creadas_hoy(actor=None) -> int:
    consulta = CaseGeneration.objects.filter(created_at__date=timezone.now().date())
    return (consulta.filter(owner=actor) if actor is not None else consulta).count()


def estado(actor) -> dict:
    """Si está disponible y con qué proveedor (nunca su clave), cuántas le quedan hoy y la generación en curso."""
    exigir_autoria(actor)
    caducar(actor)
    actual = CaseGeneration.objects.filter(owner=actor, status__in=GenerationStatus.IN_PROGRESS).first()
    activa = disponible()
    return {
        "enabled": activa, "provider": settings.AI_AUTHORING_GENERATIONS_PROVIDER if activa else None,
        "remainingToday": max(0, settings.AI_AUTHORING_GENERATIONS_PER_DAY - _creadas_hoy(actor)),
        "inProgress": vista(actual) if actual else None,
    }


def _descripcion_valida(descripcion) -> str:
    if not isinstance(descripcion, str):
        raise _validacion("descripcion", MENSAJE_CORTA)
    texto = descripcion.strip()
    if len(texto) < MINIMO_DESCRIPCION:
        raise _validacion("descripcion", MENSAJE_CORTA)
    if len(texto) > MAXIMO_DESCRIPCION:
        raise _validacion("descripcion", MENSAJE_LARGA)
    if plain_text_problem(texto, MAXIMO_DESCRIPCION, multiline=True) is not None:
        raise _validacion("descripcion", MENSAJE_NO_PLANA)
    try:
        comprobaciones.comprobar_descripcion(texto)
    except GeneracionInvalida as error:
        raise _validacion("descripcion", error.motivos[0]) from None
    return texto


def crear(actor, lugar_id, descripcion) -> dict:
    exigir_autoria(actor)
    exigir_disponible()
    if not isinstance(lugar_id, str) or not lugar_id.strip():
        raise _validacion("lugarId", MENSAJE_SIN_LUGAR)
    lugares.cargar_lugar(lugar_id.strip())
    texto = _descripcion_valida(descripcion)
    caducar(actor)
    try:
        with transaction.atomic():
            get_user_model().objects.select_for_update().get(pk=actor.pk)
            if _creadas_hoy(actor) >= settings.AI_AUTHORING_GENERATIONS_PER_DAY:
                raise _limite_diario(MENSAJE_LIMITE_DIARIO)
            if connection.vendor == "postgresql":
                with connection.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(%s)", [CERROJO_GLOBAL])
            if _creadas_hoy() >= settings.AI_AUTHORING_GENERATIONS_GLOBAL_PER_DAY:
                raise _limite_diario(MENSAJE_LIMITE_GLOBAL)
            generacion = CaseGeneration.objects.create(owner=actor, lugar_id=lugar_id.strip(), description=texto)
    except IntegrityError:
        actual = CaseGeneration.objects.filter(owner=actor, status__in=GenerationStatus.IN_PROGRESS).first()
        if actual is None:
            raise
        raise ApiError("GENERATION_IN_PROGRESS", MENSAJE_EN_CURSO, 409, generationId=str(actual.pk)) from None
    record("AI_GENERATION_CREATED", "CASE_GENERATION", generacion.pk, actor=actor)
    return vista(generacion)


def leer(actor, identificador) -> dict:
    exigir_autoria(actor)
    exigir_disponible()
    return vista(propia(actor, identificador))


def cancelar(actor, identificador) -> dict:
    exigir_autoria(actor)
    exigir_disponible()
    with transaction.atomic():
        generacion = propia(actor, identificador, bloquear=True)
        if not ciclo.permite(generacion.status, ciclo.CANCELAR):
            raise _estado_invalido()
        generacion.status = GenerationStatus.CANCELLED
        generacion.save(update_fields=["status", "updated_at"])
    record("AI_GENERATION_CANCELLED", "CASE_GENERATION", generacion.pk, actor=actor)
    return vista(generacion)


# ─── etapas con el proveedor ──────────────────────────────────────────────────────────────────────


class _Plan:
    """Lo que la reserva deja listo para la llamada: etapa, mensajes y la marca de tiempo que identifica la reserva."""

    def __init__(self, *, etapa, clave, mensajes, marca, ronda, esqueleto=None, contexto=None):
        self.etapa, self.clave, self.mensajes, self.marca, self.ronda = etapa, clave, mensajes, marca, ronda
        self.esqueleto, self.contexto = esqueleto, contexto


def _contexto_de(generacion: CaseGeneration) -> dict:
    return contexto_del_lugar.del_lugar(lugares.cargar_lugar(generacion.lugar_id), contexto_del_lugar.competencias_activas())


def _plan_del_esqueleto(generacion, contexto, marca) -> _Plan:
    rechazado = cargar_json(generacion.scenes_json, {}).get(CLAVE_ESQUELETO_RECHAZADO)
    reparar = None
    if isinstance(rechazado, dict) and rechazado.get("rechazado") is not None:
        reparar = {"anterior": rechazado["rechazado"], "faltas": list(rechazado.get("motivos", []))}
    return _Plan(
        etapa="skeleton", clave=None, mensajes=prompts.mensajes_esqueleto(contexto, generacion.description, reparar),
        marca=marca, ronda=generacion.repair_rounds, contexto=contexto,
    )


def _plan_de_escena(generacion, contexto, marca, clave, entrada, reparando: bool) -> _Plan:
    esqueleto = json.loads(generacion.skeleton_json)
    anterior, faltas = None, []
    if entrada.get("rechazado") is not None:
        anterior, faltas = entrada["rechazado"], list(entrada.get("motivos", []))
    elif reparando and entrada.get("data"):
        anterior = entrada["data"]
    reparar = None
    if anterior is not None:
        problemas = (cargar_json(generacion.repair_json, {}).get("issues") or {}).get(clave, []) if reparando else []
        reparar = {"anterior": anterior, "faltas": faltas, "faltasDelEnsamblado": [falta["message"] for falta in problemas]}
    return _Plan(
        etapa="scene", clave=clave, mensajes=prompts.mensajes_escena(contexto, esqueleto, clave, reparar), marca=marca,
        ronda=generacion.repair_rounds, esqueleto=esqueleto, contexto=contexto,
    )


def _escenas_en_curso(escenas: dict, excepto: str, ahora: datetime) -> int:
    return sum(
        1 for clave, otra in escenas.items()
        if clave != excepto and isinstance(otra, dict) and otra.get("state") == "running"
        and not ciclo.vencida(_leer_fecha(otra.get("started_at")), ahora)
    )


def _reservar(identificador, actor, transicion: str, clave: str | None) -> _Plan:
    """Paso 1: reserva corta. Comprueba y marca la etapa en curso; todo lo que falle aquí no deja nada a medias."""
    with transaction.atomic():
        generacion = propia(actor, identificador, bloquear=True)
        if not ciclo.permite(generacion.status, transicion):
            raise _estado_invalido()
        ahora = timezone.now()
        escenas = cargar_json(generacion.scenes_json, {})
        if transicion == ciclo.ESQUELETO:
            if generacion.skeleton_started_at is not None and not ciclo.vencida(generacion.skeleton_started_at, ahora):
                raise _ocupada()
            if generacion.calls >= settings.AI_AUTHORING_GENERATION_MAX_CALLS:
                raise ApiError("GENERATION_CALLS_EXHAUSTED", MENSAJE_SIN_LLAMADAS, 429)
            plan = _plan_del_esqueleto(generacion, _contexto_de(generacion), ahora)
            generacion.skeleton_started_at = ahora
        else:
            orden = [escena["sala"] for escena in cargar_json(generacion.skeleton_json, {}).get("escenas", [])]
            if clave not in orden:
                raise NotFound(MENSAJE_NO_EXISTE)
            entrada = escenas.setdefault(clave, {"state": "pending", "data": None, "error": None, "started_at": None})
            reparando = transicion == ciclo.REPARAR_ESCENA
            if reparando and clave not in (cargar_json(generacion.repair_json, {}).get("scenes") or []):
                raise _estado_invalido()
            if entrada.get("state") == "running" and not ciclo.vencida(_leer_fecha(entrada.get("started_at")), ahora):
                raise _ocupada()
            if entrada.get("state") not in ("pending", "error", "running"):
                raise _estado_invalido()
            if _escenas_en_curso(escenas, clave, ahora) >= ciclo.ESCENAS_A_LA_VEZ:
                raise _ocupada()
            if generacion.calls >= settings.AI_AUTHORING_GENERATION_MAX_CALLS:
                raise ApiError("GENERATION_CALLS_EXHAUSTED", MENSAJE_SIN_LLAMADAS, 429)
            plan = _plan_de_escena(generacion, _contexto_de(generacion), ahora, clave, entrada, reparando)
            entrada.update(state="running", started_at=ahora.isoformat())
            generacion.scenes_json = json.dumps(escenas, ensure_ascii=False)
        generacion.calls += 1
        generacion.save()
    return plan


def _extraer_json(texto: str):
    """El JSON de la respuesta del proveedor, con o sin las cercas de código que a veces pone alrededor."""
    limpio = texto.strip()
    cercado = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", limpio, re.DOTALL)
    return json.loads(cercado.group(1) if cercado else limpio)


def _tipo_de_falla(error: Exception) -> str:
    causa = error.reason if isinstance(error, URLError) else error
    return "timeout" if isinstance(causa, (TimeoutError, socket.timeout)) else "http"


def _validar(plan: _Plan, crudo, competencias):
    if plan.etapa == "skeleton":
        return comprobaciones.validar_esqueleto(crudo, plan.contexto)
    return comprobaciones.validar_escena(crudo, plan.esqueleto, plan.clave, plan.contexto, competencias)


def _llamar(plan: _Plan):
    """Pasos 2 y 3: la llamada (sin transacción) y la validación. Devuelve ``(resultado, tipo, rechazado, motivos)``."""
    crudo = None
    try:
        proveedor = proveedor_para(
            settings.AI_AUTHORING_GENERATIONS_PROVIDER, settings.AI_AUTHORING_API_KEY, settings.AI_AUTHORING_MODEL,
        )
        texto = proveedor.responder(prompts.instrucciones("esqueleto" if plan.etapa == "skeleton" else "escena"), plan.mensajes)
        crudo = _extraer_json(texto)
        return _validar(plan, crudo, plan.contexto["competencias"]), None, None, None
    except GeneracionInvalida as error:
        return None, "malformed", crudo, list(error.motivos)
    except ValueError:
        return None, "malformed", None, None
    except Exception as error:  # noqa: BLE001 - un fallo inesperado deja la etapa retomable en vez de colgada en «en curso»
        logger.error("generacion_etapa_inesperada", extra={"fields": {"etapa": plan.etapa, "clase": type(error).__name__}})
        return None, _tipo_de_falla(error), None, None


def _guardar(identificador, actor, plan: _Plan, resultado, tipo, rechazado, motivos) -> str:
    """Paso 4: guardado corto con cerrojo. Devuelve ``ok``, ``error`` o ``descartada``."""
    with transaction.atomic():
        generacion = propia(actor, identificador, bloquear=True)
        escenas = cargar_json(generacion.scenes_json, {})
        if plan.etapa == "skeleton":
            es_mia = generacion.skeleton_started_at == plan.marca
        else:
            es_mia = (escenas.get(plan.clave) or {}).get("started_at") == plan.marca.isoformat()
        if generacion.status == GenerationStatus.CANCELLED or not es_mia:
            return "descartada"
        ultimo_error = cargar_json(generacion.last_error_json, {})
        misma_etapa = ultimo_error.get("stage") == plan.etapa and ultimo_error.get("clave") == plan.clave
        if plan.etapa == "skeleton":
            generacion.skeleton_started_at = None
            if tipo is None:
                generacion.skeleton_json = json.dumps(resultado, ensure_ascii=False)
                generacion.scenes_json = json.dumps(
                    {escena["sala"]: {"state": "pending", "data": None, "error": None, "started_at": None} for escena in resultado["escenas"]},
                    ensure_ascii=False,
                )
                generacion.status = GenerationStatus.SKELETON_READY
            elif rechazado is not None:  # solo para reintentar como reparación; la API nunca lo devuelve
                escenas[CLAVE_ESQUELETO_RECHAZADO] = {"rechazado": rechazado, "motivos": motivos}
                generacion.scenes_json = json.dumps(escenas, ensure_ascii=False)
        else:
            entrada = escenas[plan.clave]
            entrada["started_at"] = None
            if tipo is None:
                entrada.update(state="done", data=resultado, error=None)
                entrada.pop("rechazado", None)
                entrada.pop("motivos", None)
                generacion.status = _estado_tras_escena(generacion, escenas)
            else:
                entrada.update(state="error", error={"kind": tipo, "message": MENSAJES[tipo]})
                if rechazado is not None:
                    entrada.update(rechazado=rechazado, motivos=motivos)
            generacion.scenes_json = json.dumps(escenas, ensure_ascii=False)
        if tipo is None:
            if misma_etapa:
                generacion.last_error_json = "{}"
        else:
            generacion.last_error_json = json.dumps(
                {"stage": plan.etapa, "clave": plan.clave, "kind": tipo, "message": MENSAJES[tipo]}, ensure_ascii=False,
            )
        generacion.save()
    return "ok" if tipo is None else "error"


def _estado_tras_escena(generacion: CaseGeneration, escenas: dict) -> str:
    orden = [escena["sala"] for escena in cargar_json(generacion.skeleton_json, {}).get("escenas", [])]
    if generacion.status == GenerationStatus.NEEDS_REPAIR:
        marcadas = cargar_json(generacion.repair_json, {}).get("scenes") or []
        listas = all((escenas.get(clave) or {}).get("state") == "done" for clave in marcadas)
        return GenerationStatus.SCENES_READY if listas else GenerationStatus.NEEDS_REPAIR
    return ciclo.tras_escena(escenas, orden)


def _etapa(actor, identificador, transicion: str, clave: str | None) -> dict:
    exigir_autoria(actor)
    exigir_disponible()
    plan = _reservar(identificador, actor, transicion, clave)
    inicio = time.monotonic()
    try:
        resultado, tipo, rechazado, motivos = _llamar(plan)
    except BaseException:
        # Cualquier fallo antes del guardado dejaría la etapa «en curso»: se suelta como error y se propaga.
        _guardar(identificador, actor, plan, None, "http", None, None)
        raise
    desenlace = _guardar(identificador, actor, plan, resultado, tipo, rechazado, motivos)
    _auditar_etapa(
        identificador, actor, plan.etapa, "discarded" if desenlace == "descartada" else ("ok" if tipo is None else "error"),
        inicio=inicio, tipo=tipo, ronda=plan.ronda,
    )
    if desenlace == "descartada":
        raise _estado_invalido()
    if tipo is not None:
        raise _falla_del_proveedor(tipo)
    return vista(propia(actor, identificador))


def esqueleto(actor, identificador) -> dict:
    return _etapa(actor, identificador, ciclo.ESQUELETO, None)


def escena(actor, identificador, clave: str, *, reparar: bool) -> dict:
    return _etapa(actor, identificador, ciclo.REPARAR_ESCENA if reparar else ciclo.ESCENA, clave)


# ─── ensamblado ───────────────────────────────────────────────────────────────────────────────────


def ensamblar(actor, identificador) -> dict:
    """Ensambla las escenas: importa un borrador, pide reparar o falla; en los dos últimos casos no queda nada creado."""
    exigir_autoria(actor)
    exigir_disponible()
    inicio = time.monotonic()
    with transaction.atomic():
        try:
            generacion = propia(actor, identificador, bloquear=True, sin_esperar=True)
        except OperationalError as error:
            if getattr(getattr(error, "__cause__", None), "sqlstate", None) != ESTADO_BLOQUEO_NO_DISPONIBLE:
                raise
            raise _ocupada() from None
        if not ciclo.permite(generacion.status, ciclo.ENSAMBLAR):
            raise _estado_invalido()
        resultado = ensamblado.ensamblar(generacion, actor)
        ronda = generacion.repair_rounds
        generacion.report_json = json.dumps(resultado.issues, ensure_ascii=False)
        if resultado.resultado == "imported":
            generacion.status = GenerationStatus.IMPORTED
            generacion.case_version_id = resultado.case_version_id
        elif resultado.resultado == "needs_repair":
            orden = [escena_del_esqueleto["sala"] for escena_del_esqueleto in cargar_json(generacion.skeleton_json, {}).get("escenas", [])]
            marcadas = [clave for clave in orden if clave in resultado.por_escena]
            escenas = cargar_json(generacion.scenes_json, {})
            for clave in marcadas:  # vuelven a pendiente conservando su texto: la reparación parte de él
                escenas.setdefault(clave, {}).update(state="pending", error=None, started_at=None)
            generacion.scenes_json = json.dumps(escenas, ensure_ascii=False)
            generacion.repair_rounds = ronda = ronda + 1
            generacion.repair_json = json.dumps(
                {"round": ronda, "scenes": marcadas, "issues": {clave: resultado.por_escena[clave] for clave in marcadas}},
                ensure_ascii=False,
            )
            generacion.status = GenerationStatus.NEEDS_REPAIR
        else:
            generacion.status = GenerationStatus.FAILED
        if cargar_json(generacion.last_error_json, {}).get("stage") == "assemble":
            generacion.last_error_json = "{}"
        generacion.save()
    _auditar_etapa(identificador, actor, "assemble", "ok" if resultado.resultado != "failed" else "error", inicio=inicio, ronda=ronda)
    return vista(generacion)
