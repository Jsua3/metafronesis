from apps.simulation.models import AuditLog
from apps.simulation.services.audit_service import auditable


@auditable("AUDIT_VIEWED", "AUDIT", resource_id_param_index=-1)
def consultar(filtros):
    registros = AuditLog.objects.all()
    if "action" in filtros:
        registros = registros.filter(action=filtros["action"])
    if "actorId" in filtros:
        registros = registros.filter(actor_id=filtros["actorId"])
    if "desde" in filtros:
        registros = registros.filter(occurred_at__date__gte=filtros["desde"])
    if "hasta" in filtros:
        registros = registros.filter(occurred_at__date__lte=filtros["hasta"])
    total = registros.count()
    pagina = filtros["page"]
    inicio = (pagina - 1) * 50
    filas = registros.order_by("-occurred_at", "-id")[inicio:inicio + 50]
    items = [{
        "id": fila.id, "actorId": fila.actor_id, "action": fila.action,
        "occurredAt": fila.occurred_at.isoformat(),
    } for fila in filas]
    return {"items": items, "page": pagina, "pageSize": 50,
            "coverage": {"shown": len(items), "total": total}}
