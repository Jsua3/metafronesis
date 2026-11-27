"""Siembra de participaciones: sesiones ya jugadas sobre la siembra de demostración (solo desarrollo).

Parte de ``siembra_demostracion`` (docentes, estudiantes, los tres grupos, la rúbrica de VBG y el caso insignia
SIM-VBG-002 publicado y asignado) y agrega lo que falta para ver el seguimiento con datos:

- Tres sesiones FINALIZADAS, una por grupo, en fechas pasadas, y una PROGRAMADA para la semana siguiente.
- Intentos jugados con los servicios reales del juego (inicio, decisiones, bitácora y cierre). Por eso el informe del
  estudiante, la evaluación congelada y la calificación automática con la rúbrica los produce el propio sistema.
- Cada estudiante juega con un perfil (ejemplar, sólido, en proceso, con dificultades), así los reportes muestran
  diferencias reales. Hay una ausencia y un intento que la sesión cerró sin terminar.
- Retroalimentación de la docente en algunos intentos.

Después de jugar, las fechas de cada sesión y de sus intentos se mueven al pasado para que el historial sea creíble.
Es idempotente: una sesión que ya existe (mismo grupo, caso y lugar) no se vuelve a jugar.
"""
import random
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.grupos.models import CaseAssignment, Grupo
from apps.privacy import consent_service
from apps.publicacion import siembra_demostracion as base
from apps.sesiones import servicios as sesiones
from apps.sesiones.models import EstadoSesion, Sesion
from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.models import (
    AttemptEvaluation, AttemptEvent, AttemptReport, AttemptStatus, ReflectionJournal, RubricEvaluation,
    SimulationAttempt,
)
from apps.simulation.services import attempt_api, bitacora, disponibilidad_mundo, evaluacion
from apps.users.models import CustomUser, UserRole

ErrorDeSiembra = base.ErrorDeSiembra

TIEMPO_MAXIMO_MIN = 40
DOCENTE_DEMO = "profesora@psychosim.edu.co"
RECOMENDADA, ACEPTABLE, RIESGOSA, CONTRAINDICADA = (
    ResponseClass.RECOMMENDED, ResponseClass.ACCEPTABLE, ResponseClass.RISKY, ResponseClass.CONTRAINDICATED)


@dataclass(frozen=True)
class Perfil:
    """Cómo decide un estudiante en cada escena.

    ``tanteo``: probabilidad de una primera respuesta riesgosa que el juego hace reintentar (no cuenta en la nota).
    ``desacierto``: probabilidad de que la respuesta que QUEDA registrada no sea la recomendada.
    ``contraindicada``: de esos desaciertos, cuántos son contraindicados (topan la competencia en «En proceso»).
    Con el caso insignia la nota esperada ronda 3,0 / 2,75 / 2,4 / 2,0 (simulada sobre sus 20 decisiones).
    """
    nombre: str
    tanteo: float
    desacierto: float
    contraindicada: float
    minutos: tuple  # rango del tiempo activo total


EJEMPLAR = Perfil("ejemplar", 0.05, 0.03, 0.0, (30, 36))
SOLIDO = Perfil("sólido", 0.15, 0.25, 0.15, (28, 38))
EN_PROCESO = Perfil("en proceso", 0.25, 0.45, 0.3, (32, 40))
CON_DIFICULTADES = Perfil("con dificultades", 0.3, 0.7, 0.55, (24, 34))

