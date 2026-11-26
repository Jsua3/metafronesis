# Contrato del caso con el juego: cinemática, tutor, guía y acompañantes

Campos **opcionales** que un caso puede traer en `x-siep.escenas[].mapa.ambiente` (llegan al cliente tal cual como `world.map.ambient`) y en los `metadatos` de un objeto `EXIT` (llegan como `metadata`). Un caso que no los trae se juega exactamente como hoy. El reproductor no contiene texto de ningún caso: todo el texto viene de estos campos.

Plantilla común a todos los textos: `{nombre}` se reemplaza por el nombre de pila del estudiante que inició sesión (`AuthService.currentUser().nombre`, primera palabra). Si no hay nombre, se quita la marca junto con las comas y los espacios sobrantes y los pares de exclamación o interrogación que quedan vacíos. Vale para cinemática, tutor, guía, líneas y elecciones de diálogo, comentarios, objetivo, texto de opciones, reacciones y `transitionText`.

## 1. `ambiente.cinematica` (solo en la sala de la escena inicial)

```json
"cinematica": {
  "id": "sim-vbg-002-intro",
  "planos": [
    {
      "escena": "barrio",
      "momento": "tarde",
      "subtitulo": "Viernes, 4 de la tarde. Un barrio donde la violencia no es noticia.",
      "duracionMs": 6500
    },
    {
      "escena": "casa-ventana",
      "momento": "tarde",
      "siluetas": ["hombre", "mujer"],
      "burbujas": [
        { "quien": "hombre", "nombre": "Edwin", "texto": "¡Sin mí no eres nadie!", "grito": true },
        { "quien": "mujer", "texto": "Ya no más, Edwin." }
      ],
      "subtitulo": "…",
      "duracionMs": 7000
    }
  ]
}
```

- `escena` es uno de estos valores. Son genéricos y se dibujan con el arte del juego, no con imágenes del caso:
  - `barrio`
  - `casa-ventana` muestra la fachada con la ventana. Admite `luzVentana` como booleano opcional y `siluetas` con `hombre`, `mujer`, `mujer-telefono` con la mano y el teléfono al oído, o `nina`. Él es una cabeza más alto y se acerca mientras ella retrocede. De noche los vidrios muestran un cuarto en penumbra. Cuando hay un solo adulto, la luz se enciende antes de que entre caminando.
  - `negro` (corte inmediato y silencio durante la agresión, que queda fuera de cuadro).
  - `calle-emergencia` (de noche, con luces rojas y azules sobre las paredes)
  - `urgencias-llegada` (entrada de urgencias con una camilla que entra)
  - `urgencias-familia` (llegada de tres personas)
  - `titulo` (pantalla de título con el subtítulo grande)
- `personas` (opcional) trae las recetas del kit por papel y en orden. En `urgencias-familia` se esperan exactamente tres posiciones. Una lista de otra longitud usa el reparto genérico. En `calle-emergencia` se lee la primera posición para la vecina. Cada posición usa su receta genérica si falta una clave válida (`[a-z0-9-]`) o alguna hoja del kit.
- `burbujas` es opcional. El reproductor muestra una a la vez y usa las primeras cuatro intervenciones válidas en el orden escrito. Se descartan las vacías y las de un hablante que no aparece en el plano.
  - `quien` corresponde a una de las siluetas visibles en la ventana o a una receta de `personas` del plano. `telefono` indica una voz fuera de cuadro y requiere la silueta `mujer-telefono`. Su burbuja apunta a un auricular de píxel junto a esa figura.
  - `texto` admite `{nombre}` y se recorta a 60 caracteres antes de aplicar la plantilla.
  - `grito: true` añade un borde dentado, dos signos de exclamación y trazos de tensión alrededor de la cabeza o del auricular. Si quien grita tiene figura en cuadro, se sacude muy levemente durante menos de 300 ms. Con movimiento reducido los signos quedan quietos.
  - El anuncio del plano para quien usa lector de pantalla incluye el subtítulo y las intervenciones en orden, identificadas por hablante.
    `nombre` es opcional, admite `{nombre}` y da el nombre del hablante al lector de pantalla (por ejemplo «Edwin grita»). Si falta, se anuncia el papel de `quien`.
