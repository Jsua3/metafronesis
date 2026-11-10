"""E2 · Revisión de fase (hallazgo crítico): las cuentas ya importadas conservan la contraseña
compartida de antes de E2-9 (``Siep2026!`` o el valor de ``IMPORTED_STUDENT_DEFAULT_PASSWORD``).

El comando ``force_password_change_for_shared_passwords`` (idempotente, se corre en el
despliegue antes de abrir tráfico) les marca el cambio obligatorio: el primer inicio las
obliga a fijar una propia antes de cualquier otra orden.
"""
import io

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient

pytestmark = [pytest.mark.req("RNF-01"), pytest.mark.req("D-5"), pytest.mark.req("LS-16")]

User = get_user_model()
COMMAND = "force_password_change_for_shared_passwords"


def _student(email, password, **extra):
    return User.objects.create_user(
        email=email, password=password, nombre="Est", apellido="Udiante", role="ESTUDIANTE", **extra
    )


def _account(email, password, role, **extra):
    return User.objects.create_user(
        email=email, password=password, nombre="Do", apellido="Cente", role=role, **extra
    )


def _flagged_ids():
    return set(User.objects.filter(must_change_password=True).values_list("pk", flat=True))


def _run(*args):
    """Corre el comando y devuelve ``(salida, ids marcados por esta corrida)``.

    La BD de pruebas puede traer cuentas sembradas: los conteos se miden contra lo que había antes.
    """
    before = _flagged_ids()
    out = io.StringIO()
    call_command(COMMAND, *args, stdout=out)
    return out.getvalue(), _flagged_ids() - before


def test_only_accounts_with_a_known_shared_password_are_flagged(db):
    shared = _student("cmd_shared@x.com", "Siep2026!")
    own = _student("cmd_own@x.com", "Una-Clave-Propia-2026!")
    # Una credencial conocida lo es sea cual sea el rol.
    teacher = _account("cmd_teacher_known@x.com", "Siep2026!", "PROFESOR")

    output, flagged = _run()

    assert flagged == {shared.pk, teacher.pk}
    assert f"Marcadas para cambiar la contraseña: {len(flagged)}." in output


def test_the_flagged_account_is_forced_to_change_at_the_first_login(db):
    _student("cmd_forced@x.com", "Siep2026!")
    _run()

    login = APIClient().post(
        "/api/auth/login", {"email": "cmd_forced@x.com", "password": "Siep2026!"}, format="json"
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['token']}")

    assert login.status_code == 200
    assert login.data["data"]["user"]["mustChangePassword"] is True
    blocked = client.get("/api/simulation/cases")
    assert blocked.status_code == 403
    assert blocked.data["code"] == "PASSWORD_CHANGE_REQUIRED"


def test_extra_passwords_and_the_environment_variable_are_detected(db, monkeypatch):
    monkeypatch.setenv("IMPORTED_STUDENT_DEFAULT_PASSWORD", "Valor-Desplegado-9")
    deployed = _student("cmd_env@x.com", "Valor-Desplegado-9")
    extra = _student("cmd_extra@x.com", "Otra-Compartida-7")

    _, flagged = _run("--password", "Otra-Compartida-7")

    assert {deployed.pk, extra.pk} <= flagged


def test_all_students_option_flags_everyone_with_a_usable_password(db):
    first = _student("cmd_all1@x.com", "Clave-Uno-2026!")
    pending = _student("cmd_all2@x.com", None, activo=False)
    teacher = _account("cmd_teacher@x.com", "Clave-Docente-2026!", "PROFESOR")

    output, flagged = _run("--all-students")

    assert first.pk in flagged
    assert pending.pk not in flagged  # pendiente: sin contraseña usable
    assert teacher.pk not in flagged  # solo estudiantes, y esta no es compartida
    assert f"Marcadas para cambiar la contraseña: {len(flagged)}." in output
    assert User.objects.filter(pk__in=flagged).exclude(role="ESTUDIANTE").count() == 0


def test_dry_run_changes_nothing_and_a_second_run_is_idempotent(db):
    shared = _student("cmd_dry@x.com", "Siep2026!")

    output, flagged = _run("--dry-run")
    assert flagged == set()
    assert "Marcadas para cambiar la contraseña: 1." in output
    assert "simulacro" in output

    _, first_run = _run()
    _, second_run = _run()
    assert shared.pk in first_run
    assert second_run == set()
