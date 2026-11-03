Borrador generado a partir del código; verificar antes de publicar

# grupos

**Responsable/corte:** Juan, S2; algunos archivos de asignaciones son S3 (el manifiesto del corte, :35).

## Propósito y modelos

Gestiona grupos de estudiantes, invitaciones/membresías e inscripción/asignación de versiones de caso (apps/grupos/models.py:1).

| Modelo | Campos propios | Relaciones |
|---|---|---|
| Grupo (apps/grupos/models.py:12) | nombre, codigo, activo, created_at | profesor→AUTH_USER_MODEL |
| GrupoEstudiante (apps/grupos/models.py:40) | PK compuesta, status, invited_at, responded_at | grupo→Grupo; estudiante→AUTH_USER_MODEL; invited_by→AUTH_USER_MODEL nullable |
| CaseAssignment (apps/grupos/models.py:73) | opens_at, closes_at, sort_order, assigned_at, active | case_version→simulation.CaseVersion; grupo→Grupo nullable o estudiante→AUTH_USER_MODEL nullable; assigned_by→AUTH_USER_MODEL nullable |

Constraints limitan estado, destino y ventana temporal, con unicidad parcial por grupo/caso o estudiante/caso (apps/grupos/models.py:40, :73).

## Servicios y funciones públicas

services.py expone listado, alta/actualización/baja de grupos, membresías, importación de estudiantes y asignación/listado de casos (apps/grupos/services.py:96, :678, :719, :812). access.py resuelve decisiones de acceso (apps/grupos/access.py:74, :90); assignment_service.py encapsula asignaciones (apps/grupos/assignment_service.py:1); memberships.py, assignments.py y notifications.py dividen dominios (apps/grupos/memberships.py:1, apps/grupos/assignments.py:1, apps/grupos/notifications.py:1).

## Endpoints, hooks y configuración

psychosim/urls.py:73–:93 registra directamente rutas de grupos, invitaciones y asignaciones. apps/grupos/urls.py:17–:28 también define rutas, pero no es el include usado por la raíz revisada. Métodos, policies y serializadores están en api.md. Operaciones básicas/invitaciones: S2; asignaciones vinculadas a CaseVersion: diferidas a S3 según settings-urls-por-sprint.md.

grupos no incluye apps.py en la copia seleccionada. AppConfig/carga de señales en el nuevo repo: sin verificar. psychosim/settings/base.py:35 registra apps.grupos. No se observaron señales Django propias.

## Pruebas

11 módulos cubren grupos e importación (el manifiesto del corte) y membresía/asignaciones (el manifiesto del corte). Resultado de ejecución: sin verificar.

## Diseño y riesgos

Separación observable entre contratos, services, acceso, membresía y asignaciones (apps/grupos/contracts.py:1, apps/grupos/access.py:74, :90, apps/grupos/assignment_service.py:1); esto no demuestra SOLID integral. El ciclo grupos↔simulation y la dependencia de serializers de users se analizan en romper-ciclo.md. No activar CaseVersion antes de incluir modelo/migración compatible; no aplicar migraciones heredadas como bloque.
