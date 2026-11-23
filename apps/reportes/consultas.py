"""Consultas de seguimiento para el docente y la administración."""

from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.grupos.alcance import estudiantes_de
from apps.grupos.models import Grupo, MembershipStatus
from apps.simulation.models import AttemptEvent, AttemptStatus, CaseVersion, ReflectionJournal, RubricEvaluation, SimulationAttempt
from apps.simulation.services import case_rules
from apps.users.models import CustomUser
from shared.identity import IdentityPresenter
from shared.policies import ADMIN, ESTUDIANTE

LIMITE_PREDETERMINADO = 50
LIMITE_MAXIMO = 200
LIMITE_RECIENTES = 10
CELDA_MINIMA = 5
CELDA_PORCENTAJE = 20
PORCENTAJE_COMPLETO = 100
UMBRAL_MAYORIA = 50
CLASES = ('recommended', 'acceptable', 'risky', 'contraindicated')


def celda_minima():
    try:
        return max(CELDA_MINIMA, int(getattr(settings, 'MIN_CELL_SIZE', CELDA_MINIMA)))
    except (TypeError, ValueError):
        return CELDA_MINIMA


def estudiantes_del_docente(usuario):
    return estudiantes_de(usuario)


def intentos_del_alcance(usuario):
    intentos = SimulationAttempt.objects.all()
    if usuario.role != ADMIN:
        intentos = intentos.filter(student_id__in=estudiantes_del_docente(usuario))
    return intentos


def conteos(intentos):
    resultado = dict.fromkeys(CLASES, 0)
    eventos = AttemptEvent.objects.filter(
        attempt__in=intentos, event_type__in=('DECISION_SELECTED', 'PROHIBITED_DECISION_SELECTED'),
        decision_option__isnull=False,
    ).values_list('decision_option__response_class', flat=True)
    for clase in eventos:
        clave = clase.lower()
        if clave in resultado:
            resultado[clave] += 1
    return resultado


def tablero(usuario):
    intentos = intentos_del_alcance(usuario)
    completados = intentos.filter(status=AttemptStatus.COMPLETED)
    hoy = completados.filter(ended_at__date=timezone.localdate() if timezone.is_aware(timezone.now()) else timezone.now().date()).count()
    recientes = [
        {'id': str(intento.pk), 'attemptId': str(intento.pk),
         'casoTitulo': intento.case_version.simulation_case.title,
         'estudiante': IdentityPresenter.display_name(intento.student),
         'studentAlias': IdentityPresenter.alias_for(intento.student_id, usuario), 'estado': intento.status}
        for intento in intentos.select_related('student', 'case_version__simulation_case').order_by('-started_at', '-id')[:LIMITE_RECIENTES]
    ]
    return {'estudiantesActivos': hoy, 'simulacionesCompletadasHoy': hoy,
            'simulacionesCompletadas': completados.count(),
            'simulacionesEnProgreso': intentos.filter(status=AttemptStatus.IN_PROGRESS).count(),
            'decisiones': conteos(intentos), 'ultimosIntentos': recientes, 'intentosRecientes': recientes}


def hitos_congelados(intento):
    informe = getattr(intento, 'reports', None)
    datos = informe.report_json if informe else None
    hitos = datos.get('milestones') if isinstance(datos, dict) else None
    cumplidos = hitos.get('done') if isinstance(hitos, dict) else None
    if not isinstance(cumplidos, list):
        return None
    return [hito['key'] for hito in cumplidos if isinstance(hito, dict) and isinstance(hito.get('key'), str)]


