# Ficha de sprint: D · Núcleo de la simulación

**Responsable:** Esteban Bonilla Giraldo  
**Bloque:** S3 + S4 · caso, intento y motor de decisiones  
**Tamaño:** 2,939 líneas de producción ≈ 10.1% del backend (de 29,073); 45 archivos de prueba.  
**Rama sugerida:** `feature/s3-caso-intento (luego feature/s4-motor-decisiones)` · **Etiqueta:** `v0.3.0 y v0.4.0`

> **Propuesta sin ejecutar.** Es un análisis estático hecho con ayuda de IA sobre el código del proyecto original. Nadie ha corrido `django.setup()`, migraciones ni pruebas sobre este corte; esa verificación es parte de tu sprint.

Es el sprint con menos código copiable (~7,7%) y el que más diseño exige: la IA propone **contratos nuevos** (rutas `/api/cases`, `/api/attempts`, migración inicial acotada de `simulation`) en vez de montar el `game_views.py` actual. Dependes de S1 y S2. Decide con el equipo los contratos de autorización antes de implementar.

## Qué entrega (según el análisis de la IA)

## S3 — Caso, intento y API básica

- **Entrega:** contratos mínimos de caso e intento, persistencia e inicio/consulta de intento; API nueva y pequeña para CRUD/lectura del caso y apertura/consulta del intento. Los módulos `game_views.py` y URLConf actuales reúnen mucha más superficie y quedan fuera: no se montan como atajo.
- **Apps/modelos/endpoints:** `simulation` con `SimulationAttempt` y dependencias de caso/mundo ya registradas en S2; serializers/requests de gameplay y servicios de ciclo/duración/bloqueo/sustitución. Nuevas rutas en el repo nuevo: `GET/POST /api/cases`, `GET /api/cases/{id}`, `POST /api/attempts`, `GET /api/attempts/{id}`; concretar contrato de autorización con la rúbrica antes de implementarlas.
- **Migraciones:** nueva `apps/simulation/migrations/0001_initial.py` **acotada** a caso y dependencias mínimas, más migración de asignaciones de grupos. La fila S3 de 0001 en CSV denota tarea de regeneración; no copiar la 0001 monolítica extraída.
- **Tests asignados:** 37 archivos bajo `apps/simulation/tests` cuyo grafo directo cabe en el corte; comenzar por `test_attempt_duration`, `test_attempt_id`, `test_attempt_lifecycle_contract`, `test_world` y tests de migración seleccionados. El total incluye fixtures/support no ejecutables como tests; no contar archivos como casos.
- **Defensa de diseño:** el ciclo de intento y el guardado transaccional muestran límites del caso de uso; revisar `apps/simulation/services/attempt_lifecycle.py` y `attempt_lock.py`. el análisis de patrones referencia `SimulationAttempt` como dato/relaciones y exige contrastar responsabilidades.
- **Antipatrones:** el paquete `simulation.models.__init__` reexporta mundo/rúbrica, provocando el ciclo modelar descrito en el análisis de ciclos; recortar exports y usar FK por string solo donde proceda. No afirmar que importar serializers/game_dtos basta para cerrar el API: el contrato propuesto se crea como módulo nuevo.

## S4 — Motor de decisiones y evaluación mínima

- **Entrega:** aplicación de reglas/efectos de decisión y evaluación formativa mínima sobre intentos. Es una vertical acotada; autoría avanzada, asistentes IA, reportes, biblioteca, progression y métricas extendidas quedan fuera del 40%.
- **Apps/modelos/endpoints:** `simulation.services.game_service`, `case_rules`, `conditions`, `endings`, `response_effects` y assessment `evaluation`, `definitions`, `evidence`. Añadir una ruta de decisión/evaluación al API S3 solo tras fijar su contrato y permisos. El conteo de las fuentes seleccionadas de S4 incluye 8 módulos productivos, 1.185 LOC, 0 modelos declarados y 0 rutas declaradas en esos archivos.
- **Migraciones:** migraciones aditivas nuevas para los campos mínimos de reglas/efectos y evidencia que requiera el corte. No copiar automáticamente 0008+ del historial; vincular cada columna al modelo realmente incluido. Las migraciones completas quedan tras S3 y respetan la dependencia a su inicial acotada.
- **Tests asignados:** crear tests nuevos de decisión determinista, efectos, reintento idempotente y evaluación con evidencia mínima; no hay tests fuente S4 elegibles tras cerrar el set de producción seleccionado, porque los existentes importan módulos fuera de este corte. No ejecutar suite completa.
- **Defensa de diseño:** `choose_decision` en `game_service.py:526` y `start_attempt` en `:246` son funciones largas candidatas a refactor (el análisis de patrones); se pueden extraer regla pura/selector y persistencia para explicar SRP/OCP como objetivo de diseño. No presentarlas como SOLID cumplido.
- **Antipatrones:** presentes en el legado: métodos extensos y acoplamiento con otros subsistemas; la propuesta corta este sprint antes de autoría/reportes. No se corrigió código fuente en esta tarea.

