"""La IA coautora, fase 1 (SIEP-269): aclara la idea del docente con preguntas de tres opciones y acuerda una ficha.

Diseño: ``docs/diseno/2026-11-25-ia-coautora-del-editor.md`` (§4 ①–③ y §7). Un acuerdo nace para un caso nuevo (``lugarId``:
al aceptarlo arranca la generación por etapas con la ficha como descripción) o para un caso que se edita (``caseVersionId``:
la ficha aceptada queda guardada como contexto de lo que sigue).

Reglas (las mismas del asistente por partes):

- Propiedad: un acuerdo ajeno es un 404, también para ADMIN. Con el asistente apagado, todo es un 404.
- Cupo: iniciar gasta UNA ayuda del día (``limites``); dentro del acuerdo el tope es de llamadas (``TOPE_LLAMADAS``) y de
  preguntas (``TOPE_PREGUNTAS``), y lo impone el servidor, no el modelo.
- Cada llamada al proveedor sigue la plantilla de la generación: reserva corta con cerrojo (estado, tope, ``busy_since``),
  llamada sin transacción abierta, validación de lo que volvió (``esquemas``) y guardado corto con cerrojo.
- Una falla del proveedor devuelve la llamada; una respuesta inválida la gasta. Al cliente solo le llegan mensajes fijos.
- La auditoría guarda etapa, resultado, modelo y duración: nunca la idea, las respuestas ni el texto del modelo.
"""
import json
import logging
import time
from dataclasses import replace
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.autoria import editor as editor_de_autoria
from apps.biblioteca.services import lugares
from apps.simulation.models import AgreementStatus, CaseVersionStatus, CoauthorAgreement
from apps.simulation.services.audit_service import record
from apps.users.permisos import exigir_autoria
from shared.exceptions import ApiError
from shared.plain_text import plain_text_problem

from . import generaciones
from .asistente import config as config_del_asistente
from .asistente import limites, llamada
from .asistente.errores import ErrorDeProveedor
from .coautoria import esquemas, prompts
from .coautoria.esquemas import CoautoriaInvalida
from .generacion import contexto as contexto_del_lugar
from .privacidad import sin_datos_personales

logger = logging.getLogger(__name__)

MINIMO_IDEA = 10
MAXIMO_IDEA = 2000
MAXIMO_RESPUESTA = 300
MAXIMO_CAMBIO = 1000
#: Una llamada «en curso» desde hace tanto se considera abandonada y se puede pedir de nuevo.
SEGUNDOS_OCUPADO = 150
#: Los modelos que razonan (los de NVIDIA) gastan buena parte de los tokens pensando: con menos de ~2000, la respuesta
#: llega vacía. 8000 alcanza para el razonamiento y la ficha.
MAXIMO_TOKENS = 8000
#: Esos mismos modelos tardan de 30 a 90 s por respuesta: la coautora espera al menos esto aunque el asistente use menos.
SEGUNDOS_MINIMOS = 120

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
MENSAJE_NO_DISPONIBLE = "El asistente no está disponible"
MENSAJE_NO_EXISTE = "La conversación con la IA no existe."
MENSAJE_ESTADO = "Ese paso no corresponde ahora. Vuelve a cargar la conversación."
MENSAJE_OCUPADO = "La IA ya está pensando esta parte. Espera un momento."
MENSAJE_AGOTADO = "Esta conversación ya usó todos sus intentos con la IA. Empieza una nueva."
MENSAJE_PROVEEDOR = "La IA no respondió. Inténtalo de nuevo en un momento."
MENSAJE_RECHAZO = "La IA no puede ayudar con esa petición. Prueba a contarla de otra forma."
MENSAJE_INVALIDA = "La IA respondió algo que no pudimos usar. Inténtalo de nuevo."
MENSAJE_DESTINO = "Indica el lugar del caso nuevo o el caso que estás editando, no los dos."
MENSAJE_IDEA_CORTA = "Cuéntale a la IA tu idea en al menos 10 caracteres."
MENSAJE_IDEA_LARGA = "La idea puede tener hasta 2000 caracteres."
MENSAJE_NO_PLANA = "Escribe texto plano, sin etiquetas, enlaces ni caracteres especiales."
MENSAJE_DATOS_PERSONALES = "No escribas correos ni números de contacto o de documento."
MENSAJE_RESPUESTA = "Elige una opción, escribe la tuya o deja que la IA decida."
MENSAJE_NUMERO = "Esa pregunta no está en la conversación."
MENSAJE_CAMBIO = "Cuéntale a la IA qué quieres cambiar."
MENSAJE_FICHA = "La ficha no tiene la forma esperada."
MENSAJE_VERSION = "La versión no es editable."

