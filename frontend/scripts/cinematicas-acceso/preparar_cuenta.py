"""Deja una base LOCAL lista para grabar las tomas del acceso (README.md de esta carpeta).

    GRABAR_CLAVE=… python manage.py shell < frontend/scripts/cinematicas-acceso/preparar_cuenta.py

Publica el caso insignia vigente, pone a la cuenta de grabación la contraseña dada (nunca se imprime) y le da por
terminados los casos anteriores para que el insignia quede abierto. Cambia datos: úsalo solo contra una base de pruebas.
"""

import os

from django.conf import settings
from django.utils import timezone

from apps.progression.access import catalog
from apps.progression.models import StudentCaseCompletion
from apps.publicacion import siembra_demostracion as siembra
from apps.simulation.models import CaseVersion
from apps.users.models import CustomUser


def preparar():
    clave = os.environ.get("GRABAR_CLAVE", "")
    if not clave:
        raise SystemExit("Falta GRABAR_CLAVE.")
    if not settings.DEBUG or settings.DATABASES["default"]["HOST"] not in ("127.0.0.1", "localhost"):
        raise SystemExit("Solo contra una base local en modo de depuración.")
    correo = os.environ.get("GRABAR_CORREO", "valentina.rios@demo.metafronesis.test")
    publicador = os.environ.get("GRABAR_PUBLICADOR", "admin.siembra@demo.metafronesis.test")
    siembra.sembrar(publicador, clave, ())
    cuenta = CustomUser.objects.get(email=correo)
    cuenta.set_password(clave)
    cuenta.must_change_password = False
    cuenta.save()
    for item in catalog(cuenta):
        if CaseVersion.objects.get(pk=item["case_version_id"]).simulation_case.code != "SIM-VBG-002":
            StudentCaseCompletion.objects.get_or_create(
                student_id=cuenta.pk, simulation_case_id=item["case_id"], defaults={"first_completed_at": timezone.now()}
            )
    abierto = any(
        item["allowed"] and CaseVersion.objects.get(pk=item["case_version_id"]).simulation_case.code == "SIM-VBG-002"
        for item in catalog(cuenta)
    )
    print("Cuenta lista para grabar." if abierto else "El caso insignia sigue cerrado para la cuenta: revisa la siembra.")


preparar()