- `momento` vale `tarde` o `noche`.
- `duracionMs` pide hasta 30 segundos por plano. El tiempo efectivo es el mayor entre lo pedido, la lectura del subtítulo con su margen de aparición y la suma de las lecturas de las burbujas con el tiempo de entrada en cuadro. El subtítulo y las burbujas pueden coincidir. Cada texto tiene 400 ms por palabra, con un mínimo de 3,5 s, después de aplicar la plantilla del nombre.
- Se reproduce **una vez por intento**, después del consentimiento y antes del tutor.
- Los planos avanzan solos. Enter o flecha derecha adelantan y flecha izquierda vuelve al plano anterior. Los botones permiten saltar la cinemática y pausar su reloj. En pausa, navegar muestra entero el subtítulo de destino. Al reanudar, un fundido que quedó en curso sigue desde donde se detuvo. Con movimiento reducido, los planos fijos conservan los fundidos.

## 2. `ambiente.tutor` (en la sala inicial y en la primera sala de cada capítulo)

```json
"tutor": {
  "nombre": "Profesor",
  "rol": "Profesor de psicología · tutor del caso",
  "recipeId": "supervisor-clinico",
  "lineas": ["Hola, {nombre}. …", "…"],
  "pasos": [
    {"numero": 1, "titulo": "Observa", "detalle": "antes de actuar: quién corre riesgo y quién necesita qué."}
  ]
}
```

- El tutor está **fuera de la historia**. Es una capa sobre el mundo, con el retrato del kit (`recipeId`, emoción neutral), su nombre y su rol.
- Las líneas avanzan con Enter, Espacio o clic.
- Si trae `pasos`, la tarjeta muestra la lista numerada junto a la línea que la presenta (la penúltima línea).
- Con movimiento reducido, la tarjeta solo funde su opacidad y los pasos se muestran juntos.
- Se muestra **una vez por intento y por sala**. En la sala inicial va después de la cinemática; en las demás, al entrar y antes de la nota de capítulo.
- La salida segura sigue disponible.
- En la retroalimentación inmediata de cada decisión, una figura compacta muestra el tutor de la sala con su nombre, rol y receta. Si la sala no trae tutor, la respuesta del mundo incluye la identidad del tutor del mapa inicial en `tutorInicial`, incluso al reanudar. Sin tutor en el caso se conserva la voz habitual.

## 3. `ambiente.guia` (en cada sala)

```json
"guia": {
  "paso": 2,
  "titulo": "Contén antes de informar",
  "pasos": [
    {"texto": "Habla con Gloria.", "hecho": {"talked": "abuela"}, "lugar": "abuela"},
    {"texto": "Recoge la guía de primeros auxilios psicológicos.", "hecho": {"has": "PAP"}, "lugar": "kit-pap"},
    {"texto": "Usa los primeros auxilios psicológicos con la familia.", "hecho": {"used": "PAP"}},
    {"texto": "Decide qué responderles a Gloria y al patrullero."}
  ]
}
```

- Reemplaza los pasos calculados de la tarjeta del objetivo (`caso/guia.ts`) cuando existe. Sin `guia`, todo sigue como hoy.
- La pestaña dice «Paso {paso} · {titulo}». El objetivo de la escena (`goal`) sigue arriba.
- `paso: 0` identifica una guía de ambiente, fuera de la numeración del capítulo. Mientras se muestra ese mapa, la ficha usa el título del mapa y el `objetivo` opcional de su guía. Si falta `objetivo`, toma el primer paso escrito de esa sala. Al volver, la ficha recupera el título y el objetivo de la etapa.
- `hecho` es un hecho opcional, y el paso se marca hecho (✓) cuando se cumple:
  - `{"talked": claveObjeto}` se cumple cuando la clave está en `world.viewedNpcKeysHere`, que recoge las conversaciones del nodo actual. Si el campo viene como `[]`, el paso queda pendiente. Si falta, la guía usa las marcas anteriores del intento, incluidas `flags.viewedNpcKeys` y las inspecciones.
  - `{"inspected": claveObjeto}`: la clave está en `inspectedObjectKeys`.
  - `{"has": codigo}`: el código está en `inventory`.
  - `{"used": clave}` consulta `world.usedToolKeysHere` cuando está presente, incluso si es `[]`. Este campo opcional recoge los usos del nodo actual. Si falta, se consulta `world.usedToolKeys` para mantener la compatibilidad con respuestas anteriores.
    - Si `clave` incluye `@` (por ejemplo, `PAP@camilo`), debe coincidir exactamente con uno de los usos.
    - Si `clave` solo lleva el código (por ejemplo, `PAP`), coincide con ese código o con cualquier uso que empiece por `PAP@`.
