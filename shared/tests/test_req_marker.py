import pytest

from shared.testing import invalid_req_codes


def test_codigos_validos():
    codes = ["RN-07", "RF-21", "RQ-NEG-006", "SIEP-RF-12", "DM-5.4", "REGLA-002", "BLOQUE-A", "VD-16"]
    assert invalid_req_codes(codes) == []


@pytest.mark.parametrize("code", ["rn-07", "RN07", "RN-", "", "RN 07", "RN-07;DROP"])
def test_codigos_invalidos(code):
    assert invalid_req_codes([code]) == [code]


@pytest.mark.req("VD-16")
def test_el_marcador_req_esta_declarado(request):
    marker = request.node.get_closest_marker("req")
    assert marker is not None
    assert marker.args == ("VD-16",)
