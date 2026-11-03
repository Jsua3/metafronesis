"""Mirrors Spring GrupoService 1:1.

GrupoDTO = {id, nombre, codigo, totalEstudiantes}. Permission/role failures use
IllegalArgumentException semantics -> 400 (ValidationError), not 403.
"""
import io
import re
import time
import zipfile
import zlib
from dataclasses import dataclass

from defusedxml import DefusedXmlException, DTDForbidden, EntitiesForbidden, ExternalReferenceForbidden
from defusedxml import ElementTree as SafeET
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.models import CaseVersion, SimulationNode
from apps.simulation.serializers import game_dtos as simulation_dto
from apps.simulation.services.audit_service import arg, auditable
from apps.users.serializers import normalize_email_value, validate_common_email_domain
from shared.exceptions import ApiError

from .import_contract import (
    IGNORED_STUDENT_IMPORT_COLUMNS,
    REQUIRED_STUDENT_IMPORT_COLUMNS,
    STUDENT_IMPORT_COLUMNS,
    STUDENT_IMPORT_TEMPLATE_FILENAME,
)
from shared import policies

from . import memberships, notifications
from .models import Grupo, CaseAssignment, GrupoEstudiante, MembershipStatus

User = get_user_model()

IMPORT_HEADER_ALIASES = {
    "email": "email",
    "correo": "email",
    "correo electronico": "email",
    "correo electrónico": "email",
    "correo institucional": "email",
    "mail": "email",
    "nombre": "nombre",
    "nombres": "nombre",
    "name": "nombre",
    "apellido": "apellido",
    "apellidos": "apellido",
    "last name": "apellido",
    "password": "password",
    "contraseña": "password",
    "contrasena": "password",
    "contraseña temporal": "password",
    "contrasena temporal": "password",
    "clave": "password",
    "clave temporal": "password",
    "n": "_skip",
    "no": "_skip",
    "numero": "_skip",
    "número": "_skip",
    "#": "_skip",
}
REQUIRED_IMPORT_FIELDS = {"email", "nombre", "apellido"}
#: Largos de las columnas de ``users`` (nombre/apellido 100, email 255): un valor más largo rompía
#: la importación entera con un 500 en vez de señalar la fila.
_NAME_MAX = 100
_EMAIL_MAX = 255


@dataclass
class ImportValidationError(Exception):
    result: dict


def _membership_counts(grupo_ids):
    """``{grupo_id: {"ACTIVE": n, "INVITED": m}}`` en UNA consulta, para varios grupos a la vez."""
    counts = {}
    rows = (
        GrupoEstudiante.objects.filter(
            grupo_id__in=list(grupo_ids),
            status__in=[MembershipStatus.ACTIVE, MembershipStatus.INVITED],
        )
        .values("grupo_id", "status")
        .annotate(total=Count("estudiante_id"))
    )
    for row in rows:
        counts.setdefault(row["grupo_id"], {})[row["status"]] = row["total"]
    return counts


def grupo_dto(grupo, counts=None):
    """``totalEstudiantes`` cuenta a quienes aceptaron; ``totalInvitados``, a quienes aún no
    respondieron (el docente ve que su invitación sigue pendiente sin que sea un miembro)."""
    if counts is None:
        counts = _membership_counts([grupo.id])
    mine = counts.get(grupo.id, {})
    return {
        "id": grupo.id,
        "nombre": grupo.nombre,
        "codigo": grupo.codigo,
        "totalEstudiantes": mine.get(MembershipStatus.ACTIVE, 0),
        "totalInvitados": mine.get(MembershipStatus.INVITED, 0),
    }


def _grupo_dtos(grupos):
    grupos = list(grupos)
    counts = _membership_counts([g.id for g in grupos])
    return [grupo_dto(g, counts) for g in grupos]


def listar_de_profesor(profesor_id):
    return _grupo_dtos(Grupo.objects.filter(profesor_id=profesor_id, activo=True))


