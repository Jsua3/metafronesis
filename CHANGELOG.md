# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Las versiones `v0.x.0` marcan hitos de integración y tienen etiqueta anotada en Git. Los números `#N` son los PR de GitHub.

## [Sin publicar]

### Pendiente
- Romper el ciclo de dependencias entre `grupos`, `privacy`, `progression`, `security`, `sesiones`, `simulation` y `users`.
- Configurar ruff y ejecutarlo en el CI.
- Retirar las pruebas heredadas del repositorio anterior que buscan archivos que este repositorio no tiene (hoy fallan 80).
- Cubrir tres validaciones del caso detectadas en la revisión del #17: revisión aprobada antes de publicar con `REVIEW_WORKFLOW_STRICT`, rechazo de sugerencias de IA sin revisar y camino desde la escena inicial hasta un final.
- Documentación por app y `docs/api.md`.

## [0.3.0] - 2026-11-10

Ola 1 de la migración del backend.

### Añadido
- Puntos de extensión: cada app declara la auditoría de sus rutas en su `superficie.py` (#13).
- Tiempo estimado de la versión del caso, con migración `0004` (#15).
- Borrador del caso con su ficha, con el patrón Builder (#20).
- Escenas y decisiones con su justificación (#21).
- Validación del caso recorriéndolo como árbol (Composite); enviar a revisión, publicar, archivar y clonar versiones (#17).
- Reporte de participación del grupo en CSV o JSON, con el patrón Adapter (#18).
- Rúbrica y calificación del intento con estrategias intercambiables (#16).
- Resultado final del intento con la retroalimentación (#22).

### Cambiado
- **RN-10:** `POST /decisions` ya no devuelve `feedback` ni `response_class`; las justificaciones se ven en `GET /api/simulation/attempts/<id>/result` cuando el intento termina (#22).
- El proyecto arranca con su configuración principal: se retiraron las apps y rutas que no se migraron (#10) y el CI usa `psychosim.settings.test` (#15).
- Corrección de los antipatrones identificados en el análisis de ADSI (#12).
- Trazabilidad con Jira (#8).
- Pruebas de `users` y de `grupos` con datos propios, sin depender del repositorio anterior (#19, #14).

## [0.2.0] - 2026-11-03

Sprint 4.

### Añadido
- Auditoría, revisión de caso, rúbrica y contratos de la simulación (#6).

## [0.1.0] - 2026-11-03

Base del backend (sprints 1 a 3).

### Añadido
- Fichas de los cuatro sprints (#1).
- Base y autenticación: `psychosim` y `users` (#3).
- Privacidad y grupos (#2).
- Plataforma transversal: respuesta uniforme, permisos, límites y cabeceras (#5).
- API de casos e intentos con acceso por asignaciones y ciclo State, motor mínimo, evaluación y progresión por Observer (#4).
- Biblioteca por API con catálogo externo configurable y validación de rutas (#4).
- Pruebas de concurrencia PostgreSQL en CI (#4).