#: Cómo se lee la elección «Decide tú» en la conversación (y en el mensaje a la IA).
DECIDE_TU = "Decide tú"


# ─── errores ──────────────────────────────────────────────────────────────────────────────────────


def _validacion(campo: str, mensaje: str) -> ApiError:
    return ApiError("VALIDATION_ERROR", mensaje, 400, field=campo)


def _estado_invalido() -> ApiError:
    return ApiError("COAUTHOR_STATE", MENSAJE_ESTADO, 409)


# ─── lectura y vista ──────────────────────────────────────────────────────────────────────────────


def _cargar(texto, defecto):
    try:
        valor = json.loads(texto) if texto else defecto
    except (TypeError, ValueError):
        return defecto
    return valor if isinstance(valor, type(defecto)) else defecto


def _respuesta_legible(turno: dict) -> str:
    eleccion, pregunta = turno["eleccion"], turno["pregunta"]
    if eleccion["tipo"] == "opcion":
        return pregunta["opciones"][eleccion["indice"]]
    if eleccion["tipo"] == "propia":
        return eleccion["texto"]
    return f"{DECIDE_TU}: {pregunta['opciones'][pregunta['recomendada']]}"


def _ocupado(acuerdo, ahora) -> bool:
    return acuerdo.busy_since is not None and ahora - acuerdo.busy_since < timedelta(seconds=SEGUNDOS_OCUPADO)


def vista(acuerdo: CoauthorAgreement) -> dict:
    turnos = _cargar(acuerdo.turns_json, [])
    pendiente = _cargar(acuerdo.question_json, {})
    ficha = _cargar(acuerdo.agreement_json, {})
    return {
        "id": str(acuerdo.pk),
        "status": acuerdo.status,
        "lugarId": acuerdo.lugar_id or None,
        "caseVersionId": acuerdo.case_version_id,
        "idea": acuerdo.idea,
        "respuestas": [
            {
                "numero": i, "ambito": t["pregunta"]["ambito"], "pregunta": t["pregunta"]["texto"],
                "porque": t["pregunta"]["porque"], "opciones": t["pregunta"]["opciones"],
                "recomendada": t["pregunta"]["recomendada"], "eleccion": t["eleccion"], "respuesta": _respuesta_legible(t),
            }
            for i, t in enumerate(turnos, 1)
        ],
        "pregunta": {"numero": len(turnos) + 1, **pendiente} if pendiente else None,
        "topePreguntas": esquemas.TOPE_PREGUNTAS,
        "ficha": ficha or None,
        "llamadasUsadas": acuerdo.calls,
        "llamadasTope": esquemas.TOPE_LLAMADAS,
        "generationId": str(acuerdo.generation_id) if acuerdo.generation_id else None,
        "ocupado": _ocupado(acuerdo, timezone.now()),
    }


def _propio(actor, identificador, *, bloquear=False) -> CoauthorAgreement:
    consulta = CoauthorAgreement.objects.filter(pk=identificador, owner=actor)
    if bloquear:
        consulta = consulta.select_for_update()
    acuerdo = consulta.first()
    if acuerdo is None:
        raise ApiError("NOT_FOUND", MENSAJE_NO_EXISTE, 404)
    return acuerdo


