# La IA coautora del editor de casos — diseño

Fecha: 2026-11-25 · Tarjeta: SIEP-268 · Rama: `docs/SIEP-268-diseno-ia-coautora` · Estado: propuesta para discutir; no entra antes de la sustentación del viernes ni mientras dure el plan de choque de usabilidad.

## 1. Problema

Hoy la IA del editor es un chat (`features/autoria/ia/panel-ia.component.ts`): el docente pide, la IA devuelve hasta 12 cambios (`apps/ia/asistente/esquema.py`, `MAX_CHANGES`), el docente marca cuáles entran y cada parte nueva queda con la marca «sugerido por la IA» hasta que la revisa una por una (`modelo/revision.ts`, contador de pendientes).

Para muchos docentes, sobre todo los que llegan ansiosos a la herramienta, eso se siente:

- **poco profesional**: una lista de cambios sueltos que hay que aprobar casilla por casilla;
- **poco intuitivo**: no se ve *dónde* cayó cada cambio ni *por qué*;
- **poco transparente**: la IA «hace cosas» en bloque y el docente reconstruye después qué pasó.

## 2. Objetivo

Que el docente y la IA **construyan el caso juntos, a la vista**:

1. La IA entiende la idea antes de construir: hace preguntas con opciones.
2. Ambos acuerdan un resumen del caso.
3. La IA construye **escena por escena**, mostrando en vivo con un cursor qué hace, dónde y por qué.
4. El docente aprueba cada escena (o pide un cambio) antes de pasar a la siguiente, y puede editar a mano cuando quiera.
5. Si lo que el docente cambia choca con lo acordado, la IA lo explica y ofrece cómo seguir.

Se conserva lo que hoy da confianza: **la IA nunca escribe nada que el servidor no haya validado** y **un humano responde por todo lo que entra al caso**.

## 3. Lo que ya existe y se reutiliza

| Pieza | Dónde | Para qué sirve aquí |
|---|---|---|
| Generación por etapas (esqueleto → escenas → ensamblar, con reparación) | `apps/ia/generacion/ciclo.py`, `apps/ia/generaciones.py`, `generacion/generacion.service.ts` | Es la columna vertebral del «escena por escena»: se le agrega una parada de aprobación entre escenas. |
| Pantalla de avance con maqueta del caso | `pantallas/avance/` | Base visual del progreso por escenas. |
| Propuestas validadas, vocabulario cerrado, motivos fijos | `apps/ia/asistente/propuestas.py`, `esquema.py`, `ia/propuestas.ts` | Toda salida del modelo se sigue validando contra el caso; el cursor solo reproduce cambios ya validados. |
| Guía con resaltado, foco y recorrido | `guia/guia.service.ts`, `guia/foco-guia.component.ts` | Sabe encontrar un elemento del editor y señalarlo: base del cursor. |
| Probar como estudiante | `ensayo.ts` | «Probar esta escena» antes de aprobarla. |
| Reglas de revisión (hitos inalcanzables, finales sin camino, contraindicadas sin razón, intensidad sin aviso) | `modelo/revision.ts`, `modelo/caminos.ts`, `modelo/hitos.ts` | Detección barata y exacta de choques tras una edición del docente. |
| Historial para deshacer | `estado/historial.ts` | «Deshacer lo que hizo la IA en esta escena». |
| Colocación sin choques | `modelo/trazado.ts` (`posicionLibre`), `modelo/geometria.ts` (`zonaCaminable`), `modelo/choques-mueble.ts` | El trazador que convierte «junto a la ventana» en coordenadas. |
| Temas sensibles | `modelo/temas-sensibles.ts` | Resaltar lo delicado antes de aprobar. |
| Proveedores intercambiables | `apps/ia/proveedores.py` | Sin cambios de fondo; los esquemas se parten por etapa (ver §9). |
| Cupo de ayudas | `apps/ia/asistente/limites.py` | Se pasa de «ayudas por día» a cupo por caso (ver §8). |

## 4. El recorrido completo

