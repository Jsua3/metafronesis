from django.shortcuts import get_object_or_404

from apps.grupos.models import Grupo
from apps.sesiones.models import Sesion
from apps.simulation.models import CaseVersion
from apps.simulation.services.audit_service import auditable
from shared.policies import ADMIN

from .exportadores import exportador_para
from .filas import filas_de, filas_de_sesion


@auditable('REPORT_EXPORTED', 'GRUPO', resource_id_param_index=1,
           context=lambda args, kwargs, result: {'groupId': args[1], 'caseVersionId': args[2]})
def reporte_de_grupo(docente, grupo_id, case_version_id, formato) -> tuple[bytes, str, str]:
    grupos = Grupo.objects.all()
    if docente.role != ADMIN:
        grupos = grupos.filter(profesor=docente)
    grupo = get_object_or_404(grupos, pk=grupo_id)
    version = get_object_or_404(CaseVersion, pk=case_version_id)
    exportador = exportador_para(formato)
    return exportador.contenido(filas_de(grupo, version)), exportador.tipo, f'reporte-grupo-{grupo_id}.{exportador.extension}'


@auditable('REPORT_EXPORTED', 'SESION', resource_id_param_index=1,
           context=lambda args, kwargs, result: {'sessionId': args[1]})
def reporte_de_sesion(docente, sesion_id, formato) -> tuple[bytes, str, str]:
    sesiones = Sesion.objects.select_related('case_version')
    if docente.role != ADMIN:
        sesiones = sesiones.filter(creada_por=docente)
    sesion = get_object_or_404(sesiones, pk=sesion_id)
    exportador = exportador_para(formato)
    return exportador.contenido(filas_de_sesion(sesion)), exportador.tipo, f'reporte-sesion-{sesion_id}.{exportador.extension}'
