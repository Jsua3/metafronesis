# Sesiones del docente con patrón State — diseño

Fecha: 2026-11-24 · Rama: `feature/sesiones-docente` · Estado: aprobado por partes; pendiente de la revisión de este documento.

## 1. Objetivo

El docente programa **sesiones de clase**: una sesión entrega un **grupo de estudiantes ya creado** y un **caso de la biblioteca** (cualquier caso publicado y activo) en un horario. La sesión tiene un ciclo de vida con estados y su comportamiento se implementa con el **patrón de diseño State**. Es un módulo nuevo del menú del rol docente.

Se extiende la app existente `apps/sesiones` (SIEP-35, SIEP-37, SIEP-42): se conservan las convocatorias, las repeticiones autorizadas, el cierre automático y su uso en reportes.

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Base | Extender `apps/sesiones`, no crear otra app. |
| Estados | 5: `PROGRAMADA`, `EN_CURSO`, `PAUSADA`, `FINALIZADA`, `CANCELADA`. |
| Espacio académico | Las sesiones no tienen espacio académico (decisión del producto): ni campo, ni validación, ni línea en la convocatoria. |
| Grupo | Foto del grupo al crear: se convoca a los miembros `ACTIVE`; luego «Sincronizar con el grupo» suma a los nuevos. |
| Ingreso del estudiante | Con su cuenta normal; el caso aparece en «Casos» solo mientras la sesión está en curso. No se emiten códigos. |
| Casos | Todos los publicados, activos y validados, de cualquier autor. |
| Transiciones | Las hace el docente; si olvida finalizar, el cierre automático lo hace al pasar la hora de fin. |

### Fuera de alcance

- Retirar el ingreso con código (`code-login` en `apps/users`, `apps/sesiones/codigos.py`). Queda como cambio aparte: tras este diseño nadie recibe códigos, así que la ruta queda sin uso.
- Notificar pausas y reanudaciones (ocurren en clase).
- Sesiones con varios casos o varios grupos.

## 2. Patrón State

### Estructura

- `apps/sesiones/estados.py`: clase base `Estado` (no `EstadoSesion`, que es el nombre de los valores en el modelo) y una subclase por estado (`Programada`, `EnCurso`, `Pausada`, `Finalizada`, `Cancelada`). Registro `ESTADOS: dict[str, EstadoSesion]`.
- **Contexto**: el modelo `Sesion`. Expone `estado_actual()` (devuelve el objeto de estado según `sesion.estado`). Los servicios nunca comparan `sesion.estado == "..."` para decidir comportamiento: delegan en el objeto de estado.
- Cada operación de la base lanza `ApiError("INVALID_TRANSITION", "La transición no está permitida.", 409)`; cada subclase sobrescribe solo lo que permite.

### Interfaz de `Estado`

| Método | Qué hace |
|---|---|
| `valor` | El valor de `EstadoSesion` en la base (atributo de clase). |
| `iniciar(sesion)`, `pausar(sesion)`, `reanudar(sesion)`, `finalizar(sesion)`, `cancelar(sesion)` | Transiciones: devuelven el **objeto de estado destino**; la base lanza `INVALID_TRANSITION`. |
| `cerrar_automatico(sesion)` | Destino del cierre automático (ver tabla). |
| `al_entrar(sesion)` | Efectos al entrar en el estado (habilitar el caso, pausar intentos, cerrar intentos). Por defecto no hace nada. |
| `puede_editar()` | Si se pueden cambiar datos, grupo y caso. |
| `puede_gestionar_convocados()` | Si se puede sincronizar, retirar convocados y autorizar repeticiones. |
| `verificar_ingreso()` | No devuelve nada si el estudiante puede entrar; si no, lanza el `ApiError` propio del estado. |
| `al_sumar_convocados(sesion, ids)` | Lo que reciben los convocados que se suman en este estado (en curso o pausada: se les habilita el caso). |
| `acciones()` | Lista de acciones permitidas para el frontend, p. ej. `["pausar", "finalizar", "gestionarConvocados"]`. Se calcula a partir de qué transiciones sobrescribe la subclase y de `puede_editar` / `puede_gestionar_convocados`. |

Un único punto de aplicación, `servicios.transicionar(usuario, pk, accion)`:

1. Bloquea la fila (`select_for_update`) y obtiene la sesión propia.
2. `destino = getattr(sesion.estado_actual(), accion)(sesion)`.
3. Actualiza `sesion.estado = destino.valor` y la marca de tiempo correspondiente.
4. `destino.al_entrar(sesion)`.
5. Guarda. Todo en `transaction.atomic`: si un efecto falla, la sesión no cambia.

### Tabla de comportamiento

| | Programada | En curso | Pausada | Finalizada | Cancelada |
|---|---|---|---|---|---|
| Transiciones | iniciar → En curso; cancelar → Cancelada | pausar → Pausada; finalizar → Finalizada | reanudar → En curso; finalizar → Finalizada | — | — |
| `cerrar_automatico` | → Cancelada | → Finalizada | → Finalizada | sin cambio | sin cambio |
| `puede_editar` | sí | no | no | no | no |
| `puede_gestionar_convocados` | sí | sí | sí | no | no |
| `verificar_ingreso` | `SESSION_NOT_STARTED` «La sesión aún no comienza.» | permite (con reglas de §4.2) | `SESSION_PAUSED` «Tu docente pausó la sesión. Espera a que la reanude.» | `SESSION_FINISHED` «La sesión terminó.» | `SESSION_CANCELLED` «La sesión fue cancelada.» |
| `al_entrar` | — | habilita el caso a los convocados (§4.1) | pausa los intentos abiertos (§4.3) | cierra intentos y deshabilita el caso (§4.4) | deshabilita el caso (§4.4) |

Todos los errores de ingreso son HTTP 409. Los textos son borrador pendiente de aprobación de Psicología (VD-23).

## 3. Datos y API

### Modelo (`apps/sesiones/models.py`)

`EstadoSesion` (TextChoices): `PROGRAMADA`, `EN_CURSO`, `PAUSADA`, `FINALIZADA`, `CANCELADA`.

`Sesion`, cambios:

- `grupo = ForeignKey("grupos.Grupo", on_delete=PROTECT, null=True, related_name="sesiones")`. Obligatorio en la API para sesiones nuevas; `null` solo por las filas anteriores.
- `estado` con `default=PROGRAMADA` y `CheckConstraint` sobre los cinco valores.
- `iniciada_en`, `finalizada_en`, `cancelada_en`: `DateTimeField(null=True, blank=True)`. `iniciada_en` se fija la primera vez que se inicia (reanudar no la cambia).
- Método `estado_actual()`.

`Convocatoria.codigo_hash`: `blank=True, default=""` (las convocatorias nuevas no tienen código).

Migraciones: `0003` con los campos y la restricción, y una operación de datos que cambia `SIN_INICIAR` por `PROGRAMADA` (con reversa).

`0004_quitar_espacio_academico` elimina la columna `espacio_academico`.

### Rutas

Permiso de todas: `policy_permission("assignment", "manage")` (PROFESOR sobre lo propio). Todas se registran en `apps/sesiones/superficie.py` (auditoría por ruta), en los límites del proyecto si aplica, en `docs/api.md` y en el inventario `shared/surface-inventory.json` (regenerado).

