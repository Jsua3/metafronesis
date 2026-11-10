"""Eventos del dominio que una app emite y otras escuchan (Observer).

Viven en ``shared`` para que el emisor y los receptores no se importen entre sí: quien emite no sabe quién escucha.
Cada señal se envía con ``send(sender=<clase del emisor>, ...)`` y los argumentos que indica su comentario.
"""

from django.dispatch import Signal

#: ``sesiones`` al convocar estudiantes. Argumentos: ``sesion``, ``convocatorias`` (lista) y ``codigos``
#: (dict id de estudiante → código en claro, que solo viaja en este aviso).
convocatoria_emitida = Signal()

#: ``sesiones`` al agregar o retirar convocados. Argumentos: ``sesion``, ``agregados`` y ``retirados`` (listas de
#: estudiantes) y ``codigos`` de los agregados.
convocados_cambiaron = Signal()

#: ``simulation`` cuando el sistema califica un intento. Argumentos: ``intento`` y ``evaluacion``.
intento_calificado = Signal()

#: ``simulation`` cuando el docente registra la retroalimentación general. Argumentos: ``intento`` y ``docente``.
retroalimentacion_registrada = Signal()