# Por sesión: (código del grupo, días atrás, hora de inicio, lugar, mensaje, {índice de estudiante: perfil | None}).
# Los índices son los de ``base.ESTUDIANTES``. ``None`` = no se conectó; ``"incompleto"`` = la sesión lo cerró a mitad.
SESIONES = (
    ("DEMO-PSI-SOC-A", 21, 8, "Aula 204 · Bloque de Psicología",
     "Primera práctica con el caso insignia. Lleguen 10 minutos antes y traigan audífonos.",
     {0: EJEMPLAR, 1: EN_PROCESO, 2: SOLIDO, 3: CON_DIFICULTADES, 4: SOLIDO}),
    ("DEMO-PSI-SOC-B", 12, 10, "Sala de simulación 2",
     "Práctica de atención inicial a una persona víctima de violencia basada en género.",
     {5: SOLIDO, 6: EJEMPLAR, 7: CON_DIFICULTADES, 8: EN_PROCESO, 9: None}),
    ("DEMO-PRACTICA-AP", 5, 14, "Laboratorio de práctica psicosocial",
     "Segunda vuelta para quienes ya jugaron el caso: comparen sus decisiones con las de la primera vez.",
     {2: EJEMPLAR, 3: EN_PROCESO, 8: SOLIDO, 9: CON_DIFICULTADES, 10: SOLIDO, 11: "incompleto"}),
)
PROGRAMADA = ("DEMO-PSI-SOC-B", -7, 10, "Sala de simulación 2",
              "Sesión de refuerzo: retomamos la ruta de atención y la derivación.")

REFLEXIONES = (
    "Me costó no apresurarme a preguntar qué pasó. Priorizar que se sintiera segura cambió la conversación.",
    "Noté que mi primera reacción fue dar consejos. Escuchar sin juzgar le dio espacio para contar lo que necesitaba.",
    "Revisé la ruta de atención antes de derivar; explicarle sus derechos con calma le ayudó a decidir.",
    "Debo cuidar el lenguaje: una pregunta mía pudo sonar a cuestionamiento del relato.",
)
RETROALIMENTACION = {
    "ejemplar": "Muy buen manejo de la contención y de la derivación con consentimiento. Sigue cuidando los tiempos de la persona.",
    "sólido": "Buena escucha y rutas claras. Te sugiero valorar el riesgo de forma continua, no solo al inicio.",
    "en proceso": "Vas por buen camino. Repasa la ruta de atención: en dos escenas la derivación quedó sin seguimiento.",
    "con dificultades": "Hubo preguntas que pueden revictimizar. Repasemos juntos la escucha sin juicio antes de la próxima sesión.",
}


def _aceptar_consentimientos(estudiante, version):
    if settings.SIEP_CONSENT_REQUIRED:
        consent_service.accept_content_notice(estudiante, version, consent_service.content_notice_version())
    if getattr(settings, "SIEP_DATA_TREATMENT_CONSENT_REQUIRED", False):
        consent_service.accept_data_treatment(estudiante, consent_service.data_treatment_notice_version())


def _elegir(opciones, clases, azar):
    """La primera opción de la primera clase disponible en el orden pedido."""
    for clase in clases:
        candidatas = [opcion for opcion in opciones if opcion.response_class == clase]
        if candidatas:
            return azar.choice(candidatas)
    return azar.choice(opciones)


def _jugar(estudiante, version, perfil, azar, *, hasta=None):
    """Juega el caso con el perfil dado. Con ``hasta``, se detiene tras esa cantidad de decisiones (intento abierto)."""
    _aceptar_consentimientos(estudiante, version)
    intento, _ = attempt_api.start(estudiante, version.pk)
    decisiones = 0
    reflexiones = azar.sample(range(2, 12), 2)
    while True:
        intento.refresh_from_db()
        if intento.status != AttemptStatus.IN_PROGRESS or (hasta is not None and decisiones >= hasta):
            return intento
        opciones = disponibilidad_mundo.opciones(intento)
        if not opciones:
            raise ErrorDeSiembra(f"La escena {intento.current_node_id} no ofrece opciones; no se puede jugar el caso.")
        if decisiones in reflexiones:
            bitacora.guardar(estudiante, intento.pk, {"nodeId": intento.current_node_id,
                                                      "text": azar.choice(REFLEXIONES), "requestId": uuid.uuid4().hex})
        if azar.random() < perfil.desacierto:
            malas = (CONTRAINDICADA, RIESGOSA, ACEPTABLE) if azar.random() < perfil.contraindicada else (
                RIESGOSA, ACEPTABLE, CONTRAINDICADA)
            final = _elegir(opciones, malas, azar)
        else:
            final = _elegir(opciones, (RECOMENDADA,), azar)
        tantea = final.response_class in (RIESGOSA, CONTRAINDICADA) or azar.random() < perfil.tanteo
        if tantea:
            # La primera respuesta riesgosa de la escena no se aplica: el juego pide reintentar. La segunda sí cuenta.
            primera = _elegir(opciones, (RIESGOSA, CONTRAINDICADA), azar)
            resultado = attempt_api.decide(estudiante, intento.pk, primera.pk, uuid.uuid4().hex)
            if not (resultado and resultado.get("retry_required")):
                decisiones += 1
                continue
        attempt_api.decide(estudiante, intento.pk, final.pk, uuid.uuid4().hex)
        decisiones += 1


