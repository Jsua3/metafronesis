AUDITORIA_POR_RUTA = {
    ("api/authoring/cases/import", "POST"): "CASE_CREATED,NODE_CREATED,NODE_UPDATED,DECISION_CREATED",
    ("api/authoring/cases/<int:case_version_id>/export", "GET"): "EXENTO: lectura de casos propios o visibles para el administrador",
    ("api/authoring/cases", "POST"): "CASE_CREATED",
    ("api/authoring/cases/<int:case_version_id>/brief", "PUT"): "CASE_BRIEF_UPDATED",
    ("api/authoring/cases/<int:case_version_id>/nodes", "POST"): "NODE_CREATED",
    ("api/authoring/cases/<int:case_version_id>/nodes/<int:node_id>", "PUT"): "NODE_UPDATED",
    ("api/authoring/cases/<int:case_version_id>/nodes/<int:node_id>", "DELETE"): "NODE_DELETED",
    ("api/authoring/cases/<int:case_version_id>/decisions", "POST"): "DECISION_CREATED",
    ("api/authoring/cases/<int:case_version_id>/decisions/<int:decision_id>", "PUT"): "DECISION_UPDATED",
    ("api/authoring/cases/<int:case_version_id>/decisions/<int:decision_id>", "DELETE"): "DECISION_DELETED",
}
