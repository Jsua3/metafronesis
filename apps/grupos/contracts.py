"""Formas documentadas de las respuestas de asignaciones y de acceso (E5-9, reparación).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. Cada una la
prueba ``apps/simulation/tests/test_openapi_matches_responses.py`` contra la respuesta real del endpoint.
"""
from rest_framework import serializers

from shared.openapi import ErrorEnvelopeSerializer

from .access import REASONS as ACCESS_REASONS
from .models import MembershipStatus

ASSIGNMENT_STATES = ("SCHEDULED", "OPEN", "CLOSED")
ASSIGNMENT_TARGETS = ("GROUP", "STUDENT")

#: Las ventanas de asignación viajan con el desfase de Bogotá explícito (a diferencia del resto de fechas de la API).
WINDOW = "ISO 8601 con el desfase de Bogotá (-05:00)."


class AccessDecisionSerializer(serializers.Serializer):
    """La decisión de acceso del estudiante a una versión de caso: si puede empezar y, si no, por qué."""

    allowed = serializers.BooleanField()
    reason = serializers.ChoiceField(choices=ACCESS_REASONS, required=False, help_text="Solo si `allowed` es falso.")
    opensAt = serializers.DateTimeField(required=False, help_text=f"Apertura de la ventana. {WINDOW}")
    closesAt = serializers.DateTimeField(required=False, help_text=f"Cierre de la ventana. {WINDOW}")


class AssignmentTargetSerializer(serializers.Serializer):
    """A quién se asignó el caso: a un grupo o, directamente, a un estudiante."""

    type = serializers.ChoiceField(choices=ASSIGNMENT_TARGETS)
    groupId = serializers.IntegerField(required=False, help_text="Solo si `type` es `GROUP`.")
    studentId = serializers.IntegerField(required=False, help_text="Solo si `type` es `STUDENT`.")


class AssignmentSerializer(serializers.Serializer):
    """Una versión de caso asignada, con su ventana de apertura y cierre (C7)."""

    id = serializers.IntegerField()
    caseVersionId = serializers.IntegerField()
    target = AssignmentTargetSerializer()
    state = serializers.ChoiceField(choices=ASSIGNMENT_STATES, help_text="Dónde está la ventana hoy.")
    active = serializers.BooleanField(help_text="Una asignación en pausa no habilita nada.")
    sortOrder = serializers.IntegerField(help_text="Su lugar en la secuencia de casos.")
    opensAt = serializers.DateTimeField(required=False, help_text=f"Si no hay fecha, no viaja. {WINDOW}")
    closesAt = serializers.DateTimeField(required=False, help_text=f"Si no hay fecha, no viaja. {WINDOW}")


# ─── Invitaciones del estudiante (C5) ──────────────────────────────────────────
class InvitationSerializer(serializers.Serializer):
    """La membresía del estudiante en un grupo: pendiente de respuesta, aceptada o rechazada.

    El listado no trae las retiradas (`REMOVED`), pero la respuesta de `leave` (y la de aceptar o rechazar) sí devuelve
    la membresía tal como quedó, también con ese estado."""

    id = serializers.IntegerField(help_text="Igual a `groupId`: la membresía es `(grupo, estudiante)`.")
    groupId = serializers.IntegerField()
    groupName = serializers.CharField()
    teacherName = serializers.CharField(help_text="Nombre completo del docente del grupo, quien invita.")
    invitedAt = serializers.DateTimeField(
        allow_null=True,
        help_text="Hora local del servidor (America/Bogota), sin zona. Nula en las membresías anteriores a las invitaciones.",
    )
    status = serializers.ChoiceField(choices=MembershipStatus.choices)


class MembershipConflictEnvelopeSerializer(ErrorEnvelopeSerializer):
    """El 409 de responder una invitación (`MEMBERSHIP_NOT_INVITED`, `MEMBERSHIP_NOT_ACTIVE`): trae el estado de hoy."""

    status = serializers.ChoiceField(choices=MembershipStatus.choices, help_text="El estado en que está la membresía hoy.")
