"""Contadores del limitador compartido (S1-2, DJA-2).

Un contador por (alcance, clave, inicio de ventana). Vive en PostgreSQL y no en memoria porque Gunicorn
corre varios procesos: un caché por proceso dejaría que cada petición empezara a contar desde cero. La
clave es un hash (``key_hash``): ni el correo ni la dirección IP se guardan en claro.
"""
from django.db import models


class RateLimitBucket(models.Model):
    pk = models.CompositePrimaryKey("scope", "key_hash", "window_start")
    scope = models.CharField(max_length=40)
    key_hash = models.CharField(max_length=64)
    #: Segundos desde la época hasta el inicio de la ventana (sin zona horaria: ``USE_TZ = False``).
    window_start = models.BigIntegerField()
    count = models.PositiveIntegerField()

    class Meta:
        db_table = "rate_limit_buckets"
