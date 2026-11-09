from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import SimulationCase
from .serializers_s3 import (
    CaseSerializer,
    AttemptSerializer,
    StartRequest,
    DecisionRequest,
)
from .services.access import available_versions
from .services import attempt_api
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR


def author(user):
    return getattr(user, "role", "") in (ADMIN, PROFESOR)


class Cases(APIView):
    def get(self, request):
        qs = SimulationCase.objects.all()
        if not author(request.user):
            qs = qs.filter(versions__in=available_versions(request.user)).distinct()
        elif request.user.role != ADMIN:
            qs = qs.filter(created_by=request.user)
        return Response(CaseSerializer(qs.order_by("id"), many=True).data)

    def post(self, request):
        if not author(request.user):
            raise PermissionDenied()
        serializer = CaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save(created_by=request.user)
        except IntegrityError:
            raise ValidationError("El código del caso ya existe.")
        return Response(serializer.data, status=201)


class CaseDetail(APIView):
    def get(self, request, pk):
        qs = SimulationCase.objects.all()
        if not author(request.user):
            qs = qs.filter(versions__in=available_versions(request.user))
        elif request.user.role != ADMIN:
            qs = qs.filter(created_by=request.user)
        return Response(CaseSerializer(get_object_or_404(qs, pk=pk)).data)


class Attempts(APIView):
    def post(self, request):
        if getattr(request.user, "role", "") != ESTUDIANTE:
            raise PermissionDenied()
        body = StartRequest(data=request.data)
        body.is_valid(raise_exception=True)
        attempt, created = attempt_api.start(
            request.user, body.validated_data["case_version_id"]
        )
        return Response(AttemptSerializer(attempt).data, status=201 if created else 200)


class AttemptDetail(APIView):
    def get(self, request, pk):
        return Response(AttemptSerializer(attempt_api.owned(request.user, pk)).data)


class AttemptTransition(APIView):
    def post(self, request, pk, action):
        return Response(
            AttemptSerializer(attempt_api.transition(request.user, pk, action)).data
        )


class Decision(APIView):
    def post(self, request, pk):
        body = DecisionRequest(data=request.data)
        body.is_valid(raise_exception=True)
        return Response(
            attempt_api.decide(
                request.user,
                pk,
                body.validated_data["decision_option_id"],
                body.validated_data["request_id"],
            )
        )


class Catalog(APIView):
    def get(self, request):
        from apps.progression.access import catalog

        if getattr(request.user, "role", None) != ESTUDIANTE:
            raise PermissionDenied()
        return Response(catalog(request.user))


class Evaluation(APIView):
    def get(self, request, pk):
        from .models import AttemptEvaluation

        attempt = attempt_api.owned(request.user, pk)
        evaluation = get_object_or_404(AttemptEvaluation, attempt=attempt)
        return Response(evaluation.snapshot)
