from .attempt_api import owned
from .revision_de_respuestas import decisiones_vigentes


def progreso_de(estudiante, attempt_id) -> dict:
    intento = owned(estudiante, attempt_id)
    nodos = [evento.node_id for evento in decisiones_vigentes(intento)]
    total = intento.case_version.nodes.filter(terminal_node=False).count()
    return {"answered": len(nodos), "total": total, "percent": round(len(nodos) * 100 / total, 2) if total else 0, "visitedNodes": nodos}
