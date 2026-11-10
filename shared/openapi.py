"""E5-9 · Esquema OpenAPI canónico, extensión JWT y trinquete de avisos (DJG-6, §5.1).

Elimina falsos positivos de ``drf-spectacular`` en vistas basadas en ``APIView``
que devuelven ``ApiResponse`` sin ``serializer_class`` declarativa, registra el
esquema ``BearerAuth`` para ``SiepJWTAuthentication`` y deduplica rutas con y
sin barra final (``/api/x`` frente a ``/api/x/``) para evitar colisiones de
``operationId``.

Reparación de E5-9: el documento tiene que decir lo que el servidor responde. El sobre de éxito es
``{success, message?, data?}`` (``shared.response``), el de error ``{success: false, code, message, field?}``
(``shared.exceptions``) y, en un contrato tipado, ``data`` lleva la forma real (``envelope_of``). Las formas
concretas viven junto a su dominio (``apps/<app>/serializers/contracts.py``) y las comprueba, contra el servidor,
``apps/simulation/tests/test_openapi_matches_responses.py``.
"""
from __future__ import annotations

from typing import Any

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.utils import OpenApiResponse
from rest_framework import serializers


class ApiEnvelopeSerializer(serializers.Serializer):
    """Sobre de éxito de la API: `{success, message?, data?}` (`shared.response.envelope`).

    `message` y `data` solo viajan cuando tienen valor. Los endpoints que aún no se tipan llevan este sobre
    con `data` sin forma.
    """

    success = serializers.BooleanField(help_text="Siempre `true` en una respuesta de éxito.")
    message = serializers.CharField(required=False)
    data = serializers.JSONField(required=False)


class ErrorEnvelopeSerializer(serializers.Serializer):
    """Sobre de error de la API: `{success: false, code, message, field?}` (`shared.exceptions`).

    `code` es estable: el cliente decide por él, nunca por el texto. Algunos errores de dominio suman campos
    propios en la raíz (`existingAttemptId`, `nodeId`…).
    """

    success = serializers.BooleanField(help_text="Siempre `false` en un error.")
    code = serializers.CharField()
    message = serializers.CharField()
    field = serializers.CharField(required=False, help_text="El primer campo que falló la validación.")
    motivo = serializers.CharField(required=False, help_text="El motivo corto (fijo) de un 422 `AI_PROPOSAL_INVALID`.")


_ENVELOPES: dict[tuple[type, bool], type[serializers.Serializer]] = {}


def envelope_of(data_serializer: type[serializers.Serializer], *, many: bool = False) -> type[serializers.Serializer]:
    """El sobre de éxito de un endpoint cuyo ``data`` tiene la forma de ``data_serializer`` (o una lista de ellas).

    Se crea una sola clase por forma: ``drf-spectacular`` la nombra por su clase y dos distintas con el mismo
    nombre serían un aviso.
    """
    key = (data_serializer, many)
    if key not in _ENVELOPES:
        stem = data_serializer.__name__.removesuffix("Serializer")
        _ENVELOPES[key] = type(
            f"{stem}{'List' if many else ''}EnvelopeSerializer",
            (ApiEnvelopeSerializer,),
            {
                "__module__": __name__,
                "__doc__": f"Sobre de éxito: `data` es {'una lista de ' if many else ''}`{stem}`.",
                "data": data_serializer(many=many),
            },
        )
    return _ENVELOPES[key]


_ERROR_DESCRIPTIONS = {
    400: "Petición inválida; el motivo va en `code`.",
    401: "Sin sesión válida.",
    403: "Sin permiso para esta acción.",
    404: "No existe, o no es visible para quien pregunta.",
    409: "Choca con el estado actual.",
    422: "La petición es válida pero el contenido no se puede usar; el motivo va en `code`.",
    429: "Se agotó un límite de uso.",
    502: "Falló un servicio externo.",
}


def error_responses(*statuses: int) -> dict[int, OpenApiResponse]:
    """Las respuestas de error (todas con ``ErrorEnvelope``) que un endpoint declara en ``@extend_schema``."""
    return {s: OpenApiResponse(ErrorEnvelopeSerializer, description=_ERROR_DESCRIPTIONS[s]) for s in statuses}


