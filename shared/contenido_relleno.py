"""Detección conservadora de textos de muestra, compartida con el editor."""
import re
import unicodedata

PATRONES_RELLENO = ['^respuesta\\s+\\d+\\s+de\\s+la\\s+persona\\s+profesional[.!…?]*$', '^esta respuesta tiene consecuencias en el vinculo con la persona consultante[.!…?]*$', '^(?:escribe|escribir|introduce|introducir)\\s+(?:aqui\\s+)?(?:la |una |el |un |tu )?(?:respuesta|retroalimentacion|texto|dialogo)(?:\\s+aqui)?[.!…?]*$', '^\\[\\s*(?:respuesta|retroalimentacion|texto|dialogo)(?:\\s+\\d+)?\\s*\\]$', '^lorem ipsum\\b.*$']
_PATRONES = [re.compile(p) for p in PATRONES_RELLENO]


def es_relleno(texto):
    normalizado = "".join(c for c in unicodedata.normalize("NFD", texto or "") if not unicodedata.combining(c))
    normalizado = " ".join(normalizado.lower().split())
    return any(p.search(normalizado) for p in _PATRONES)
