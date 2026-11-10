AUDITORIA_POR_RUTA = {
    ("api/sesiones", "GET"): "EXENTO: lectura de sesiones propias sin datos de convocados",
    ("api/sesiones/<int:pk>", "GET"): "EXENTO: lectura de sesión propia sin datos de convocados",
    ("api/sesiones/<int:pk>/convocados", "POST"): "CONVOCADOS_AGREGADOS",
    ("api/sesiones/<int:pk>/convocados/<int:estudiante_id>", "DELETE"): "CONVOCADO_RETIRADO",
    ("api/sesiones", "POST"): "SESION_CREADA",
    ("api/sesiones/<int:pk>/iniciar", "POST"): "SESION_INICIADA",
    ("api/sesiones/<int:pk>/finalizar", "POST"): "SESION_FINALIZADA",
}
