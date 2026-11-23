# Kit de personajes SIEP

Todos los personajes del juego salen de este kit: maniquí etiquetado + piezas +
recetas + motor determinista. Spec: `docs/diseno/personajes-unificados.md`.
Esta carpeta es autoría y no se publica; la salida vive en `src/assets/characters/kit/`.

| Qué | Dónde |
|---|---|
| Maniquíes (grillas por vista + rig por cuadro) | `mannequins/complexion-*.mjs`, registro en `mannequins/index.mjs` |
| Bustos de retrato 32×32 | `busts/bust-*.mjs`, registro en `busts/index.mjs` |
| Piezas (pelo, rostro, arriba, capa, abajo, calzado, accesorios) | `pieces/<tipo>/<id>.mjs`, registro en `pieces/index.mjs` |
| Paleta maestra y rampas con nombre | `palette.v2.json`, `ramps.mjs` |
| Recetas (un personaje fijo por archivo) | `recipes/<id>.json` (`_*.json` = borrador, no se publica) |
| Catálogo: claves del juego → receta, opciones del editor y variantes de los jugables (la bata) | `catalog.json` |
| Retoques a mano | `retouch/<id>/<hoja>.png` + `.json` |

El motor es `src/app/features/character/kit/kit-engine.ts` (sin imports: lo usan el
navegador y Node). Los scripts viven en `scripts/character-kit/`.

## Comandos (desde `frontend/`)

| Comando | Para qué |
|---|---|
| `npm run kit:build` | Escribe `kit.json`, las hojas y retratos de cada receta (y de cada variante de jugable, en `<id>/<variante>/`) y `manifest.json`. |
| `npm run kit:check` | Falla si la salida no está al día o rompe el contrato (geometría, paleta, animación, cobertura). Corre en CI. |
| `npm run test:kit` | Pruebas del motor y los scripts. |
| `npm run kit:laminas -- --receta <ids> \| --piezas <claves> \| --elenco \| --maniqui` | Láminas ×4 para revisar y aprobar. |
| `npm run kit:retoque -- <id> <hoja> [--guardar \| --quitar \| --forzar]` | Retoque a mano con LibreSprite o Pixelorama. Exportar no pisa una edición en curso (salvo `--forzar`); las banderas van tras `--`. |

## Cómo lo usa el juego

| Qué | Dónde |
|---|---|
| Formato 2 del avatar y migración desde v1 | `src/app/features/character/kit/avatar-v2.ts` |
| Punto único de resolución (`CharacterRef` → `CharacterVisual`) | `src/app/features/character/kit/character-visual.resolver.ts` |
| Carga de `kit.json` | `src/app/features/character/kit/kit.service.ts` |
| Hojas, animaciones y poses en Phaser | `src/app/features/character/kit/kit-phaser.ts` |
| Sprite o retrato en CSS | `<app-kit-figure>` (`kit-figure.component.ts`) |
| Zoom entero y lienzo en píxeles físicos | `src/app/features/simulator/pixel-scale.util.ts`, `pixel-canvas.ts` |

Las recetas fijas se dibujan con los PNG de `src/assets/characters/kit/`; el avatar personalizado se compone en el navegador con el mismo motor. Un NPC de escenario nombra su receta en el JSON (`recipeId`).

## Retocar a mano

1. `npm run kit:retoque -- valentina idle` exporta `retouch/valentina/idle.edit.png`.
2. Edítalo (solo colores de `palette.v2.json`; magenta `#ff00ff` borra un píxel) y guárdalo.
3. `npm run kit:retoque -- valentina idle --guardar` deja en la capa solo lo que cambió.
4. `npm run kit:build && npm run kit:check`.

Una corrección que deba valer para todos los personajes se hace en la pieza (texto), no en un retoque.
