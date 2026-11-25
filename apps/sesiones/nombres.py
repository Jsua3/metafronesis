def nombre_de(usuario):
    """Nombre visible de una persona; el correo si aún no tiene nombre."""
    nombre = f"{usuario.nombre or ''} {usuario.apellido or ''}".strip()
    return nombre or usuario.email
