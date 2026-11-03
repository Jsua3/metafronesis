"""Exporta a un archivo JSON todo lo que SIEP guarda de una persona (S3-4): su cuenta, sus intentos, sus bitácoras descifradas…

    python manage.py export_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --dry-run
    python manage.py export_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --confirm --out RUTA.json

El archivo contiene datos sensibles (las bitácoras de reflexión van descifradas): se escribe con permisos restringidos en POSIX, se
niega a sobrescribir uno que exista y NUNCA sale por la salida estándar. La salida solo nombra la cuenta por id y da recuentos.
No lleva columnas secretas ni datos de otras personas. Quedan auditados el id de la persona y el del ADMIN que ejecuta.
"""
from django.core.management.base import CommandError

from apps.privacy import audit_events, services
from apps.privacy.management.commands._comun import ComandoDeDerechos, escribir_archivo_nuevo, verificar_que_no_existe


class Command(ComandoDeDerechos):
    # BORRADOR: texto de ayuda nuevo, pendiente de revisión.
    help = (
        "Exporta a un archivo JSON (--out, que no debe existir) lo que SIEP guarda de una persona. "
        "El archivo es sensible; la salida del comando no trae datos personales."
    )

    def add_arguments(self, parser):
        super().add_arguments(parser)
        parser.add_argument(
            "--out",
            help="Ruta del archivo .json nuevo donde se escribe la exportación; obligatorio sin --dry-run. No se sobrescribe.",  # BORRADOR
        )

    def handle(self, *args, **options):
        ejecutor, persona = self.preparar(options)
        ruta = options["out"]
        simulacro = options["dry_run"]
        if not simulacro and not ruta:
            # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
            raise CommandError("Falta --out: la exportación nunca sale por la salida estándar. No se hizo nada.")
        if ruta and simulacro:
            verificar_que_no_existe(ruta)  # el simulacro dice lo mismo que diría el comando real; este solo lo decide ``O_EXCL``
        exportacion = services.export_person(persona)
        filas, tablas = exportacion["resumen"]["filas"], exportacion["resumen"]["tablas"]
        # BORRADOR: textos nuevos para quien opera la plataforma, pendientes de revisión. Solo ids y recuentos.
        if simulacro:
            self.stdout.write(
                f"Exportación de la cuenta {persona.pk} (simulacro: no se escribió nada): "
                f"se exportarían {filas} fila(s) de {tablas} tabla(s)."
            )
            return
        escribir_archivo_nuevo(ruta, exportacion)
        audit_events.persona_exportada(persona, ejecutor, filas=filas, tablas=tablas)
        self.stdout.write(
            f"Exportada la cuenta {persona.pk}, pedida por la cuenta {ejecutor.pk}: {filas} fila(s) de {tablas} tabla(s). "
            "Archivo escrito en la ruta de --out (permisos restringidos en POSIX); contiene datos sensibles."
        )
