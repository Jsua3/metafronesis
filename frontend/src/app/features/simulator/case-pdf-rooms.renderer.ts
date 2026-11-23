// Solo tipos: el import se elide en runtime (los specs corren sin canvas).
import type Phaser from 'phaser';
import { DEPTH, actorDepth } from './depth-sort.util';
import { caseRoomKind } from './case-pdf-rooms.geometry';
import { ellipseC, frameC, rectC } from './graphics-primitives.util';
import {
  PREMIUM_RENDERER_LAYERS,
  SceneRenderer,
  SceneRendererOptions,
  SceneRenderMetadata,
  ScenePoint,
  SceneRect,
} from './scene-layer.types';
import { FurnitureKey, resolveFurnitureTextureKey } from './furniture-sprite.util';
import { furniturePlacement, staleSpriteSize, worldSprite } from './world-scale.util';

/**
 * Salas del caso PDF «Violencia Familiar y Tentativa de Feminicidio».
 *
 * Cuatro salas visualmente distintas con el MISMO lenguaje premium pixel-art
 * 2.5D de la sala clínica (perspectiva, capas, sombras de contacto, luz):
 *
 *   hospital-urgencias      → frío clínico, triage, camilla, acceso restringido
 *   hospital-sala-escucha   → cálida y privada: sofá, mesa, luz baja
 *   comisaria-recepcion     → institucional: mostrador, archivadores, cartel
 *   comisaria-consultorio   → reservada: escritorio, expediente, derechos
 *
 * Pinta SOLO arte. La geometría jugable vive en case-pdf-rooms.geometry.ts
 * (espejo del seed backend): si se mueve un mueble aquí, hay que moverlo allá.
 */

// ── Líneas maestras compartidas (misma perspectiva que la sala premium) ───────
const GEO = {
  roomLeft: 58,
  roomRight: 902,
  backWallTopY: 76,
  wallFloorSeamY: 220,
  floorFrontY: 490,
  floorBackLeftX: 144,
  floorBackRightX: 816,
  floorFrontLeftX: 84,
  floorFrontRightX: 876,
} as const;

export const CASE_ROOM_BOUNDS = { width: 960, height: 528 } as const;
export const CASE_FLOOR_BOUNDS: SceneRect = { x: 96, y: 236, width: 768, height: 250 };

/** Paleta por sala: pared/piso/acentos — cada sala se lee distinta de un vistazo. */
interface RoomPalette {
  backdrop: number;
  wallBack: number;
  wallBackDark: number;
  wallSeam: number;
  wallLeft: number;
  wallRight: number;
  wallEdge: number;
  baseboard: number;
  floorA: number;
  floorB: number;
  floorSeam: number;
  accent: number;
  lightColor: number;
  lightAlpha: number;
}

const PALETTES: Record<string, RoomPalette> = {
  'hospital-urgencias': {
    backdrop: 0x080d16, wallBack: 0x1d3142, wallBackDark: 0x18293a, wallSeam: 0x142331,
    wallLeft: 0x16242f, wallRight: 0x131f2c, wallEdge: 0x2e4d62, baseboard: 0x0e1820,
    floorA: 0x3e5666, floorB: 0x3a505f, floorSeam: 0x2b3d4a,
    accent: 0x65d4c8, lightColor: 0xbfe6ff, lightAlpha: 0.07,
  },
  'hospital-sala-escucha': {
    backdrop: 0x0c0a14, wallBack: 0x3a2c44, wallBackDark: 0x322539, wallSeam: 0x2a1f30,
    wallLeft: 0x2d2236, wallRight: 0x281e30, wallEdge: 0x564060, baseboard: 0x191019,
    floorA: 0x5c4a52, floorB: 0x56454d, floorSeam: 0x44363d,
    accent: 0xe8b46a, lightColor: 0xffd28a, lightAlpha: 0.10,
  },
  'comisaria-recepcion': {
    backdrop: 0x090c12, wallBack: 0x2a3344, wallBackDark: 0x232b3a, wallSeam: 0x1c2330,
    wallLeft: 0x202734, wallRight: 0x1c222e, wallEdge: 0x42506a, baseboard: 0x12161e,
    floorA: 0x4d5260, floorB: 0x484d5a, floorSeam: 0x383d48,
    accent: 0x7fa8e0, lightColor: 0xdfe8ff, lightAlpha: 0.06,
  },
  'comisaria-consultorio': {
    backdrop: 0x0a0d0c, wallBack: 0x293a34, wallBackDark: 0x22302b, wallSeam: 0x1b2723,
    wallLeft: 0x1f2b27, wallRight: 0x1b2622, wallEdge: 0x3e584f, baseboard: 0x101714,
    floorA: 0x55483c, floorB: 0x4f4338, floorSeam: 0x3d342c,
    accent: 0x9ad08f, lightColor: 0xffe2ae, lightAlpha: 0.08,
  },
};