def _exigir_disponible():
    if not config_del_asistente.actual().conectado:
        raise ApiError("NOT_FOUND", MENSAJE_NO_DISPONIBLE, 404)


def _auditar(actor, accion, acuerdo_id, contexto=None):
    record(accion, "COAUTHOR_AGREEMENT", acuerdo_id, contexto, actor=actor)


# ─── textos del docente ───────────────────────────────────────────────────────────────────────────


def _texto_del_docente(valor, campo: str, *, minimo: int, maximo: int, corto: str, largo: str, multilinea: bool) -> str:
    if not isinstance(valor, str):
        raise _validacion(campo, corto)
    texto = valor.strip()
    if len(texto) < minimo:
        raise _validacion(campo, corto)
    if len(texto) > maximo:
        raise _validacion(campo, largo)
    if plain_text_problem(texto, maximo, multiline=multilinea) is not None:
        raise _validacion(campo, MENSAJE_NO_PLANA)
    if sin_datos_personales(texto) != texto:
        raise _validacion(campo, MENSAJE_DATOS_PERSONALES)
    return texto


# ─── contexto ─────────────────────────────────────────────────────────────────────────────────────


def _contexto_del_lugar(lugar_id: str) -> dict:
    completo = contexto_del_lugar.del_lugar(lugares.cargar_lugar(lugar_id, por_piezas=True), [])
    return {
        "casoNuevo": True,
        "lugar": completo["lugar"]["nombre"],
        "salas": [
            {"nombre": sala["nombre"], "personas": [p["nombre"] or p["rol"] for p in sala["personas"]]}
            for sala in completo["salas"]
        ],
    }


def _contexto_del_caso(version) -> dict:
    caso = getattr(version, "simulation_case", None)
    return {
        "casoNuevo": False,
        "titulo": getattr(caso, "title", "") or "",
        "escenas": list(version.nodes.order_by("pk").values_list("title", flat=True)[:30]),
        "personajes": list(version.characters.order_by("pk").values_list("display_name", flat=True)[:20]),
    }


def _contexto(acuerdo) -> dict:
    if acuerdo.case_version_id:
        return _contexto_del_caso(acuerdo.case_version)
    return _contexto_del_lugar(acuerdo.lugar_id)


# ─── la llamada ───────────────────────────────────────────────────────────────────────────────────


def _reservar(actor, identificador, estados) -> CoauthorAgreement:
    """Reserva corta: estado, tope de llamadas y nadie más pensando. Suma la llamada y marca ``busy_since``."""
    ahora = timezone.now()
    with transaction.atomic():
        acuerdo = _propio(actor, identificador, bloquear=True)
        if acuerdo.status not in estados:
            raise _estado_invalido()
        if _ocupado(acuerdo, ahora):
            raise ApiError("COAUTHOR_BUSY", MENSAJE_OCUPADO, 409)
        if acuerdo.calls >= esquemas.TOPE_LLAMADAS:
            raise ApiError("COAUTHOR_EXHAUSTED", MENSAJE_AGOTADO, 409)
        acuerdo.calls += 1
        acuerdo.busy_since = ahora
        acuerdo.save(update_fields=["calls", "busy_since", "updated_at"])
    return acuerdo


def _soltar(acuerdo, *, devolver_llamada: bool):
    with transaction.atomic():
        fila = CoauthorAgreement.objects.select_for_update().get(pk=acuerdo.pk)
        fila.busy_since = None
        if devolver_llamada and fila.calls > 0:
            fila.calls -= 1
        fila.save(update_fields=["calls", "busy_since", "updated_at"])


