"""Fuentes del límite de tiempo activo del intento."""

_fuentes = []


def registrar(fuente):
    if fuente not in _fuentes:
        _fuentes.append(fuente)


def minutos_para(intento) -> int | None:
    valores = (fuente(intento) for fuente in _fuentes)
    return min((valor for valor in valores if valor is not None), default=None)
