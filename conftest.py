"""Root pytest configuration.

pytest.ini already sets DJANGO_SETTINGS_MODULE; this file is the anchor that
keeps the project root on sys.path so ``apps.*`` and ``psychosim.*`` import.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings.test")


def pytest_collection_modifyitems(config, items):
    """Un ``req`` sin código o mal escrito, o una prueba ``security`` sin ``req``, rompe la recolección."""
    from shared.testing import invalid_req_codes, security_items_without_req

    problems = []
    for item in items:
        for marker in item.iter_markers("req"):
            if not marker.args:
                problems.append(f"{item.nodeid}: req() sin código")
            for code in invalid_req_codes(marker.args):
                problems.append(f"{item.nodeid}: código inválido {code!r}")
    if problems:
        raise pytest.UsageError("Marcador req inválido:\n" + "\n".join(problems))
    sin_req = security_items_without_req(items)
    if sin_req:
        raise pytest.UsageError(
            "Marcador security sin req:\n" + "\n".join(f"{item.nodeid}: security sin req()" for item in sin_req)
        )


@pytest.fixture(autouse=True)
def legacy_contract_flags(settings):
    """Las suites anteriores al cierre del contrato corren contra el camino HEREDADO de las banderas ya encendidas.

    ``REVISION_REQUIRED`` y ``REVIEW_WORKFLOW_STRICT`` arrancan encendidas (F9-10: el cliente ya migró), pero unas 240
    pruebas de autoría se escribieron cuando la revisión era opcional y publicar un borrador bastaba: reescribirlas una por
    una no prueba nada nuevo. El valor final lo prueban ``test_contract_closure.py`` (el ciclo completo con todas las
    banderas en su valor final y cada una en el heredado), las pruebas de cada bandera, que la fijan a mano, y el e2e,
    cuyo servidor arranca con los valores por defecto. Borrar el camino heredado (decisión del usuario) retira esta
    fijación y obliga a reescribir esas pruebas.

    ``SIEP_TEST_FINAL_FLAGS=1`` salta la fijación: corre la suite contra el valor final de arranque. NO es una puerta
    (fallan las ~240 que asumen la revisión opcional); sirve para ver cuáles son y para repetir la medición de F9-10.
    """
    if os.environ.get("SIEP_TEST_FINAL_FLAGS") == "1":
        return
    settings.REVISION_REQUIRED = False
    settings.REVIEW_WORKFLOW_STRICT = False


@pytest.fixture
def fetch_raise():
    """Un acceso perezoso accidental a una relación lanza en vez de hacer N+1 (DJA-7)."""
    from shared.testing import fetch_mode_raise

    with fetch_mode_raise():
        yield


@pytest.fixture
def real_commits(django_db_setup, django_db_blocker):
    """Commits reales para pruebas con varios hilos, SIN ``transactional_db`` (E0-9).

    Desbloquea la base de datos para el hilo principal y los de ``run_concurrently``.
    No hay ``flush``: la siembra queda intacta, pero la prueba debe borrar lo que cree.
    """
    with django_db_blocker.unblock():
        yield
