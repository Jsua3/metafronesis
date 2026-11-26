"""Portadas de las versiones de caso, desde la imagen recibida hasta su URL pública."""
from io import BytesIO

from django.conf import settings
from django.urls import reverse
from PIL import Image, ImageOps

from apps.simulation.models.case import CaseCover
from shared.exceptions import ApiError

LADO_MIN, LADO_MAX = 64, 2048
FORMATOS = {"PNG": ("image/png", "png"), "JPEG": ("image/jpeg", "jpg"), "WEBP": ("image/webp", "webp")}


def datos_portada(version):
    return {
        "portada": reverse("case-cover", args=[version.cover_id]) if version.cover_id else None,
        "portadaPixelArt": bool(version.cover_id and version.cover_pixel_art),
    }


def crear_portada(archivo):
    max_bytes = settings.SIEP_MAX_CASE_COVER_BYTES
    contenido = archivo.read(max_bytes + 1)
    if len(contenido) > max_bytes:
        raise ApiError("CASE_COVER_TOO_LARGE", "La portada puede pesar hasta 2 MB.", field="imagen")
    try:
        with Image.open(BytesIO(contenido), formats=tuple(FORMATOS)) as original:
            formato = original.format
            if not all(LADO_MIN <= lado <= LADO_MAX for lado in original.size):
                raise ApiError("CASE_COVER_DIMENSIONS",
                               f"El ancho y el alto deben medir entre {LADO_MIN} y {LADO_MAX} píxeles.", field="imagen")
            if getattr(original, "is_animated", False):
                raise ApiError("CASE_COVER_INVALID", "Elige una imagen sin animación.", field="imagen")
            original.verify()
        # verify() invalida el lector. Se vuelve a abrir para decodificar todos los píxeles y respetar la orientación.
        with Image.open(BytesIO(contenido), formats=(formato,)) as original:
            orientada = ImageOps.exif_transpose(original)
            modo = "RGBA" if formato != "JPEG" and orientada.has_transparency_data else "RGB"
            pixeles = orientada.convert(modo)
            limpia = Image.frombytes(modo, pixeles.size, pixeles.tobytes())
            salida = BytesIO()
            opciones = {"WEBP": {"lossless": True}, "JPEG": {"quality": 85, "optimize": True}}
            limpia.save(salida, formato, **opciones.get(formato, {}))
    except Image.DecompressionBombError:
        raise ApiError("CASE_COVER_DIMENSIONS",
                       f"El ancho y el alto deben medir entre {LADO_MIN} y {LADO_MAX} píxeles.", field="imagen") from None
    except (OSError, ValueError, SyntaxError):
        raise ApiError("CASE_COVER_INVALID", "Elige una imagen PNG, JPEG o WebP válida.", field="imagen") from None
    if salida.tell() > max_bytes:
        raise ApiError("CASE_COVER_TOO_LARGE", "La portada supera los 2 MB después de procesarla. Reduce su tamaño.",
                       field="imagen")
    return CaseCover.objects.create(formato=formato, contenido=salida.getvalue())