- `lugar` es la clave de un objeto de la sala. «Ir allí» aparece junto al primer paso pendiente con destino disponible y el contorno lila señala ese mismo destino. Si no se puede resolver ningún destino pendiente, la ficha puede ofrecer una puerta abierta como acción aparte.
- La cuenta solo suma hechos verificados. Una indicación sin `hecho` puede quedar como información cuando se verifica un paso posterior. Los pasos verificables siguen pendientes hasta que se cumpla su propio hecho.

## 4. `metadatos.acompanantes` en un objeto `EXIT`

```json
{"tipo": "EXIT", "clave": "a-escucha", "metadatos": {"targetNodeKey": "…", "acompanantes": ["abuela", "hermano-mayor", "hermano-menor"]}}
```

- Son claves de objetos `PERSON` de la sala actual.
- Al usar la puerta, si se puede abrir (la misma comprobación de hoy), se bloquea el control del jugador. Los acompañantes caminan en orden hasta la puerta, rodeando los muebles, y desaparecen al cruzarla. La puerta se anima abierta.
- Si no se encuentra una ruta libre, el acompañante se desvanece donde está y la transición continúa.
- Solo después el jugador cruza (fundido y `enter-room`, como hoy). Si el servidor rechaza la entrada, se recarga el mundo y vuelven a aparecer.
- Con «movimiento reducido», los acompañantes se desvanecen sin caminar.

## 5. Día y noche

Lo da `mapa.estructura.momento` (`dia` o `noche`), como hoy. `ambiente.ambientTone` (`calm`, `clinical`, `warm` o `tense`) tiñe la sala.

## 6. ambiente.revision (en la sala de la escena terminal)

La revisión la presenta el mismo profesor que acompaña el caso desde fuera de la historia. El campo es opcional y llega en `world.map.ambient.revision` (en SIM-VBG-002, la sala de E21). Se muestra después del epílogo y antes de «Tus decisiones», cuando el intento está `COMPLETED` y su reporte trae los hitos.

- `nombre` y `rol` identifican al profesor. Si falta el nombre se muestra «Profesor».
- `recipeId` es la clave de su receta en el kit. El retrato neutral sale de `/assets/characters/kit/{recipeId}/portrait-neutral.png`. Si falta la receta o no se puede cargar, se lee la identidad del profesor sin el retrato.
- `entrada` abre el repaso y `cierre` contiene la despedida del profesor.
- `capitulos` es la lista ordenada de capítulos. Cada capítulo tiene `titulo` y una lista ordenada de `pasos`.
- Cada paso tiene un `numero` entero entre 1 y 99, un `titulo`, una lista no vacía de `hitos` con las claves requeridas, y dos frases, `logrado` y `pendiente`.
- `{nombre}` se admite en `entrada`, `cierre`, `logrado` y `pendiente`, con la sustitución de la plantilla común.

Un paso está **logrado** si **todos** sus `hitos` están entre las claves cumplidas del reporte final (`milestones.done[].key`). En ese caso se muestra «✓ Lo lograste» y la frase `logrado`. Si falta al menos una clave, se muestra «▸ Para reforzar» y la frase `pendiente`. Un reporte con `done: []` indica que no se cumplió ningún hito.

El cliente omite los pasos inválidos y los capítulos que quedan vacíos. Lee hasta 12 capítulos y 24 pasos por capítulo. Acepta hasta 24 claves de 120 caracteres cada una por paso. Los textos se recortan a 80 caracteres para `nombre`, 140 para `rol`, 120 para los títulos y 900 para las frases.

## 7. Personas en la cama y objetos sobre muebles

En una sala por piezas, `cama` y `mueble` señalan por clave exacta un `PROP` visible de esa sala. La relación requiere un arte de apoyo del catálogo cargado. Si la referencia falta, apunta a otro tipo de entidad o su arte no admite ese apoyo, el cliente usa la presentación y la interacción habituales.

### Persona en la cama

```json
{"tipo": "PERSON", "clave": "laura", "metadatos": {"recipeId": "sobreviviente", "postura": "en-cama", "cama": "cama-recuperacion"}}
```

