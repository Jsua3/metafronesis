Borrador generado a partir del código; verificar antes de publicar

# API del corte S1–S4

Tabla estática de rutas encontradas en psychosim/urls.py y URLConfs de apps que aparecen en el corte. Se resuelven include() usando el prefijo raíz. Las rutas de grupos se registran directamente en psychosim/urls.py. Se documentan 40 patrones de ruta y 50 combinaciones método/ruta, contando alias con slash final como ruta distinta. El conteo es estático; no se ejecutó Django.

En permisos, “JWT/DRF” significa que aplica la autenticación/permisos por defecto (psychosim/settings/base.py:138); las policy específicas se indican. Serializer “—” significa que el código no declara serializer para ese endpoint, no que la respuesta carezca de forma. “Sin verificar” marca lo que requiere runtime.

| Método | Ruta completa | Vista | Autenticación/permisos | Serializer/contrato | App; sprint; fuente |
|---|---|---|---|---|---|
| GET | /api/health | shared.health.health | Público | — | shared; S1; psychosim/urls.py:67 |
| POST | /api/security/csp-report | CspReportView | Público; throttle IP | CspReportParser / ReportsJsonParser | security; S1; psychosim/urls.py:69; apps/security/csp_report.py:202 |
| POST | /api/auth/login | LoginView | Público; throttle login | LoginSerializer; respuesta UserSummarySerializer | users; S1; apps/users/urls.py:13; apps/users/views.py:137 |
| POST | /api/auth/google | GoogleLoginView | Público; throttle Google | GoogleLoginSerializer; UserSummarySerializer | users; S1; apps/users/urls.py:14; apps/users/views.py:197 |
| GET | /api/auth/google/config | GoogleConfigView | Público | — | users; S1; apps/users/urls.py:15; apps/users/views.py:187 |
| POST | /api/auth/access-request | AccessRequestCreateView | Público; throttle | AccessRequestCreateSerializer | users; S1; apps/users/urls.py:16; apps/users/views.py:263 |
| POST | /api/auth/password-reset | PasswordResetRequestView | Público; throttle por IP y por correo | PasswordResetRequestSerializer | users; apps/users/urls.py; apps/users/services/password_reset_service.py |
| POST | /api/auth/password-reset/check | PasswordResetCheckView | Público; throttle | PasswordResetCheckSerializer | users; apps/users/urls.py |
| POST | /api/auth/password-reset/confirm | PasswordResetConfirmView | Público; throttle | PasswordResetConfirmSerializer | users; apps/users/urls.py; audita PASSWORD_CHANGED |
| GET | /api/auth/me | MeView | JWT; account/self | UserSummarySerializer | users; S1; apps/users/urls.py:17; apps/users/views.py:358 |
| POST | /api/auth/change-password | ChangePasswordView | JWT; account/self | ChangePasswordSerializer | users; S1; apps/users/urls.py:18; apps/users/views.py:318 |
| POST | /api/auth/logout | LogoutView | JWT; account/self | — | users; S1; psychosim/urls.py:72; apps/users/views.py:334 |
| GET, POST | /api/grupos | GrupoListCreateView | Policy group/list o group/manage | POST CrearGrupoSerializer; GET sin serializer | grupos; S2; psychosim/urls.py:73; apps/grupos/views.py:44 |
| PUT, PATCH, DELETE | /api/grupos/<int:pk> | GrupoDetailView | JWT; group/manage | PUT ActualizarGrupoSerializer; PATCH reutiliza update | grupos; S2; psychosim/urls.py:74; apps/grupos/views.py:64 |
| GET, POST | /api/grupos/<int:pk>/estudiantes | GrupoEstudiantesView | GET group/manage; POST membership/invite | POST AgregarEstudianteSerializer | grupos; S2; psychosim/urls.py:75; apps/grupos/views.py:85 |
| DELETE | /api/grupos/<int:pk>/estudiantes/<int:estudiante_id> | GrupoEstudianteDetailView | JWT; group/manage | — | grupos; S2; psychosim/urls.py:76; apps/grupos/views.py:106 |
| POST | /api/grupos/<int:pk>/estudiantes/<int:estudiante_id>/activar | GrupoEstudianteActivarView | JWT; membership/respond | InvitationSerializer de respuesta | grupos; S2; psychosim/urls.py:77; apps/grupos/views.py:247 |
| GET | /api/me/invitations | MeInvitationsView | JWT; membership/respond | InvitationSerializer | grupos; S2; psychosim/urls.py:79; apps/grupos/views.py:269 |
| POST | /api/me/invitations/<int:group_id>/accept | MeInvitationAcceptView | JWT; membership/respond | InvitationSerializer | grupos; S2; psychosim/urls.py:80; apps/grupos/views.py:277 |
| POST | /api/me/invitations/<int:group_id>/decline | MeInvitationDeclineView | JWT; membership/respond | InvitationSerializer | grupos; S2; psychosim/urls.py:81; apps/grupos/views.py:286 |
| POST | /api/me/invitations/<int:group_id>/leave | MeInvitationLeaveView | JWT; membership/respond | InvitationSerializer | grupos; S2; psychosim/urls.py:82; apps/grupos/views.py:297 |
| POST | /api/grupos/<int:pk>/estudiantes/import y /api/grupos/<int:pk>/estudiantes/import/ | GrupoEstudiantesImportView | JWT; group/manage; throttle de importación | ImportarEstudiantesSerializer | grupos; S2; psychosim/urls.py:83–84; apps/grupos/views.py:114 |
| GET | /api/grupos/estudiantes/import/spec y /api/grupos/estudiantes/import/spec/ | GrupoEstudiantesImportSpecView | JWT; group/manage | Spec/contrato JSON; serializer DRF explícito: — | grupos; S2; psychosim/urls.py:85–86; apps/grupos/views.py:133 |
| GET | /api/grupos/estudiantes/import/template y /api/grupos/estudiantes/import/template/ | GrupoEstudiantesImportTemplateView | JWT; group/manage | Archivo xlsx; serializer DRF: — | grupos; S2; psychosim/urls.py:87–88; apps/grupos/views.py:140 |
| GET, POST | /api/grupos/<int:pk>/casos | GrupoCasosView | GET assignment/list; POST assignment/manage | POST AsignarCasoSerializer | grupos; S3 para asignación; psychosim/urls.py:89; apps/grupos/views.py:153 |
| DELETE | /api/grupos/<int:pk>/casos/<int:case_version_id> | GrupoCasoDetailView | JWT; assignment/manage | — | grupos; S3; psychosim/urls.py:90; apps/grupos/views.py:170 |
| GET, POST | /api/assignments | AssignmentListCreateView | GET assignment/list; POST assignment/manage | POST AssignmentCreateSerializer; respuesta AssignmentSerializer | grupos; S3; psychosim/urls.py:92; apps/grupos/views.py:199 |
| PATCH, DELETE | /api/assignments/<int:assignment_id> | AssignmentDetailView | JWT; assignment/manage | PATCH AssignmentUpdateSerializer | grupos; S3; psychosim/urls.py:93; apps/grupos/views.py:229 |
| GET, POST | /api/simulation/cases/<int:case_version_id>/consent | ConsentView | JWT estudiante; consent/read o consent/record | ConsentStateSerializer / ConsentAcceptRequest / ConsentRecordSerializer | privacy; S2 (requiere CaseVersion mínimo); psychosim/urls.py:98; apps/privacy/urls.py:7; apps/privacy/views.py:33 |
| DELETE | /api/simulation/cases/<int:case_version_id>/consent | ConsentView | JWT estudiante; consent/record | ConsentWithdrawalSerializer | privacy; S2 (requiere CaseVersion mínimo); apps/privacy/views.py:79 |
| GET | /api/biblioteca/lugares | LugarListView | JWT; case/author (PROFESOR/ADMIN) | Sin serializer DRF explícito; JSON de catálogo | biblioteca; S4; psychosim/urls.py:106; apps/biblioteca/urls.py:7; apps/biblioteca/views.py:15 |
| GET | /api/biblioteca/lugares/<str:lugar_id> | LugarDetailView | JWT; case/author | Sin serializer DRF explícito; JSON de catálogo | biblioteca; S4; apps/biblioteca/urls.py:8; apps/biblioteca/views.py:24 |
| GET, POST | /api/admin/users | AdminUserListCreateView | JWT; user/manage | GET AdminUserSerializer; POST AdminUserWriteSerializer | users; S1; psychosim/urls.py:108; apps/users/views.py:367 |
| POST | /api/admin/users/approve | AdminUserApproveView | JWT; user/manage | ApproveUsersSerializer | users; S1; psychosim/urls.py:109; apps/users/views.py:346 |
| PUT | /api/admin/users/<int:user_id> | AdminUserDetailView | JWT; user/manage | AdminUserWriteSerializer; respuesta AdminUserSerializer | users; S1; psychosim/urls.py:110; apps/users/views.py:387 |
| PATCH | /api/admin/users/<int:user_id>/status | AdminUserStatusView | JWT; user/manage | AdminUserStatusSerializer | users; S1; psychosim/urls.py:111; apps/users/views.py:419 |
| POST | /api/admin/users/<int:user_id>/revoke-sessions | AdminUserRevokeSessionsView | JWT; user/manage | — | users; S1; psychosim/urls.py:112; apps/users/views.py:454 |
| GET | /api/admin/access-requests | AdminAccessRequestListView | JWT; user/manage | AccessRequestSerializer | users; S1; psychosim/urls.py:113; apps/users/views.py:289 |
| PATCH | /api/admin/access-requests/<int:request_id>/status | AdminAccessRequestStatusView | JWT; user/manage | AccessRequestStatusSerializer | users; S1; psychosim/urls.py:114; apps/users/views.py:301 |
| GET | /schema/ | SpectacularAPIView tras _docs_gate | Cerrado 404 por flag; si habilitado JWT y user/manage | OpenAPI; sin serializer de aplicación | psychosim; S1; psychosim/urls.py:120 |
| GET | /swagger-ui.html | SpectacularSwaggerView tras _docs_gate | Cerrado 404 por flag; si habilitado JWT y user/manage | HTML de Swagger; — | psychosim; S1; psychosim/urls.py:128 |

