"""Crea los usuarios demo si la BD local no los tiene (la tabla la crea ``migrate``)."""
from django.core.management.base import BaseCommand

from apps.users.models import CustomUser, UserRole
from shared.dev_only import require_dev_environment

DEMO_USERS = [
    {
        "email": "admin@psychosim.edu.co",
        "password": "Admin123!",
        "nombre": "Admin",
        "apellido": "SIEP",
        "role": UserRole.ADMIN,
    },
    {
        "email": "profesora@psychosim.edu.co",
        "password": "Profesor123!",
        "nombre": "Profesora",
        "apellido": "Demo",
        "role": UserRole.PROFESOR,
    },
    {
        "email": "estudiante@psychosim.edu.co",
        "password": "Estudiante123!",
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

        self.stdout.write(self.style.SUCCESS(f"Listo. Usuarios nuevos: {created}"))
