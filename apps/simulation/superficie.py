AUDITORIA_POR_RUTA = {
    ("api/simulation/attempts/<uuid:pk>/revisit", "POST"): "ATTEMPT_REVISITED",
    ("api/simulation/attempts/<uuid:pk>/progress", "GET"): "EXENTO: el estudiante consulta el progreso de su propio intento",
    ("api/rubrics", "POST"): "RUBRIC_CREATED",
    ("api/rubrics/<int:rubric_id>", "GET"): "EXENTO: consulta de criterios de una rúbrica sin datos de personas",
    ("api/rubrics/case-versions/<int:case_version_id>", "PUT"): "RUBRIC_UPDATED",
    ("api/simulation/attempts/<uuid:pk>/result", "GET"): "EXENTO: el estudiante consulta el resultado de su propio intento",
}