def listar_activos():
    return _grupo_dtos(Grupo.objects.filter(activo=True).order_by("nombre", "codigo"))


def _require_grupo(grupo_id, profesor):
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if grupo.profesor_id != profesor.id:
        raise ValidationError("No tiene permiso sobre este grupo")
    return grupo


def _require_grupo_to_invite(grupo_id, actor):
    """El grupo, si el actor puede invitar a él: su profesor o el ADMIN (``membership.invite``)."""
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if not policies.can(actor, "membership", "invite", owner_id=grupo.profesor_id):
        raise ValidationError("No tiene permiso sobre este grupo")
    return grupo


def _student_dto(user, membership_status):
    """Fila del listado del grupo.

    Solo quien ya aceptó (``ACTIVE``) muestra su nombre y su estado de cuenta: de una invitación
    pendiente, rechazada o retirada el docente ve el correo que él mismo escribió y el estado, no
    los datos de una cuenta que quizá nunca vio (si no, invitar por correo sirve para averiguar el
    nombre de cualquier persona; D-14).
    """
    dto = {
        "id": user.id,
        "nombre": "",
        "apellido": "",
        "email": user.email,
        "role": user.role,
        "membershipStatus": str(membership_status),
    }
    if membership_status == MembershipStatus.ACTIVE:
        dto.update(nombre=user.nombre, apellido=user.apellido, activo=user.activo)
    return dto


def _imported_student_dto(item, membership_status):
    """Fila del resultado de una importación: lo que el docente escribió en el archivo, no lo que
    hay en la cuenta (que, si ya existía, no es suyo para verlo; D-14)."""
    return {
        "row": item["row"],
        "nombre": item["nombre"],
        "apellido": item["apellido"],
        "email": item["email"],
        "role": "ESTUDIANTE",
        "membershipStatus": str(membership_status),
    }


def _normalize_header(value):
    value = str(value or "").strip().lower()
    value = value.replace("°", "").replace("º", "").replace("#", "")
    value = re.sub(r"[\s_\-]+", " ", value).strip()
    return IMPORT_HEADER_ALIASES.get(value, value)


def _cell_text(cell):
    if cell is None:
        return ""
    value = str(cell).strip()
    if value.endswith(".0") and value[:-2].isdigit():
        return value[:-2]
    return value


def _import_invalid(message):
    return ApiError("IMPORT_INVALID", message, status.HTTP_400_BAD_REQUEST)


