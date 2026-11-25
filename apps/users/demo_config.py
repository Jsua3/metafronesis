"""Disponibilidad de la cuenta de estudiante de demostración, solo en desarrollo."""
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.security.throttling import LoginIpThrottle
from shared.dev_only import ajustes_en_uso, is_dev_environment
from shared.response import api_ok

User = get_user_model()


class DemoConfigView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginIpThrottle]

    def get(self, request):
        enabled = False
        # La excepción de siembra no habilita un acceso público en producción.
        if settings.DEBUG and not ajustes_en_uso().endswith('.production') and is_dev_environment():
            from .management.commands.seed_demo_users import DEMO_USERS

            student = next(spec for spec in DEMO_USERS if spec['role'] == 'ESTUDIANTE')
            user = User.objects.filter(email=student['email'], role='ESTUDIANTE', activo=True,
                                       must_change_password=False).first()
            enabled = bool(user and user.check_password(student['password']))
        response = api_ok({'enabled': enabled})
        response['Cache-Control'] = 'no-store'
        return response