class GenericJsonPayloadSerializer(serializers.Serializer):
    """Cuerpo JSON genérico para vistas ``APIView`` sin serializer declarativo."""

    def to_internal_value(self, data: Any) -> Any:
        return data


class SiepJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.users.authentication.SiepJWTAuthentication"
    name = "BearerAuth"

    def get_security_definition(self, auto_schema: AutoSchema) -> dict[str, Any]:
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }


#: GET que devuelven una colección. Solo cambia el NOMBRE de la operación (``x_list`` y no ``x_retrieve``, que
#: chocaría con el del detalle ``/{id}``); la forma de la respuesta la fija el sobre, nunca un arreglo.
_COLLECTION_GET_PATHS = frozenset({
    "/api/rubrics",
    "/api/admin/cases",
    "/api/authoring/cases",
    "/api/grupos",
    "/api/assignments",
    "/api/admin/audit",
    "/api/instructor/attempts",
    "/api/simulation/catalog",
    "/api/simulation/cases",
    "/api/biblioteca/lugares",
})


class SiepAutoSchema(AutoSchema):
    """AutoSchema que provee el sobre ``ApiEnvelopeSerializer`` por defecto en ``APIView``."""

    def get_operation_id(self) -> str:
        operation_id = super().get_operation_id()
        if self.method == "GET" and self.path.rstrip("/") in _COLLECTION_GET_PATHS:
            return operation_id.removesuffix("_retrieve") + "_list"
        return operation_id

    def get_request_serializer(self) -> Any:
        override = self._get_Serializer_override("request")
        if override is not None:
            return override
        view = self.view
        if hasattr(view, "get_serializer_class") or getattr(view, "serializer_class", None) is not None:
            return super().get_request_serializer()
        if self.method in ("POST", "PUT", "PATCH"):
            return GenericJsonPayloadSerializer()
        return None

    def get_response_serializers(self) -> Any:
        override = self._get_Serializer_override("response")
        if override is not None:
            return override
        view = self.view
        if hasattr(view, "get_serializer_class") or getattr(view, "serializer_class", None) is not None:
            return super().get_response_serializers()
        return ApiEnvelopeSerializer()

    def _get_Serializer_override(self, direction: str) -> Any:
        override = getattr(self.view, "_spectacular_annotation", None)
        if not override:
            method_func = getattr(self.view, self.method.lower(), None)
            override = getattr(method_func, "_spectacular_annotation", None)
        if not override:
            return None
        if direction == "request" and "request" in override:
            return override["request"]
        if direction == "response" and "responses" in override:
            return override["responses"]
        return None


