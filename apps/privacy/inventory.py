"""Inventario de datos de SIEP: qué guarda cada columna, para qué, cuánto tiempo y por dónde sale (S3-1).

Cada columna de cada tabla gestionada tiene una clasificación. La prueba
``apps/privacy/tests/test_inventory_coverage.py`` es la compuerta: una columna sin clasificar, una entrada
obsoleta o un documento sin regenerar rompen el CI. El documento versionado vive en
``docs/seguridad/inventario-de-datos.md`` y se regenera con ``python -m apps.privacy.inventory --write``
(desde ``backend_django/``, con el intérprete del venv).

Clasificaciones:
- PUBLIC: contenido del programa (casos, mapas, diálogos, herramientas, competencias) que no identifica a
  ninguna persona. No quiere decir «público en internet».
- PERSONAL: identifica o permite identificar a una persona (nombre, correo, rol, pertenencia a un grupo,
  identificadores de cuenta y de solicitud).
- SENSITIVE: lo que una persona decide, escribe o recibe de una evaluación o de una situación de violencia
  (intentos, bitácora, evaluaciones docentes, la conducta del estudiante en el caso).
- SECRET: credenciales y sus hashes (la contraseña, el hash del token de un intento).
- TECHNICAL: operación del sistema que no describe a nadie (contadores, marcas de tiempo del sistema,
  banderas, claves ya hasheadas, versiones de esquema).

Reglas:
- ``default`` solo en tablas SIN datos personales ni sensibles y sin nombres sospechosos (lo comprueba la
  prueba): toda columna de la tabla hereda ese valor. Las demás tablas listan CADA columna.
- Toda columna PERSONAL, SENSITIVE o SECRET lleva motivo y declara sus salidas en ``exits``: ``api``,
  ``csv``, ``reporte``, ``correo`` o ``registro``. Una lista vacía significa que el dato no sale por ningún
  canal (uso interno). ``"*"`` cubre las columnas de la tabla que no tienen entrada propia.
- ``forbidden_exits`` declara los canales por los que el dato NUNCA debe salir.
"""

from __future__ import annotations

import argparse
import os
import sys
from enum import StrEnum
from pathlib import Path

from django.apps import apps


class Classification(StrEnum):
    PUBLIC = "PUBLIC"
    PERSONAL = "PERSONAL"
    SENSITIVE = "SENSITIVE"
    SECRET = "SECRET"
    TECHNICAL = "TECHNICAL"


PUBLIC = Classification.PUBLIC
PERSONAL = Classification.PERSONAL
SENSITIVE = Classification.SENSITIVE
SECRET = Classification.SECRET
TECHNICAL = Classification.TECHNICAL

#: Clasificaciones que exigen motivo y salidas declaradas.
CON_SALIDAS = (PERSONAL, SENSITIVE, SECRET)

CANALES = ("api", "csv", "reporte", "correo", "registro")

#: Documento versionado: ``<raíz del repositorio>/docs/seguridad/inventario-de-datos.md``.
DOC_PATH = Path(__file__).resolve().parents[3] / "docs" / "seguridad" / "inventario-de-datos.md"