- La almohada y el pliegue se ajustan al cuadro de cada cama (recuperación del hospital, sencilla y doble de casa). La cabeza usa las primeras 23 filas del primer cuadro de reposo de frente del kit. La cobija cubre el borde del recorte, usa la paleta de la cama y alterna dos cuadros de píxel entero cada 2,5 segundos. Con movimiento reducido se queda en el primero. La iluminación y la sombra de piso vienen de la sala y de la cama.
- La persona permanece acostada durante el paseo del mundo, la conversación, las reacciones y una salida con acompañantes. Conserva su receta y sus retratos. Se dibuja la primera persona con visual disponible que ocupe cada cama. Las referencias restantes conservan su dibujo de pie.
- Sus coordenadas del caso deben quedar cerca de la cama para que el servidor pueda validar la interacción. En pantalla, la cabeza toma la posición de la almohada y el nombre de proximidad queda junto al borde accesible y el contorno sigue la cabeza visible y la cobija.

### Objeto sobre un mueble

```json
{"tipo": "OBJECT", "clave": "informe-hospital", "x": 676, "y": 272, "metadatos": {"apoyo": "sobre", "mueble": "escritorio"}}
```

- `x` e `y` son el punto de contacto con el tablero ya proyectado en la rejilla de la sala. El cliente los redondea al píxel más cercano. La base del dibujo se coloca en ese punto, adelante del mueble y de sus capas de brillo. El objeto conserva la luz de la sala.
- Para situarlo, toma el apoyo del mueble que usa el dibujo. El borde superior del cuadro queda en `yMueble − anclaY`, donde `anclaY` es la segunda coordenada de `apoyo` en el arte o el alto del cuadro. Cada tablero declara en el frontend su intervalo de filas útiles, medido sobre el arte. Una fila `f` del tablero queda en `yMueble − anclaY + f`, a una altura visual de `anclaY − f` píxeles sobre el apoyo de piso. El escritorio de comisaría y el de universidad usan las filas 22 a 28 de su cuadro de 68 px. Con el escritorio de comisaría en `y = 312`, se puede usar `y = 266…272`. El escritorio del hospital usa las filas 7 a 12 de su cuadro de 57 px. En ambos ejes el punto debe caer sobre el tablero, con un margen lateral de cuatro píxeles respecto del arte. Fuera de esas filas o ese ancho se conserva el dibujo de piso.

Al cargar la sala, el cliente toma el primer borde al que puede llegar desde la posición del jugador, probando el frente, los laterales y el fondo de la huella. Ese punto de piso sirve para la cercanía y «Ir a…». El contorno sigue el dibujo sobre el tablero y el rótulo se coloca sin tapar el objeto. El clic o toque puede apuntar al dibujo y la caminata también termina en ese borde. Se conservan la clave del objeto y sus acciones del caso.

## 8. `ambiente.conversaciones` (en cada sala)

```json
"conversaciones": [
  {
    "personas": ["fig-mano", "fig-senora"],
    "lineas": [
      {"quien": "fig-mano", "texto": "¿Usted también lleva rato esperando?"},
      {"quien": "fig-senora", "texto": "Desde las nueve, con mi esposo."}
    ],
    "pausaMs": 9000,
    "modo": "quietos"
  }
]
```

- `personas` contiene dos claves distintas de objetos `PERSON` de la sala. La conversación se omite si falta una persona o queda sin líneas válidas. Cada línea identifica a una de las dos con `quien` y trae un `texto` que admite `{nombre}`.
- En `quietos` las dos personas se miran. En `caminan` siguen la ruta de la primera con separación lateral y rodean los obstáculos. Se usa su `metadatos.movimiento` si trae una ruta o un punto de vuelta. Si falta, se prueban trayectos cortos cerca de su posición. Si el par no cabe o está activo el ajuste de movimiento reducido, se quedan quietas.
- Cada frase aparece durante 400 ms por palabra, con un mínimo de 2,5 s. Las frases siguen el orden escrito y, al acabar la vuelta, esperan `pausaMs` (9000 ms por defecto).
- Las burbujas van sobre quien habla y ceden su sitio a la interfaz, los rótulos y el destino de la guía. Mientras hay diálogo, decisión, reacción, cinemática o tutor en pantalla, se ocultan y se pausa el reloj. La jugadora puede abrir el diálogo propio de cualquier participante como siempre.
