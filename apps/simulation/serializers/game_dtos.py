"""DTO de resumen de un caso para los módulos que lo consumen (grupos)."""


def case_summary(version, node_count):
    case = version.simulation_case
    return {
        "caseVersionId": version.id,
        "code": case.code,
        "title": case.title,
        "description": case.description,
        "semanticVersion": version.semantic_version,
        "nodeCount": node_count,
        "status": version.status,
    }
