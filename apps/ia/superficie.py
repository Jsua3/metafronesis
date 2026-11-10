AUDITORIA_POR_RUTA = {
    ("api/simulation/ai-assistant", "POST"): "AI_ASSISTANT_QUERY",
    ("api/authoring/cases/<int:case_version_id>/assistant/status", "GET"): "EXENTO: consulta de configuración del caso propio",
    ("api/authoring/cases/<int:case_version_id>/assistant/propose", "POST"): "AI_AUTHORING_PROPOSE",
    ("api/authoring/cases/<int:case_version_id>/assistant/guide", "POST"): "AI_AUTHORING_GUIDE",
}
