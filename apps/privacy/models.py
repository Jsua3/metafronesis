"""La evidencia de que una persona vio y aceptó un aviso (S3-2, C12; ETH-01, SIEP-RF-05, RNF-010).

SIEP trata casos de violencia con estudiantes: antes de jugar, la persona ve un aviso de contenido sensible. Hasta ahora esa
aceptación vivía solo en el navegador (``sessionStorage``); el servidor no tenía evidencia de que el aviso se mostró ni de que
se aceptó. Cada fila de ``consent_records`` es una aceptación:

- ``CONTENT_NOTICE``: el aviso de contenido de UNA versión del caso, en una versión concreta del aviso (``notice_version``).
- ``DATA_TREATMENT``: la autorización de tratamiento de datos, sin caso (el texto y su versión los entrega la institución).

Una aceptación no se borra ni se edita: se RETIRA (``withdrawn_at``) y, si la persona vuelve a aceptar, nace una fila nueva.
Así lo hecho queda como evidencia. La base impone que no haya dos aceptaciones vigentes iguales (los nulos cuentan como
iguales, para que ``DATA_TREATMENT`` sin caso también choque) y que un aviso de contenido siempre lleve su caso.

No hay clave foránea desde ``simulation`` hacia esta tabla (evita el ciclo): el simulador pregunta a
``apps.privacy.consent_service``.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class ConsentType(models.TextChoices):
    CONTENT_NOTICE = "CONTENT_NOTICE"
    DATA_TREATMENT = "DATA_TREATMENT"


class ConsentRecord(models.Model):
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="person_id", related_name="+"
    )
    consent_type = models.CharField(max_length=20, choices=ConsentType.choices)
    #: La versión del caso a la que se refiere el aviso; nula solo en ``DATA_TREATMENT``. ``DO_NOTHING`` y no ``PROTECT``:
    #: Django 6.1 no deja mezclar un ``on_delete`` de Python con los de base de datos (``DB_CASCADE``) que ya usa
    #: ``CaseVersion`` (fields.E323). La base impone ``NO ACTION``, que impide borrar una versión con aceptaciones (igual
    #: que con sus intentos): lo hecho queda como evidencia.
    case_version = models.ForeignKey(
        "simulation.CaseVersion", on_delete=models.DO_NOTHING, null=True, blank=True, db_column="case_version_id",
        related_name="+",
    )
    #: La versión del aviso que la persona vio (la vigente en el servidor cuando aceptó).
    notice_version = models.CharField(max_length=40)
    accepted_at = models.DateTimeField(default=timezone.now)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "consent_records"
        constraints = [
            # Un solo registro VIGENTE por (persona, tipo, caso, versión del aviso). ``nulls_distinct=False``: el caso nulo de
            # ``DATA_TREATMENT`` cuenta como igual, si no el índice dejaría pasar todos los duplicados.
            models.UniqueConstraint(
                fields=["person", "consent_type", "case_version", "notice_version"],
                condition=models.Q(withdrawn_at__isnull=True),
                nulls_distinct=False,
                name="uq_consent_records_active_per_notice",
            ),
            models.CheckConstraint(
                condition=models.Q(consent_type__in=ConsentType.values), name="consent_records_type_check"
            ),
            # Un aviso de contenido sin caso no prueba nada.
            models.CheckConstraint(
                condition=~models.Q(consent_type=ConsentType.CONTENT_NOTICE) | models.Q(case_version__isnull=False),
                name="consent_records_notice_needs_case_check",
            ),
        ]
        indexes = [
            models.Index(fields=["person", "case_version"], name="idx_consent_person_case"),
        ]
