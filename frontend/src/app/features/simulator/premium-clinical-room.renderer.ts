// Solo tipos: el import se elide en runtime (los specs corren sin canvas).
import type Phaser from 'phaser';
import { DEPTH, actorDepth } from './depth-sort.util';
import {
  AUTHORED_ROOM_HEIGHT,
  AUTHORED_ROOM_WIDTH,
  isAuthoredClinicalRoomKey,
} from './authored-clinical-room.util';
import { ellipseC, frameC, rectC } from './graphics-primitives.util';
import {
  PREMIUM_RENDERER_LAYERS,
  SceneRenderer,
  SceneRendererOptions,
  SceneRenderMetadata,
  ScenePoint,
  SceneRect,
} from './scene-layer.types';

/**
 * Sala clínica premium (fase A+B del MVP premium, fase C: SceneRenderer).
 *
 * Pinta SOLO arte: composición pixel-art de la sala de urgencias/atención
 * psicosocial por capas (background → floor → backProps → midProps →
 * frontProps → lighting). No conoce decisiones, diálogos, API ni audio.
 *
 * La geometría JUGABLE (colisiones, spawn, posiciones de markers/NPCs) vive en
 * authored-clinical-room.util.ts y es la única fuente de verdad: los muebles
 * de este renderer se dibujan sobre esos mismos anclajes. Si se mueve un
 * mueble aquí, hay que mover su colisión allá.
 */

// ── Datos visuales (separados del gameplay — preparación fase C) ──────────────

/** Líneas maestras de la composición (perspectiva de la sala). */
export const PREMIUM_ROOM_GEOMETRY = {
  roomLeft: 58,
  roomRight: 902,
  backWallTopY: 76,
  wallFloorSeamY: 220,
  floorFrontY: 490,
  /** Trapecio del piso: x en la línea del fondo / x en el borde frontal. */
  floorBackLeftX: 144,
  floorBackRightX: 816,
  floorFrontLeftX: 84,
  floorFrontRightX: 876,
} as const;

export const PREMIUM_ROOM_BOUNDS = {
  width: AUTHORED_ROOM_WIDTH,
  height: AUTHORED_ROOM_HEIGHT,
} as const;

/** Rect caminable (espejo del hueco entre las bandas de colisión). */
export const PREMIUM_FLOOR_BOUNDS: SceneRect = { x: 96, y: 236, width: 768, height: 250 };

/** Puntos de interés visual para cámara/guía/futuras salas. */
export const PREMIUM_ROOM_FOCUS_POINTS: Record<string, ScenePoint> = {
  desk: { x: 500, y: 300 },
  attention: { x: 235, y: 368 },   // sofá + mesa de centro (área de escucha)
  window: { x: 170, y: 150 },
  noticeBoard: { x: 304, y: 138 }, // cartelera de ruta institucional
};

/** Zonas con oclusión de primer plano (frontProps) — fuera del piso jugable. */
export const PREMIUM_ROOM_OCCLUSION_ZONES: readonly SceneRect[] = [
  { x: 0, y: 430, width: 120, height: 98 },     // hojas esquina inferior izquierda
  { x: 856, y: 452, width: 104, height: 76 },   // hojas esquina inferior derecha
];

// Paleta sobria de la sala (oscuro azul-violeta + acentos lavanda + madera).
const PAL = {
  backdrop: 0x0a0e1a,
  wallBack: 0x282148,
  wallBackDark: 0x221c3e,
  wallSeam: 0x1d1834,
  wallLeft: 0x211b3a,
  wallRight: 0x1d1734,
  wallEdge: 0x3a3158,
  baseboard: 0x16121f,
  baseboardHi: 0x6f6396,
  floorA: 0x4a4268,
  floorB: 0x463e62,
  floorSeam: 0x36304f,
  rug: 0x2f3e57,
  rugBorder: 0x263248,
  rugAccent: 0x4fa3a5,
  outline: 0x2e1c12,
  woodTop: 0x9a6240,
  woodTopHi: 0xb87c50,
  woodMid: 0x6f432c,
  woodDark: 0x5a3525,
  shelfBody: 0x6b442b,
  shelfTop: 0x82573a,
  shelfSide: 0x54341f,
  shelfBoard: 0x2c1c13,
  sofaBack: 0x1f3c61,
  sofaBackHi: 0x2e548a,
  sofaSeat: 0x2c5580,
  sofaSeatHi: 0x3a6a96,
  sofaArm: 0x1c3658,
  sofaArmHi: 0x27486f,
  sofaSkirt: 0x16294a,
  pillow: 0x6f5fae,
  potBody: 0x3a4152,
  potRim: 0x4a5366,
  leafBack: 0x2f5f35,
  leafFront: 0x3d7a42,
  leafHi: 0x57a05e,
  paper: 0xd8d4c7,
  screen: 0x0c101c,
  screenGlow: 0x8a9cf0,
  warmLight: 0xffd28a,
  coolLight: 0x9fb4ff,
  shadow: 0x05070d,
} as const;