def preprocess_canonical_api_endpoints(
    endpoints: list[tuple[str, str, str, Any]],
) -> list[tuple[str, str, str, Any]]:
    """Conserva las rutas ``/api/...``, deduplica alias con barra final ``/`` y añade las que no son DRF (la salud)."""
    from shared.health_docs import HealthDocView  # perezoso: importar APIView aquí cerraría un ciclo con la configuración
    canonical_pairs: set[tuple[str, str]] = set()
    for path, _path_regex, method, _callback in endpoints:
        if path.startswith("/api/") and path != "/api/" and not path.endswith("/"):
            canonical_pairs.add((path, method))

    filtered: list[tuple[str, str, str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for path, path_regex, method, callback in endpoints:
        if not path.startswith("/api/"):
            continue
        stripped = path[:-1] if path.endswith("/") and path != "/api/" else path
        if path.endswith("/") and (stripped, method) in canonical_pairs:
            continue
        normalized_key = (stripped, method)
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        filtered.append((stripped, path_regex, method, callback))
    filtered.append(("/api/health", r"^api/health$", "GET", HealthDocView.as_view()))
    return filtered


def is_prohibited_field(name: str) -> bool:
    """¿Un campo con este nombre no debe viajar nunca en una respuesta? (E5-9: ``password*``, ``encrypted_*``, ``token``, ``secret``).

    Se compara en minúsculas y sin ``_`` ni ``-``: la base habla snake_case y la API camelCase, y el mismo secreto es
    ``encrypted_text`` en una y ``encryptedText`` en la otra. Una respuesta que existe para ENTREGAR una credencial
    (iniciar sesión, abrir un intento) y la lleva a propósito tiene que ampliar esta regla con su motivo.
    """
    flat = name.lower().replace("_", "").replace("-", "")
    return flat.startswith(("password", "encrypted")) or any(part in flat for part in ("secret", "token", "encryptionkey"))


def _ts_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return f"'{value}'" if isinstance(value, str) else str(value)


def _openapi_type_to_ts(prop: dict[str, Any]) -> str:
    if "$ref" in prop:
        ref_name = prop["$ref"].rsplit("/", 1)[-1]
        base = ref_name
    elif "allOf" in prop and len(prop["allOf"]) == 1:
        # Un anidado que admite null: drf-spectacular lo emite como allOf de una sola parte.
        base = _openapi_type_to_ts(prop["allOf"][0])
    elif "enum" in prop:
        base = " | ".join(_ts_literal(v) for v in prop["enum"])
    else:
        kind = prop.get("type", "unknown")
        if kind in ("integer", "number"):
            base = "number"
        elif kind == "string":
            base = "string"
        elif kind == "boolean":
            base = "boolean"
        elif kind == "array":
            item_ts = _openapi_type_to_ts(prop.get("items", {}))
            base = f"ReadonlyArray<{item_ts}>"
        elif kind == "object":
            additional = prop.get("additionalProperties")
            if isinstance(additional, dict):
                val_ts = _openapi_type_to_ts(additional)
                base = f"Readonly<Record<string, {val_ts}>>"
            else:
                base = "Readonly<Record<string, unknown>>"
        else:
            base = "unknown"
    if prop.get("nullable"):
        return f"{base} | null"
    return base


def _jsdoc(description: Any, indent: str = "") -> list[str]:
    """El ``description`` del esquema como comentario JSDoc de una línea (vacío si no hay)."""
    if not description:
        return []
    text = " ".join(str(description).split()).replace("*/", "* /")
    return [f"{indent}/** {text} */"]


def render_typescript_contracts(schema: dict[str, Any]) -> str:
    """Genera definiciones TypeScript deterministas desde el esquema OpenAPI 3.0."""
    lines: list[str] = [
        "// ARCHIVO GENERADO AUTOMÁTICAMENTE DESDE EL CONTRATO OPENAPI (E5-9 · DJG-6).",
        "// No editar a mano: regenerar con `node scripts/openapi/generate-types.mjs`.",
        "",
    ]

    schemas: dict[str, Any] = schema.get("components", {}).get("schemas", {})
    for name in sorted(schemas.keys()):
        defn = schemas[name]
        if "enum" in defn and "properties" not in defn:
            union = " | ".join(_ts_literal(v) for v in defn["enum"])
            lines.extend(_jsdoc(defn.get("description")))
            lines.append(f"export type {name} = {union};")
            lines.append("")
            continue
        props: dict[str, Any] = defn.get("properties", {})
        required = set(defn.get("required", []))
        lines.extend(_jsdoc(defn.get("description")))
        lines.append(f"export interface {name} {{")
        for prop_name in sorted(props.keys()):
            opt = "" if prop_name in required else "?"
            ts_type = _openapi_type_to_ts(props[prop_name])
            lines.extend(_jsdoc(props[prop_name].get("description"), "  "))
            lines.append(f"  readonly {prop_name}{opt}: {ts_type};")
        lines.append("}")
        lines.append("")

    paths: dict[str, Any] = schema.get("paths", {})
    lines.append("export interface OpenApiPaths {")
    for path_key in sorted(paths.keys()):
        methods_obj = paths[path_key]
        method_names = sorted(
            m.upper()
            for m in methods_obj.keys()
            if m.lower() in {"get", "post", "put", "patch", "delete"}
        )
        methods_union = " | ".join(f"'{m}'" for m in method_names) or "never"
        lines.append(f"  readonly '{path_key}': {methods_union};")
    lines.append("}")
    lines.append("")
    lines.append("export type OpenApiEndpointPath = keyof OpenApiPaths;")
    lines.append("")
    return "\n".join(lines)