def _llamar(actor, acuerdo, etapa: str, instrucciones: str, mensajes: list[dict], validar, *, rapido: bool = False):
    """Llama al proveedor fuera de toda transacción y devuelve lo validado. Suelta la reserva si algo falla.

    Las preguntas usan el modelo rápido (``AI_AUTHORING_MODEL``): son varias y cortas, y el docente espera cada una. El
    resumen usa el capaz (``AI_AUTHORING_MODEL_CAPABLE``): es uno solo y es lo que se acuerda. Medido con NVIDIA el
    2026-11-25: un modelo que razona tarda de 57 a 111 s por pregunta; uno rápido, unos 20 s."""
    config = config_del_asistente.actual()
    config = replace(config, timeout_seconds=max(config.timeout_seconds, SEGUNDOS_MINIMOS))
    modelo = config.model_fast if rapido else config.model_capable
    inicio = time.monotonic()

    def auditar(resultado, **extra):
        contexto = {"stage": etapa, "outcome": resultado, "model": modelo,
                    "duration_ms": int((time.monotonic() - inicio) * 1000), **extra}
        _auditar(actor, "AI_COAUTHOR_STAGE", acuerdo.pk, contexto)

    try:
        resultado = _completar_y_validar(config, instrucciones, mensajes, modelo, validar)
    except ErrorDeProveedor as error:
        logger.warning("IA coautora: fallo del proveedor (kind=%s)", error.tipo)
        if error.tipo == "refusal":
            _soltar(acuerdo, devolver_llamada=False)
            auditar("refusal")
            raise ApiError("AI_REFUSED", MENSAJE_RECHAZO, 422) from None
        _soltar(acuerdo, devolver_llamada=True)
        auditar("error", kind=error.tipo)
        raise ApiError("AI_PROVIDER_ERROR", MENSAJE_PROVEEDOR, 502, kind=error.tipo) from None
    except CoautoriaInvalida as invalida:
        _soltar(acuerdo, devolver_llamada=False)
        auditar("invalid")
        raise ApiError("AI_COAUTHOR_INVALID", MENSAJE_INVALIDA, 422, motivo=invalida.motivo) from None
    except Exception:
        _soltar(acuerdo, devolver_llamada=True)
        raise
    auditar("ok")
    return resultado


def _completar_y_validar(config, instrucciones, mensajes, modelo, validar):
    """Una respuesta validada. Si la primera no tiene la forma esperada (o no es JSON), se pide UNA vez más sin molestar al
    docente: los modelos rápidos a veces devuelven el esquema en vez de los datos. El segundo fallo sí llega al cliente, y
    lo que no cumple las reglas de contenido nunca se vuelve a pedir."""
    for intento in range(2):
        try:
            return validar(llamada.completar(config, instrucciones, mensajes, modelo=modelo, max_tokens=MAXIMO_TOKENS))
        except CoautoriaInvalida as invalida:
            if intento or invalida.motivo != esquemas.MOTIVO_FORMA:
                raise
        except ErrorDeProveedor as error:
            if intento or error.tipo != "malformed":
                raise
        logger.info("IA coautora: respuesta mal formada; se pide otra vez")
    raise AssertionError("inalcanzable")


def _respuestas_para_la_ia(turnos: list[dict]) -> list[dict]:
    return [{"pregunta": t["pregunta"]["texto"], "respuesta": _respuesta_legible(t)} for t in turnos]


def _guardar(acuerdo_id, estados_previos, cambiar):
    """Guardado corto: si el acuerdo cambió de estado mientras la IA pensaba (se canceló), lo pensado se descarta."""
    with transaction.atomic():
        acuerdo = CoauthorAgreement.objects.select_for_update().get(pk=acuerdo_id)
        acuerdo.busy_since = None
        if acuerdo.status in estados_previos:
            cambiar(acuerdo)
        acuerdo.save()
    return acuerdo


# ─── preguntar ────────────────────────────────────────────────────────────────────────────────────


