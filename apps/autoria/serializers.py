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
