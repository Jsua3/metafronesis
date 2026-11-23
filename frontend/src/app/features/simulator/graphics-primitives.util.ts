// Solo tipos: el import se elide en runtime (los specs corren sin canvas).
import type Phaser from 'phaser';

/**
 * Primitivas de dibujo con coordenadas CENTRADAS (cx, cy), compartidas por los renderers de
 * salas. Antes estaban copiadas, idénticas, en `premium-clinical-room.renderer.ts` y en
 * `case-pdf-rooms.renderer.ts`.
 */

/** Rectángulo relleno centrado en (cx, cy). */
export function rectC(
  g: Phaser.GameObjects.Graphics, cx: number, cy: number,
  w: number, h: number, color: number, alpha = 1,
): void {
  g.fillStyle(color, alpha);
  g.fillRect(cx - w / 2, cy - h / 2, w, h);
}

/** Contorno de rectángulo centrado en (cx, cy). */
export function frameC(
  g: Phaser.GameObjects.Graphics, cx: number, cy: number,
  w: number, h: number, color: number, alpha = 1, line = 2,
): void {
  g.lineStyle(line, color, alpha);
  g.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

/** Elipse rellena centrada en (cx, cy). */
export function ellipseC(
  g: Phaser.GameObjects.Graphics, cx: number, cy: number,
  w: number, h: number, color: number, alpha = 1,
): void {
  g.fillStyle(color, alpha);
  g.fillEllipse(cx, cy, w, h);
}
