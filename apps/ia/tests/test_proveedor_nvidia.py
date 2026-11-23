"""El proveedor de NVIDIA (API compatible con la de OpenAI en ``integrate.api.nvidia.com``). Sin red: ``_solicitar`` simulado."""
import pytest

from apps.ia import proveedores
from apps.ia.proveedores import ProveedorNvidia, proveedor_para


@pytest.fixture
def llamadas(monkeypatch):
    registro = []

    def solicitar(url, datos, cabeceras, tiempo=None):
        registro.append({"url": url, "datos": datos, "cabeceras": cabeceras, "tiempo": tiempo})
        return {"choices": [{"message": {"content": "Hola"}}]}

    monkeypatch.setattr(proveedores, "_solicitar", solicitar)
    return registro


def test_se_elige_por_nombre_con_su_clave_y_su_modelo():
    proveedor = proveedor_para(" NVIDIA ", "clave-de-prueba", "z-ai/glm-5.3-flash")
    assert isinstance(proveedor, ProveedorNvidia)
    assert (proveedor.clave, proveedor.modelo) == ("clave-de-prueba", "z-ai/glm-5.3-flash")


def test_llama_a_la_api_de_nvidia_con_la_clave_como_bearer(llamadas):
    texto = ProveedorNvidia("clave-de-prueba", "z-ai/glm-5.3-flash").responder("Instrucciones", [{"role": "user", "content": "Hola"}])
    assert texto == "Hola"
    (llamada,) = llamadas
    assert llamada["url"] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert llamada["cabeceras"] == {"Authorization": "Bearer clave-de-prueba"}
    assert llamada["datos"]["model"] == "z-ai/glm-5.3-flash"
    assert llamada["datos"]["messages"][0] == {"role": "system", "content": "Instrucciones"}


def test_sin_tope_ni_espera_usa_los_suyos_que_alcanzan_para_una_escena_entera(llamadas):
    ProveedorNvidia("c", "m").responder("I", [])
    assert llamadas[0]["datos"]["max_tokens"] == ProveedorNvidia.MAXIMO_DE_TOKENS
    assert llamadas[0]["tiempo"] == ProveedorNvidia.TIEMPO_SEGUNDOS
    assert ProveedorNvidia.TIEMPO_SEGUNDOS > proveedores.TIEMPO_MAXIMO_SEGUNDOS


def test_respeta_el_tope_y_la_espera_que_le_pasan(llamadas):
    ProveedorNvidia("c", "m").responder("I", [], max_tokens=500, tiempo=30)
    assert (llamadas[0]["datos"]["max_tokens"], llamadas[0]["tiempo"]) == (500, 30)


@pytest.mark.parametrize("contenido, esperado", [
    ("<think>razono un rato</think>\n{\"a\": 1}", "{\"a\": 1}"),
    ("<think>\nvarias\nlíneas\n</think>Listo.", "Listo."),
    (None, ""),
])
def test_quita_el_razonamiento_de_los_modelos_que_piensan_en_voz_alta(monkeypatch, contenido, esperado):
    monkeypatch.setattr(proveedores, "_solicitar", lambda *a, **k: {"choices": [{"message": {"content": contenido}}]})
    assert ProveedorNvidia("c", "m").responder("I", []) == esperado
