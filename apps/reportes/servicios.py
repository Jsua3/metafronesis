from django.shortcuts import get_object_or_404

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion
from apps.simulation.services.audit_service import auditable
from shared.policies import ADMIN

from .exportadores import exportador_para
from .filas import filas_de


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
