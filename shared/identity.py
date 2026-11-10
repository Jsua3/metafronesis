"""Política única de identificación de estudiantes (E5-6, ED-8, decisión 21).

- En la traza individual y en el listado de revisión de intentos (`instructor_service`),
  el estudiante se presenta con un alias determinista, estable por docente, que no expone la
  clave primaria secuencial (`Estudiante-<hash>`). El alias depende solo del docente y del
  estudiante: el mismo estudiante se llama igual en el listado (con o sin filtro de grupo), en
  la traza, en los recientes y en el tablero.
- En los reportes agregados o de seguimiento de los grupos del docente (`apps/reportes`),
  se presenta el nombre completo del estudiante.
"""
import hashlib
import hmac

from django.conf import settings


class IdentityPresenter:
    """Presentador centralizado de identidad estudiantil según el contexto (traza vs reporte)."""

    @staticmethod
    def alias_for(student_id: int | None, viewer=None) -> str:
        if student_id is None:
            return "Estudiante-000000"
        viewer_id = getattr(viewer, "id", None) or 0
        secret = (getattr(settings, "SECRET_KEY", None) or "siep-identity").encode("utf-8")
        msg = f"alias:{viewer_id}:{student_id}".encode("utf-8")
        digest = hmac.new(secret, msg, hashlib.sha256).hexdigest()[:6]
        return f"Estudiante-{digest}"

    @staticmethod
    def display_name(student) -> str:
        if student is None:
            return ""
        return f"{student.nombre} {student.apellido}".strip()

    @staticmethod
    def student_ref(student_id: int | None) -> str:
        return f"Estudiante-{student_id if student_id is not None else 0}"