def _fecha(dias_atras, hora):
    ahora = timezone.now()
    if timezone.is_aware(ahora):
        ahora = timezone.localtime(ahora)
    return (ahora - timedelta(days=dias_atras)).replace(hour=hora, minute=0, second=0, microsecond=0)


def _mover_al_pasado(sesion, intentos, inicio, minutos_por_intento, azar):
    """Lleva la sesión y sus intentos a ``inicio``, con eventos repartidos a lo largo del tiempo activo de cada uno."""
    real = sesion.iniciada_en
    delta = inicio - real
    duracion = timedelta(minutes=90)
    Sesion.objects.filter(pk=sesion.pk).update(
        inicio=inicio, fin=inicio + duracion, iniciada_en=inicio,
        finalizada_en=inicio + duracion if sesion.finalizada_en else None)
    CaseAssignment.objects.filter(case_version=sesion.case_version, opens_at=real).update(
        opens_at=inicio, closes_at=inicio + duracion)
    for intento in intentos:
        llegada = inicio + timedelta(minutes=azar.randint(2, 9), seconds=azar.randint(0, 59))
        minutos = minutos_por_intento[intento.pk]
        eventos = list(intento.events.order_by("occurred_at", "id"))
        paso = timedelta(minutes=minutos) / max(len(eventos), 1)
        for orden, evento in enumerate(eventos):
            AttemptEvent.objects.filter(pk=evento.pk).update(occurred_at=llegada + paso * orden)
        fin = llegada + timedelta(minutes=minutos)
        cerrado = intento.ended_at is not None
        SimulationAttempt.objects.filter(pk=intento.pk).update(
            started_at=llegada, last_activity_at=fin, active_seconds=minutos * 60,
            ended_at=fin if cerrado else None, locked_at=fin if intento.locked_at else None)
        ReflectionJournal.objects.filter(attempt=intento).update(created_at=F("created_at") + delta,
                                                                 updated_at=F("updated_at") + delta)
        AttemptReport.objects.filter(attempt=intento).update(created_at=fin)
        AttemptEvaluation.objects.filter(attempt=intento).update(created_at=fin)
        RubricEvaluation.objects.filter(attempt=intento).update(created_at=fin, updated_at=fin, evaluated_at=fin)


def _sesion_existente(grupo, version, lugar, estado):
    return Sesion.objects.filter(grupo=grupo, case_version=version, lugar=lugar, estado=estado).first()


def _crear_sesion(grupo, version, lugar, mensaje, inicio, fin):
    return sesiones.crear(grupo.profesor, {
        "grupoId": grupo.pk, "caseVersionId": version.pk, "inicio": inicio, "fin": fin,
        "tiempoMaximoMin": TIEMPO_MAXIMO_MIN, "lugar": lugar, "mensaje": mensaje})


