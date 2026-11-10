from rest_framework import serializers


class FiltrosAuditoriaSerializer(serializers.Serializer):
    action = serializers.CharField(required=False, max_length=120)
    actorId = serializers.IntegerField(required=False, min_value=1, max_value=9223372036854775807)
    desde = serializers.DateField(required=False)
    hasta = serializers.DateField(required=False)
    page = serializers.IntegerField(required=False, min_value=1, max_value=1000000, default=1)
