from django.conf import settings
from django.db import models


class Notificacion(models.Model):
    destinatario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificaciones")
    originador = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="notificaciones_originadas")
    tipo = models.CharField(max_length=40)
    titulo = models.CharField(max_length=200)
    cuerpo = models.TextField()
    leida = models.BooleanField(default=False)
    creada_en = models.DateTimeField(auto_now_add=True)
    correo_enviado = models.BooleanField(default=False)
    error_correo = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-creada_en", "-pk"]
