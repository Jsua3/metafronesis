"""Reglas, rúbrica y revisión de sugerencias del editor."""
import re
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404

from apps.simulation.casedef.vocabulary import Activation, Bond
from apps.simulation.models import DecisionOption, SimulationNode
from apps.simulation.models.rubric import Competency, Rubric, RubricCriterion, SimulationRubricAssignment
from apps.simulation.models.vocabulary import RiskLevel
from apps.simulation.models.world import DialogueTree, MapObject
from apps.simulation.services import case_rules
from shared.exceptions import ApiError
from shared.jsonutils import read_map, write_map
from . import editor, guardas, mundo

MAX_HITOS = 40
MAX_FINALES = 10
MAX_NOMBRE = 255
MAX_TEXTO = 2000
MAX_PROFUNDIDAD = 12
TONOS = ("critical", "positive", "warning", "neutral")
COMPARADORES = {"gte", "gt", "lte", "lt", "eq"}
CLASES = {"recommended", "acceptable", "risky", "contraindicated"}
TEXTO_PROHIBIDO = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|<(?:/?[A-Za-z]|[!?])|\b(?:[A-Za-z][A-Za-z0-9+.-]{1,15}://|www\.|(?:javascript|vbscript|data|mailto)\s*:)", re.I)


def _error(campo, mensaje):
    raise ApiError("VALIDATION_ERROR", mensaje, 400, field=campo)


def _texto(valor, campo, limite, obligatorio=False, multilinea=False):
    if not isinstance(valor, str) or len(valor) > limite or (obligatorio and not valor.strip()) or TEXTO_PROHIBIDO.search(valor) or (not multilinea and ("\n" in valor or "\r" in valor)):
        _error(campo, "El texto no es válido o supera el límite permitido.")
    return valor.strip()


def _condicion(valor, profundidad=0):
    if profundidad > MAX_PROFUNDIDAD or not isinstance(valor, dict):
        return False
    for grupo in ("all", "any"):
        if grupo in valor:
            return set(valor) == {grupo} and isinstance(valor[grupo], list) and all(_condicion(elemento, profundidad + 1) for elemento in valor[grupo])
    if "not" in valor:
        return set(valor) == {"not"} and _condicion(valor["not"], profundidad + 1)
    if "milestone" in valor:
        return set(valor) == {"milestone"} and isinstance(valor["milestone"], str) and bool(valor["milestone"])
    if "persona" in valor:
        dimensiones = {"bond": {elemento.value for elemento in Bond}, "activation": {elemento.value for elemento in Activation}}
        persona = valor["persona"]
        return set(valor) == {"persona"} and isinstance(persona, dict) and bool(persona) and all(clave in dimensiones and isinstance(dato, str) and dato in dimensiones[clave] for clave, dato in persona.items())
    if "count" in valor:
        comparadores = set(valor) - {"count"}
        return isinstance(valor["count"], str) and valor["count"] in CLASES and bool(comparadores) and comparadores <= COMPARADORES and all(isinstance(valor[clave], (int, float)) and not isinstance(valor[clave], bool) for clave in comparadores)
    return False


def _referencias(valor):
    if not isinstance(valor, dict):
        return set()
    referencias = {valor["milestone"]} if isinstance(valor.get("milestone"), str) else set()
    for grupo in ("all", "any"):
        if isinstance(valor.get(grupo), list):
            for elemento in valor[grupo]:
                referencias.update(_referencias(elemento))
    referencias.update(_referencias(valor.get("not")))
    return referencias


def _lista(elementos, campo, limite, permitidos):
    if not isinstance(elementos, list) or len(elementos) > limite:
        _error(campo, "La lista no es válida o supera el límite permitido.")
    claves = set()
    for elemento in elementos:
        if not isinstance(elemento, dict) or set(elemento) - permitidos:
            _error(campo, "La lista contiene un elemento o campo no válido.")
        clave = elemento.get("key")
        if not isinstance(clave, str) or not case_rules.NAME.fullmatch(clave) or clave in claves:
            _error(campo, "La clave no es válida o está repetida.")
        claves.add(clave)
    return claves


@transaction.atomic
def actualizar_reglas(usuario, version_id, datos, seccion):
    version = mundo._revision(usuario, version_id, datos)
    reglas = read_map(version.rules)
    finales_guardados = reglas.get("endings")
    if not isinstance(finales_guardados, list):
        finales_guardados = []
    campo = {"milestones": "milestones", "risk": "riskLevel", "endings": "endings"}[seccion]
    valor = datos[campo]
    if seccion == "risk":
        if valor is not None and (not isinstance(valor, str) or valor not in {nivel.value for nivel in RiskLevel}):
            _error(campo, "El nivel de riesgo no es válido.")
    elif seccion == "milestones":
        claves = _lista(valor, campo, MAX_HITOS, {"key", "label", "description", "decisive"})
        nuevos = []
        for elemento in valor:
            decisivo = elemento.get("decisive", False)
            if not isinstance(decisivo, bool):
                _error(campo, "El campo decisive debe ser verdadero o falso.")
            nuevos.append({"key": elemento["key"], "label": _texto(elemento.get("label"), campo, MAX_NOMBRE, True), "description": _texto(elemento.get("description") if elemento.get("description") is not None else "", campo, MAX_TEXTO, multilinea=True), "decisive": decisivo})
        eliminados = {hito.key for hito in case_rules.rules_of(version).milestones} - claves
        for decision in version.decisions.all():
            if eliminados.intersection(case_rules.effects_of(decision).get("milestones", [])):
                _error(campo, "No se puede quitar un hito utilizado por una decisión.")
        for final in finales_guardados:
            if isinstance(final, dict) and eliminados.intersection(_referencias(final.get("when"))):
                _error(campo, "No se puede quitar un hito utilizado por un final.")
        valor = nuevos
    else:
        _lista(valor, campo, MAX_FINALES, {"key", "title", "message", "tone", "when", "aiSuggested"})
        declarados = {hito.key for hito in case_rules.rules_of(version).milestones}
        anteriores = {final.get("key"): final.get("aiSuggested") is True for final in finales_guardados if isinstance(final, dict)}
        nuevos = []
        for elemento in valor:
            tono = elemento.get("tone") or "neutral"
            marca = elemento.get("aiSuggested", anteriores.get(elemento["key"], False))
            if tono not in TONOS or not isinstance(marca, bool):
                _error(campo, "El tono o la marca de sugerencia no son válidos.")
            final = {"key": elemento["key"], "title": _texto(elemento.get("title"), campo, MAX_NOMBRE, True), "message": _texto(elemento.get("message"), campo, MAX_TEXTO, True, True), "tone": tono}
            if marca:
                final["aiSuggested"] = True
            condicion = elemento.get("when")
            if condicion is not None:
                if not _condicion(condicion) or _referencias(condicion) - declarados:
                    _error(campo, "La condición no es válida o menciona un hito no declarado.")
                final["when"] = condicion
            nuevos.append(final)
        valor = nuevos
    if valor is None:
        reglas.pop(campo, None)
    else:
        reglas[campo] = valor
    version.rules = write_map(reglas)
    version.save(update_fields=["rules"])
    guardas.tocar(version, usuario)
    return editor.editor(usuario, version_id)


@transaction.atomic
def aceptar(usuario, version_id, datos, tipo, elemento_id):
    version = mundo._revision(usuario, version_id, datos)
    modelo = {"nodes": SimulationNode, "decisions": DecisionOption, "dialogues": DialogueTree, "objects": MapObject}[tipo]
    filtros = {"scene_map__case_version": version} if tipo in ("dialogues", "objects") else {"case_version": version}
    elemento = get_object_or_404(modelo, pk=elemento_id, **filtros)
    if tipo == "dialogues":
        elemento.lines.filter(ai_suggested=True).update(ai_suggested=False)
    else:
        elemento.ai_suggested = False
        elemento.save(update_fields=["ai_suggested"])
    guardas.tocar(version, usuario)
    return editor.editor(usuario, version_id)


@transaction.atomic
def adoptar_rubrica(usuario, version_id, datos):
    version = mundo._revision(usuario, version_id, datos)
    identificador = datos.get("rubricId")
    catalogo = datos.get("fromCompetencies") is True
    if catalogo == (identificador is not None):
        _error("rubricId", "Elige una rúbrica o las competencias del programa.")
    if catalogo:
        competencias = list(Competency.objects.filter(active=True).order_by("sort_order", "code"))
        if not competencias:
            _error("fromCompetencies", "El catálogo no tiene competencias activas.")
        peso = (Decimal("100") / len(competencias)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        criterios = [dict(competency=competencia.code, competency_ref=competencia, title=competencia.name, description=competencia.description, weight=peso if posicion < len(competencias) - 1 else Decimal("100") - peso * posicion, display_order=posicion + 1) for posicion, competencia in enumerate(competencias)]
        nombre, descripcion, version_rubrica = "Competencias del programa", "Un criterio por cada competencia activa del programa.", "1.0"
    else:
        fuentes = Rubric.objects.filter(pk=identificador)
        if usuario.role != "ADMIN":
            fuentes = fuentes.filter(Q(created_by=usuario) | Q(created_by__role="ADMIN"))
        fuente = get_object_or_404(fuentes)
        nombre, descripcion, version_rubrica = fuente.name, fuente.description, fuente.version
        campos = ("competency", "competency_ref", "title", "description", "weight", "max_score", "active", "display_order")
        criterios = [{campo: getattr(criterio, campo) for campo in campos} for criterio in fuente.criteria.all()]
    if not any(criterio.get("active", True) for criterio in criterios) or sum((criterio["weight"] for criterio in criterios if criterio.get("active", True)), Decimal("0")) != Decimal("100"):
        _error("rubricId", "Los pesos de los criterios activos deben sumar 100.")
    version.rubrics.filter(active=True).update(active=False)
    SimulationRubricAssignment.objects.filter(case_version=version, active=True).update(active=False)
    rubrica = Rubric.objects.create(case_version=version, name=nombre, description=descripcion, version=version_rubrica, created_by=usuario)
    RubricCriterion.objects.bulk_create([RubricCriterion(rubric=rubrica, **criterio) for criterio in criterios])
    SimulationRubricAssignment.objects.create(case_version=version, rubric=rubrica, assigned_by=usuario)
    guardas.tocar(version, usuario)
    return editor.editor(usuario, version_id)
