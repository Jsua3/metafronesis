from rest_framework import serializers
from .models import SimulationCase, SimulationAttempt

class CaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationCase
        fields = ['id', 'code', 'title', 'description', 'active']

class AttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationAttempt
        fields = ['id', 'case_version', 'current_node', 'status', 'started_at', 'ended_at', 'active_seconds']

class StartRequest(serializers.Serializer):
    case_version_id = serializers.IntegerField(min_value=1)

class DecisionRequest(serializers.Serializer):
    decision_option_id = serializers.IntegerField(min_value=1)
    request_id = serializers.CharField(max_length=64)
