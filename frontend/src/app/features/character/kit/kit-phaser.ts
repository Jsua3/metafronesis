/**
 * Hojas del kit en Phaser: texturas, animaciones de reposo y caminata por vista y la
 * pose de un actor. Sin escalas ni espejos: las 8 filas son reales (una por dirección)
 * y el zoom entero lo pone la cámara (spec §8.2-8.3).
 */
import type Phaser from 'phaser';

import type { CharacterVisual } from './character-visual.resolver';
import { FRAME, RgbaImage, SHEETS, SHEET_IDS, SheetId, VIEW_ROWS, ViewId } from './kit-engine';
import { rgbaToCanvas } from './kit-raster';

/** Pies del cuadro del kit: (24, 68) de 48×72. */
export const KIT_ORIGIN_X = FRAME.pivotX / FRAME.width;
export const KIT_ORIGIN_Y = FRAME.pivotY / FRAME.height;

type ToCanvas = (image: RgbaImage) => HTMLCanvasElement | null;
type Textures = Pick<Phaser.Scene, 'textures'>;

export function kitSheetKey(visual: CharacterVisual, sheet: SheetId): string {
  return `${visual.key}-${sheet}`;
}

export function kitAnimKey(visual: CharacterVisual, sheet: SheetId, view: ViewId): string {
  return `${visual.key}-${sheet}-${view}`;
}

/** Índice del cuadro `col` de la fila de `view` en una hoja. */
export function kitFrameIndex(sheet: SheetId, view: ViewId, col = 0): number {
  return VIEW_ROWS.indexOf(view) * SHEETS[sheet].frames + col;
}

/** Textura desde una RgbaImage: hoja de cuadros si se da `frames`, imagen suelta si no. false si no hay lienzo. */
export function addRgbaTexture(
  scene: Textures,
  key: string,
  image: RgbaImage,
  toCanvas: ToCanvas = rgbaToCanvas,
  frames?: { frameWidth: number; frameHeight: number },
): boolean {
  if (scene.textures.exists(key)) return true;
  const canvas = toCanvas(image);
  if (!canvas) return false;
  if (frames) scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, frames);
  else scene.textures.addCanvas(key, canvas);
  return true;
}

/** Registra ya las hojas compuestas (avatar personalizado o autorado); las URL no se tocan. */
export function addComposedSheets(scene: Textures, visual: CharacterVisual, toCanvas: ToCanvas = rgbaToCanvas): void {
  for (const sheet of SHEET_IDS) {
    const source = visual[sheet];
    if (source.kind === 'rgba') {
      addRgbaTexture(scene, kitSheetKey(visual, sheet), source.image, toCanvas, { frameWidth: FRAME.width, frameHeight: FRAME.height });
    }
  }
}

/** En preload: pide por URL las hojas publicadas y registra las compuestas. */
export function queueCharacterSheets(scene: Pick<Phaser.Scene, 'load' | 'textures'>, visual: CharacterVisual, toCanvas: ToCanvas = rgbaToCanvas): void {
  addComposedSheets(scene, visual, toCanvas);
  for (const sheet of SHEET_IDS) {
    const source = visual[sheet];
    const key = kitSheetKey(visual, sheet);
    if (source.kind === 'url' && !scene.textures.exists(key)) {
      scene.load.spritesheet(key, source.url, { frameWidth: FRAME.width, frameHeight: FRAME.height });
    }
  }
}

/** Tras la carga: reposo y caminata de cada vista. false si falta alguna hoja (→ respaldo del actor). */
export function ensureCharacterAnims(scene: Pick<Phaser.Scene, 'textures' | 'anims'>, visual: CharacterVisual): boolean {
  if (!SHEET_IDS.every(sheet => scene.textures.exists(kitSheetKey(visual, sheet)))) return false;
  for (const sheet of SHEET_IDS) {
    for (const view of VIEW_ROWS) {
      const key = kitAnimKey(visual, sheet, view);
      if (scene.anims.exists(key)) continue;
      const start = kitFrameIndex(sheet, view);
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(kitSheetKey(visual, sheet), { start, end: start + SHEETS[sheet].frames - 1 }),
        frameRate: SHEETS[sheet].fps,
        repeat: -1,
      });
    }
  }
  return true;
}

/** Pose de un actor: reposo (respira) o caminata en la vista. Con movimiento reducido, cuadro fijo de reposo. */
export function playKitPose(sprite: Phaser.GameObjects.Sprite, visual: CharacterVisual, view: ViewId, walking: boolean, reduceMotion: boolean): void {
  if (reduceMotion) {
    sprite.anims.stop();
    sprite.setTexture(kitSheetKey(visual, 'idle'), kitFrameIndex('idle', view));
    return;
  }
  sprite.play(kitAnimKey(visual, walking ? 'walk' : 'idle', view), true);
}
