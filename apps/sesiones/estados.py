from .models import EstadoSesion


class Estado:
    valor = None


class Programada(Estado):
    valor = EstadoSesion.PROGRAMADA


class EnCurso(Estado):
    valor = EstadoSesion.EN_CURSO


class Pausada(Estado):
    valor = EstadoSesion.PAUSADA


class Finalizada(Estado):
    valor = EstadoSesion.FINALIZADA


class Cancelada(Estado):
    valor = EstadoSesion.CANCELADA


ESTADOS = {clase.valor: clase() for clase in (Programada, EnCurso, Pausada, Finalizada, Cancelada)}
