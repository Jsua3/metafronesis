import uuid
import pytest
import zipfile
from io import BytesIO
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.grupos.models import GrupoEstudiante

User = get_user_model()


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_g@x.com", password="pass1234", nombre="P", apellido="F", role="PROFESOR"
    )


@pytest.fixture
def otro_profesor(db):
    return User.objects.create_user(
        email="prof_g2@x.com", password="pass1234", nombre="P2", apellido="F", role="PROFESOR"
    )


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_g@x.com", password="pass1234", nombre="E", apellido="S", role="ESTUDIANTE"
    )


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_g@x.com", password="pass1234", nombre="A", apellido="D", role="ADMIN"
    )


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _xlsx_upload(rows, name="estudiantes.xlsx"):
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

    def col_name(index):
        index += 1
        name = ""
        while index:
            index, rem = divmod(index - 1, 26)
            name = chr(65 + rem) + name
        return name

    sheet_rows = []
    for r_idx, row in enumerate(rows, start=1):
        cells = []
        for c_idx, value in enumerate(row):
            ref = f"{col_name(c_idx)}{r_idx}"
            safe = str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{safe}</t></is></c>')
        sheet_rows.append(f'<row r="{r_idx}">{"".join(cells)}</row>')

    data = BytesIO()
    with zipfile.ZipFile(data, "w") as zf:
        zf.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""")
        zf.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        zf.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Estudiantes" sheetId="1" r:id="rId1"/></sheets>
</workbook>""")
        zf.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""")
        zf.writestr("xl/worksheets/sheet1.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="{ns}"><sheetData>{''.join(sheet_rows)}</sheetData></worksheet>""")
    return SimpleUploadedFile(
        name,
        data.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def test_list_forbidden_for_estudiante(estudiante):
    assert cl(estudiante).get("/api/grupos").status_code == 403


def test_list_all_active_groups_for_admin(admin, profesor, otro_profesor):
    cl(profesor).post("/api/grupos", {"nombre": "Mio", "codigo": "OWN1"}, format="json")
    cl(otro_profesor).post("/api/grupos", {"nombre": "Suyo", "codigo": "OTH1"}, format="json")

    resp = cl(admin).get("/api/grupos")

    assert resp.status_code == 200
    codigos = {g["codigo"] for g in resp.data["data"]}
    assert {"OWN1", "OTH1"} <= codigos


def test_create_forbidden_for_admin(admin):
    resp = cl(admin).post("/api/grupos", {"nombre": "Admin", "codigo": "ADM1"}, format="json")
    assert resp.status_code == 403


def test_create_grupo_201(profesor):
    resp = cl(profesor).post("/api/grupos", {"nombre": "G1", "codigo": "ABC123"}, format="json")
    assert resp.status_code == 201
    assert resp.data["message"] == "Grupo creado"
    assert resp.data["data"] == {
        "id": resp.data["data"]["id"], "nombre": "G1", "codigo": "ABC123",
        "totalEstudiantes": 0, "totalInvitados": 0,
    }


def test_create_duplicate_codigo_400(profesor):
    cl(profesor).post("/api/grupos", {"nombre": "G1", "codigo": "DUP1"}, format="json")
    resp = cl(profesor).post("/api/grupos", {"nombre": "G2", "codigo": "DUP1"}, format="json")
    assert resp.status_code == 400
    assert resp.data["message"] == "Ya existe un grupo con el código: DUP1"


def test_add_student_invites_and_the_total_counts_only_active_members(profesor, estudiante):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "ADD1"}, format="json").data["data"]
    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes", {"email": estudiante.email}, format="json"
    )
    assert resp.status_code == 200
    # E2-10: la invitación aún no suma; cuenta cuando el estudiante acepta.
    assert resp.data["data"]["totalEstudiantes"] == 0
    cl(estudiante).post(f"/api/me/invitations/{grupo['id']}/accept", {}, format="json")
    after = cl(profesor).get("/api/grupos").data["data"]
    assert next(g for g in after if g["id"] == grupo["id"])["totalEstudiantes"] == 1


