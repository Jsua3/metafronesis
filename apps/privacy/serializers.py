"""Formas del consentimiento al aviso de contenido (S3-2a, C12).

``ConsentAcceptRequest`` valida el cuerpo del POST. Las demás clases solo DESCRIBEN lo que el servidor responde (como
``apps/simulation/serializers/contracts.py``): ningún código serializa con ellas. Las comprueba, contra la respuesta real,
``apps/simulation/tests/test_openapi_matches_responses.py``; si una clave cambia, esa prueba falla hasta corregirla aquí, y
``test_openapi_contract`` exige regenerar los tipos de ``frontend/`` (``node scripts/openapi/generate-types.mjs``).
"""
from rest_framework import serializers

from apps.simulation.serializers.contracts import LOCAL_TIME

#: Cabe en ``consent_records.notice_version``.
NOTICE_VERSION_MAX = 40


class ConsentAcceptRequest(serializers.Serializer):
    """Cuerpo de `POST …/consent`: la versión del aviso que la persona vio."""

    noticeVersion = serializers.CharField(
        max_length=NOTICE_VERSION_MAX,
        help_text="La versión del aviso que el cliente mostró. Si no es la vigente en el servidor, 409 `NOTICE_VERSION_STALE`.",
    )


class ConsentStateSerializer(serializers.Serializer):
    """El consentimiento de la persona al aviso de contenido de una versión del caso (`GET …/consent`)."""

    required = serializers.BooleanField(help_text="Si el servidor exige el consentimiento para jugar (`SIEP_CONSENT_REQUIRED`).")
    noticeVersion = serializers.CharField(help_text="La versión VIGENTE del aviso en el servidor.")
    accepted = serializers.BooleanField(help_text="Si la persona tiene una aceptación vigente de esa versión del aviso.")
    acceptedAt = serializers.DateTimeField(allow_null=True, help_text=f"Nulo si no ha aceptado. {LOCAL_TIME}")


class ConsentRecordSerializer(serializers.Serializer):
    """La aceptación registrada (`POST …/consent`): 201 si es nueva y 200 si ya existía, con la misma forma."""

    caseVersionId = serializers.IntegerField()
    acceptedAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    noticeVersion = serializers.CharField(help_text="La versión del aviso que quedó aceptada.")


class ConsentWithdrawalSerializer(serializers.Serializer):
    """El retiro del consentimiento (`DELETE …/consent`). Idempotente: sin nada vigente responde 200 con `withdrawnAt` nulo."""

    caseVersionId = serializers.IntegerField()
    withdrawnAt = serializers.DateTimeField(allow_null=True, help_text=f"Nulo si no había nada vigente que retirar. {LOCAL_TIME}")


class ConsentNoticeErrorSerializer(serializers.Serializer):
    """El error de un aviso de otra versión (409 `NOTICE_VERSION_STALE`): el sobre de error con la versión vigente en la raíz.

    Es la forma real del 409 (sin `field`, que es de la validación de campos): por eso no extiende a `ErrorEnvelope`.
    """

    success = serializers.BooleanField(help_text="Siempre `false` en un error.")
    code = serializers.CharField(help_text="Estable: `NOTICE_VERSION_STALE`.")
    message = serializers.CharField()
    noticeVersion = serializers.CharField(help_text="La versión VIGENTE del aviso en el servidor.")
