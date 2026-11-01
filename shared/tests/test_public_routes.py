"""Las rutas públicas de la API son exactamente las declaradas (E2-1, RNF-002, LS-6).

La lista y su motivo viven en ``shared/surface.py`` (``PUBLIC_ROUTE_REASONS``, S0-2) y el recorrido
es el del inventario de superficie: una vista que se declare ``AllowAny`` (o sin permisos) y no
esté en esa lista hace fallar la prueba. La regla de arquitectura de E0 (``allowany-solo-
publicas``) vigila el código; esta vigila el resultado enrutado.
"""
import pytest

from shared.surface import AUTHENTICATED, PUBLIC_ROUTE_REASONS, collect_routes, public_routes

pytestmark = pytest.mark.req("RNF-002")


def test_public_routes_outside_the_api_are_exactly_the_declared_ones():
    public = {route for route in public_routes() if not route.startswith("api/")}
    assert public == {route for route in PUBLIC_ROUTE_REASONS if not route.startswith("api/")}


def test_public_api_routes_are_exactly_the_declared_ones():
    public = {route for route in public_routes() if route.startswith("api/")}
    assert public == {route for route in PUBLIC_ROUTE_REASONS if route.startswith("api/")}


def test_every_private_route_requires_authentication_by_default():
    """Toda ruta de ``api/`` que no es pública exige sesión: su exposición es un rol o ``authenticated``."""
    public = public_routes()
    for row in collect_routes():
        if row["route"].startswith("api/") and row["route"] not in public:
            assert row["exposure"] == AUTHENTICATED or row["exposure"].startswith("role:"), row
