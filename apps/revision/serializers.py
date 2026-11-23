from rest_framework import serializers


class IntentoRecienteSerializer(serializers.Serializer):
    attemptId = serializers.UUIDField()
    studentAlias = serializers.CharField()
    caseTitle = serializers.CharField()
    status = serializers.CharField()
    startedAt = serializers.DateTimeField()
    caseVersionId = serializers.IntegerField()
    endedAt = serializers.DateTimeField(allow_null=True)
    evaluationStatus = serializers.CharField()


class CriterioValoracionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    competency = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField(allow_null=True, allow_blank=True)
    weight = serializers.FloatField()
    displayOrder = serializers.IntegerField()
    levelDescriptors = serializers.DictField(child=serializers.CharField())


class PuntajeValoracionSerializer(serializers.Serializer):
    criterionId = serializers.IntegerField()
    level = serializers.CharField()
    comment = serializers.CharField(allow_blank=True)
    evidence = serializers.DictField()


class OpcionNivelSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()
    descriptor = serializers.CharField()


class ValoracionSerializer(serializers.Serializer):
    attempt_id = serializers.UUIDField()
    attemptId = serializers.UUIDField()
    rubric_id = serializers.IntegerField()
    rubricId = serializers.IntegerField()
    rubric_name = serializers.CharField()
    rubricName = serializers.CharField()
    description = serializers.CharField(allow_null=True, allow_blank=True)
    status = serializers.CharField()
    items = serializers.ListField(child=serializers.DictField())
    criteria = CriterioValoracionSerializer(many=True)
    scores = PuntajeValoracionSerializer(many=True)
    levels = OpcionNivelSerializer(many=True)
    overallLevel = serializers.CharField(allow_null=True)
    origin = serializers.CharField(allow_null=True)
    general_observations = serializers.CharField(allow_blank=True)
    comment = serializers.CharField(allow_blank=True)


class GuardarValoracionSerializer(serializers.Serializer):
    scores = serializers.ListField(child=serializers.DictField(), required=False)
    items = serializers.ListField(child=serializers.DictField(), required=False)
    comment = serializers.CharField(required=False, allow_blank=True)
    general_observations = serializers.CharField(required=False, allow_blank=True)
    deliver = serializers.BooleanField(required=False)


class TrazaSerializer(serializers.Serializer):
    attemptId = serializers.UUIDField()
    studentAlias = serializers.CharField()
    caseTitle = serializers.CharField()
    caseVersionId = serializers.IntegerField()
    status = serializers.CharField()
    startedAt = serializers.DateTimeField()
    endedAt = serializers.DateTimeField(allow_null=True)
    counts = serializers.DictField()
    milestones = serializers.DictField()
    personaPorEscena = serializers.ListField()
    ending = serializers.JSONField(allow_null=True)
    retries = serializers.IntegerField()
    prohibitedRetries = serializers.IntegerField()
    safeExitUsed = serializers.BooleanField()
    totalDurationSeconds = serializers.IntegerField(allow_null=True)
    activeSeconds = serializers.IntegerField()
    timeline = serializers.ListField()
    visitedNodeTitles = serializers.ListField(child=serializers.CharField())
    events = serializers.ListField()
    world = serializers.JSONField(allow_null=True)
    reflections = serializers.ListField()
    rubricEvaluations = serializers.ListField()
    systemEvaluation = serializers.JSONField(allow_null=True)
    systemEvaluationAvailable = serializers.BooleanField()
    competenciesDeclared = serializers.BooleanField()
    evidenceByCompetency = serializers.ListField()


class ReemplazarIntentoSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class IntentoReemplazadoSerializer(serializers.Serializer):
    attemptId = serializers.UUIDField()
    status = serializers.CharField()
    reason = serializers.CharField()
    replacedAt = serializers.DateTimeField()