const SHADOW = 0x05070d;
const PAPER = 0xd8d4c7;
const WOOD_TOP = 0x9a6240;
const WOOD_MID = 0x6f432c;
const WOOD_DARK = 0x5a3525;
const OUTLINE = 0x2e1c12;

// ── Metadata pura (testeable sin canvas) ──────────────────────────────────────

const FOCUS_POINTS: Record<string, Record<string, ScenePoint>> = {
  'hospital-urgencias': {
    triage: { x: 490, y: 300 },
    familia: { x: 190, y: 408 },
    quirofano: { x: 660, y: 280 },
    puerta: { x: 838, y: 440 },
  },
  'hospital-sala-escucha': {
    sofa: { x: 195, y: 360 },
    protocolos: { x: 660, y: 310 },
    profesional: { x: 740, y: 390 },
    puerta: { x: 838, y: 440 },
  },
  'comisaria-recepcion': {
    mostrador: { x: 490, y: 320 },
    expediente: { x: 740, y: 310 },
    puerta: { x: 838, y: 440 },
  },
  'comisaria-consultorio': {
    escritorio: { x: 530, y: 330 },
    sobreviviente: { x: 220, y: 400 },
    derechos: { x: 790, y: 310 },
    puerta: { x: 122, y: 460 },
  },
};

export function caseRoomMetadata(kind: string): SceneRenderMetadata {
  return {
    bounds: { ...CASE_ROOM_BOUNDS },
    floorBounds: { ...CASE_FLOOR_BOUNDS },
    focusPoints: FOCUS_POINTS[kind] ?? {},
    occlusionZones: [],
    paintedLayers: PREMIUM_RENDERER_LAYERS,
  };
}

// ── Helpers de dibujo (mismo idioma que la sala premium) ──────────────────────

// rectC, frameC y ellipseC (coordenadas centradas) viven en graphics-primitives.util.ts.

function contactShadow(g: Phaser.GameObjects.Graphics, cx: number, cy: number,
                       w: number, h: number, alpha = 0.3): void {
  ellipseC(g, cx, cy, w, h, SHADOW, alpha * 0.55);
  ellipseC(g, cx, cy, w * 0.68, h * 0.68, SHADOW, alpha);
}

/**
 * Dibuja un mueble como sprite pixel-art a ESCALA 1 (spec §13.1, decisión 12), o devuelve `false`
 * si no hay textura (→ el `paintX` cae a su cuerpo vectorial).
 *
 * El PNG mide lo que dice WORLD_SPRITES: aquí no hay escala que calcular. Conserva la sombra de
 * contacto y la profundidad `actorDepth(feetY)` que usaba el vector, así el mueble queda asentado
 * y ordenado igual respecto al jugador. Un PNG viejo en la caché del navegador (otro tamaño que
 * el de la tabla) se fuerza al tamaño de la tabla en vez de dibujarse enorme.
 */
function paintFurnitureSprite(
  scene: Phaser.Scene, key: FurnitureKey, cx: number, feetY: number, shadowAlpha = 0.3,
): boolean {
  const texKey = resolveFurnitureTextureKey(key);
  if (!texKey || !scene.textures.exists(texKey)) return false;
  const place = furniturePlacement(key, cx, feetY);
  const depth = actorDepth(feetY);
  const g = scene.add.graphics().setDepth(depth);
  contactShadow(g, place.shadow.x, place.shadow.y, place.shadow.width, place.shadow.height, shadowAlpha);
  const image = scene.add.image(place.image.x, place.image.y, texKey).setOrigin(0, 1).setDepth(depth);
  const stale = staleSpriteSize(worldSprite('furniture', key), image.width, image.height);
  if (stale) image.setDisplaySize(stale.width, stale.height);
  return true;
}

// ── Estructura compartida: paredes + piso en perspectiva ──────────────────────