```
 Botón «Asistente de IA»
        │
        ▼
 ① Contar la idea (chat) ──► ② Ronda de preguntas ──► ③ Resumen «Lo que acordamos»
                                                         │ ACEPTAR      │ Hacer un cambio
                                                         ▼              └──► vuelve a ③
                                              ④ Esqueleto (escenas, personajes, hitos, finales)
                                                         │
                                 ┌───────────────────────┘
                                 ▼
                ⑤ Escena N: cursor «Escenario» → cursor «Diálogo» → revisión de la escena
                                 │ Aprobar escena │ Pedir un cambio │ Editar a mano
                                 │                └──► rehace la escena
                                 │                                  └──► ⑥ ¿choca con lo acordado?
                                 ▼
                       ¿quedan escenas? ── sí ──► ⑤ (N+1)
                                 │ no
                                 ▼
                ⑦ Finales y evaluación → revisión final → caso listo para enviar a revisión
```

### ① Contar la idea

El chat se abre desde el botón que ya existe. El docente cuenta su idea con poco o mucho detalle. La IA responde con una línea que demuestra que entendió («Entiendo: una primera consulta con una adolescente que no quiere hablar…») y anuncia la ronda de preguntas con su tamaño.

### ② Ronda de preguntas

- Cada pregunta trae **tres opciones** y un **cuadro de texto** para una cuarta propia. Una de las tres viene marcada como **recomendada**, con una línea de por qué.
- Siempre están **«Decide tú»** (la IA elige la recomendada) y **«Saltar las preguntas y usar lo razonable»**.
- **Tope: unas 6 preguntas**, agrupadas por ámbito (historia y objetivo clínico, personajes, lugar, evaluación) y con contador «Pregunta 3 de 6». Solo se pregunta lo que de verdad es ambiguo en lo que contó el docente; lo que ya dijo no se vuelve a preguntar.
- Cada pregunta dice en una línea **por qué la hace** («Esto define cuántas escenas tendrá el caso»).
- El docente puede volver a una pregunta anterior y cambiar su respuesta antes del resumen.

### ③ Resumen «Lo que acordamos»

Una ventana (o la misma columna del chat, según §6) con el caso acordado **en secciones**: objetivo de aprendizaje, paciente y personajes, lugar y salas, escenas previstas (título y propósito de cada una), hitos y competencias, finales, intensidad y temas sensibles.

- Cada sección se puede **corregir en su lugar**.
- Abajo, dos botones: **ACEPTAR** y **Hacer un cambio**. Al pulsar «Hacer un cambio», el botón se convierte en un cuadro de texto donde el docente escribe qué no le gusta y cómo lo quiere; la IA rehace el resumen y lo vuelve a mostrar.
- Muestra una estimación honesta: «6 escenas · unos 8 minutos de construcción».
- Lo aceptado se guarda como **ficha estructurada** (el «contrato» del caso, §7) que se puede consultar en cualquier momento desde el chat («Ver lo que acordamos»).

### ④ Esqueleto

La etapa de esqueleto que ya existe, ahora alimentada por la ficha acordada en vez de un párrafo suelto.

### ⑤ Escena por escena, en vivo

Para cada escena:

1. **La IA piensa.** El modelo genera la escena completa (sala, personajes, diálogo, respuestas A, B, C y D, efectos) y el servidor la valida. Mientras tanto el chat muestra qué está preparando, no una ruleta muda. Con los proveedores lentos esto puede tardar hasta un minuto y medio: la espera es honesta y no se disfraza de animación.
2. **El cursor «Escenario»** reproduce los cambios de la sala: fija si la escena ocurre de día, al atardecer o de noche, lleva el cursor a cada lugar, coloca muebles, objetos y personajes, y en el chat narra qué hace y por qué, ligado a lo acordado («Pongo a Laura cerca de la puerta porque acordamos que quiere irse»).
3. **El cursor «Diálogo»** pasa al guion: escribe las líneas del personaje y las respuestas A, B, C y D con su clase (recomendada, aceptable, contraindicada) y su retroalimentación.
4. **Revisión de la escena.** Un panel muestra la escena terminada con lo delicado resaltado: respuestas contraindicadas y su razón, intensidad alta y su aviso, temas sensibles. Tres caminos:
   - **Aprobar escena** → pasa a la siguiente.
   - **Pedir un cambio** → cuadro de texto; la IA rehace solo esa escena.
   - **Editar a mano** → el docente cambia lo que quiera (mover, borrar, reescribir diálogos); al terminar pulsa «Listo» y entra ⑥.
   - Además: **«Probar esta escena»** la juega como estudiante con las opciones A, B, C y D, y **«Otra versión»** sobre una línea o respuesta ofrece dos alternativas para elegir.

