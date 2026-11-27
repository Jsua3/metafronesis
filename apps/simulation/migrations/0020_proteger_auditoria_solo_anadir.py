from django.db import migrations


PROTEGER_AUDITORIA = """
CREATE FUNCTION public.audit_logs_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_setting('siep.purge', true) = 'on' THEN
        IF TG_OP = 'UPDATE' THEN
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'audit_logs es de solo añadir';
END;
$$;

CREATE TRIGGER audit_logs_append_only_row
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only_guard();

CREATE TRIGGER audit_logs_append_only_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_append_only_guard();
"""


QUITAR_PROTECCION_AUDITORIA = """
DROP TRIGGER IF EXISTS audit_logs_append_only_truncate ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_append_only_row ON public.audit_logs;
DROP FUNCTION IF EXISTS public.audit_logs_append_only_guard();
"""


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0019_intento_convocatoria"),
    ]

    operations = [
        migrations.RunSQL(PROTEGER_AUDITORIA, QUITAR_PROTECCION_AUDITORIA),
    ]