def _preguntar(actor, acuerdo_id) -> dict:
    """Pide la siguiente pregunta. Si la IA dice que ya tiene lo que necesita, el acuerdo pasa a ``ready``."""
    acuerdo = _reservar(actor, acuerdo_id, (AgreementStatus.CLARIFYING,))
    turnos = _cargar(acuerdo.turns_json, [])
    mensajes = prompts.mensajes(
        acuerdo.idea, _contexto(acuerdo), _respuestas_para_la_ia(turnos),
        preguntaNumero=len(turnos) + 1, topePreguntas=esquemas.TOPE_PREGUNTAS,
    )
    pregunta = _llamar(actor, acuerdo, "preguntar", prompts.instrucciones_preguntar(), mensajes, esquemas.pregunta, rapido=True)

    def cambiar(fila):
        if pregunta is None:
            fila.question_json = "{}"
            fila.status = AgreementStatus.READY
        else:
            fila.question_json = json.dumps(pregunta, ensure_ascii=False)

    return vista(_guardar(acuerdo.pk, (AgreementStatus.CLARIFYING,), cambiar))


# ─── API del servicio ─────────────────────────────────────────────────────────────────────────────


def iniciar(actor, datos) -> dict:
    """Abre un acuerdo con la idea del docente, gasta una ayuda del día y pide la primera pregunta.

    Si la primera pregunta falla (proveedor caído o respuesta inválida), el acuerdo ya existe: se devuelve sin pregunta y
    con el error, para que el cliente la pida de nuevo (``pedir_pregunta``) sin gastar otra ayuda."""
    exigir_autoria(actor)
    _exigir_disponible()
    datos = datos if hasattr(datos, "get") else {}
    lugar_id, version_id = datos.get("lugarId"), datos.get("caseVersionId")
    if bool(lugar_id) == bool(version_id):
        raise _validacion("lugarId", MENSAJE_DESTINO)
    idea = _texto_del_docente(
        datos.get("idea"), "idea", minimo=MINIMO_IDEA, maximo=MAXIMO_IDEA, corto=MENSAJE_IDEA_CORTA,
        largo=MENSAJE_IDEA_LARGA, multilinea=True,
    )
    version = None
    if version_id:
        if isinstance(version_id, bool) or not isinstance(version_id, int):
            raise _validacion("caseVersionId", MENSAJE_DESTINO)
        version = editor_de_autoria.version_visible(actor, version_id)
        if version.status != CaseVersionStatus.DRAFT:
            raise ApiError("VERSION_NOT_EDITABLE", MENSAJE_VERSION, 409)
    else:
        if not isinstance(lugar_id, str) or not lugar_id.strip():
            raise _validacion("lugarId", MENSAJE_DESTINO)
        generaciones.exigir_disponible()
        lugares.cargar_lugar(lugar_id.strip(), por_piezas=True)
    limites.consumir(actor)
    acuerdo = CoauthorAgreement.objects.create(
        owner=actor, lugar_id="" if version else lugar_id.strip(), case_version=version, idea=idea,
    )
    _auditar(actor, "AI_COAUTHOR_STARTED", acuerdo.pk)
    try:
        return _preguntar(actor, acuerdo.pk)
    except ApiError as error:
        if error.api_code in ("AI_PROVIDER_ERROR", "AI_COAUTHOR_INVALID", "AI_REFUSED"):
            fallo = {"code": error.api_code, "message": str(error.detail)}
            return vista(CoauthorAgreement.objects.get(pk=acuerdo.pk)) | {"error": fallo}
        raise


def leer(actor, identificador) -> dict:
    exigir_autoria(actor)
    _exigir_disponible()
    return vista(_propio(actor, identificador))


def pedir_pregunta(actor, identificador) -> dict:
    """Vuelve a pedir la pregunta pendiente (tras una falla del proveedor o una respuesta inválida)."""
    exigir_autoria(actor)
    _exigir_disponible()
    acuerdo = _propio(actor, identificador)
    if acuerdo.status != AgreementStatus.CLARIFYING or _cargar(acuerdo.question_json, {}):
        raise _estado_invalido()
    return _preguntar(actor, acuerdo.pk)


