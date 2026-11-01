from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken

from shared.plain_text import person_text_problem

from .google_verification import LONGITUD_MAXIMA
from .models import AccessRequest, AccessRequestStatus, UserRole
from .services import account_service

User = get_user_model()

COMMON_EMAIL_DOMAIN_FIXES = {
    "gamil.com": "gmail.com",
    "gmial.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gnail.com": "gmail.com",
    "hotmial.com": "hotmail.com",
    "hotmai.com": "hotmail.com",
    "outlok.com": "outlook.com",
}


def normalize_email_value(value):
    return (value or "").strip().lower()


def validate_common_email_domain(value):
    domain = value.rsplit("@", 1)[-1] if "@" in value else ""
    suggestion = COMMON_EMAIL_DOMAIN_FIXES.get(domain)
    if suggestion:
        raise serializers.ValidationError(
            f"El correo parece tener un dominio mal escrito: {domain}. Usa {suggestion}."
        )
    return value


def validate_new_password(value, user=None):
    """Aplica ``AUTH_PASSWORD_VALIDATORS`` (longitud mínima y contraseñas comunes, LS-16)."""
    try:
        password_validation.validate_password(value, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from None
    return value


def _cuenta_propuesta(datos, instance=None):
    """La cuenta tal como quedará tras guardar (S1-5): correo, nombre y apellido del formulario o, si no vienen, los de la
    cuenta actual. Así la clave se compara con lo que la cuenta va a ser, también en un alta (que aún no existe)."""

    def dato(campo):
        valor = datos.get(campo) if hasattr(datos, "get") else None
        if valor is None and instance is not None:
            valor = getattr(instance, campo, "")
        return "" if valor is None else str(valor)

    return SimpleNamespace(email=dato("email"), nombre=dato("nombre"), apellido=dato("apellido"))


class UserSummarySerializer(serializers.ModelSerializer):
    """Spring's UserSummary record {id, nombre, apellido, email, role} + ``mustChangePassword``."""

    mustChangePassword = serializers.BooleanField(source="must_change_password", read_only=True)

    class Meta:
        model = User
        fields = ["id", "nombre", "apellido", "email", "role", "mustChangePassword"]


class AdminUserSerializer(serializers.ModelSerializer):
    """User shape used by the administration screen."""

    mustChangePassword = serializers.BooleanField(source="must_change_password", read_only=True)
    pendingApproval = serializers.BooleanField(source="is_pending_approval", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "nombre", "apellido", "email", "role", "activo", "mustChangePassword", "pendingApproval",
        ]


class AdminUserWriteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    # Sin recorte: la clave se guarda y se compara tal cual (los espacios finales cuentan).
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, min_length=8, trim_whitespace=False
    )
    nombre = serializers.CharField(max_length=100)
    apellido = serializers.CharField(max_length=100)
    role = serializers.ChoiceField(choices=UserRole.choices)
    activo = serializers.BooleanField(required=False)

    def validate_email(self, value):
        value = validate_common_email_domain(normalize_email_value(value))
        qs = User.objects.filter(email=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("El email ya está registrado")
        return value

    def validate_nombre(self, value):
        return _nombre_de_persona(value)

    def validate_apellido(self, value):
        return _nombre_de_persona(value)

    def validate_password(self, value):
        return validate_new_password(value, _cuenta_propuesta(self.initial_data, self.instance)) if value else value

    def validate(self, attrs):
        password = attrs.get("password", "")
        if self.instance is None and not password:
            raise serializers.ValidationError("La contraseña es obligatoria al crear usuarios.")
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(password=None, **validated_data)
        # S1-5 · SF-21: la clave que pone un ADMIN es temporal (cambio obligatorio y fecha de caducidad), y se audita.
        return account_service.set_password_by_admin(user, password)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        previos = (instance.role, instance.activo)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            # S1-5 · SF-21: la clave que fija un ADMIN queda temporal y se audita con el actor (nunca con la clave).
            account_service.set_password_by_admin(instance, password)
        instance.save()
        # S1-4 · una contraseña fijada, un cambio de rol o de activo cierran las sesiones de la persona.
        if password or previos != (instance.role, instance.activo):
            account_service.revoke_sessions(instance.pk)
        if password:
            # S1-5 · la persona debe saberlo: el aviso sale al confirmarse el cambio (sin la clave ni enlaces).
            account_service.notify_admin_password_change(instance)
        return instance


class AdminUserStatusSerializer(serializers.Serializer):
    activo = serializers.BooleanField()


def generate_access_token(user):
    """Access token with the same claims Spring's JwtService emits:
    sub=email, userId=id, role=role (plus simplejwt's exp/iat/jti), y ep = época de sesión (S1-4)."""
    token = AccessToken.for_user(user)  # sets the USER_ID_CLAIM ("userId")
    # simplejwt >= 5.5 serializa el id como texto; Spring lo emitía numérico y el
    # frontend lo tipa como number: se conserva el contrato original.
    token[api_settings.USER_ID_CLAIM] = user.id
    token["role"] = user.role
    token["sub"] = user.email
    # S1-4 · época de sesión: ``SiepJWTAuthentication`` rechaza el token si la base la sube.
    token["ep"] = user.session_epoch
    return str(token)


class PsychoSimTokenObtainSerializer(TokenObtainPairSerializer):
    """Referenced by SIMPLE_JWT; keeps claim parity if the obtain view is used."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token[api_settings.USER_ID_CLAIM] = user.id
        token["role"] = user.role
        token["sub"] = user.email
        token["ep"] = user.session_epoch  # S1-4 · época de sesión
        return token


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    # Sin recorte (R1b): la clave con la que entra es la que se guardó, espacios finales incluidos.
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        return normalize_email_value(value)


class GoogleLoginSerializer(serializers.Serializer):
    # R1c · una credencial de Google no pasa de LONGITUD_MAXIMA: el 400 de validación llega antes de cualquier red.
    credential = serializers.CharField(write_only=True, max_length=LONGITUD_MAXIMA)


class ApproveUsersSerializer(serializers.Serializer):
    """Lote de cuentas pendientes por aprobar (E2-9)."""

    # Cada aprobación manda un correo con la fila bloqueada: el lote se acota (R16).
    userIds = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=100
    )


class ChangePasswordSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(write_only=True, trim_whitespace=False)
    newPassword = serializers.CharField(write_only=True, trim_whitespace=False)


def _nombre_de_persona(value):
    """S1-3 · nombre y apellido: texto plano de una línea, sin etiquetas ni enlaces (regla de casedef). R1b: además, sin
    invisibles ni dominios, y solo con letras y signos de nombre (``shared.plain_text.person_text_problem``)."""
    problema = person_text_problem(value, 100)
    if problema is not None:
        raise serializers.ValidationError(problema)
    return value.strip()


class AccessRequestCreateSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100)
    apellido = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    # S1-3 · campo trampa: una persona no lo ve. Si llega con texto, lo rellenó un bot (la vista lo descarta).
    website = serializers.CharField(required=False, allow_blank=True, max_length=200, write_only=True)

    def validate_nombre(self, value):
        return _nombre_de_persona(value)

    def validate_apellido(self, value):
        return _nombre_de_persona(value)

    def validate_email(self, value):
        return validate_common_email_domain(normalize_email_value(value))


class AccessRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessRequest
        fields = ["id", "nombre", "apellido", "email", "status", "created_at", "reviewed_at"]


class AccessRequestStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=AccessRequestStatus.choices)
