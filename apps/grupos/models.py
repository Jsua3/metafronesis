"""Grupo, su membresía y las asignaciones de casos.

``grupo_estudiante`` no tiene id propio: su clave primaria es compuesta
(``CompositePrimaryKey``); es un modelo explícito y no un ``ManyToManyField`` para conservar
los nombres de tabla y de columna y poder guardar el estado de la membresía. Las asignaciones
de casos viven en ``case_assignments`` (E3-1)."""
from django.conf import settings
from django.db import models
from django.db.models.functions import Now


class Grupo(models.Model):
    nombre = models.CharField(max_length=255)
    codigo = models.CharField(max_length=50, unique=True)
    profesor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.DO_NOTHING,
        db_column="profesor_id",
        related_name="grupos_impartidos",
    )
    activo = models.BooleanField(default=True, db_default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grupos"

    def __str__(self):
        return f"{self.nombre} ({self.codigo})"


class MembershipStatus(models.TextChoices):
    """Estado de la membresía (E2-10): el estudiante pertenece al grupo solo si acepta."""

    INVITED = "INVITED"
    ACTIVE = "ACTIVE"
    DECLINED = "DECLINED"
    REMOVED = "REMOVED"


class GrupoEstudiante(models.Model):
    pk = models.CompositePrimaryKey("grupo_id", "estudiante_id")
    grupo = models.ForeignKey(Grupo, on_delete=models.CASCADE, db_column="grupo_id")
    estudiante = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_column="estudiante_id"
    )
    # ``db_default=ACTIVE``: las membresías anteriores a E2-10 (y los INSERT crudos de semillas
    # y pruebas) siguen siendo miembros. ``default=INVITED``: un alta por ORM sin estado es la
    # menos privilegiada (R6 del plan de fase E2).
    status = models.CharField(
        max_length=10, choices=MembershipStatus.choices,
        default=MembershipStatus.INVITED, db_default=MembershipStatus.ACTIVE,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_column="invited_by", related_name="+",
    )
    invited_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "grupo_estudiante"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=MembershipStatus.values),
                name="grupo_estudiante_status_check",
            ),
        ]
        indexes = [
            models.Index(fields=["estudiante", "status"], name="idx_grupo_est_student_status"),
        ]


class CaseAssignment(models.Model):
    """Una versión de caso asignada a un grupo **o** a un estudiante (E3-1, C7; RF-14, CU-06).

    Sustituye a ``grupo_case_version``: una sola tabla para los dos destinos, con ventana
    ``[opens_at, closes_at)`` en hora de Bogotá (naive: ``USE_TZ=False``), el orden de la
    secuencia (``sort_order``) y ``active`` (una asignación en pausa no habilita nada).
    La API crea hoy solo destino grupo (decisión 5: «grupo primero»); el destino estudiante ya
    existe en el esquema y en la decisión de acceso, sin nueva migración.
    """

    case_version = models.ForeignKey(
        "simulation.CaseVersion", on_delete=models.CASCADE, db_column="case_version_id",
        related_name="assignments",
    )
    grupo = models.ForeignKey(
        Grupo, on_delete=models.CASCADE, null=True, blank=True, db_column="grupo_id",
        related_name="assignments",
    )
    estudiante = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
        db_column="estudiante_id", related_name="direct_assignments",
    )
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    sort_order = models.IntegerField(default=0, db_default=0)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_column="assigned_by", related_name="+",
    )
    assigned_at = models.DateTimeField(null=True, db_default=Now())
    active = models.BooleanField(default=True, db_default=True)

    class Meta:
        db_table = "case_assignments"
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(grupo__isnull=False, estudiante__isnull=True)
                    | models.Q(grupo__isnull=True, estudiante__isnull=False)
                ),
                name="case_assignments_target_check",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(opens_at__isnull=True)
                    | models.Q(closes_at__isnull=True)
                    | models.Q(closes_at__gt=models.F("opens_at"))
                ),
                name="case_assignments_window_check",
            ),
            models.UniqueConstraint(
                fields=["grupo", "case_version"],
                condition=models.Q(grupo__isnull=False),
                name="uq_case_assignments_group_version",
            ),
            models.UniqueConstraint(
                fields=["estudiante", "case_version"],
                condition=models.Q(estudiante__isnull=False),
                name="uq_case_assignments_student_version",
            ),
        ]
        indexes = [
            models.Index(fields=["grupo", "active"], name="idx_case_assign_group"),
            models.Index(fields=["estudiante", "active"], name="idx_case_assign_student"),
            models.Index(fields=["case_version"], name="idx_case_assign_version"),
        ]
