from django.contrib.auth.hashers import check_password, make_password
from django.db.models.functions import Lower
from django.utils.crypto import get_random_string

from shared.exceptions import ApiError
from .models import Convocatoria, EstadoConvocatoria, EstadoSesion

ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generar_codigo():
    codigo = get_random_string(8, allowed_chars=ALFABETO)
    return codigo, make_password(codigo)


def validar_codigo(email, codigo):
    convocatorias = Convocatoria.objects.select_related("estudiante", "sesion").alias(
        correo=Lower("estudiante__email")
    ).filter(correo=email.strip().lower(), estado=EstadoConvocatoria.ACTIVA).exclude(
        sesion__estado=EstadoSesion.FINALIZADA
    )
    for convocatoria in convocatorias:
        if check_password(codigo, convocatoria.codigo_hash):
            return convocatoria.estudiante, convocatoria
    raise ApiError("INVALID_CREDENTIALS", "Credenciales inválidas.", 401)
