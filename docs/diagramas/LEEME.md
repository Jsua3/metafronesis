# Diagramas y documentos de análisis (borradores verificables)

Todo está generado a partir del código real del proyecto original y cada elemento lleva su cita `archivo:línea` en la sección «Evidencia» de su documento. Son **borradores**: cada responsable verifica el suyo contra su código antes de entregarlo.

## Qué hay y quién lo verifica

| Documento | Archivo | Verifica |
|---|---|---|
| Diagrama de clases A (psychosim, users) | `mermaid/clases-A.md` | Emerson |
| Diagrama de clases B (shared, security) | `mermaid/clases-B.md` | Leyton |
| Diagrama de clases C (privacy, grupos) | `mermaid/clases-C.md` | Juan |
| Diagrama de clases D (simulation, progression, biblioteca) | `mermaid/clases-D.md` | Bonilla |
| Diagrama de dominio | `mermaid/dominio.md` | Juan |
| Secuencia: login | `mermaid/secuencia-1-login.md` | Emerson |
| Secuencia: límite de uso | `mermaid/secuencia-2-limite-de-uso.md` | Leyton |
| Secuencia: invitar y asignar | `mermaid/secuencia-3-invitar-y-asignar.md` | Juan |
| Secuencia: intento | `mermaid/secuencia-4-intento.md` | Bonilla |
| Diagrama de estados del intento | `drawio/estados-intento.drawio` | Bonilla |
| Diagrama de actividades | `drawio/actividades.drawio` | Bonilla |
| Diagrama de casos de uso + descripciones | `drawio/casos-de-uso.drawio`, `drawio/casos-de-uso.descripciones.md` | Juan |
| Casos de prueba | `pruebas/casos-de-prueba.md` | S1: Emerson y Leyton; S2: Juan; S3 y S4: Bonilla |
| Negociación y priorización de atributos de calidad | (pendiente) | los cuatro, en una sesión conjunta |

## Cómo abrirlos
- **Mermaid (`.md`):** GitHub los dibuja solos al abrir el archivo en el repo. En local, con la extensión de Mermaid de VS Code o pegando el bloque en https://mermaid.live.
- **draw.io (`.drawio`):** abrir en https://app.diagrams.net (Archivo > Abrir desde > Dispositivo). Exportar a PNG o PDF desde ahí para las presentaciones.

## Cómo verificar el tuyo (15 minutos)
1. Abre el diagrama y compáralo con tu código: ¿están las clases, relaciones o mensajes que esperas? ¿falta algo importante o sobra algo?
2. Abre 3 citas de la sección «Evidencia» y confirma que la línea dice lo que el diagrama afirma.
3. Si corriges algo, hazlo en una rama `docs/...` con PR, para que quede evidencia de Git.
4. Anota en el PR qué verificaste. En la sustentación vas a explicar este diagrama.

## Pendiente de verificar (declarado por el análisis)
Ejecución real del código, rendering visual de los `.drawio` en diagrams.net, y las rutas del simulador que están fuera del corte (se marcan como S3/S4).
