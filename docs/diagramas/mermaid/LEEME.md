# Diagramas Mermaid del corte funcional

Los diagramas son borradores del código incluido en el manifiesto del corte; la raíz de las citas es `src/backend_django`. Los números de línea se refieren a esa copia. Cada bloque identifica su propia evidencia y sus límites.

| Archivo | Contenido | Responsable de revisión |
|---|---|---|
| [clases-A.md](clases-A.md) | Psychosim y users: 6 clases | Emerson |
| [clases-B.md](clases-B.md) | Shared y security: 10 clases | Leyton |
| [clases-C.md](clases-C.md) | Privacy y grupos: 7 clases | Juan |
| [clases-D.md](clases-D.md) | Simulation, progression y biblioteca: 12 clases | Bonilla |
| [dominio.md](dominio.md) | 12 entidades y 18 relaciones ORM | Juan y Bonilla; Emerson para usuario |
| [secuencia-1-login.md](secuencia-1-login.md) | Login: 15 mensajes | Emerson |
| [secuencia-2-limite-de-uso.md](secuencia-2-limite-de-uso.md) | Límite de login: 12 mensajes | Leyton y Emerson |
| [secuencia-3-invitar-y-asignar.md](secuencia-3-invitar-y-asignar.md) | Invitación y asignación: 20 mensajes | Juan |
| [secuencia-4-intento.md](secuencia-4-intento.md) | Inicio, avance, pausa, reanudación y cierre: 25 mensajes | Bonilla |

Abra cada Markdown en GitHub o en un visor Markdown compatible con Mermaid. En un editor sin renderizador, los bloques siguen siendo texto editable. Los scripts de extracción AST y comprobación están en [_scripts](_scripts/); `extraer.py`, `generar_clases.py`, `generar_dominio.py`, `generar_secuencias.py` y `verificar.py` trabajan con la copia y el manifiesto, sin ejecutar la aplicación. El verificador comprueba referencias, pertenencia al corte, cercas, identificadores de participantes, anidamiento básico y conteos; no sustituye un renderizador Mermaid ni comprueba por sí solo la semántica de cada llamada.

## Evidencia

- `psychosim/urls.py:70`, `apps/users/urls.py:13`, `apps/users/views.py:134` — ruta de login.
- `apps/security/throttling.py:25`, `apps/security/limiter.py:59` — límite de uso.
- `psychosim/urls.py:75`, `psychosim/urls.py:89`, `apps/grupos/views.py:94`, `apps/grupos/views.py:160` — invitación y asignación.
- `apps/simulation/services/game_service.py:246`, `apps/simulation/services/game_service.py:526`, `apps/simulation/services/game_service.py:655`, `apps/simulation/services/game_service.py:676` — ciclo del intento.
- `apps/progression/apps.py:15`, `apps/progression/receivers.py:54` — conexión declarada y receptor de finalización.

## Sin verificar

- Revisión por Emerson, Leyton, Juan y Bonilla de las selecciones, relaciones, glosario y orden de cada flujo.
- Renderizado efectivo en GitHub o en otro motor Mermaid: la comprobación realizada es estructural, no un render completo.
- Ejecución de pruebas, funcionamiento integrado, migraciones y composición incremental de los sprints.
- Declaración de señales y rutas/vistas de simulation, ausentes del manifiesto; carga efectiva de los receptores de progression. Las llamadas y conexiones incluidas se muestran con esa reserva.
- Si las omisiones de clases y las cardinalidades adicionales impuestas por constraints satisfacen la finalidad de la revisión. No se afirma composición UML solo por cascada de borrado.