# BORRADOR: finalidad y plazo pendientes de la aprobación de Psicología (SD-9).
DATA_INVENTORY: dict[str, dict] = {
    # ── Tablas de Django y de seguridad: sin datos de personas ────────────────────────────────────
    "auth_permission": {
        "purpose": "Permisos que genera Django para cada modelo. El sistema no los asigna a personas.",
        "retention": "Mientras exista el modelo. Es configuración del sistema, sin datos de personas.",
        "default": TECHNICAL,
    },
    "auth_group": {
        "purpose": "Grupos de permisos de Django. No guarda datos de personas.",
        "retention": "Mientras exista el modelo. Es configuración del sistema, sin datos de personas.",
        "default": TECHNICAL,
    },
    "django_content_type": {
        "purpose": "Catálogo de modelos de Django que usan los permisos. No guarda datos de personas.",
        "retention": "Mientras exista el modelo. Es configuración del sistema, sin datos de personas.",
        "default": TECHNICAL,
    },
    "auth_group_permissions": {
        "purpose": "Tabla intermedia entre grupos y permisos de Django. No guarda datos de personas.",
        "retention": "Mientras exista el modelo. Es configuración del sistema, sin datos de personas.",
        "default": TECHNICAL,
    },
    "rate_limit_buckets": {
        "purpose": "Contadores del limitador de intentos (contra el abuso): una clave ya hasheada y un contador.",
        "retention": (
            "Lo que dura la ventana del límite. El comando `unblock_login` la puede borrar; "
            "sin purga automática documentada (SD-9, pendiente de la institución)."
        ),
        "default": None,
        "columns": {
            "scope": TECHNICAL,
            "key_hash": (
                TECHNICAL,
                "clave HMAC con la llave del servidor, de un correo o de una IP; no se invierte sin la llave",
            ),
            "window_start": TECHNICAL,
            "count": TECHNICAL,
        },
    },
    # ── Cuentas, solicitudes y grupos ─────────────────────────────────────────────────────────────
    "users": {
        "purpose": "Cuentas de acceso de estudiantes, docentes y administración: identidad, rol e inicio de sesión.",
        "retention": (
            "Mientras la cuenta exista. El plazo tras la baja lo decide la institución "
            "(SD-9, pendiente de la institución)."
        ),
        "default": None,
        "columns": {
            "id": (PERSONAL, "identificador de la cuenta: enlaza con todos los datos de la persona"),
            "password_hash": (
                SECRET,
                "hash BCrypt de la contraseña; la temporal sale en claro por correo al aprobar la cuenta "
                "(account_service.py) y no se guarda",
            ),
            "email": (PERSONAL, "correo institucional: identifica y es el medio de contacto"),
            "nombre": (PERSONAL, "nombre de la persona"),
            "apellido": (PERSONAL, "apellido de la persona"),
            "role": (PERSONAL, "rol de la cuenta: estudiante, docente o administración"),
            "activo": TECHNICAL,
            "created_at": TECHNICAL,
            "must_change_password": TECHNICAL,
            "session_epoch": TECHNICAL,
            "temp_password_set_at": TECHNICAL,
        },
        "exits": {
            "id": ["api", "registro"],
            "email": ["api", "correo"],
            "nombre": ["api", "csv", "reporte", "correo"],
            "apellido": ["api", "csv", "reporte", "correo"],
            "role": ["api"],
            "password_hash": [],
        },
        "forbidden_exits": {"password_hash": ["api", "csv", "reporte", "correo", "registro"]},
    },
    "access_requests": {
        "purpose": "Solicitudes de cuenta de personas que aún no tienen acceso; las revisa la administración.",
        "retention": "Sin purga automática documentada (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": (PERSONAL, "identificador de la solicitud: enlaza con el nombre y el correo de quien la pide"),
            "nombre": (PERSONAL, "nombre que indica quien pide la cuenta (sin verificar)"),
            "apellido": (PERSONAL, "apellido que indica quien pide la cuenta (sin verificar)"),
            "email": (PERSONAL, "correo de quien pide la cuenta; a él se le responde"),
            "status": (PERSONAL, "estado del trámite: pendiente, revisada o descartada"),
            "created_at": TECHNICAL,
            "reviewed_at": TECHNICAL,
        },
        "exits": {
            "id": ["api", "correo"],
            "nombre": ["api", "correo"],
            "apellido": ["api", "correo"],
            "email": ["api", "correo"],
            "status": ["api"],
        },
    },
    "grupos": {
        "purpose": "Grupos o clases de un docente: nombre, código y docente responsable.",
        "retention": "Mientras el grupo exista (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "nombre": PUBLIC,
            "codigo": PUBLIC,
            "profesor_id": (PERSONAL, "docente responsable del grupo"),
            "activo": TECHNICAL,
            "created_at": TECHNICAL,
        },
        "exits": {"profesor_id": []},
    },
    "grupo_estudiante": {
        "purpose": "Pertenencia de un estudiante a un grupo: invitación, aceptación o rechazo.",
        "retention": "Mientras la pertenencia o la invitación exista (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "grupo_id": (TECHNICAL, "referencia al grupo; sola no identifica a la persona"),
            "estudiante_id": (PERSONAL, "estudiante invitado o miembro del grupo"),
            "status": (PERSONAL, "estado de la invitación o de la pertenencia del estudiante"),
            "invited_by": (PERSONAL, "docente que invitó al estudiante"),
            "invited_at": TECHNICAL,
            "responded_at": TECHNICAL,
        },
        "exits": {"estudiante_id": ["api"], "status": ["api"], "invited_by": []},
    },
    "case_assignments": {
        "purpose": "Asignación de un caso a un grupo o a un estudiante, con su ventana de apertura y cierre.",
        "retention": "Mientras la asignación exista (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "case_version_id": (TECHNICAL, "versión del caso asignada; no identifica a la persona"),
            "grupo_id": (TECHNICAL, "grupo destinatario; no identifica a la persona"),
            "estudiante_id": (PERSONAL, "estudiante a quien se asigna el caso (asignación individual)"),
            "opens_at": TECHNICAL,
            "closes_at": TECHNICAL,
            "sort_order": TECHNICAL,
            "assigned_by": (PERSONAL, "docente que asignó el caso"),
            "assigned_at": TECHNICAL,
            "active": TECHNICAL,
        },
        "exits": {"estudiante_id": ["api"], "assigned_by": []},
    },
    # ── Autoría del contenido: casos, versiones, revisiones y rúbricas ────────────────────────────
    "simulation_cases": {
        "purpose": "Casos de simulación: código, título y descripción; quién los creó.",
        "retention": "Mientras exista el caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "code": PUBLIC,
            "title": PUBLIC,
            "description": PUBLIC,
            "active": TECHNICAL,
            "created_by": (PERSONAL, "docente que creó el caso"),
            "created_at": TECHNICAL,
            "updated_at": TECHNICAL,
        },
        "exits": {"created_by": []},
    },
    "case_versions": {
        "purpose": "Versiones de un caso con su edición, validación y publicación; quién las creó y editó.",
        "retention": "Mientras exista el caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "simulation_case_id": TECHNICAL,
            "semantic_version": TECHNICAL,
            "status": TECHNICAL,
            "narrative_context": PUBLIC,
            "learning_objectives": PUBLIC,
            "estimated_minutes": PUBLIC,
            "cloned_from_id": TECHNICAL,
            "published_at": TECHNICAL,
            "validated_at": TECHNICAL,
            "definition_hash": TECHNICAL,
            "reuse_ratio": TECHNICAL,
            "created_by": (PERSONAL, "docente que creó la versión"),
            "created_at": TECHNICAL,
            "version": TECHNICAL,
            "world_schema_version": TECHNICAL,
            "rules": PUBLIC,
            "last_edited_by": (PERSONAL, "última persona que editó la versión"),
            "edited_alone_since": TECHNICAL,
        },
        "exits": {"created_by": [], "last_edited_by": []},
    },
    "case_reviews": {
        "purpose": "Revisiones de contenido de una versión antes de publicarla: quién la pidió, quién decidió y con qué nota.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "case_version_id": TECHNICAL,
            "requested_by": (PERSONAL, "persona que pidió la revisión de contenido"),
            "requested_at": TECHNICAL,
            "decided_by": (PERSONAL, "persona que decidió la revisión"),
            "decided_at": TECHNICAL,
            "decision": TECHNICAL,
            "reason": TECHNICAL,
            "note": (PERSONAL, "texto libre del revisor: puede identificarlo"),
            "content_reviewer": (PERSONAL, "nombre de quien revisó el contenido (constancia)"),
            "content_reviewed_on": TECHNICAL,
            "content_reference": PUBLIC,
        },
        "exits": {
            "requested_by": ["api"],
            "decided_by": ["api"],
            "note": ["api"],
            "content_reviewer": ["api"],
        },
    },
    "decision_options": {
        "purpose": "Opciones de decisión de cada escena, con su texto, su clase de respuesta y su retroalimentación.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "case_version_id": TECHNICAL,
            "option_key": PUBLIC,
            "source_node_id": TECHNICAL,
            "target_node_id": TECHNICAL,
            "text": PUBLIC,
            "immediate_feedback": PUBLIC,
            "prohibition_reason": PUBLIC,
            "consequence_text": PUBLIC,
            "theory_basis": PUBLIC,
            "feedback_text": PUBLIC,
            "effects": PUBLIC,
            "response_class": PUBLIC,
            "ai_suggested": PUBLIC,
        },
    },
    "authoring_assistant_usage": {
        "purpose": (
            "Cuántas veces usó cada docente el asistente de IA de autoría en un día: sirve para aplicar el tope diario "
            "y el mensual."
        ),
        "retention": (
            "Sin plazo definido (SD-9, pendiente de la institución). Se borra con la cuenta; no guarda el texto de las "
            "peticiones."
        ),
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "user_id": (PERSONAL, "docente que usó el asistente"),
            "day": (PERSONAL, "día en que el docente usó el asistente"),
            "count": (PERSONAL, "cuántas veces lo usó ese día el docente"),
        },
        "exits": {"user_id": [], "day": [], "count": ["api"]},
    },
    "rubrics": {
        "purpose": "Rúbricas de evaluación: nombre, versión y docente que las creó.",
        "retention": "Mientras exista la rúbrica (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "case_version_id": TECHNICAL,
            "name": PUBLIC,
            "description": PUBLIC,
            "active": TECHNICAL,
            "version": TECHNICAL,
            "is_default": TECHNICAL,
            "updated_at": TECHNICAL,
            "created_by": (PERSONAL, "docente que creó la rúbrica"),
            "created_at": TECHNICAL,
        },
        "exits": {"created_by": ["api"]},
    },
    "simulation_rubric_assignments": {
        "purpose": "Rúbrica asignada a una versión del caso y quién la asignó.",
        "retention": "Mientras la asignación esté activa o exista el caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "case_version_id": TECHNICAL,
            "rubric_id": TECHNICAL,
            "assigned_by": (PERSONAL, "docente que asignó la rúbrica al caso"),
            "active": TECHNICAL,
            "assigned_at": TECHNICAL,
        },
        "exits": {"assigned_by": []},
    },
    "publication_checklists": {
        "purpose": "Lista de verificación que un docente envía antes de publicar una versión del caso.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "case_version_id": TECHNICAL,
            "submitted_by": (PERSONAL, "docente que envió la lista de verificación"),
            "completion_ratio": TECHNICAL,
            "status": TECHNICAL,
            "submitted_at": TECHNICAL,
            "completed_at": TECHNICAL,
        },
        "exits": {"submitted_by": []},
    },
    "publication_checklist_items": {
        "purpose": "Cada punto de la lista de verificación, con la nota de evidencia que escribe el docente.",
        "retention": "Mientras exista la lista de verificación (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "checklist_id": TECHNICAL,
            "code": PUBLIC,
            "label": PUBLIC,
            "required": PUBLIC,
            "fulfilled": PUBLIC,
            "evidence_note": (PERSONAL, "texto libre del docente sobre la evidencia; puede nombrar personas"),
        },
        "exits": {"evidence_note": []},
    },
    # ── Contenido del caso sin datos de personas (mapa, diálogos, herramientas, competencias) ────
    "scene_maps": {
        "purpose": "Mapas o escenarios de cada caso: tamaño, tema y punto de inicio. No contiene datos de personas.",
        "retention": "Mientras exista la versión del caso que lo usa (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "scene_hints": {
        "purpose": "Pistas que el estudiante puede pedir en una escena del caso.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "scene_map_id": TECHNICAL,
            "hint_order": PUBLIC,
            "text": PUBLIC,
        },
    },
    "collision_zones": {
        "purpose": "Zonas del mapa que el personaje no puede cruzar. Contenido del caso.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "dialogue_trees": {
        "purpose": "Árboles de diálogo de los personajes del caso: quién habla y con qué emoción.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "dialogue_lines": {
        "purpose": "Líneas de cada diálogo del caso: quién habla y qué dice.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "dialogue_tree_id": TECHNICAL,
            "display_order": PUBLIC,
            "speaker_name": PUBLIC,
            "text": PUBLIC,
            "emotion": PUBLIC,
            "ai_suggested": PUBLIC,
        },
    },
    "dialogue_choices": {
        "purpose": "Opciones que el estudiante elige en un diálogo y sus efectos.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "dialogue_tree_id": TECHNICAL,
            "choice_key": PUBLIC,
            "text": PUBLIC,
            "decision_option_id": TECHNICAL,
            "required_tool_code": PUBLIC,
            "effect_json": PUBLIC,
            "display_order": PUBLIC,
        },
    },
    "map_objects": {
        "purpose": "Objetos interactivos del mapa (puertas, mobiliario, personajes). Contenido del caso.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "clinical_tools": {
        "purpose": "Herramientas que el estudiante puede usar en un caso: código, nombre y descripción.",
        "retention": "Mientras exista la versión del caso o el catálogo (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "simulation_nodes": {
        "purpose": "Escenas del caso con su narrativa y la pregunta de decisión. Contenido del caso.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "competencies": {
        "purpose": "Catálogo de competencias que evalúan las rúbricas.",
        "retention": "Mientras esté en el catálogo (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "rubric_criteria": {
        "purpose": "Criterios de cada rúbrica: competencia, peso y puntaje máximo. No contiene datos de personas.",
        "retention": "Mientras exista la rúbrica (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    "case_characters": {
        "purpose": "Personajes ficticios del caso: nombre y rol que ve el estudiante. No son personas reales.",
        "retention": "Mientras exista la versión del caso (SD-9, pendiente de la institución).",
        "default": PUBLIC,
    },
    # ── Intentos, bitácoras, evaluaciones y auditoría ─────────────────────────────────────────────
    "simulation_attempts_v2": {
        "purpose": "Intentos de un estudiante en un caso: estado y tiempos. Son sus decisiones.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": (SENSITIVE, "identificador del intento: enlaza con todo lo que hizo el estudiante"),
            "attempt_token_hash": (SECRET, "hash del token del intento; el token lo tiene el cliente y el hash no sale"),
            "case_version_id": (TECHNICAL, "versión del caso; no identifica a la persona"),
            "student_id": (PERSONAL, "estudiante dueño del intento; sale solo como alias (Estudiante-<hash>)"),
            "current_node_id": (SENSITIVE, "escena en la que está el estudiante"),
            "status": (SENSITIVE, "estado del intento en el caso (en curso, pausado, terminado)"),
            "started_at": (SENSITIVE, "cuándo empezó el intento (conducta del estudiante)"),
            "ended_at": (SENSITIVE, "cuándo terminó el intento (conducta del estudiante)"),
            "locked_at": TECHNICAL,
            "replaced_by_id": (SENSITIVE, "intento que sustituyó a este"),
            "replace_reason": (SENSITIVE, "motivo escrito para sustituir el intento"),
            "active_seconds": (SENSITIVE, "tiempo activo del estudiante en el intento"),
            "last_activity_at": (SENSITIVE, "última actividad del estudiante (sirve al cronómetro)"),
            "state_json": (SENSITIVE, "estado del intento derivado de las decisiones del estudiante"),
        },
        "exits": {
            "id": ["api"],
            "current_node_id": ["api"],
            "status": ["api", "reporte"],
            "started_at": ["api"],
            "ended_at": ["api"],
            "active_seconds": ["api"],
            "student_id": [],
            "attempt_token_hash": [],
            "replaced_by_id": [],
            "replace_reason": [],
            "last_activity_at": [],
            "state_json": ["api"],
        },
        "forbidden_exits": {"attempt_token_hash": ["api", "csv", "reporte", "correo", "registro"]},
    },
    "simulation_attemptevaluation": {
        "purpose": "Evaluación cerrada de un intento y su resultado calculado.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento del estudiante al que corresponde la evaluación"),
            "rules_version": TECHNICAL,
            "snapshot": (SENSITIVE, "resultado de la evaluación del intento"),
            "created_at": TECHNICAL,
        },
        "exits": {"attempt_id": [], "snapshot": ["api"]},
    },
    "attempt_events": {
        "purpose": "Línea de tiempo del intento: cada decisión, herramienta, bitácora o salida.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento al que pertenece el evento"),
            "event_type": (SENSITIVE, "qué hizo el estudiante: decisión, herramienta, bitácora o salida"),
            "node_id": TECHNICAL,
            "decision_option_id": (SENSITIVE, "opción de decisión que eligió el estudiante"),
            "detail": (
                SENSITIVE,
                "detalle de la acción que muestra la línea de tiempo (herramienta o etiqueta); en una salida segura puede llevar "
                "el motivo escrito por la persona (texto libre, recortado a 500 caracteres)",
            ),
            "occurred_at": (SENSITIVE, "cuándo actuó el estudiante (línea de tiempo)"),
            "request_id": TECHNICAL,
        },
        "exits": {
            "attempt_id": ["api"],
            "event_type": ["api"],
            "decision_option_id": ["api", "reporte"],
            "detail": ["api"],
            "occurred_at": ["api"],
        },
    },
    "attempt_hint_views": {
        "purpose": "Qué pistas pidió el estudiante en una escena y cuándo.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento que pidió la pista"),
            "hint_id": TECHNICAL,
            "viewed_at": (SENSITIVE, "cuándo pidió la pista el estudiante"),
        },
        "exits": {"attempt_id": [], "viewed_at": []},
    },
    "attempt_reports": {
        "purpose": "Informe congelado de un intento: decisiones, retroalimentación, tiempos y conteos.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento al que pertenece el informe"),
            "report_json": (
                SENSITIVE,
                "informe congelado del intento (v3): decisiones y su clase, hitos cumplidos y faltantes, estado de la persona usuaria, "
                "motivo del final, evidencia por nivel de competencia y tiempos; su línea de tiempo copia el motivo "
                "escrito de una salida segura (texto libre de la persona)",
            ),
            "report_schema_version": TECHNICAL,
            "definition_hash": TECHNICAL,
            "attempt_ordinal": (SENSITIVE, "número de intento del estudiante en ese caso"),
            "created_at": TECHNICAL,
        },
        "exits": {
            "attempt_id": ["api", "reporte"],
            "report_json": ["api", "reporte"],
            "attempt_ordinal": ["reporte"],
        },
    },
    "attempt_feedback": {
        "purpose": (
            "Encuesta breve opcional de un intento completado: una calificación de 1 a 5 y un comentario de texto plano. "
            "Apagada hasta que Psicología la apruebe (SIEP_ATTEMPT_FEEDBACK_SURVEY)."
        ),
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento que el estudiante encuestó"),
            "rating": (
                SENSITIVE,
                "calificación de 1 a 5 que el estudiante da a su experiencia; al docente solo llega agregada, con celda mínima",
            ),
            "comment": (
                SENSITIVE,
                "texto libre del estudiante (hasta 500 caracteres, texto plano); no sale a ningún reporte, auditoría ni agregado",
            ),
            "created_at": (SENSITIVE, "cuándo respondió el estudiante"),
        },
        "exits": {"attempt_id": [], "rating": ["api"], "comment": ["api"], "created_at": ["api"]},
        "forbidden_exits": {"comment": ["csv", "reporte", "correo", "registro"]},
    },
    "reflection_journals": {
        "purpose": "Bitácora de reflexión del estudiante sobre una escena, cifrada en reposo.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento al que pertenece la bitácora"),
            "node_id": TECHNICAL,
            "encrypted_text": (
                SENSITIVE,
                "texto libre de la bitácora del estudiante, cifrado; el docente lo ve descifrado en la traza",
            ),
            "encryption_key_ref": TECHNICAL,
            "locked": TECHNICAL,
            "created_at": TECHNICAL,
            "updated_at": TECHNICAL,
        },
        "exits": {"attempt_id": ["api"], "encrypted_text": ["api", "reporte"]},
        "forbidden_exits": {"encrypted_text": ["registro", "csv", "correo"]},
    },
    "attempt_world_states": {
        "purpose": "Estado del mundo del intento: posición del estudiante, inventario, objetos y diálogos vistos.",
        "retention": "Mientras exista el intento (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "attempt_id": (SENSITIVE, "intento al que pertenece el estado del mundo"),
            "scene_map_id": (SENSITIVE, "escena en la que está el estudiante"),
            "player_x": (SENSITIVE, "posición del estudiante en la escena (x)"),
            "player_y": (SENSITIVE, "posición del estudiante en la escena (y)"),
            "inventory_json": (SENSITIVE, "objetos que el estudiante recogió"),
            "inspected_object_keys_json": (SENSITIVE, "objetos que el estudiante revisó"),
            "viewed_dialogue_keys_json": (SENSITIVE, "diálogos que el estudiante vio"),
            "used_tool_keys_json": (SENSITIVE, "herramientas que el estudiante usó"),
            "flags_json": (
                SENSITIVE,
                "banderas del caso que el estudiante ha activado, los hitos que ha cumplido y el estado de la persona usuaria "
                "en la ficción (vínculo y activación) según sus decisiones",
            ),
            "updated_at": TECHNICAL,
        },
        "exits": {
            "attempt_id": ["api"],
            "scene_map_id": ["api"],
            "player_x": ["api"],
            "player_y": ["api"],
            "inventory_json": ["api"],
            "inspected_object_keys_json": ["api"],
            "viewed_dialogue_keys_json": ["api"],
            "used_tool_keys_json": ["api"],
            "flags_json": ["api", "reporte"],
        },
    },
    "student_case_completion": {
        "purpose": "Qué casos completó un estudiante por primera vez, para desbloquear el siguiente.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "student_id": (PERSONAL, "estudiante que completó el caso"),
            "simulation_case_id": TECHNICAL,
            "first_completed_at": (SENSITIVE, "cuándo completó el caso por primera vez el estudiante"),
            "created_at": TECHNICAL,
        },
        "exits": {"student_id": [], "first_completed_at": []},
    },
    "rubric_evaluations": {
        "purpose": "Evaluación de un intento por un docente: puntaje total y comentario sobre el estudiante.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "attempt_id": (SENSITIVE, "intento evaluado: enlaza la evaluación con lo que hizo el estudiante"),
            "rubric_id": TECHNICAL,
            "instructor_id": (PERSONAL, "docente que evaluó"),
            "total_score": (SENSITIVE, "puntaje total de la evaluación docente sobre el estudiante; interno: el DTO sirve solo el nivel"),
            "comment": (SENSITIVE, "comentario del docente sobre el desempeño del estudiante"),
            "status": TECHNICAL,
            "snapshot_json": PUBLIC,
            "origin": TECHNICAL,
            "created_at": TECHNICAL,
            "updated_at": TECHNICAL,
            "evaluated_at": TECHNICAL,
        },
        "exits": {
            "attempt_id": ["api"],
            "instructor_id": [],
            "total_score": [],
            "comment": ["api"],
        },
    },
    "criterion_scores": {
        "purpose": "Puntaje, nivel y comentario de cada criterio de una evaluación docente.",
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "rubric_evaluation_id": TECHNICAL,
            "rubric_criterion_id": TECHNICAL,
            "score": (SENSITIVE, "puntaje de un criterio sobre el desempeño del estudiante; interno: el DTO sirve solo el nivel"),
            "level": (SENSITIVE, "nivel alcanzado en un criterio"),
            "comment": (SENSITIVE, "comentario del docente sobre el criterio"),
            "evidence_json": (SENSITIVE, "evidencia de la evaluación; el servicio la escribe vacía y no sale"),
        },
        "exits": {
            "score": [],
            "level": ["api"],
            "comment": ["api"],
            "evidence_json": [],
        },
    },
    "audit_logs": {
        "purpose": "Auditoría de acciones: quién hizo qué, sobre qué recurso, desde qué IP y navegador.",
        "retention": (
            "Al menos 360 días (RNF-007); `retention_days()` nunca baja de ese mínimo. "
            "Lo que pase después lo decide la institución (SD-9, pendiente de la institución)."
        ),
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "actor_id": (PERSONAL, "cuenta que hizo la acción (vacía en los eventos del sistema)"),
            "actor_role": (PERSONAL, "rol de quien hizo la acción"),
            "action": TECHNICAL,
            "resource_type": TECHNICAL,
            "resource_id": (SENSITIVE, "recurso afectado; a veces es un intento del estudiante"),
            "context_json": (
                SENSITIVE,
                "contexto de la acción; las filas antiguas pueden traer texto libre (question), que la lectura oculta",
            ),
            "ip_address": (PERSONAL, "dirección IP de quien hizo la acción"),
            "user_agent": (PERSONAL, "navegador de quien hizo la acción"),
            "occurred_at": TECHNICAL,
            "retention_until": TECHNICAL,
        },
        "exits": {
            "actor_id": ["api"],
            "actor_role": ["api"],
            "resource_id": ["api"],
            "context_json": ["api"],
            "ip_address": ["api"],
            "user_agent": ["api"],
        },
    },
    # ── Consentimiento (S3-2) ─────────────────────────────────────────────────────────────────────
    "consent_records": {
        "purpose": (
            "Evidencia de que el aviso de contenido sensible se mostró y se aceptó (ETH-01): quién lo aceptó, para qué "
            "versión del caso y del aviso, cuándo y si lo retiró. También guarda, sin caso, la autorización de tratamiento "
            "de datos cuando la institución la entregue."
        ),
        "retention": "Sin plazo definido (SD-9, pendiente de la institución).",
        "default": None,
        "columns": {
            "id": TECHNICAL,
            "person_id": (PERSONAL, "persona que vio y aceptó el aviso: enlaza con su cuenta"),
            "consent_type": TECHNICAL,
            "case_version_id": TECHNICAL,
            "notice_version": TECHNICAL,
            "accepted_at": (PERSONAL, "cuándo aceptó el aviso esa persona (la evidencia de ETH-01)"),
            "withdrawn_at": TECHNICAL,
        },
        "exits": {
            "person_id": [],
            "accepted_at": ["api"],
            "case_version_id": ["api"],
            "notice_version": ["api"],
            "withdrawn_at": ["api"],
        },
    },
}

