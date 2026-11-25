"""Autoría compartida de casos: quién es el autor, quién editó el caso y qué puede hacer cada docente con cada versión.

- El **autor** de un caso es quien lo creó (``SimulationCase.created_by``) y no cambia nunca.
- Cada versión tiene su **creador** (``CaseVersion.created_by``): quien creó el caso o quien clonó una versión publicada.
  Cuando otro docente edita un caso, lo que hace es una versión nueva del mismo caso (un borrador clonado de una
  publicada); al publicarla, sustituye a la anterior y el caso conserva su autor.
- **«Editado por»**: las personas distintas del autor que crearon alguna versión del caso, en el orden de su primera
  versión. No hay un campo nuevo: sale de ``CaseVersion.created_by``.

Qué puede el PROFESOR (el ADMIN lo puede todo, como siempre):

- Ver: todas las versiones de sus casos salvo los borradores ajenos, las versiones que él creó en casos ajenos y las
  versiones publicadas de los casos ajenos. Un borrador es privado de quien lo creó.
- Editar un borrador y enviarlo a revisión: solo los borradores que creó él (el dueño de un borrador es su creador).
- Crear una versión nueva (clonar): de las publicadas de cualquier caso, y de las archivadas de los suyos.
- Archivar: solo en sus casos (el dueño es el autor del caso). Publicar: solo el ADMIN.

Las comprobaciones usan la matriz de políticas (``case.author``, ``case.submit``, ``case.archive``) con el dueño que toca a
cada acción; la matriz no cambia.
"""
from django.db.models import F, Q

from apps.simulation.models import CaseVersion, CaseVersionStatus
from apps.users.permisos import puede_autorar
from shared.policies import ADMIN, PROFESOR, can, scope_of

BORRADOR = CaseVersionStatus.DRAFT
PUBLICADA = CaseVersionStatus.PUBLISHED
ARCHIVADA = CaseVersionStatus.ARCHIVED


def nombre(usuario) -> str:
    """El nombre visible de una persona; su correo si aún no tiene nombre."""
    completo = f"{usuario.nombre or ''} {usuario.apellido or ''}".strip()
    return completo or usuario.email


def persona(usuario) -> dict:
    return {"id": usuario.pk, "nombre": nombre(usuario)}


def autor_id(version) -> int:
    """El autor del caso de la versión: quien creó el caso."""
    return version.simulation_case.created_by_id


def creador_id(version) -> int:
    """El dueño de la versión: quien la creó (o la clonó)."""
    return version.created_by_id


def filtro_visibles(usuario) -> Q:
    """Las versiones que ve un PROFESOR (la misma regla que ``puede_ver``, para filtrar consultas)."""
    return (Q(created_by=usuario) | Q(status=PUBLICADA)
            | (Q(simulation_case__created_by=usuario) & ~Q(status=BORRADOR)))


def puede_ver(usuario, version) -> bool:
    rol = getattr(usuario, "role", None)
    if rol == ADMIN:
        return True
    if rol != PROFESOR:
        return False
    return (creador_id(version) == usuario.pk or version.status == PUBLICADA
            or (autor_id(version) == usuario.pk and version.status != BORRADOR))


def puede_editar(usuario, version) -> bool:
    """Un borrador lo edita quien lo creó (y el ADMIN)."""
    return version.status == BORRADOR and can(usuario, "case", "author", owner_id=creador_id(version))


def puede_enviar(usuario, version) -> bool:
    """Un borrador lo envía a revisión quien lo creó (y el ADMIN)."""
    return version.status == BORRADOR and can(usuario, "case", "submit", owner_id=creador_id(version))


def puede_archivar(usuario, version) -> bool:
    """Una versión publicada la archiva el autor del caso (y el ADMIN)."""
    return version.status == PUBLICADA and can(usuario, "case", "archive", owner_id=autor_id(version))


def puede_crear_version(usuario, version, autoriza: bool | None = None) -> bool:
    """¿Puede clonar la versión en un borrador nuevo del mismo caso?

    De una publicada, cualquiera que autore casos (en un caso ajeno, con permiso de autoría: ``autoriza``); de una
    archivada, solo el autor del caso (y el ADMIN). ``autoriza`` evita repetir la consulta del permiso en una lista.
    """
    if version.status == ARCHIVADA:
        return can(usuario, "case", "author", owner_id=autor_id(version))
    if version.status != PUBLICADA or scope_of(usuario, "case", "author") is None:
        return False
    if getattr(usuario, "role", None) == ADMIN or autor_id(version) == usuario.pk:
        return True
    if autoriza is None:
        autoriza = puede_autorar(usuario)
    return autoriza


def permitido(usuario, version, accion: str) -> bool:
    """¿Puede ``usuario`` aplicar ``accion`` (la de la matriz ``case.<accion>``) a la versión?

    ``author`` es leerla (validar, ver su ciclo); ``submit`` y ``archive`` miran al dueño que toca; ``publish`` es del ADMIN.
    """
    if accion == "author":
        return puede_ver(usuario, version)
    if accion == "submit":
        return can(usuario, "case", "submit", owner_id=creador_id(version))
    if accion == "archive":
        return can(usuario, "case", "archive", owner_id=autor_id(version))
    return can(usuario, "case", accion, owner_id=autor_id(version))


def editores_por_caso(caso_ids) -> dict[int, list[dict]]:
    """``{caso_id: [{id, nombre}, …]}``: quienes, sin ser el autor, crearon alguna versión de cada caso, en el orden de su
    primera versión. Una sola consulta para toda una lista."""
    versiones = (CaseVersion.objects.filter(simulation_case_id__in=set(caso_ids))
                 .exclude(created_by=F("simulation_case__created_by"))
                 .select_related("created_by").order_by("created_at", "pk"))
    editores: dict[int, list[dict]] = {}
    vistos: set[tuple[int, int]] = set()
    for version in versiones:
        clave = (version.simulation_case_id, version.created_by_id)
        if clave in vistos:
            continue
        vistos.add(clave)
        editores.setdefault(version.simulation_case_id, []).append(persona(version.created_by))
    return editores


def editores(caso) -> list[dict]:
    """«Editado por» de un caso: ver ``editores_por_caso``."""
    return editores_por_caso([caso.pk]).get(caso.pk, [])
