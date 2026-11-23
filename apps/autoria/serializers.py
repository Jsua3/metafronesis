from rest_framework import serializers
from apps.simulation.models.vocabulary import ResponseClass


class FichaSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=80, required=False)
    title = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    narrativeContext = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    learningObjectives = serializers.ListField(child=serializers.CharField(), required=False)
    estimatedMinutes = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    revision = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class CrearFichaSerializer(FichaSerializer):
    code = serializers.CharField(max_length=80)
    title = serializers.CharField(max_length=255)


class RevisionSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class EscenaSerializer(RevisionSerializer):
    key = serializers.CharField(max_length=120, required=False)
    title = serializers.CharField(max_length=255, required=False)
    narrative = serializers.CharField(required=False, allow_blank=True)
    question = serializers.CharField(required=False, allow_blank=True)
    start = serializers.BooleanField(required=False)
    terminal = serializers.BooleanField(required=False)
    order = serializers.IntegerField(required=False)


class CrearEscenaSerializer(EscenaSerializer):
    title = serializers.CharField(max_length=255)
    narrative = serializers.CharField(allow_blank=True)


class DecisionSerializer(RevisionSerializer):
    sourceNodeId = serializers.IntegerField(min_value=1, required=False)
    targetNodeId = serializers.IntegerField(min_value=1, required=False)
    text = serializers.CharField(required=False)
    responseClass = serializers.ChoiceField(choices=(ResponseClass.RECOMMENDED, ResponseClass.ACCEPTABLE, ResponseClass.RISKY, ResponseClass.CONTRAINDICATED), required=False)
    feedback = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    theoryBasis = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CrearDecisionSerializer(DecisionSerializer):
    sourceNodeId = serializers.IntegerField(min_value=1)
    targetNodeId = serializers.IntegerField(min_value=1)
    text = serializers.CharField()
    responseClass = serializers.ChoiceField(choices=(ResponseClass.RECOMMENDED, ResponseClass.ACCEPTABLE, ResponseClass.RISKY, ResponseClass.CONTRAINDICATED))

class ChecklistSerializer(RevisionSerializer):
    contentOriginal = serializers.BooleanField(required=False)
    ethicsReviewed = serializers.BooleanField(required=False)
    safetyProtocols = serializers.BooleanField(required=False)
    noStigmatizing = serializers.BooleanField(required=False)
    triggerWarnings = serializers.BooleanField(required=False)
    accessibilityOk = serializers.BooleanField(required=False)
    scopeEducational = serializers.BooleanField(required=False)


class VistaEditorSerializer(serializers.Serializer):
    caseVersionId = serializers.IntegerField()
    revision = serializers.IntegerField()
    title = serializers.CharField()
    semanticVersion = serializers.CharField()
    status = serializers.CharField()
    context = serializers.CharField(allow_blank=True)
    learningObjectives = serializers.ListField(child=serializers.CharField())
    contentWarnings = serializers.ListField(child=serializers.CharField())
    rules = serializers.DictField()
    nodes = serializers.ListField(child=serializers.DictField())
    decisions = serializers.ListField(child=serializers.DictField())
    maps = serializers.ListField(child=serializers.DictField())
    objects = serializers.ListField(child=serializers.DictField())
    tools = serializers.ListField(child=serializers.DictField())
    hints = serializers.ListField(child=serializers.DictField())
    characters = serializers.ListField(child=serializers.DictField())
    rubrics = serializers.ListField(child=serializers.DictField())
    checklistCompletion = serializers.IntegerField()
    publishable = serializers.BooleanField()
    checklist = serializers.DictField()


class PlanoSerializer(serializers.Serializer):
    plan = serializers.JSONField(allow_null=True)
