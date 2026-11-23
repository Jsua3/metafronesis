import json
import re
from decimal import Decimal, InvalidOperation

from django.db import connection, transaction
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.simulation.models import Competency, Rubric, RubricCriterion, RubricEvaluation, SimulationRubricAssignment
from apps.simulation.models.rubric import EvaluationOrigin, FormativeLevel
from apps.simulation.services.audit_service import auditable
from shared import policies
from shared.exceptions import ApiError


PESO_TOTAL = 100
LARGO_MAXIMO_NOMBRE = 255


def visibles(actor):
    consulta = Rubric.objects.select_related("case_version__simulation_case").prefetch_related("criteria")
    if policies.can(actor, "rubric", "default"):
        return consulta
    return consulta.filter(Q(created_by=actor) | Q(created_by__role=policies.ADMIN))


def buscar(rubric_id, actor, editable=False):
    rubrica = visibles(actor).filter(pk=rubric_id).first()
    if rubrica is None:
        raise Http404
    if editable and not policies.can(actor, "rubric", "edit", owner_id=rubrica.created_by_id):
        raise PermissionDenied("Esta rúbrica es de solo lectura; duplícala para personalizarla.")
    if editable and rubrica.case_version_id and rubrica.case_version.status != "DRAFT":
        raise ApiError("VERSION_NOT_EDITABLE", "La versión no se puede editar.", 409)
    return rubrica


def descriptores(criterio):
    try:
        datos = json.loads(criterio.level_descriptors_json)
    except (ValueError, TypeError):
        return {}
    if not isinstance(datos, dict):
        return {}
    return {nivel: datos[nivel].strip() for nivel in FormativeLevel.values
            if isinstance(datos.get(nivel), str) and datos[nivel].strip()}


def resumen(rubrica, actor, incluir_criterios=False):
    criterios = sorted(rubrica.criteria.all(), key=lambda criterio: (criterio.display_order, criterio.pk))
    versiones = set(SimulationRubricAssignment.objects.filter(rubric=rubrica, active=True).values_list("case_version_id", flat=True))
    if rubrica.case_version_id:
        versiones.add(rubrica.case_version_id)
    version = rubrica.case_version
    resultado = {
        "id": rubrica.pk, "ownerId": rubrica.created_by_id, "name": rubrica.name,
        "description": rubrica.description, "active": rubrica.active, "version": rubrica.version,
        "isDefault": rubrica.is_default, "totalWeight": float(sum((criterio.weight for criterio in criterios if criterio.active), Decimal(0))),
        "criteriaCount": len(criterios), "createdAt": rubrica.created_at.isoformat() if rubrica.created_at else None,
        "updatedAt": rubrica.updated_at.isoformat() if rubrica.updated_at else None,
        "caseVersion": {"id": version.pk, "title": version.simulation_case.title,
                        "semanticVersion": version.semantic_version, "status": version.status} if version else None,
        "usage": {"caseVersions": len(versiones), "evaluations": RubricEvaluation.objects.filter(rubric=rubrica, origin=EvaluationOrigin.DOCENTE).count()},
        "editable": policies.can(actor, "rubric", "edit", owner_id=rubrica.created_by_id),
    }
    if incluir_criterios:
        resultado["criteria"] = [{"id": criterio.pk, "competency": criterio.competency,
            "competencyId": criterio.competency_ref_id, "title": criterio.title, "description": criterio.description,
            "weight": float(criterio.weight), "displayOrder": criterio.display_order, "active": criterio.active,
            "levelDescriptors": descriptores(criterio)} for criterio in criterios]
    return resultado


def validar_pesos(rubrica):
    pesos = list(rubrica.criteria.filter(active=True).values_list("weight", flat=True))
    if not pesos or sum(pesos, Decimal(0)) != PESO_TOTAL:
        raise ApiError("RUBRIC_WEIGHTS", "Los pesos de los criterios activos deben sumar 100.")


def validar_descriptores(datos, indice):
    if datos is None:
        return {}
    if not isinstance(datos, dict) or any(nivel not in FormativeLevel.values for nivel in datos):
        raise ApiError("VALIDATION_ERROR", "Los descriptores deben corresponder a niveles válidos.", field="levelDescriptors", index=indice)
    resultado = {}
    for nivel, texto in datos.items():
        if texto is None:
            continue
        if not isinstance(texto, str) or len(texto.strip()) > 600 or re.search(r"<[^>]*>|https?://|[\x00-\x08\x0b\x0c\x0e-\x1f]", texto, re.I):
            raise ApiError("VALIDATION_ERROR", "El descriptor debe ser texto plano de hasta 600 caracteres.", field="levelDescriptors", index=indice)
        if texto.strip():
            resultado[nivel] = texto.strip()
    return resultado


