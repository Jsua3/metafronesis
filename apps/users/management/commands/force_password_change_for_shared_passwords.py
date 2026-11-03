"""Obliga a cambiar la contraseña a las cuentas que aún conservan una contraseña COMPARTIDA.

Antes de E2-9 la importación de estudiantes les daba a todos la misma contraseña (``Siep2026!`` o el
valor de ``IMPORTED_STUDENT_DEFAULT_PASSWORD``): quien conozca ese valor entra como cualquiera de
ellos. E2-9 quitó el valor por defecto y las cuentas nuevas nacen pendientes de aprobación, pero las
YA importadas siguen con esa clave. Este comando les marca ``must_change_password``: el primer inicio
las obliga a fijar una propia antes de cualquier otra orden (``apps.users.authentication``).

Se corre una vez en el despliegue, antes de abrir tráfico; es idempotente (solo toca las que aún no
están marcadas) y no imprime contraseñas.

    python manage.py force_password_change_for_shared_passwords --dry-run
    python manage.py force_password_change_for_shared_passwords
    python manage.py force_password_change_for_shared_passwords --password OtraClaveCompartida
    python manage.py force_password_change_for_shared_passwords --all-students   # sin comprobar claves
"""
import os

from django.contrib.auth import get_user_model
from django.contrib.auth import hashers
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.users.models import UserRole
from apps.users.services import account_service

#: La contraseña por defecto que tenía la importación antes de E2-9 (consta en el historial de Git).
LEGACY_DEFAULT_PASSWORD = "Siep2026!"
ENV_VARIABLE = "IMPORTED_STUDENT_DEFAULT_PASSWORD"


def known_shared_passwords(extra=()):
    """Las claves compartidas conocidas: la de antes, la del entorno y las que pase el operador."""
    passwords = [LEGACY_DEFAULT_PASSWORD]
    deployed = os.environ.get(ENV_VARIABLE, "")
    if deployed:
        passwords.append(deployed)
    passwords.extend(value for value in extra if value)
    return list(dict.fromkeys(passwords))


def _matches_any(user, passwords):
    """``True`` si alguna de ``passwords`` es la contraseña guardada. No escribe nada."""
    stored = user.password
    if stored.startswith("$2"):
        return any(user.check_password(candidate) for candidate in passwords)
    return any(hashers.check_password(candidate, stored) for candidate in passwords)


class Command(BaseCommand):
    help = (
        "Marca el cambio de contraseña obligatorio a las cuentas que conservan una contraseña "
        "compartida (la que daba la importación antes de E2-9)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            action="append",
            default=[],
            help="Otra contraseña compartida a buscar (repetible). Se suma a la de antes de E2-9 y "
            f"a la de la variable de entorno {ENV_VARIABLE}.",
        )
        parser.add_argument(
            "--all-students",
            action="store_true",
            help="Marca a TODOS los estudiantes con contraseña usable, sin comprobar cuál tienen "
            "(rápido en una tabla grande: no verifica hashes).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Solo cuenta las cuentas que marcaría; no escribe nada.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        passwords = known_shared_passwords(options["password"])
        everyone = options["all_students"]
        dry_run = options["dry_run"]

        candidates = (
            User.objects.filter(must_change_password=False)
            .only("id", "role", "password")
            .order_by("pk")
        )
        checked, flagged = 0, []
        for user in candidates.iterator(chunk_size=200):
            if not user.has_usable_password():
                continue  # pendientes de aprobación y cuentas sin clave: nada que invalidar
            checked += 1
            if (everyone and user.role == UserRole.ESTUDIANTE) or _matches_any(user, passwords):
                flagged.append(user.pk)

        if flagged and not dry_run:
            # S1-4 · marcar el cambio no basta: las sesiones abiertas con la clave compartida también se cierran.
            with transaction.atomic():
                User.objects.filter(pk__in=flagged).update(must_change_password=True)
                for user_id in flagged:
                    account_service.revoke_sessions(user_id)

        suffix = " (simulacro: no se escribió nada)" if dry_run else ""
        self.stdout.write(
            f"Cuentas revisadas: {checked}. "
            f"Marcadas para cambiar la contraseña: {len(flagged)}.{suffix}"
        )