### ⑥ Cuando el docente edita a mano

Al pulsar «Listo» (no en cada tecla):

1. **Reglas fijas primero**, que son baratas y exactas: hitos que quedaron inalcanzables, finales sin camino, escenas sin respuesta recomendada, contraindicadas sin razón (las de `revision.ts`).
2. **Coherencia con lo acordado**, solo si hace falta: se compara la escena editada con la ficha (§7) y, si cambió algo que la ficha fijaba, se le pregunta al modelo qué efecto tiene en la historia y en las escenas que faltan.
3. Si hay choque, la IA lo muestra en un **informe de impacto**: qué punto de lo acordado choca, qué cambiaría en la siguiente escena y en la historia, con enlaces a cada lugar. Tres salidas:
   - **Refínalo tú** → la IA ajusta la edición del docente para que encaje.
   - **Déjalo así** → la ficha se actualiza con la decisión del docente y la IA adapta lo que falta.
   - **Ajusta lo que viene** → se respeta la edición y la IA replantea las escenas siguientes.

Si no hay choque, no se dice nada: la IA no regaña.

### ⑦ Finales y evaluación

Los finales y la evaluación se construyen al final, con el mismo patrón de cursor y aprobación, y el caso pasa a la revisión que ya existe antes de enviarlo.

## 5. El cursor: coreografía, no control remoto

**Decisión:** el cursor **no maneja el editor** (no hace clics reales en la interfaz). La IA produce cambios estructurados que el servidor valida; el editor los **reproduce** paso a paso con un cursor animado.

Por qué:

- Manejar la interfaz de verdad es frágil (se rompe con cada cambio de diseño) y lento.
- La reproducción es exacta: lo que se ve es justo lo que cambió.
- Se puede pausar, acelerar y saltar sin dejar el caso a medias.

Detalles:

- Cursores con etiqueta y color propio: **«IA · Escenario»** y **«IA · Diálogo»**. Se distinguen de la guía por **forma y palabra**, no solo por color, como pide `EDITOR.md` §4.7 para la guía.
- **Uno a la vez** dentro de cada escena, con una línea de tiempo visible («Escenario ✓ · Diálogo en curso · Revisión»). Dos cursores simultáneos en pantallas distintas confunden justo a quien queremos tranquilizar.
- Controles siempre visibles: **Pausar**, **Velocidad** (1×, 2×), **Saltar animación** y **Tomar el control** (detiene a la IA y deja editar).
- **Movimiento reducido**: con `prefers-reduced-motion` no hay vuelo del cursor; los cambios aparecen resaltados uno por uno con su narración.
- **Lectores de pantalla**: cada paso se anuncia en una región `aria-live` con el mismo texto de la narración.
- Mientras el cursor trabaja en un área, esa área queda **bloqueada** para el docente (con aviso) para que no se pisen; «Tomar el control» la libera.

## 6. El chat

- Tres posiciones: **acoplado a la izquierda**, **acoplado a la derecha** o **flotante**. Flotante se arrastra y se pega con imán al borde más cercano; el editor recuerda dónde lo dejó.
- Arrastrar no es la única forma: un menú «Mover a…» permite colocarlo con teclado (WCAG 2.5.7).
- Si el cursor tiene que trabajar debajo del chat flotante, el chat se aparta solo y vuelve después.
- Se puede **minimizar** a una píldora que muestra el estado («Escena 2 de 6 · esperando tu revisión»).

## 7. «Lo que acordamos»: la ficha del caso

Una estructura guardada en el servidor, versionada, que nace en ③ y se actualiza con cada decisión del docente:

