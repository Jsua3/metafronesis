# Arte del mundo a escala 1 (F8)

Los muebles, las puertas y los objetos recogibles del juego se dibujan a **escala 1**, con el
tamaño exacto de su PNG y a la misma densidad de píxel que los personajes del kit: el cuerpo de
64 px representa 1,65 m, así que el mundo va a **39 px/m** (decisión 12 del spec de personajes
unificados, §13.1).

| Qué | Dónde |
|---|---|
| Tabla de tamaños (fuente única) | `frontend/src/app/features/simulator/world-scale.util.ts` → `WORLD_SPRITES` |
| Originales archivados (el arte de antes de la F8) | `frontend/world-art/originals/{furniture,doors,objects}/` |
| PNG que carga el juego (generados) | `frontend/src/assets/game/{furniture,doors,objects}/` |
| Inventario del arte | `frontend/src/assets/visual/v1/inventory.v1.json` (el build sincroniza `expectedDimensions`) |
| Láminas de revisión | `docs/visual/world-art/` |

## Comandos (desde `frontend/`)

- `npm run world-art:build` — reescala cada original al tamaño de la tabla (recorta al cuerpo
  opaco, toma el color dominante por área, da ventaja al contorno oscuro y deja el alfa binario)
  y sincroniza el inventario. Lee solo los originales: repetirlo no acumula pérdida. También valida
  `biblioteca/manifiesto.json` (el arte de lugares, modelos y existentes animados no pasa por
  `WORLD_SPRITES`) y copia sus PNG a `src/assets/biblioteca/` (`/assets/biblioteca/...` en el juego).
- `npm run world-art:laminas` — láminas de revisión: cada pieza a ×3 junto a Valentina, con el
  original al lado.
- `npm run test:world-art` — el contrato: tamaños, alfa binario, recorte, a lo sumo 40 colores,
  ningún PNG huérfano, que cada PNG sea exactamente la salida del build a partir de su original
  (un original cambiado sin correr `world-art:build`, o una salida retocada a mano, falla),
  inventario honesto y código sin escalas fraccionarias. Del manifiesto de la biblioteca comprueba que
  cada entrada exista, mida lo que dice (hoja = cuadros × ancho), tenga alfa binario y a lo sumo 40
  colores, que ningún PNG de arte quede sin listar y que la copia de `src/assets/biblioteca` sea idéntica.

## Cambiar un tamaño

1. Edita la fila en `WORLD_SPRITES` y su caso en `world-scale.util.spec.ts`.
2. `npm run world-art:build` y `npm run world-art:laminas`; mira las láminas.
3. Si cambias el alto de una puerta, revisa dónde queda su aviso (`doorHintY`).

## Cambiar el arte

Los originales de muebles y puertas salen de los pipelines de `tools/furniture-assets/` y
`tools/door-assets/`; los iconos recogibles (herramientas y objetos de escenario) son PNG de
64×64 que ya estaban en el repo (commits `99ce3d0` y `f68d6db`) y no tienen pipeline propio. Un
original nuevo reemplaza al archivo de `world-art/originals/` y se corre el build. No se retoca a
mano la salida, porque el build la pisaría: si hace falta un retoque, se hace sobre el original.
