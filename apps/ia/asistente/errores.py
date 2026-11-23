"""Los fallos de un proveedor, ya clasificados: el texto interno nunca llega al cliente (puede traer la clave)."""


class ErrorDeProveedor(Exception):
    """El proveedor no sirvió. ``tipo``: ``timeout``, ``http``, ``malformed`` o ``refusal`` (la IA se negó)."""

    def __init__(self, tipo: str, detalle: str = ""):
        super().__init__(f"{tipo}: {detalle}")
        self.tipo = tipo