function paintShell(scene: Phaser.Scene, options: SceneRendererOptions, pal: RoomPalette): void {
  const { roomLeft, roomRight, backWallTopY, wallFloorSeamY, floorFrontY,
          floorBackLeftX, floorBackRightX, floorFrontLeftX, floorFrontRightX } = GEO;
  const g = scene.add.graphics().setDepth(DEPTH.BACKGROUND);

  g.fillStyle(pal.backdrop, 1);
  g.fillRect(0, 0, options.width, options.height);

  g.fillStyle(pal.wallBack, 1);
  g.fillRect(roomLeft, backWallTopY, roomRight - roomLeft, wallFloorSeamY - backWallTopY);
  g.fillStyle(pal.wallBackDark, 1);
  g.fillRect(roomLeft, 168, roomRight - roomLeft, wallFloorSeamY - 168);
  g.lineStyle(2, pal.wallEdge, 0.5);
  g.lineBetween(roomLeft, 168, roomRight, 168);

  g.fillStyle(SHADOW, 0.22);
  g.fillRect(roomLeft, backWallTopY, roomRight - roomLeft, 14);

  g.lineStyle(2, pal.wallSeam, 0.45);
  for (let x = 240; x <= 840; x += 80) g.lineBetween(x, backWallTopY + 14, x, 166);

  g.fillStyle(pal.wallLeft, 1);
  g.fillTriangle(roomLeft, backWallTopY, roomLeft, floorFrontY, floorBackLeftX, wallFloorSeamY);
  g.fillStyle(pal.wallRight, 1);
  g.fillTriangle(roomRight, backWallTopY, roomRight, floorFrontY, floorBackRightX, wallFloorSeamY);
  g.lineStyle(2, pal.wallEdge, 0.55);
  g.lineBetween(roomLeft, backWallTopY, floorBackLeftX, wallFloorSeamY);
  g.lineBetween(roomRight, backWallTopY, floorBackRightX, wallFloorSeamY);

  // Piso en bandas con perspectiva.
  const fg = scene.add.graphics().setDepth(DEPTH.GRID);
  const span = floorFrontY - wallFloorSeamY;
  const leftAt = (y: number) =>
    floorBackLeftX + (floorFrontLeftX - floorBackLeftX) * ((y - wallFloorSeamY) / span);
  const rightAt = (y: number) =>
    floorBackRightX + (floorFrontRightX - floorBackRightX) * ((y - wallFloorSeamY) / span);
  const rowHeights = [18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
  let y: number = wallFloorSeamY;
  rowHeights.forEach((h, i) => {
    const y2 = Math.min(y + h, floorFrontY);
    fg.fillStyle(i % 2 === 0 ? pal.floorA : pal.floorB, 1);
    fg.beginPath();
    fg.moveTo(leftAt(y), y);
    fg.lineTo(rightAt(y), y);
    fg.lineTo(rightAt(y2), y2);
    fg.lineTo(leftAt(y2), y2);
    fg.closePath();
    fg.fillPath();
    fg.lineStyle(2, pal.floorSeam, 0.55);
    fg.lineBetween(leftAt(y2), y2, rightAt(y2), y2);
    y = y2;
  });
  const scaleFront = (floorFrontRightX - floorFrontLeftX) / (floorBackRightX - floorBackLeftX);
  fg.lineStyle(2, pal.floorSeam, 0.4);
  for (let bx = 240; bx <= 720; bx += 96) {
    const fx = 480 + (bx - 480) * scaleFront;
    fg.lineBetween(bx, wallFloorSeamY, fx, floorFrontY);
  }
  fg.fillStyle(SHADOW, 0.3);
  fg.fillRect(floorBackLeftX, wallFloorSeamY, floorBackRightX - floorBackLeftX, 4);

  // Zócalo (arista pared/piso).
  const base = scene.add.graphics().setDepth(DEPTH.GRID + 1);
  base.lineStyle(4, pal.baseboard, 0.95);
  base.lineBetween(floorBackLeftX, wallFloorSeamY, floorBackRightX, wallFloorSeamY);
  base.lineStyle(3, pal.baseboard, 0.8);
  base.lineBetween(roomLeft + 26, floorFrontY, floorBackLeftX, wallFloorSeamY);
  base.lineBetween(roomRight - 26, floorFrontY, floorBackRightX, wallFloorSeamY);
}

/** Pools de luz + viñeta (estático — respeta reduced motion por diseño). */
function paintLighting(scene: Phaser.Scene, pal: RoomPalette, pools: readonly ScenePoint[]): void {
  const g = scene.add.graphics().setDepth(DEPTH.LIGHTING_FLOOR);
  for (const pool of pools) {
    ellipseC(g, pool.x, pool.y, 300, 120, pal.lightColor, pal.lightAlpha);
    ellipseC(g, pool.x, pool.y, 180, 70, pal.lightColor, pal.lightAlpha * 0.8);
  }
  // Viñeta sutil en las esquinas.
  g.fillStyle(SHADOW, 0.20);
  g.fillRect(0, 0, 130, 528);
  g.fillRect(830, 0, 130, 528);
  g.fillStyle(SHADOW, 0.16);
  g.fillRect(0, 0, 960, 60);
  g.fillRect(0, 488, 960, 40);
}

// ── Muebles compartidos ───────────────────────────────────────────────────────

/** Mostrador institucional (triage/recepción): frente con panel y tapa clara. */
function paintCounter(scene: Phaser.Scene, cx: number, cy: number, w: number,
                      front: number, top: number, accent: number): void {
  if (paintFurnitureSprite(scene, 'counter', cx, cy + 32, 0.3)) return;
  const g = scene.add.graphics().setDepth(actorDepth(cy + 30));
  contactShadow(g, cx, cy + 32, w + 24, 22, 0.3);
  rectC(g, cx, cy + 12, w, 44, front);                       // frente
  frameC(g, cx, cy + 12, w, 44, OUTLINE, 0.7);
  rectC(g, cx, cy - 12, w + 12, 12, top);                    // tapa
  rectC(g, cx, cy - 17, w + 12, 3, 0xffffff, 0.12);          // brillo de tapa
  rectC(g, cx, cy + 12, w - 16, 4, accent, 0.5);             // franja
  // Objetos de mostrador: bandeja + papeles.
  rectC(g, cx - w / 4, cy - 22, 26, 8, PAPER, 0.9);
  rectC(g, cx + w / 4, cy - 22, 18, 7, 0xb8d4e8, 0.85);
}

/** Fila de sillas de espera unidas (3 asientos). */
function paintWaitingChairs(scene: Phaser.Scene, cx: number, cy: number, color: number): void {
  if (paintFurnitureSprite(scene, 'waiting_chairs', cx, cy + 22, 0.26)) return;
  const g = scene.add.graphics().setDepth(actorDepth(cy + 18));
  contactShadow(g, cx, cy + 22, 160, 16, 0.26);
  rectC(g, cx, cy + 16, 150, 5, 0x222733);                   // riel
  for (const dx of [-50, 0, 50]) {
    rectC(g, cx + dx, cy - 8, 38, 18, color);                // respaldo
    rectC(g, cx + dx, cy + 6, 40, 12, color);                // asiento
    frameC(g, cx + dx, cy + 6, 40, 12, 0x10141c, 0.8, 1);
    rectC(g, cx + dx, cy - 14, 38, 3, 0xffffff, 0.10);
  }
}

/** Archivadores metálicos (2 módulos con cajones). */
function paintFileCabinets(scene: Phaser.Scene, cx: number, cy: number, w: number): void {
  if (paintFurnitureSprite(scene, 'file_cabinet', cx, cy + 32, 0.28)) return;
  const g = scene.add.graphics().setDepth(actorDepth(cy + 20));
  contactShadow(g, cx, cy + 26, w + 16, 16, 0.28);
  for (const side of [-w / 4 - 2, w / 4 + 2]) {
    const mx = cx + side;
    rectC(g, mx, cy, w / 2 - 6, 64, 0x47526a);
    frameC(g, mx, cy, w / 2 - 6, 64, 0x1a2030, 0.9);
    for (const dy of [-20, -2, 16]) {
      rectC(g, mx, cy + dy, w / 2 - 16, 12, 0x525e78);
      rectC(g, mx, cy + dy, 14, 3, 0xc9d4e8, 0.8);           // tirador
    }
  }
}

/** Planta de piso (maceta + follaje en racimos). */
function paintPlant(scene: Phaser.Scene, x: number, y: number, s = 1): void {
  if (paintFurnitureSprite(scene, 'plant', x, y + 18 * s, 0.3)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 16 * s));
  contactShadow(g, x, y + 18 * s, 44 * s, 12 * s, 0.3);
  rectC(g, x, y + 8 * s, 26 * s, 18 * s, 0x3a4152);
  rectC(g, x, y - 1 * s, 30 * s, 5 * s, 0x4a5366);
  for (const [dx, dy, r] of [[-8, -22, 13], [8, -26, 14], [0, -38, 12], [-14, -32, 9], [14, -34, 9]]) {
    ellipseC(g, x + dx * s, y + dy * s, r * 2 * s, r * 1.7 * s, 0x2f5f35);
    ellipseC(g, x + dx * s - 2, y + dy * s - 3, r * s, r * 0.8 * s, 0x57a05e, 0.7);
  }
}