// ── API pública ───────────────────────────────────────────────────────────────

/** Metadata visual de la sala premium (pura — testeable sin canvas). */
export function premiumRoomMetadata(): SceneRenderMetadata {
  return {
    bounds: { ...PREMIUM_ROOM_BOUNDS },
    floorBounds: { ...PREMIUM_FLOOR_BOUNDS },
    focusPoints: PREMIUM_ROOM_FOCUS_POINTS,
    occlusionZones: PREMIUM_ROOM_OCCLUSION_ZONES,
    paintedLayers: PREMIUM_RENDERER_LAYERS,
  };
}

export function renderPremiumClinicalRoom(
  scene: Phaser.Scene,
  options: SceneRendererOptions,
): SceneRenderMetadata {
  paintBackground(scene, options);
  paintFloor(scene);
  paintBackProps(scene);
  paintMidProps(scene);
  paintFrontProps(scene);
  paintLighting(scene, options);

  return premiumRoomMetadata();
}

/** Renderer registrable de la sala clínica premium (urgencias y salas autoría). */
export const premiumClinicalRoomRenderer: SceneRenderer = {
  key: 'premium-clinical-room',
  supports: mapKey => isAuthoredClinicalRoomKey(mapKey),
  render: renderPremiumClinicalRoom,
};

// ── Helpers de dibujo (coordenadas centradas, como el resto del runtime) ─────

// rectC, frameC y ellipseC (coordenadas centradas) viven en graphics-primitives.util.ts.

/** Sombra de contacto elíptica en dos pasos (borde suave sin gradientes). */
function contactShadow(g: Phaser.GameObjects.Graphics, cx: number, cy: number,
                       w: number, h: number, alpha = 0.3): void {
  ellipseC(g, cx, cy, w, h, PAL.shadow, alpha * 0.55);
  ellipseC(g, cx, cy, w * 0.68, h * 0.68, PAL.shadow, alpha);
}

// ── background: paredes, ventana, decoración de muro ─────────────────────────

function paintBackground(scene: Phaser.Scene, options: SceneRendererOptions): void {
  const { roomLeft, roomRight, backWallTopY, wallFloorSeamY, floorFrontY,
          floorBackLeftX, floorBackRightX } = PREMIUM_ROOM_GEOMETRY;
  const g = scene.add.graphics().setDepth(DEPTH.BACKGROUND);

  // Fondo total (cubre el aire alrededor de la sala).
  g.fillStyle(PAL.backdrop, 1);
  g.fillRect(0, 0, options.width, options.height);

  // Pared trasera con banda inferior (wainscot) más oscura.
  g.fillStyle(PAL.wallBack, 1);
  g.fillRect(roomLeft, backWallTopY, roomRight - roomLeft, wallFloorSeamY - backWallTopY);
  g.fillStyle(PAL.wallBackDark, 1);
  g.fillRect(roomLeft, 168, roomRight - roomLeft, wallFloorSeamY - 168);
  g.lineStyle(2, PAL.wallEdge, 0.5);
  g.lineBetween(roomLeft, 168, roomRight, 168);

  // Sombra de techo (banda superior) — asienta la pared sin mostrar techo.
  g.fillStyle(PAL.shadow, 0.22);
  g.fillRect(roomLeft, backWallTopY, roomRight - roomLeft, 14);

  // Paneles verticales sutiles.
  g.lineStyle(2, PAL.wallSeam, 0.45);
  for (let x = 240; x <= 840; x += 80) {
    g.lineBetween(x, backWallTopY + 14, x, 166);
  }

  // Desgaste discreto (píxeles fijos — capturas estables).
  g.fillStyle(0x342c54, 0.5);
  for (const [px, py] of [[212, 102], [318, 142], [438, 96], [596, 128], [722, 100], [848, 148]]) {
    g.fillRect(px, py, 3, 3);
  }

  // Paredes laterales en perspectiva (más oscuras que el fondo = profundidad).
  g.fillStyle(PAL.wallLeft, 1);
  g.fillTriangle(roomLeft, backWallTopY, roomLeft, floorFrontY, floorBackLeftX, wallFloorSeamY);
  g.fillStyle(PAL.wallRight, 1);
  g.fillTriangle(roomRight, backWallTopY, roomRight, floorFrontY, floorBackRightX, wallFloorSeamY);
  // Arista pared lateral / pared trasera.
  g.lineStyle(2, PAL.wallEdge, 0.55);
  g.lineBetween(roomLeft, backWallTopY, floorBackLeftX, wallFloorSeamY);
  g.lineBetween(roomRight, backWallTopY, floorBackRightX, wallFloorSeamY);

  paintWindow(g, 170, 118);
  paintNoticeBoard(g, 304, 138);
  paintWallPlaque(scene, g, 480, 150);
  paintWallClock(g, 576, 112);
  paintSiepPoster(scene, g, 656, 124);
}

