# Contrato del caso con el juego: cinemática, tutor, guía y acompañantes

Campos **opcionales** que un caso puede traer en `x-siep.escenas[].mapa.ambiente` (llegan al cliente tal cual como `world.map.ambient`) y en los `metadatos` de un objeto `EXIT` (llegan como `metadata`). Un caso que no los trae se juega exactamente como hoy. El reproductor no contiene texto de ningún caso: todo el texto viene de estos campos.

Plantilla común a todos los textos: `{nombre}` se reemplaza por el nombre de pila del estudiante que inició sesión (`AuthService.currentUser().nombre`, primera palabra). Si no hay nombre, se reemplaza por una cadena vacía y se limpian los espacios y comas sobrantes. Vale para cinemática, tutor, guía, líneas y elecciones de diálogo, comentarios, objetivo, texto de opciones y `transitionText`.

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
      "subtitulo": "…",
      "duracionMs": 7000
    }
  ]
}
```

- `escena` es uno de estos valores. Son genéricos y se dibujan con el arte del juego, no con imágenes del caso:
  - `barrio`
  - `casa-ventana` (fachada con ventana; `siluetas` opcional: `hombre`, `mujer`, `nina`; `luzVentana` opcional, booleano)
  - `negro`
  - `calle-emergencia` (de noche, con luces rojas y azules sobre las paredes)
  - `urgencias-llegada` (entrada de urgencias con una camilla que entra)
  - `urgencias-familia` (llegada de tres personas)
  - `titulo` (pantalla de título con el subtítulo grande)
- `momento` vale `tarde` o `noche`.
- Cada plano dura `duracionMs`. El subtítulo debe quedar en pantalla al menos el tiempo de lectura (unas 15 palabras cada 4 s).
- Se reproduce **una vez por intento**, después del consentimiento y antes del tutor.
- Botones: «Saltar» y pausa. Con «movimiento reducido», planos fijos con fundido.

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
- Se muestra **una vez por intento y por sala**. En la sala inicial va después de la cinemática; en las demás, al entrar y antes de la nota de capítulo.
- La salida segura sigue disponible.

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
- `hecho` es un hecho opcional, y el paso se marca hecho (✓) cuando se cumple:
  - `{"talked": claveObjeto}`: la clave está en `flags.viewedNpcKeys`.
  - `{"inspected": claveObjeto}`: la clave está en `inspectedObjectKeys`.
  - `{"has": codigo}`: el código está en `inventory`.
  - `{"used": codigo}`: algún `usedToolKeys` es `codigo` o empieza por `codigo@`.
- `lugar` es la clave de un objeto de la sala. «Ir allí» y el anillo del mapa apuntan al primer paso no hecho que tenga `lugar`.

## 4. `metadatos.acompanantes` en un objeto `EXIT`

```json
{"tipo": "EXIT", "clave": "a-escucha", "metadatos": {"targetNodeKey": "…", "acompanantes": ["abuela", "hermano-mayor", "hermano-menor"]}}
```

- Son claves de objetos `PERSON` de la sala actual.
- Al usar la puerta, si se puede abrir (la misma comprobación de hoy), se bloquea el control del jugador. Los acompañantes caminan en orden hasta la puerta, rodeando los muebles, y desaparecen al cruzarla. La puerta se anima abierta.
- Solo después el jugador cruza (fundido y `enter-room`, como hoy). Si el servidor rechaza la entrada, se recarga el mundo y vuelven a aparecer.
- Con «movimiento reducido», los acompañantes se desvanecen sin caminar.

## 5. Día y noche

Lo da `mapa.estructura.momento` (`dia` o `noche`), como hoy. `ambiente.ambientTone` (`calm`, `clinical`, `warm` o `tense`) tiñe la sala.
