"""Los settings de producción que el despliegue necesita (E0-3, revisión de fase)."""
import importlib
import runpy
import secrets
import string
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

from psychosim.settings import base as base_settings

pytestmark = pytest.mark.req("RNF-06")

BACKEND = Path(__file__).resolve().parents[2]
RAIZ = Path(__file__).resolve().parents[3]

BASE_ENV = {
    # S5-1: las llaves de prueba se generan en cada ejecución; ninguna es un literal.
    "DJANGO_SECRET_KEY": secrets.token_urlsafe(48),
    "DJANGO_ALLOWED_HOSTS": "siep.example.edu.co",
    "DATABASE_URL": "postgres://usuario:clave@bd.example:5432/siep",
    # S5-3: la llave que firma las sesiones es obligatoria y propia (distinta de las demás).
    "JWT_SIGNING_KEY": secrets.token_urlsafe(48),
    "REFLECTION_ENCRYPTION_KEY": secrets.token_urlsafe(32),
    # S5-2: la llave activa es versionada y su secreto cumple las reglas de S5-1 (generado en cada ejecución).
    "REFLECTION_ACTIVE_KEY": "k1",
    "REFLECTION_KEYS": f"k1={secrets.token_urlsafe(48)}",
    # E2-12: el correo de producción es real y el aviso de solicitudes tiene destino.
    "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
    "ACCESS_REQUEST_NOTIFY_EMAILS": "admin@siep.example.edu.co",
    # S1-1: proxies de confianza delante de Django; producción la exige (sin valor por defecto).
    "SIEP_TRUSTED_PROXIES": "1",
}


@pytest.fixture(autouse=True)
def _restore_base_settings(monkeypatch):
    """``production`` hace ``from .base import *``: se recarga ``base`` con el entorno de la prueba y, al terminar,
    se deshace ese entorno ANTES de recargarlo (un SIEP_TRUSTED_PROXIES no numérico haría fallar la recarga)."""
    yield
    monkeypatch.undo()
    importlib.reload(base_settings)


def _production(monkeypatch, *, recargar_base=True, **overrides):
    env = {**BASE_ENV, **overrides}
    for name in (
        "RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_PUBLIC_DOMAIN",
        "DJANGO_ALLOWED_HOSTS", "DATABASE_URL", "EMAIL_BACKEND",
        "ACCESS_REQUEST_NOTIFY_EMAILS", "ACCESS_REQUEST_NOTIFY_DISABLED", "SIEP_ALLOW_CONSOLE_EMAIL",
        "SIEP_TRUSTED_PROXIES", "DJANGO_SECURE_SSL_REDIRECT", "SIEP_HSTS_SECONDS",
        "DJANGO_SECRET_KEY", "REFLECTION_ENCRYPTION_KEY", "JWT_SECRET", "JWT_SIGNING_KEY", "REFLECTION_ACTIVE_KEY",
        "REFLECTION_KEYS",
    ):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        if value is not None:
            monkeypatch.setenv(name, value)
    if recargar_base:  # ``base`` con un valor no numérico lanzaría ValueError antes que production
        importlib.reload(base_settings)  # production hace ``from .base import *``
    return runpy.run_module("psychosim.settings.production", run_name="production_bajo_prueba")


def test_el_healthcheck_de_railway_pasa_el_filtro_de_hosts(monkeypatch):
    # Railway sondea /api/health con «Host: healthcheck.railway.app»; sin este host
    # Django responde 400 (DisallowedHost) y el despliegue nunca se promueve.
    settings = _production(monkeypatch)

    assert "healthcheck.railway.app" in settings["ALLOWED_HOSTS"]
    assert "siep.example.edu.co" in settings["ALLOWED_HOSTS"]


def test_el_host_del_healthcheck_no_entra_a_los_origenes_de_csrf(monkeypatch):
    settings = _production(monkeypatch)

    assert "https://healthcheck.railway.app" not in settings["CSRF_TRUSTED_ORIGINS"]
    assert "https://siep.example.edu.co" in settings["CSRF_TRUSTED_ORIGINS"]


def test_sin_hosts_configurados_sigue_fallando_al_arrancar(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="DJANGO_ALLOWED_HOSTS"):
        _production(monkeypatch, DJANGO_ALLOWED_HOSTS=None)