## Sesiones del docente

Permiso de todas las rutas: `assignment/manage` (PROFESOR sobre sus propias sesiones; una sesión ajena responde 404). Las respuestas usan el sobre `{success, data}`; los errores de estado responden 409 `INVALID_TRANSITION` y los de campo 400 con `field`.

| Método | Ruta | Cuerpo | Respuesta | Auditoría |
|---|---|---|---|---|
| GET | /api/sesiones?estado= | `estado` admite varios valores separados por coma | Lista de sesiones: `id, estado, acciones, grupo {id, nombre}, caso {caseVersionId, titulo}, inicio, fin, tiempoMaximoMin, lugar, mensaje, totalConvocados, iniciadaEn, finalizadaEn, canceladaEn` | EXENTO |
| POST | /api/sesiones | `{grupoId, caseVersionId, inicio, fin, tiempoMaximoMin, lugar?, mensaje?}` | 201, sesión con detalle (los campos de la lista más `convocados`) | SESION_CREADA |
| GET | /api/sesiones/casos | — | Casos de la biblioteca: `caseVersionId, titulo, version, autor, editadoPor, tiempoEstimadoMin, descripcion` (sin el contenido del caso). `autor` es el nombre de quien creó el caso; `editadoPor`, la lista de nombres de quienes, sin ser el autor, crearon alguna versión suya (en el orden de su primera versión; `[]` si nadie más) | EXENTO |
| GET | /api/sesiones/<id> | — | Sesión con `convocados: [{estudianteId, nombre, email, estadoConvocatoria, intento, puedeRepetir}]` | EXENTO |
| PATCH | /api/sesiones/<id> | Los campos de crear, todos opcionales | Sesión con detalle | SESION_EDITADA |
| POST | /api/sesiones/<id>/iniciar, pausar, reanudar, finalizar, cancelar | Sin cuerpo | Sesión con detalle | SESION_INICIADA, SESION_PAUSADA, SESION_REANUDADA, SESION_FINALIZADA, SESION_CANCELADA |
| POST | /api/sesiones/<id>/sincronizar | Sin cuerpo | `{agregados: n}` | CONVOCADOS_SINCRONIZADOS |
| DELETE | /api/sesiones/<id>/convocados/<estudiante_id> | — | Mensaje de confirmación | CONVOCADO_RETIRADO |
| POST | /api/sesiones/<id>/convocados/<estudiante_id>/repeticion | `{motivo}` | 201 `{id}` | REPETICION_AUTORIZADA |