/** Escritorio de madera (consultorio/atención). */
function paintDesk(scene: Phaser.Scene, x: number, y: number, w: number): void {
  if (paintFurnitureSprite(scene, 'desk', x, y + 42, 0.32)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 40));
  contactShadow(g, x, y + 42, w + 60, 24, 0.32);
  for (const side of [-w / 2 + 30, w / 2 - 30]) {
    rectC(g, x + side, y + 24, 50, 34, WOOD_DARK);
    frameC(g, x + side, y + 24, 50, 34, OUTLINE, 0.85);
    for (const dy of [-7, 5]) {
      rectC(g, x + side, y + 24 + dy, 38, 8, WOOD_MID);
      rectC(g, x + side, y + 24 + dy, 9, 2, 0xc9a06a);
    }
  }
  rectC(g, x, y, w + 24, 16, WOOD_TOP);                      // tablero
  rectC(g, x, y - 7, w + 24, 3, 0xb87c50);
  frameC(g, x, y, w + 24, 16, OUTLINE, 0.9);
  // Expediente + lámpara pequeña sobre el tablero.
  rectC(g, x - w / 4, y - 14, 30, 10, PAPER);
  rectC(g, x - w / 4, y - 14, 30, 2, 0xb8a888);
  rectC(g, x + w / 4, y - 16, 5, 14, 0x2c3550);
  ellipseC(g, x + w / 4, y - 24, 16, 8, 0xffd28a, 0.85);
}

