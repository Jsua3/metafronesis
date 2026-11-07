"""Integración de la API con los archivos reales del zip completo del sprint."""

import json
from pathlib import Path

import pytest
from rest_framework.test import APIClient
from apps.users.models import CustomUser

pytestmark = pytest.mark.django_db


def art_paths(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"arte", "fondo", "hoja", "portada"} and isinstance(child, str):
                yield child
            else:
                yield from art_paths(child)
    elif isinstance(value, list):
        for child in value:
            yield from art_paths(child)


@pytest.mark.parametrize("role", ["PROFESOR", "ADMIN"])
def test_catalogo_real_por_api_con_imagenes_existentes(settings, role):
    # Fija el catálogo entregado, sin depender de una variable de entorno externa.
    settings.BIBLIOTECA_DIR = Path(settings.BASE_DIR) / "biblioteca"
    root = settings.BIBLIOTECA_DIR / "escenarios"
    index = json.loads((root / "indice.json").read_text(encoding="utf-8"))
    ids = [item["id"] for item in index["lugares"]]
    assert set(ids) == {"casa", "comisaria", "universidad"}
    client = APIClient()
    user = CustomUser.objects.create_user(
        email=f"catalogo-{role.lower()}@example.test", role=role
    )
    client.force_authenticate(user)
    response = client.get("/api/biblioteca/lugares")
    assert response.status_code == 200
    assert [item["id"] for item in response.data["data"]] == ids
    for lugar_id in ids:
        original = json.loads(
            (root / lugar_id / "escenario.json").read_text(encoding="utf-8")
        )
        response = client.get("/api/biblioteca/lugares/" + lugar_id)
        assert response.status_code == 200
        public = response.data["data"]
        assert public["id"] == lugar_id
        assert len(public["salas"]) == len(original["salas"]) > 0
        assert public["catalogo"] and public["hitos"]
        paths = list(art_paths(public))
        assert paths
        for path in paths:
            prefix = "/assets/biblioteca/escenarios/"
            assert path.startswith(prefix)
            assert (root / path[len(prefix) :]).is_file(), path
        assert str(settings.BASE_DIR) not in json.dumps(public)
