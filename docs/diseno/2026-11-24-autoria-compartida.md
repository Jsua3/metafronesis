# Autoría y edición compartida de casos

Fecha: 2026-11-24 · Rama: `feature/autoria-compartida` · Estado: decisión de producto aprobada; textos nuevos pendientes de Psicología (VD-23).

## Regla

- El **autor** de un caso es quien lo creó (`SimulationCase.created_by`) y no cambia nunca.
- Cuando otro docente edita un caso, crea una **versión nueva del mismo caso**: clona una versión publicada en un borrador cuyo creador es él (`CaseVersion.created_by`, `cloned_from` = la original). Cuando el ADMIN la publica, es la versión nueva del caso en la biblioteca y el caso conserva su autor.
- **«Editado por»**: las personas distintas del autor que crearon alguna versión del caso, en el orden de su primera versión. No hay campo nuevo: sale de `CaseVersion.created_by`.

## Permisos del PROFESOR

| Qué | Regla |
|---|---|
| Ver en «Casos» | Las versiones de sus casos (menos los borradores que creó otra persona), las versiones que creó en casos ajenos y las versiones publicadas de los casos ajenos. |
| Editar un borrador | Solo los borradores que creó él: un borrador es privado de su creador, también frente al autor del caso. |
| Crear una versión nueva (clonar) | De sus casos publicados o archivados, y de cualquier versión publicada de un caso ajeno (con permiso de autoría). |
| Enviar a revisión | Quien creó la versión. |
| Archivar | El autor del caso (y el ADMIN). |
| Publicar | Solo el ADMIN. |

El ADMIN sigue viendo y pudiendo todo. La matriz de políticas (`shared/policy-matrix.json`) no cambia: `case.author`, `case.submit` y `case.archive` siguen siendo `own` para el PROFESOR; lo que cambia es **quién es el dueño** en cada acción (el creador de la versión para editar y enviar; el autor del caso para archivar), decidido en `apps/autoria/autoria.py`.

## Dónde está

- `apps/autoria/autoria.py`: autor, creador, visibilidad (`filtro_visibles`, `puede_ver`), `puede_editar`, `puede_enviar`, `puede_archivar`, `puede_crear_version`, `editores_por_caso`.
- `apps/autoria/guardas.py`: la lista y el editor usan la visibilidad; `version_editable` exige además ser el creador.
- `apps/publicacion/ciclo.py`, `clonado.py` y `vista_ciclo.py`: enviar, archivar y clonar con el dueño que toca; la revisión devuelta la pidió el creador de la versión; la versión semántica del clon sale de la mayor del caso.
- `apps/sesiones/servicios.py`: la biblioteca de sesiones trae `editadoPor`.
- Interfaz: la lista «Casos» muestra «Autor» y «Editado por» y, en una publicada ajena, «Crear nueva versión» (clona y abre el borrador); el editor muestra la misma línea; el diálogo de sesión añade «· editado por …» a la opción del caso.

## Lo que no cambia

- Publicar una versión no archiva las anteriores publicadas del mismo caso: la biblioteca de sesiones y las asignaciones siguen mostrando cada versión publicada con su número (las sesiones y asignaciones vigentes no se rompen).
