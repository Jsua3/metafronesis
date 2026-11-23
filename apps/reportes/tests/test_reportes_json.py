import json

import pytest
from django.test import override_settings
from rest_framework.test import APIClient
from drf_spectacular.generators import SchemaGenerator

from apps.grupos.models import GrupoEstudiante, MembershipStatus
from apps.simulation.models import AttemptReport, AuditLog, SimulationAttempt
from apps.users.models import CustomUser
from shared.contract_testing import assert_matches, response_schema
from shared.policies import ADMIN

from .test_reporte import datos


@pytest.mark.req('RF-25', 'RF-26', 'SIEP-33')
def test_contratos_y_datos_con_intentos(datos):
    intento = datos['viejo']
    AttemptReport.objects.create(attempt=intento, report_json={
        'caseTitle': 'Título congelado', 'status': 'COMPLETED', 'totalDurationSeconds': 42,
        'milestones': {'done': [{'key': 'cuidado'}]},
    })
    cliente = datos['cliente']
    tablero = cliente.get('/api/reportes/dashboard').data['data']
    assert tablero['simulacionesCompletadas'] == 1
    assert tablero['simulacionesEnProgreso'] == 1
    assert set(tablero['decisiones']) == {'recommended', 'acceptable', 'risky', 'contraindicated'}
    assert len(tablero['intentosRecientes']) == 2
    grupo = cliente.get(f"/api/reportes/grupo/{datos['grupo'].pk}", {'caseVersionId': datos['version'].pk}).data['data']
    assert grupo['simulacion']['totalIntentos'] == 2
    estudiantes = {persona['id']: persona for persona in grupo['simulacion']['estudiantes']}
    assert estudiantes[datos['estudiante'].pk]['hitosCumplidos'] == ['cuidado']
    assert estudiantes[datos['sin_intento'].pk]['estado'] == 'PENDIENTE'
    informe = cliente.get(f"/api/reportes/estudiante/{datos['estudiante'].pk}").data['data']
    assert informe['coverage'] == {'shown': 2, 'total': 2}
    congelado = next(fila for fila in informe['attempts'] if fila['attemptId'] == str(intento.pk))
    assert congelado['caseTitle'] == 'Título congelado'
    assert congelado['clockSeconds'] == 42
    assert congelado['ordinal'] == 1
    assert AuditLog.objects.filter(action='ANALYTICS_VIEWED').exists()
    assert AuditLog.objects.filter(action='REPORT_VIEWED').count() == 2


@pytest.mark.req('RF-25', 'RF-26')
def test_vacios_filtros_y_alcance(datos):
    cliente = datos['cliente']
    grupo = cliente.get(f"/api/reportes/grupo/{datos['grupo'].pk}").data['data']
    assert grupo == {'grupoId': datos['grupo'].pk, 'caseVersionId': None, 'simulacion': None}
    informe = cliente.get(f"/api/reportes/estudiante/{datos['sin_intento'].pk}").data['data']
    assert informe['attempts'] == []
    assert informe['coverage'] == {'shown': 0, 'total': 0}
    informe = cliente.get(f"/api/reportes/estudiante/{datos['estudiante'].pk}", {'limit': 1}).data['data']
    assert informe['coverage'] == {'shown': 1, 'total': 2}
    ajeno = APIClient()
    ajeno.force_authenticate(datos['otro'])
    assert ajeno.get('/api/reportes/dashboard').data['data']['intentosRecientes'] == []
    assert ajeno.get(f"/api/reportes/grupo/{datos['grupo'].pk}").status_code == 404
    assert ajeno.get(f"/api/reportes/estudiante/{datos['estudiante'].pk}").status_code == 404
    administrador = CustomUser.objects.create_user('admin-reportes@example.test', role=ADMIN)
    ajeno.force_authenticate(administrador)
    assert ajeno.get(f"/api/reportes/grupo/{datos['grupo'].pk}").status_code == 200
    assert ajeno.get(f"/api/reportes/estudiante/{datos['estudiante'].pk}").status_code == 200