@pytest.mark.parametrize("database_url", [None, "postgres://u:p@h:5432/d"])
def test_la_conexion_a_la_bd_tiene_un_tope_de_espera(monkeypatch, database_url):
    # Sin tope, una BD inalcanzable bloquea /api/health ~130 s (el valor por defecto de psycopg)
    # y gunicorn mata el worker a los 120 s.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    if database_url:
        monkeypatch.setenv("DATABASE_URL", database_url)

    base_py = Path(__file__).resolve().parents[2] / "psychosim" / "settings" / "base.py"
    base = runpy.run_path(str(base_py), run_name="base_bajo_prueba")

    assert base["DATABASES"]["default"]["OPTIONS"]["connect_timeout"] <= 10


# ── S1-1 · SIEP_TRUSTED_PROXIES: obligatoria en producción y un entero ≥ 0 ────────────────

@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
def test_siep_trusted_proxies_es_obligatoria_en_produccion(monkeypatch):
    # Sin valor por defecto: sin declarar cuántos proxies hay delante, la auditoría anotaría IPs falsificables.
    with pytest.raises(ImproperlyConfigured, match="SIEP_TRUSTED_PROXIES"):
        _production(monkeypatch, SIEP_TRUSTED_PROXIES=None)


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["abc", "-1", "1.5"])
def test_siep_trusted_proxies_rechaza_lo_que_no_es_un_entero_no_negativo(monkeypatch, valor):
    with pytest.raises(ImproperlyConfigured, match="SIEP_TRUSTED_PROXIES"):
        _production(monkeypatch, recargar_base=False, SIEP_TRUSTED_PROXIES=valor)


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["0", "1"])
def test_siep_trusted_proxies_acepta_cero_y_uno(monkeypatch, valor):
    settings = _production(monkeypatch, SIEP_TRUSTED_PROXIES=valor)

    assert settings["SIEP_TRUSTED_PROXIES"] == int(valor)


# ── S2-2 · HTTPS forzado y HSTS escalonado ──────────────────────────────────────────────────

@pytest.mark.req("RNF-02")
@pytest.mark.security
def test_la_redireccion_a_https_viene_activa_y_solo_exime_el_healthcheck(monkeypatch):
    # Por defecto Django redirige a HTTPS; la única ruta exenta es /api/health, que Railway sondea por HTTP plano.
    settings = _production(monkeypatch)

    assert settings["SECURE_SSL_REDIRECT"] is True
    assert settings["SECURE_REDIRECT_EXEMPT"] == [r"^api/health$"]


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["false", "FALSE", " false "])
def test_solo_false_explicito_apaga_la_redireccion(monkeypatch, valor):
    settings = _production(monkeypatch, DJANGO_SECURE_SSL_REDIRECT=valor)

    assert settings["SECURE_SSL_REDIRECT"] is False


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["true", "", "0", "no"])
def test_cualquier_otro_valor_deja_la_redireccion_encendida(monkeypatch, valor):
    settings = _production(monkeypatch, DJANGO_SECURE_SSL_REDIRECT=valor)

    assert settings["SECURE_SSL_REDIRECT"] is True


@pytest.mark.req("RNF-02")
@pytest.mark.security
def test_hsts_arranca_en_3600_sin_subdominios_ni_preload(monkeypatch):
    # Subdominios y preload obligan a HTTPS en todo el dominio: no se activan hasta fijar el dominio (SD-5).
    settings = _production(monkeypatch)

    assert settings["SECURE_HSTS_SECONDS"] == 3600
    assert settings["SECURE_HSTS_INCLUDE_SUBDOMAINS"] is False
    assert settings["SECURE_HSTS_PRELOAD"] is False


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("valor", ["0", "86400", "604800", "15552000", "63072000"])
def test_siep_hsts_seconds_acepta_los_escalones_y_los_limites(monkeypatch, valor):
    settings = _production(monkeypatch, SIEP_HSTS_SECONDS=valor)

    assert settings["SECURE_HSTS_SECONDS"] == int(valor)