| Método y ruta | Cuerpo / respuesta | Auditoría |
|---|---|---|
| `GET /api/sesiones?estado=` | Lista propia: `id, estado, acciones, grupo {id, nombre}, caso {caseVersionId, titulo}, inicio, fin, tiempoMaximoMin, lugar, mensaje, totalConvocados, iniciadaEn, finalizadaEn, canceladaEn`. `estado` admite varios valores separados por coma. | EXENTO (lectura propia) |
| `POST /api/sesiones` | `{grupoId, caseVersionId, inicio, fin, tiempoMaximoMin, lugar?, mensaje?}` → la sesión con su detalle. | `SESION_CREADA` |
| `GET /api/sesiones/<id>` | Lo de la lista + `convocados: [{estudianteId, nombre, email, estadoConvocatoria, intento: SIN_EMPEZAR|JUGANDO|EN_PAUSA|TERMINADO|INCOMPLETO, puedeRepetir}]`. | EXENTO (lectura propia) |
| `PATCH /api/sesiones/<id>` | Los mismos campos de crear, todos opcionales. Solo si `puede_editar()`. Si cambia `grupoId`, se rehace la lista de convocados con los miembros activos del grupo nuevo. | `SESION_EDITADA` |
| `POST /api/sesiones/<id>/iniciar` · `pausar` · `reanudar` · `finalizar` · `cancelar` | Sin cuerpo → la sesión. 409 `INVALID_TRANSITION` si el estado no lo permite. | `SESION_INICIADA`, `SESION_PAUSADA`, `SESION_REANUDADA`, `SESION_FINALIZADA`, `SESION_CANCELADA` |
| `POST /api/sesiones/<id>/sincronizar` | → `{agregados: n}`. Solo si `puede_gestionar_convocados()`. | `CONVOCADOS_SINCRONIZADOS` |
| `DELETE /api/sesiones/<id>/convocados/<estudianteId>` | Existente. Ahora exige `puede_gestionar_convocados()`. | `CONVOCADO_RETIRADO` |
| `POST /api/sesiones/<id>/convocados/<estudianteId>/repeticion` | Existente. Ahora exige que la sesión sea del docente (no ser autor del caso) y `puede_gestionar_convocados()`. | `REPETICION_AUTORIZADA` |
| `GET /api/sesiones/casos` | Biblioteca: versiones `PUBLISHED`, caso activo, `validated_at` y `definition_hash` no nulos, de cualquier autor: `caseVersionId, titulo, version, autor, tiempoEstimadoMin, descripcion` (el servidor no tiene portada por caso). Sin contenido del caso. | EXENTO (catálogo) |

Se **elimina** `POST /api/sesiones/<id>/convocados` (convocar por correos), reemplazada por `sincronizar`. Si un estado no admite editar o gestionar convocados, la respuesta es 409 `INVALID_TRANSITION`.

### Validaciones de crear y editar

- `grupoId`: grupo del docente (`grupo.profesor == usuario`) y activo; si no, 404.
- `caseVersionId`: debe estar en la biblioteca de `GET /api/sesiones/casos`; si no existe, 404; si no está publicado o activo, 400 `CASE_NOT_PUBLISHED`.
- `fin > inicio` (campo `fin`).
- `tiempoMaximoMin ≥ 1` y `≤ tiempo estimado del caso`; si el caso no tiene tiempo estimado, 400 `INVALID_TIME_LIMIT` (regla existente).
- Al crear: si el grupo no tiene miembros `ACTIVE`, 400 `GROUP_EMPTY`.

### Convocatorias

- Al crear: una `Convocatoria ACTIVA` por cada miembro `ACTIVE` del grupo (invitados, rechazados y retirados quedan fuera).
- `sincronizar`: agrega a los miembros `ACTIVE` que no tienen convocatoria; **no** reactiva a quien el docente retiró.
- Si la sesión ya está en curso, el convocado nuevo recibe de inmediato su asignación (§4.1).

### Notificaciones (`apps/notificaciones/receptores.py`)

- Convocado: «Convocatoria a una sesión» con caso, fecha y hora, lugar, mensaje del docente y enlace a `SIEP_PUBLIC_URL`. **Sin código.**
- Retirado: se mantiene el aviso actual.
- Sesión cancelada: «Sesión cancelada» a los convocados activos (nuevo evento `sesion_cancelada` en `shared/eventos.py`).
- Las señales `convocatoria_emitida` y `convocados_cambiaron` dejan de llevar `codigos`.

## 4. Integración con el simulador

Ganchos existentes: `apps/simulation/services/reglas_de_inicio` (se consulta en `attempt_api.start`; **se agrega** su consulta en la transición `resume` de `attempt_api._transition`, porque el estudiante también reanuda por esa ruta) y `apps/simulation/services/limites` (tiempo máximo). `SesionesConfig.ready()` ya los registra.

### 4.1 Habilitar el caso — `EnCurso.al_entrar`

Para cada convocado activo: `CaseAssignment` individual (`estudiante`, `case_version`) creada o actualizada con `opens_at = iniciada_en` (la hora real), `closes_at = sesion.fin`, `active = True`, `assigned_by = docente`. Con eso `available_versions` le muestra el caso en «Casos».

Al reanudar no se cambia la ventana. Si la hora de fin ya pasó, iniciar falla con 409 `SESSION_EXPIRED` («edita la sesión antes de iniciarla»). Antes de habilitar, si algún convocado ya tiene una asignación individual de esa versión que pertenece a **otra sesión en curso o pausada**, la transición falla con 409 `CONVOCADO_EN_OTRA_SESION` y la lista de nombres (`estudiantes`). Una asignación individual inactiva o de una sesión terminada se reutiliza.

