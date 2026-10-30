# Ficha de sprint: B · Plataforma transversal

**Responsable:** Santiago Leyton  
**Bloque:** S1 (parte 2 de 2) · shared + security  
**Tamaño:** 2,769 líneas de producción ≈ 9.5% del backend (de 29,073); 45 archivos de prueba.  
**Rama sugerida:** `feature/s1-plataforma-transversal` · **Etiqueta:** `v0.1.0`

> **Propuesta sin ejecutar.** Codex hizo un análisis estático de `origin/master` (263146c1). Nadie ha corrido `django.setup()`, migraciones ni pruebas sobre este corte; esa verificación es parte de tu sprint.

Tu bloque es infraestructura reutilizable. **Tienes una tarea que desbloquea a los demás:** crear los contratos neutrales `shared/audit.py` (contrato `auditable` de auditoría) y `shared/identity.py` (normalización de email y `correo_seudonimo`), porque Emerson y Juan los consumen. Haz ese PR primero y avísales.

## Qué entrega (según el análisis de Codex)

## S1 — Base y autenticación

- **Entrega:** backend Django importable con configuración común, endpoints base y autenticación local; `AUTH_USER_MODEL = apps.users.User` fijado desde la primera migración. Apps: `psychosim`, `shared`, `users`, `security`.
- **Modelos:** `CustomUser` (rol, estado y campos de contraseña temporal), `AccessRequest`, `RateLimitBucket`. Configurar JWT para cargar el serializer de token desde un módulo de autenticación sin importar `account_service`.
- **Endpoints:** health/readiness y OpenAPI de `shared`; login, Google login/config, access-request, me, change-password; reporte CSP y throttling según el contrato de `security`. Se deben conservar las rutas /api existentes de la copia; no se ejecutaron.
- **Migraciones:** llevar `users` migrations 0001–0004 y `security` 0001 solo si tras inspección del grafo no tienen FK a apps aplazadas; en el repo nuevo la 0001 de usuarios fija `AUTH_USER_MODEL`. No aplicar migraciones en esta auditoría.
- **Tests asignados:** archivos bajo `shared/tests`, `apps/users/tests` y `apps/security/tests` marcados S1 en CSV. Prioridad de ejecución futura: importar settings, crear usuario y autenticar, cambio de contraseña, access request, CSP/throttle, health/OpenAPI.
- **Defensa de diseño:** transacción/bloqueo de cuenta en `apps/users/services/account_service.py:85` (`patrones-solid.md:82`) para discutir atomicidad y concurrencia; en S1 explicar la separación entre middleware/política/respuesta en `shared` con `shared/middleware.py`, `shared/policies.py`, `shared/response.py`. La evidencia no afirma SOLID automáticamente.
- **Antipatrones:** el corte original por peso dejaba auth fuera; aquí se corrige. Está presente la dependencia de `account_service` hacia el decorador del motor de simulación (`patrones-solid.md:81`); propuesta de corte en `romper-ciclo.md`. Settings carga token serializer por ruta de módulo (`psychosim/settings/base.py:169`), que hoy conduce a import eager indirecto.

## Aristas del ciclo que te tocan

**Tú creas el contrato; los otros cortan la arista.**

1. **S1, auth no debe importar el motor:** cortar `apps/users/services/account_service.py:24 → apps/simulation/services/audit_service.py`. Extraer el contrato `auditable`/emisión de auditoría a `shared/audit.py` o una interfaz `shared/audit_contracts.py`; el motor y `users` dependen del contrato neutral. Si hay datos específicos de gameplay, publicar eventos de dominio y persistirlos en S4.

3. **S1 → S2, datos de usuario compartidos:** cortar `apps/grupos/services.py:26 → apps/users/serializers.py`. Extraer normalización/validación de email a `shared/identity.py` (o módulo neutral de identidad existente) y que `users` y `grupos` dependan de él. No compartir serializers DRF entre apps.

4. **S2, privacidad con carga tardía:** `apps/users/services/account_service.py:161 → apps/privacy/data_subject.py` se importa localmente para reconocer cuenta suprimida. Extraer `correo_seudonimo` a `shared/identity.py`; el servicio de privacidad y account service consumen esa función. Si la regla depende de la política completa de borrado, mantener callback/servicio opcional y diferir su registro a S2.

*(Extraer a `shared/` es tuyo; que `users` y `grupos` lo usen es de Emerson y Juan.)*

## Ojo
- Los módulos de `security` hoy importan cosas de `simulation` (auditoría). Eso se resuelve con el contrato neutral, no copiando `simulation` a S1.
- Los `__init__.py` que cargan de más generan ruido en el análisis: reduzcan exportaciones eager.

## Tus archivos

### Configuración (2 archivos, 0 líneas)

**shared**
- `shared/policy-matrix.json` (0)
- `shared/surface-inventory.json` (0)

### Producción (42 archivos, 2769 líneas)

**security**
- `apps/security/__init__.py` (0)
- `apps/security/apps.py` (4)
- `apps/security/csp_report.py` (158)
- `apps/security/limiter.py` (76)
- `apps/security/limits.py` (28)
- `apps/security/management/__init__.py` (0)
- `apps/security/management/commands/__init__.py` (0)
- `apps/security/management/commands/purge_rate_limits.py` (62)
- `apps/security/management/commands/security_report.py` (80)
- `apps/security/management/commands/unblock_login.py` (33)
- `apps/security/models.py` (14)
- `apps/security/throttling.py` (52)

