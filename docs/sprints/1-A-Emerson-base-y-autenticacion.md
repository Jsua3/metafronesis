# Ficha de sprint: A · Base y autenticación

**Responsable:** Emerson Ángel Gómez  
**Bloque:** S1 (parte 1 de 2) · psychosim + users  
**Tamaño:** 2,492 líneas de producción ≈ 8.6% del backend (de 29,073); 20 archivos de prueba.  
**Rama sugerida:** `feature/s1-base-autenticacion` · **Etiqueta:** `v0.1.0`

> **Propuesta sin ejecutar.** Es un análisis estático hecho con ayuda de IA sobre el código del proyecto original. Nadie ha corrido `django.setup()`, migraciones ni pruebas sobre este corte; esa verificación es parte de tu sprint.

Tu bloque es la base: sin `users` y la configuración nada arranca. **Dependes de Leyton (B)**: `shared` lo usan los settings y los contratos neutrales (`shared/audit.py`, `shared/identity.py`) nacen en su sprint. Coordínense: B fusiona primero o ambos trabajan sobre una rama de integración `integracion/s1`.

## Qué entrega (según el análisis de la IA)

## S1 — Base y autenticación

- **Entrega:** backend Django importable con configuración común, endpoints base y autenticación local; `AUTH_USER_MODEL = apps.users.User` fijado desde la primera migración. Apps: `psychosim`, `shared`, `users`, `security`.
- **Modelos:** `CustomUser` (rol, estado y campos de contraseña temporal), `AccessRequest`, `RateLimitBucket`. Configurar JWT para cargar el serializer de token desde un módulo de autenticación sin importar `account_service`.
- **Endpoints:** health/readiness y OpenAPI de `shared`; login, Google login/config, access-request, me, change-password; reporte CSP y throttling según el contrato de `security`. Se deben conservar las rutas /api existentes de la copia; no se ejecutaron.
- **Migraciones:** llevar `users` migrations 0001–0004 y `security` 0001 solo si tras inspección del grafo no tienen FK a apps aplazadas; en el repo nuevo la 0001 de usuarios fija `AUTH_USER_MODEL`. No aplicar migraciones en esta auditoría.
- **Tests asignados:** archivos bajo `shared/tests`, `apps/users/tests` y `apps/security/tests` marcados S1 en CSV. Prioridad de ejecución futura: importar settings, crear usuario y autenticar, cambio de contraseña, access request, CSP/throttle, health/OpenAPI.
- **Defensa de diseño:** transacción/bloqueo de cuenta en `apps/users/services/account_service.py:85` (el análisis de patrones) para discutir atomicidad y concurrencia; en S1 explicar la separación entre middleware/política/respuesta en `shared` con `shared/middleware.py`, `shared/policies.py`, `shared/response.py`. La evidencia no afirma SOLID automáticamente.
- **Antipatrones:** el corte original por peso dejaba auth fuera; aquí se corrige. Está presente la dependencia de `account_service` hacia el decorador del motor de simulación (el análisis de patrones); propuesta de corte en el análisis de ciclos. Settings carga token serializer por ruta de módulo (`psychosim/settings/base.py:169`), que hoy conduce a import eager indirecto.

## Aristas del ciclo que te tocan

1. **S1, auth no debe importar el motor:** cortar `apps/users/services/account_service.py:24 → apps/simulation/services/audit_service.py`. Extraer el contrato `auditable`/emisión de auditoría a `shared/audit.py` o una interfaz `shared/audit_contracts.py`; el motor y `users` dependen del contrato neutral. Si hay datos específicos de gameplay, publicar eventos de dominio y persistirlos en S4.

2. **S1, settings no importa serializers de aplicación:** `psychosim/settings/base.py:169` configura `apps.users.serializers.PsychoSimTokenObtainSerializer`; ese módulo importa `account_service` (`users/serializers.py:15`). Mover el serializer JWT pequeño a `apps/users/auth_serializers.py`, que dependa solo de modelos/auth, y apuntar ahí el dotted path. Evita cargar servicios al construir settings.

6. **S1/S2, separar raíz URL:** `psychosim/urls.py` importa vistas de grupos, simulation, rubrics y authoring al nivel módulo. Crear `urls/base.py` o dejar en S1 solo health/security/auth; agregar includes de grupos/privacy en S2 y simulation en S3/S4. No importar vistas tardías desde el módulo raíz.

7. **S1, urls de auth:** mantener `apps/users/urls.py → users/views.py` y serializer/service bajo una sola dirección (`urls → views → aplicación → modelo`); no volver a importar views desde serializer/service. El URLConf no importa módulos de S2.

