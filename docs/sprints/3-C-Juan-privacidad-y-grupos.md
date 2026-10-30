# Ficha de sprint: C · Privacidad y grupos

**Responsable:** Juan José Sua Gómez  
**Bloque:** S2 · privacy + grupos + modelo mínimo de caso  
**Tamaño:** 4,368 líneas de producción ≈ 15.0% del backend (de 29,073); 23 archivos de prueba.  
**Rama sugerida:** `feature/s2-privacidad-grupos` · **Etiqueta:** `v0.2.0`

> **Propuesta sin ejecutar.** Es un análisis estático hecho con ayuda de IA sobre el código del proyecto original. Nadie ha corrido `django.setup()`, migraciones ni pruebas sobre este corte; esa verificación es parte de tu sprint.

Es el bloque con más código del equipo (~15%). Dependes de S1 completo (`users` y los contratos de `shared`). Puedes preparar la rama ya, pero la fusión espera a que S1 esté en `develop`. Además eres el dueño del repo: antes de los sprints haces el Sprint 0 (commit inicial con los 4 autores, `develop`, protección de ramas, archivos base).

## Qué entrega (según el análisis de la IA)

## S2 — Privacidad y grupos básicos

- **Entrega:** consentimiento, inventario y derechos del titular; grupos, membresías e importación de estudiantes. S2 incluye el modelo mínimo `SimulationCase` (255 LOC contando `apps.py`, `case.py` y su paquete) para que las referencias de grupos se resuelvan al inicializar el registro. La API de asignación de casos queda activada con migración en S3.
- **Apps/modelos/endpoints:** `privacy` (`ConsentRecord` y eventos/servicios de consentimiento y derechos), `grupos` (`Grupo`, `GrupoEstudiante`, asignación de caso) y el modelo mínimo de caso. Endpoints de privacidad: consentimiento; grupos: CRUD, estudiantes, import, spec/template y casos. Mantener fuera los endpoints dependientes de motor hasta S3/S4.
- **Migraciones:** `privacy` 0001, sujeta a cotejar dependencias con `AUTH_USER_MODEL`. Las migraciones de grupos se asignan a S3 junto con la inicial acotada de simulation, porque el histórico `apps/grupos/migrations/0001..0005` enlaza asignaciones/versiones a `CaseVersion`. En S2 generar en el repo nuevo solo la migración core de grupo/membresía si se requiere escribir grupos antes de S3.
- **Tests asignados:** 23 archivos S2 de `apps/privacy/tests`, `apps/grupos/tests` y `shared/tests/test_fetch_raise.py`, según CSV. Diferir tests de asignaciones/versiones que pidan el modelo completo hasta S3; la tabla de cierre enumera referencias incompatibles del código fuente actual.
- **Defensa de diseño:** `Grupo` agrupa relaciones (el análisis de patrones); `assignment_service.create_assignment` usa `auditable` y `transaction.atomic` (el análisis de patrones). Sirve para explicar composición y transacción, no como prueba de cumplimiento completo de SOLID.
- **Antipatrones:** S2↔S1 forma el ciclo de 11 archivos; presente dependencia de `grupos/services.py` a serializers de usuarios y al motor. Se propone extraer contratos y evitar el import directo. Riesgo de responsabilidad múltiple en `privacy/data_subject.py` (el análisis de patrones); indicio, no veredicto.

## Aristas del ciclo que te tocan

3. **S1 → S2, datos de usuario compartidos:** cortar `apps/grupos/services.py:26 → apps/users/serializers.py`. Extraer normalización/validación de email a `shared/identity.py` (o módulo neutral de identidad existente) y que `users` y `grupos` dependan de él. No compartir serializers DRF entre apps.

4. **S2, privacidad con carga tardía:** `apps/users/services/account_service.py:161 → apps/privacy/data_subject.py` se importa localmente para reconocer cuenta suprimida. Extraer `correo_seudonimo` a `shared/identity.py`; el servicio de privacidad y account service consumen esa función. Si la regla depende de la política completa de borrado, mantener callback/servicio opcional y diferir su registro a S2.

5. **S2, eliminar dependencia de configuración inversa:** `apps/privacy/inventory.py:922` solo usa `psychosim.settings.base` como `DJANGO_SETTINGS_MODULE` al ejecutarse como script. Mantenerlo dentro del `if __name__ == '__main__'`, pero cambiar a settings seleccionables por entorno o un comando Django; el paquete privacy nunca debe importar settings.

## Ojo
- Las migraciones de `grupos` (0001–0005) enlazan a `CaseVersion`: se activan en S3 con Bonilla. En S2 solo lo mínimo de grupo/membresía.
- `privacy/data_subject.py` junta varias responsabilidades (indicio de la IA): buen tema para defender SOLID.

