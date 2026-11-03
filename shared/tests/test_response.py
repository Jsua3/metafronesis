"""Lock the Spring-identical envelope semantics (NON_NULL omission)."""
from shared.response import api_created, api_error, api_ok, envelope


def test_envelope_omits_null_message_and_data():
    assert envelope(True) == {"success": True}


def test_envelope_includes_data_only():
    assert envelope(True, data={"x": 1}) == {"success": True, "data": {"x": 1}}


def test_envelope_includes_message_and_data():
    assert envelope(True, message="OK", data=[1]) == {
        "success": True,
        "message": "OK",
        "data": [1],
    }


def test_envelope_error_message_only():
    assert envelope(False, message="boom") == {"success": False, "message": "boom"}


def test_envelope_keeps_empty_list_data():
    assert envelope(True, data=[]) == {"success": True, "data": []}


def test_api_ok_status_200():
    resp = api_ok({"a": 1})
    assert resp.status_code == 200
    assert resp.data == {"success": True, "data": {"a": 1}}


def test_api_created_status_201():
    resp = api_created({"id": 5}, message="Creado")
    assert resp.status_code == 201
    assert resp.data == {"success": True, "message": "Creado", "data": {"id": 5}}


def test_api_error_default_400():
    resp = api_error("malo")
    assert resp.status_code == 400
    assert resp.data == {"success": False, "message": "malo"}
