"""Siembra de la SONDA de CSP (plan 03, S2-4): un caso PUBLICADO cuyos textos llevan marcado, solo en la BD desechable.

Para probar que un texto de caso con ``<script>`` no se ejecuta hace falta que el marcado esté en la base de datos. La API
de autoría lo impide donde importa: el contexto, los objetivos, las pistas y los personajes pasan por la regla de texto
plano, y la compuerta de publicación rechaza cualquier etiqueta en los demás textos (``DSL.TEXT_MARKUP``). Por eso se
siembra en dos tiempos, como llegaría un dato viejo o escrito por otra vía:

1. se importa una copia del caso demo (documento exportado, código y título propios) y se publica por la API, con textos
   benignos: nace un caso aparte, completo y jugable;
2. ya publicado, se AÑADE el marcado a los textos que ven las personas (título, contexto, objetivos, escenas, opciones,
   objetos, diálogos, personajes, pistas y herramientas) con ``UPDATE`` directos: ni la validación ni el sello lo ven.

``scripts/test-csp-probe.mjs`` la llama una vez, con los ajustes de la sonda, antes de lanzar Playwright; la prueba 7 de
``frontend/e2e/csp-probe.e2e.ts`` asigna el caso al grupo demo y lo recorre como administrador y como estudiante.
Se niega con cualquier otro ajuste: nunca escribe marcado en una base de desarrollo o de producción.

Los modelos se importan dentro de las funciones: ``shared`` no depende de ``apps`` al importarse (como ``shared.testing``).
"""
import datetime
import json

from django.contrib.auth import get_user_model
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from shared.dev_only import ajustes_en_uso
from shared.policies import ADMIN

SOURCE_CODE = "SIM-VBG-001"
PROBE_CODE = "SONDA-CSP-001"
PROBE_TITLE = "Caso de la sonda de CSP"
SUPPORT_RESOURCE = "Recurso de apoyo de la sonda (no verificado)"

#: El texto hostil: un ``<script>`` y una imagen con manejador en línea. La prueba 7 de la sonda busca estos mismos textos.
SCRIPT = "<script>alert(1)</script>"
IMG = '<img src=x onerror="window.__siepXss=1">'
PAYLOAD = f"{SCRIPT} {IMG}"

CHECKLIST = {
    "contentOriginal": True,
    "ethicsReviewed": True,
    "safetyProtocols": True,
    "noStigmatizing": True,
    "triggerWarnings": True,
    "accessibilityOk": True,
    "scopeEducational": True,
}


def _poisoned_tables():
    """Los textos que ven las personas, por modelo: (modelo, filtro de la versión, columnas). Nunca claves ni referencias."""
    from apps.simulation.models import (
        CaseCharacter,
        ClinicalTool,
        DecisionOption,
        DialogueChoice,
        DialogueLine,
        DialogueTree,
        MapObject,
        SceneHint,
        SceneMap,
        SimulationNode,
    )

    return (
        (SimulationNode, "case_version_id", ("title", "narrative", "decision_prompt", "warning_message")),
        (
            DecisionOption, "case_version_id",
            ("text", "immediate_feedback", "prohibition_reason", "consequence_text", "theory_basis", "feedback_text"),
        ),
        (SceneMap, "case_version_id", ("title",)),
        (SceneHint, "scene_map__case_version_id", ("text",)),
        (CaseCharacter, "case_version_id", ("display_name", "role_label")),
        (MapObject, "scene_map__case_version_id", ("label", "interaction_prompt", "interaction_text")),
        (DialogueTree, "scene_map__case_version_id", ("speaker_name",)),
        (DialogueLine, "dialogue_tree__scene_map__case_version_id", ("speaker_name", "text")),
        (DialogueChoice, "dialogue_tree__scene_map__case_version_id", ("text",)),
        (ClinicalTool, "case_version_id", ("label", "description")),
    )


def require_csp_probe_settings():
    """Se niega salvo con los ajustes de la sonda: el marcado hostil jamás entra en una base que no sea la desechable de la sonda."""
    if not ajustes_en_uso().endswith(".csp_probe"):
        raise CommandError(
            # BORRADOR: mensaje de consola para quien opera, pendiente de revisión.
            "La siembra de la sonda de CSP solo corre con psychosim.settings.csp_probe (npm run test:csp)."
        )


def _expect(response, statuses, what):
    if response.status_code not in statuses:
        raise CommandError(f"{what}: HTTP {response.status_code} {getattr(response, 'data', response.content)}")
    return response


def _revision_of(client, base):
    """Los argumentos de una mutación del caso con su revisión vigente (cabecera ``X-Case-Revision``).

    Con ``REVISION_REQUIRED`` (valor final de F9-10) toda mutación de autoría la pide, y ni la importación ni el ciclo de vida
    la devuelven: se lee del editor justo antes de cada una. Sin la bandera es opcional, pero mandarla no estorba.
    """
    editor = _expect(client.get(f"{base}/editor"), (200,), "leer el editor del caso")
    return {"HTTP_X_CASE_REVISION": str(editor.data["data"]["revision"])}


