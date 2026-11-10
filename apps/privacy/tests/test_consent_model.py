"""S3-2a · ``ConsentRecord``: lo que la base de datos impone (cierra ETH-01, SIEP-RF-05 y RNF-010 en el servidor).

La evidencia del consentimiento no depende de que el servicio se porte bien: la base rechaza un segundo registro vigente
idéntico (los nulos cuentan como iguales, así que ``DATA_TREATMENT`` sin caso también choca) y un ``CONTENT_NOTICE`` sin caso.

Cada restricción lleva su control negativo: la prueba la quita DENTRO de su transacción (PostgreSQL deshace el DDL al
terminar) y comprueba que, sin ella, el mismo insert pasa. Así se ve que el rechazo viene de esa restricción y no de otra.
El DDL va ANTES de cualquier insert: una fila con claves foráneas diferidas dejaría eventos pendientes sobre la tabla.
"""
from datetime import timedelta

import pytest
from django.db import IntegrityError, connection, transaction
from django.db.models import ProtectedError
from django.utils import timezone

from apps.privacy.models import ConsentRecord, ConsentType
from apps.simulation.models import CaseVersion

from .support import crear_version

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security, pytest.mark.django_db]

UNICO = "uq_consent_records_active_per_notice"
CONTENIDO_SIN_CASO = "consent_records_notice_needs_case_check"
TIPO_CONOCIDO = "consent_records_type_check"
INDICE = "idx_consent_person_case"


def _aviso(persona, version, *, notice_version="aviso-1", **extra):
    return ConsentRecord.objects.create(
        person=persona, consent_type=ConsentType.CONTENT_NOTICE, case_version=version, notice_version=notice_version, **extra
    )


def _tratamiento(persona, *, notice_version="datos-1", **extra):
    return ConsentRecord.objects.create(
        person=persona, consent_type=ConsentType.DATA_TREATMENT, case_version=None, notice_version=notice_version, **extra
    )


def _quitar_indice(nombre):
    with connection.cursor() as cursor:
        cursor.execute(f'DROP INDEX "{nombre}"')


def _quitar_restriccion(nombre):
    with connection.cursor() as cursor:
        cursor.execute(f'ALTER TABLE consent_records DROP CONSTRAINT "{nombre}"')


# ── Unicidad parcial: un solo registro vigente por (persona, tipo, caso, versión del aviso) ─────────────────


def test_dos_registros_vigentes_iguales_de_un_aviso_chocan(estudiante_a, version_publicada):
    _aviso(estudiante_a, version_publicada)

    with pytest.raises(IntegrityError), transaction.atomic():
        _aviso(estudiante_a, version_publicada)

    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 1


def test_dos_tratamientos_de_datos_vigentes_iguales_chocan_aunque_no_tengan_caso(estudiante_a):
    # ``case_version`` es nulo en los dos: un índice común los trataría como distintos y los dejaría pasar.
    _tratamiento(estudiante_a)

    with pytest.raises(IntegrityError), transaction.atomic():
        _tratamiento(estudiante_a)

    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 1


def test_tras_retirar_el_anterior_se_permite_uno_nuevo(estudiante_a, version_publicada):
    primero = _aviso(estudiante_a, version_publicada)
    ConsentRecord.objects.filter(pk=primero.pk).update(withdrawn_at=timezone.now())

    segundo = _aviso(estudiante_a, version_publicada)

    assert segundo.pk != primero.pk
    assert ConsentRecord.objects.filter(person=estudiante_a, withdrawn_at__isnull=True).count() == 1
    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 2  # lo retirado no se borra


def test_tras_retirar_el_tratamiento_de_datos_se_permite_uno_nuevo(estudiante_a):
    primero = _tratamiento(estudiante_a)
    ConsentRecord.objects.filter(pk=primero.pk).update(withdrawn_at=timezone.now())

    _tratamiento(estudiante_a)

    assert ConsentRecord.objects.filter(person=estudiante_a, withdrawn_at__isnull=True).count() == 1


def test_lo_que_difiere_en_persona_caso_tipo_o_version_del_aviso_no_choca(estudiante_a, estudiante_b, version_publicada, version_borrador):
    _aviso(estudiante_a, version_publicada)

    _aviso(estudiante_b, version_publicada)  # otra persona
    _aviso(estudiante_a, version_borrador)  # otro caso
    _aviso(estudiante_a, version_publicada, notice_version="aviso-2")  # otra versión del aviso
    _tratamiento(estudiante_a, notice_version="aviso-1")  # otro tipo, aunque lleve el mismo texto de versión

    assert ConsentRecord.objects.count() == 5