## Aristas del ciclo que te tocan

1. **S1, auth no debe importar el motor:** cortar `apps/users/services/account_service.py:24 → apps/simulation/services/audit_service.py`. Extraer el contrato `auditable`/emisión de auditoría a `shared/audit.py` o una interfaz `shared/audit_contracts.py`; el motor y `users` dependen del contrato neutral. Si hay datos específicos de gameplay, publicar eventos de dominio y persistirlos en S4.

*(En S3/S4 eliminas cualquier stub temporal de auditoría que S1/S2 hayan dejado y conectas la auditoría real de simulación.)*

## Margen del 40% (añadido en el corte v2)
Para que el avance no baje de 40% con ningún método de conteo, tu S4 suma dos apps pequeñas: `progression` (276 líneas) y `biblioteca` (478). Con ellas el corte llega a 43,3% por líneas y 54,2% por archivos.
- **progression:** migración `0001_initial.py`; registrar `apps.progression.apps.ProgressionConfig`; su `ready()` conecta señales; no tiene URLConf propio. Pruebas: `test_access_decision`, `test_catalog`, `test_completion_hook`, `test_models`.
- **biblioteca:** sin migraciones; montar solo `api/biblioteca/` (`lugares` y `lugares/<str:lugar_id>`); requiere configurar `BIBLIOTECA_DIR` y aportar el catálogo externo en JSON. Pruebas: `test_geometria_encuadres`, `test_lugares`.
- `reportes` queda fuera a propósito: tiene 39 aristas externas y no cierra limpio.

## Ojo
- No copies `0001_initial.py` de simulation tal cual: es monolítica; hay que regenerar una inicial acotada y migraciones aditivas.
- `simulation/models/__init__.py` reexporta mundo y rúbrica y crea un ciclo: recorta las exportaciones.
- S4 trae 8 módulos de producción, 1.185 líneas, 0 modelos y 0 rutas declaradas: la ruta de decisión es nueva y requiere tu contrato de permisos.

## Tus archivos

### Producción (33 archivos, 2939 líneas)

**biblioteca**
- `apps/biblioteca/__init__.py` (0)
- `apps/biblioteca/apps.py` (5)
- `apps/biblioteca/services/__init__.py` (0)
- `apps/biblioteca/services/copiar_al_caso.py` (289)
- `apps/biblioteca/services/geometria.py` (51)
- `apps/biblioteca/services/lugares.py` (89)
- `apps/biblioteca/urls.py` (6)
- `apps/biblioteca/views.py` (16)

**progression**
- `apps/progression/__init__.py` (0)
- `apps/progression/access.py` (112)
- `apps/progression/apps.py` (15)
- `apps/progression/catalog.py` (54)
- `apps/progression/models.py` (21)
- `apps/progression/receivers.py` (43)
- `apps/progression/services.py` (21)

**simulation**
- `apps/simulation/assessment/definitions.py` (40)
- `apps/simulation/assessment/evaluation.py` (94)
- `apps/simulation/assessment/evidence.py` (41)
- `apps/simulation/models/attempt.py` (176)
- `apps/simulation/models/world.py` (191)
- `apps/simulation/serializers/game_dtos.py` (293)
- `apps/simulation/serializers/requests.py` (33)
- `apps/simulation/services/attempt_duration.py` (82)
- `apps/simulation/services/attempt_lifecycle.py` (79)
- `apps/simulation/services/attempt_lock.py` (28)
- `apps/simulation/services/attempt_replacement.py` (33)
- `apps/simulation/services/attempt_survey.py` (81)
- `apps/simulation/services/case_brief.py` (71)
- `apps/simulation/services/case_rules.py` (219)
- `apps/simulation/services/conditions.py` (11)
- `apps/simulation/services/endings.py` (143)
- `apps/simulation/services/game_service.py` (565)
- `apps/simulation/services/response_effects.py` (37)

### Migraciones (9 archivos, 765 líneas)

**grupos**
- `apps/grupos/migrations/0001_initial.py` (49)
- `apps/grupos/migrations/0002_membership_status.py` (38)
- `apps/grupos/migrations/0003_case_assignments.py` (62)
- `apps/grupos/migrations/0004_copy_group_case_versions.py` (45)
- `apps/grupos/migrations/0005_drop_grupo_case_version.py` (11)
- `apps/grupos/migrations/__init__.py` (0)