@pytest.mark.req('RF-25', 'RF-26')
@pytest.mark.parametrize('ruta', ['/api/reportes/dashboard', '/api/reportes/grupo/1', '/api/reportes/estudiante/1'])
def test_roles_sin_acceso_reciben_sobre_de_error(datos, ruta):
    cliente = APIClient()
    anonimo = cliente.get(ruta)
    assert anonimo.status_code == 401
    assert anonimo.data['success'] is False
    cliente.force_authenticate(datos['estudiante'])
    respuesta = cliente.get(ruta)
    assert respuesta.status_code == 403
    assert set(('success', 'code', 'message')) <= respuesta.data.keys()


@pytest.mark.req('RF-25', 'RF-26', 'RNF-007')
def test_alcance_revocado_y_lecturas_denegadas_no_se_auditan(datos):
    GrupoEstudiante.objects.filter(grupo=datos['grupo'], estudiante=datos['estudiante']).update(status=MembershipStatus.REMOVED)
    cliente = datos['cliente']
    assert cliente.get(f"/api/reportes/estudiante/{datos['estudiante'].pk}").status_code == 404
    assert not AuditLog.objects.filter(action='REPORT_VIEWED').exists()
    assert cliente.get('/api/reportes/dashboard').data['data']['intentosRecientes'] == []


@pytest.mark.req('RF-25', 'RF-26', 'RNF-002')
def test_openapi_describe_las_respuestas(datos):
    esquema = SchemaGenerator().get_schema(request=None, public=True)
    rutas = [('/api/reportes/dashboard', '/api/reportes/dashboard'),
             ('/api/reportes/grupo/{grupo_id}', f"/api/reportes/grupo/{datos['grupo'].pk}?caseVersionId={datos['version'].pk}"),
             ('/api/reportes/estudiante/{estudiante_id}', f"/api/reportes/estudiante/{datos['estudiante'].pk}")]
    for ruta_esquema, ruta in rutas:
        respuesta = datos['cliente'].get(ruta)
        assert respuesta.status_code == 200
        assert_matches(respuesta.data, response_schema(esquema, ruta_esquema, 'GET'), esquema)


@pytest.mark.req('RF-25', 'RNF-002')
def test_cobertura_de_hitos_respeta_celda_minima_y_redondeo(datos):
    version = datos['version']
    version.rules = json.dumps({'milestones': [{'key': 'cuidado', 'label': 'Cuidado'}]})
    version.save(update_fields=['rules'])
    ruta = f"/api/reportes/grupo/{datos['grupo'].pk}?caseVersionId={version.pk}"
    for indice in range(20):
        estudiante = CustomUser.objects.create_user(f'cohorte{indice}@example.test')
        GrupoEstudiante.objects.create(grupo=datos['grupo'], estudiante=estudiante, status=MembershipStatus.ACTIVE)
        for numero in range(2):
            intento = SimulationAttempt.objects.create(
                student=estudiante, case_version=version, current_node=datos['nodo'], status='COMPLETED',
                attempt_token_hash=f'cohorte-{indice}-{numero}',
            )
            cumplidos = [{'key': 'cuidado'}] if indice < 2 or (indice == 2 and numero == 0) else []
            AttemptReport.objects.create(attempt=intento, report_json={'milestones': {'done': cumplidos}})
        if indice == 3:
            hito = datos['cliente'].get(ruta).data['data']['simulacion']['hitos'][0]
            assert hito['cobertura'] is None
            assert 'porcentaje' not in hito
    hito = datos['cliente'].get(ruta).data['data']['simulacion']['hitos'][0]
    assert hito['cobertura'] == 'MENOS_DE_LA_MITAD'
    assert hito['porcentaje'] == 13
    with override_settings(MIN_CELL_SIZE=21):
        hito = datos['cliente'].get(ruta).data['data']['simulacion']['hitos'][0]
        assert hito['cobertura'] is None
        assert 'porcentaje' not in hito