`acciones` es la lista de lo que el estado actual permite (`iniciar`, `pausar`, `reanudar`, `finalizar`, `cancelar`, `editar`, `gestionarConvocados`); el cliente solo muestra esas.

La ruta `POST /api/sesiones/<id>/convocados` (convocar por correos) se eliminó: los convocados salen de los miembros activos del grupo de la sesión.

## Autoría compartida de casos

La regla está en `apps/autoria/autoria.py` y en `docs/diseno/2026-11-24-autoria-compartida.md`. Las rutas no cambian; cambian quién ve y puede qué, y las respuestas ganan campos.

| Método | Ruta | Qué cambia |
|---|---|---|
| GET | /api/authoring/cases | El PROFESOR ve las versiones de sus casos (menos los borradores que creó otra persona), las versiones que él creó en casos ajenos y las **publicadas** de cualquier caso; el ADMIN, todo. Cada fila suma a `{versionId, status, revision, brief}`: `caseId`, `semanticVersion`, `autor: {id, nombre}` (quien creó el caso; no cambia), `editadoPor: [{id, nombre}]` (quienes, sin ser el autor, crearon alguna versión, en el orden de su primera versión), `puedeEditar` (un borrador que creó quien pide, o cualquiera para el ADMIN) y `puedeCrearVersion` (puede clonarla: una publicada de cualquier caso con permiso de autoría, o una archivada del propio caso). |
| GET | /api/authoring/cases/<id>/editor | Suma `autor` y `editadoPor` con la misma forma. Una publicada ajena se abre (solo lectura); un borrador ajeno responde 404. |
| PUT/POST/DELETE | rutas de edición del borrador (`brief`, `nodes`, `decisions`, `world`, `checklist`, …) | Solo quien creó el borrador (o el ADMIN). Un borrador ajeno responde 404, también para el autor del caso. |
| POST | /api/authoring/cases/<id>/clone-version | De una publicada de cualquier caso (en uno ajeno hace falta el permiso de autoría: si no, 403 `AUTHORING_NOT_ALLOWED`) o de una archivada del caso propio. El borrador nuevo es de quien clona (`created_by`, `cloned_from` = la original) y su versión semántica es la menor siguiente a la **mayor** del caso (`M.m+1.0`), así dos docentes que clonan la misma publicada reciben números distintos. |
| GET, POST | /api/authoring/cases/<id>/lifecycle | `submit` (y la transición `submit` de `allowedTransitions`) es de quien creó la versión; `archive`, del autor del caso; `clone` aparece en una publicada ajena. Al devolver a borrador (`reject`), la revisión queda pedida por quien creó la versión (`review.requestedBy`). |
| POST | /api/authoring/cases/<id>/publish | Sin cambios (solo ADMIN). Publicar la versión de otro docente no cambia el autor del caso. |

