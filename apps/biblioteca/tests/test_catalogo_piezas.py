"""El catálogo de piezas que lee el servidor (contrato x-siep 2.2, sección 2.2) y de dónde sale su manifiesto."""
import json
from pathlib import Path

import pytest
from django.conf import settings

from apps.autoria import plano
from apps.biblioteca.services import catalogo_piezas

FICHA = Path(__file__).parent / "fixtures" / "piezas" / "manifiesto.json"
MANIFIESTO_DEL_FRONTEND = Path(settings.BASE_DIR) / "frontend" / "src" / "assets" / "biblioteca" / "piezas" / "manifiesto.json"


@pytest.fixture(autouse=True)
def _sin_cache():
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


def _borde(ancho):
    return plano.SEPARACION + 19 * (ancho - plano.ANCHO_SALA) // plano.PASO_ANCHO


def test_lee_las_piezas_con_muros_ocupa_y_franja():
    catalogo = catalogo_piezas.cargar_catalogo(FICHA)
    puerta = catalogo.piezas["puerta/madera"]
    assert puerta.muros == frozenset({"fondo", "izquierda", "derecha", "camara"})
    assert (puerta.ocupa, puerta.franja) == (64, (0, 101))
    assert puerta.es_puerta
    assert catalogo.piezas["lampara/pie"].de_suelo
    assert not catalogo.piezas["lampara/tubo"].es_puerta


def test_lee_pisos_variantes_muros_paletas_y_propios():
    catalogo = catalogo_piezas.cargar_catalogo(FICHA)
    assert {"vinilo", "damero", "madera"} <= catalogo.pisos
    assert catalogo.tiene_piso("vinilo", "a") and catalogo.tiene_piso("vinilo", "b")
    assert catalogo.tiene_piso("damero", "universidad-cafeteria")
    assert not catalogo.tiene_piso("vinilo", "z")
    assert catalogo.tiene_muro("zocalo-alto", "hospital")
    assert catalogo.tiene_muro("azulejo", "casa-cocina")
    assert not catalogo.tiene_muro("pintura", "marte")
    assert "piezas/propios/casa-cocina.png" in catalogo.propios
    assert "piezas/tapetes/hospital-sala-escucha-1.png" in catalogo.tapetes


def test_los_anchos_y_bordes_del_manifiesto_son_los_de_la_geometria():
    catalogo = catalogo_piezas.cargar_catalogo(FICHA)
    assert catalogo.anchos == plano.ANCHOS
    assert catalogo.bordes == {ancho: _borde(ancho) for ancho in plano.ANCHOS}


def test_sin_manifiesto_no_hay_catalogo(tmp_path):
    assert catalogo_piezas.cargar_catalogo(tmp_path / "no-existe.json") is None


def test_un_manifiesto_roto_no_es_catalogo(tmp_path):
    roto = tmp_path / "manifiesto.json"
    roto.write_text("{ no es json", encoding="utf-8")
    assert catalogo_piezas.cargar_catalogo(roto) is None


def test_por_omision_lee_la_ruta_de_la_configuracion(settings):
    settings.BIBLIOTECA_PIEZAS_MANIFIESTO = str(FICHA)
    assert catalogo_piezas.catalogo_vigente().piezas["ventana/alta"].ocupa == 136


def test_el_manifiesto_del_servidor_es_el_que_publica_el_frontend():
    """El servidor lee ``biblioteca/piezas/manifiesto.json``: es copia exacta (en contenido) de la que sirve el frontend."""
    del_servidor = Path(settings.BIBLIOTECA_DIR) / "piezas" / "manifiesto.json"
    assert catalogo_piezas.ruta_vigente() == del_servidor
    assert json.loads(del_servidor.read_text(encoding="utf-8")) == json.loads(MANIFIESTO_DEL_FRONTEND.read_text(encoding="utf-8"))


def test_el_catalogo_real_carga_y_trae_las_piezas_de_los_lugares():
    catalogo = catalogo_piezas.catalogo_vigente()
    assert catalogo is not None and catalogo.anchos == plano.ANCHOS
    assert {"ventana/alta", "lampara/tubo", "puerta/corrediza"} <= set(catalogo.piezas)


def test_la_imagen_de_produccion_copia_el_manifiesto_que_el_servidor_lee():
    """El Dockerfile copia ``biblioteca/piezas/manifiesto.json`` a ``/app/biblioteca`` y el .dockerignore no lo deja fuera."""
    raiz = Path(settings.BASE_DIR)
    dockerfile = (raiz / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY biblioteca/piezas/manifiesto.json ./biblioteca/piezas/manifiesto.json" in dockerfile
    ignoradas = [linea.strip() for linea in (raiz / ".dockerignore").read_text(encoding="utf-8").splitlines()]
    assert not any(linea.startswith("biblioteca/piezas") or linea in ("biblioteca", "biblioteca/") for linea in ignoradas)
