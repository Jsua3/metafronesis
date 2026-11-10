AUDITORIA_POR_RUTA = {
    ("api/instructor/attempts", "GET"): "INSTRUCTOR_ATTEMPTS_VIEWED",
    ("api/instructor/attempts/<uuid:attempt_id>", "GET"): "INSTRUCTOR_ATTEMPT_VIEWED",
    ("api/instructor/attempts/<uuid:attempt_id>/feedback", "PUT"): "ATTEMPT_FEEDBACK_SAVED",
}