/** Ventana nocturna con persianas — luz fría que entra desde la izquierda. */
function paintWindow(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  rectC(g, cx, cy, 128, 72, 0x141021);                  // marco exterior
  rectC(g, cx, cy, 116, 60, 0x1d2a4a);                  // vidrio nocturno
  rectC(g, cx, cy - 16, 116, 24, 0x243456);             // cielo más claro arriba
  ellipseC(g, cx + 34, cy - 18, 10, 10, PAL.coolLight, 0.5);   // luna lejana
  ellipseC(g, cx + 34, cy - 18, 20, 20, PAL.coolLight, 0.12);
  // Persianas (5 lamas).
  for (let i = 0; i < 5; i++) {
    rectC(g, cx, cy - 22 + i * 12, 116, 6, 0x3a3158);
    rectC(g, cx, cy - 24 + i * 12, 116, 2, 0x453a68);
  }
  rectC(g, cx, cy, 4, 60, 0x141021);                    // parteluz
  rectC(g, cx, cy + 40, 136, 8, 0x2c2548);              // repisa
  rectC(g, cx, cy + 37, 136, 2, 0x393060);
  // Derrame de luz fría en la pared bajo la ventana.
  g.fillStyle(PAL.coolLight, 0.05);
  g.fillRect(cx - 52, cy + 44, 104, 14);
}

/** Lema institucional como placa pequeña (decorativa, no protagonista). */
function paintWallPlaque(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics,
                         cx: number, cy: number): void {
  rectC(g, cx, cy, 206, 20, 0x181330, 0.85);
  frameC(g, cx, cy, 206, 20, 0x8a6cff, 0.22);
  scene.add.text(cx, cy, 'ESCUCHAR · ACOMPAÑAR · PROTEGER', {
    fontFamily: 'monospace', fontSize: '8px', color: '#9d8fd0', align: 'center',
  }).setOrigin(0.5).setAlpha(0.75).setDepth(DEPTH.ENVIRONMENT);
}

function paintWallClock(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  ellipseC(g, cx, cy, 18, 18, 0x241a10);
  ellipseC(g, cx, cy, 14, 14, PAL.paper);
  g.lineStyle(2, 0x241a10, 1);
  g.lineBetween(cx, cy, cx, cy - 5);
  g.lineBetween(cx, cy, cx + 4, cy + 1);
  g.fillStyle(0x241a10, 1);
  g.fillRect(cx - 1, cy - 1, 2, 2);
}

/** Póster SIEP sobrio (lavanda oscura, sin beige dominante). */
function paintSiepPoster(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics,
                         cx: number, cy: number): void {
  rectC(g, cx, cy, 86, 80, 0x2a2348);
  frameC(g, cx, cy, 86, 80, 0x4a3f7a, 0.9);
  rectC(g, cx, cy - 38, 86, 3, 0x6f6396);               // brillo superior del marco
  // Glifo: dos hemisferios estilizados.
  ellipseC(g, cx - 7, cy - 18, 13, 15, 0xB69CFF, 0.85);
  ellipseC(g, cx + 7, cy - 18, 13, 15, 0xB69CFF, 0.55);
  rectC(g, cx, cy - 10, 4, 8, 0x2a2348);
  scene.add.text(cx, cy + 14, 'CUIDAR\nTAMBIÉN ES\nPREVENIR', {
    fontFamily: 'monospace', fontSize: '7px', color: '#cdbcff', align: 'center',
  }).setOrigin(0.5).setAlpha(0.85).setDepth(DEPTH.ENVIRONMENT);
}

