"""Crea los usuarios demo si la BD local no los tiene (la tabla la crea ``migrate``)."""
from django.core.management.base import BaseCommand

from apps.users.models import CustomUser, PermisoDeAutoria, UserRole
from shared.dev_only import require_dev_environment

#: Credenciales públicas SOLO de desarrollo: el comando se niega a correr fuera de un entorno de desarrollo
#: (``require_dev_environment``), así que no llegan a un despliegue.
DEMO_USERS = [
    {
        "email": "admin@psychosim.edu.co",
        "password": "Admin123!",  # NOSONAR
        "nombre": "Admin",
        "apellido": "SIEP",
        "role": UserRole.ADMIN,
    },
    {
        "email": "profesora@psychosim.edu.co",
        "password": "Profesor123!",  # NOSONAR
        "nombre": "Profesora",
        "apellido": "Demo",
        "role": UserRole.PROFESOR,
    },
    {
        "email": "estudiante@psychosim.edu.co",
        "password": "Estudiante123!",  # NOSONAR
        "nombre": "Estudiante",
        "apellido": "Demo",
        "role": UserRole.ESTUDIANTE,
    },
]


class Command(BaseCommand):
    help = "Siembra las credenciales demo de desarrollo."

    def handle(self, *args, **options):
        require_dev_environment("seed_demo_users")
        created = 0
        for spec in DEMO_USERS:
            if CustomUser.objects.filter(email=spec["email"]).exists():
                self.stdout.write(f"Ya existe: {spec['email']}")
                continue
            CustomUser.objects.create_user(**spec)
            created += 1
            self.stdout.write(self.style.SUCCESS(f"Creado: {spec['email']}"))

        admin = CustomUser.objects.get(email=DEMO_USERS[0]["email"])
        docente = CustomUser.objects.get(email=DEMO_USERS[1]["email"])
        if admin.role == UserRole.ADMIN and docente.role == UserRole.PROFESOR:
            PermisoDeAutoria.objects.get_or_create(docente=docente, defaults={"otorgado_por": admin})

        self.stdout.write(self.style.SUCCESS(f"Listo. Usuarios nuevos: {created}"))
