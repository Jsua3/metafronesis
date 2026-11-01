"""Guarda de las siembras de demostración: solo corren en desarrollo (S5-4, SF-19).

``seed_demo_access``, ``seed_demo_users`` y ``bootstrap_dev_db`` se niegan a correr con los ajustes de
producción o con ``DATABASE_URL`` definido (la señal de una base de plataforma). ``seed_caso_pdf`` y
``seed_default_rubric`` no se niegan, pero solo crean la cuenta demo (con su clave pública) en desarrollo.
La excepción explícita ``SIEP_ALLOW_DEMO_SEED``, que solo el desarrollo documenta, anula las señales.
"""
import os

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import CommandError

ALLOW_ENV = "SIEP_ALLOW_DEMO_SEED"
_VALORES_QUE_ABREN = frozenset({"1", "true", "yes", "on"})


def _excepcion_activa():
    return os.environ.get(ALLOW_ENV, "").lower() in _VALORES_QUE_ABREN


def ajustes_en_uso():
    """El módulo de ajustes en uso (``psychosim.settings.production``…), o ``""`` si no se puede saber.

    ``settings.SETTINGS_MODULE`` vale ``None`` mientras haya un ``override_settings`` activo (Django lo declara así en
    ``UserSettingsHolder``: los ajustes ya no vienen de un módulo) y las pruebas lo activan en todas partes. Una guarda no
    puede lanzar ``AttributeError`` por eso: cae al módulo con el que arrancó el proceso (``DJANGO_SETTINGS_MODULE``).
    """
    return settings.SETTINGS_MODULE or os.environ.get("DJANGO_SETTINGS_MODULE", "")


def _motivos_de_no_desarrollo():
    """Señales de que no es desarrollo; lista vacía si lo es. No lanza nunca."""
    motivos = []
    try:
        ajustes = ajustes_en_uso()
        if not ajustes:
            # Sin saber qué ajustes rigen no se puede afirmar que sea desarrollo: cuenta como señal (cierra en falso).
            motivos.append("los ajustes no están configurados")
        elif ajustes.endswith(".production"):
            motivos.append("los ajustes son los de producción")
    except ImproperlyConfigured:
        # Sin ajustes no se puede afirmar que sea desarrollo: cuenta como señal (cierra en falso).
        motivos.append("los ajustes no están configurados")
    if os.environ.get("DATABASE_URL"):
        motivos.append("DATABASE_URL está definido (base de plataforma)")
    return motivos


def is_dev_environment() -> bool:
    """Indica si estas siembras pueden correr aquí: sin señales de plataforma, o con la excepción activa.

    No lanza nunca. Sirve para decidir qué se crea (la cuenta demo, por ejemplo), no para negarse.
    """
    return _excepcion_activa() or not _motivos_de_no_desarrollo()


def require_dev_environment(command_name):
    """Lanza ``CommandError`` si ``command_name`` no puede correr en este entorno.

    Se llama al principio de ``handle``, antes de tocar la base. El mensaje nombra el comando y el
    motivo, pero nunca imprime el valor de una variable de entorno.
    """
    if is_dev_environment():
        return
    # BORRADOR: mensaje de consola para el operador, pendiente de revisión. No nombra la excepción ni cómo saltarse la
    # guarda: quien lo lea en un entorno real la usaría. La excepción solo está documentada en el docstring y el README.
    raise CommandError(
        f"{command_name} se niega a correr: {' y '.join(_motivos_de_no_desarrollo())}. "
        "Las cuentas de demostración no se siembran aquí. Para el primer administrador de un entorno real usa "
        "`python manage.py create_admin` (ver docs/operacion/despliegue-railway.md)."
    )
