# Entrega inicial de Bonilla — pendiente de integración S3

Esta entrega es preparatoria y no acredita el backend al 40% ni cierra S3 o S4.

## Código verificado

`apps/simulation/services/ai_providers.py`: contrato abstracto AIProvider, registro de estrategias y adaptadores HTTP. No depende de Django ni de otros sprints. El transporte se sustituye en las pruebas; no se hacen llamadas reales ni se requieren claves.

Verificación: `.venv/bin/python -m pytest apps/simulation/tests/test_ai_provider_lsp_contract.py -q`: 31 pruebas aprobadas.

Para repetir: crear un entorno con `python3 -m venv .venv`, instalar `requirements-dev.txt` y ejecutar el comando anterior.

## Pendientes necesarios para S3

Al preparar esta entrega, develop contiene documentación pero no el proyecto Django. Esperar integración de S1 y S2: configuración, usuario, caso, grupos y contratos shared/audit.py y shared/identity.py. No sustituir autorización con permisos abiertos.

Después: importar y adaptar SimulationAttempt y servicios de ciclo, duración, bloqueo y sustitución; acordar permisos de casos e intentos con Juan; implementar GET/POST /api/cases, GET /api/cases/{id}, POST /api/attempts y GET /api/attempts/{id}; generar migración inicial acotada; verificar arranque, migraciones y pruebas de acceso, propiedad y ciclo. La migración monolítica del paquete no se ha importado.

S4 queda pendiente: motor, evaluación, progression y biblioteca requieren modelos y módulos ausentes. Los diagramas del paquete describen el legado completo y no se publican como evidencia del código integrado.

## Sustentación

Strategy: PROVIDERS permite seleccionar una implementación del contrato AIProvider. Adapter: cada proveedor traduce el contrato común al formato HTTP de su API. La función create_provider centraliza la construcción; se puede defender como fábrica simple. Liskov: las 31 pruebas comprueban respuestas, errores y ausencia de estado para las implementaciones registradas. Esto no demuestra el funcionamiento del backend Django.

Revisión asignada: Juan (@Jsua3). No fusionar ni etiquetar v0.3.0 hasta completar S3 y obtener revisión cruzada. Fecha límite pendiente de confirmar con el equipo.
