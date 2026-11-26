from django.db.models import Count, Q
from django.http import Http404

from .models import EstadoConvocatoria, Sesion


def propias(usuario, estados=None):
    consulta = (
        Sesion.objects.filter(creada_por=usuario)
        .select_related("grupo", "case_version__simulation_case")
        .annotate(total_convocados=Count("convocatorias", filter=Q(convocatorias__estado=EstadoConvocatoria.ACTIVA)))
    )
    if estados:
        consulta = consulta.filter(estado__in=estados)
    return consulta.order_by("-inicio", "-pk")


def obtener(usuario, pk, lock=False):
    consulta = Sesion.objects.filter(creada_por=usuario)
    # FOR UPDATE no admite el lado nulo de un JOIN (grupo): con cerrojo no se cargan relaciones.
    consulta = consulta.select_for_update() if lock else consulta.select_related("grupo", "case_version__simulation_case")
    sesion = consulta.filter(pk=pk).first()
    if sesion is None:
        raise Http404
    return sesion
