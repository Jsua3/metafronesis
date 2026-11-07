"""Piezas comunes de los comandos de los derechos del titular (S3-4, RNF-003): ``export_personal_data``, ``erase_personal_data`` y
``purge_expired_data``.

Reglas comunes: la persona se identifica por ``--email`` (normalizado como el resto del proyecto) o ``--user-id``;
``--executed-by`` (el correo de un ADMIN activo) es OBLIGATORIO, se verifica y se audita por su **id**, no por su correo;
``--dry-run`` no escribe nada (ni la auditoría) y dice qué haría; sin ``--dry-run``, ``--confirm`` es obligatorio. La salida
nombra cuentas por **id** y da recuentos: nunca correos, nombres ni textos de nadie (ni siquiera en los mensajes de error).

El nombre empieza por «_» a propósito: Django no lo toma por un comando.
"""
import contextlib
import json
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.privacy import services
from apps.users.serializers import normalize_email_value
from shared.exceptions import ApiError

User = get_user_model()

#: Cómo se abre el archivo de la exportación: nuevo (``O_EXCL`` se niega a sobrescribir uno existente y a seguir un enlace
#: simbólico) y de solo escritura; ``O_BINARY`` (solo existe en Windows) evita que el sistema traduzca los saltos de línea. Las
#: pruebas lo cambian para demostrar que de ahí sale la garantía.
BANDERAS_DE_APERTURA = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
#: Permisos del archivo nuevo en POSIX: solo quien lo crea lo lee y lo escribe (el umask solo puede quitar más). Contiene
#: datos sensibles, bitácoras descifradas incluidas.
PERMISOS_DEL_ARCHIVO = 0o600


def exigir_confirmacion(opciones):
    """Sin ``--dry-run``, el comando cambia datos o saca un archivo con datos sensibles: pide ``--confirm``."""
    if not opciones["dry_run"] and not opciones["confirm"]:
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError("Falta --confirm: sin --dry-run este comando cambia datos y hay que confirmarlo. No se hizo nada.")


def _cuentas_con_el_correo(correo):
    """Hasta dos cuentas cuyo correo, normalizado como en el resto del proyecto, es ``correo`` (sin distinguir mayúsculas)."""
    return list(User.objects.filter(email__iexact=normalize_email_value(correo)).order_by("pk")[:2])


def resolver_ejecutor(correo):
    """El ADMIN activo que ejecuta, por su correo. El error no repite el correo ni dice si la cuenta existe."""
    candidatas = _cuentas_con_el_correo(correo)
    cuenta = candidatas[0] if len(candidatas) == 1 else None  # dos cuentas parecidas: no se adivina quién ejecuta
    try:
        return services.verificar_ejecutor(cuenta)
    except ApiError as exc:
        raise CommandError(str(exc.detail)) from None


def resolver_persona(opciones):
    """La cuenta de la persona, por ``--user-id`` o por ``--email`` (normalizado). El error no repite el correo."""
    if opciones.get("user_id") is not None:
        candidatas = list(User.objects.filter(pk=opciones["user_id"])[:2])
    else:
        candidatas = _cuentas_con_el_correo(opciones["email"])
    if not candidatas:
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError("No hay una cuenta con ese correo o ese id. No se hizo nada.")
    if len(candidatas) > 1:
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError("Hay más de una cuenta con ese correo (solo cambian las mayúsculas): usa --user-id. No se hizo nada.")
    return candidatas[0]


def escribir_archivo_nuevo(ruta, contenido):
    """Escribe ``contenido`` (un diccionario) como JSON en ``ruta``, que NO debe existir, con permisos restringidos en POSIX.

    Si algo falla a medias, borra lo escrito: un archivo con datos sensibles a medias no se deja. No devuelve la ruta ni la
    imprime.
    """
    carpeta = os.path.dirname(os.path.abspath(ruta))
    if not os.path.isdir(carpeta):
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError("La carpeta donde iría el archivo no existe. No se hizo nada.")
    try:
        descriptor = os.open(ruta, BANDERAS_DE_APERTURA, PERMISOS_DEL_ARCHIVO)
    except FileExistsError:
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError("El archivo de --out ya existe: no se sobrescribe. Elige otro nombre. No se hizo nada.") from None
    except OSError as error:
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError(f"No se pudo crear el archivo de --out ({type(error).__name__}). No se hizo nada.") from None
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as archivo:
            json.dump(contenido, archivo, ensure_ascii=False, indent=2)
            archivo.write("\n")
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(ruta)
        raise


def verificar_que_no_existe(ruta):
    """Para el simulacro: dice, sin crear nada, si ``escribir_archivo_nuevo`` se negaría porque el archivo ya existe."""
    if os.path.lexists(ruta):
        # BORRADOR: texto nuevo para quien opera la plataforma, pendiente de revisión.
        raise CommandError("El archivo de --out ya existe: no se sobrescribe. Elige otro nombre. No se hizo nada.")


class ComandoDeDerechos(BaseCommand):
    """Los argumentos y las comprobaciones que comparten los tres comandos. ``con_persona = False`` quita --email y --user-id."""

    con_persona = True

    def create_parser(self, prog_name, subcommand, **kwargs):
        # Sin abreviaturas: un «--e» no debe colarse como «--email» ni como «--executed-by».
        kwargs.setdefault("allow_abbrev", False)
        return super().create_parser(prog_name, subcommand, **kwargs)

    def add_arguments(self, parser):
        if self.con_persona:
            persona = parser.add_mutually_exclusive_group(required=True)
            persona.add_argument("--email", help="Correo de la cuenta de la persona.")  # BORRADOR
            persona.add_argument("--user-id", dest="user_id", type=int, help="Id de la cuenta de la persona.")  # BORRADOR
        parser.add_argument(
            "--executed-by", dest="executed_by", required=True,
            help="Correo de un administrador activo: quien ejecuta. Se verifica y queda auditado por su id.",  # BORRADOR
        )
        parser.add_argument(
            "--dry-run", dest="dry_run", action="store_true",
            help="No escribe nada (ni la auditoría): solo dice qué haría.",  # BORRADOR
        )
        parser.add_argument(
            "--confirm", action="store_true",
            help="Obligatorio sin --dry-run: confirma que se quiere hacer.",  # BORRADOR
        )

    def preparar(self, opciones):
        """Valida lo común ANTES de tocar nada. Devuelve ``(ejecutor, persona)``; ``persona`` es ``None`` sin ``con_persona``."""
        exigir_confirmacion(opciones)
        ejecutor = resolver_ejecutor(opciones["executed_by"])
        persona = resolver_persona(opciones) if self.con_persona else None
        return ejecutor, persona
