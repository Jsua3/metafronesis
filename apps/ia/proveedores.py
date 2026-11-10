"""Proveedores intercambiables para los asistentes (Strategy).

Cada proveedor sabe hablar con un servicio; los asistentes solo conocen la interfaz ``ProveedorIA``.
``proveedor_para`` elige la clase por nombre desde la configuración, con su clave y su modelo.
"""

import json
from abc import ABC, abstractmethod
from urllib.request import Request, urlopen

from django.core.exceptions import ImproperlyConfigured

TIEMPO_MAXIMO_SEGUNDOS = 20


class ProveedorIA(ABC):
    def __init__(self, clave: str = "", modelo: str = ""):
        self.clave = clave
        self.modelo = modelo

    @abstractmethod
    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        """Texto de respuesta para las instrucciones y los mensajes dados."""


class ProveedorFalso(ProveedorIA):
    """Determinista y sin red: es el que usan las pruebas y el desarrollo."""

    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        return "Revisa el contexto del caso y considera las alternativas disponibles."


class ProveedorOpenAI(ProveedorIA):
    URL = "https://api.openai.com/v1/chat/completions"

    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        datos = {"model": self.modelo, "messages": [{"role": "system", "content": instrucciones}, *mensajes]}
        respuesta = _solicitar(self.URL, datos, {"Authorization": f"Bearer {self.clave}"})
        return respuesta["choices"][0]["message"]["content"]


class ProveedorAnthropic(ProveedorIA):
    URL = "https://api.anthropic.com/v1/messages"
    VERSION_API = "2023-06-01"
    MAXIMO_DE_TOKENS = 1024

    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        datos = {"model": self.modelo, "max_tokens": self.MAXIMO_DE_TOKENS, "system": instrucciones, "messages": mensajes}
        respuesta = _solicitar(self.URL, datos, {"x-api-key": self.clave, "anthropic-version": self.VERSION_API})
        return "".join(bloque["text"] for bloque in respuesta["content"] if bloque["type"] == "text")


def _solicitar(url, datos, cabeceras):
    cuerpo = json.dumps(datos).encode("utf-8")
    solicitud = Request(url, data=cuerpo, headers={"Content-Type": "application/json", **cabeceras}, method="POST")
    with urlopen(solicitud, timeout=TIEMPO_MAXIMO_SEGUNDOS) as respuesta:
        return json.load(respuesta)


#: Nombre en la configuración → clase del proveedor.
REGISTRO = {"falso": ProveedorFalso, "openai": ProveedorOpenAI, "anthropic": ProveedorAnthropic}


def proveedor_para(nombre, clave: str = "", modelo: str = "") -> ProveedorIA:
    clase = REGISTRO.get((nombre or "").strip().lower())
    if clase is None:
        raise ImproperlyConfigured("Proveedor no configurado.")
    return clase(clave, modelo)
