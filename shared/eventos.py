"""Eventos del dominio que una app emite y otras escuchan (Observer).

Viven en ``shared`` para que el emisor y los receptores no se importen entre sí: quien emite no sabe quién escucha.
Cada señal se envía con ``send(sender=<clase del emisor>, ...)`` y los argumentos que indica su comentario.
"""

from django.dispatch import Signal

#: ``sesiones`` al agregar o retirar convocados. Argumentos: ``sesion``, ``agregados`` y ``retirados`` (listas de
#: estudiantes).
convocados_cambiaron = Signal()

#: ``simulation`` cuando el sistema califica un intento. Argumentos: ``intento`` y ``evaluacion``.
intento_calificado = Signal()

#: ``simulation`` cuando el docente registra la retroalimentación general. Argumentos: ``intento`` y ``docente``.
retroalimentacion_registrada = Signal()

#: ``sesiones`` poco antes de que empiece una sesión programada. Argumentos: ``sesion`` y ``estudiantes`` (convocados
#: activos).
sesion_por_comenzar = Signal()

#: ``sesiones`` al cancelar una sesión. Argumentos: ``sesion`` y ``estudiantes`` (convocados activos).
sesion_cancelada = Signal()
