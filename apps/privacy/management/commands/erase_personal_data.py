"""Suprime la identidad de una persona: la cuenta se seudonimiza, sus textos libres se borran y la auditoría pierde su IP (S3-4).

    python manage.py erase_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --dry-run
    python manage.py erase_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --confirm
    python manage.py erase_personal_data --user-id ID --executed-by CORREO_DEL_ADMIN --confirm

``--executed-by`` es un ADMIN activo (queda auditado por su id). ``--dry-run`` cuenta lo que haría y no escribe nada. La salida
nombra cuentas por id y da recuentos por tabla, nunca correos, nombres ni textos. Lo que se hace con cada columna está en
``apps/privacy/data_subject.py`` (``ERASURE_RULES``) y se explica en ``docs/seguridad/derechos-del-titular.md``. Una cuenta de
ADMIN no se suprime: quítale el rol primero.
"""
from django.core.management.base import CommandError

from apps.privacy import services
from apps.privacy.management.commands._comun import ComandoDeDerechos
from shared.exceptions import ApiError


def _lineas_del_informe(informe):
    # BORRADOR: textos nuevos para quien opera la plataforma, pendientes de revisión. Solo ids, tablas y recuentos.
    modo = " (simulacro: no se escribió nada)" if informe["simulacro"] else ""
    lineas = [f"Supresión de la cuenta {informe['persona']}, pedida por la cuenta {informe['ejecutadaPor']}{modo}."]
    if informe["yaSuprimida"]:
        lineas.append("La cuenta ya estaba suprimida: se revisó que no quedara nada pendiente.")
    con_cambios = {tabla: datos for tabla, datos in informe["tablas"].items() if datos["cambiadas"] or datos["borradas"]}
    if con_cambios:
        lineas.append("Cambios por tabla" + (" (lo que se haría)" if informe["simulacro"] else "") + ":")
        for tabla, datos in con_cambios.items():
            partes = []
            if datos["cambiadas"]:
                partes.append(f"{datos['cambiadas']} fila(s) cambiada(s)")
            if datos["borradas"]:
                partes.append(f"{datos['borradas']} fila(s) borrada(s)")
            lineas.append(f"  {tabla}: {', '.join(partes)}")
    por_motivo = {}
    for resto in informe["conservado"]:
        for motivo in resto["motivos"]:
            por_motivo.setdefault(motivo, []).append(f"{resto['tabla']} ({resto['filas']})")
    if por_motivo:
        lineas.append("Se conserva, y por qué (entre paréntesis, las filas):")
        lineas += [f"  - {motivo}. Tablas: {', '.join(tablas)}." for motivo, tablas in por_motivo.items()]
    lineas.append(
        f"Total: {informe['cambiadas']} fila(s) cambiada(s) y {informe['borradas']} borrada(s) "
        f"en {len(con_cambios)} tabla(s)."
    )
    return lineas


class Command(ComandoDeDerechos):
    # BORRADOR: texto de ayuda nuevo, pendiente de revisión.
    help = (
        "Suprime la identidad de una persona: seudonimiza su cuenta, borra sus textos libres y quita la IP de su auditoría. "
        "No suprime administradores. Usa --dry-run primero."
    )

    def handle(self, *args, **options):
        ejecutor, persona = self.preparar(options)
        try:
            informe = services.erase_person(persona, executed_by=ejecutor, dry_run=options["dry_run"])
        except ApiError as exc:
            raise CommandError(str(exc.detail)) from None
        for linea in _lineas_del_informe(informe):
            self.stdout.write(linea)