/** Cartelera de ruta VBG — contexto del marker 'aviso-policial'. */
function paintNoticeBoard(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  rectC(g, cx, cy, 78, 58, 0x241a10);
  rectC(g, cx, cy, 70, 50, 0xc9b98a);
  const notes: Array<[number, number, number]> = [
    [cx - 22, cy - 12, 0xd8d4c7], [cx + 2, cy - 14, 0xe8c4b8],
    [cx + 22, cy - 6, 0xb8d4e8], [cx - 8, cy + 10, 0xd8d4c7],
  ];
  for (const [nx, ny, color] of notes) {
    rectC(g, nx, ny, 14, 12, color);
    g.fillStyle(0xE25A4F, 1);
    g.fillRect(nx - 1, ny - 7, 2, 2);                   // pin
  }
  // Ruta marcada entre notas.
  g.lineStyle(1, 0xa85062, 0.8);
  g.lineBetween(cx - 22, cy - 12, cx + 2, cy - 14);
  g.lineBetween(cx + 2, cy - 14, cx + 22, cy - 6);
  g.lineBetween(cx + 22, cy - 6, cx - 8, cy + 10);
}

// ── floor: piso en perspectiva, alfombra, zócalo ──────────────────────────────

function paintFloor(scene: Phaser.Scene): void {
  const { wallFloorSeamY, floorFrontY, floorBackLeftX, floorBackRightX,
          floorFrontLeftX, floorFrontRightX, roomLeft, roomRight } = PREMIUM_ROOM_GEOMETRY;
  const g = scene.add.graphics().setDepth(DEPTH.GRID);

  const span = floorFrontY - wallFloorSeamY;
  const leftAt = (y: number) =>
    floorBackLeftX + (floorFrontLeftX - floorBackLeftX) * ((y - wallFloorSeamY) / span);
  const rightAt = (y: number) =>
    floorBackRightX + (floorFrontRightX - floorBackRightX) * ((y - wallFloorSeamY) / span);

  // Bandas horizontales (baldosas en perspectiva): crecen hacia el frente.
  const rowHeights = [18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
  let y: number = wallFloorSeamY;
  rowHeights.forEach((h, i) => {
    const y2 = Math.min(y + h, floorFrontY);
    g.fillStyle(i % 2 === 0 ? PAL.floorA : PAL.floorB, 1);
    g.beginPath();
    g.moveTo(leftAt(y), y);
    g.lineTo(rightAt(y), y);
    g.lineTo(rightAt(y2), y2);
    g.lineTo(leftAt(y2), y2);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, PAL.floorSeam, 0.55);
    g.lineBetween(leftAt(y2), y2, rightAt(y2), y2);
    y = y2;
  });

  // Juntas verticales convergentes (pocas — sin ruido de grilla).
  const scaleFront = (floorFrontRightX - floorFrontLeftX) / (floorBackRightX - floorBackLeftX);
  g.lineStyle(2, PAL.floorSeam, 0.4);
  for (let bx = 240; bx <= 720; bx += 96) {
    const fx = 480 + (bx - 480) * scaleFront;
    g.lineBetween(bx, wallFloorSeamY, fx, floorFrontY);
  }

  // Desgaste fijo en la zona de paso.
  g.fillStyle(0x3a3458, 0.5);
  for (const [px, py] of [[452, 414], [506, 442], [474, 460], [388, 430], [556, 420]]) {
    g.fillRect(px, py, 3, 3);
  }

  // Oclusión ambiental en la unión pared/piso.
  g.fillStyle(PAL.shadow, 0.3);
  g.fillRect(floorBackLeftX, wallFloorSeamY, floorBackRightX - floorBackLeftX, 4);
  g.fillStyle(PAL.shadow, 0.14);
  g.fillRect(floorBackLeftX - 4, wallFloorSeamY + 4, floorBackRightX - floorBackLeftX + 8, 5);

  paintRug(g);

  // Zócalo: arista nítida pared/piso (la lectura 2.5D más importante).
  const base = scene.add.graphics().setDepth(DEPTH.GRID + 1);
  base.lineStyle(4, PAL.baseboard, 0.95);
  base.lineBetween(floorBackLeftX, wallFloorSeamY, floorBackRightX, wallFloorSeamY);
  base.lineStyle(3, PAL.baseboard, 0.8);
  base.lineBetween(roomLeft + 26, floorFrontY, floorBackLeftX, wallFloorSeamY);
  base.lineBetween(roomRight - 26, floorFrontY, floorBackRightX, wallFloorSeamY);
  base.lineStyle(1, PAL.baseboardHi, 0.5);
  base.lineBetween(floorBackLeftX, wallFloorSeamY + 3, floorBackRightX, wallFloorSeamY + 3);
}