### 4.2 Ingreso — `reglas.verificar(estudiante, version)`

1. Busca las convocatorias `ACTIVA` del estudiante para esa versión **en sesiones no terminadas**: primero una en curso o pausada; si no hay, la próxima programada. Si no hay, no aplica ninguna regla de sesión (las sesiones finalizadas o canceladas ya no atan al estudiante y puede usar la asignación de su grupo).
2. Toma la más próxima y llama `sesion.estado_actual().verificar_ingreso()`.
3. En curso, si el estudiante ya tiene un intento abierto de la sesión, entra sin más (vuelve a su intento aunque sea tarde). Si no, se mantienen las reglas existentes:
   - ingreso tardío: rechazado con `LATE_ENTRY` si `ahora > iniciada_en + (fin − iniciada_en) × SIEP_INGRESO_TARDIO_FRACCION`;
   - una sola participación (intentos iniciados desde `iniciada_en`), salvo `AutorizacionRepeticion` sin usar, que se consume.

`reglas.limite(intento)`: devuelve `tiempo_maximo_min` de la sesión vigente del intento (iniciado entre `iniciada_en` y `fin`). El tiempo se mide en tiempo activo, así que la pausa no cuenta.

### 4.3 Pausar — `Pausada.al_entrar`

Para cada intento abierto en juego (`IN_PROGRESS`) de los convocados, de esa versión, iniciado desde `iniciada_en`: tomar su cerrojo (`lock_attempt_row`), `attempt_duration.touch(intento, ahora)`, `attempt_lifecycle.apply(intento, PAUSE)`, guardar y registrar `AttemptEvent` `PAUSE` con detalle «Sesión pausada por el docente» (el mismo tipo que la pausa normal, para que los cálculos de duración no cambien). Desde ahí el juego rechaza acciones porque el intento no está en juego.

**Reanudar no reanuda intentos**: solo vuelve a permitir el ingreso; cada estudiante pulsa «Continuar» y `attempt_api.start` le devuelve su intento abierto.

### 4.4 Finalizar y cancelar — `Finalizada.al_entrar`, `Cancelada.al_entrar`

- Finalizar: los intentos abiertos de los convocados iniciados desde `iniciada_en` se cierran con `cerrar_como_incompleto(intento, "CIERRE_DE_SESION")` (función existente).
- Ambos: las asignaciones individuales de la sesión pasan a `active = False`.
- Cancelar desde Programada no tiene intentos que cerrar.

### 4.5 Cierre automático

`cerrar_sesiones_vencidas` (comando existente) recorre las sesiones no terminadas con `fin` vencido y aplica `estado_actual().cerrar_automatico(sesion)` con los mismos pasos 3 a 5 de `transicionar`, sin usuario (auditoría `SESION_CIERRE_AUTOMATICO`). Se mantiene el margen actual de un día tras `fin` para el cierre automático; el ingreso ya se bloquea en `fin` porque la ventana de la asignación termina ahí.

## 5. Frontend (Angular)

### Menú y rutas

- `shared/layout/nav-items.ts`: `{ id: 'sesiones', label: 'Sesiones', route: '/portal/sesiones', icon: 'event', roles: ['PROFESOR'], fold: [], order: 35 }` (entre Casos y Grupos). Se actualiza la prueba que compara el menú con `shared/policy-matrix.json` (recurso `assignment`, acción `manage`).
- `app.routes.ts`: `sesiones` y `sesiones/:sesionId`, mismo componente (como Grupos), `roleGuard(...rolesFor('sesiones'))`.

### Archivos nuevos

- `core/api/sesiones.api.ts` y `core/models/sesion.model.ts`: tipos y llamadas a todas las rutas de §3.
- `features/sesiones/sesion-list.component.*`: lista, filtro y detalle.
- `features/sesiones/sesion-dialog.component.*`: crear y editar.
- `features/sesiones/sesion-acciones.ts`: rótulo, ícono, tono y si pide confirmación de cada acción del servidor.

### Lista

