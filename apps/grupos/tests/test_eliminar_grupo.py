"""Eliminar un grupo con miembros y casos no depende del ``ON DELETE CASCADE`` de la BD.

Una base restaurada de un volcado anterior a E0-8 tiene las FK de ``grupo_estudiante`` y
``case_assignments`` en NO ACTION; el servicio borra las filas de unión por el ORM antes
de borrar el grupo para que ``DELETE /api/grupos/{id}`` siga funcionando allí.
"""
import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante

User = get_user_model()

pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-04")]


def _fk_sin_cascade(table, referenced):
    """Deja la FK de ``table`` hacia ``referenced`` como en un volcado antiguo: NO ACTION."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT c.conname, a.attname FROM pg_constraint c "
            "JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] "
            "WHERE c.contype = 'f' AND c.conrelid = %s::regclass AND c.confrelid = %s::regclass",
            [table, referenced],
        )
        name, column = cursor.fetchone()
        cursor.execute(f'ALTER TABLE {table} DROP CONSTRAINT "{name}"')
        cursor.execute(
            f'ALTER TABLE {table} ADD CONSTRAINT "{name}" '
            f"FOREIGN KEY ({column}) REFERENCES {referenced}(id)"
        )


def test_eliminar_un_grupo_con_miembros_y_casos_con_fk_en_no_action(caso_publicado):
    # Antes de insertar filas: PostgreSQL no deja alterar una tabla con eventos de FK pendientes.
    _fk_sin_cascade("grupo_estudiante", "grupos")
    _fk_sin_cascade("case_assignments", "grupos")
    profesor = User.objects.create_user(
        email="prof_elim@x.com", password="pass1234", nombre="P", apellido="E", role="PROFESOR"
    )
    estudiante = User.objects.create_user(
        email="est_elim@x.com", password="pass1234", nombre="E", apellido="S", role="ESTUDIANTE"
    )
    grupo = Grupo.objects.create(nombre="Para borrar", codigo="ELIM-1", profesor=profesor)
    GrupoEstudiante.objects.create(grupo_id=grupo.id, estudiante_id=estudiante.id, status="ACTIVE")
    CaseAssignment.objects.create(grupo_id=grupo.id, case_version_id=caso_publicado.id)
    client = APIClient()
    client.force_authenticate(user=profesor)

    response = client.delete(f"/api/grupos/{grupo.id}")

    assert response.status_code == 200, response.data
    assert not Grupo.objects.filter(pk=grupo.id).exists()
    assert not GrupoEstudiante.objects.filter(grupo_id=grupo.id).exists()
    assert not CaseAssignment.objects.filter(grupo_id=grupo.id).exists()
