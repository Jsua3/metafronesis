from shared.exceptions import ApiError
from .models import EstadoSesion


class Estado:
    def iniciar(self):
        raise ApiError("INVALID_TRANSITION", "La transición no está permitida.", 409)

    def finalizar(self):
        raise ApiError("INVALID_TRANSITION", "La transición no está permitida.", 409)

    def cerrar_automatico(self):
        return EstadoSesion.FINALIZADA


class SinIniciar(Estado):
    def iniciar(self):
        return EstadoSesion.EN_CURSO


class EnCurso(Estado):
    def finalizar(self):
        return EstadoSesion.FINALIZADA


class Finalizada(Estado):
    def cerrar_automatico(self):
        return EstadoSesion.FINALIZADA


ESTADOS = {EstadoSesion.SIN_INICIAR: SinIniciar(), EstadoSesion.EN_CURSO: EnCurso(), EstadoSesion.FINALIZADA: Finalizada()}