## IA coautora (SIEP-269)

Permiso de todas las rutas: `case/author` (el docente sobre sus propias conversaciones; una ajena responde 404). Con el asistente de autoría apagado (`AI_AUTHORING_ENABLED`), todas responden 404. Diseño: `docs/diseno/2026-11-25-ia-coautora-del-editor.md`.

| Método | Ruta | Cuerpo | Respuesta | Auditoría |
|---|---|---|---|---|
| POST | /api/authoring/coauthor | `{idea, lugarId}` (caso nuevo) o `{idea, caseVersionId}` (caso en borrador) | 201, acuerdo con la primera pregunta. Gasta una ayuda del día. Si la primera pregunta falla, trae `error {code, message}` y `pregunta: null` | AI_COAUTHOR_STARTED |
| GET | /api/authoring/coauthor/<id> | — | Acuerdo | EXENTO |
| DELETE | /api/authoring/coauthor/<id> | — | Acuerdo `cancelled` | AI_COAUTHOR_CANCELLED |
| POST | /api/authoring/coauthor/<id>/question | Sin cuerpo | Vuelve a pedir la pregunta pendiente tras una falla | AI_COAUTHOR_STAGE |
| POST | /api/authoring/coauthor/<id>/answer | `{numero, eleccion: {tipo: opcion, indice} \| {tipo: propia, texto} \| {tipo: decide}}` | Acuerdo con la siguiente pregunta, o `ready` al llegar al tope o cuando la IA dice que ya tiene lo necesario. Un `numero` anterior cambia esa respuesta y descarta las posteriores | AI_COAUTHOR_STAGE |
| POST | /api/authoring/coauthor/<id>/skip | Sin cuerpo | Acuerdo `ready` | AI_COAUTHOR_STAGE |
| POST | /api/authoring/coauthor/<id>/summary | `{}` desde `ready`, o `{cambio}` desde `summarized` | Acuerdo `summarized` con la ficha | AI_COAUTHOR_STAGE |
| PUT | /api/authoring/coauthor/<id>/summary | `{ficha}` | La ficha corregida a mano (se valida igual que la de la IA; no gasta llamadas) | AI_COAUTHOR_STAGE |
| POST | /api/authoring/coauthor/<id>/accept | Sin cuerpo | Acuerdo `accepted`. En un caso nuevo arranca la generación por etapas con la ficha como descripción y trae `generationId` | AI_COAUTHOR_ACCEPTED |