/** Silla individual simple frente al escritorio. */
function paintChair(scene: Phaser.Scene, x: number, y: number, color: number): void {
  if (paintFurnitureSprite(scene, 'chair', x, y + 14, 0.24)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 12));
  contactShadow(g, x, y + 14, 40, 10, 0.24);
  rectC(g, x, y + 4, 36, 10, color);                         // asiento
  rectC(g, x, y - 10, 34, 16, color);                        // respaldo
  frameC(g, x, y - 10, 34, 16, 0x10141c, 0.8, 1);
  rectC(g, x, y - 17, 34, 3, 0xffffff, 0.10);
}

/** Sofá de escucha (mismo idioma que la sala premium, tono cálido). */
function paintSofa(scene: Phaser.Scene, x: number, y: number): void {
  if (paintFurnitureSprite(scene, 'sofa', x, y + 40, 0.3)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 36));
  contactShadow(g, x, y + 40, 150, 22, 0.3);
  rectC(g, x, y - 6, 130, 30, 0x6a4250);                     // respaldo
  rectC(g, x, y - 18, 130, 6, 0x7c5260);
  rectC(g, x, y + 16, 122, 26, 0x7c5260);                    // asiento
  rectC(g, x, y + 8, 122, 4, 0x8f6372, 0.9);
  for (const side of [-62, 62]) {
    rectC(g, x + side, y + 6, 16, 40, 0x5c3845);             // brazos
    rectC(g, x + side, y - 12, 16, 6, 0x6a4250);
  }
  rectC(g, x - 30, y + 2, 26, 18, 0xe8b46a, 0.9);            // cojín cálido
  rectC(g, x + 30, y + 2, 26, 18, 0x9a7ab0, 0.9);
  rectC(g, x, y + 32, 122, 8, 0x4a2d38);                     // falda
}

/** Mesa de centro pequeña. */
function paintCoffeeTable(scene: Phaser.Scene, x: number, y: number): void {
  if (paintFurnitureSprite(scene, 'coffee_table', x, y + 16, 0.26)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 14));
  contactShadow(g, x, y + 16, 100, 14, 0.26);
  rectC(g, x, y, 90, 12, WOOD_TOP);
  rectC(g, x, y - 5, 90, 2, 0xb87c50);
  frameC(g, x, y, 90, 12, OUTLINE, 0.85);
  for (const side of [-36, 36]) rectC(g, x + side, y + 12, 6, 14, WOOD_DARK);
  rectC(g, x - 16, y - 9, 20, 7, PAPER);                     // pañuelos/folleto
  ellipseC(g, x + 22, y - 8, 12, 7, 0x7fb3d5, 0.9);          // vaso de agua
}

/** Camilla hospitalaria con sábana y baranda. */
function paintGurney(scene: Phaser.Scene, x: number, y: number): void {
  if (paintFurnitureSprite(scene, 'gurney', x, y + 28, 0.28)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 24));
  contactShadow(g, x, y + 28, 120, 16, 0.28);
  for (const side of [-44, 44]) rectC(g, x + side, y + 18, 8, 22, 0x3a4152);
  rectC(g, x, y, 110, 26, 0xc9d4e0);                         // colchón/sábana
  rectC(g, x, y - 10, 110, 6, 0xdde6ee);
  frameC(g, x, y, 110, 26, 0x2b3d4a, 0.9);
  rectC(g, x - 38, y - 14, 28, 10, 0xaebccc);                // almohada
  g.lineStyle(3, 0x8fa3b8, 0.9);                             // baranda
  g.lineBetween(x - 55, y - 18, x + 55, y - 18);
}

/** Estante bajo de protocolos (sala de escucha). */
function paintLowCabinet(scene: Phaser.Scene, x: number, y: number, w: number, accent: number): void {
  if (paintFurnitureSprite(scene, 'shelf', x, y + 24, 0.26)) return;
  const g = scene.add.graphics().setDepth(actorDepth(y + 18));
  contactShadow(g, x, y + 24, w + 14, 14, 0.26);
  rectC(g, x, y, w, 48, 0x4a3a2c);
  frameC(g, x, y, w, 48, OUTLINE, 0.9);
  rectC(g, x, y - 21, w, 6, 0x5e4a38);
  // Carpetas de protocolos sobre la tapa.
  for (const [dx, color] of [[-w / 4, 0x7f3f3f], [-w / 4 + 14, 0x3f5f92], [-w / 4 + 28, 0x3d6b4f]] as const) {
    rectC(g, x + dx, y - 32, 10, 18, color);
  }
  rectC(g, x + w / 4, y - 30, 30, 12, PAPER);                // guía abierta
  rectC(g, x, y + 6, w - 14, 3, accent, 0.4);
}

