"""Observer: emisión síncrona dentro de la transacción de cierre."""

from django.dispatch import Signal

attempt_completed = Signal()