| Campo | Ejemplo |
|---|---|
| Objetivo de aprendizaje | Establecer vínculo con un paciente resistente. |
| Personajes | Laura, 15 años, ansiosa; su madre, controladora. |
| Lugar | Consultorio de la universidad: sala de espera y consultorio. |
| Escenas previstas | Título, propósito y hito de cada una. |
| Hitos y competencias | Clave de cada hito y la competencia que evidencia. |
| Finales | Clave, tono y condición prevista. |
| Intensidad y temas sensibles | Intensidad máxima permitida; temas que requieren aviso. |
| Decisiones del docente | Cada «Déjalo así» y cada cambio de ruta, con fecha. |

Sirve para tres cosas: detectar choques (⑥), **retomar** el trabajo otro día exactamente donde quedó y dar a la IA un contexto estable en cada llamada, más corto que el caso entero.

## 8. Responsabilidad humana y trazabilidad

Los casos son clínicos y Psicología aprueba sus textos (VD-23). La marca «un humano revisó lo de la IA» no desaparece; **cambia de granularidad**:

- **Aprobar una escena equivale a revisarla.** Se registra quién, cuándo, qué versión de la escena y qué partes venían de la IA.
- Antes de aprobar, lo delicado se resalta y no se puede pasar por alto: respuestas contraindicadas con su razón, intensidad alta con su aviso, temas sensibles.
- Lo que el docente escribe a mano no lleva marca de IA; lo que la IA reescribe tras «Refínalo tú» vuelve a necesitar aprobación.
- El contador de pendientes deja de contar casillas de IA sueltas y cuenta **escenas sin aprobar**.

**Cupo.** Una ronda de preguntas, el resumen y cada escena son varias llamadas al modelo. Las «ayudas por día» de hoy (`limites.py`) se agotarían en un solo caso. Se propone un **cupo por caso** (por ejemplo, una construcción completa más N rehechuras de escena) además del tope mensual del programa.

## 9. Cambios técnicos

### Servidor (`apps/ia`)

- **Etapa nueva «aclarar»**: recibe la idea y las respuestas previas y devuelve la siguiente pregunta (`pregunta`, `porque`, `opciones[3]`, `recomendada`) o «listo». Con tope de preguntas en el servidor.
- **Etapa nueva «resumir»**: devuelve la ficha (§7) desde la idea y las respuestas; acepta un texto de cambio y devuelve la ficha corregida.
- **Modelo nuevo** para la ficha, versionado, ligado a la generación.
- **Ciclo de generación** (`ciclo.py`): de «escenas de dos en dos» a **una escena por vez con parada** `esperando_aprobacion`; transiciones nuevas `aprobar_escena`, `rehacer_escena` y `evaluar_edicion`. Se respeta el patrón actual: estado, transiciones permitidas y motivos fijos.
- **Vocabulario de operaciones ampliado**: hoy son 10 y no cubren muebles, objetos, piezas del muro (puertas y ventanas) ni editar o borrar líneas y respuestas. Se agregan con el mismo rigor (validación atómica, motivos fijos).
- **Momento del día de cada escena** (día, atardecer, noche): hoy no existe ni en el editor ni en el juego. Se propone como funcionalidad nueva y pequeña: un campo `momento` dentro del `ambient` que ya guarda cada mapa de escena (junto a `backgroundImage`, `encuadre`, `salaId`), que la sala pinta como un tono de luz sobre el fondo, igual en el editor y en el juego. El docente lo cambia a mano desde la sala, la IA lo elige con una operación `set-momento` (vocabulario cerrado) y la ficha acordada lo puede fijar («la crisis ocurre de noche, en la guardia»). Es contexto narrativo, no decoración: una consulta nocturna en urgencias cambia el tono del caso.
- **Ubicación por palabras**: la IA dice *qué* y *dónde* en términos de la sala («junto a la ventana», «al fondo», «cerca de la puerta») y un **trazador determinista** calcula las coordenadas con `posicionLibre`, `zonaCaminable` y los choques de muebles. Los modelos de lenguaje son malos con coordenadas.
- **Esquemas más pequeños, uno por etapa**: NVIDIA ya respondió «The compiled grammar is too large» con el esquema actual (ver el comentario en `esquema.py`). Ampliar el vocabulario en un solo esquema no es viable.
- **Registro de aprobación** por escena (§8) y su lugar en el inventario de privacidad y de superficie.

