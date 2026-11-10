import json
from abc import ABC, abstractmethod
from urllib.request import Request, urlopen

from django.core.exceptions import ImproperlyConfigured


class ProveedorIA(ABC):
    @abstractmethod
    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        pass


class ProveedorFalso(ProveedorIA):
    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        return "Revisa el contexto del caso y considera las alternativas disponibles."


class ProveedorOpenAI(ProveedorIA):
    def __init__(self, clave=""):
        self.clave = clave

    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        datos = {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": instrucciones}, *mensajes]}
        respuesta = _solicitar("https://api.openai.com/v1/chat/completions", datos, {"Authorization": f"Bearer {self.clave}"})
        return respuesta["choices"][0]["message"]["content"]


class ProveedorAnthropic(ProveedorIA):
    def __init__(self, clave=""):
        self.clave = clave

    def responder(self, instrucciones: str, mensajes: list[dict]) -> str:
        datos = {"model": "claude-3-5-haiku-latest", "max_tokens": 1024, "system": instrucciones, "messages": mensajes}
        respuesta = _solicitar("https://api.anthropic.com/v1/messages", datos, {"x-api-key": self.clave, "anthropic-version": "2023-06-01"})
        return "".join(bloque["text"] for bloque in respuesta["content"] if bloque["type"] == "text")


def _solicitar(url, datos, cabeceras):
    solicitud = Request(url, data=json.dumps(datos).encode("utf-8"), headers={"Content-Type": "application/json", **cabeceras}, method="POST")
    with urlopen(solicitud, timeout=20) as respuesta:
        return json.load(respuesta)


def proveedor_para(nombre) -> ProveedorIA:
    registro = {"falso": ProveedorFalso, "openai": ProveedorOpenAI, "anthropic": ProveedorAnthropic}
    try:
        return registro[nombre.lower()]()
    except (KeyError, AttributeError):
        raise ImproperlyConfigured("Proveedor no configurado.") from None
