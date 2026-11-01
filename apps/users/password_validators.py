"""Validadores de contraseña propios (E2 · revisión de fase)."""
from django.core.exceptions import ValidationError


class MaximumLengthBytesValidator:
    """BCrypt solo admite 72 bytes: una contraseña más larga es un error de validación, no un 500.

    La tabla ``users`` guarda BCrypt crudo para seguir siendo compatible con Spring
    (``apps.users.models.CustomUser.set_password``); ``bcrypt`` 5 rechaza con ``ValueError`` lo que
    pase de 72 bytes. Se mide en bytes UTF-8: una letra con tilde o un emoji pesan más de uno.
    """

    def __init__(self, max_bytes=72):
        self.max_bytes = max_bytes

    def validate(self, password, user=None):
        if len((password or "").encode("utf-8")) > self.max_bytes:
            raise ValidationError(
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "La contraseña es demasiado larga: usa como máximo %(max)d caracteres "
                "(los acentos y los símbolos cuentan por más de uno).",
                code="password_too_long",
                params={"max": self.max_bytes},
            )

    def get_help_text(self):
        return f"Tu contraseña no puede superar los {self.max_bytes} caracteres."


def _forma(valor):
    """Forma comparable de un dato de la cuenta: sin espacios y sin distinguir mayúsculas (S1-5)."""
    return "".join(str(valor or "").split()).casefold()


def _formas_prohibidas(user):
    """Lo que la contraseña no puede ser: el correo, su parte local, el nombre, el apellido y sus combinaciones."""
    correo = str(getattr(user, "email", "") or "")
    nombre = _forma(getattr(user, "nombre", ""))
    apellido = _forma(getattr(user, "apellido", ""))
    formas = {_forma(correo), _forma(correo.partition("@")[0]), nombre, apellido, nombre + apellido, apellido + nombre}
    formas.discard("")
    return formas


class NotSimilarToAccountValidator:
    """S1-5 · la contraseña no puede ser IGUAL al correo, a su parte local, al nombre, al apellido, a «nombre+apellido»
    ni a «apellido+nombre». No distingue mayúsculas ni espacios. Sin cuenta (``user`` ``None``) no compara nada.

    ``user`` puede ser la cuenta o un objeto con ``email``, ``nombre`` y ``apellido``: un alta todavía no tiene cuenta, así
    que ``apps.users.serializers`` le pasa los datos que va a guardar.
    """

    def validate(self, password, user=None):
        if user is None:
            return
        clave = _forma(password)
        if clave and clave in _formas_prohibidas(user):
            raise ValidationError(
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "La contraseña no puede parecerse a tu correo, tu nombre ni tu apellido.",
                code="password_too_similar",
            )

    def get_help_text(self):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        return "Tu contraseña no puede ser igual a tu correo, tu nombre ni tu apellido."