#: Lo que el documento dice al principio: qué es, cómo se regenera y para qué lo usa el plan (S3-4).
# BORRADOR: texto nuevo del documento, pendiente de la aprobación de Psicología (VD-23).
NOTA = (
    "Qué es: el inventario columna por columna de lo que guarda SIEP, con su clasificación, finalidad, plazo "
    "y por dónde sale cada dato (BORRADOR, pendiente de la aprobación de Psicología).",
    "Se regenera con `python -m apps.privacy.inventory --write` desde `backend_django/`; no se edita a mano.",
    "El plan de seguridad (S3-4) lo usa para exportar y suprimir los datos de una persona; lo que depende de la "
    "institución lleva «(SD-9, pendiente de la institución)».",
)


def _modelos_gestionados():
    """Los modelos gestionados, con sus tablas intermedias auto-creadas (p. ej. la de grupos y permisos de Django)."""
    return [modelo for modelo in apps.get_models(include_auto_created=True) if modelo._meta.managed]


def columnas_reales():
    """(tabla, columna) de cada columna concreta de cada modelo gestionado, en el orden de los modelos."""
    return [
        (modelo._meta.db_table, campo.column)
        for modelo in _modelos_gestionados()
        for campo in modelo._meta.concrete_fields
    ]


def classify(table, column):
    """La clasificación de ``table.column``: la de la columna o, si la tabla tiene ``default``, la de la tabla."""
    entrada = DATA_INVENTORY.get(table)
    if entrada is None:
        raise KeyError(
            f"La tabla {table} no está en el inventario: clasifícala en DATA_INVENTORY (apps/privacy/inventory.py)."
        )
    valor = entrada.get("columns", {}).get(column)
    if valor is None:
        if entrada.get("default") is None:
            raise KeyError(
                f"La columna {table}.{column} no está clasificada: añádela a DATA_INVENTORY "
                "(apps/privacy/inventory.py)."
            )
        return entrada["default"]
    return valor[0] if isinstance(valor, tuple) else valor