def _jugar_sesion(datos, version, estudiantes, informe):
    codigo, dias, hora, lugar, mensaje, participantes = datos
    grupo = Grupo.objects.get(codigo=codigo)
    if _sesion_existente(grupo, version, lugar, EstadoSesion.FINALIZADA):
        informe.existente.append(f"sesión finalizada de {codigo} ({lugar})")
        return
    azar = random.Random(f"siembra-participaciones-{codigo}")
    ahora = timezone.now()
    sesion = _crear_sesion(grupo, version, lugar, mensaje, ahora, ahora + timedelta(hours=2))
    sesion = sesiones.iniciar(grupo.profesor, sesion.pk)
    intentos, minutos, perfiles = [], {}, {}
    for indice, perfil in participantes.items():
        estudiante = estudiantes[indice]
        if perfil is None:
            continue
        if perfil == "incompleto":
            intento = _jugar(estudiante, version, EN_PROCESO, azar, hasta=6)
            minutos[intento.pk] = azar.randint(18, 26)
        else:
            intento = _jugar(estudiante, version, perfil, azar)
            minutos[intento.pk] = azar.randint(*perfil.minutos)
            perfiles[intento.pk] = perfil
        intentos.append(intento)
    sesion = sesiones.finalizar(grupo.profesor, sesion.pk)
    for intento in intentos:
        intento.refresh_from_db()
    # La docente comenta la mitad de los intentos terminados (los de perfiles más distintos primero).
    terminados = [i for i in intentos if i.status == AttemptStatus.COMPLETED]
    for intento in terminados[::2]:
        evaluacion.registrar_retroalimentacion_docente(intento, grupo.profesor, RETROALIMENTACION[perfiles[intento.pk].nombre])
    _mover_al_pasado(sesion, intentos, _fecha(dias, hora), minutos, azar)
    incompletos = sum(i.status == AttemptStatus.INCOMPLETE for i in intentos)
    ausentes = sum(p is None for p in participantes.values())
    informe.creado.append(
        f"sesión FINALIZADA de {codigo} hace {dias} días: {len(terminados)} intentos completos, "
        f"{incompletos} sin terminar, {ausentes} ausente(s), {len(terminados[::2])} con retroalimentación")


def _programar(version, informe):
    codigo, dias, hora, lugar, mensaje = PROGRAMADA
    grupo = Grupo.objects.get(codigo=codigo)
    if _sesion_existente(grupo, version, lugar, EstadoSesion.PROGRAMADA):
        informe.existente.append(f"sesión programada de {codigo} ({lugar})")
        return
    inicio = _fecha(dias, hora)
    _crear_sesion(grupo, version, lugar, mensaje, inicio, inicio + timedelta(minutes=90))
    informe.creado.append(f"sesión PROGRAMADA de {codigo} en {-dias} días")


def docentes_por_defecto():
    """La docente demo de desarrollo (``seed_demo_users``), si existe: así quien entra con ella ve grupos y reportes."""
    existe = CustomUser.objects.filter(email=DOCENTE_DEMO, role=UserRole.PROFESOR, activo=True).exists()
    return [DOCENTE_DEMO] if existe else []


@transaction.atomic
def sembrar(publicador_correo, clave, correos_docentes=None):
    """Corre la siembra de demostración y le suma las sesiones jugadas. Devuelve el ``Informe`` de las dos.

    Los grupos quedan a cargo de ``correos_docentes`` (por defecto, la docente demo de desarrollo si existe): es quien
    crea y dirige las sesiones y quien ve sus reportes.
    """
    if correos_docentes is None:
        correos_docentes = docentes_por_defecto()
    informe = base.sembrar(publicador_correo, clave, correos_docentes)
    version = (CaseAssignment.objects.filter(grupo__codigo=base.GRUPOS[0][0], active=True)
               .select_related("case_version").latest("pk").case_version)
    correos = [f"{local}@{base.DOMINIO}" for local, _, _ in base.ESTUDIANTES]
    por_correo = {cuenta.email: cuenta for cuenta in CustomUser.objects.filter(email__in=correos)}
    estudiantes = [por_correo[correo] for correo in correos]
    for datos in SESIONES:
        _jugar_sesion(datos, version, estudiantes, informe)
    _programar(version, informe)
    return informe
