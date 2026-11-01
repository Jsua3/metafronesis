"""Capa de políticas de acceso: una sola tabla decide quién puede qué (E2-1, §2.5 del plan).

``MATRIX`` mapea ``(recurso, acción)`` a ``{rol: alcance}``; un rol ausente no puede. Los
alcances son:

- ``"all"``: el rol puede sin más condición.
- ``"own"``: solo si el actor es el dueño del recurso (``owner_id == actor.id``).
- ``"member"``: solo si el actor tiene alcance sobre la persona o el grupo implicado (el
  llamador lo resolvió y pasa ``member=True``): p. ej. el estudiante tiene membresía
  ``ACTIVE`` en un grupo del profesor.

El módulo es **puro**: no consulta la base de datos ni importa servicios ni vistas (regla de
arquitectura ``policies-sin-servicios``). Quien llama aporta los hechos de propiedad o de
alcance. Las clases de permiso de DRF se generan de esta misma tabla
(``shared.permissions.policy_permission``) y la tabla se versiona como evidencia de RF-02 y
RNF-002 en ``shared/policy-matrix.json`` (se regenera con ``python -m shared.policies --write``).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ADMIN = "ADMIN"
PROFESOR = "PROFESOR"
ESTUDIANTE = "ESTUDIANTE"
ROLES = (ESTUDIANTE, PROFESOR, ADMIN)

ALL = "all"
OWN = "own"
MEMBER = "member"

MATRIX: dict[tuple[str, str], dict[str, str]] = {
    # Intento propio: jugar, pausar, bitácora y reporte. Nadie más lo lee por token (D-11).
    ("attempt", "play"): {ESTUDIANTE: OWN},
    # Intento ajeno: traza y evaluación. El profesor solo de estudiantes con membresía ACTIVE.
    ("attempt", "review"): {PROFESOR: MEMBER, ADMIN: ALL},
    # Reporte de finalización (sin el token del intento): su dueño o quien puede revisarlo.
    ("attempt", "report"): {ESTUDIANTE: OWN, PROFESOR: MEMBER, ADMIN: ALL},
    # Caso: crear y editar, enviar a revisión, archivar. Publicar solo el ADMIN, tras revisión.
    ("case", "author"): {PROFESOR: OWN, ADMIN: ALL},
    ("case", "submit"): {PROFESOR: OWN, ADMIN: ALL},
    ("case", "archive"): {PROFESOR: OWN, ADMIN: ALL},
    ("case", "publish"): {ADMIN: ALL},
    # Grupo: el profesor administra los suyos; el ADMIN solo los lista.
    ("group", "manage"): {PROFESOR: OWN},
    ("group", "list"): {PROFESOR: OWN, ADMIN: ALL},
    # Membresía: invitar (profesor sus grupos, ADMIN); aceptar o rechazar la propia (o ADMIN activa).
    ("membership", "invite"): {PROFESOR: OWN, ADMIN: ALL},
    ("membership", "respond"): {ESTUDIANTE: OWN, ADMIN: ALL},
    # Asignación de casos a grupos: el profesor crea y cierra las de sus grupos; el ADMIN solo lista.
    ("assignment", "manage"): {PROFESOR: OWN},
    ("assignment", "list"): {PROFESOR: OWN, ADMIN: ALL},
    # Rúbrica: leer las visibles; editar las suyas (el ADMIN todas).
    ("rubric", "read"): {PROFESOR: ALL, ADMIN: ALL},
    ("rubric", "edit"): {PROFESOR: OWN, ADMIN: ALL},
    # La rúbrica global por defecto la fija solo el ADMIN.
    ("rubric", "default"): {ADMIN: ALL},
    # Competencias (E3-9): el personal lee el catálogo; solo el ADMIN lo amplía.
    ("competency", "read"): {PROFESOR: ALL, ADMIN: ALL},
    ("competency", "manage"): {ADMIN: ALL},
    # Usuarios: crear, activar, cambiar rol.
    ("user", "manage"): {ADMIN: ALL},
    # Analítica: agregados de sus grupos (celda mínima k ≥ 5) o todos (ADMIN).
    ("analytics", "read"): {PROFESOR: MEMBER, ADMIN: ALL},
    # Auditoría: solo ADMIN.
    ("audit", "read"): {ADMIN: ALL},
    # Consentimiento al aviso de contenido (S3-2a, C12): leer el propio estado y aceptarlo o retirarlo. Solo el estudiante, y el
    # suyo: el ADMIN y el docente no juegan, así que no tienen un consentimiento que dar.
    ("consent", "read"): {ESTUDIANTE: OWN},
    ("consent", "record"): {ESTUDIANTE: OWN},
    # Lecturas de todo usuario autenticado.
    ("catalog", "read"): {ESTUDIANTE: ALL, PROFESOR: ALL, ADMIN: ALL},
    ("account", "self"): {ESTUDIANTE: ALL, PROFESOR: ALL, ADMIN: ALL},
}

#: Hechos de propiedad o alcance que un llamador debe aportar según el alcance de la fila.
_SCOPES = {
    ALL: "sin más condición",
    OWN: "el actor es el dueño del recurso (owner_id)",
    MEMBER: "el actor tiene alcance sobre la persona o el grupo (member)",
}


def _scopes_of(resource: str, action: str) -> dict[str, str]:
    try:
        return MATRIX[(resource, action)]
    except KeyError:
        # Un error de programación (recurso o acción mal escritos) no se disfraza de «denegado».
        raise KeyError(f"política desconocida: ({resource!r}, {action!r})") from None


def has_role(actor, *roles: str) -> bool:
    """¿El actor está autenticado y tiene alguno de esos roles?"""
    return bool(
        actor is not None
        and getattr(actor, "is_authenticated", False)
        and getattr(actor, "role", None) in roles
    )


def allowed_roles(resource: str, action: str) -> frozenset[str]:
    """Roles que tienen algún alcance sobre la acción (la puerta de rol de una vista)."""
    return frozenset(_scopes_of(resource, action))


def scope_of(actor, resource: str, action: str) -> str | None:
    """El alcance del actor sobre la acción (``all``/``own``/``member``) o ``None``.

    Sirve para filtrar listas con el mismo criterio que ``can``: ``own`` → solo lo suyo.
    """
    scopes = _scopes_of(resource, action)
    if actor is None or not getattr(actor, "is_authenticated", False):
        return None
    return scopes.get(getattr(actor, "role", None))


def can(actor, resource: str, action: str, *, owner_id=None, member: bool = False) -> bool:
    """¿Puede el actor hacer ``action`` sobre ``resource``?

    ``owner_id`` es el dueño del recurso (alcance ``own``) y ``member`` indica que el actor
    tiene alcance sobre la persona o el grupo (alcance ``member``).
    """
    scopes = _scopes_of(resource, action)
    if actor is None or not getattr(actor, "is_authenticated", False):
        return False
    scope = scopes.get(getattr(actor, "role", None))
    if scope is None:
        return False
    if scope == ALL:
        return True
    if scope == OWN:
        return owner_id is not None and owner_id == getattr(actor, "id", None)
    if scope == MEMBER:
        return bool(member)
    return False


def render_matrix() -> dict:
    """La matriz como documento determinista: es la evidencia versionada de RF-02 y RNF-002."""
    rows = []
    for (resource, action) in sorted(MATRIX):
        scopes = MATRIX[(resource, action)]
        rows.append({
            "resource": resource,
            "action": action,
            **{role: scopes.get(role) for role in ROLES},
        })
    return {"version": 1, "roles": list(ROLES), "scopes": dict(_SCOPES), "rows": rows}


def _main(argv: list[str]) -> int:
    document = json.dumps(render_matrix(), ensure_ascii=False, indent=2) + "\n"
    if "--write" in argv:
        target = Path(__file__).with_name("policy-matrix.json")
        target.write_text(document, encoding="utf-8", newline="\n")
        print(f"escrito {target}")
    else:
        sys.stdout.write(document)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