def test_import_students_from_xlsx_creates_and_assigns(profesor, estudiante):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "XLS1"}, format="json").data["data"]
    upload = _xlsx_upload([
        ["nombre", "apellido", "email", "password"],
        ["Ana", "Rojas", "ana.rojas@x.com", "Clave1234"],
        ["Luis", "Perez", "luis.perez@x.com", ""],
        [estudiante.nombre, estudiante.apellido, estudiante.email, ""],
    ])

    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes/import/",
        {"file": upload},
        format="multipart",
    )

    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["created"] == 2
    assert data["existing"] == 1
    assert data["assigned"] == 3
    assert data["associated"] == 3
    assert data["skipped"] == 0
    assert data["duplicated"] == 0
    assert data["grupo"]["totalEstudiantes"] == 0  # E2-10: invitados, aún no aceptaron
    assert {s["membershipStatus"] for s in data["students"]} == {"INVITED"}
    # E2-9 (RN-10, D-5): ninguna contraseña viaja ni se fija: las cuentas nuevas quedan pendientes.
    assert "defaultPassword" not in data
    assert data["pendingApproval"] == 2
    assert data["ignoredColumns"] == ["password"]
    assert User.objects.get(email="ana.rojas@x.com").role == "ESTUDIANTE"
    luis = User.objects.get(email="luis.perez@x.com")
    assert (luis.activo, luis.must_change_password, luis.has_usable_password()) == (False, True, False)
    assert not User.objects.get(email="ana.rojas@x.com").check_password("Clave1234")

    students = cl(profesor).get(f"/api/grupos/{grupo['id']}/estudiantes").data["data"]
    emails = {s["email"] for s in students}
    assert {"ana.rojas@x.com", "luis.perez@x.com", estudiante.email} <= emails




def test_import_students_rejects_duplicate_email_without_partial_writes(profesor):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "XLS2"}, format="json").data["data"]
    upload = _xlsx_upload([
        ["nombre", "apellido", "email", "password"],
        ["Ana", "Rojas", "ana.rojas@x.com", ""],
        ["Ana", "Duplicada", "ana.rojas@x.com", ""],
    ])

    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes/import/",
        {"file": upload},
        format="multipart",
    )

    assert resp.status_code == 400
    data = resp.data["data"]
    assert data["created"] == 0
    assert data["errors"][0]["field"] == "email"
    assert not User.objects.filter(email="ana.rojas@x.com").exists()


def test_import_students_from_institutional_xlsx_template(profesor):
    suffix = uuid.uuid4().hex[:8]
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": f"INST{suffix}"}, format="json").data["data"]
    upload = _xlsx_upload([
        ["N°", "Nombres", "Apellidos", "Correo institucional", "Contraseña temporal"],
        ["1", "Sofía", "García Pérez", f"sofia.garcia.{suffix}@institucion.edu.co", "DaTe9590!"],
        ["2", "Mateo", "Martínez Rojas", f"mateo.martinez.{suffix}@institucion.edu.co", "LuTe1346*"],
    ])

    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes/import",
        {"file": upload},
        format="multipart",
    )

    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["created"] == 2
    assert data["assigned"] == 2
    assert data["grupo"]["totalEstudiantes"] == 0  # invitados: el total cuenta a quien aceptó
    assert User.objects.get(email=f"sofia.garcia.{suffix}@institucion.edu.co").nombre == "Sofía"
    # La columna «Contraseña temporal» del archivo institucional se ignora y se informa (E2-9).
    mateo = User.objects.get(email=f"mateo.martinez.{suffix}@institucion.edu.co")
    assert not mateo.check_password("LuTe1346*")
    assert (mateo.activo, mateo.has_usable_password()) == (False, False)
    assert data["ignoredColumns"] == ["password"]


def test_import_template_download_can_be_reuploaded(profesor):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "XLS3"}, format="json").data["data"]
    template = cl(profesor).get("/api/grupos/estudiantes/import/template/")
    assert template.status_code == 200
    upload = SimpleUploadedFile(
        "plantilla_importacion_estudiantes_siep.xlsx",
        template.content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes/import/",
        {"file": upload},
        format="multipart",
    )
    assert resp.status_code == 200
    assert resp.data["data"]["created"] == 1


def test_import_students_rejects_missing_required_column(profesor):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "XLS4"}, format="json").data["data"]
    upload = _xlsx_upload([["nombre", "email"], ["Ana", "ana.rojas@x.com"]])
    resp = cl(profesor).post(f"/api/grupos/{grupo['id']}/estudiantes/import/", {"file": upload}, format="multipart")
    assert resp.status_code == 400
    assert "Faltan columnas obligatorias" in resp.data["message"]


def test_list_students_in_group(profesor, estudiante):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "LIST1"}, format="json").data["data"]
    cl(profesor).post(f"/api/grupos/{grupo['id']}/estudiantes", {"email": estudiante.email}, format="json")

    resp = cl(profesor).get(f"/api/grupos/{grupo['id']}/estudiantes")

    assert resp.status_code == 200
    assert resp.data["data"] == [{
        "id": estudiante.id,
        "nombre": "",  # D-14: de una invitación pendiente el docente solo ve el correo
        "apellido": "",
        "email": estudiante.email,
        "role": "ESTUDIANTE",
        "membershipStatus": "INVITED",
    }]


def test_assign_case_to_group(profesor, caso_publicado):
    case_version_id = caso_publicado.id
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "CASE1"}, format="json").data["data"]

    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/casos",
        {"caseVersionId": case_version_id},
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["message"] == "Caso asignado"
    assert resp.data["data"][0]["caseVersionId"] == case_version_id