def _eleccion(datos, pregunta: dict) -> dict:
    eleccion = datos.get("eleccion") if hasattr(datos, "get") else None
    if not isinstance(eleccion, dict):
        raise _validacion("eleccion", MENSAJE_RESPUESTA)
    tipo = eleccion.get("tipo")
    if tipo == "decide":
        return {"tipo": "decide"}
    if tipo == "opcion":
        indice = eleccion.get("indice")
        if isinstance(indice, bool) or not isinstance(indice, int) or not 0 <= indice < len(pregunta["opciones"]):
            raise _validacion("eleccion", MENSAJE_RESPUESTA)
        return {"tipo": "opcion", "indice": indice}
    if tipo == "propia":
        texto = _texto_del_docente(
            eleccion.get("texto"), "eleccion", minimo=1, maximo=MAXIMO_RESPUESTA, corto=MENSAJE_RESPUESTA,
            largo=MENSAJE_RESPUESTA, multilinea=False,
        )
        return {"tipo": "propia", "texto": texto}
    raise _validacion("eleccion", MENSAJE_RESPUESTA)


def responder(actor, identificador, datos) -> dict:
    """Guarda la respuesta a la pregunta ``numero`` y pide la siguiente (o pasa a ``ready`` si se llegó al tope).

    ``numero`` puede ser una pregunta ya respondida: se cambia esa respuesta y se descartan las posteriores (y el resumen,
    si lo había)."""
    exigir_autoria(actor)
    _exigir_disponible()
    datos = datos if hasattr(datos, "get") else {}
    numero = datos.get("numero")
    if isinstance(numero, bool) or not isinstance(numero, int):
        raise _validacion("numero", MENSAJE_NUMERO)
    with transaction.atomic():
        acuerdo = _propio(actor, identificador, bloquear=True)
        if acuerdo.status not in AgreementStatus.OPEN:
            raise _estado_invalido()
        if _ocupado(acuerdo, timezone.now()):
            raise ApiError("COAUTHOR_BUSY", MENSAJE_OCUPADO, 409)
        turnos = _cargar(acuerdo.turns_json, [])
        pendiente = _cargar(acuerdo.question_json, {})
        if 1 <= numero <= len(turnos):
            pregunta = turnos[numero - 1]["pregunta"]
        elif numero == len(turnos) + 1 and pendiente and acuerdo.status == AgreementStatus.CLARIFYING:
            pregunta = pendiente
        else:
            raise _validacion("numero", MENSAJE_NUMERO)
        turnos = turnos[: numero - 1] + [{"pregunta": pregunta, "eleccion": _eleccion(datos, pregunta)}]
        acuerdo.turns_json = json.dumps(turnos, ensure_ascii=False)
        acuerdo.question_json = "{}"
        acuerdo.agreement_json = "{}"
        acuerdo.status = AgreementStatus.READY if len(turnos) >= esquemas.TOPE_PREGUNTAS else AgreementStatus.CLARIFYING
        acuerdo.save()
    if acuerdo.status == AgreementStatus.READY:
        return vista(acuerdo)
    return _preguntar(actor, acuerdo.pk)


def saltar(actor, identificador) -> dict:
    """«Saltar las preguntas»: no se pregunta más y se pasa a pedir el resumen."""
    exigir_autoria(actor)
    _exigir_disponible()
    with transaction.atomic():
        acuerdo = _propio(actor, identificador, bloquear=True)
        if acuerdo.status != AgreementStatus.CLARIFYING or _ocupado(acuerdo, timezone.now()):
            raise _estado_invalido()
        acuerdo.question_json = "{}"
        acuerdo.status = AgreementStatus.READY
        acuerdo.save()
    _auditar(actor, "AI_COAUTHOR_STAGE", acuerdo.pk, {"stage": "saltar", "outcome": "ok"})
    return vista(acuerdo)


