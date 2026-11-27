"""Reglas adicionales que deben cumplirse antes de iniciar."""

_reglas = []


def registrar(regla):
    if regla not in _reglas:
        _reglas.append(regla)


def verificar(estudiante, version):
    resultado = None
    for regla in _reglas:
        valor = regla(estudiante, version)
        if valor is not None:
            resultado = valor
    return resultado
