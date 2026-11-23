AUDITORIA_POR_RUTA = {
    ("api/authoring/generations/status", "GET"): "EXENTO: consulta del estado propio",
    ("api/authoring/generations", "POST"): "AI_GENERATION_CREATED",
    ("api/authoring/generations/<uuid:gen_id>", "GET"): "EXENTO: lectura de la generación propia",
    ("api/authoring/generations/<uuid:gen_id>", "DELETE"): "AI_GENERATION_CANCELLED",
    ("api/authoring/generations/<uuid:gen_id>/skeleton", "POST"): "AI_GENERATION_STAGE",
    ("api/authoring/generations/<uuid:gen_id>/scenes/<slug:clave>", "POST"): "AI_GENERATION_STAGE",
    ("api/authoring/generations/<uuid:gen_id>/assemble", "POST"): "AI_GENERATION_STAGE",
    ("api/simulation/ai-assistant", "POST"): "AI_ASSISTANT_QUERY",
    ("api/authoring/cases/<int:case_version_id>/assistant/status", "GET"): "EXENTO: consulta de configuración del caso propio",
    ("api/authoring/cases/<int:case_version_id>/assistant/propose", "POST"): "AI_AUTHORING_PROPOSE",
    ("api/authoring/cases/<int:case_version_id>/assistant/guide", "POST"): "AI_AUTHORING_GUIDE",
}
