"""A-10 — el inicio de sesión con Google necesita `requests` y debe estar declarado.

`verify_google_credential` importa `google.auth.transport.requests`, que exige el paquete `requests`;
`google-auth` no lo instala por sí solo. Sin él, el inicio de sesión con Google responde siempre
«El proveedor de Google no está instalado en el backend», aunque se configure el client id.

Estas pruebas leen `requirements.txt` (de ahí instalan el Dockerfile, el CI y `npm run up`) porque
la prueba de contrato de A-04 simula el módulo para no depender del paquete y, por eso, no podía
notar que faltaba.
"""
import re
from pathlib import Path

REQUIREMENTS = Path(__file__).resolve().parents[3] / "requirements.txt"


def _declared():
    """{nombre normalizado: especificación completa} de cada dependencia declarada."""
    declared = {}
    for raw in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name = re.split(r"[<>=!~;\[\s]", line, maxsplit=1)[0]
        declared[name.lower().replace("_", "-")] = line
    return declared


def test_requests_esta_declarado_porque_el_transporte_de_google_lo_necesita():
    assert "google-auth" in _declared(), "el inicio de sesión con Google usa google-auth"
    assert "requests" in _declared(), (
        "google.auth.transport.requests exige `requests`: sin declararlo, el inicio de sesión con "
        "Google responde siempre «El proveedor de Google no está instalado en el backend»"
    )


def test_requests_va_fijado_a_una_version_exacta_como_el_resto_de_las_dependencias():
    spec = _declared().get("requests", "")
    assert re.fullmatch(r"requests==\d+(\.\d+)*", spec), f"requests debe fijarse con == (declarado: {spec!r})"
