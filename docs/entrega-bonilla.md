# Bonilla: integración local S3 y decisión mínima

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

## Decisión mínima y límites S4

La orden de decisión valida origen y destino en la misma versión, avanza el nodo, acumula duración activa, completa al llegar a un nodo terminal y registra feedback y clase de respuesta como evidencia en el evento. Repetir request_id devuelve la respuesta original; reutilizarlo para otra opción falla. Todo se guarda en una transacción.

Esto NO implementa el motor completo S4: quedan reglas, efectos, segunda oportunidad, evaluación por competencias, progression, biblioteca y catálogo JSON externo. No se acredita el porcentaje global del proyecto por copiar archivos ni por contar pruebas.

## Sustentación

State: attempt_lifecycle concentra capacidades y transiciones. SRP: access decide disponibilidad, attempt_api coordina persistencia, serializers validan entradas y las vistas presentan HTTP. Strategy/Adapter: ai_providers presenta un contrato común a proveedores externos. El registro y la fábrica centralizan construcción; no afirmar Factory Method clásico sin discutir su diferencia con una fábrica simple.

Corrección de acoplamiento: modelos exportan solo el corte mínimo y vocabulary no importa autoría. Antipatrón pendiente: modelos CaseVersion heredados conservan campos de autoría aún no usados por esta API.

Transacciones: inicio bloquea al usuario, órdenes bloquean el intento y la base impone un único intento abierto por estudiante/versión. SQLite verifica restricciones e idempotencia secuencial, pero no demuestra bloqueos concurrentes SELECT FOR UPDATE; esa prueba debe ejecutarse con PostgreSQL antes del despliegue.

Revisor asignado: Juan (@Jsua3). PR hacia develop, sin autoaprobación ni fusión. No crear etiquetas v0.3.0/v0.4.0 antes de aceptación y cierre. Fecha límite pendiente del equipo.
