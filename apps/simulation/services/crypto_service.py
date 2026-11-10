"""AES-GCM reflection encryption — byte-compatible with Spring's
ReflectionCryptoService (AES/GCM/NoPadding, 12-byte IV prepended, 128-bit tag,
key = SHA-256(secret)[:32], standard Base64).

S5-2 · Dos esquemas conviven, y los dos se LEEN siempre:

- ``local-aes-gcm-v1`` (heredado): la llave es SHA-256(REFLECTION_ENCRYPTION_KEY)[:32] y no hay datos asociados. Es la
  activa por defecto en desarrollo y pruebas, así que cifra igual que antes.
- Una llave versionada de ``REFLECTION_KEYS``: la llave es HKDF-SHA256 del secreto con ``info`` = ``siep.reflection.v2:``
  + id, y los datos asociados son ``reflection:<intento>:<nodo>``: un texto cifrado movido a otra fila no se descifra.

En los dos el formato es el mismo: base64 de IV (12 bytes) + texto cifrado + etiqueta (128 bits).
"""
import base64
import hashlib
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

_IV_BYTES = 12
LEGACY_KEY_REF = "local-aes-gcm-v1"
_HKDF_INFO = b"siep.reflection.v2:"


class UnknownKeyRef(ValueError):
    """La fila apunta a una llave que ya no está en REFLECTION_KEYS. El mensaje no lleva secretos ni texto."""


def _legacy_key():
    secret = settings.REFLECTION_ENCRYPTION_KEY.encode("utf-8")
    return hashlib.sha256(secret).digest()[:32]


def _keys():
    return getattr(settings, "REFLECTION_KEYS", None) or {}


def _active_key_ref():
    return getattr(settings, "REFLECTION_ACTIVE_KEY", "") or LEGACY_KEY_REF


def _versioned_key(key_ref):
    secret = _keys().get(key_ref)
    if secret is None:
        raise UnknownKeyRef("La llave de la fila no está en REFLECTION_KEYS.")
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=_HKDF_INFO + key_ref.encode("utf-8"),
    ).derive(secret.encode("utf-8"))


def _associated_data(attempt_id, node_id):
    if attempt_id is None or node_id is None:
        raise ValueError("Una llave versionada necesita el intento y el nodo como datos asociados.")
    return f"reflection:{attempt_id}:{node_id}".encode("utf-8")


def encrypt(plain_text: str, *, attempt_id=None, node_id=None, key_ref=None) -> str:
    ref = key_ref or _active_key_ref()
    iv = os.urandom(_IV_BYTES)
    if ref == LEGACY_KEY_REF:
        # AESGCM.encrypt returns ciphertext || 16-byte tag (same layout as Java GCM).
        ct = AESGCM(_legacy_key()).encrypt(iv, plain_text.encode("utf-8"), None)
    else:
        if ref not in _keys():
            raise ImproperlyConfigured("La llave de cifrado de reflexiones no está en REFLECTION_KEYS (valor no mostrado).")
        ct = AESGCM(_versioned_key(ref)).encrypt(
            iv, plain_text.encode("utf-8"), _associated_data(attempt_id, node_id)
        )
    return base64.b64encode(iv + ct).decode("ascii")


def decrypt(encrypted_text: str, *, key_ref=None, attempt_id=None, node_id=None) -> str:
    ref = key_ref or LEGACY_KEY_REF
    payload = base64.b64decode(encrypted_text)
    iv, ct = payload[:_IV_BYTES], payload[_IV_BYTES:]
    if ref == LEGACY_KEY_REF:
        plain = AESGCM(_legacy_key()).decrypt(iv, ct, None)
    else:
        plain = AESGCM(_versioned_key(ref)).decrypt(iv, ct, _associated_data(attempt_id, node_id))
    return plain.decode("utf-8")


def key_ref() -> str:
    """El id con el que se cifra hoy (``REFLECTION_ACTIVE_KEY``, por defecto la heredada): es lo que se guarda en la fila."""
    return _active_key_ref()