*(La 1 consume el contrato que crea Leyton; la 3 y la 4 las cortan Juan y Leyton.)*

## Ojo
- `AUTH_USER_MODEL = apps.users.User` debe quedar fijado **desde la primera migración** del repo nuevo.
- El serializer JWT debe cargarse sin importar `account_service` (settings → `users/auth_serializers.py`).

## Tus archivos

### Producción (28 archivos, 2492 líneas)

**psychosim**
- `psychosim/__init__.py` (0)
- `psychosim/settings/__init__.py` (0)
- `psychosim/settings/base.py` (429)
- `psychosim/settings/csp_probe.py` (77)
- `psychosim/settings/local.example.py` (10)
- `psychosim/settings/production.py` (190)
- `psychosim/settings/test.py` (76)
- `psychosim/urls.py` (114)
- `psychosim/wsgi.py` (4)

**users**
- `apps/users/__init__.py` (0)
- `apps/users/apps.py` (8)
- `apps/users/authentication.py` (44)
- `apps/users/google_verification.py` (74)
- `apps/users/management/__init__.py` (0)
- `apps/users/management/commands/__init__.py` (0)
- `apps/users/management/commands/create_admin.py` (73)
- `apps/users/management/commands/expire_temporary_passwords.py` (43)
- `apps/users/management/commands/force_password_change_for_shared_passwords.py` (87)
- `apps/users/management/commands/seed_demo_users.py` (40)
- `apps/users/models.py` (125)
- `apps/users/password_validators.py` (48)
- `apps/users/serializers.py` (168)
- `apps/users/services/__init__.py` (0)
- `apps/users/services/access_request_service.py` (95)
- `apps/users/services/account_service.py` (328)
- `apps/users/services/audit_events.py` (103)
- `apps/users/urls.py` (17)
- `apps/users/views.py` (339)

### Migraciones (5 archivos, 76 líneas)

**users**
- `apps/users/migrations/0001_initial.py` (40)
- `apps/users/migrations/0002_user_must_change_password.py` (12)
- `apps/users/migrations/0003_customuser_session_epoch.py` (12)
- `apps/users/migrations/0004_customuser_temp_password_set_at.py` (12)
- `apps/users/migrations/__init__.py` (0)

### Pruebas (20 archivos, 1714 líneas)

**users**
- `apps/users/tests/__init__.py` (0)
- `apps/users/tests/test_access_request_aviso.py` (132)
- `apps/users/tests/test_access_request_texto_plano.py` (38)
- `apps/users/tests/test_access_request_uniforme.py` (63)
- `apps/users/tests/test_access_requests.py` (88)
- `apps/users/tests/test_auth.py` (248)
- `apps/users/tests/test_google_certificados.py` (174)
- `apps/users/tests/test_google_dependency_declared.py` (30)
- `apps/users/tests/test_google_dominios.py` (57)
- `apps/users/tests/test_google_login_contract.py` (85)
- `apps/users/tests/test_hash_ficticio_arranque.py` (14)
- `apps/users/tests/test_llamadas_a_set_password.py` (103)
- `apps/users/tests/test_login_sin_oraculo.py` (73)
- `apps/users/tests/test_models.py` (27)
- `apps/users/tests/test_nombres_de_persona.py` (59)
- `apps/users/tests/test_password_espacios.py` (46)
- `apps/users/tests/test_password_no_parecida_a_la_cuenta.py` (107)
- `apps/users/tests/test_registro_retirado.py` (62)
- `apps/users/tests/test_shared_password_command.py` (78)
- `apps/users/tests/test_temp_password_caducidad.py` (230)

## Para la sustentación (cada integrante defiende lo suyo)
Debes poder explicar: (1) qué hace tu bloque y por qué va en este orden, (2) un patrón de diseño y un principio SOLID con un archivo concreto de los de arriba, (3) un antipatrón que corrigieron o que sigue presente y cómo lo cortarían, (4) cómo se versionó (ramas, PR, etiqueta).
> Las referencias `archivo:línea` de la IA son indicios por tamaño y estructura, no pruebas. Léelas tú antes de afirmarlas.

## Checklist de Git (puntos de la rúbrica)
- [ ] Rama `feature/s1-base-autenticacion` salida de `develop`; commits pequeños en formato Conventional Commits (`feat(...)`, `refactor(...)`, `test(...)`, `docs(...)`).
- [ ] Pull Request a `develop` con la plantilla; revisión de **otro compañero** antes de fusionar (sin autoaprobarse).
- [ ] Al cerrar el sprint queda la etiqueta `v0.1.0` y una línea en `CHANGELOG.md`.
- [ ] El commit inicial y la administración del repo los hace Juan; el trabajo de tu sprint va con tu autoría.