def test_control_negativo_sin_el_indice_unico_se_duplica_el_registro(estudiante_a, version_publicada):
    _quitar_indice(UNICO)

    _aviso(estudiante_a, version_publicada)
    _aviso(estudiante_a, version_publicada)  # con el índice puesto esta línea lanza IntegrityError

    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 2


def test_control_negativo_sin_el_indice_unico_se_duplica_el_tratamiento_de_datos(estudiante_a):
    _quitar_indice(UNICO)

    _tratamiento(estudiante_a)
    _tratamiento(estudiante_a)

    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 2


def test_el_indice_unico_trata_los_nulos_como_iguales_en_la_definicion():
    """Si alguien lo cambia a ``nulls_distinct=True`` el tratamiento de datos se duplicaría sin que ningún insert avise."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT indexdef FROM pg_indexes WHERE tablename = 'consent_records' AND indexname = %s", [UNICO])
        (definicion,) = cursor.fetchone()

    assert "NULLS NOT DISTINCT" in definicion
    assert "WHERE (withdrawn_at IS NULL)" in definicion


# ── CHECK: un aviso de contenido siempre lleva su caso ────────────────────────────────────────────────────


def test_un_aviso_de_contenido_sin_caso_se_rechaza(estudiante_a):
    with pytest.raises(IntegrityError), transaction.atomic():
        ConsentRecord.objects.create(
            person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=None, notice_version="aviso-1"
        )


def test_control_negativo_sin_el_check_se_guarda_un_aviso_sin_caso(estudiante_a):
    _quitar_restriccion(CONTENIDO_SIN_CASO)

    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=None, notice_version="aviso-1"
    )

    assert ConsentRecord.objects.filter(person=estudiante_a, case_version__isnull=True).count() == 1


def test_un_tipo_desconocido_se_rechaza(estudiante_a, version_publicada):
    with pytest.raises(IntegrityError), transaction.atomic():
        ConsentRecord.objects.create(
            person=estudiante_a, consent_type="OTRO", case_version=version_publicada, notice_version="aviso-1"
        )


def test_control_negativo_sin_el_check_de_tipo_se_guarda_un_tipo_desconocido(estudiante_a, version_publicada):
    _quitar_restriccion(TIPO_CONOCIDO)

    ConsentRecord.objects.create(
        person=estudiante_a, consent_type="OTRO", case_version=version_publicada, notice_version="aviso-1"
    )

    assert ConsentRecord.objects.filter(consent_type="OTRO").count() == 1


# ── Forma de la tabla ────────────────────────────────────────────────────────────────────────────────────


def test_la_aceptacion_lleva_la_hora_del_servidor_por_defecto_y_no_nace_retirada(estudiante_a, version_publicada):
    antes = timezone.now() - timedelta(seconds=5)

    registro = _aviso(estudiante_a, version_publicada)

    registro.refresh_from_db()
    assert antes <= registro.accepted_at <= timezone.now() + timedelta(seconds=5)
    assert registro.withdrawn_at is None


def test_la_persona_esta_protegida_contra_el_borrado(estudiante_a, version_publicada):
    _aviso(estudiante_a, version_publicada)

    with pytest.raises(ProtectedError):
        estudiante_a.delete()


def test_la_base_impide_borrar_una_version_del_caso_con_aceptaciones(estudiante_a, docente):
    # ``DO_NOTHING`` (no ``PROTECT``: Django 6.1 no mezcla los dos tipos de ``on_delete``): Django no se lo impide,
    # lo impide la clave foránea de la base (NO ACTION), que es diferida y por eso se fuerza a comprobarse aquí.
    version = crear_version(docente, estado="PUBLISHED")
    version_id = version.pk  # ``delete()`` deja la instancia sin ``pk``
    _aviso(estudiante_a, version)

    with pytest.raises(IntegrityError), transaction.atomic():
        version.delete()
        connection.check_constraints()

    assert ConsentRecord.objects.filter(person=estudiante_a, case_version_id=version_id).exists()
    assert CaseVersion.objects.filter(pk=version_id).exists()  # el punto de guardado deshizo el borrado


def test_hay_un_indice_por_persona_y_caso():
    with connection.cursor() as cursor:
        cursor.execute("SELECT indexdef FROM pg_indexes WHERE tablename = 'consent_records' AND indexname = %s", [INDICE])
        fila = cursor.fetchone()

    assert fila is not None, f"falta el índice {INDICE}"
    assert "(person_id, case_version_id)" in fila[0]


def test_la_tabla_se_llama_consent_records():
    assert ConsentRecord._meta.db_table == "consent_records"
    assert [campo.name for campo in ConsentRecord._meta.concrete_fields] == [
        "id", "person", "consent_type", "case_version", "notice_version", "accepted_at", "withdrawn_at",
    ]