/** Alfombra del área de escucha (sofá + mesa de centro). */
function paintRug(g: Phaser.GameObjects.Graphics): void {
  const cx = 248, cy = 376, w = 244, h = 112;
  rectC(g, cx, cy, w, h, PAL.rugBorder, 0.95);
  rectC(g, cx, cy, w - 12, h - 12, PAL.rug, 1);
  frameC(g, cx, cy, w - 26, h - 26, PAL.rugAccent, 0.3, 1);
  // Esquinas mordidas → silueta menos CSS, más tejido.
  g.fillStyle(PAL.floorB, 1);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.fillRect(cx + (sx * w) / 2 - (sx > 0 ? 5 : 0), cy + (sy * h) / 2 - (sy > 0 ? 5 : 0), 5, 5);
  }
}

// ── backProps: mobiliario contra la pared trasera ─────────────────────────────

function paintBackProps(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(DEPTH.ENVIRONMENT);
  paintBookshelf(g, 178, 182, 112);
  paintBookshelf(g, 760, 178, 130);
}

/** Estantería con volumen: tapa, costado, libros variados y carpetas. */
function paintBookshelf(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number): void {
  const h = 92;
  // Sombra proyectada en la pared + contacto con el piso.
  rectC(g, cx + 5, cy + 6, w, h, PAL.shadow, 0.22);
  contactShadow(g, cx, cy + h / 2 + 4, w + 14, 14, 0.28);

  rectC(g, cx, cy, w, h, PAL.shelfBody);
  frameC(g, cx, cy, w, h, 0x2a1a10, 0.9);
  rectC(g, cx, cy - h / 2 + 3, w, 6, PAL.shelfTop);               // tapa
  rectC(g, cx + w / 2 - 4, cy, 8, h, PAL.shelfSide);              // costado (luz desde la ventana izq.)

  // Libros deterministas por fila (ancho, alto, color); null = hueco.
  const palette = [0x7f3f3f, 0x2f6f6f, 0xa87934, 0x3f5f92, 0x5d4a7a, 0x3d6b4f];
  const rows: Array<Array<[number, number, number] | null>> = [
    [[8, 24, 0], [7, 20, 1], [9, 26, 2], null, [7, 22, 3], [8, 24, 4], [7, 18, 5], [9, 24, 0]],
    [[7, 22, 3], [9, 24, 5], [7, 20, 1], [8, 26, 2], null, [14, 22, 3], [7, 24, 4]],
  ];
  rows.forEach((books, row) => {
    const shelfY = cy - 22 + row * 36;
    rectC(g, cx, shelfY + 14, w - 14, 4, PAL.shelfBoard);          // tabla
    let bx = cx - w / 2 + 12;
    for (const book of books) {
      if (book === null) { bx += 9; continue; }
      const [bw, bh, ci] = book;
      rectC(g, bx + bw / 2, shelfY + 12 - bh / 2, bw, bh, palette[ci]);
      g.fillStyle(0xffffff, 0.18);                                 // lomo iluminado
      g.fillRect(bx + 1, shelfY + 12 - bh, 1, bh);
      bx += bw + 2;
    }
  });
  // Libro inclinado al final de la fila superior.
  g.fillStyle(palette[2], 1);
  g.fillRect(cx + w / 2 - 22, cy - 30, 8, 20);
  g.fillRect(cx + w / 2 - 18, cy - 26, 8, 16);
}

// ── midProps: mobiliario en el piso (ordenado por Y con los actores) ──────────

function paintMidProps(scene: Phaser.Scene): void {
  paintDeskChair(scene);
  paintDesk(scene, 500, 286);
  paintSofa(scene, 190, 322);
  paintCoffeeTable(scene, 300, 374);
  paintFloorPlant(scene, 820, 382, 1.15);
  paintFloorPlant(scene, 116, 392, 1.2);
}

