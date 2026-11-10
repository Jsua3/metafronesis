AUDITORIA_POR_RUTA = {
    ("api/admin/users/<int:user_id>/authoring-permission", "PUT"): "AUTHORING_PERMISSION_GRANTED",
    ("api/admin/users/<int:user_id>/authoring-permission", "DELETE"): "AUTHORING_PERMISSION_REVOKED",
}
