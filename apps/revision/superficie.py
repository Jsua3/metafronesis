AUDITORIA_POR_RUTA = {
    ("api/instructor/attempts", "GET"): "INSTRUCTOR_ATTEMPTS_VIEWED",
    ("api/instructor/attempts/recent", "GET"): "INSTRUCTOR_ATTEMPTS_VIEWED",
    ("api/instructor/attempts/<uuid:attempt_id>", "GET"): "INSTRUCTOR_ATTEMPT_VIEWED",
    ("api/instructor/attempts/<uuid:attempt_id>/feedback", "PUT"): "ATTEMPT_FEEDBACK_SAVED",
    ("api/instructor/attempts/<uuid:attempt_id>/replace", "POST"): "ATTEMPT_REPLACED",
    ("api/instructor/attempts/<uuid:attempt_id>/trace", "GET"): "traza.leer",
    ("api/instructor/attempts/<uuid:attempt_id>/rubric-evaluation", "GET"): "traza.leer",
    ("api/instructor/attempts/<uuid:attempt_id>/rubric-evaluation", "PUT"): "rubrica.evaluar",
}