function paintDeskChair(scene: Phaser.Scene): void {
  // Silla tras el escritorio: solo el respaldo asoma, pegado al tablero
  // (si flota separado se lee como un monitor suelto).
  const g = scene.add.graphics().setDepth(actorDepth(254));
  rectC(g, 500, 258, 40, 16, 0x2c3550);
  rectC(g, 500, 249, 30, 5, 0x39466a);
  frameC(g, 500, 258, 40, 16, 0x141b2c, 0.9);
}

/** Escritorio de atención: madera con volumen, monitor, papeles, taza. */
function paintDesk(scene: Phaser.Scene, x: number, y: number): void {
  // Colisión en AUTHORED_CLINICAL_COLLISIONS (365,262 → 270×80) — mantener en sync.
  const g = scene.add.graphics().setDepth(actorDepth(y + 56));
  contactShadow(g, x, y + 54, 300, 26, 0.32);

  // Pedestales con cajones.
  for (const side of [-78, 78]) {
    rectC(g, x + side, y + 32, 56, 38, PAL.woodDark);
    frameC(g, x + side, y + 32, 56, 38, PAL.outline, 0.85);
    for (const dy of [-8, 4]) {
      rectC(g, x + side, y + 32 + dy, 44, 9, PAL.woodMid);
      rectC(g, x + side, y + 32 + dy, 10, 2, 0xc9a06a);            // tirador
    }
  }
  // Panel frontal.
  rectC(g, x, y + 30, 250, 44, PAL.woodMid);
  frameC(g, x, y + 30, 250, 44, PAL.outline, 0.85);
  g.lineStyle(1, PAL.woodDark, 0.7);
  g.lineBetween(x - 110, y + 30, x + 110, y + 30);

  // Tablero con luz superior y canto.
  rectC(g, x, y - 8, 260, 26, PAL.woodTop);
  rectC(g, x, y - 19, 260, 4, PAL.woodTopHi);
  rectC(g, x, y + 4, 260, 4, 0x7a4c30);
  frameC(g, x, y - 8, 260, 26, PAL.outline, 0.9);

  // Monitor con informe en pantalla (glow frío contenido).
  ellipseC(g, x - 62, y - 26, 64, 38, PAL.screenGlow, 0.07);
  rectC(g, x - 62, y - 6, 20, 4, 0x0d1118);                        // base
  rectC(g, x - 62, y - 11, 6, 8, 0x0d1118);                        // poste
  rectC(g, x - 62, y - 28, 46, 32, PAL.screen);
  frameC(g, x - 62, y - 28, 46, 32, 0x2c3550, 1);
  g.fillStyle(PAL.screenGlow, 0.85);
  g.fillRect(x - 80, y - 38, 24, 2);
  g.fillRect(x - 80, y - 32, 32, 2);
  g.fillStyle(0x6fc7c0, 0.8);
  g.fillRect(x - 80, y - 26, 18, 2);

  // Teclado, papeles, taza, planta de escritorio.
  rectC(g, x - 8, y - 14, 36, 8, 0x1a2030);
  g.lineStyle(1, 0x39466a, 0.8);
  g.lineBetween(x - 24, y - 14, x + 8, y - 14);
  rectC(g, x + 46, y - 16, 30, 18, PAL.paper);
  rectC(g, x + 50, y - 20, 30, 18, 0xcfcaba);
  g.lineStyle(1, 0x8a8474, 0.9);
  for (const ly of [-24, -20, -16]) g.lineBetween(x + 38, y + ly, x + 60, y + ly);
  rectC(g, x + 80, y - 18, 9, 10, 0x5d4a9a);                       // taza
  g.lineStyle(2, 0x5d4a9a, 1);
  g.strokeRect(x + 85, y - 21, 4, 5);                              // asa
  paintDeskPlant(g, x + 108, y - 16);
}

function paintDeskPlant(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  rectC(g, x, y + 2, 12, 9, PAL.potBody);
  rectC(g, x, y - 2, 14, 3, PAL.potRim);
  ellipseC(g, x - 4, y - 9, 7, 12, PAL.leafBack);
  ellipseC(g, x + 4, y - 9, 7, 12, PAL.leafBack);
  ellipseC(g, x, y - 11, 7, 14, PAL.leafFront);
}