@pytest.mark.req("RNF-02")
@pytest.mark.security
@pytest.mark.parametrize(
    ("valor", "causa"),
    [
        ("abc", "no es un entero"),
        ("1.5", "no es un entero"),
        ("3600s", "no es un entero"),
        ("", "no es un entero"),
        ("-1", "fuera del rango"),
        ("63072001", "fuera del rango"),
    ],
)
def test_siep_hsts_seconds_rechaza_lo_que_no_es_un_entero_entre_0_y_63072000(monkeypatch, valor, causa):
    with pytest.raises(ImproperlyConfigured, match=f"SIEP_HSTS_SECONDS.*{causa}") as error:
        _production(monkeypatch, SIEP_HSTS_SECONDS=valor)

    # La causa va en el mensaje; el valor leído no, ni en el texto ni en una excepción encadenada.
    assert not valor or valor not in str(error.value)
    assert error.value.__context__ is None


# ── S5-1 · Secretos de producción: se validan al arrancar y el error nunca muestra su valor ──

_ALFABETO = string.ascii_letters + string.digits
PLANTILLAS = (RAIZ / ".env.example", BACKEND / ".env.example")


def _secreto(longitud):
    """Un secreto de ``longitud`` caracteres, nuevo en cada ejecución y con al menos 20 caracteres distintos.

    Nunca es un literal, y la regla de los caracteres distintos no depende del azar: 20 se eligen sin repetir.
    """
    azar = secrets.SystemRandom()
    caracteres = azar.sample(_ALFABETO, 20) + [secrets.choice(_ALFABETO) for _ in range(longitud - 20)]
    azar.shuffle(caracteres)
    return "".join(caracteres)


def _llaves_validas(**cambios):
    """Las dos llaves de producción tal como las genera la plantilla (``token_urlsafe``), nuevas en cada ejecución."""
    return {
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(48),
        "REFLECTION_ENCRYPTION_KEY": secrets.token_urlsafe(32),
        **cambios,
    }


