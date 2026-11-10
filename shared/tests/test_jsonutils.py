"""Ayudantes compartidos de JSON y acotación (shared/jsonutils.py).

Fijan el comportamiento de los lectores que estaban copiados en game_dtos,
instructor_service y game_views, y de la función de acotación que usa
world_service.
No usan la base de datos.
"""
import json

import pytest

from shared import jsonutils


class TestReadStringList:
    @pytest.mark.parametrize(
        "raw",
        [None, "", "not json", "[1,", "{}", '{"a": 1}', "null", "true", "123", '"texto"'],
    )
    def test_devuelve_lista_vacia_si_no_es_una_lista_json(self, raw):
        assert jsonutils.read_string_list(raw) == []

    def test_lee_una_lista_json(self):
        assert jsonutils.read_string_list('["a", "b"]') == ["a", "b"]

    def test_no_valida_el_tipo_de_los_elementos(self):
        assert jsonutils.read_string_list('[1, "a", null]') == [1, "a", None]

    @pytest.mark.parametrize("raw", [5, ["a"], []])
    def test_un_valor_que_no_es_texto_da_lista_vacia(self, raw):
        assert jsonutils.read_string_list(raw) == []


class TestReadMap:
    @pytest.mark.parametrize(
        "raw",
        [None, "", "   ", "not json", "{", "[]", "[1]", "null", "true", "123", '"texto"'],
    )
    def test_devuelve_dict_vacio_si_no_es_un_objeto_json(self, raw):
        assert jsonutils.read_map(raw) == {}

    def test_lee_un_objeto_json(self):
        assert jsonutils.read_map('{"a": 1, "b": {"c": 2}}') == {"a": 1, "b": {"c": 2}}

    def test_acepta_espacios_alrededor(self):
        assert jsonutils.read_map('  {"a": 1}  ') == {"a": 1}


class TestWriteMap:
    def test_serializa_un_dict(self):
        assert json.loads(jsonutils.write_map({"a": 1})) == {"a": 1}

    def test_none_se_guarda_como_objeto_vacio(self):
        assert jsonutils.write_map(None) == "{}"

    def test_un_valor_no_serializable_se_guarda_como_objeto_vacio(self):
        assert jsonutils.write_map({"a": object()}) == "{}"

    def test_ida_y_vuelta_con_read_map(self):
        data = {"x": [1, 2], "y": {"z": "ñ"}}
        assert jsonutils.read_map(jsonutils.write_map(data)) == data


class TestCoerceInt:
    @pytest.mark.parametrize(
        "value,expected",
        [(5, 5), ("7", 7), (" 12 ", 12), (7.9, 7), (-3, -3), ("-3", -3), (True, 1)],
    )
    def test_convierte_lo_convertible(self, value, expected):
        assert jsonutils.coerce_int(value) == expected

    @pytest.mark.parametrize("value", [None, "", "abc", "7.5", [], {}, object()])
    def test_devuelve_el_valor_por_defecto_si_no_se_puede(self, value):
        assert jsonutils.coerce_int(value) == 0
        assert jsonutils.coerce_int(value, default=-1) == -1


class TestClamp:
    @pytest.mark.parametrize(
        "value,lo,hi,expected",
        [
            (5, 0, 10, 5),
            (-1, 0, 10, 0),
            (11, 0, 10, 10),
            (0, 0, 10, 0),
            (10, 0, 10, 10),
            (5.5, 0, 10, 5.5),
            (-0.1, 0, 100, 0),
            (150, 0, 100, 100),
            (3, 3, 3, 3),
            (-5, -10, -1, -5),
            (-20, -10, -1, -10),
            (0, -10, -1, -1),
        ],
    )
    def test_acota_al_intervalo(self, value, lo, hi, expected):
        assert jsonutils.clamp(value, lo, hi) == expected

    def test_por_defecto_acota_a_0_100(self):
        assert [jsonutils.clamp(v) for v in (-5, 0, 50, 100, 105)] == [0, 0, 50, 100, 100]

    def test_con_el_intervalo_invertido_gana_el_minimo(self):
        # max(lo, min(hi, v)) con lo > hi devuelve lo: comportamiento heredado de las tres copias.
        assert jsonutils.clamp(5, 10, 0) == 10