def motivo(table, column):
    """El motivo que justifica la columna, o cadena vacía si no lo tiene."""
    valor = DATA_INVENTORY.get(table, {}).get("columns", {}).get(column)
    return valor[1] if isinstance(valor, tuple) else ""


def salidas(table, column):
    """Los canales por los que sale ``table.column``: los de su entrada o, si no tiene, los de ``"*"``."""
    exits = DATA_INVENTORY.get(table, {}).get("exits", {})
    return list(exits[column] if column in exits else exits.get("*", []))


def uncovered():
    """(tabla, columna) de los modelos que el inventario no cubre: tabla ausente o columna sin clasificar."""
    faltan = []
    for tabla, columna in columnas_reales():
        entrada = DATA_INVENTORY.get(tabla)
        if entrada is None:
            faltan.append((tabla, columna))
        elif entrada.get("default") is None and columna not in entrada.get("columns", {}):
            faltan.append((tabla, columna))
    return faltan


def stale():
    """(tabla, columna) de las entradas del inventario sin columna real; ``(tabla, "(tabla)")`` si no hay tabla."""
    reales = {}
    for tabla, columna in columnas_reales():
        reales.setdefault(tabla, set()).add(columna)
    obsoletas = []
    for tabla, entrada in DATA_INVENTORY.items():
        if tabla not in reales:
            obsoletas.append((tabla, "(tabla)"))
            continue
        nombres = [*entrada.get("columns", {}), *entrada.get("exits", {}), *entrada.get("forbidden_exits", {})]
        for columna in dict.fromkeys(nombres):
            if columna != "*" and columna not in reales[tabla]:
                obsoletas.append((tabla, columna))
    return obsoletas


