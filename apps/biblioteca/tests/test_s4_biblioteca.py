import json
import pytest
from rest_framework.test import APIClient
from apps.users.models import CustomUser
from apps.biblioteca.services import lugares, geometria

pytestmark = pytest.mark.django_db


@pytest.fixture
def library(tmp_path, settings):
    folder = tmp_path / "escenarios" / "demo"
    folder.mkdir(parents=True)
    (folder.parent / "indice.json").write_text(
        json.dumps({"lugares": [{"id": "demo", "nombre": "Demo"}]})
    )
    (folder / "escenario.json").write_text(
        json.dumps(
            {
                "id": "demo",
                "nombre": "Demo",
                "salas": [{"id": "sala", "fondo": "arte/sala.png"}],
                "hitos": [],
                "catalogo": {"muebles": [], "objetos": [], "herramientas": []},
            }
        )
    )
    settings.BIBLIOTECA_DIR = tmp_path
    client = APIClient()
    user = CustomUser.objects.create_user(email="library@example.test", role="PROFESOR")
    client.force_authenticate(user)
    return client, folder


def test_catalog_and_details_are_public_urls_and_independent_copies(library):
    client, _ = library
    response = client.get("/api/biblioteca/lugares")
    assert response.status_code == 200
    assert response.data["data"][0]["id"] == "demo"
    body = client.get("/api/biblioteca/lugares/demo").data["data"]
    assert (
        body["salas"][0]["fondo"] == "/assets/biblioteca/escenarios/demo/arte/sala.png"
    )
    first = lugares.cargar_lugar("demo")
    first["salas"].clear()
    assert len(lugares.cargar_lugar("demo")["salas"]) == 1


def test_anonymous_and_students_are_denied(library):
    client, _ = library
    assert APIClient().get("/api/biblioteca/lugares").status_code == 403
    user = CustomUser.objects.create_user(
        email="student-library@example.test", role="ESTUDIANTE"
    )
    client.force_authenticate(user)
    assert client.get("/api/biblioteca/lugares").status_code == 403


@pytest.mark.parametrize("name", ["..", "../outside", "DEMO", "x--y", "missing"])
def test_invalid_or_unlisted_ids_are_not_read(library, name):
    from rest_framework.exceptions import NotFound

    with pytest.raises(NotFound):
        lugares.cargar_lugar(name)


def test_missing_and_invalid_json_are_503_without_local_paths(library):
    client, folder = library
    (folder / "escenario.json").write_text("broken")
    r = client.get("/api/biblioteca/lugares/demo")
    assert r.status_code == 503
    assert str(folder) not in str(r.data)
    (folder.parent / "indice.json").unlink()
    assert client.get("/api/biblioteca/lugares").status_code == 503


@pytest.mark.parametrize("encuadre", geometria.ZONAS)
def test_geometry_covers_room_without_overlap(encuadre):
    x, y, w, h = geometria.zona_caminable(encuadre)
    walls = geometria.paredes(encuadre)
    assert (
        w * h + sum(p.ancho * p.alto for p in walls)
        == geometria.ANCHO_SALA * geometria.ALTO_SALA
    )
    boxes = [(x, y, w, h)] + [(p.x, p.y, p.ancho, p.alto) for p in walls]
    for i, (ax, ay, aw, ah) in enumerate(boxes):
        for bx, by, bw, bh in boxes[i + 1 :]:
            assert min(ax + aw, bx + bw) <= max(ax, bx) or min(ay + ah, by + bh) <= max(
                ay, by
            )


@pytest.mark.parametrize(
    "path",
    ["/tmp/private.png", "../private.png", "https://example.test/a.png", "a\\b.png"],
)
def test_unsafe_art_paths_are_not_published(library, path):
    client, folder = library
    file = folder / "escenario.json"
    data = json.loads(file.read_text())
    data["salas"][0]["fondo"] = path
    file.write_text(json.dumps(data))
    assert client.get("/api/biblioteca/lugares/demo").status_code == 503


def test_symlink_outside_catalog_is_not_read(library, tmp_path):
    client, folder = library
    outside = tmp_path / "external.json"
    outside.write_text('{"id":"demo"}')
    (folder / "escenario.json").unlink()
    (folder / "escenario.json").symlink_to(outside)
    assert client.get("/api/biblioteca/lugares/demo").status_code == 503
