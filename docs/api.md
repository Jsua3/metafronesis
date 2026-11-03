Borrador generado a partir del código; verificar antes de publicar

# API del corte S1–S4

Tabla estática de rutas encontradas en psychosim/urls.py y URLConfs de apps que aparecen en el corte. Se resuelven include() usando el prefijo raíz. La raíz no incluye apps/grupos/urls.py: esas rutas locales duplican las vistas pero no son otra exposición HTTP. Se documentan 40 patrones de ruta y 50 combinaciones método/ruta, contando alias con slash final como ruta distinta. El conteo es estático; no se ejecutó Django.

En permisos, “JWT/DRF” significa que aplica la autenticación/permisos por defecto (psychosim/settings/base.py:138); las policy específicas se indican. Serializer “—” significa que el código no declara serializer para ese endpoint, no que la respuesta carezca de forma. “Sin verificar” marca lo que requiere runtime.

| Método | Ruta completa | Vista | Autenticación/permisos | Serializer/contrato | App; sprint; fuente |
|---|---|---|---|---|---|
| GET | /api/health | shared.health.health | Público | — | shared; S1; psychosim/urls.py:67 |
| POST | /api/security/csp-report | CspReportView | Público; throttle IP | CspReportParser / ReportsJsonParser | security; S1; psychosim/urls.py:69; apps/security/csp_report.py:202 |
| POST | /api/auth/login | LoginView | Público; throttle login | LoginSerializer; respuesta UserSummarySerializer | users; S1; apps/users/urls.py:13; apps/users/views.py:137 |
| POST | /api/auth/google | GoogleLoginView | Público; throttle Google | GoogleLoginSerializer; UserSummarySerializer | users; S1; apps/users/urls.py:14; apps/users/views.py:197 |
| GET | /api/auth/google/config | GoogleConfigView | Público | — | users; S1; apps/users/urls.py:15; apps/users/views.py:187 |
| POST | /api/auth/access-request | AccessRequestCreateView | Público; throttle | AccessRequestCreateSerializer | users; S1; apps/users/urls.py:16; apps/users/views.py:263 |
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

## Rutas referenciadas pero no incluidas como endpoints del corte

psychosim/urls.py:95 incluye apps.simulation.urls y :102/:104 incluyen URLs de autoría; esos URLConfs no figuran en el manifiesto del corte. Por tanto no se listan sus rutas. En el código completo, podrían resultar accesibles; qué rutas nuevas se activarán en S3/S4 queda **sin verificar** hasta decidir los URLConfs del repo nuevo. Tampoco se listan reportes/rubrics/authoring completos: su código no forma parte del alcance declarado.

La serialización y los permisos estáticos se inspeccionaron en las vistas nombradas; el comportamiento HTTP efectivo, autenticación JWT en runtime y respuesta por verbo están **sin verificar**.
