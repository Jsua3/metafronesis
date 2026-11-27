import pytest
from django.db import DatabaseError, connection, transaction
from django.utils import timezone

from apps.simulation.models import AuditLog
from apps.simulation.services.audit_service import audit_purge_window


pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-42")]


def crear_registro():
    return AuditLog.objects.create(action="PRUEBA", retention_until=timezone.now())


def test_auditoria_rechaza_actualizar_y_borrar_fuera_de_la_ventana_de_purga():
    registro = crear_registro()

    with pytest.raises(DatabaseError), transaction.atomic():
        AuditLog.objects.filter(pk=registro.pk).update(action="ALTERADA")
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditLog.objects.filter(pk=registro.pk).delete()

    registro.refresh_from_db()
    assert registro.action == "PRUEBA"


def test_ventana_de_purga_autoriza_actualizar_y_borrar_la_auditoria():
    registro = crear_registro()

    with audit_purge_window():
        assert AuditLog.objects.filter(pk=registro.pk).update(action="DEPURADA") == 1
        assert AuditLog.objects.filter(pk=registro.pk).delete()[0] == 1

    assert not AuditLog.objects.exists()


def test_el_trigger_de_auditoria_tambien_protege_truncate():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_get_triggerdef(oid) FROM pg_trigger "
            "WHERE tgname = 'audit_logs_append_only_truncate'"
        )
        definicion = cursor.fetchone()[0]

    assert "BEFORE TRUNCATE ON public.audit_logs" in definicion