// ── Decoración de pared por sala ──────────────────────────────────────────────

function paintWindowCool(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  rectC(g, cx, cy, 128, 72, 0x141021);
  rectC(g, cx, cy, 116, 60, 0x1d2a4a);
  rectC(g, cx, cy - 16, 116, 24, 0x243456);
  ellipseC(g, cx + 34, cy - 18, 10, 10, 0x9fb4ff, 0.5);
  for (let i = 0; i < 5; i++) rectC(g, cx, cy - 22 + i * 12, 116, 6, 0x3a3158);
  rectC(g, cx, cy, 4, 60, 0x141021);
  rectC(g, cx, cy + 40, 136, 8, 0x2c2548);
}

function paintWindowWarm(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  rectC(g, cx, cy, 110, 64, 0x1f1410);
  rectC(g, cx, cy, 98, 52, 0x241a2e);
  rectC(g, cx, cy - 14, 98, 20, 0x2e2240);
  // Cortinas cálidas a los lados.
  rectC(g, cx - 56, cy, 18, 70, 0x8a5a4a);
  rectC(g, cx + 56, cy, 18, 70, 0x8a5a4a);
  rectC(g, cx - 56, cy, 6, 70, 0xa06a56, 0.7);
  rectC(g, cx + 56, cy, 6, 70, 0xa06a56, 0.7);
  rectC(g, cx, cy + 36, 124, 7, 0x33241c);
}

/** Puerta de quirófano con señal de acceso restringido (urgencias). */
function paintRestrictedDoor(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics,
                             cx: number, cy: number): void {
  rectC(g, cx, cy, 92, 110, 0x16242f);
  frameC(g, cx, cy, 92, 110, 0x2e4d62, 0.9);
  rectC(g, cx - 22, cy, 38, 96, 0x24414f);                   // hoja izquierda
  rectC(g, cx + 22, cy, 38, 96, 0x24414f);                   // hoja derecha
  rectC(g, cx - 22, cy - 18, 24, 18, 0x9fc4d8, 0.5);         // ventanillas
  rectC(g, cx + 22, cy - 18, 24, 18, 0x9fc4d8, 0.5);
  rectC(g, cx, cy - 64, 96, 16, 0x7f2f38);                   // banda señal
  scene.add.text(cx, cy - 64, 'QUIRÓFANO · ACCESO RESTRINGIDO', {
    fontFamily: 'monospace', fontSize: '7px', color: '#ffd9dc', align: 'center',
  }).setOrigin(0.5).setDepth(DEPTH.ENVIRONMENT);
}

/** Cruz de salud + señalética discreta (urgencias). */
function paintHealthSign(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  rectC(g, cx, cy, 34, 34, 0x10312e);
  frameC(g, cx, cy, 34, 34, 0x65d4c8, 0.6);
  rectC(g, cx, cy, 8, 22, 0x65d4c8, 0.9);
  rectC(g, cx, cy, 22, 8, 0x65d4c8, 0.9);
}

/** Cartel institucional de la comisaría (discreto). */
function paintInstitutionalSign(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics,
                                cx: number, cy: number): void {
  rectC(g, cx, cy, 230, 34, 0x18202e, 0.95);
  frameC(g, cx, cy, 230, 34, 0x7fa8e0, 0.35);
  ellipseC(g, cx - 96, cy, 18, 18, 0x7fa8e0, 0.5);           // escudo estilizado
  ellipseC(g, cx - 96, cy, 10, 12, 0xdfe8ff, 0.5);
  scene.add.text(cx + 10, cy, 'COMISARÍA DE FAMILIA\nRESTABLECIMIENTO DE DERECHOS', {
    fontFamily: 'monospace', fontSize: '8px', color: '#bcd0f0', align: 'center',
  }).setOrigin(0.5).setAlpha(0.85).setDepth(DEPTH.ENVIRONMENT);
}

/** Afiche de derechos (consultorio). */
function paintRightsPoster(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics,
                           cx: number, cy: number): void {
  rectC(g, cx, cy, 84, 76, 0x213429);
  frameC(g, cx, cy, 84, 76, 0x9ad08f, 0.45);
  ellipseC(g, cx, cy - 16, 24, 24, 0x9ad08f, 0.5);
  rectC(g, cx, cy - 16, 10, 14, 0x213429);
  scene.add.text(cx, cy + 16, 'TUS DERECHOS\nTE PROTEGEN', {
    fontFamily: 'monospace', fontSize: '7px', color: '#cdeac4', align: 'center',
  }).setOrigin(0.5).setAlpha(0.85).setDepth(DEPTH.ENVIRONMENT);
}

