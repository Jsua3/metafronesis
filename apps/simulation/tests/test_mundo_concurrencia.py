"""La lectura del mundo sucede después del cerrojo del intento."""

import threading

import pytest
from django.db import transaction
from rest_framework.test import APIClient

from apps.simulation.models import AttemptWorldState, SceneMap, SimulationAttempt
from apps.simulation.services.attempt_lock import lock_attempt_row
from shared.testing import run_concurrently
from .conftest import scene


pytestmark = [pytest.mark.req("RF-17", "RF-19", "RF-21", "RNF-08")]


def test_patch_espera_y_conserva_la_sala_confirmada(real_commits):
    datos = scene.__wrapped__()
    intento = None
    try:
        intento = SimulationAttempt.objects.create(
            student=datos["student"], case_version=datos["version"],
            current_node=datos["node"], attempt_token_hash="carrera-mundo",
        )
        primero = SceneMap.objects.create(case_version=datos["version"], node=datos["node"],
            map_key="primero", title="Primero", width=500, height=400, spawn_x=50, spawn_y=50)
        segundo = SceneMap.objects.create(case_version=datos["version"], node=datos["end"],
            map_key="segundo", title="Segundo", width=500, height=400, spawn_x=80, spawn_y=80)
        AttemptWorldState.objects.create(attempt=intento, scene_map=primero, synced_node=datos["node"],
                                         player_x=50, player_y=50)
        tomado = threading.Event()

        def cambiar_sala():
            with transaction.atomic():
                lock_attempt_row(intento.pk)
                AttemptWorldState.objects.filter(attempt=intento).update(scene_map=segundo, player_x=80, player_y=80)
                tomado.set()
                threading.Event().wait(0.5)

        def mover():
            assert tomado.wait(5)
            cliente = APIClient()
            cliente.force_authenticate(datos["student"])
            return cliente.patch(f"/api/simulation/attempts/{intento.pk}/world-state", {
                "currentMapKey": "primero", "playerX": 60, "playerY": 60,
            }, format="json")

        cambio, movimiento = run_concurrently(cambiar_sala, mover)
        assert cambio.error is None and movimiento.error is None
        assert movimiento.value.status_code == 200
        estado = AttemptWorldState.objects.get(attempt=intento)
        assert (estado.scene_map_id, estado.player_x, estado.player_y) == (segundo.pk, 80, 80)
        assert movimiento.value.json()["data"]["map"]["key"] == "segundo"
    finally:
        if intento is not None:
            intento.delete()
        SceneMap.objects.filter(case_version=datos["version"]).delete()
        datos["assignment"].delete()
        datos["option"].delete()
        datos["node"].delete()
        datos["end"].delete()
        datos["version"].delete()
        datos["case"].delete()
        for usuario in (datos["teacher"], datos["student"], datos["stranger"]):
            usuario.delete()


@pytest.mark.req("RF-11", "RNF-08")
def test_pistas_simultaneas_revelan_una_sola(real_commits):
    from rest_framework.test import APIClient
    from shared.testing import run_concurrently
    from apps.simulation.models import SceneHint
    datos = scene.__wrapped__()
    intento = None
    try:
        intento = SimulationAttempt.objects.create(student=datos["student"], case_version=datos["version"], current_node=datos["node"], attempt_token_hash="carrera-pistas")
        sala = SceneMap.objects.create(case_version=datos["version"], node=datos["node"], map_key="pistas", title="Pistas", spawn_x=50, spawn_y=50)
        SceneHint.objects.create(scene_map=sala, hint_order=1, text="Una")
        SceneHint.objects.create(scene_map=sala, hint_order=2, text="Dos")
        def pedir():
            cliente = APIClient()
            cliente.force_authenticate(datos["student"])
            return cliente.post(f"/api/simulation/attempts/{intento.pk}/hints/next", {"requestId": "pista-carrera"}, format="json")
        primero, segundo = run_concurrently(pedir, pedir)
        assert primero.error is None and segundo.error is None
        assert primero.value.status_code == segundo.value.status_code == 200
        assert primero.value.json()["data"] == segundo.value.json()["data"]
        assert intento.events.filter(event_type="HINT_VIEWED").count() == 1
    finally:
        if intento is not None:
            intento.delete()
        SceneMap.objects.filter(case_version=datos["version"]).delete()
        datos["assignment"].delete()
        datos["option"].delete()
        datos["node"].delete()
        datos["end"].delete()
        datos["version"].delete()
        datos["case"].delete()
        for usuario in (datos["teacher"], datos["student"], datos["stranger"]):
            usuario.delete()