**shared**
- `shared/__init__.py` (0)
- `shared/background.py` (27)
- `shared/body_limit.py` (112)
- `shared/cache.py` (31)
- `shared/checks.py` (47)
- `shared/client_ip.py` (77)
- `shared/contract_testing.py` (177)
- `shared/csp_probe_seed.py` (168)
- `shared/dev_only.py` (52)
- `shared/exceptions.py` (150)
- `shared/health.py` (23)
- `shared/health_docs.py` (29)
- `shared/idempotency.py` (22)
- `shared/identity.py` (31)
- `shared/jsonlog.py` (81)
- `shared/jsonutils.py` (40)
- `shared/middleware.py` (39)
- `shared/openapi.py` (248)
- `shared/parsers.py` (41)
- `shared/permissions.py` (21)
- `shared/plain_text.py` (85)
- `shared/policies.py` (120)
- `shared/response.py` (24)
- `shared/security_events.py` (19)
- `shared/security_headers.py` (31)
- `shared/spa.py` (37)
- `shared/static_files.py` (22)
- `shared/surface.py` (327)
- `shared/testing.py` (131)
- `shared/text_guard.py` (50)

### Migraciones (2 archivos, 20 líneas)

**security**
- `apps/security/migrations/0001_initial.py` (20)
- `apps/security/migrations/__init__.py` (0)

### Pruebas (45 archivos, 5080 líneas)

**security**
- `apps/security/tests/__init__.py` (0)
- `apps/security/tests/test_bloqueo_de_cuenta.py` (100)
- `apps/security/tests/test_csp_report.py` (259)
- `apps/security/tests/test_csp_report_topes.py` (110)
- `apps/security/tests/test_limiter.py` (110)
- `apps/security/tests/test_limits.py` (32)
- `apps/security/tests/test_purge_rate_limits.py` (76)
- `apps/security/tests/test_throttled_views.py` (221)
- `apps/security/tests/test_throttling.py` (113)

**shared**
- `shared/test_attestation.py` (13)
- `shared/tests/__init__.py` (0)
- `shared/tests/test_api_docs_closed.py` (109)
- `shared/tests/test_body_limits.py` (191)
- `shared/tests/test_ci_endurecido.py` (131)
- `shared/tests/test_client_ip.py` (142)
- `shared/tests/test_compuerta_doc.py` (149)
- `shared/tests/test_contenedor_sin_root.py` (207)
- `shared/tests/test_contract_testing.py` (142)
- `shared/tests/test_csp_politica.py` (87)
- `shared/tests/test_csp_probe_settings.py` (134)
- `shared/tests/test_csp_vigor.py` (234)
- `shared/tests/test_deploy_contract.py` (22)
- `shared/tests/test_error_codes.py` (201)
- `shared/tests/test_gitleaks_config.py` (45)
- `shared/tests/test_health_and_logging.py` (103)
- `shared/tests/test_https_redirect.py` (62)
- `shared/tests/test_interruptores_cerrados.py` (72)
- `shared/tests/test_json_object_bodies.py` (37)
- `shared/tests/test_jsonutils.py` (79)
- `shared/tests/test_jwt_signing_key.py` (183)
- `shared/tests/test_legacy_history_check.py` (31)
- `shared/tests/test_mail_settings.py` (112)
- `shared/tests/test_parches_doc.py` (116)
- `shared/tests/test_policy_matrix.py` (162)
- `shared/tests/test_production_settings.py` (405)
- `shared/tests/test_public_routes.py` (21)
- `shared/tests/test_req_marker.py` (13)
- `shared/tests/test_response.py` (28)
- `shared/tests/test_security_headers.py` (213)
- `shared/tests/test_security_marker.py` (45)
- `shared/tests/test_spa_index.py` (220)
- `shared/tests/test_surface_inventory.py` (83)
- `shared/tests/test_testing_helpers.py` (26)
- `shared/tests/test_text_guard.py` (177)
- `shared/tests/test_texto_de_persona.py` (64)

## Para la sustentación (cada integrante defiende lo suyo)
Debes poder explicar: (1) qué hace tu bloque y por qué va en este orden, (2) un patrón de diseño y un principio SOLID con un archivo concreto de los de arriba, (3) un antipatrón que corrigieron o que sigue presente y cómo lo cortarían, (4) cómo se versionó (ramas, PR, etiqueta).
> Las referencias `archivo:línea` de Codex son indicios por tamaño y estructura, no pruebas. Léelas tú antes de afirmarlas.

## Checklist de Git (puntos de la rúbrica)
- [ ] Rama `feature/s1-plataforma-transversal` salida de `develop`; commits pequeños en formato Conventional Commits (`feat(...)`, `refactor(...)`, `test(...)`, `docs(...)`).
- [ ] Pull Request a `develop` con la plantilla; revisión de **otro compañero** antes de fusionar (sin autoaprobarse).
- [ ] Al cerrar el sprint queda la etiqueta `v0.1.0` y una línea en `CHANGELOG.md`.
- [ ] El commit inicial y la administración del repo los hace Juan; el trabajo de tu sprint va con tu autoría.