/** Cuadro sereno (sala de escucha). */
function paintCalmArt(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  rectC(g, cx, cy, 70, 54, 0x241a10);
  rectC(g, cx, cy, 60, 44, 0x2e2240);
  ellipseC(g, cx - 10, cy + 6, 34, 14, 0x564070, 0.8);       // colinas
  ellipseC(g, cx + 16, cy + 10, 28, 12, 0x6a4f86, 0.8);
  ellipseC(g, cx + 12, cy - 10, 9, 9, 0xe8b46a, 0.9);        // sol cálido
}

/** Reloj de pared compartido. */
function paintClock(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  ellipseC(g, cx, cy, 18, 18, 0x241a10);
  ellipseC(g, cx, cy, 14, 14, PAPER);
  g.lineStyle(2, 0x241a10, 1);
  g.lineBetween(cx, cy, cx, cy - 5);
  g.lineBetween(cx, cy, cx + 4, cy + 1);
}

// ── Render por sala (Template Method) ─────────────────────────────────────────

/**
 * Una sala del caso. `render` es el método plantilla: fija el orden de las capas (cascarón →
 * pared → piso → muebles → luz → metadata) y cada sala aporta sus pasos. Las capas que se pintan
 * después quedan por encima de las anteriores, así que el orden es parte del arte: no se cambia
 * en una subclase.
 */
export abstract class CaseRoom {
  /** Clave de la sala (`hospital-urgencias`…): elige la paleta, la metadata y el renderer. */
  abstract readonly kind: string;
  /** Centros de los pozos de luz del suelo. */
  protected abstract readonly lightPools: readonly ScenePoint[];

  render(scene: Phaser.Scene, options: SceneRendererOptions): SceneRenderMetadata {
    const palette = PALETTES[this.kind];
    paintShell(scene, options, palette);
    const wall = scene.add.graphics().setDepth(DEPTH.ENVIRONMENT);
    this.paintWall(scene, wall, palette);
    this.paintFloor(scene, palette);
    this.paintFurniture(scene, palette);
    paintLighting(scene, palette, this.lightPools);
    return caseRoomMetadata(this.kind);
  }

  /** Decoración de la pared (ventana, cartel, reloj…) sobre el gráfico `wall` ya creado. */
  protected abstract paintWall(scene: Phaser.Scene, wall: Phaser.GameObjects.Graphics, palette: RoomPalette): void;

  /** Gancho: lo que va sobre el piso y bajo los muebles (una alfombra). Por defecto, nada. */
  protected paintFloor(_scene: Phaser.Scene, _palette: RoomPalette): void { /* sin decoración de piso */ }

  /** Muebles, anclados a `CASE_ROOM_FURNITURE[kind]` (la huella de colisión vive en la geometría). */
  protected abstract paintFurniture(scene: Phaser.Scene, palette: RoomPalette): void;
}

class UrgenciasRoom extends CaseRoom {
  readonly kind = 'hospital-urgencias';
  protected readonly lightPools = [{ x: 480, y: 320 }, { x: 760, y: 360 }];

  protected paintWall(scene: Phaser.Scene, wall: Phaser.GameObjects.Graphics): void {
    paintWindowCool(wall, 170, 118);
    paintHealthSign(wall, 280, 120);
    paintRestrictedDoor(scene, wall, 660, 150);
    paintClock(wall, 480, 110);
    scene.add.text(395, 156, 'TRIAGE', {
      fontFamily: 'monospace', fontSize: '9px', color: '#9fd4cc',
    }).setOrigin(0.5).setAlpha(0.8).setDepth(DEPTH.ENVIRONMENT);
  }

  protected paintFurniture(scene: Phaser.Scene, pal: RoomPalette): void {
    paintCounter(scene, 490, 268, 220, 0x24414f, 0x9fc4d8, pal.accent);
    paintWaitingChairs(scene, 195, 318, 0x2e4d62);
    paintGurney(scene, 755, 312);
    paintPlant(scene, 822, 388, 1.05);
  }
}

class SalaEscuchaRoom extends CaseRoom {
  readonly kind = 'hospital-sala-escucha';
  protected readonly lightPools = [{ x: 250, y: 380 }, { x: 700, y: 350 }];

  protected paintWall(_scene: Phaser.Scene, wall: Phaser.GameObjects.Graphics): void {
    paintWindowWarm(wall, 200, 122);
    paintCalmArt(wall, 480, 126);
    paintClock(wall, 700, 110);
  }

  /** Alfombra cálida bajo el área de escucha. */
  protected override paintFloor(scene: Phaser.Scene, pal: RoomPalette): void {
    const rug = scene.add.graphics().setDepth(DEPTH.GRID + 1);
    rectC(rug, 250, 396, 250, 110, 0x4a3340, 0.95);
    rectC(rug, 250, 396, 234, 96, 0x553a48, 1);
    frameC(rug, 250, 396, 216, 80, pal.accent, 0.25, 1);
  }