/** Sofá de espera clínico con cojines, brazos y cojín lavanda. */
function paintSofa(scene: Phaser.Scene, x: number, y: number): void {
  // Colisión: 121,288 → 138×70 — mantener en sync.
  const g = scene.add.graphics().setDepth(actorDepth(y + 36));
  contactShadow(g, x, y + 36, 180, 24, 0.32);

  rectC(g, x, y - 18, 138, 30, PAL.sofaBack);                      // respaldo
  rectC(g, x, y - 31, 138, 4, PAL.sofaBackHi);
  frameC(g, x, y - 18, 138, 30, 0x101c30, 0.9);

  for (const side of [-60, 60]) {                                   // brazos
    rectC(g, x + side, y + 4, 24, 52, PAL.sofaArm);
    rectC(g, x + side, y - 18, 24, 8, PAL.sofaArmHi);
    frameC(g, x + side, y + 4, 24, 52, 0x101c30, 0.9);
  }

  for (const side of [-31, 31]) {                                   // cojines de asiento
    rectC(g, x + side, y + 8, 58, 26, PAL.sofaSeat);
    rectC(g, x + side, y - 3, 58, 4, PAL.sofaSeatHi);
  }
  g.lineStyle(2, 0x101c30, 0.6);
  g.lineBetween(x, y - 4, x, y + 20);

  rectC(g, x, y + 26, 138, 14, PAL.sofaSkirt);                     // faldón
  for (const side of [-56, 56]) {
    rectC(g, x + side, y + 36, 8, 8, 0x0e1622);                    // patas
  }
  // Cojín lavanda apoyado en el brazo izquierdo (acento SIEP).
  rectC(g, x - 44, y - 8, 20, 18, PAL.pillow);
  frameC(g, x - 44, y - 8, 20, 18, 0x4a3f7a, 0.9);
}

/** Mesa de centro con caja de pañuelos y folletos (detalle clínico-humano). */
function paintCoffeeTable(scene: Phaser.Scene, x: number, y: number): void {
  // Colisión: 254,353 → 92×44 — mantener en sync.
  const g = scene.add.graphics().setDepth(actorDepth(y + 22));
  contactShadow(g, x, y + 22, 104, 16, 0.28);

  for (const side of [-36, 36]) {
    rectC(g, x + side, y + 14, 6, 12, 0x4a2f1e);                   // patas frontales
  }
  rectC(g, x, y - 2, 88, 30, 0x7a5136);
  rectC(g, x, y - 14, 88, 4, 0x8f6242);
  frameC(g, x, y - 2, 88, 30, PAL.outline, 0.9);

  rectC(g, x - 16, y - 8, 16, 10, 0xcfd8e8);                       // caja de pañuelos
  rectC(g, x - 16, y - 14, 6, 4, 0xf4f7fb);
  rectC(g, x + 14, y - 6, 18, 12, 0xb8a8e0);                       // folletos
  rectC(g, x + 17, y - 9, 18, 12, 0x9d8fd0);
  rectC(g, x - 2, y - 12, 6, 9, 0x9fb8d8, 0.9);                    // vaso de agua
}

/** Planta de piso con maceta con volumen y follaje a dos tonos. */
function paintFloorPlant(scene: Phaser.Scene, x: number, y: number, s: number): void {
  const g = scene.add.graphics().setDepth(actorDepth(y + 18 * s));
  contactShadow(g, x, y + 26 * s, 52 * s, 13 * s, 0.3);

  rectC(g, x, y + 16 * s, 26 * s, 18 * s, PAL.potBody);
  rectC(g, x, y + 6 * s, 30 * s, 6 * s, PAL.potRim);
  rectC(g, x, y + 23 * s, 26 * s, 4 * s, 0x2c3344);
  frameC(g, x, y + 16 * s, 26 * s, 18 * s, 0x161c28, 0.9);

  // Follaje: capa trasera oscura + capa frontal clara + puntas con luz.
  for (const [dx, dy, w, h] of [[-12, -12, 14, 30], [10, -14, 14, 32], [0, -20, 12, 34]]) {
    ellipseC(g, x + dx * s, y + dy * s, w * s, h * s, PAL.leafBack);
  }
  for (const [dx, dy, w, h] of [[-7, -10, 13, 28], [6, -12, 13, 30], [0, -4, 14, 24]]) {
    ellipseC(g, x + dx * s, y + dy * s, w * s, h * s, PAL.leafFront);
  }
  g.fillStyle(PAL.leafHi, 0.9);
  g.fillRect(x - 7 * s, y - 22 * s, 2, 2);
  g.fillRect(x + 5 * s, y - 25 * s, 2, 2);
}

