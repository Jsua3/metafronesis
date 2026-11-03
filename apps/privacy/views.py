"""``/api/simulation/cases/{caseVersionId}/consent`` (C12): leer, aceptar y retirar el aviso de contenido (ETH-01).

Solo la persona estudiante (filas ``consent.read`` y ``consent.record`` de la matriz de políticas): el ADMIN y el docente no
juegan. Cada registro es de quien llama; nada del cuerpo ni de la ruta nombra a otra persona. La ruta no lleva limitador de
DRF (``api/simulation/`` no lo tiene por diseño): el único 429 posible es el tope de aceptaciones NUEVAS, que cuenta el
servicio (``consent_user``). Leer y retirar nunca dan 429.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.views import APIView

from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from . import consent_service
from .serializers import (
    ConsentAcceptRequest,
    ConsentNoticeErrorSerializer,
    ConsentRecordSerializer,
    ConsentStateSerializer,
    ConsentWithdrawalSerializer,
)


def _iso(moment):
    return moment.isoformat() if moment is not None else None


class ConsentView(APIView):
    """El consentimiento de la persona al aviso de contenido sensible de una versión del caso."""

    def get_permissions(self):
        action = "read" if self.request.method == "GET" else "record"
        return [policy_permission("consent", action)()]

    @extend_schema(responses={200: envelope_of(ConsentStateSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        """La versión vigente del aviso, si el servidor exige el consentimiento y si esta persona ya lo aceptó."""
        version = consent_service.reachable_version(request.user, case_version_id)
        state = consent_service.consent_state(request.user, version)
        return api_ok({
            "required": state.required,
            "noticeVersion": state.notice_version,
            "accepted": state.accepted,
            "acceptedAt": _iso(state.accepted_at),
        })

    @extend_schema(
        request=ConsentAcceptRequest,
        responses={
            200: envelope_of(ConsentRecordSerializer),
            201: envelope_of(ConsentRecordSerializer),
            **error_responses(400, 401, 403, 404),
            409: OpenApiResponse(
                ConsentNoticeErrorSerializer,
                description="El aviso que se envió no es el vigente (`NOTICE_VERSION_STALE`): trae la versión vigente.",
            ),
        },
    )
    def post(self, request, case_version_id):
        """Acepta el aviso. 201 si crea la aceptación y 200 si ya existía (idempotente: no deja otra fila)."""
        version = consent_service.reachable_version(request.user, case_version_id, to_accept=True)
        body = ConsentAcceptRequest(data=request.data)
        body.is_valid(raise_exception=True)
        record, created = consent_service.accept_content_notice(
            request.user, version, body.validated_data["noticeVersion"]
        )
        return api_ok(
            {
                "caseVersionId": version.id,
                "acceptedAt": _iso(record.accepted_at),
                "noticeVersion": record.notice_version,
            },
            http_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(responses={200: envelope_of(ConsentWithdrawalSerializer), **error_responses(401, 403, 404)})
    def delete(self, request, case_version_id):
        """Retira el consentimiento: impide seguir jugando ese caso y no borra lo hecho. Idempotente."""
        version = consent_service.reachable_version(request.user, case_version_id)
        withdrawn_at = consent_service.withdraw_content_notice(request.user, version)
        return api_ok({"caseVersionId": version.id, "withdrawnAt": _iso(withdrawn_at)})