def _content_review():
    """La constancia de revisión de contenido que pide la aprobación con ``REVIEW_WORKFLOW_STRICT`` (valor final de F9-10).

    A propósito no parece una real. La fecha es la de ayer: el servidor rechaza una posterior a hoy y su reloj y el de esta
    máquina pueden quedar a un día.
    """
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    return {
        "reviewer": "Revisión de la sonda (no verificada)",
        "reviewedOn": yesterday.isoformat(),
        "reference": "Acta de la sonda (no real)",
    }


def _publish_copy(admin):
    """Importa una copia del caso demo con código y título propios y la publica por la API, con textos benignos."""
    from apps.simulation.models import CaseVersion
    from apps.simulation.services.authoring import definition_io

    source = CaseVersion.objects.get(simulation_case__code=SOURCE_CODE, status="PUBLISHED")
    document = definition_io.export_definition(source.id)
    document["caso"]["id"] = PROBE_CODE
    document["caso"]["titulo"] = PROBE_TITLE
    # La lista marca «protocolos de seguridad» y la compuerta (S3-3) pide al menos una escena con un recurso de apoyo: el caso
    # demo no trae ninguno, así que la copia lleva uno de prueba. A propósito no es un recurso real.
    document["x-siep"]["escenas"][0]["apoyo"] = [SUPPORT_RESOURCE]
    client = APIClient()
    client.force_authenticate(user=admin)
    imported = _expect(
        client.generic(
            "POST", "/api/authoring/cases/import",
            data=json.dumps(document, ensure_ascii=False).encode("utf-8"), content_type="application/json",
        ),
        (201,), "importar la copia del caso",
    )
    version_id = imported.data["data"]["caseVersionId"]
    base = f"/api/authoring/cases/{version_id}"
    _expect(
        client.put(f"{base}/checklist", CHECKLIST, format="json", **_revision_of(client, base)), (200,), "lista de publicación"
    )
    _expect(
        client.post(f"{base}/lifecycle", {"action": "submit"}, format="json", **_revision_of(client, base)),
        (200, 201), "enviar a revisión",
    )
    _expect(
        client.post(
            f"{base}/lifecycle",
            {"action": "approve", "note": "Caso de la sonda de CSP.", "contentReview": _content_review()},
            format="json", **_revision_of(client, base),
        ),
        (200, 201), "aprobar y publicar",
    )
    return CaseVersion.objects.select_related("simulation_case").get(pk=version_id)


def _append_payload(model, queryset, columns):
    """Añade el marcado al final de cada columna (cortado al largo de la columna) con un UPDATE por fila; devuelve cuántas filas."""
    rows = list(queryset)
    for row in rows:
        values = {}
        for name in columns:
            limit = model._meta.get_field(name).max_length
            text = f"{getattr(row, name) or ''} {PAYLOAD}".strip()
            values[name] = text[:limit] if limit else text
        model.objects.filter(pk=row.pk).update(**values)
    return len(rows)


def _poison(version):
    """Escribe el marcado en los textos del caso YA publicado. Devuelve cuántas filas tocó en cada tabla."""
    from apps.simulation.models import CaseVersion, SimulationCase

    touched = {}
    case = version.simulation_case
    SimulationCase.objects.filter(pk=case.pk).update(
        title=f"{case.title} {PAYLOAD}"[:255], description=f"{case.description or ''} {PAYLOAD}".strip(),
    )
    objectives = json.loads(version.learning_objectives or "[]")
    CaseVersion.objects.filter(pk=version.pk).update(
        narrative_context=f"{version.narrative_context or ''} {PAYLOAD}".strip(),
        learning_objectives=json.dumps([f"{item} {PAYLOAD}" for item in objectives], ensure_ascii=False),
    )
    touched["simulation_cases"], touched["case_versions"] = 1, 1
    for model, lookup, columns in _poisoned_tables():
        touched[model._meta.db_table] = _append_payload(model, model.objects.filter(**{lookup: version.pk}), columns)
    return touched


def seed_markup_case():
    """Deja el caso publicado con marcado en sus textos. Devuelve ``{caseVersionId, caseId, title, touched}``."""
    require_csp_probe_settings()
    from apps.simulation.models import SimulationCase

    admin = get_user_model().objects.filter(role=ADMIN, activo=True).order_by("id").first()
    if admin is None:
        raise CommandError("No hay un ADMIN activo: ¿se sembró la base con bootstrap_dev_db?")
    version = _publish_copy(admin)
    touched = _poison(version)
    case = SimulationCase.objects.get(pk=version.simulation_case_id)
    return {"caseVersionId": version.id, "caseId": case.id, "title": case.title, "touched": touched}