def test_assign_case_to_foreign_group_400(profesor, otro_profesor, caso_publicado):
    case_version_id = caso_publicado.id
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "CASE2"}, format="json").data["data"]

    resp = cl(otro_profesor).post(
        f"/api/grupos/{grupo['id']}/casos",
        {"caseVersionId": case_version_id},
        format="json",
    )

    assert resp.status_code == 400
    assert resp.data["message"] == "No tiene permiso sobre este grupo"


def test_add_student_to_foreign_group_400(profesor, otro_profesor, estudiante):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "FOR1"}, format="json").data["data"]
    resp = cl(otro_profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes", {"email": estudiante.email}, format="json"
    )
    assert resp.status_code == 400
    assert resp.data["message"] == "No tiene permiso sobre este grupo"


def test_add_non_student_is_indistinguishable_from_any_other_email(profesor, otro_profesor, estudiante):
    """E2-10 (D-14): «agregar por correo» no revela si la cuenta existe ni si es de estudiante."""
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "NS1"}, format="json").data["data"]
    non_student = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes", {"email": otro_profesor.email}, format="json"
    )
    unknown = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes", {"email": "nadie@x.com"}, format="json"
    )
    assert non_student.status_code == unknown.status_code == 200
    assert non_student.data == unknown.data
    assert not GrupoEstudiante.objects.filter(estudiante_id=otro_profesor.id).exists()


def test_add_student_missing_group_404(profesor, estudiante):
    resp = cl(profesor).post(
        "/api/grupos/99999999/estudiantes", {"email": estudiante.email}, format="json"
    )
    assert resp.status_code == 404


def test_update_grupo_renames(profesor):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "UPD1"}, format="json").data["data"]
    resp = cl(profesor).put(f"/api/grupos/{grupo['id']}", {"nombre": "Nuevo", "codigo": "UPD1B"}, format="json")
    assert resp.status_code == 200
    assert resp.data["message"] == "Grupo actualizado"
    assert resp.data["data"]["nombre"] == "Nuevo"
    assert resp.data["data"]["codigo"] == "UPD1B"


def test_update_grupo_duplicate_codigo_400(profesor):
    cl(profesor).post("/api/grupos", {"nombre": "A", "codigo": "DUPX"}, format="json")
    grupo = cl(profesor).post("/api/grupos", {"nombre": "B", "codigo": "DUPY"}, format="json").data["data"]
    resp = cl(profesor).put(f"/api/grupos/{grupo['id']}", {"codigo": "DUPX"}, format="json")
    assert resp.status_code == 400
    assert "Ya existe un grupo" in resp.data["message"]


def test_update_foreign_group_400(profesor, otro_profesor):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "UPDF"}, format="json").data["data"]
    resp = cl(otro_profesor).put(f"/api/grupos/{grupo['id']}", {"nombre": "X"}, format="json")
    assert resp.status_code == 400
    assert resp.data["message"] == "No tiene permiso sobre este grupo"


def test_delete_grupo_removes_it(profesor, estudiante):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "DEL1"}, format="json").data["data"]
    cl(profesor).post(f"/api/grupos/{grupo['id']}/estudiantes", {"email": estudiante.email}, format="json")
    resp = cl(profesor).delete(f"/api/grupos/{grupo['id']}")
    assert resp.status_code == 200
    assert resp.data["message"] == "Grupo eliminado"
    codigos = {g["codigo"] for g in cl(profesor).get("/api/grupos").data["data"]}
    assert "DEL1" not in codigos
    # El código queda libre para reusarse.
    again = cl(profesor).post("/api/grupos", {"nombre": "G2", "codigo": "DEL1"}, format="json")
    assert again.status_code == 201


def test_delete_foreign_group_400(profesor, otro_profesor):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "DELF"}, format="json").data["data"]
    resp = cl(otro_profesor).delete(f"/api/grupos/{grupo['id']}")
    assert resp.status_code == 400


def test_delete_grupo_forbidden_for_estudiante(estudiante):
    assert cl(estudiante).delete("/api/grupos/1").status_code == 403


def test_remove_student_from_group(profesor, estudiante):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": "RMV1"}, format="json").data["data"]
    cl(profesor).post(f"/api/grupos/{grupo['id']}/estudiantes", {"email": estudiante.email}, format="json")
    resp = cl(profesor).delete(f"/api/grupos/{grupo['id']}/estudiantes/{estudiante.id}")
    assert resp.status_code == 200
    assert resp.data["message"] == "Estudiante retirado"
    assert resp.data["data"]["totalEstudiantes"] == 0


def test_list_only_own_groups(profesor, otro_profesor):
    cl(profesor).post("/api/grupos", {"nombre": "Mio", "codigo": "OWN1"}, format="json")
    cl(otro_profesor).post("/api/grupos", {"nombre": "Suyo", "codigo": "OTH1"}, format="json")
    data = cl(profesor).get("/api/grupos").data["data"]
    codigos = {g["codigo"] for g in data}
    assert "OWN1" in codigos
    assert "OTH1" not in codigos