El acuerdo es `{id, status (clarifying, ready, summarized, accepted, cancelled), lugarId, caseVersionId, idea, respuestas [{numero, ambito, pregunta, porque, opciones, recomendada, eleccion, respuesta}], pregunta {numero, ambito, texto, porque, opciones[3], recomendada} | null, topePreguntas, ficha, llamadasUsadas, llamadasTope, generationId, ocupado}`. La ficha es `{titulo, objetivo, personajes [{nombre, descripcion}], lugar, momento (dia, noche), escenas [{titulo, proposito}], hitos, finales [{titulo, descripcion}], intensidad (LOW, MEDIUM, HIGH), temasSensibles}`.

Errores nuevos: 409 `COAUTHOR_STATE` (el paso no corresponde al estado), 409 `COAUTHOR_BUSY` (la IA ya está pensando esa conversación), 409 `COAUTHOR_EXHAUSTED` (se agotaron las llamadas de la conversación), 422 `AI_COAUTHOR_INVALID` (la IA respondió algo que no cumple el esquema o las reglas de contenido; trae `motivo` fijo). También responde los del asistente: 429 `AI_LIMIT_EXCEEDED`, 422 `AI_REFUSED` y 502 `AI_PROVIDER_ERROR`.

## Rutas referenciadas pero no incluidas como endpoints del corte

psychosim/urls.py:95 incluye apps.simulation.urls y :102/:104 incluyen URLs de autoría; esos URLConfs no figuran en el manifiesto del corte. Por tanto no se listan sus rutas. En el código completo, podrían resultar accesibles; qué rutas nuevas se activarán en S3/S4 queda **sin verificar** hasta decidir los URLConfs del repo nuevo. Tampoco se listan reportes/rubrics/authoring completos: su código no forma parte del alcance declarado.

La serialización y los permisos estáticos se inspeccionaron en las vistas nombradas; el comportamiento HTTP efectivo, autenticación JWT en runtime y respuesta por verbo están **sin verificar**.
