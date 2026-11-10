AUDITORIA_POR_RUTA = {
    ('api/authoring/cases/<int:case_version_id>/validate', 'POST'): 'EXENTO: validación sin cambios sobre el caso propio o accesible al administrador',
    ('api/authoring/cases/<int:case_version_id>/lifecycle', 'POST'): 'CASE_SUBMITTED,CASE_ARCHIVED',
    ('api/authoring/cases/<int:case_version_id>/publish', 'POST'): 'CASE_PUBLISHED',
    ('api/authoring/cases/<int:case_version_id>/clone-version', 'POST'): 'CASE_VERSION_CLONED',
}
