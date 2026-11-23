"""Lectura del ciclo de vida de una versión: estado, transiciones que la persona puede aplicar, lista y última revisión."""
from apps.autoria import editor
from apps.simulation.models import CaseReview, CaseVersionStatus
from shared.policies import can
from .arbol import arbol_de

BORRADOR = CaseVersionStatus.DRAFT
EN_REVISION = CaseVersionStatus.IN_REVIEW
PUBLICADA = CaseVersionStatus.PUBLISHED
ARCHIVADA = CaseVersionStatus.ARCHIVED

#: acción -> (estados desde los que se aplica, acción de la matriz de políticas ``case.<acción>``), en el orden en que se ofrecen.
REGLAS = {
    "submit": ((BORRADOR,), "submit"),
    "approve": ((EN_REVISION,), "publish"),
    "reject": ((EN_REVISION,), "publish"),
    "archive": ((PUBLICADA,), "archive"),
    "clone": ((PUBLICADA, ARCHIVADA), "author"),
}


def transiciones_permitidas(usuario, version) -> list[str]:
    dueno = version.simulation_case.created_by_id
    return [accion for accion, (estados, politica) in REGLAS.items()
            if version.status in estados and can(usuario, "case", politica, owner_id=dueno)]


def _nombre(usuario):
    return f"{usuario.nombre} {usuario.apellido}".strip() if usuario else None


def _revision(revision):
    vista = {"requestedBy": _nombre(revision.requested_by), "requestedAt": revision.requested_at.isoformat()}
    if revision.decision:
        vista.update(decision=revision.decision, decidedBy=_nombre(revision.decided_by),
                     decidedAt=revision.decided_at.isoformat() if revision.decided_at else None, note=revision.note)
        if revision.reason:
            vista["reason"] = revision.reason
        if revision.content_reference:
            vista["contentReview"] = {"reviewer": revision.content_reviewer, "reference": revision.content_reference,
                                      "reviewedOn": revision.content_reviewed_on.isoformat() if revision.content_reviewed_on else None}
    return vista


def vista_ciclo(usuario, version) -> dict:
    """``{caseVersionId, state, allowedTransitions, checklist, blockedReason?, review?}`` como el ciclo de vida de v3."""
    permitidas = transiciones_permitidas(usuario, version)
    vista = {"caseVersionId": version.pk, "state": version.status, "allowedTransitions": permitidas,
             "checklist": editor.lista(version, list(version.nodes.all()))[0]}
    if "submit" in permitidas or "approve" in permitidas:
        problemas = arbol_de(version).problemas()
        if problemas:
            vista["blockedReason"] = {"code": problemas[0].code, "message": problemas[0].message}
    revision = CaseReview.objects.select_related("requested_by", "decided_by").filter(case_version=version).order_by("-id").first()
    if revision is not None:
        vista["review"] = _revision(revision)
    return vista
