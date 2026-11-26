import pytest
from apps.users.models import CustomUser
from apps.simulation.models import Rubric
from shared.policies import PROFESOR

pytestmark = pytest.mark.django_db

def test_autorizacion_por_dueno_del_caso(caso):
    otro = CustomUser.objects.create_user(email="otro-f4@example.test", password="test-only", role=PROFESOR)
    version = caso["version"]
    administrador = CustomUser.objects.create_user(email="admin-f4@example.test", password="test-only", role="ADMIN")
    version.created_by = administrador
    version.save(update_fields=["created_by"])
    ruta = f"/api/rubrics/case-versions/{version.pk}"
    assert caso["cliente"].put(ruta, {"rubricId": caso["rubrica"].pk}, format="json").status_code == 200
    version.created_by = otro
    version.save(update_fields=["created_by"])
    ruta = f"/api/rubrics/case-versions/{version.pk}"
    assert caso["cliente"].put(ruta, {"rubricId": caso["rubrica"].pk}, format="json").status_code == 200
    ajena = Rubric.objects.create(name="Otra", created_by=otro)
    caso["cliente"].force_authenticate(otro)
    assert caso["cliente"].put(ruta, {"rubricId": ajena.pk}, format="json").status_code == 404

def test_ausencia_se_distingue_de_version_ajena(caso):
    caso["asignacion"].delete()
    ruta = f"/api/rubrics/case-versions/{caso['version'].pk}"
    respuesta = caso["cliente"].get(ruta)
    assert respuesta.status_code == 404
    assert respuesta.data["code"] == "RUBRIC_NOT_ASSIGNED"
    otro = CustomUser.objects.create_user(email="ajeno-f4@example.test", password="test-only", role=PROFESOR)
    caso["cliente"].force_authenticate(otro)
    assert caso["cliente"].get(ruta).data["code"] != "RUBRIC_NOT_ASSIGNED"


def test_rubrica_no_visible_conserva_404_generico(caso):
    otro = CustomUser.objects.create_user(email="propietario-rubrica@example.test", password="test-only", role=PROFESOR)
    caso['rubrica'].created_by = otro
    caso['rubrica'].save(update_fields=['created_by'])
    respuesta = caso['cliente'].get(f"/api/rubrics/case-versions/{caso['version'].pk}")
    assert respuesta.status_code == 404
    assert respuesta.data['code'] == 'NOT_FOUND'
