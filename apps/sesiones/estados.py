"""Ciclo de vida de la sesión (patrón State).

``Sesion`` es el contexto: guarda el valor del estado y le delega todo lo que depende de él. Cada estado es una
subclase de ``Estado`` que sobrescribe SOLO lo que permite; lo demás responde ``INVALID_TRANSITION`` (409).
Además de las transiciones, cada estado decide si se edita, si se gestionan convocados, si el estudiante entra y
qué pasa al entrar en él (``al_entrar``). Los servicios nunca comparan el valor del estado para decidir.

    PROGRAMADA ──iniciar──▶ EN_CURSO ──finalizar──▶ FINALIZADA
        │                    │  ▲
     cancelar          pausar  reanudar
        ▼                    ▼  │
    CANCELADA             PAUSADA ──finalizar──▶ FINALIZADA
"""
from shared.exceptions import ApiError

from .models import EstadoSesion

TRANSICIONES = ("iniciar", "pausar", "reanudar", "finalizar", "cancelar")


def _no_permitida():
    return ApiError("INVALID_TRANSITION", "La transición no está permitida.", 409)


def _efectos():
    from . import efectos  # importación tardía: efectos usa modelos del simulador

    return efectos


class Estado:
    valor: str = ""
    _editable = False
    _gestiona_convocados = False

    # ─── Transiciones: cada una devuelve el estado destino ──────────────────────────────────────
    def iniciar(self, sesion):
        raise _no_permitida()

    def pausar(self, sesion):
        raise _no_permitida()

    def reanudar(self, sesion):
        raise _no_permitida()

    def finalizar(self, sesion):
        raise _no_permitida()

    def cancelar(self, sesion):
        raise _no_permitida()

    def cerrar_automatico(self, sesion):
        """Destino del cierre automático al vencer la sesión; por defecto se queda donde está."""
        return self

    # ─── Efectos ─────────────────────────────────────────────────────────────────────────────────
    def al_entrar(self, sesion):
        """Lo que pasa al llegar a este estado (ya con el valor y la marca de tiempo puestos)."""

    def al_sumar_convocados(self, sesion, estudiantes_ids):
        """Lo que reciben los convocados que se suman en este estado."""

    # ─── Capacidades ─────────────────────────────────────────────────────────────────────────────
    def puede_editar(self):
        return self._editable

    def puede_gestionar_convocados(self):
        return self._gestiona_convocados

    def exigir_edicion(self):
        if not self.puede_editar():
            raise _no_permitida()

    def exigir_gestion(self):
        if not self.puede_gestionar_convocados():
            raise _no_permitida()

    def verificar_ingreso(self):
        """``None`` si el estudiante puede entrar; si no, el ``ApiError`` propio del estado."""
        raise NotImplementedError

    def acciones(self):
        """Lo que la pantalla puede ofrecer en este estado (los botones salen de aquí)."""
        propias = [nombre for nombre in TRANSICIONES if getattr(type(self), nombre) is not getattr(Estado, nombre)]
        if self.puede_editar():
            propias.append("editar")
        if self.puede_gestionar_convocados():
            propias.append("gestionarConvocados")
        return propias


class Programada(Estado):
    valor = EstadoSesion.PROGRAMADA
    _editable = True
    _gestiona_convocados = True

    def iniciar(self, sesion):
        return ESTADOS[EstadoSesion.EN_CURSO]

    def cancelar(self, sesion):
        return ESTADOS[EstadoSesion.CANCELADA]

    def cerrar_automatico(self, sesion):
        return ESTADOS[EstadoSesion.CANCELADA]

    def verificar_ingreso(self):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("SESSION_NOT_STARTED", "La sesión aún no comienza.", 409)


class EnCurso(Estado):
    valor = EstadoSesion.EN_CURSO
    _gestiona_convocados = True

    def pausar(self, sesion):
        return ESTADOS[EstadoSesion.PAUSADA]

    def finalizar(self, sesion):
        return ESTADOS[EstadoSesion.FINALIZADA]

    def cerrar_automatico(self, sesion):
        return ESTADOS[EstadoSesion.FINALIZADA]

    def al_entrar(self, sesion):
        _efectos().habilitar_caso(sesion)

    def al_sumar_convocados(self, sesion, estudiantes_ids):
        _efectos().habilitar_caso(sesion, estudiantes_ids)

    def verificar_ingreso(self):
        return None


class Pausada(Estado):
    valor = EstadoSesion.PAUSADA
    _gestiona_convocados = True

    def reanudar(self, sesion):
        return ESTADOS[EstadoSesion.EN_CURSO]

    def finalizar(self, sesion):
        return ESTADOS[EstadoSesion.FINALIZADA]

    def cerrar_automatico(self, sesion):
        return ESTADOS[EstadoSesion.FINALIZADA]

    def al_entrar(self, sesion):
        _efectos().pausar_intentos(sesion)

    def al_sumar_convocados(self, sesion, estudiantes_ids):
        _efectos().habilitar_caso(sesion, estudiantes_ids)

    def verificar_ingreso(self):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("SESSION_PAUSED", "Tu docente pausó la sesión. Espera a que la reanude.", 409)


class Finalizada(Estado):
    valor = EstadoSesion.FINALIZADA

    def al_entrar(self, sesion):
        efectos = _efectos()
        efectos.cerrar_intentos(sesion)
        efectos.deshabilitar_caso(sesion)

    def verificar_ingreso(self):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("SESSION_FINISHED", "La sesión terminó.", 409)


class Cancelada(Estado):
    valor = EstadoSesion.CANCELADA

    def al_entrar(self, sesion):
        efectos = _efectos()
        efectos.deshabilitar_caso(sesion)
        efectos.avisar_cancelacion(sesion)

    def verificar_ingreso(self):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("SESSION_CANCELLED", "La sesión fue cancelada.", 409)


ESTADOS = {clase.valor: clase() for clase in (Programada, EnCurso, Pausada, Finalizada, Cancelada)}
