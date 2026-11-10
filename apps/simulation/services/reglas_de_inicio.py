"""Reglas adicionales que deben cumplirse antes de iniciar."""

_reglas = []


def registrar(regla):
    if regla not in _reglas:
        _reglas.append(regla)


def verificar(estudiante, version):
    for regla in _reglas:
        regla(estudiante, version)
