"""Carga solo el modelo de usuario de S1 para verificar el corte S3 local."""

from django.apps import AppConfig


class S3UsersConfig(AppConfig):
    name = "apps.users"
    label = "users"
