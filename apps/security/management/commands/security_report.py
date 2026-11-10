"""Informe de seguridad de los últimos días (S4-3, S4-1): recuentos, ids y roles; sin correos ni direcciones IP.

Solo lee y solo imprime texto: no escribe nada en la base. Los fallos de inicio de sesión, los informes exportados y las
cuentas nuevas con rol privilegiado salen de ``audit_logs`` (S4-1; se conserva un año): los contadores del limitador solo
guardan las últimas ventanas y ya no cubrían días. «Límites aplicados» sigue saliendo de esos contadores y lo dice en el
texto.
"""
import json
import time
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum
from django.utils import timezone

from apps.security.limits import CONTADORES, LIMITS
from apps.security.models import RateLimitBucket
from apps.simulation.models import AuditLog
from apps.simulation.services.audit_service import matching_actions
from shared.policies import ADMIN, PROFESOR

DIA = 86400
ROLES_PRIVILEGIADOS = (ADMIN, PROFESOR)
#: Los eventos de auditoría que cuenta este informe, por su etiqueta ``entidad.verbo`` (``matching_actions`` los une con el
#: código crudo con que se escriben: las filas pueden traer cualquiera de los dos).
ETIQUETA_FALLO_DE_ACCESO = "sesion.fallar"
ETIQUETA_INFORME_EXPORTADO = "reporte.exportar"
ETIQUETAS_DE_CUENTA_NUEVA = ("usuario.crear", "usuario.crear_admin", "usuario.rol")


def _suma(consulta):
    return consulta.aggregate(total=Sum("count"))["total"] or 0


def _acciones(*etiquetas):
    return [accion for etiqueta in etiquetas for accion in matching_actions(etiqueta)]


def _contexto(texto):
    try:
        contexto = json.loads(texto or "")
    except (TypeError, ValueError):
        return {}
    return contexto if isinstance(contexto, dict) else {}


def _rol_privilegiado_nuevo(accion, contexto):
    """``(id, rol)`` si la fila da un rol privilegiado a una cuenta (un alta, el primer ADMIN o un cambio de rol); si no, ``None``.

    El primer ADMIN nace por comando (``usuario.crear_admin``) y es ADMIN por definición. Una fila sin el id de la cuenta
    o con un contexto que no se lee no cuenta: el informe no inventa nada.
    """
    cuenta = contexto.get("targetId")
    if not isinstance(cuenta, int) or isinstance(cuenta, bool):
        return None
    if accion in matching_actions("usuario.crear_admin"):
        return cuenta, ADMIN
    rol = contexto.get("role")
    return (cuenta, rol) if rol in ROLES_PRIVILEGIADOS else None


class Command(BaseCommand):
    help = "Recuentos de seguridad de los últimos días, sin datos personales."  # BORRADOR

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7, help="Días a revisar, de 1 a 90.")  # BORRADOR

    def handle(self, *args, **options):
        dias = options["days"]
        if not 1 <= dias <= 90:
            raise CommandError("--days debe estar entre 1 y 90.")  # BORRADOR
        # Las ventanas del limitador son segundos desde la época; las fechas de usuario y auditoría, ``timezone.now``.
        desde_ventana = int(time.time()) - dias * DIA
        desde_fecha = timezone.now() - timedelta(days=dias)
        auditoria = AuditLog.objects.filter(occurred_at__gte=desde_fecha)

        self.stdout.write(f"Informe de seguridad: últimos {dias} días")  # BORRADOR

        fallos = RateLimitBucket.objects.filter(scope="audit_failure", window_start__gte=desde_ventana)
        self.stdout.write(f"Fallos de auditoría: {_suma(fallos)}")  # BORRADOR

        self.stdout.write(
            "Límites aplicados (ventana reciente del limitador: ventanas por encima de su tope):"  # BORRADOR
        )
        for alcance, limite in LIMITS.items():
            if alcance in CONTADORES:
                continue
            por_encima = RateLimitBucket.objects.filter(
                scope=alcance, count__gt=limite.limit, window_start__gte=desde_ventana
            ).count()
            self.stdout.write(f"  {alcance}: {por_encima}")

        accesos_fallidos = auditoria.filter(action__in=_acciones(ETIQUETA_FALLO_DE_ACCESO)).count()
        self.stdout.write(f"Fallos de inicio de sesión: {accesos_fallidos}")  # BORRADOR

        nuevas = []
        filas = auditoria.filter(action__in=_acciones(*ETIQUETAS_DE_CUENTA_NUEVA)).order_by("id")
        for accion, texto in filas.values_list("action", "context_json"):
            nueva = _rol_privilegiado_nuevo(accion, _contexto(texto))
            if nueva is not None:
                nuevas.append(nueva)
        self.stdout.write(f"Cuentas nuevas con rol ADMIN o PROFESOR: {len(nuevas)}")  # BORRADOR
        for cuenta, rol in nuevas:
            self.stdout.write(f"  id={cuenta} rol={rol}")

        exportados = auditoria.filter(action__in=_acciones(ETIQUETA_INFORME_EXPORTADO)).count()
        self.stdout.write(f"Informes exportados: {exportados}")  # BORRADOR
