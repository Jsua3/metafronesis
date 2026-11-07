"""E5-9 (reparación) · El comparador de respuestas reales con el documento OpenAPI no se queda en decorativo.

``assert_matches`` es lo que impide que el esquema diga una cosa y el servidor otra. Si dejara de ver una
clave de más, un tipo cambiado o un nulo no permitido, todas las pruebas de contrato pasarían sin probar
nada: aquí se prueba cada cosa que debe ver.
"""
import pytest

from shared.contract_testing import (
    assert_matches,
    declared_properties,
    exercised_properties,
    response_schema,
    typed_operations,
)

pytestmark = pytest.mark.req("RNF-07")

DOC = {
    "paths": {
        "/api/cosas": {
            "get": {"responses": {"200": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/Lista"}}}}}}
        }
    },
    "components": {
        "schemas": {
            "Lista": {
                "type": "object",
                "required": ["items", "total"],
                "properties": {
                    "items": {"type": "array", "items": {"$ref": "#/components/schemas/Cosa"}},
                    "total": {"type": "integer"},
                },
            },
            "Cosa": {
                "type": "object",
                "required": ["id", "nombre", "estado"],
                "properties": {
                    "id": {"type": "string", "format": "uuid"},
                    "nombre": {"type": "string"},
                    "nota": {"type": "string", "nullable": True},
                    "estado": {"type": "string", "enum": ["ABIERTA", "CERRADA"]},
                    "cuando": {"type": "string", "format": "date-time"},
                    "peso": {"type": "number"},
                    "activa": {"type": "boolean"},
                    "extra": {"type": "object", "additionalProperties": {}},
                    "anidada": {"allOf": [{"$ref": "#/components/schemas/Punto"}], "nullable": True},
                    "cualquiera": {},
                },
            },
            "Punto": {"type": "object", "required": ["x"], "properties": {"x": {"type": "integer"}}},
        }
    },
}
UUID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
COSA = {"id": UUID, "nombre": "uno", "estado": "ABIERTA"}


def check(data, schema="Cosa", **options):
    return assert_matches(data, {"$ref": f"#/components/schemas/{schema}"}, DOC, **options)


def problems_of(data, schema="Cosa", **options):
    with pytest.raises(AssertionError) as caught:
        check(data, schema, **options)
    return str(caught.value)


def test_una_respuesta_que_coincide_pasa():
    check({**COSA, "nota": None, "peso": 1, "activa": False, "extra": {"a": [1]}, "anidada": {"x": 3}, "cualquiera": [1]})


def test_falta_una_clave_requerida():
    assert "$.nombre: falta" in problems_of({"id": UUID, "estado": "ABIERTA"})


def test_una_clave_que_el_esquema_no_declara_es_un_fallo():
    assert "$.sobrante: no está en el esquema" in problems_of({**COSA, "sobrante": 1})


def test_las_claves_de_mas_se_permiten_cuando_se_pide_explicitamente():
    check({**COSA, "sobrante": 1}, allow_extra=True)


def test_un_tipo_distinto_es_un_fallo_y_un_booleano_no_es_un_entero():
    assert "$.nombre: se esperaba string" in problems_of({**COSA, "nombre": 3})
    assert "$.total: se esperaba integer" in problems_of({"items": [], "total": True}, "Lista")
    assert "$.peso: se esperaba number" in problems_of({**COSA, "peso": "1"})


def test_un_nulo_solo_pasa_donde_el_esquema_lo_permite():
    assert "$.nombre: es null" in problems_of({**COSA, "nombre": None})
    check({**COSA, "nota": None})
    check({**COSA, "anidada": None})  # nullable sobre un allOf


def test_un_valor_fuera_del_enum_es_un_fallo():
    assert "$.estado: 'BORRADA' no está en" in problems_of({**COSA, "estado": "BORRADA"})


def test_los_formatos_uuid_y_fecha_se_comprueban():
    assert "$.id: no es un uuid" in problems_of({**COSA, "id": "123"})
    assert "$.cuando: no es un date-time" in problems_of({**COSA, "cuando": "ayer"})
    check({**COSA, "cuando": "2026-10-17T15:00:00.123456"})  # la hora local del servidor va sin zona
    check({**COSA, "cuando": "2026-10-17T15:00:00-05:00"})


def test_el_fallo_dice_en_que_elemento_de_que_lista_esta():
    message = problems_of({"items": [COSA, {**COSA, "id": 7}], "total": 2}, "Lista")
    assert "$.items[1].id: se esperaba string" in message


def test_el_anidado_se_comprueba_por_dentro():
    assert "$.anidada.x: falta" in problems_of({**COSA, "anidada": {}})


def test_un_objeto_libre_acepta_cualquier_clave():
    check({**COSA, "extra": {"lo": "que", "sea": 1}})


def test_response_schema_toma_la_respuesta_del_documento():
    schema = response_schema(DOC, "/api/cosas", "GET")
    assert schema == {"$ref": "#/components/schemas/Lista"}
    assert_matches({"items": [COSA], "total": 1}, schema, DOC)


def _ok(schema):
    return {"responses": {"200": {"content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{schema}"}}}}}}