### Cliente (`features/autoria`)

- `ia/` se reorganiza: chat acoplable o flotante, tarjeta de pregunta con tres opciones y texto libre, ventana de resumen, panel de revisión de escena, informe de impacto.
- **Reproductor de cambios** con cursor (§5): toma la lista validada, navega entre sala y guion, aplica cada cambio al borrador con su paso de historial y narra.
- `generacion/generacion.service.ts`: la máquina de estados del cliente se adapta a la parada por escena.
- `modelo/revision.ts` y el contador de pendientes cuentan escenas sin aprobar (coordinar con quien lleve el contador).

### Lo que no cambia

La validación del servidor sobre todo lo que propone el modelo, los proveedores intercambiables, el borrador y su guardado, y la revisión final antes de enviar.

## 10. Fases

| Fase | Qué entrega | Tamaño | Depende de |
|---|---|---|---|
| 1 | Chat acoplable o flotante, ronda de preguntas (3 opciones + texto libre, «Decide tú», saltar) y resumen «Lo que acordamos» con ACEPTAR / Hacer un cambio | Medio | — |
| 2 | Escena por escena con parada de aprobación; aprobar = revisar; «Probar esta escena»; contador por escenas | Medio-alto | 1 |
| 3 | Cursor coreografiado con narración, pausa, velocidad, saltar, tomar el control y movimiento reducido | Alto (trabajo visual fino) | 2 |
| 4 | Edición a mano con detección de choques e informe de impacto (reglas fijas + coherencia con la ficha) | Alto | 2 |
| 5 | Vocabulario ampliado (muebles, objetos, muro, editar y borrar, momento del día) y ubicación por palabras | Alto | 2; mejora 3 |
| 5a | Momento del día por escena (día, atardecer, noche) en el editor y en el juego, sin IA | Bajo-medio | — (puede ir antes, por su cuenta) |

Cada fase se puede entregar y probar por sí sola. Las fases 3, 4 y 5 pueden ir en paralelo una vez cerrada la 2.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Latencia del modelo (hasta 90 s por llamada con NVIDIA; 150 s para dar una escena por abandonada) | Espera honesta con lo que se está preparando; el cursor solo anima lo ya validado. |
| Fatiga de preguntas | Tope de ~6, «Decide tú», «Saltar», solo lo ambiguo. |
| La IA regaña o interrumpe | Se evalúa al pulsar «Listo», no en cada tecla; sin choque, silencio. |
| El docente y el cursor editan lo mismo | Área bloqueada mientras el cursor trabaja; «Tomar el control». |
| Pérdida de trazabilidad al quitar las casillas | Aprobación por escena registrada y resaltado obligatorio de lo delicado (§8). |
| Cupo agotado a mitad de un caso | Cupo por caso, visible desde el resumen. |
| Esquemas demasiado grandes para el proveedor | Un esquema por etapa. |
| Animación inaccesible | Movimiento reducido, `aria-live`, controles con teclado. |

## 12. Decisiones abiertas

| Pregunta | Propuesta |
|---|---|
| ¿Esto reemplaza «Describe tu caso» para crear casos nuevos, o solo el asistente dentro del editor? | Reemplazar ambos con un solo recorrido: para un caso nuevo arranca en ①; dentro de un caso existente, el chat salta a ⑤ sobre la escena abierta. |
| ¿Psicología y el curso aceptan que aprobar una escena equivalga a revisarla? | Sí, con el resaltado obligatorio de §8. Hay que confirmarlo con Psicología antes de la fase 2. |
| ¿Qué se muestra en la sustentación? | Este documento como hoja de ruta y, si da el tiempo, una maqueta navegable de la fase 1. Nada de código en el editor antes del viernes. |
| ¿Tope exacto de preguntas y cupo por caso? | 6 preguntas; una construcción completa + 5 rehechuras de escena por caso. Ajustar con datos de uso. |

## 13. Fuera de alcance

- Varios cursores trabajando a la vez.
- Que la IA maneje la interfaz con clics reales.
- Lámparas e iluminación por objeto (más allá del momento del día de la escena).
- Voz o dictado en el chat.
- Colaboración de varios docentes en el mismo caso en vivo.
