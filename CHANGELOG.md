# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Las versiones `v0.x.0` marcan hitos de integración y tienen etiqueta anotada en Git. Los números `#N` son los PR de GitHub.

## [Sin publicar]

### Pendiente
- Romper el ciclo de dependencias entre `grupos`, `privacy`, `progression`, `security`, `sesiones`, `simulation` y `users`.
- Configurar ruff y ejecutarlo en el CI.
- Retirar las pruebas heredadas del repositorio anterior que buscan archivos que este repositorio no tiene (hoy fallan 80).
- Cubrir tres validaciones del caso detectadas en la revisión del #17: revisión aprobada antes de publicar con `REVIEW_WORKFLOW_STRICT`, rechazo de sugerencias de IA sin revisar y camino desde la escena inicial hasta un final.
- Documentación por app y `docs/api.md`.
- Job de CI para el frontend: hoy el workflow no corre `ng test` ni `npm run build` (por eso el #70 entró con una prueba en rojo, corregida en el #71).
- Agregar `apps/ia/tests` a la lista de pruebas del workflow.
- Pruebas e2e del juego y del editor.
- Probar en el navegador, con el servidor real, el ensayo, el asistente de autoría, la generación con IA y el caso insignia.
- El editor ofrece «Probar» en un caso publicado y el servidor responde 409: solo se ensayan borradores.
- Que mover una pieza en el editor se vea al instante: hoy la sala se rearma entera (ya sin parpadeo, desde el #75).

## [0.6.1] - 2026-11-23

Las salas por piezas del repositorio anterior, con su luz, el editor sin parpadeo y el proveedor de IA de NVIDIA.

### Añadido
- **Salas por piezas:** los casos nuevos, creados a mano o con la IA, copian cada sala de la biblioteca con su estructura completa (pisos, muros, puertas, ventanas, muebles, lámparas y el momento del día), y el juego y el editor la dibujan con las piezas y su luz: de día por las ventanas y de noche con la luna y las lámparas (#74).
- **Lugar hospital** en la biblioteca, que solo existe por piezas; el caso insignia ya lo encuentra (#74).
- La compuerta de publicación revisa dónde va cada pieza de una sala por piezas (#74).
- **Proveedor de IA de NVIDIA** (`AI_AUTHORING_PROVIDER=nvidia`): con `nvidia/nemotron-3-ultra-550b-a55b` el asistente de autoría propone en unos 17 s y guía en unos 3 s. La generación de casos todavía no pasa las reglas del documento con los modelos de NVIDIA (#79).

### Corregido
- Mover un personaje, un objeto, una ventana o una puerta en el editor ya no deja la sala en negro unos segundos (#75).

## [0.6.0] - 2026-11-23

Ola 3: el mundo por salas, el editor de casos completo, la IA de autoría y el frontend del estudiante y del docente. Con esta versión queda migrado todo lo del repositorio anterior.

### Añadido
- **Mundo de la simulación por salas** (SIEP-234):
  - modelos del mundo, leerlo, moverse y cruzar puertas (#47, #48);
  - pistas, interacciones, herramientas, reacciones y `expectedAttemptId`; bitácora, salida segura e informe del estudiante (#51, #53, integradas con #54).
- **Estado completo del intento** y consecuencia en las decisiones para el juego (#57).
- **Caso insignia SIM-VBG-002:** se carga y queda publicado con `python manage.py cargar_caso_insignia --minutos-estimados 45`, solo en desarrollo (#64).
- **Rúbricas, competencias y valoración docente** (#50).
- **Panel docente, reporte del grupo y reporte del estudiante** (#60).
- **Backend del editor de casos:** salas, mundo, diálogos, reglas y sugerencias de la IA (#55).
- **Ensayo del borrador:** la autora juega su caso en borrador en el mundo real del juego, con el panel del ensayo (opciones, comentarios, lo explorado y elegir escena) y por las rutas normales del juego (#58, #66).
- **IA de autoría**, apagada por defecto:
  - generación de casos por etapas (#62);
  - asistente que propone cambios validados contra el caso y guía por el editor, con cupo diario y mensual (#67).
- **Imagen única y despliegue en Google Cloud Run** (#52).
- **Frontend del estudiante:** inicio, casos, ficha, juego por salas, cierre del caso y personaje (#59).
- **Frontend del docente y de la administración:** inicios propios, rúbricas, revisión formativa, casos asignados y reportes (#56).
- **Frontend del editor de casos** (#61), conectado a la generación con IA (#65), al ensayo y al asistente (#68).
- **Tutorial guiado de creación de casos** sobre el editor, con la tarjeta «Aprende a crear un caso» en Casos; sus textos están en borrador, pendientes de Psicología (#70).
- **Sonidos y música ambiental propios del simulador** (#63).

### Corregido
- Clasificar una respuesta en el guion ya no deja el editor en negro, y la pestaña Evaluación se desplaza con la rueda (#69).
- El contrato «ninguna pantalla usa HttpClient directamente» vuelve a pasar (#71).

## [0.5.0] - 2026-11-22

Frontend de la primera ola y licencia.

### Añadido
- Frontend en `frontend/` (Angular 22): portada, acceso, cambio de contraseña, administración de usuarios y solicitudes de acceso, grupos con estudiantes, invitaciones e importación desde Excel, buzón de invitaciones del estudiante y páginas de error, conectado a la API de esta versión (#43).
- Licencia MIT, con los cuatro integrantes como titulares (#44).

## [0.4.0] - 2026-11-10

Entrega del backend: ola 2 de la migración.

### Añadido
- Revisión docente: consultar las participaciones de los grupos propios y registrar la retroalimentación general (#23).
- Eventos del dominio (patrón Observer) y notificaciones por correo y por la API (#24, #28).
- Asistentes de IA con el patrón Strategy, apagados por defecto y sin datos personales hacia el proveedor, y auditoría para el ADMIN (#31).
- Estado `INCOMPLETE`, nota parcial, cero para los ausentes y tiempo máximo del intento (#26).
- Volver a responder una escena, progreso y consultas del estudiante (#32).
- Permiso de autoría: un PROFESOR crea o edita casos solo si el ADMIN se lo otorga (#27).
- Exportar e importar casos en JSON (#30).
- Sesiones y convocatorias con código, con el patrón State, e ingreso tardío a la mitad de la duración, configurable con `SIEP_INGRESO_TARDIO_FRACCION` (#34).
- Repetición excepcional autorizada por el creador del caso y cierre automático de sesiones vencidas (#35).
- Ingreso del estudiante con el código de la convocatoria (#37).
- Reporte completo con ausentes, incompletos y por sesión (#36).
- Clasificación de datos personales de las columnas y tablas nuevas (#29).
- Semilla de demostración (#33) y lugares de registro de las apps de esta ola (#25).

### Cambiado
- La prueba del tamaño máximo reconoce la ruta de importación de casos (#38).
- Migración sobre una tabla existente: el estado `INCOMPLETE` del intento (#26).

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

[Sin publicar]: https://github.com/Jsua3/metafronesis/compare/v0.5.0...develop
[0.5.0]: https://github.com/Jsua3/metafronesis/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Jsua3/metafronesis/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Jsua3/metafronesis/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Jsua3/metafronesis/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Jsua3/metafronesis/releases/tag/v0.1.0