## Tus archivos

### Producción (33 archivos, 4368 líneas)

**grupos**
- `apps/grupos/__init__.py` (0)
- `apps/grupos/access.py` (73)
- `apps/grupos/assignment_service.py` (175)
- `apps/grupos/assignments.py` (86)
- `apps/grupos/contracts.py` (48)
- `apps/grupos/import_contract.py` (5)
- `apps/grupos/memberships.py` (144)
- `apps/grupos/models.py` (119)
- `apps/grupos/notifications.py` (36)
- `apps/grupos/serializers.py` (67)
- `apps/grupos/services.py` (688)
- `apps/grupos/urls.py` (26)
- `apps/grupos/views.py` (225)

**privacy**
- `apps/privacy/__init__.py` (0)
- `apps/privacy/apps.py` (5)
- `apps/privacy/audit_events.py` (36)
- `apps/privacy/consent_service.py` (253)
- `apps/privacy/data_subject.py` (474)
- `apps/privacy/inventory.py` (873)
- `apps/privacy/management/__init__.py` (0)
- `apps/privacy/management/commands/__init__.py` (0)
- `apps/privacy/management/commands/_comun.py` (100)
- `apps/privacy/management/commands/erase_personal_data.py` (53)
- `apps/privacy/management/commands/export_personal_data.py` (43)
- `apps/privacy/management/commands/purge_expired_data.py` (37)
- `apps/privacy/models.py` (50)
- `apps/privacy/serializers.py` (38)
- `apps/privacy/services.py` (384)
- `apps/privacy/urls.py` (5)
- `apps/privacy/views.py` (72)

**simulation**
- `apps/simulation/__init__.py` (0)
- `apps/simulation/models/__init__.py` (50)
- `apps/simulation/models/case.py` (203)

### Migraciones (2 archivos, 29 líneas)

**privacy**
- `apps/privacy/migrations/0001_initial.py` (29)
- `apps/privacy/migrations/__init__.py` (0)

### Pruebas (23 archivos, 1888 líneas)

**grupos**
- `apps/grupos/tests/__init__.py` (0)
- `apps/grupos/tests/test_assignment_data_migration.py` (82)
- `apps/grupos/tests/test_assignment_window.py` (66)
- `apps/grupos/tests/test_eliminar_grupo.py` (48)
- `apps/grupos/tests/test_grupos.py` (315)
- `apps/grupos/tests/test_import_hardening.py` (202)
- `apps/grupos/tests/test_import_limites.py` (105)
- `apps/grupos/tests/test_limites_entrada_s2_6b.py` (127)
- `apps/grupos/tests/test_membership_machine.py` (46)
- `apps/grupos/tests/test_nombre_de_grupo_visible.py` (17)

**privacy**
- `apps/privacy/tests/__init__.py` (0)
- `apps/privacy/tests/conftest.py` (21)
- `apps/privacy/tests/support.py` (47)
- `apps/privacy/tests/test_consent_inventory.py` (22)
- `apps/privacy/tests/test_consent_model.py` (132)
- `apps/privacy/tests/test_consent_settings.py` (72)
- `apps/privacy/tests/test_consent_tope_aceptaciones.py` (86)
- `apps/privacy/tests/test_data_subject_cobertura.py` (144)
- `apps/privacy/tests/test_data_subject_limpieza.py` (94)
- `apps/privacy/tests/test_derechos_del_titular_doc.py` (116)
- `apps/privacy/tests/test_retention_settings.py` (41)

**shared**
- `shared/tests/test_fetch_raise.py` (34)

**users**
- `apps/users/tests/test_cuenta_suprimida.py` (71)

## Para la sustentación (cada integrante defiende lo suyo)
Debes poder explicar: (1) qué hace tu bloque y por qué va en este orden, (2) un patrón de diseño y un principio SOLID con un archivo concreto de los de arriba, (3) un antipatrón que corrigieron o que sigue presente y cómo lo cortarían, (4) cómo se versionó (ramas, PR, etiqueta).
> Las referencias `archivo:línea` de la IA son indicios por tamaño y estructura, no pruebas. Léelas tú antes de afirmarlas.

## Checklist de Git (puntos de la rúbrica)
- [ ] Rama `feature/s2-privacidad-grupos` salida de `develop`; commits pequeños en formato Conventional Commits (`feat(...)`, `refactor(...)`, `test(...)`, `docs(...)`).
- [ ] Pull Request a `develop` con la plantilla; revisión de **otro compañero** antes de fusionar (sin autoaprobarse).
- [ ] Al cerrar el sprint queda la etiqueta `v0.2.0` y una línea en `CHANGELOG.md`.
- [ ] El commit inicial y la administración del repo los hace Juan; el trabajo de tu sprint va con tu autoría.
