AUDITORIA_POR_RUTA = {
    ("api/rubrics", "POST"): "RUBRIC_CREATED",
    ("api/rubrics/<int:rubric_id>", "GET"): "EXENTO: consulta de criterios de una rúbrica sin datos de personas",
    ("api/rubrics/case-versions/<int:case_version_id>", "PUT"): "RUBRIC_UPDATED",
}