// ── frontProps: oclusión de primer plano (no tapa gameplay) ──────────────────

function paintFrontProps(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(DEPTH.PROPS_FRONT);
  const h = PREMIUM_ROOM_BOUNDS.height;

  // Hojas en silueta — esquina inferior izquierda.
  for (const [dx, dy, w, hh] of [[18, -10, 34, 70], [44, -2, 30, 56], [70, 6, 26, 44], [8, 14, 26, 40]]) {
    ellipseC(g, dx, h + dy - 28, w, hh, 0x16241a, 0.92);
  }
  // Hojas menores — esquina inferior derecha.
  for (const [dx, dy, w, hh] of [[-14, -4, 28, 52], [-38, 6, 24, 40], [-58, 12, 20, 32]]) {
    ellipseC(g, PREMIUM_ROOM_BOUNDS.width + dx, h + dy - 24, w, hh, 0x141f17, 0.9);
  }
  // Cuñas de sombra en las esquinas frontales.
  g.fillStyle(PAL.shadow, 0.2);
  g.fillTriangle(0, h, 150, h, 0, h - 64);
  g.fillTriangle(PREMIUM_ROOM_BOUNDS.width, h, PREMIUM_ROOM_BOUNDS.width - 150, h, PREMIUM_ROOM_BOUNDS.width, h - 64);
}

// ── lighting: pools cálidos, haz de ventana, partículas ──────────────────────

function paintLighting(scene: Phaser.Scene, options: SceneRendererOptions): void {
  const g = scene.add.graphics().setDepth(DEPTH.LIGHTING_FLOOR);

  // Sombra global muy sutil que unifica la paleta.
  g.fillStyle(0x0b1020, 0.1);
  g.fillRect(0, 0, options.width, options.height);

  // Pools de luz cálida escalonados (pixel-friendly, sin gradientes suaves):
  // escritorio (foco de trabajo) y sofá (foco humano).
  const pool = (cx: number, cy: number, w: number, h: number, base: number) => {
    ellipseC(g, cx, cy, w, h, PAL.warmLight, base * 0.5);
    ellipseC(g, cx, cy, w * 0.72, h * 0.72, PAL.warmLight, base * 0.75);
    ellipseC(g, cx, cy, w * 0.46, h * 0.46, PAL.warmLight, base);
  };
  pool(500, 298, 330, 140, 0.05);
  pool(238, 366, 260, 116, 0.045);

  // Haz frío desde la ventana hacia el piso (Vector2Like — sin Phaser runtime).
  // fillPoints solo lee .x/.y de cada punto (ver Graphics.js); el tipo de Phaser 4 exige
  // Vector2[] en vez del Vector2Like[] más laxo de antes, pero en runtime un objeto plano
  // sigue sirviendo igual — de ahí el cast, sin instanciar Phaser.Math.Vector2 de verdad.
  g.fillStyle(PAL.coolLight, 0.045);
  g.fillPoints([
    { x: 126, y: 158 }, { x: 216, y: 158 },
    { x: 264, y: 330 }, { x: 86, y: 330 },
  ] as unknown as Phaser.Math.Vector2[], true);
  g.fillStyle(PAL.coolLight, 0.035);
  g.fillPoints([
    { x: 146, y: 158 }, { x: 196, y: 158 },
    { x: 224, y: 312 }, { x: 120, y: 312 },
  ] as unknown as Phaser.Math.Vector2[], true);

  // Motas de polvo lentas en la luz (solo sin reduce-motion).
  if (!options.reduceMotion) {
    const motes: Array<[number, number]> = [[210, 260], [420, 320], [540, 270], [300, 410], [660, 360]];
    for (const [mx, my] of motes) {
      const mote = scene.add.circle(mx, my, 1.5, 0xcdd9ff, 0.16).setDepth(DEPTH.LIGHTING_FLOOR);
      scene.tweens.add({
        targets: mote,
        y: my - 34,
        x: mx + 12,
        alpha: 0,
        duration: 5600,
        delay: (mx * 7) % 2400,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
