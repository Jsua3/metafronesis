from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import FormParser, MultiPartParser

from django.utils import timezone

from apps.security.throttling import ImportUserThrottle
from apps.simulation.services import audit_service
from shared.exceptions import ApiError
from shared.openapi import ApiEnvelopeSerializer, envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_created, api_ok

from shared import policies

from . import assignment_service, lector_xlsx, memberships, services
from .contracts import AssignmentSerializer, InvitationSerializer, MembershipConflictEnvelopeSerializer
from .import_contract import STUDENT_IMPORT_TEMPLATE_FILENAME
from .serializers import (
    ActualizarGrupoSerializer,
    AgregarEstudianteSerializer,
    AsignarCasoSerializer,
    AssignmentCreateSerializer,
    AssignmentUpdateSerializer,
    CrearGrupoSerializer,
    ImportarEstudiantesSerializer,
)
from shared.policies import ADMIN


_CAN_LIST_GROUPS = policy_permission("group", "list")
_CAN_MANAGE_GROUP = policy_permission("group", "manage")
_CAN_INVITE = policy_permission("membership", "invite")
_CAN_LIST_ASSIGNMENTS = policy_permission("assignment", "list")
_CAN_MANAGE_ASSIGNMENTS = policy_permission("assignment", "manage")
_CAN_RESPOND = policy_permission("membership", "respond")


class GrupoListCreateView(APIView):
    def get_permissions(self):
        # ADMIN puede LISTAR todos los grupos activos; crear sigue siendo solo PROFESOR.
        if self.request.method == "GET":
            return [_CAN_LIST_GROUPS()]
        return [_CAN_MANAGE_GROUP()]

    def get(self, request):
        if request.user.role == ADMIN:
            return api_ok(services.listar_activos())
        return api_ok(services.listar_de_profesor(request.user.id))

    @extend_schema(responses={201: ApiEnvelopeSerializer})
    def post(self, request):
        ser = CrearGrupoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        dto = services.crear(ser.validated_data["nombre"], ser.validated_data["codigo"], request.user)
        return api_ok(dto, message="Grupo creado", http_status=201)


class GrupoDetailView(APIView):
    permission_classes = [policy_permission("group", "manage")]

    def put(self, request, pk):
        ser = ActualizarGrupoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        dto = services.actualizar(
            pk,
            ser.validated_data.get("nombre"),
            ser.validated_data.get("codigo"),
            request.user,
        )
        return api_ok(dto, message="Grupo actualizado")

    def patch(self, request, pk):
        return self.put(request, pk)

    def delete(self, request, pk):
        return api_ok(services.eliminar(pk, request.user), message="Grupo eliminado")


class GrupoEstudiantesView(APIView):
    def get_permissions(self):
        return [(_CAN_MANAGE_GROUP if self.request.method == "GET" else _CAN_INVITE)()]

    def get(self, request, pk):
        estudiantes = services.listar_estudiantes(pk, request.user)
        # S4-1 · nombres y correos de otras personas: queda quién los leyó y de qué grupo (cuántos, no cuáles).
        audit_service.record("GROUP_STUDENTS_VIEWED", "GRUPO", pk, {"groupId": pk, "count": len(estudiantes)})
        return api_ok(estudiantes)

    def post(self, request, pk):
        ser = AgregarEstudianteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        dto = services.agregar_estudiante(pk, ser.validated_data["email"], request.user)
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        # El mismo mensaje exista o no la cuenta: no se enumeran correos (D-14).
        return api_ok(
            dto, message="Si el correo es de un estudiante registrado, recibirá la invitación."
        )


class GrupoEstudianteDetailView(APIView):
    permission_classes = [policy_permission("group", "manage")]

    def delete(self, request, pk, estudiante_id):
        dto = services.quitar_estudiante(pk, estudiante_id, request.user)
        return api_ok(dto, message="Estudiante retirado")


