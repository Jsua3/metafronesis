"""``purge_rate_limits`` borra por alcance lo que ya no se lee (S1-2, DJA-2; revisión de la ola A, hallazgo #4)."""
import io

import pytest
from django.core.management import call_command

from apps.security import limiter
from apps.security.management.commands import purge_rate_limits
from apps.security.models import RateLimitBucket

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security, pytest.mark.django_db]

INSTANTE = 1_800_000_000.0
DIA = 86400


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


def _contador(window_start, nombre, scope="login_ip"):
    return RateLimitBucket.objects.create(
        scope=scope, key_hash=limiter.key_hash(nombre), window_start=window_start, count=1
    )


def _claves_que_quedan():
    return set(RateLimitBucket.objects.values_list("key_hash", flat=True))


def test_cada_alcance_conserva_dos_veces_su_ventana(reloj):
    """``login_ip`` tiene ventanas de 600 s: se conservan 1 200 s. La fila exactamente en el corte se queda."""
    corte = int(INSTANTE) - 2 * 600
    _contador(corte - 1, "vencida")
    _contador(corte, "justo-en-el-corte")
    _contador(int(INSTANTE), "vigente")

    call_command("purge_rate_limits", stdout=io.StringIO())

    assert _claves_que_quedan() == {limiter.key_hash("justo-en-el-corte"), limiter.key_hash("vigente")}


def test_una_ventana_larga_se_conserva_dos_veces_su_duracion(reloj):
    """``login_fail_account_ip`` tiene ventanas de 900 s: se conservan 1 800 s, no dos días."""
    corte = int(INSTANTE) - 2 * 900
    _contador(corte - 1, "vencida", scope="login_fail_account_ip")
    _contador(corte, "justo-en-el-corte", scope="login_fail_account_ip")

    call_command("purge_rate_limits", stdout=io.StringIO())

    assert _claves_que_quedan() == {limiter.key_hash("justo-en-el-corte")}


def test_los_contadores_y_los_alcances_retirados_conservan_dos_dias(reloj):
    """``audit_failure`` es un contador que ``security_report`` cuenta en varios días, y un alcance que ya no está en
    ``LIMITS`` no tiene ventana que medir: ambos conservan dos días."""
    corte = int(INSTANTE) - 2 * DIA
    _contador(corte - 1, "contador-vencido", scope="audit_failure")
    _contador(corte, "contador-en-el-corte", scope="audit_failure")
    _contador(corte - 1, "retirado-vencido", scope="alcance_retirado")
    _contador(int(INSTANTE) - DIA, "retirado-de-ayer", scope="alcance_retirado")

    call_command("purge_rate_limits", stdout=io.StringIO())

    assert _claves_que_quedan() == {
        limiter.key_hash("contador-en-el-corte"),
        limiter.key_hash("retirado-de-ayer"),
    }


def test_con_dry_run_cuenta_lo_que_borraria_y_no_borra_nada(reloj):
    _contador(int(INSTANTE) - 3 * DIA, "vencida")
    salida = io.StringIO()

    call_command("purge_rate_limits", "--dry-run", stdout=salida)

    assert RateLimitBucket.objects.count() == 1
    assert "1" in salida.getvalue()


def test_el_recuento_por_alcance_es_el_mismo_con_y_sin_dry_run(reloj):
    _contador(int(INSTANTE) - 3 * DIA, "vencida-1")
    _contador(int(INSTANTE) - 3 * DIA, "vencida-2", scope="login_fail_account")
    _contador(int(INSTANTE), "vigente")
    simulado = io.StringIO()
    real = io.StringIO()

    call_command("purge_rate_limits", "--dry-run", stdout=simulado)
    call_command("purge_rate_limits", stdout=real)

    def lineas_por_alcance(texto):
        return [linea for linea in texto.splitlines() if linea.startswith("  ")]

    assert lineas_por_alcance(real.getvalue()) == ["  login_ip: 1", "  login_fail_account: 1"]
    assert lineas_por_alcance(simulado.getvalue()) == lineas_por_alcance(real.getvalue())


def test_los_lotes_se_repiten_hasta_que_no_queden(reloj, monkeypatch):
    monkeypatch.setattr(purge_rate_limits, "LOTE", 2)
    for numero in range(5):
        _contador(int(INSTANTE) - 3 * DIA, f"vencida-{numero}")
    _contador(int(INSTANTE), "vigente")
    salida = io.StringIO()

    call_command("purge_rate_limits", stdout=salida)

    assert _claves_que_quedan() == {limiter.key_hash("vigente")}
    assert "borraron 5" in salida.getvalue()
