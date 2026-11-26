"""P4: el contenido de muestra no supera la compuerta aunque se haya aceptado la IA."""
import json
import re
from pathlib import Path

import pytest
from apps.publicacion.arbol import arbol_de
from apps.publicacion.ciclo import enviar_a_revision
from shared.contenido_relleno import PATRONES_RELLENO, es_relleno
from shared.exceptions import ApiError

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('texto', [
    'Respuesta 1 de la persona profesional.',
    '  RESPUESTA  23 DE LA PERSONA PROFESIONAL… ',
    'Esta respuesta tiene consecuencias en el vínculo con la persona consultante.',
    'Escribe aquí tu respuesta.', '[retroalimentación]', 'Lorem ipsum dolor sit amet',
])
def test_patrones_compartidos(texto):
    assert es_relleno(texto)
    assert not es_relleno('¿Quieres que busquemos apoyo juntas?')


@pytest.mark.parametrize('campo,texto', [
    ('text', 'Respuesta 1 de la persona profesional.'),
    ('feedback_text', 'Esta respuesta tiene consecuencias en el vínculo con la persona consultante.'),
])
def test_relleno_aceptado_impide_enviar_y_se_resuelve_al_escribir(caso, campo, texto):
    opcion = caso['opciones'][0]
    setattr(opcion, campo, texto)
    opcion.ai_suggested = False
    opcion.save()
    problemas = arbol_de(caso['version']).problemas()
    assert any(p.code == 'CONTENT_PLACEHOLDER' and p.where.startswith(f'options/{opcion.pk}/') for p in problemas)
    with pytest.raises(ApiError):
        enviar_a_revision(caso['autor'], caso['version'].pk)
    caso['version'].refresh_from_db()
    assert caso['version'].status == 'DRAFT'
    setattr(opcion, campo, 'La escucha permite expresar sus necesidades antes de decidir el apoyo.')
    opcion.save()
    assert not any(p.code == 'CONTENT_PLACEHOLDER' for p in arbol_de(caso['version']).problemas())


def test_deshacer_aceptacion_restaura_marcas_con_revision(caso, settings):
    from apps.users.models import CustomUser, PermisoDeAutoria
    from shared.policies import ADMIN

    settings.REVISION_REQUIRED = True
    administrador = CustomUser.objects.create_user(email='admin-p4@example.test', role=ADMIN)
    PermisoDeAutoria.objects.create(docente=caso['autor'], otorgado_por=administrador)
    cliente, version = caso['cliente'], caso['version']
    for tipo, elemento in [('nodes', caso['inicio']), ('decisions', caso['opciones'][0])]:
        elemento.ai_suggested = True
        elemento.save(update_fields=['ai_suggested'])
        ruta = f'/api/authoring/cases/{version.pk}/{tipo}/{elemento.pk}'
        version.refresh_from_db()
        aceptado = cliente.post(f'{ruta}/accept-ai', {'revision': version.version}, format='json')
        assert aceptado.status_code == 200
        elemento.refresh_from_db()
        assert elemento.ai_suggested is False
        version.refresh_from_db()
        restaurado = cliente.put(ruta, {'revision': version.version, 'aiSuggested': True}, format='json')
        assert restaurado.status_code == 200
        elemento.refresh_from_db()
        assert elemento.ai_suggested is True


def test_contrato_patrones_frontend_y_backend():
    raiz = Path(__file__).resolve().parents[3]
    fuente = (raiz / 'frontend/src/app/features/autoria/modelo/relleno.ts').read_text(encoding='utf-8')
    declaracion = re.search(r'export const PATRONES_RELLENO: readonly string\[\] = (\[.*?\]);', fuente, re.S)
    assert declaracion, 'No se encontró la lista de patrones del editor'
    assert json.loads(declaracion.group(1)) == PATRONES_RELLENO