def _clase_o_sin_clasificar(tabla, columna):
    try:
        return classify(tabla, columna)
    except KeyError:
        return "SIN CLASIFICAR"


def _texto_de_salidas(tabla, columna, clase):
    lista = salidas(tabla, columna)
    if lista:
        return ", ".join(lista)
    return "ninguna (uso interno)" if clase in CON_SALIDAS else "—"


def render_markdown():
    """El documento versionado: el resumen por clasificación y una sección por tabla, con cada columna."""
    por_tabla = {}
    for tabla, columna in columnas_reales():
        por_tabla.setdefault(tabla, []).append(columna)
    metas = {modelo._meta.db_table: modelo._meta for modelo in _modelos_gestionados()}
    conteo = dict.fromkeys(Classification, 0)
    total = 0
    for tabla, columnas in por_tabla.items():
        for columna in columnas:
            total += 1
            clase = _clase_o_sin_clasificar(tabla, columna)
            if clase in conteo:
                conteo[clase] += 1

    lineas = ["# Inventario de datos de SIEP", ""]
    lineas += [f"> {linea}" for linea in NOTA]
    lineas += ["", "## Resumen", "", f"Tablas: {len(por_tabla)}. Columnas: {total}.", ""]
    lineas += ["| Clasificación | Columnas |", "|---|---:|"]
    lineas += [f"| {clase.value} | {conteo[clase]} |" for clase in Classification]
    lineas += ["", "## Tablas"]
    for tabla in sorted(por_tabla):
        meta = metas[tabla]
        entrada = DATA_INVENTORY.get(tabla, {})
        titulo = f"### `{tabla}` — {meta.label}"
        if meta.auto_created:
            titulo += " (tabla intermedia de Django)"
        lineas += ["", titulo, ""]
        lineas += [f"**Finalidad:** {entrada.get('purpose', 'SIN CLASIFICAR')}", ""]
        lineas += [f"**Plazo:** {entrada.get('retention', 'SIN CLASIFICAR')}", ""]
        if entrada.get("default") is not None:
            lineas += [
                f"Todas las columnas heredan `{entrada['default'].value}`: la tabla no tiene datos personales "
                "ni sensibles.",
                "",
            ]
        lineas += ["| Columna | Clasificación | Salidas | Motivo |", "|---|---|---|---|"]
        for columna in por_tabla[tabla]:
            clase = _clase_o_sin_clasificar(tabla, columna)
            clase_texto = clase.value if isinstance(clase, Classification) else clase
            lineas.append(
                f"| `{columna}` | {clase_texto} | {_texto_de_salidas(tabla, columna, clase)} | "
                f"{motivo(tabla, columna)} |"
            )
        for columna, canales in entrada.get("forbidden_exits", {}).items():
            lineas += ["", f"Nunca sale por: `{columna}`: {', '.join(canales)}."]
        lineas.append("")
    return "\n".join(lineas) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Inventario de datos de SIEP (S3-1).")
    parser.add_argument(
        "--write", action="store_true", help="escribe docs/seguridad/inventario-de-datos.md en vez de imprimirlo"
    )
    args = parser.parse_args(argv)
    faltan, obsoletas = uncovered(), stale()
    if faltan or obsoletas:
        for tabla, columna in faltan:
            print(f"Sin clasificar: {tabla}.{columna}", file=sys.stderr)
        for tabla, columna in obsoletas:
            print(f"Obsoleta: {tabla}.{columna}", file=sys.stderr)
        return 1
    documento = render_markdown()
    if not args.write:
        sys.stdout.write(documento)
        return 0
    DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_PATH.write_bytes(documento.encode("utf-8"))
    print(f"Escrito {DOC_PATH}")
    return 0


if __name__ == "__main__":
    # ``python -m apps.privacy.inventory``: el registro de apps debe estar listo antes de leer los modelos.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings.base")
    import django

    django.setup()
    raise SystemExit(main(sys.argv[1:]))