**progression**
- `apps/progression/migrations/0001_initial.py` (22)
- `apps/progression/migrations/__init__.py` (0)

**simulation**
- `apps/simulation/migrations/0001_initial.py` (538)

### Pruebas (45 archivos, 5875 líneas)

**biblioteca**
- `apps/biblioteca/tests/__init__.py` (0)
- `apps/biblioteca/tests/test_geometria_encuadres.py` (66)
- `apps/biblioteca/tests/test_lugares.py` (135)

**grupos**
- `apps/grupos/tests/test_case_assignments.py` (268)

**progression**
- `apps/progression/tests/__init__.py` (0)
- `apps/progression/tests/test_access_decision.py` (219)
- `apps/progression/tests/test_catalog.py` (98)
- `apps/progression/tests/test_completion_hook.py` (72)
- `apps/progression/tests/test_models.py` (27)

**simulation**
- `apps/simulation/tests/__init__.py` (0)
- `apps/simulation/tests/architecture_baseline.json` (0)
- `apps/simulation/tests/competency_support.py` (21)
- `apps/simulation/tests/dsl_support.py` (96)
- `apps/simulation/tests/fixtures/SIM-VBG-001.v1.dsl.json` (0)
- `apps/simulation/tests/fixtures/assistant/peticiones_dificiles.json` (0)
- `apps/simulation/tests/publication_support.py` (12)
- `apps/simulation/tests/taller_dsl/README.md` (0)
- `apps/simulation/tests/taller_dsl/dsl-casos.schema.json` (0)
- `apps/simulation/tests/taller_dsl/ejemplo-minimo.json` (0)
- `apps/simulation/tests/taller_dsl/simulador_psicologia_social.json` (0)
- `apps/simulation/tests/taller_dsl/validar_dsl.py` (1382)
- `apps/simulation/tests/taller_dsl_driver.py` (27)
- `apps/simulation/tests/test_access_surfaces.py` (199)
- `apps/simulation/tests/test_attempt_access_revalidation.py` (149)
- `apps/simulation/tests/test_attempt_duration.py` (25)
- `apps/simulation/tests/test_attempt_id.py` (16)
- `apps/simulation/tests/test_attempt_lifecycle_contract.py` (263)
- `apps/simulation/tests/test_attempt_owner_only.py` (122)
- `apps/simulation/tests/test_authoring.py` (293)
- `apps/simulation/tests/test_authoring_integrity.py` (380)
- `apps/simulation/tests/test_bitacora_limite_s2_6b.py` (25)
- `apps/simulation/tests/test_concurrency_harness.py` (39)
- `apps/simulation/tests/test_limites_autoria_s2_6b.py` (204)
- `apps/simulation/tests/test_migrations_state.py` (44)
- `apps/simulation/tests/test_openapi_contract.py` (110)
- `apps/simulation/tests/test_policy_matrix_http.py` (262)
- `apps/simulation/tests/test_seed_ambient_npcs.py` (38)
- `apps/simulation/tests/test_seed_load_students.py` (36)
- `apps/simulation/tests/test_server_sizing.py` (24)
- `apps/simulation/tests/test_textos_columna_s2_6b.py` (82)
- `apps/simulation/tests/test_visual_inventory_contract.py` (79)
- `apps/simulation/tests/test_world.py` (323)
- `apps/simulation/tests/test_world_authority.py` (398)
- `apps/simulation/tests/test_world_pure_reads.py` (146)
- `apps/simulation/tests/test_world_save_persistence.py` (195)

## Para la sustentación (cada integrante defiende lo suyo)
Debes poder explicar: (1) qué hace tu bloque y por qué va en este orden, (2) un patrón de diseño y un principio SOLID con un archivo concreto de los de arriba, (3) un antipatrón que corrigieron o que sigue presente y cómo lo cortarían, (4) cómo se versionó (ramas, PR, etiqueta).
> Las referencias `archivo:línea` de la IA son indicios por tamaño y estructura, no pruebas. Léelas tú antes de afirmarlas.

## Checklist de Git (puntos de la rúbrica)
- [ ] Rama `feature/s3-caso-intento (luego feature/s4-motor-decisiones)` salida de `develop`; commits pequeños en formato Conventional Commits (`feat(...)`, `refactor(...)`, `test(...)`, `docs(...)`).
- [ ] Pull Request a `develop` con la plantilla; revisión de **otro compañero** antes de fusionar (sin autoaprobarse).
- [ ] Al cerrar el sprint queda la etiqueta `v0.3.0 y v0.4.0` y una línea en `CHANGELOG.md`.
- [ ] El commit inicial y la administración del repo los hace Juan; el trabajo de tu sprint va con tu autoría.
