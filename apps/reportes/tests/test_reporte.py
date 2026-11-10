import csv
import io
import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import (
    AttemptEvent, CaseVersion, CriterionScore, EvaluationOrigin, Rubric,
    RubricCriterion, RubricEvaluation, SimulationAttempt, SimulationCase, SimulationNode,
)
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR


@pytest.fixture
def datos(db):
    docente = CustomUser.objects.create_user('docente@example.test', role=PROFESOR)
    otro = CustomUser.objects.create_user('otro@example.test', role=PROFESOR)
    estudiante = CustomUser.objects.create_user('uno@example.test', nombre='Ana', apellido='Paz')
    sin_intento = CustomUser.objects.create_user('dos@example.test', nombre='Luis', apellido='Sol')
    invitado = CustomUser.objects.create_user('invitado@example.test')
    grupo = Grupo.objects.create(nombre='Grupo', codigo='G', profesor=docente)
    for persona in (estudiante, sin_intento):
        GrupoEstudiante.objects.create(grupo=grupo, estudiante=persona, status=MembershipStatus.ACTIVE)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=invitado, status=MembershipStatus.INVITED)
    caso = SimulationCase.objects.create(code='R', title='Reporte', created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version='1.0.0', created_by=docente)
    nodo = SimulationNode.objects.create(case_version=version, node_key='inicio', title='Inicio', narrative='Inicio')
    viejo = SimulationAttempt.objects.create(student=estudiante, case_version=version, current_node=nodo, status='COMPLETED', attempt_token_hash='viejo')
    intento = SimulationAttempt.objects.create(student=estudiante, case_version=version, current_node=nodo, attempt_token_hash='nuevo')
    AttemptEvent.objects.create(attempt=intento, event_type='DECISION_SELECTED')
    AttemptEvent.objects.create(attempt=intento, event_type='DECISION_RETRY_REQUIRED')
    rubrica = Rubric.objects.create(name='Rúbrica', created_by=docente)
    criterio = RubricCriterion.objects.create(rubric=rubrica, competency='C', title='Criterio')
    sistema = RubricEvaluation.objects.create(attempt=intento, rubric=rubrica, origin=EvaluationOrigin.SISTEMA, total_score=Decimal('3.00'))
    CriterionScore.objects.create(rubric_evaluation=sistema, rubric_criterion=criterio, level='LOGRADO')
    RubricEvaluation.objects.create(attempt=intento, rubric=rubrica, instructor=docente, origin=EvaluationOrigin.DOCENTE, comment='Buen trabajo')
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return locals()


def descargar(datos, formato='csv', cliente=None, version=None):
    return (cliente or datos['cliente']).get(
        f"/api/reportes/grupo/{datos['grupo'].pk}/export",
        {'case_version_id': version or datos['version'].pk, 'formato': formato},
    )


@pytest.mark.req('SIEP-33')
def test_csv_trae_una_fila_por_estudiante_con_sin_intento(datos):
    respuesta = descargar(datos)
    assert respuesta.status_code == 200
    assert respuesta.content.startswith(b'\xef\xbb\xbf')
    assert 'attachment' in respuesta['Content-Disposition']
    filas = list(csv.DictReader(io.StringIO(respuesta.content.decode('utf-8-sig'))))
    assert len(filas) == 2
    por_correo = {fila['correo']: fila for fila in filas}
    assert por_correo['uno@example.test'] == {
        'estudiante': 'Ana Paz', 'correo': 'uno@example.test', 'estado': 'IN_PROGRESS',
        'nivel': 'LOGRADO', 'total': '3.00', 'avance': '1', 'retroalimentacion': 'Buen trabajo',
    }
    assert por_correo['dos@example.test']['estado'] == 'SIN_INTENTO'
    assert por_correo['dos@example.test']['avance'] == '0'


@pytest.mark.req('SIEP-33')
def test_json_mismo_contenido(datos):
    csv_filas = list(csv.DictReader(io.StringIO(descargar(datos).content.decode('utf-8-sig'))))
    respuesta = descargar(datos, 'json')
    assert respuesta.status_code == 200
    filas = json.loads(respuesta.content)
    assert [{k: '' if v is None else str(v) for k, v in fila.items()} for fila in filas] == csv_filas


@pytest.mark.req('SIEP-33')
def test_formato_desconocido_400(datos):
    respuesta = descargar(datos, 'pdf')
    assert respuesta.status_code == 400
    assert respuesta.data['code'] == 'FORMAT_UNSUPPORTED'


@pytest.mark.req('SIEP-33')
def test_grupo_ajeno_404(datos):
    cliente = APIClient()
    cliente.force_authenticate(datos['otro'])
    assert descargar(datos, cliente=cliente).status_code == 404
    cliente.force_authenticate(datos['estudiante'])
    assert descargar(datos, cliente=cliente).status_code == 403


@pytest.mark.req('SIEP-33')
def test_reporte_con_consultas_constantes(datos):
    with CaptureQueriesContext(connection) as antes:
        assert descargar(datos).status_code == 200
    for i in range(5):
        persona = CustomUser.objects.create_user(f'extra{i}@example.test', role=ESTUDIANTE)
        GrupoEstudiante.objects.create(grupo=datos['grupo'], estudiante=persona, status=MembershipStatus.ACTIVE)
        SimulationAttempt.objects.create(student=persona, case_version=datos['version'], current_node=datos['nodo'], attempt_token_hash=f'extra{i}')
    with CaptureQueriesContext(connection) as despues:
        assert descargar(datos).status_code == 200
    assert len(despues) == len(antes)


@pytest.mark.req('SIEP-33')
def test_retroalimentacion_mas_reciente_por_actualizacion(datos):
    anterior = RubricEvaluation.objects.get(attempt=datos['intento'], origin=EvaluationOrigin.DOCENTE)
    RubricEvaluation.objects.create(
        attempt=datos['intento'], rubric=datos['rubrica'], instructor=datos['otro'],
        origin=EvaluationOrigin.DOCENTE, comment='Comentario anterior',
    )
    anterior.comment = 'Comentario actualizado'
    anterior.updated_at = timezone.now() + timedelta(seconds=1)
    anterior.save(update_fields=['comment', 'updated_at'])
    filas = json.loads(descargar(datos, 'json').content)
    assert next(f for f in filas if f['correo'] == 'uno@example.test')['retroalimentacion'] == 'Comentario actualizado'
