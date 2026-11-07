"""Checks de base de datos del proyecto (se ejecutan con ``migrate``).

``siep.E001``: la base trae el historial de migraciones anterior a E0-8. La baseline
regenerada reutiliza los nombres ``0001_initial``; sobre una base restaurada del volcado
antiguo ``migrate`` no instalaría nada y el código asumiría CHECK, UNIQUE y ``ON DELETE``
que esa base no tiene. Hay que recrearla.
"""
from django.core.checks import Error, Tags, register
from django.db import connections

#: Migraciones que solo existen en el historial anterior a E0-8.
LEGACY_MIGRATIONS = {
    ("users", "0002_initial"),
    ("users", "0002_accessrequest"),
    ("users", "0003_merge_0002_accessrequest_0002_initial"),
    ("users", "0004_alter_accessrequest_status"),
    ("grupos", "0002_grupo_case_version"),
    ("grupos", "0003_initial"),
    ("simulation", "0002_initial"),
    ("simulation", "0003_rubric_management"),
    ("simulation", "0004_simulationrubricassignment"),
}


@register(Tags.database)
def legacy_migration_history(app_configs, databases=None, **kwargs):
    errors = []
    for alias in databases or []:
        connection = connections[alias]
        try:
            with connection.cursor() as cursor:
                if "django_migrations" not in connection.introspection.table_names(cursor):
                    continue
                cursor.execute("SELECT app, name FROM django_migrations")
                applied = {(app, name) for app, name in cursor.fetchall()}
        except Exception:  # sin conexión: ya lo dirán los demás checks y migrate
            continue
        legacy = sorted(applied & LEGACY_MIGRATIONS)
        if legacy:
            names = ", ".join(f"{app}.{name}" for app, name in legacy)
            errors.append(
                Error(
                    f"La base «{alias}» trae el historial de migraciones anterior a E0-8 ({names}).",
                    hint=(
                        "Recréala: en desarrollo, `docker compose -p psico-project-v3 down -v`, "
                        "`npm run up` y `npm run db:bootstrap -- --yes` (haz antes el volcado si "
                        "necesitas conservar datos); en producción, una base nueva."
                    ),
                    id="siep.E001",
                )
            )
    return errors