def guardar_criterios(rubrica, criterios):
    if not isinstance(criterios, list):
        raise ApiError("VALIDATION_ERROR", "Los criterios deben ser una lista.")
    conservados = []
    for indice, datos in enumerate(criterios):
        if not isinstance(datos, dict):
            raise ApiError("VALIDATION_ERROR", "Cada criterio debe ser un objeto.")
        try:
            peso = Decimal(str(datos.get("weight", 0)))
            if not peso.is_finite() or peso < 0 or peso > PESO_TOTAL or peso.as_tuple().exponent < -2:
                raise ValueError
            orden = int(datos.get("displayOrder", indice + 1))
        except (ValueError, TypeError, InvalidOperation):
            raise ApiError("VALIDATION_ERROR", "El peso o el orden del criterio no es válido.")
        criterio = rubrica.criteria.filter(pk=datos.get("id")).first() if datos.get("id") else None
        if datos.get("id") and criterio is None:
            raise ApiError("VALIDATION_ERROR", "El criterio no pertenece a la rúbrica.")
        if criterio is None:
            criterio = RubricCriterion(rubric=rubrica)
        texto = str(datos.get("competency") or datos.get("title") or "").strip()[:100]
        anterior = criterio.competency
        criterio.competency = texto
        if "competencyId" in datos:
            identificador = datos["competencyId"]
            competencia = Competency.objects.filter(pk=identificador).first() if identificador else None
            if identificador and competencia is None:
                raise ApiError("VALIDATION_ERROR", "La competencia no existe.")
            criterio.competency_ref = competencia
        elif texto != anterior:
            criterio.competency_ref = Competency.objects.filter(code=texto).first()
        criterio.title = str(datos.get("title") or datos.get("name") or "").strip()[:LARGO_MAXIMO_NOMBRE]
        criterio.description = str(datos.get("description") or "").strip()
        criterio.weight = peso
        criterio.max_score = int(peso)
        if not isinstance(datos.get("active", True), bool):
            raise ApiError("VALIDATION_ERROR", "El estado del criterio debe ser verdadero o falso.")
        criterio.active = datos.get("active", True)
        criterio.display_order = orden
        if "levelDescriptors" in datos:
            criterio.level_descriptors_json = json.dumps(validar_descriptores(datos["levelDescriptors"], indice), ensure_ascii=False)
        criterio.save()
        conservados.append(criterio.pk)
    rubrica.criteria.exclude(pk__in=conservados).update(active=False)


def bloquear_predeterminada():
    """Serializa las operaciones que pueden modificar la r?brica predeterminada."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [236001])


def fijar_default(rubrica, actor):
    if not policies.can(actor, "rubric", "default"):
        raise PermissionDenied("Solo un administrador fija la rúbrica predeterminada.")
    if not rubrica.active:
        raise ApiError("VALIDATION_ERROR", "La rúbrica predeterminada debe estar activa.")
    validar_pesos(rubrica)
    Rubric.objects.exclude(pk=rubrica.pk).filter(is_default=True).update(is_default=False)
    rubrica.is_default = True
    rubrica.save(update_fields=["is_default"])


@transaction.atomic
@auditable("RUBRIC_UPDATED", "RUBRIC", resource_id=lambda args, kwargs, result: result.pk,
           context=lambda args, kwargs, result: {"rubricId": result.pk, "changed": [campo for campo in ("name", "description", "version", "active", "criteria", "isDefault") if campo in args[1]]})
def editar(rubric_id, datos, actor):
    bloquear_predeterminada()
    rubrica = buscar(rubric_id, actor, editable=True)
    for campo in ("name", "description", "version"):
        if campo in datos:
            valor = datos[campo]
            if not isinstance(valor, str) or (campo == "name" and not valor.strip()) or (campo == "name" and len(valor) > LARGO_MAXIMO_NOMBRE) or (campo == "version" and len(valor) > 30):
                raise ApiError("VALIDATION_ERROR", "El campo de la rúbrica no es válido.", field=campo)
            setattr(rubrica, campo, valor.strip())
    if "active" in datos:
        if not isinstance(datos["active"], bool):
            raise ApiError("VALIDATION_ERROR", "El estado debe ser verdadero o falso.")
        rubrica.active = datos["active"]
        if not rubrica.active:
            rubrica.is_default = False
    rubrica.updated_at = timezone.now()
    rubrica.save()
    if "criteria" in datos:
        guardar_criterios(rubrica, datos["criteria"])
    if rubrica.active:
        validar_pesos(rubrica)
    if datos.get("isDefault"):
        fijar_default(rubrica, actor)
    return Rubric.objects.get(pk=rubrica.pk)


@transaction.atomic
@auditable("RUBRIC_ACTIVATED", "RUBRIC", resource_id=lambda args, kwargs, result: result.pk,
           context=lambda args, kwargs, result: {"rubricId": result.pk, "active": result.active})
def cambiar_estado(rubric_id, activo, actor):
    bloquear_predeterminada()
    rubrica = buscar(rubric_id, actor, editable=True)
    if activo:
        validar_pesos(rubrica)
    rubrica.active = activo
    if not activo:
        rubrica.is_default = False
    rubrica.updated_at = timezone.now()
    rubrica.save()
    return rubrica


@transaction.atomic
@auditable("RUBRIC_CREATED", "RUBRIC", resource_id=lambda args, kwargs, result: result.pk,
           context=lambda args, kwargs, result: {"rubricId": result.pk, "sourceId": args[0]})
def duplicar(rubric_id, actor):
    origen = buscar(rubric_id, actor)
    copia = Rubric.objects.create(name=("Copia de " + origen.name)[:LARGO_MAXIMO_NOMBRE], description=origen.description,
                                 active=False, version=origen.version, created_by=actor, updated_at=timezone.now())
    for criterio in origen.criteria.all():
        criterio.pk = None
        criterio.rubric = copia
        criterio.save(force_insert=True)
    return copia


@transaction.atomic
@auditable("RUBRIC_UPDATED", "RUBRIC", resource_id=lambda args, kwargs, result: result.pk,
           context=lambda args, kwargs, result: {"rubricId": result.pk, "changed": ["isDefault"]})
def predeterminar(rubric_id, actor):
    bloquear_predeterminada()
    rubrica = buscar(rubric_id, actor)
    fijar_default(rubrica, actor)
    rubrica.updated_at = timezone.now()
    rubrica.save(update_fields=["updated_at"])
    return rubrica