def _valor_de_plantilla(archivo, clave):
    """El valor de ``CLAVE=valor`` en un .env.example (las líneas comentadas no cuentan)."""
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        if linea.startswith(f"{clave}="):
            return linea.split("=", 1)[1].strip()
    return None


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_dos_llaves_generadas_cargan_produccion(monkeypatch):
    llaves = _llaves_validas()

    settings = _production(monkeypatch, **llaves)

    assert settings["SECRET_KEY"] == llaves["DJANGO_SECRET_KEY"]
    assert settings["REFLECTION_ENCRYPTION_KEY"] == llaves["REFLECTION_ENCRYPTION_KEY"]


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_django_secret_key_de_49_caracteres_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="DJANGO_SECRET_KEY es demasiado corta"):
        _production(monkeypatch, DJANGO_SECRET_KEY=_secreto(49))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_django_secret_key_de_50_caracteres_con_20_distintos_carga(monkeypatch):
    valor = _secreto(50)

    settings = _production(monkeypatch, DJANGO_SECRET_KEY=valor)

    assert settings["SECRET_KEY"] == valor


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_django_secret_key_con_una_sola_letra_repetida_falla(monkeypatch):
    # Cumple la longitud, pero tiene un único carácter distinto (el mínimo son 20).
    with pytest.raises(ImproperlyConfigured, match="DJANGO_SECRET_KEY tiene muy pocos caracteres distintos"):
        _production(monkeypatch, DJANGO_SECRET_KEY=secrets.choice(string.ascii_lowercase) * 60)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_el_literal_inseguro_de_django_sigue_rechazado(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="insecure default"):
        _production(monkeypatch, DJANGO_SECRET_KEY="django-insecure-change-in-production")


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_cada_marcador_de_ejemplo_dentro_de_la_llave_la_rechaza(monkeypatch):
    # Los marcadores son los que declara production.py (sin distinguir mayúsculas): se leen del propio módulo.
    marcadores = _production(monkeypatch).get("EXAMPLE_SECRET_MARKERS")
    assert marcadores, "production.py debe declarar EXAMPLE_SECRET_MARKERS"

    for marcador in marcadores:
        for forma in (marcador, marcador.upper()):
            with pytest.raises(ImproperlyConfigured, match="DJANGO_SECRET_KEY es un valor de ejemplo"):
                _production(monkeypatch, DJANGO_SECRET_KEY=forma + _secreto(60))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_encryption_key_es_obligatoria(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ENCRYPTION_KEY"):
        _production(monkeypatch, REFLECTION_ENCRYPTION_KEY=None)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_encryption_key_no_hereda_jwt_secret(monkeypatch):
    # JWT_SECRET definido y la llave propia ausente: antes caía a JWT_SECRET; ahora no arranca.
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ENCRYPTION_KEY"):
        _production(monkeypatch, REFLECTION_ENCRYPTION_KEY=None, JWT_SECRET=_secreto(64))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_encryption_key_de_31_caracteres_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ENCRYPTION_KEY es demasiado corta"):
        _production(monkeypatch, REFLECTION_ENCRYPTION_KEY=_secreto(31))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_encryption_key_de_32_caracteres_carga(monkeypatch):
    valor = _secreto(32)

    settings = _production(monkeypatch, REFLECTION_ENCRYPTION_KEY=valor)

    assert settings["REFLECTION_ENCRYPTION_KEY"] == valor


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_encryption_key_igual_a_la_de_django_falla(monkeypatch):
    valor = _secreto(64)

    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ENCRYPTION_KEY debe ser distinta de DJANGO_SECRET_KEY"):
        _production(monkeypatch, DJANGO_SECRET_KEY=valor, REFLECTION_ENCRYPTION_KEY=valor)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_encryption_key_con_marcador_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ENCRYPTION_KEY es un valor de ejemplo"):
        _production(monkeypatch, REFLECTION_ENCRYPTION_KEY="tu-secreto" + _secreto(40))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_el_default_de_desarrollo_de_base_no_arranca_produccion(monkeypatch):
    monkeypatch.delenv("REFLECTION_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    base = runpy.run_path(str(BACKEND / "psychosim" / "settings" / "base.py"), run_name="base_bajo_prueba")

    # base.py ya no hereda JWT_SECRET: su default para las reflexiones es una llave de desarrollo que producción rechaza.
    assert base["JWT_SECRET"] == ""
    assert "dev-only" in base["REFLECTION_ENCRYPTION_KEY"]
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ENCRYPTION_KEY"):
        _production(monkeypatch, REFLECTION_ENCRYPTION_KEY=base["REFLECTION_ENCRYPTION_KEY"])


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_sin_jwt_secret_y_con_las_dos_llaves_validas_carga(monkeypatch):
    llaves = _llaves_validas()

    settings = _production(monkeypatch, JWT_SECRET=None, **llaves)

    assert settings["SECRET_KEY"] == llaves["DJANGO_SECRET_KEY"]


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_un_jwt_secret_cualquiera_no_se_valida(monkeypatch):
    # JWT_SECRET no firma nada en producción: si alguien lo define, ni su longitud ni su contenido se comprueban.
    settings = _production(monkeypatch, JWT_SECRET=secrets.token_urlsafe(4), **_llaves_validas())

    assert settings["SECRET_KEY"]


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_el_error_nombra_la_variable_y_no_muestra_su_valor(monkeypatch):
    casos = {
        "REFLECTION_ENCRYPTION_KEY": _secreto(31),
        "DJANGO_SECRET_KEY": "cambia-esto" + _secreto(60),
    }
    for variable, valor in casos.items():
        with pytest.raises(ImproperlyConfigured, match=variable) as error:
            _production(monkeypatch, **{variable: valor})

        # La causa va en el mensaje; el valor, ni entero ni en parte, y tampoco en una excepción encadenada.
        assert valor not in str(error.value)
        assert error.value.__context__ is None


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
@pytest.mark.parametrize("archivo", PLANTILLAS, ids=["raiz", "backend"])
@pytest.mark.parametrize("clave", ["DJANGO_SECRET_KEY", "REFLECTION_ENCRYPTION_KEY"])
def test_los_valores_de_la_plantilla_no_arrancan_produccion(monkeypatch, archivo, clave):
    # Quien copie la plantilla sin cambiarla debe fallar al arrancar: el valor se lee del propio archivo.
    marcadores = _production(monkeypatch).get("EXAMPLE_SECRET_MARKERS")
    assert marcadores, "production.py debe declarar EXAMPLE_SECRET_MARKERS"
    valor = _valor_de_plantilla(archivo, clave)
    assert valor, f"{archivo} debe definir {clave}"
    assert any(marcador in valor.lower() for marcador in marcadores), f"{clave} de {archivo} no lleva un marcador"

    with pytest.raises(ImproperlyConfigured, match=clave):
        _production(monkeypatch, **{clave: valor})


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_base_no_conserva_el_literal_publico_de_jwt_secret():
    texto = (BACKEND / "psychosim" / "settings" / "base.py").read_text(encoding="utf-8")

    assert "psychosim-jwt-secret" not in texto


# ── S5-2 · Llaves versionadas de las reflexiones: la activa es obligatoria y cada secreto cumple S5-1 ──────

@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_active_key_es_obligatoria_en_produccion(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ACTIVE_KEY"):
        _production(monkeypatch, REFLECTION_ACTIVE_KEY=None)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_active_key_vacia_o_con_espacios_cuenta_como_ausente(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ACTIVE_KEY es obligatoria"):
        _production(monkeypatch, REFLECTION_ACTIVE_KEY="   ")


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_active_key_no_puede_ser_la_heredada(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ACTIVE_KEY no puede ser local-aes-gcm-v1"):
        _production(monkeypatch, REFLECTION_ACTIVE_KEY="local-aes-gcm-v1")


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_reflection_active_key_debe_estar_en_reflection_keys_sin_mostrarla(monkeypatch):
    activa = "k-ausente-" + secrets.token_hex(4)

    with pytest.raises(ImproperlyConfigured, match="REFLECTION_ACTIVE_KEY debe ser el id de una llave de REFLECTION_KEYS") as error:
        _production(monkeypatch, REFLECTION_ACTIVE_KEY=activa)

    assert activa not in str(error.value)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_un_secreto_de_reflection_keys_corto_falla_sin_mostrarlo(monkeypatch):
    corto = _secreto(31)

    with pytest.raises(ImproperlyConfigured, match=r"REFLECTION_KEYS \(par 2\) es demasiado corta") as error:
        _production(monkeypatch, REFLECTION_KEYS=f"k1={_secreto(64)},k2={corto}")

    assert corto not in str(error.value)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_un_secreto_de_reflection_keys_igual_al_de_django_falla(monkeypatch):
    valor = _secreto(64)

    with pytest.raises(ImproperlyConfigured, match=r"REFLECTION_KEYS \(par 1\) debe ser distinta de DJANGO_SECRET_KEY"):
        _production(monkeypatch, DJANGO_SECRET_KEY=valor, REFLECTION_KEYS=f"k1={valor}")


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_un_secreto_de_reflection_keys_con_marcador_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match=r"REFLECTION_KEYS \(par 1\) es un valor de ejemplo"):
        _production(monkeypatch, REFLECTION_KEYS="k1=tu-secreto" + _secreto(40))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_dos_llaves_versionadas_con_la_activa_declarada_cargan_produccion(monkeypatch):
    k1, k2 = _secreto(64), _secreto(64)

    settings = _production(monkeypatch, REFLECTION_KEYS=f"k1={k1},k2={k2}", REFLECTION_ACTIVE_KEY="k2")

    assert settings["REFLECTION_ACTIVE_KEY"] == "k2"
    assert settings["REFLECTION_KEYS"] == {"k1": k1, "k2": k2}


# ── S5-3 · Llave que firma las sesiones: obligatoria, propia y con las reglas de S5-1 ───────────────────────────

@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_es_obligatoria_en_produccion(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY"):
        _production(monkeypatch, JWT_SIGNING_KEY=None)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_de_49_caracteres_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY es demasiado corta"):
        _production(monkeypatch, JWT_SIGNING_KEY=_secreto(49))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_de_50_caracteres_con_20_distintos_es_la_llave_de_simplejwt(monkeypatch):
    valor = _secreto(50)

    settings = _production(monkeypatch, JWT_SIGNING_KEY=valor)

    assert settings["SIMPLE_JWT"]["SIGNING_KEY"] == valor
    assert settings["SIMPLE_JWT"]["SIGNING_KEY"] != settings["SECRET_KEY"]


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_igual_a_django_secret_key_falla(monkeypatch):
    valor = _secreto(64)

    with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY debe ser distinta de DJANGO_SECRET_KEY"):
        _production(monkeypatch, DJANGO_SECRET_KEY=valor, JWT_SIGNING_KEY=valor)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_igual_a_reflection_encryption_key_falla(monkeypatch):
    valor = _secreto(64)

    with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY debe ser distinta de REFLECTION_ENCRYPTION_KEY"):
        _production(monkeypatch, REFLECTION_ENCRYPTION_KEY=valor, JWT_SIGNING_KEY=valor)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_igual_a_un_secreto_de_reflection_keys_falla(monkeypatch):
    valor = _secreto(64)

    with pytest.raises(ImproperlyConfigured, match=r"JWT_SIGNING_KEY debe ser distinta de REFLECTION_KEYS \(par 2\)"):
        _production(monkeypatch, REFLECTION_KEYS=f"k1={_secreto(64)},k2={valor}", JWT_SIGNING_KEY=valor)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_con_marcador_de_ejemplo_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY es un valor de ejemplo"):
        _production(monkeypatch, JWT_SIGNING_KEY="cambia-esto" + _secreto(60))


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_jwt_signing_key_con_una_sola_letra_repetida_falla(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY tiene muy pocos caracteres distintos"):
        _production(monkeypatch, JWT_SIGNING_KEY=secrets.choice(string.ascii_lowercase) * 60)


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
def test_el_error_de_jwt_signing_key_no_muestra_su_valor(monkeypatch):
    for valor in (_secreto(49), "cambia-esto" + _secreto(60)):
        with pytest.raises(ImproperlyConfigured, match="JWT_SIGNING_KEY") as error:
            _production(monkeypatch, JWT_SIGNING_KEY=valor)

        # La causa va en el mensaje; el valor, ni entero ni en parte, y tampoco en una excepción encadenada.
        assert valor not in str(error.value)
        assert error.value.__context__ is None


@pytest.mark.req("SIEP-RNF-03")
@pytest.mark.security
@pytest.mark.parametrize("archivo", PLANTILLAS, ids=["raiz", "backend"])
def test_las_plantillas_documentan_jwt_signing_key_sin_darle_valor(archivo):
    assert "JWT_SIGNING_KEY" in archivo.read_text(encoding="utf-8"), f"{archivo} debe documentar JWT_SIGNING_KEY"
    assert _valor_de_plantilla(archivo, "JWT_SIGNING_KEY") is None, f"{archivo} no debe dar un valor a JWT_SIGNING_KEY"


# ── R1b · comodines en los hosts y SIEP_TRUSTED_PROXIES = 0 en Railway ─────────────────────

@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("hosts", ["*", "siep.example.edu.co,*"])
def test_un_comodin_en_los_hosts_impide_arrancar_sin_mostrarlo(monkeypatch, hosts):
    with pytest.raises(ImproperlyConfigured, match="DJANGO_ALLOWED_HOSTS") as error:
        _production(monkeypatch, DJANGO_ALLOWED_HOSTS=hosts)

    assert "*" not in str(error.value)
    assert error.value.__context__ is None


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
@pytest.mark.parametrize("variable", ["RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_PUBLIC_DOMAIN"])
def test_en_railway_con_cero_proxies_de_confianza_no_arranca(monkeypatch, variable):
    # Railway pone siempre un proxy delante: con 0, todos los clientes comparten la IP del borde.
    with pytest.raises(ImproperlyConfigured, match="SIEP_TRUSTED_PROXIES"):
        _production(monkeypatch, SIEP_TRUSTED_PROXIES="0", **{variable: "siep.example.test"})


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
def test_en_railway_con_un_proxy_arranca(monkeypatch):
    settings = _production(monkeypatch, SIEP_TRUSTED_PROXIES="1", RAILWAY_PROJECT_ID="proyecto-de-prueba")

    assert settings["SIEP_TRUSTED_PROXIES"] == 1


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.security
def test_fuera_de_railway_cero_proxies_sigue_arrancando(monkeypatch):
    settings = _production(monkeypatch, SIEP_TRUSTED_PROXIES="0")

    assert settings["SIEP_TRUSTED_PROXIES"] == 0