def resumir(actor, identificador, datos) -> dict:
    """Pide la ficha «Lo que acordamos». Con ``cambio`` (desde ``summarized``), la reescribe aplicando lo que pide el docente."""
    exigir_autoria(actor)
    _exigir_disponible()
    datos = datos if hasattr(datos, "get") else {}
    cambio = datos.get("cambio")
    if cambio is not None:
        cambio = _texto_del_docente(
            cambio, "cambio", minimo=1, maximo=MAXIMO_CAMBIO, corto=MENSAJE_CAMBIO, largo=MENSAJE_CAMBIO, multilinea=True,
        )
    estados = (AgreementStatus.SUMMARIZED,) if cambio else (AgreementStatus.READY,)
    acuerdo = _reservar(actor, identificador, estados)
    extra = {"fichaAnterior": _cargar(acuerdo.agreement_json, {}), "cambio": cambio} if cambio else {}
    mensajes = prompts.mensajes(acuerdo.idea, _contexto(acuerdo), _respuestas_para_la_ia(_cargar(acuerdo.turns_json, [])), **extra)
    ficha = _llamar(actor, acuerdo, "cambiar" if cambio else "resumir", prompts.instrucciones_resumir(), mensajes, esquemas.ficha)

    def cambiar(fila):
        fila.agreement_json = json.dumps(ficha, ensure_ascii=False)
        fila.status = AgreementStatus.SUMMARIZED

    return vista(_guardar(acuerdo.pk, estados, cambiar))


def corregir_ficha(actor, identificador, datos) -> dict:
    """El docente corrige la ficha en su lugar: se valida igual que la de la IA y no gasta llamadas."""
    exigir_autoria(actor)
    _exigir_disponible()
    try:
        ficha = esquemas.ficha(datos.get("ficha") if hasattr(datos, "get") else None)
    except CoautoriaInvalida:
        raise _validacion("ficha", MENSAJE_FICHA) from None
    with transaction.atomic():
        acuerdo = _propio(actor, identificador, bloquear=True)
        if acuerdo.status != AgreementStatus.SUMMARIZED or _ocupado(acuerdo, timezone.now()):
            raise _estado_invalido()
        acuerdo.agreement_json = json.dumps(ficha, ensure_ascii=False)
        acuerdo.save()
    _auditar(actor, "AI_COAUTHOR_STAGE", acuerdo.pk, {"stage": "corregir", "outcome": "ok"})
    return vista(acuerdo)


def aceptar(actor, identificador) -> dict:
    """ACEPTAR: la ficha queda acordada. Para un caso nuevo arranca la generación por etapas con la ficha como descripción."""
    exigir_autoria(actor)
    _exigir_disponible()
    acuerdo = _propio(actor, identificador)
    if acuerdo.status != AgreementStatus.SUMMARIZED or _ocupado(acuerdo, timezone.now()):
        raise _estado_invalido()
    generacion_id = None
    if acuerdo.lugar_id:
        ficha = _cargar(acuerdo.agreement_json, {})
        generacion = generaciones.crear(actor, acuerdo.lugar_id, prompts.descripcion(ficha, generaciones.MAXIMO_DESCRIPCION))
        generacion_id = generacion["id"]
    with transaction.atomic():
        acuerdo = _propio(actor, identificador, bloquear=True)
        if acuerdo.status != AgreementStatus.SUMMARIZED:
            raise _estado_invalido()
        acuerdo.status = AgreementStatus.ACCEPTED
        if generacion_id:
            acuerdo.generation_id = generacion_id
        acuerdo.save()
    _auditar(actor, "AI_COAUTHOR_ACCEPTED", acuerdo.pk)
    return vista(acuerdo)


def cancelar(actor, identificador) -> dict:
    exigir_autoria(actor)
    _exigir_disponible()
    with transaction.atomic():
        acuerdo = _propio(actor, identificador, bloquear=True)
        if acuerdo.status not in AgreementStatus.OPEN:
            raise _estado_invalido()
        acuerdo.status = AgreementStatus.CANCELLED
        acuerdo.busy_since = None
        acuerdo.save()
    _auditar(actor, "AI_COAUTHOR_CANCELLED", acuerdo.pk)
    return vista(acuerdo)