class GrupoEstudiantesImportView(APIView):
    permission_classes = [policy_permission("group", "manage")]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ImportUserThrottle]

    def post(self, request, pk):
        ser = ImportarEstudiantesSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            dto = services.importar_estudiantes(pk, ser.validated_data["file"], request.user)
        except services.ImportValidationError as exc:
            return Response(
                {"success": False, "message": exc.result["message"], "data": exc.result},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return api_ok(dto, message=dto["message"])
        return api_ok(dto, message="Importación de estudiantes procesada")


class GrupoEstudiantesImportSpecView(APIView):
    permission_classes = [policy_permission("group", "manage")]

    def get(self, request):
        return api_ok(services.import_spec())


class GrupoEstudiantesImportTemplateView(APIView):
    permission_classes = [policy_permission("group", "manage")]

    @extend_schema(responses={(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"): OpenApiTypes.BINARY})
    def get(self, request):
        response = HttpResponse(
            lector_xlsx.student_import_template_bytes(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{STUDENT_IMPORT_TEMPLATE_FILENAME}"'
        return response


class GrupoCasosView(APIView):
    def get_permissions(self):
        # El ADMIN puede LISTAR las asignaciones de cualquier grupo; crearlas es del profesor.
        return [(_CAN_LIST_ASSIGNMENTS if self.request.method == "GET" else _CAN_MANAGE_ASSIGNMENTS)()]

    def get(self, request, pk):
        return api_ok(services.listar_casos_asignados(pk, request.user))

    def post(self, request, pk):
        ser = AsignarCasoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return api_ok(
            services.asignar_caso(pk, ser.validated_data["caseVersionId"], request.user),
            message="Caso asignado",
        )


class GrupoCasoDetailView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def delete(self, request, pk, case_version_id):
        return api_ok(
            services.quitar_caso(pk, case_version_id, request.user),
            message="Caso retirado",
        )


def _optional_int_param(request, name):
    """Un parámetro de consulta entero, o ``None`` si no vino; un valor malo es un 400 con su campo."""
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except ValueError:
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"{name} debe ser un número entero.",
            status.HTTP_400_BAD_REQUEST,
            field=name,
        ) from None


class AssignmentListCreateView(APIView):
    """GET|POST /api/assignments — C7: asignaciones de casos con ventana (E3-1)."""

    def get_permissions(self):
        return [(_CAN_LIST_ASSIGNMENTS if self.request.method == "GET" else _CAN_MANAGE_ASSIGNMENTS)()]

    @extend_schema(
        parameters=[
            OpenApiParameter("groupId", int, description="Solo las asignaciones de este grupo (el docente debe serlo)."),
            OpenApiParameter("caseVersionId", int, description="Solo las de esta versión de caso."),
        ],
        responses={200: envelope_of(AssignmentSerializer, many=True), **error_responses(400, 401, 403, 404)},
    )
    def get(self, request):
        rows = assignment_service.list_assignments(
            request.user,
            group_id=_optional_int_param(request, "groupId"),
            case_version_id=_optional_int_param(request, "caseVersionId"),
        )
        now = timezone.now()
        return api_ok([assignment_service.assignment_dto(row, now) for row in rows])

    @extend_schema(responses={201: envelope_of(AssignmentSerializer), **error_responses(400, 401, 403, 404)})
    def post(self, request):
        ser = AssignmentCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        row = assignment_service.create_assignment(request.user, ser.validated_data)
        return api_created(assignment_service.assignment_dto(row), message="Caso asignado")


class AssignmentDetailView(APIView):
    """PATCH|DELETE /api/assignments/{id} — cambia la ventana, el orden o la pausa; o la retira."""

    permission_classes = [_CAN_MANAGE_ASSIGNMENTS]

    def patch(self, request, assignment_id):
        ser = AssignmentUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        row = assignment_service.update_assignment(request.user, assignment_id, ser.validated_data)
        return api_ok(assignment_service.assignment_dto(row), message="Asignación actualizada")

    def delete(self, request, assignment_id):
        return api_ok(
            assignment_service.remove_assignment(request.user, assignment_id),
            message="Asignación retirada",
        )


class GrupoEstudianteActivarView(APIView):
    """POST /api/grupos/{id}/estudiantes/{estudiante_id}/activar — el ADMIN activa por el estudiante."""

    permission_classes = [_CAN_RESPOND]

    def post(self, request, pk, estudiante_id):
        if not policies.can(request.user, "membership", "respond", owner_id=estudiante_id):
            raise PermissionDenied("No tiene permiso para activar esta membresía")
        row = memberships.accept(pk, estudiante_id)
        return api_ok(memberships.invitation_view(row), message="Membresía activada")


#: C5 · Responder una invitación: la membresía como quedó (200) o por qué no se pudo (409, con el estado de hoy).
_ANSWER_INVITATION = extend_schema(
    responses={
        200: envelope_of(InvitationSerializer),
        409: OpenApiResponse(MembershipConflictEnvelopeSerializer, description="La membresía no está en el estado que esto exige."),
        **error_responses(401, 403, 404),
    }
)


class MeInvitationsView(APIView):
    """GET /api/me/invitations — C5: las invitaciones del estudiante a grupos."""

    permission_classes = [_CAN_RESPOND]

    @extend_schema(responses={200: envelope_of(InvitationSerializer, many=True), **error_responses(401, 403)})
    def get(self, request):
        return api_ok(memberships.invitations_of(request.user))


class MeInvitationAcceptView(APIView):
    permission_classes = [_CAN_RESPOND]

    @_ANSWER_INVITATION
    def post(self, request, group_id):
        row = memberships.accept(group_id, request.user.id)
        return api_ok(memberships.invitation_view(row), message="Invitación aceptada")


class MeInvitationDeclineView(APIView):
    permission_classes = [_CAN_RESPOND]

    @_ANSWER_INVITATION
    def post(self, request, group_id):
        row = memberships.decline(group_id, request.user.id)
        return api_ok(memberships.invitation_view(row), message="Invitación rechazada")


class MeInvitationLeaveView(APIView):
    """POST /api/me/invitations/{groupId}/leave — el estudiante deja un grupo del que es miembro."""

    permission_classes = [_CAN_RESPOND]

    @_ANSWER_INVITATION
    def post(self, request, group_id):
        row = memberships.leave(group_id, request.user.id)
        return api_ok(memberships.invitation_view(row), message="Saliste del grupo")