def _guard_upload(uploaded_file):
    """Comprueba el archivo ANTES de leerlo (LS-10): tamaño, firma ZIP y tamaño descomprimido.

    Un ``.xlsx`` es un ZIP de XML; sin estos topes un archivo pequeño que se expande a
    gigabytes (bomba de descompresión) agota la memoria del servidor.
    """
    size = getattr(uploaded_file, "size", None)
    if size is not None and size > settings.IMPORT_MAX_BYTES:
        raise ApiError(
            "FILE_TOO_LARGE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El archivo pesa demasiado: el máximo es {settings.IMPORT_MAX_BYTES // (1024 * 1024)} MB.",
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    uploaded_file.seek(0)
    if uploaded_file.read(4) != b"PK\x03\x04":
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El archivo no es un libro de Excel (.xlsx) válido.")
    uploaded_file.seek(0)
    try:
        with zipfile.ZipFile(uploaded_file) as zf:
            members = zf.infolist()
            if len(members) > settings.IMPORT_MAX_ZIP_MEMBERS:
                raise _import_invalid("El libro de Excel trae demasiados componentes.")
            if sum(m.file_size for m in members) > settings.IMPORT_MAX_UNCOMPRESSED_BYTES:
                raise _import_invalid("El libro de Excel es demasiado grande al abrirse.")
    except zipfile.BadZipFile:
        raise _import_invalid("El archivo no es un libro de Excel (.xlsx) válido.") from None
    uploaded_file.seek(0)


#: Lo que puede fallar al abrir y leer un ZIP corrupto, cifrado, con un método no soportado o con
#: referencias rotas: todo es «el archivo no sirve» (400), nunca un 500.
_UNREADABLE_BOOK = (
    zipfile.BadZipFile,
    zipfile.LargeZipFile,
    zlib.error,
    EOFError,
    RuntimeError,
    NotImplementedError,
    KeyError,
    ValueError,
    IndexError,
    OverflowError,
    SafeET.ParseError,
    # defusedxml (S2-6a): entidades, DTD y referencias externas. Son ValueError, pero se nombran por claridad.
    DefusedXmlException,
    DTDForbidden,
    EntitiesForbidden,
    ExternalReferenceForbidden,
)
_XML_ENCODING = re.compile(
    rb"""^(?:\xef\xbb\xbf)?\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']""", re.I
)
_UTF8_NAMES = (b"utf-8", b"utf8", b"us-ascii", b"ascii")
#: Referencia de celda de OOXML: hasta 3 letras de columna (A..XFD) y la fila.
_CELL_REF = re.compile(r"^([A-Za-z]{1,3})[0-9]*$")


def _read_xml(zf, name):
    """El XML de un componente del libro, sin declaraciones de tipo de documento (DOCTYPE).

    Un libro legítimo no las trae; con ellas se abre la puerta a la expansión de entidades
    («billion laughs») y a las entidades externas (XXE).
    """
    data = zf.read(name)
    # La comprobación de DOCTYPE mira bytes ASCII: solo vale si el XML está en UTF-8. En UTF-16/32
    # (o con NUL, o declarando otra codificación) la cadena ``<!DOCTYPE`` no aparecería tal cual y
    # expat la procesaría igual: se rechaza todo lo que no sea UTF-8.
    declared = _XML_ENCODING.match(data[:256])
    if (
        b"\x00" in data
        or data[:2] in (b"\xff\xfe", b"\xfe\xff")
        or (declared and declared.group(1).lower() not in _UTF8_NAMES)
    ):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El libro de Excel debe estar codificado en UTF-8.")
    lowered = data.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El libro de Excel contiene definiciones no permitidas.")
    return data


def _xlsx_shared_strings(zf):
    try:
        xml = _read_xml(zf, "xl/sharedStrings.xml")
    except KeyError:
        return []
    root = SafeET.fromstring(xml)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values = []
    for si in root.findall("x:si", ns):
        parts = [node.text or "" for node in si.findall(".//x:t", ns)]
        values.append("".join(parts))
    return values


def _xlsx_first_sheet_path(zf):
    try:
        workbook = SafeET.fromstring(_read_xml(zf, "xl/workbook.xml"))
        rels = SafeET.fromstring(_read_xml(zf, "xl/_rels/workbook.xml.rels"))
    except KeyError:
        raise ValidationError("El archivo Excel no tiene una hoja válida")
    ns = {
        "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    sheet = workbook.find("x:sheets/x:sheet", ns)
    if sheet is None:
        raise ValidationError("El archivo Excel no tiene hojas")
    rel_id = sheet.attrib.get(f"{{{ns['r']}}}id")
    for rel in rels.findall("rel:Relationship", ns):
        if rel.attrib.get("Id") == rel_id:
            target = rel.attrib.get("Target", "")
            if target.startswith("/"):
                return target.lstrip("/")
            return f"xl/{target}".replace("xl/worksheets/../", "xl/")
    raise ValidationError("No fue posible leer la primera hoja del Excel")


def _column_index(ref):
    """Índice (desde 0) de la columna de una referencia ``A1``; ``ValueError`` si no es una."""
    match = _CELL_REF.match(ref or "")
    if not match:
        raise ValueError("referencia de celda no válida")
    idx = 0
    for ch in match.group(1).upper():
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _too_slow():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return _import_invalid("El archivo tardó demasiado en leerse: divídelo en partes más pequeñas.")


def _parse_xlsx_rows(uploaded_file):
    started = time.monotonic()
    try:
        with zipfile.ZipFile(uploaded_file) as zf:
            shared = _xlsx_shared_strings(zf)
            sheet_path = _xlsx_first_sheet_path(zf)
            root = SafeET.fromstring(_read_xml(zf, sheet_path))
        return _sheet_rows(root, shared, started)
    except _UNREADABLE_BOOK:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _import_invalid("El libro de Excel no se puede leer: revisa que el archivo no esté dañado.") from None


def _sheet_rows(root, shared, started):
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows = []
    cells_read = 0
    for row in root.findall(".//x:sheetData/x:row", ns):
        if len(rows) > settings.IMPORT_MAX_ROWS:
            raise _import_invalid(f"El archivo supera el máximo de {settings.IMPORT_MAX_ROWS} filas.")
        if time.monotonic() - started > settings.IMPORT_MAX_SECONDS:
            raise _too_slow()
        values = []
        for cell in row.findall("x:c", ns):
            cells_read += 1
            if cells_read % 256 == 0 and time.monotonic() - started > settings.IMPORT_MAX_SECONDS:
                raise _too_slow()
            ref = cell.attrib.get("r")
            idx = _column_index(ref) if ref else len(values)
            cell_type = cell.attrib.get("t")
            value_node = cell.find("x:v", ns)
            inline_node = cell.find("x:is/x:t", ns)
            if cell_type == "s" and value_node is not None:
                raw = value_node.text or ""
                value = shared[int(raw)] if raw.isdecimal() and int(raw) < len(shared) else ""
            elif inline_node is not None:
                value = inline_node.text or ""
            else:
                value = value_node.text if value_node is not None else ""
            if idx >= settings.IMPORT_MAX_COLUMNS:
                # Una celda lejana sin dato (formato, ancho de columna) se ignora; una con dato no
                # se carga: rellenar hasta ahí con vacíos agotaría la memoria (``XFD1`` = 16 384).
                if _cell_text(value):
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                    raise _import_invalid(
                        f"El libro trae datos más allá de la columna {settings.IMPORT_MAX_COLUMNS}."
                    )
                continue
            while len(values) <= idx:
                values.append("")
            values[idx] = _cell_text(value)
        rows.append(values)
    return rows


def _xml_escape(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _column_name(index):
    index += 1
    name = ""
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def _worksheet_xml(rows):
    sheet_rows = []
    for r_idx, row in enumerate(rows, start=1):
        cells = []
        for c_idx, value in enumerate(row):
            ref = f"{_column_name(c_idx)}{r_idx}"
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{_xml_escape(value)}</t></is></c>')
        sheet_rows.append(f'<row r="{r_idx}">{"".join(cells)}</row>')
    cols = '<cols><col min="1" max="4" width="28" customWidth="1"/></cols>'
    return f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{cols}<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'


def student_import_template_bytes():
    data = io.BytesIO()
    rows = [
        list(STUDENT_IMPORT_COLUMNS),
        ["Ana", "Rojas", "ana.rojas@example.edu.co"],
    ]
    instructions = [
        ["Campo", "Obligatorio", "Instruccion"],
        ["nombre", "Si", "Primer nombre o nombres del estudiante."],
        ["apellido", "Si", "Apellidos del estudiante."],
        ["email", "Si", "Correo institucional o academico valido. No debe repetirse."],
        # BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (VD-23).
        ["cuenta", "-", "Las cuentas nuevas quedan pendientes de aprobacion; cada persona fija su contrasena al entrar."],
    ]
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""")
        zf.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        zf.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Estudiantes" sheetId="1" r:id="rId1"/>
    <sheet name="Instrucciones" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>""")
        zf.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>""")
        zf.writestr("xl/worksheets/sheet1.xml", _worksheet_xml(rows))
        zf.writestr("xl/worksheets/sheet2.xml", _worksheet_xml(instructions))
    return data.getvalue()


def _parse_student_import(uploaded_file):
    name = (uploaded_file.name or "").lower()
    if not name.endswith(".xlsx"):
        raise ValidationError("Carga un archivo .xlsx")
    _guard_upload(uploaded_file)
    rows = _parse_xlsx_rows(uploaded_file)
    rows = [row for row in rows if any(_cell_text(cell) for cell in row)]
    if not rows:
        raise ValidationError("El archivo no tiene estudiantes para importar")

    headers = [_normalize_header(cell) for cell in rows[0]]
    duplicates = sorted({
        header for header in headers
        if header and header != "_skip" and headers.count(header) > 1
    })
    if duplicates:
        raise ValidationError(f"Columnas duplicadas: {', '.join(duplicates)}")

    ignored = [header for header in headers if header in IGNORED_STUDENT_IMPORT_COLUMNS]
    unknown = [
        header for header in headers
        if header and header != "_skip"
        and header not in STUDENT_IMPORT_COLUMNS and header not in IGNORED_STUDENT_IMPORT_COLUMNS
    ]
    if unknown:
        raise ValidationError(f"Columnas no permitidas: {', '.join(unknown)}")

    missing = [column for column in REQUIRED_STUDENT_IMPORT_COLUMNS if column not in headers]
    if missing:
        readable = ", ".join(missing)
        raise ValidationError(f"Faltan columnas obligatorias: {readable}")

    parsed = []
    for offset, row in enumerate(rows[1:], start=2):
        item = {"row": offset}
        for idx, header in enumerate(headers):
            # Una columna ignorada (contraseña) NO se lee: el docente no fija contraseñas.
            if header in STUDENT_IMPORT_COLUMNS:
                item[header] = _cell_text(row[idx] if idx < len(row) else "")
        parsed.append(item)
    if not parsed:
        raise ValidationError("El archivo no tiene filas de estudiantes")
    return parsed, ignored


def listar_estudiantes(grupo_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    rows = list(
        GrupoEstudiante.objects.filter(grupo_id=grupo.id)
        .exclude(status=MembershipStatus.REMOVED)
        .order_by("estudiante__apellido", "estudiante__nombre", "estudiante__email")
        .values_list("estudiante_id", "status")
    )
    by_id = {u.id: u for u in User.objects.filter(id__in=[uid for uid, _ in rows])}
    return [_student_dto(by_id[uid], st) for uid, st in rows if uid in by_id]


def _import_result(
    grupo, created=0, existing=0, assigned=0, skipped=0, duplicated=0, errors=None, students=None,
    message="", ignored_columns=None,
):
    return {
        "grupo": grupo_dto(grupo),
        "created": created,
        "existing": existing,
        "assigned": assigned,
        "associated": assigned,
        "skipped": skipped,
        "duplicated": duplicated,
        "errors": errors or [],
        "students": students or [],
        # Las cuentas nuevas nacen inactivas: esperan la aprobación del ADMIN (RN-10).
        "pendingApproval": created,
        "ignoredColumns": ignored_columns or [],
        "expectedColumns": list(STUDENT_IMPORT_COLUMNS),
        "message": message,
    }


def import_spec():
    return {
        "requiredColumns": list(REQUIRED_STUDENT_IMPORT_COLUMNS),
        "optionalColumns": [column for column in STUDENT_IMPORT_COLUMNS if column not in REQUIRED_STUDENT_IMPORT_COLUMNS],
        "columns": list(STUDENT_IMPORT_COLUMNS),
        "templateFilename": STUDENT_IMPORT_TEMPLATE_FILENAME,
        "acceptedExtensions": [".xlsx"],
    }


def _validate_import_rows(grupo, rows, ignored_columns=None):
    errors = []
    normalized_rows = []
    seen_emails = set()
    for item in rows:
        row_number = item["row"]
        email_raw = _cell_text(item.get("email"))
        nombre = _cell_text(item.get("nombre"))
        apellido = _cell_text(item.get("apellido"))

        if not nombre:
            errors.append({"row": row_number, "field": "nombre", "email": email_raw, "message": "El nombre es obligatorio.", "error": "El nombre es obligatorio."})
        if not apellido:
            errors.append({"row": row_number, "field": "apellido", "email": email_raw, "message": "El apellido es obligatorio.", "error": "El apellido es obligatorio."})
        for field, text in (("nombre", nombre), ("apellido", apellido)):
            if len(text) > _NAME_MAX:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                message = f"El {field} no puede pasar de {_NAME_MAX} caracteres."
                errors.append({"row": row_number, "field": field, "email": email_raw, "message": message, "error": message})
        if not email_raw:
            errors.append({"row": row_number, "field": "email", "email": "", "message": "El email es obligatorio.", "error": "El email es obligatorio."})
            continue

        try:
            email = validate_common_email_domain(normalize_email_value(email_raw))
            validate_email(email)
            if len(email) > _EMAIL_MAX:
                raise ValueError(f"El email no puede pasar de {_EMAIL_MAX} caracteres.")
        except Exception as exc:
            detail = exc.detail if isinstance(exc, ValidationError) else str(exc)
            if isinstance(detail, list):
                detail = "; ".join(str(x) for x in detail)
            errors.append({"row": row_number, "field": "email", "email": email_raw, "message": str(detail), "error": str(detail)})
            continue

        if email in seen_emails:
            errors.append({"row": row_number, "field": "email", "email": email, "message": "Correo repetido en el archivo.", "error": "Correo repetido en el archivo."})
            continue
        seen_emails.add(email)

        user = User.objects.filter(email=email).first()
        if user and user.role != "ESTUDIANTE":
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            # Un mensaje genérico: no se confirma al docente que ese correo tiene otra cuenta (D-14).
            errors.append({"row": row_number, "field": "email", "email": email, "message": "Este correo no se puede agregar como estudiante.", "error": "Este correo no se puede agregar como estudiante."})
            continue

        normalized_rows.append({
            "row": row_number,
            "email": email,
            "nombre": nombre,
            "apellido": apellido,
            "user": user,
        })

    if errors:
        raise ImportValidationError(_import_result(
            grupo,
            errors=errors,
            message="El archivo contiene errores.",
            ignored_columns=ignored_columns,
        ))
    return normalized_rows


def _import_audit_context(args, kwargs, result):
    summary, _, student_ids = result
    return {"studentIds": student_ids, "created": summary["created"], "invited": summary["assigned"]}


@auditable("STUDENTS_IMPORTED", "GRUPO", context=_import_audit_context)
def _importar(grupo_id, uploaded_file, profesor):
    """La importación completa en UNA transacción. Devuelve ``(resultado, a notificar, ids)``."""
    with transaction.atomic():
        grupo = _require_grupo(grupo_id, profesor)
        rows, ignored = _parse_student_import(uploaded_file)
        rows = _validate_import_rows(grupo, rows, ignored)
        created = existing = assigned = skipped = 0
        imported_students, to_notify, student_ids = [], [], []

        for item in rows:
            user = item["user"]
            if user:
                existing += 1
            else:
                # RN-10 · cuenta PENDIENTE: inactiva, sin contraseña usable y con el cambio
                # obligatorio. El ADMIN la aprueba y recibe una contraseña temporal por correo.
                user = User.objects.create_user(
                    email=item["email"],
                    password=None,
                    nombre=item["nombre"],
                    apellido=item["apellido"],
                    role="ESTUDIANTE",
                    activo=False,
                    must_change_password=True,
                )
                created += 1

            # E2-10: la importación INVITA; el estudiante entra al grupo cuando acepta (decisión 22).
            row, changed = memberships.invite(grupo, user, profesor)
            student_ids.append(user.id)
            if changed:
                assigned += 1
                # Una cuenta pendiente aún no puede entrar: recibe su aviso al aprobarse (E2-9).
                if user.activo and row.status == MembershipStatus.INVITED:
                    to_notify.append(user)
            else:
                skipped += 1
            imported_students.append(_imported_student_dto(item, row.status))

        summary = _import_result(
            grupo,
            created=created,
            existing=existing,
            assigned=assigned,
            skipped=skipped,
            students=imported_students,
            message=f"Se procesaron correctamente {len(rows)} filas.",
            ignored_columns=ignored,
        )
    return summary, (grupo, profesor, to_notify), student_ids


def importar_estudiantes(grupo_id, uploaded_file, profesor):
    summary, (grupo, teacher, to_notify), _ = _importar(grupo_id, uploaded_file, profesor)
    # Los avisos salen DESPUÉS de confirmar: con el correo dentro de la transacción, un servidor
    # lento retiene los cerrojos de la base; y se acotan (INVITATION_EMAIL_LIMIT).
    notifications.notify_invitations(to_notify, grupo, teacher)
    return summary


def _case_summary(case_version_id):
    version = (
        CaseVersion.objects.filter(pk=case_version_id)
        .select_related("simulation_case")
        .first()
    )
    if not version:
        raise NotFound(f"Version de caso no encontrada: {case_version_id}")
    node_count = SimulationNode.objects.filter(case_version_id=version.id).count()
    return simulation_dto.case_summary(version, node_count)


def listar_casos_asignados(grupo_id, actor):
    """Las versiones asignadas al grupo: su profesor o el ADMIN (``assignment.list``)."""
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if not policies.can(actor, "assignment", "list", owner_id=grupo.profesor_id):
        raise ValidationError("No tiene permiso sobre este grupo")
    ids = list(
        CaseAssignment.objects.filter(grupo_id=grupo.id, active=True)
        .order_by("-assigned_at", "-case_version_id")
        .values_list("case_version_id", flat=True)
    )
    return [_case_summary(case_version_id) for case_version_id in ids]


@auditable(
    "GROUP_CREATED", "GRUPO", -1,
    resource_id=lambda args, kwargs, result: result["id"],
    context=lambda args, kwargs, result: {"groupId": result["id"]},
)
@transaction.atomic
def crear(nombre, codigo, profesor):
    if Grupo.objects.filter(codigo=codigo).exists():
        raise ValidationError(f"Ya existe un grupo con el código: {codigo}")
    grupo = Grupo.objects.create(nombre=nombre, codigo=codigo, profesor=profesor)
    return grupo_dto(grupo)


def _campos_del_grupo_enviados(args, kwargs, result):
    """Solo los NOMBRES de los campos que la petición traía (el nombre y el código del grupo no van a la auditoría)."""
    enviados = [
        campo
        for campo, posicion in (("nombre", 1), ("codigo", 2))
        if arg(args, kwargs, posicion, campo) is not None
    ]
    return {"groupId": result["id"], "changed": enviados}


@auditable("GROUP_UPDATED", "GRUPO", 0, context=_campos_del_grupo_enviados)
@transaction.atomic
def actualizar(grupo_id, nombre, codigo, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    if nombre is not None:
        nombre = str(nombre).strip()
        if not nombre:
            raise ValidationError("El nombre del grupo es obligatorio")
        grupo.nombre = nombre
    if codigo is not None:
        codigo = str(codigo).strip()
        if not codigo:
            raise ValidationError("El código del grupo es obligatorio")
        if Grupo.objects.filter(codigo=codigo).exclude(pk=grupo.id).exists():
            raise ValidationError(f"Ya existe un grupo con el código: {codigo}")
        grupo.codigo = codigo
    grupo.save(update_fields=["nombre", "codigo"])
    return grupo_dto(grupo)


@auditable("GROUP_DELETED", "GRUPO", 0, context=lambda args, kwargs, result: {"groupId": result["id"]})
@transaction.atomic
def eliminar(grupo_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    # Las uniones se borran por el ORM antes que el grupo: en una base restaurada de un volcado
    # anterior a E0-8 sus FK son NO ACTION y no existe el ON DELETE CASCADE de la BD nueva.
    CaseAssignment.objects.filter(grupo_id=grupo.id).delete()
    GrupoEstudiante.objects.filter(grupo_id=grupo.id).delete()
    grupo.delete()
    return {"id": grupo_id}


@auditable(
    "MEMBERSHIP_REMOVED", "GRUPO",
    context=lambda args, kwargs, result: {"studentId": arg(args, kwargs, 1, "estudiante_id")},
)
@transaction.atomic
def quitar_estudiante(grupo_id, estudiante_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    memberships.remove(grupo, estudiante_id)
    return grupo_dto(grupo)


@auditable(
    "MEMBERSHIP_INVITED", "GRUPO",
    context=lambda args, kwargs, result: {"studentId": result[1]},
)
def _invitar_por_correo(grupo_id, email, actor):
    """Devuelve ``(grupo, id del estudiante invitado o None, a quién avisar o None)``."""
    with transaction.atomic():
        grupo = _require_grupo_to_invite(grupo_id, actor)
        estudiante = User.objects.filter(email=normalize_email_value(email)).first()
        if estudiante is None or estudiante.role != "ESTUDIANTE":
            return grupo, None, None
        row, changed = memberships.invite(grupo, estudiante, actor)
        notify = estudiante if changed and estudiante.activo and row.status == MembershipStatus.INVITED else None
    return grupo, estudiante.id, notify


def agregar_estudiante(grupo_id, email, actor):
    """Invita al estudiante con ese correo. La respuesta es la misma exista o no la cuenta, sea o
    no de un estudiante y ya sea o no miembro: no se enumeran cuentas (D-14, E2-10)."""
    grupo, _, notify = _invitar_por_correo(grupo_id, email, actor)
    if notify is not None:
        notifications.notify_invitation(notify, grupo, actor)  # fuera de la transacción
    return grupo_dto(grupo)


def _contexto_de_la_asignacion(args, kwargs, result):
    return {"groupId": arg(args, kwargs, 0, "grupo_id"), "caseVersionId": arg(args, kwargs, 1, "case_version_id")}


# S4-1 · Las rutas heredadas ``/api/grupos/<id>/casos`` cambian lo mismo que ``/api/assignments`` y dejan las mismas
# etiquetas que esta (``asignacion.crear`` y ``asignacion.eliminar``).
@auditable("asignacion.crear", "ASSIGNMENT", -1, context=_contexto_de_la_asignacion)
@transaction.atomic
def asignar_caso(grupo_id, case_version_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    version = (
        CaseVersion.objects.filter(pk=case_version_id)
        .select_related("simulation_case")
        .first()
    )
    if not version:
        raise NotFound(f"Version de caso no encontrada: {case_version_id}")
    if version.status != "PUBLISHED" or not version.simulation_case.active:
        raise ValidationError("Solo se pueden asignar casos publicados y activos")
    assignment, created = CaseAssignment.objects.get_or_create(
        grupo_id=grupo.id, case_version_id=version.id, defaults={"assigned_by": profesor}
    )
    if not created and not assignment.active:
        # La ruta heredada no conoce la pausa: asignar de nuevo la reactiva.
        assignment.active = True
        assignment.save(update_fields=["active"])
    return listar_casos_asignados(grupo.id, profesor)


@auditable("asignacion.eliminar", "ASSIGNMENT", -1, context=_contexto_de_la_asignacion)
@transaction.atomic
def quitar_caso(grupo_id, case_version_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    CaseAssignment.objects.filter(grupo_id=grupo.id, case_version_id=case_version_id).delete()
    return listar_casos_asignados(grupo.id, profesor)
