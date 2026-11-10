# MetaFrónesis · backend del simulador de psicología social (antes llamado SIEP)

API en Django del simulador de casos situacionales de psicología social: el docente arma, valida y publica casos; el estudiante los resuelve en una sesión a la que fue convocado; el sistema califica con una rúbrica y muestra la retroalimentación al terminar.

**Versión actual:** [`v0.4.0`](https://github.com/Jsua3/metafronesis/releases/tag/v0.4.0) · **Alcance:** solo backend (no hay frontend; el «mundo y juego» queda fuera) · Última revisión de este archivo: 10 de noviembre de 2026.

> **Origen del proyecto:** el desarrollo previo vive en [`Jsua3/psico_project_v2`](https://github.com/Jsua3/psico_project_v2), dentro del cual vive una versión mejorada de lo que fue el ganador a mejor proyecto nuclear de 3.er semestre. Ese repositorio queda como archivo de solo lectura. Este repositorio reorganiza y continúa ese trabajo con el equipo completo.

## Qué incluye

| App | Qué hace |
|---|---|
| `users` | Cuentas y roles (ADMIN, PROFESOR, ESTUDIANTE); ingreso con contraseña, con Google y con el código de la convocatoria; permiso de autoría |
| `grupos` | Grupos, invitaciones y asignación de casos a grupos |
| `privacy` | Consentimiento y clasificación de datos personales |
| `security` | Límites de uso y cabeceras de seguridad |
| `simulation` | Casos, versiones, escenas y decisiones, intentos, rúbricas, calificación y resultado final |
| `progression` | Progresión del estudiante |
| `biblioteca` | Catálogo de materiales por API |
| `autoria` | Borrador del caso con su ficha, escenas y decisiones; exportar e importar en JSON |
| `publicacion` | Validar, enviar a revisión, publicar, archivar y clonar versiones |
| `sesiones` | Sesiones y convocatorias con código, ingreso, repetición excepcional y cierre automático |
| `revision` | Revisión docente: participaciones y retroalimentación general |
| `reportes` | Reporte de participación en CSV o JSON, por grupo y por sesión |
| `notificaciones` | Avisos por correo y por la API |
| `ia` | Asistentes de IA, apagados por defecto y sin datos personales hacia el proveedor |
| `auditoria` | Consulta de auditoría para el ADMIN |
| `shared`, `psychosim` | Respuesta uniforme, políticas de permisos, eventos del dominio e inventario de rutas; configuración y rutas del proyecto |

**Patrones de diseño usados:** Builder (`autoria`), Composite (`publicacion`), Adapter (`reportes`), Strategy (calificación en `simulation` y proveedores en `ia`), State (intentos y sesiones) y Observer (eventos del dominio y notificaciones).

## Estado

| Versión | Contenido |
|---|---|
| [`v0.1.0`](https://github.com/Jsua3/metafronesis/releases/tag/v0.1.0) | Base del backend (sprints 1 a 3): autenticación, plataforma transversal, privacidad y grupos, casos e intentos |
| [`v0.2.0`](https://github.com/Jsua3/metafronesis/releases/tag/v0.2.0) | Sprint 4: auditoría y contratos |
| [`v0.3.0`](https://github.com/Jsua3/metafronesis/releases/tag/v0.3.0) | Ola 1 de la migración: borrador del caso, escenas y decisiones, validar y publicar, reporte de participación, rúbrica, calificación y resultado |
| [`v0.4.0`](https://github.com/Jsua3/metafronesis/releases/tag/v0.4.0) | Ola 2: revisión docente, notificaciones, IA y auditoría, incompletos y tiempo máximo, permiso de autoría, exportar e importar, sesiones y convocatorias, repetición, reporte completo e ingreso con código |

El detalle de cada versión está en [CHANGELOG.md](CHANGELOG.md).

### Pendiente y límites conocidos

- Las apps `grupos`, `privacy`, `progression`, `security`, `sesiones`, `simulation` y `users` siguen formando un ciclo de dependencias; está mitigado con registros y señales, pero no roto.
- No hay linter configurado todavía (ruff).
- Quedan 80 pruebas heredadas del repositorio anterior que buscan archivos que este repositorio no tiene; se retirarán.
- La validación del caso tiene tres huecos conocidos (publicar sin revisión aprobada con `REVIEW_WORKFLOW_STRICT`, sugerencias de IA sin revisar y camino de la escena inicial a un final); están en el seguimiento SIEP-62.
- El ingreso tardío se niega pasada la mitad de la duración de la sesión (`SIEP_INGRESO_TARDIO_FRACCION`, 0,5 por defecto): es un supuesto declarado, por confirmar con la docente.
- La nota es el nivel formativo de 1,00 a 4,00, no una nota de 0 a 5; es una equivalencia declarada.