def test_typed_operations_cuenta_los_sobres_con_data_tipada_y_no_el_generico():
    document = {
        "paths": {
            "/a": {"get": _ok("Tipado")},
            "/b": {"get": _ok("Generico"), "post": _ok("Generico")},
            "/c": {"get": _ok("Lista")},
            "/d": {"delete": {"responses": {"204": {"description": "sin cuerpo"}}}},
            "/e": {"post": {"responses": {"201": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/Tipado"}}}}}}},
        },
        "components": {
            "schemas": {
                "Generico": {"type": "object", "properties": {"success": {"type": "boolean"}, "data": {}}},
                "Tipado": {"type": "object", "properties": {"success": {"type": "boolean"}, "data": {"$ref": "#/components/schemas/Punto"}}},
                "Lista": {
                    "type": "object",
                    "properties": {"data": {"type": "array", "items": {"$ref": "#/components/schemas/Punto"}}},
                },
                "Punto": {"type": "object", "properties": {"x": {"type": "integer"}}},
            }
        },
    }

    assert typed_operations(document) == {("/a", "GET"), ("/c", "GET"), ("/e", "POST")}


def test_un_esquema_con_oneof_o_anyof_falla_en_voz_alta_en_vez_de_dejar_pasar_cualquier_cosa():
    for key in ("oneOf", "anyOf"):
        document = {"components": {"schemas": {"Mezcla": {key: [{"type": "string"}, {"type": "integer"}]}}}}

        with pytest.raises(AssertionError) as caught:
            assert_matches("lo que sea", {"$ref": "#/components/schemas/Mezcla"}, document)

        assert f"{key}" in str(caught.value) and "no sabe comprobar" in str(caught.value)


def test_un_date_time_sin_hora_es_un_fallo():
    assert "$.cuando: no es un date-time" in problems_of({**COSA, "cuando": "2026-10-17"})


def _lista_doc():
    return {"components": {"schemas": {"Lista": DOC["components"]["schemas"]["Lista"], "Cosa": DOC["components"]["schemas"]["Cosa"],
                                       "Punto": DOC["components"]["schemas"]["Punto"]}}}


def test_exercised_properties_dice_que_propiedades_de_que_componente_vio_la_respuesta():
    seen = exercised_properties(
        {"items": [{**COSA, "nota": None, "anidada": {"x": 1}}], "total": 1}, {"$ref": "#/components/schemas/Lista"}, DOC
    )

    assert seen == {
        "Lista.items", "Lista.total", "Cosa.id", "Cosa.nombre", "Cosa.estado", "Cosa.nota", "Cosa.anidada", "Punto.x",
    }


def test_declared_properties_lista_todas_las_propiedades_alcanzables_desde_un_esquema():
    declared = declared_properties([{"$ref": "#/components/schemas/Lista"}], DOC)

    assert {"Lista.items", "Lista.total", "Cosa.cuando", "Cosa.cualquiera", "Punto.x"} <= declared
    assert "Cosa.inventada" not in declared


def test_una_lista_vacia_no_ejercita_las_propiedades_de_sus_elementos():
    seen = exercised_properties({"items": [], "total": 0}, {"$ref": "#/components/schemas/Lista"}, DOC)
    declared = declared_properties([{"$ref": "#/components/schemas/Lista"}], DOC)

    assert "Cosa.nombre" in declared - seen
