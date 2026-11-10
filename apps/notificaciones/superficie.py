AUDITORIA_POR_RUTA = {
    ("api/me/notifications", "GET"): "EXENTO: lectura de notificaciones propias",
    ("api/me/notifications/<int:pk>/read", "POST"): "NOTIFICATION_READ",
    ("api/notifications/<int:pk>/resend", "POST"): "NOTIFICATION_RESENT",
}