def reporte_grupo(usuario, grupo_id, version_id):
    grupos = Grupo.objects.all()
    if usuario.role != ADMIN:
        grupos = grupos.filter(profesor=usuario, activo=True)
    grupo = get_object_or_404(grupos, pk=grupo_id)
    resultado = {'grupoId': grupo.pk, 'caseVersionId': version_id, 'simulacion': None}
    if version_id is None:
        return resultado
    version = CaseVersion.objects.filter(pk=version_id).first()
    estudiantes = list(CustomUser.objects.filter(grupoestudiante__grupo=grupo, grupoestudiante__status=MembershipStatus.ACTIVE).order_by('nombre', 'apellido', 'id'))
    intentos = list(SimulationAttempt.objects.filter(student__in=estudiantes, case_version_id=version_id).select_related('reports').order_by('-started_at', '-id'))
    ids = [intento.pk for intento in intentos]
    salidas = set(AttemptEvent.objects.filter(attempt_id__in=ids, event_type='SAFE_EXIT_REQUESTED').values_list('attempt_id', flat=True))
    salidas.update(intento.pk for intento in intentos if intento.status == AttemptStatus.SAFE_EXITED)
    reflexiones = list(ReflectionJournal.objects.filter(attempt_id__in=ids).values_list('attempt_id', flat=True))
    rubricas = set(RubricEvaluation.objects.filter(attempt_id__in=ids, origin='DOCENTE').values_list('attempt_id', flat=True))
    clases_por_estudiante = {}
    eventos = AttemptEvent.objects.filter(attempt_id__in=ids, event_type__in=('DECISION_SELECTED', 'PROHIBITED_DECISION_SELECTED'), decision_option__isnull=False)
    for fila in eventos.values('attempt__student_id', 'decision_option__response_class').annotate(total=Count('id')):
        conteo = clases_por_estudiante.setdefault(fila['attempt__student_id'], dict.fromkeys(CLASES, 0))
        clase = fila['decision_option__response_class'].lower()
        if clase in conteo:
            conteo[clase] += fila['total']
    filas = []
    for estudiante in estudiantes if intentos else []:
        propios = [intento for intento in intentos if intento.student_id == estudiante.pk]
        estados = [intento.status for intento in propios]
        estado = next((etiqueta for codigo, etiqueta in ((AttemptStatus.IN_PROGRESS, 'EN_PROGRESO'), (AttemptStatus.PAUSED, 'EN_PAUSA'), (AttemptStatus.COMPLETED, 'COMPLETADO'), (AttemptStatus.SAFE_EXITED, 'SAFE_EXITED')) if codigo in estados), 'PENDIENTE')
        ids_propios = [intento.pk for intento in propios]
        cumplidos = next((hitos_congelados(intento) for intento in propios if intento.status == AttemptStatus.COMPLETED and hitos_congelados(intento) is not None), None)
        filas.append({'id': estudiante.pk, 'nombre': IdentityPresenter.display_name(estudiante), 'totalIntentos': len(propios),
                      'intentosCompletados': estados.count(AttemptStatus.COMPLETED), 'intentosEnProgreso': estados.count(AttemptStatus.IN_PROGRESS),
                      'intentosEnPausa': estados.count(AttemptStatus.PAUSED), 'intentosSalidaSegura': len(set(ids_propios) & salidas),
                      'clases': clases_por_estudiante.get(estudiante.pk, dict.fromkeys(CLASES, 0)), 'hitosCumplidos': cumplidos,
                      'bitacorasRegistradas': sum(identificador in ids_propios for identificador in reflexiones),
                      'rubricasAplicadas': len(set(ids_propios) & rubricas), 'estado': estado})
    registros = [(intento.student_id, hitos_congelados(intento)) for intento in intentos if intento.status == AttemptStatus.COMPLETED and hitos_congelados(intento) is not None]
    hitos = []
    for hito in case_rules.rules_of(version).milestones if version else ():
        fila = {'key': hito.key, 'label': hito.label, 'decisive': hito.decisive, 'cobertura': None}
        participantes = len({estudiante_id for estudiante_id, _ in registros})
        if participantes >= celda_minima():
            cumplimientos = sum(hito.key in cumplidos for _, cumplidos in registros)
            porcentaje = int((Decimal(PORCENTAJE_COMPLETO * cumplimientos) / len(registros)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
            fila['cobertura'] = 'MAYORIA' if PORCENTAJE_COMPLETO * cumplimientos >= UMBRAL_MAYORIA * len(registros) else 'MENOS_DE_LA_MITAD'
            if participantes >= CELDA_PORCENTAJE:
                fila['porcentaje'] = porcentaje
        hitos.append(fila)
    resultado['simulacion'] = {'totalIntentos': len(intentos), 'intentosCompletados': sum(intento.status == AttemptStatus.COMPLETED for intento in intentos),
        'intentosEnProgreso': sum(intento.status == AttemptStatus.IN_PROGRESS for intento in intentos),
        'intentosEnPausa': sum(intento.status == AttemptStatus.PAUSED for intento in intentos), 'intentosSalidaSegura': len(salidas),
        'hitos': hitos, 'bitacorasRegistradas': len(reflexiones), 'rubricasAplicadas': len(rubricas), 'estudiantes': filas}
    return resultado


def reporte_estudiante(usuario, estudiante_id, version_id, limite):
    estudiantes = CustomUser.objects.filter(role=ESTUDIANTE)
    if usuario.role != ADMIN:
        estudiantes = estudiantes.filter(pk__in=estudiantes_del_docente(usuario))
    estudiante = get_object_or_404(estudiantes, pk=estudiante_id)
    intentos = list(SimulationAttempt.objects.filter(student=estudiante).select_related('case_version__simulation_case', 'reports').order_by('started_at', 'id'))
    ordinales, por_caso = {}, {}
    for intento in intentos:
        caso_id = intento.case_version.simulation_case_id
        por_caso[caso_id] = por_caso.get(caso_id, 0) + 1
        ordinales[intento.pk] = por_caso[caso_id]
    visibles = [intento for intento in reversed(intentos) if version_id is None or intento.case_version_id == version_id]
    mostrados = visibles[:max(1, min(limite or LIMITE_PREDETERMINADO, LIMITE_MAXIMO))]
    filas = []
    for intento in mostrados:
        informe = getattr(intento, 'reports', None)
        congelado = informe.report_json if informe and isinstance(informe.report_json, dict) else {}
        duracion = int((intento.ended_at - intento.started_at).total_seconds()) if intento.ended_at else None
        filas.append({'attemptId': str(intento.pk), 'caseVersionId': intento.case_version_id,
                      'caseTitle': congelado.get('caseTitle', intento.case_version.simulation_case.title),
                      'status': congelado.get('status', intento.status), 'startedAt': intento.started_at.isoformat(),
                      'activeSeconds': round(intento.active_seconds or 0), 'clockSeconds': congelado.get('totalDurationSeconds', duracion),
                      'ordinal': ordinales[intento.pk]})
    return {'student': {'ref': IdentityPresenter.student_ref(estudiante.pk), 'displayName': IdentityPresenter.display_name(estudiante)},
            'attempts': filas, 'coverage': {'shown': len(filas), 'total': len(visibles)}}