Filtro segmentado: Próximas (`PROGRAMADA`), En curso (`EN_CURSO,PAUSADA`), Terminadas (`FINALIZADA,CANCELADA`), Todas. Filas con título del caso, grupo, fecha y hora, distintivo de estado y número de convocados. Botón «Nueva sesión». Estado vacío ilustrado que invita a crear la primera. Se usan los componentes de `shared/ui` (tabla, segmentado, badge, vacío ilustrado, page-header).

### Diálogo crear y editar

Grupo (grupos activos con su número de miembros activos), caso (selector sobre `GET /api/sesiones/casos` con título, versión y autor; el tope del tiempo máximo sale de su tiempo estimado), fecha, hora de inicio y de fin, tiempo máximo (tope = tiempo estimado del caso elegido), lugar y mensaje. Los errores del servidor se muestran en su campo. «Editar» solo aparece si `acciones` incluye `editar`.

### Detalle

- Cabecera: caso, grupo, horario y distintivo de estado.
- Barra de acciones construida **solo** con `acciones` del servidor; el frontend no replica las reglas de estado. Finalizar y Cancelar piden confirmación («cierra los intentos abiertos; no se puede deshacer»).
- Tabla de convocados: nombre, correo, estado del intento; por fila «Retirar» y, si `puedeRepetir`, «Autorizar repetición» (pide motivo).
- «Sincronizar con el grupo» informa cuántos sumó.
- Mientras el estado es `EN_CURSO` o `PAUSADA`, el detalle se refresca cada 20 s; se detiene al salir o al terminar.

### Estudiante

Sin pantallas nuevas. El caso aparece en «Casos» mientras la sesión está en curso; si intenta entrar en otro estado ve el mensaje del error de §2.

Todos los textos nuevos llevan la marca de borrador pendiente de Psicología (VD-23), como el resto del proyecto.

## 6. Pruebas

### Backend (pytest)

- `test_estados.py`: tabla 5 estados × 8 operaciones (iniciar, pausar, reanudar, finalizar, cancelar, editar, gestionar convocados, ingreso). Lo permitido lleva al destino esperado; lo prohibido responde `INVALID_TRANSITION` y no escribe. Comprueba `acciones()` de cada estado y `cerrar_automatico`.
- Servicios: crear con grupo propio y caso ajeno publicado; grupo ajeno → 404; caso no publicado → 400; grupo vacío → `GROUP_EMPTY`; solo se convoca a `ACTIVE`; sincronizar suma solo a los nuevos y no reactiva retirados; editar el grupo rehace la lista; editar fuera de Programada → 409.
- Simulador: ingreso permitido en curso y error propio en los otros cuatro estados; pausar pone en pausa los intentos y una acción de juego es rechazada; reanudar permite continuar el mismo intento; finalizar y cancelar cierran como incompletos y quitan el caso de `available_versions`; una sesión terminada ya no bloquea la asignación del grupo; `CONVOCADO_EN_OTRA_SESION`; ingreso tardío desde `iniciada_en`.
- Cierre automático para cada estado.
- API: estudiante → 403; docente ajeno → 404; `GET /api/sesiones/casos` no expone nodos ni opciones.
- Barreras del proyecto: superficie, auditoría por ruta, límites, inventario regenerado; migración de datos `SIN_INICIAR → PROGRAMADA`.
- Las pruebas existentes de `apps/sesiones/tests` se adaptan; las de convocar por correos y códigos emitidos se eliminan con esa ruta.

### Frontend (`ng test`)

API de sesiones; lista (filtro y vacío); diálogo (validaciones, errores por campo, tope del tiempo máximo); detalle (botones solo desde `acciones`, confirmaciones, refresco que se enciende y apaga); menú («Sesiones» solo para PROFESOR).

### De punta a punta en local

Con los datos demo: el docente crea una sesión con el grupo demo y el caso insignia → el estudiante no puede entrar → iniciar → el estudiante entra y juega → pausar → su juego se detiene y ve el aviso → reanudar → continúa → finalizar → el intento queda cerrado y el caso sale de «Casos».

## 7. Entrega

Rama `feature/sesiones-docente` desde `develop`. Commits Conventional Commits por capa (modelo y migración, estados, servicios, vistas y superficie, notificaciones, pruebas, frontend), identidad del autor y sin coautoría. Un PR a `develop` con la plantilla del equipo; revisor @Jsua3.
