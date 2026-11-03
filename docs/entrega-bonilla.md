# Bonilla: corte funcional S3 y S4

## Ejecutar y verificar

Requiere Python 3.13. Desde la raíz:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python manage_s3.py migrate
.venv/bin/python manage_s3.py check
.venv/bin/python -m pytest -q
.venv/bin/python manage_s3.py runserver
```

`psychosim/settings_s3.py` es una configuración de integración local. Usa SQLite, el usuario real de S1 y sesiones Django con CSRF. Las pruebas HTTP autentican con `force_authenticate`: no prueban login ni emisión de JWT. No es una configuración de despliegue. La configuración definitiva y las rutas de login se deben integrar con S1; no se ha reemplazado su autenticación con acceso anónimo.

## Contrato implementado

| Método | Ruta | Acceso |
|---|---|---|
| GET | /api/cases | Estudiante: casos asignados vigentes y publicados; profesor: propios; administrador: todos |
| POST | /api/cases | Profesor o administrador; campos code, title, description, active |
| GET | /api/cases/{id} | Misma política de lectura |
| POST | /api/attempts | Estudiante con asignación; cuerpo case_version_id |
| GET | /api/attempts/{uuid} | Propietario con acceso vigente |
| POST | /api/attempts/{uuid}/pause | Propietario, IN_PROGRESS a PAUSED |
| POST | /api/attempts/{uuid}/resume | Propietario, PAUSED a IN_PROGRESS |
| POST | /api/attempts/{uuid}/replace | Propietario, intento abierto a REPLACED |
| POST | /api/attempts/{uuid}/decisions | Propietario activo; decision_option_id y request_id |

El inicio devuelve 201; repetirlo devuelve el intento abierto con 200. Sin sesión: 403. Un recurso ajeno o no disponible responde 404. Una transición inválida responde 400. No se devuelve el hash interno del intento.

Una versión accesible exige caso activo, estado PUBLISHED, sello de validación presente y asignación activa en ventana [opens_at, closes_at). La asignación puede ser directa o a grupo activo con membresía ACTIVE. Los permisos se revalidan en cada lectura y orden. Esta es una política conservadora propuesta para revisar con Juan, no un acuerdo ya confirmado por el equipo.

La API crea el registro del caso, no versiones publicadas ni nodos: esas entradas se preparan mediante los modelos y pertenecen a autoría/S2. No hay ruta pública para saltarse publicación o asignaciones.

## Datos y migraciones

Inicial nueva de simulation: SimulationCase, CaseVersion, SimulationNode, DecisionOption, SimulationAttempt y AttemptEvent. Excluye mundo, reportes, encuestas, reflexión y rúbricas del legado. Se regeneró grupos/0001 a partir de sus modelos actuales, para una base nueva. No aplicar esta inicial sobre una base que ya tenga el historial de grupos del paquete; al integrar Juan debe conciliarse su historial sin borrar datos ni migraciones aplicadas.

Los modelos de users y sus cuatro migraciones proceden de la rama S1; grupos y case de la rama S2. Se incluyen como dependencias explícitas para verificar S3 antes de su integración en develop. No son trabajo nuevo de Bonilla. `S3UsersConfig` carga solo el modelo para evitar requerir los checks y servicios compartidos todavía ausentes. Django 5.2 usa CASCADE/SET_NULL en lugar de las constantes DB_CASCADE/DB_SET_NULL del paquete.

## Motor S4 y evaluación mínima

Las reglas de case_rules proceden del paquete y se adaptaron para depender únicamente del vocabulario local. `secondChance` concede un solo reintento por escena ante RISKY o CONTRAINDICATED: el primer evento no avanza ni aplica efectos ni aporta evaluación. Cada orden exige request_id, y su repetición devuelve exactamente la respuesta guardada. Reutilizar una clave para otra opción falla.

`response_effects.apply` es puro: aplica los cambios explícitos de persona (bond y activation, acotados técnicamente a [-2,2]) y acumula hitos sin duplicados. Estos números son estado de simulación y no medidas clínicas. El corte no incorpora el mundo visual ni los valores por defecto del motor legado.

Al llegar a una escena terminal se crea AttemptEvaluation, con versión s4-minimal-1, sello de la versión, conteos, hitos y evidencia por evento. Solo se evalúan competencias explícitamente declaradas: un código sin nivel queda sin evidencia. Entre niveles declarados se conserva el menor; una respuesta contraindicada limita su aporte a EN_PROCESO. Esta política mínima está marcada BORRADOR para revisión docente/Psicología; no constituye una rúbrica completa ni una nota. La evaluación se congela en JSON; editar una opción después no cambia lo ya registrado. El método save impide reescribir una evaluación existente, aunque una actualización SQL directa requeriría controles adicionales.

Los finales propios se evalúan en orden. El subconjunto de condiciones soporta all, any, not, flag y count con eq/gte/lte/gt/lt (profundidad máxima 12); los documentos inválidos no aplican. Si no hay final aplicable, se muestra un cierre neutral, sin inferir un resultado clínico. Autoría avanzada y el resto del DSL original quedan fuera.

La señal attempt_completed implementa Observer: progression registra una finalización única por estudiante/caso en la misma transacción. Un fallo revierte decisión, evaluación y progresión. GET /api/catalog devuelve la secuencia personal; un caso previo no completado y no cerrado bloquea los siguientes. Reanudar un intento existente conserva la política S3 de asignación y ventana vigentes. GET /api/attempts/{uuid}/evaluation devuelve la evaluación al propietario autorizado; antes del cierre responde 404.

## Biblioteca

Se registró biblioteca y se montaron GET /api/biblioteca/lugares y /api/biblioteca/lugares/{id}, solo para PROFESOR/ADMIN autenticados. Las respuestas llevan data; las imágenes se presentan bajo /assets/biblioteca/escenarios/. Los servicios de lectura y geometría proceden del paquete; se adaptaron permisos y errores para cerrar imports. Se rechazan IDs inválidos, rutas de arte absolutas/traversal y enlaces que salgan del catálogo. Un archivo ausente o ilegible devuelve 503 sin revelar rutas locales.

El zip completo aporta 196 archivos del catálogo en biblioteca/escenarios/: índice, casa, comisaría y universidad con sus JSON e imágenes. Se copiaron sin modificaciones. BIBLIOTECA_DIR usa BASE_DIR / "biblioteca" por defecto. Los tests prueban tanto archivos temporales como los tres lugares reales y comprueban la existencia de las imágenes referenciadas. La copia visual al caso se excluye porque depende de los modelos y servicios de autoría/mundo fuera del corte mínimo.

## Verificación y pendientes de integración

Las pruebas locales cubren permisos, ventanas, sesión y CSRF, transiciones, segunda oportunidad, efectos, evidencia, evaluación congelada, rollback transaccional, desbloqueo secuencial, biblioteca y geometría. CI ejecuta el corte con PostgreSQL e incluye dos pruebas de inicios/decisiones concurrentes. Las omisiones locales se identifican: UUID7 requiere Python 3.14 y los bloqueos concurrentes requieren PostgreSQL.

Antes de declarar el 40% global: integrar con S1/S2, conciliar el historial de grupos, confirmar los contratos con Juan. La cantidad de pruebas o archivos de este PR no demuestra por sí sola el porcentaje del backend. No fusionar ni etiquetar por cuenta propia.

## Sustentación

State: attempt_lifecycle concentra capacidades y transiciones. SRP: access decide disponibilidad, attempt_api coordina persistencia, serializers validan entradas y las vistas presentan HTTP. Strategy/Adapter: ai_providers presenta un contrato común a proveedores externos. El registro y la fábrica centralizan construcción; no afirmar Factory Method clásico sin discutir su diferencia con una fábrica simple.

Corrección de acoplamiento: modelos exportan solo el corte mínimo y vocabulary no importa autoría. Antipatrón pendiente: modelos CaseVersion heredados conservan campos de autoría aún no usados por esta API.

Transacciones: inicio bloquea al usuario, órdenes bloquean el intento y la base impone un único intento abierto por estudiante/versión. SQLite verifica restricciones e idempotencia secuencial. Las pruebas SELECT FOR UPDATE se ejecutan con PostgreSQL en CI; registrar su resultado antes de integrar.

Revisor asignado: Juan (@Jsua3). PR hacia develop, sin autoaprobación ni fusión. No crear etiquetas v0.3.0/v0.4.0 antes de aceptación y cierre. Fecha límite pendiente del equipo.

## Actualización del catálogo completo

Verificación ejecutada con el catálogo del zip: `.venv/bin/python -m pytest apps/biblioteca/tests -q`: **19 passed**. Suite local completa: **88 passed, 3 skipped** (dos pruebas requieren PostgreSQL y una UUID7/Python 3.14). `manage_s3.py check`: sin errores.

El PR #4 permanece en borrador. Orden de integración: PR #3 (Emerson), PR #2 (Juan), PR #4 (Bonilla). No se trae develop ni se retiran users, grupos o los archivos de integración S3 hasta que Esteban lo pida expresamente. Las 26 dependencias opcionales del zip no se copiaron.
