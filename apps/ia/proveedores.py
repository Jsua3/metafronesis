"""Proveedores intercambiables para los asistentes (Strategy).

Cada proveedor sabe hablar con un servicio; los asistentes solo conocen la interfaz ``ProveedorIA``.
``proveedor_para`` elige la clase por nombre desde la configuración, con su clave y su modelo.
"""

import json
import re
from abc import ABC, abstractmethod
from urllib.request import Request, urlopen

from django.core.exceptions import ImproperlyConfigured

from .asistente import falso as falso_del_asistente
from .generacion import falso

TIEMPO_MAXIMO_SEGUNDOS = 20


class ProveedorIA(ABC):
    def __init__(self, clave: str = "", modelo: str = ""):
        self.clave = clave
        self.modelo = modelo

    @abstractmethod
    def responder(self, instrucciones: str, mensajes: list[dict], *, max_tokens: int | None = None, tiempo: int | None = None) -> str:
        """Texto de respuesta para las instrucciones y los mensajes dados.

        ``max_tokens`` y ``tiempo`` (segundos) son opcionales: sin ellos vale el tope de cada proveedor.
        """


class ProveedorFalso(ProveedorIA):
    """Determinista y sin red: es el que usan las pruebas y el desarrollo."""

    def responder(self, instrucciones: str, mensajes: list[dict], *, max_tokens: int | None = None, tiempo: int | None = None) -> str:
        if instrucciones.startswith(falso.MARCA):
            return falso.responder(mensajes)
        if instrucciones.startswith(falso_del_asistente.MARCA_PROPONER):
            return falso_del_asistente.proponer()
        if instrucciones.startswith(falso_del_asistente.MARCA_GUIA):
            return falso_del_asistente.guiar(mensajes)
        return "Revisa el contexto del caso y considera las alternativas disponibles."


class ProveedorOpenAI(ProveedorIA):
    URL = "https://api.openai.com/v1/chat/completions"

    def responder(self, instrucciones: str, mensajes: list[dict], *, max_tokens: int | None = None, tiempo: int | None = None) -> str:
        datos = {"model": self.modelo, "messages": [{"role": "system", "content": instrucciones}, *mensajes]}
        if max_tokens:
            datos["max_tokens"] = max_tokens
        respuesta = _solicitar(self.URL, datos, {"Authorization": f"Bearer {self.clave}"}, tiempo)
        return respuesta["choices"][0]["message"]["content"]


#: El razonamiento que algunos modelos escriben antes de responder (``<think>…</think>``): no es parte de la respuesta.
_RAZONAMIENTO = re.compile(r"<think>.*?</think>\s*", re.DOTALL)


class ProveedorNvidia(ProveedorOpenAI):
    """Los modelos de NVIDIA (``build.nvidia.com``): la misma API que OpenAI, en ``integrate.api.nvidia.com``.

    Son más lentos que los de OpenAI o Anthropic y algunos cortan la respuesta pronto si no se les da tope: sin
    ``max_tokens`` ni ``tiempo`` (la generación de casos no los pasa) usa los suyos, que alcanzan para una escena entera.
    """

    URL = "https://integrate.api.nvidia.com/v1/chat/completions"
    MAXIMO_DE_TOKENS = 8192
    TIEMPO_SEGUNDOS = 90

    def responder(self, instrucciones: str, mensajes: list[dict], *, max_tokens: int | None = None, tiempo: int | None = None) -> str:
        datos = {
            "model": self.modelo, "messages": [{"role": "system", "content": instrucciones}, *mensajes],
            "max_tokens": max_tokens or self.MAXIMO_DE_TOKENS,
        }
        respuesta = _solicitar(self.URL, datos, {"Authorization": f"Bearer {self.clave}"}, tiempo or self.TIEMPO_SEGUNDOS)
        return _RAZONAMIENTO.sub("", respuesta["choices"][0]["message"]["content"] or "").strip()


class ProveedorAnthropic(ProveedorIA):
    URL = "https://api.anthropic.com/v1/messages"
    VERSION_API = "2023-06-01"
    MAXIMO_DE_TOKENS = 1024

    def responder(self, instrucciones: str, mensajes: list[dict], *, max_tokens: int | None = None, tiempo: int | None = None) -> str:
        datos = {"model": self.modelo, "max_tokens": max_tokens or self.MAXIMO_DE_TOKENS, "system": instrucciones, "messages": mensajes}
        respuesta = _solicitar(self.URL, datos, {"x-api-key": self.clave, "anthropic-version": self.VERSION_API}, tiempo)
        return "".join(bloque["text"] for bloque in respuesta["content"] if bloque["type"] == "text")


def _solicitar(url, datos, cabeceras, tiempo=None):
    cuerpo = json.dumps(datos).encode("utf-8")
    solicitud = Request(url, data=cuerpo, headers={"Content-Type": "application/json", **cabeceras}, method="POST")
    with urlopen(solicitud, timeout=tiempo or TIEMPO_MAXIMO_SEGUNDOS) as respuesta:
        return json.load(respuesta)


#: Nombre en la configuración → clase del proveedor.
REGISTRO = {"falso": ProveedorFalso, "openai": ProveedorOpenAI, "anthropic": ProveedorAnthropic, "nvidia": ProveedorNvidia}


def proveedor_para(nombre, clave: str = "", modelo: str = "") -> ProveedorIA:
    clase = REGISTRO.get((nombre or "").strip().lower())
    if clase is None:
        raise ImproperlyConfigured("Proveedor no configurado.")
    return clase(clave, modelo)