  protected paintFurniture(scene: Phaser.Scene, pal: RoomPalette): void {
    paintSofa(scene, 195, 322);
    paintCoffeeTable(scene, 325, 384);
    paintLowCabinet(scene, 675, 270, 150, pal.accent);
    paintChair(scene, 708, 340, 0x6a4250);
    // Lámpara de pie cálida (esquina derecha).
    const lamp = scene.add.graphics().setDepth(actorDepth(420));
    contactShadow(lamp, 826, 424, 30, 9, 0.25);
    rectC(lamp, 826, 400, 4, 46, 0x33241c);
    ellipseC(lamp, 826, 372, 30, 18, 0xe8b46a, 0.9);
    ellipseC(lamp, 826, 372, 44, 28, 0xffd28a, 0.18);
  }
}

class RecepcionRoom extends CaseRoom {
  readonly kind = 'comisaria-recepcion';
  protected readonly lightPools = [{ x: 480, y: 330 }, { x: 200, y: 380 }];

  protected paintWall(scene: Phaser.Scene, wall: Phaser.GameObjects.Graphics): void {
    paintInstitutionalSign(scene, wall, 480, 120);
    paintWindowCool(wall, 180, 122);
    paintClock(wall, 760, 108);
    // Tablón de avisos institucional.
    rectC(wall, 700, 160, 64, 44, 0x241a10);
    rectC(wall, 700, 160, 56, 36, 0x8a93a8);
    for (const [nx, ny] of [[-14, -8], [6, -10], [16, 4], [-6, 8]] as const) {
      rectC(wall, 700 + nx, 160 + ny, 13, 11, PAPER);
    }
  }

  protected paintFurniture(scene: Phaser.Scene, pal: RoomPalette): void {
    paintCounter(scene, 490, 268, 220, 0x303a4e, 0x8a93a8, pal.accent);
    paintFileCabinets(scene, 765, 266, 130);
    paintWaitingChairs(scene, 195, 318, 0x3a4458);
  }
}

class ConsultorioRoom extends CaseRoom {
  readonly kind = 'comisaria-consultorio';
  protected readonly lightPools = [{ x: 520, y: 340 }, { x: 220, y: 400 }];

  protected paintWall(scene: Phaser.Scene, wall: Phaser.GameObjects.Graphics): void {
    paintRightsPoster(scene, wall, 250, 128);
    paintClock(wall, 480, 108);
    // Diploma + repisa con carpetas.
    rectC(wall, 600, 124, 56, 40, 0x241a10);
    rectC(wall, 600, 124, 46, 30, PAPER);
    rectC(wall, 600, 130, 30, 2, 0x8a93a8);
    rectC(wall, 740, 150, 110, 6, 0x4a3a2c);
    for (const [dx, color] of [[-30, 0x7f3f3f], [-12, 0x3f5f92], [6, 0x3d6b4f], [24, 0xa87934]] as const) {
      rectC(wall, 740 + dx, 138, 11, 18, color);
    }
  }

  protected paintFurniture(scene: Phaser.Scene): void {
    paintDesk(scene, 530, 290, 180);
    paintFileCabinets(scene, 805, 268, 90);
    paintChair(scene, 402, 360, 0x3e584f);
    paintChair(scene, 582, 360, 0x3e584f);
    paintPlant(scene, 132, 388, 1.1);
  }
}

// ── Renderers registrables ────────────────────────────────────────────────────

const ROOMS: Record<string, CaseRoom> = {
  'hospital-urgencias': new UrgenciasRoom(),
  'hospital-sala-escucha': new SalaEscuchaRoom(),
  'comisaria-recepcion': new RecepcionRoom(),
  'comisaria-consultorio': new ConsultorioRoom(),
};

function makeRenderer(kind: string): SceneRenderer {
  return {
    key: `case-pdf-${kind}`,
    supports: mapKey => caseRoomKind(mapKey) === kind,
    render: (scene, options) => ROOMS[kind].render(scene, options),
  };
}

export const hospitalUrgenciasRenderer = makeRenderer('hospital-urgencias');
export const hospitalSalaEscuchaRenderer = makeRenderer('hospital-sala-escucha');
export const comisariaRecepcionRenderer = makeRenderer('comisaria-recepcion');
export const comisariaConsultorioRenderer = makeRenderer('comisaria-consultorio');

export const CASE_PDF_ROOM_RENDERERS: readonly SceneRenderer[] = [
  hospitalUrgenciasRenderer,
  hospitalSalaEscuchaRenderer,
  comisariaRecepcionRenderer,
  comisariaConsultorioRenderer,
];
