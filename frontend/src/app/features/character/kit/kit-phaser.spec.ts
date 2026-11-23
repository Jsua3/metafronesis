import { resolveCharacter } from './character-visual.resolver';
import {
  addRgbaTexture,
  ensureCharacterAnims,
  kitFrameIndex,
  playKitPose,
  queueCharacterSheets,
} from './kit-phaser';
import { testKitBundle } from './testing/kit-testing';

interface AnimConfig { key: string; frames: { start: number; end: number }; frameRate: number; repeat: number }

/** Escena mínima: cargar una hoja la deja disponible al instante. */
function fakeScene() {
  const textures = new Set<string>();
  const anims = new Map<string, AnimConfig>();
  const raw = {
    textures: {
      exists: (key: string) => textures.has(key),
      addSpriteSheet: vi.fn((key: string) => { textures.add(key); }),
      addCanvas: vi.fn((key: string) => { textures.add(key); }),
    },
    load: { spritesheet: vi.fn((key: string) => { textures.add(key); }) },
    anims: {
      exists: (key: string) => anims.has(key),
      create: vi.fn((config: AnimConfig) => { anims.set(config.key, config); }),
      generateFrameNumbers: (_key: string, range: { start: number; end: number }) => range,
    },
  };
  return { scene: raw as never, raw, anims };
}

const bundle = testKitBundle();
const valentina = resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' });
const custom = resolveCharacter(bundle, {
  kind: 'jugador',
  avatar: { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-1', hair: 'mono', hairColor: 'rubio', accessories: [], bata: true },
});
const canvas = () => ({}) as HTMLCanvasElement;

describe('kit-phaser', () => {
  it('una receta publicada se pide por URL, en cuadros de 48×72', () => {
    const { scene, raw } = fakeScene();
    queueCharacterSheets(scene, valentina, canvas);
    expect(raw.load.spritesheet).toHaveBeenCalledWith('kit-valentina-idle', '/assets/characters/kit/valentina/idle.png', { frameWidth: 48, frameHeight: 72 });
    expect(raw.load.spritesheet).toHaveBeenCalledWith('kit-valentina-walk', '/assets/characters/kit/valentina/walk.png', { frameWidth: 48, frameHeight: 72 });
    expect(raw.textures.addSpriteSheet).not.toHaveBeenCalled();
  });

  it('el avatar compuesto se registra desde el lienzo, sin red', () => {
    const { scene, raw } = fakeScene();
    queueCharacterSheets(scene, custom, canvas);
    expect(raw.load.spritesheet).not.toHaveBeenCalled();
    expect(raw.textures.addSpriteSheet).toHaveBeenCalledTimes(2);
  });

  it('sin lienzo (sin contexto 2D) no registra nada y las animaciones no quedan listas', () => {
    const { scene } = fakeScene();
    queueCharacterSheets(scene, custom, () => null);
    expect(ensureCharacterAnims(scene, custom)).toBe(false);
    expect(addRgbaTexture(scene, 'icono', { width: 1, height: 1, rgba: new Uint8Array(4) }, () => null)).toBe(false);
  });

  it('reposo de 4 cuadros a 4 fps y caminata de 6 a 10 fps, en la fila de cada vista', () => {
    const { scene, anims } = fakeScene();
    queueCharacterSheets(scene, valentina, canvas);
    expect(ensureCharacterAnims(scene, valentina)).toBe(true);
    // 2 hojas × 8 vistas: abajo, abajo-izquierda, izquierda, arriba-izquierda, arriba y sus tres derechas.
    expect(anims.size).toBe(16);
    expect(anims.get('kit-valentina-walk-right')).toMatchObject({ frames: { start: 36, end: 41 }, frameRate: 10, repeat: -1 });
    expect(anims.get('kit-valentina-idle-up')).toMatchObject({ frames: { start: 16, end: 19 }, frameRate: 4, repeat: -1 });
    expect(anims.get('kit-valentina-walk-down-left')).toMatchObject({ frames: { start: 6, end: 11 }, frameRate: 10, repeat: -1 });
    expect(anims.get('kit-valentina-idle-up-right')).toMatchObject({ frames: { start: 20, end: 23 }, frameRate: 4, repeat: -1 });
    expect(kitFrameIndex('walk', 'left', 3)).toBe(15);
  });

  it('no repite texturas ni animaciones', () => {
    const { scene, raw } = fakeScene();
    queueCharacterSheets(scene, valentina, canvas);
    queueCharacterSheets(scene, valentina, canvas);
    ensureCharacterAnims(scene, valentina);
    ensureCharacterAnims(scene, valentina);
    expect(raw.load.spritesheet).toHaveBeenCalledTimes(2);
    expect(raw.anims.create).toHaveBeenCalledTimes(16);
  });

  it('la pose: caminata o reposo de la vista; con movimiento reducido, cuadro fijo', () => {
    const sprite = { play: vi.fn(), setTexture: vi.fn(), anims: { stop: vi.fn() } };
    playKitPose(sprite as never, valentina, 'left', true, false);
    expect(sprite.play).toHaveBeenLastCalledWith('kit-valentina-walk-left', true);
    playKitPose(sprite as never, valentina, 'down', false, false);
    expect(sprite.play).toHaveBeenLastCalledWith('kit-valentina-idle-down', true);
    playKitPose(sprite as never, valentina, 'up', true, true);
    expect(sprite.anims.stop).toHaveBeenCalled();
    expect(sprite.setTexture).toHaveBeenLastCalledWith('kit-valentina-idle', 16);
    playKitPose(sprite as never, valentina, 'down-right', true, false);
    expect(sprite.play).toHaveBeenLastCalledWith('kit-valentina-walk-down-right', true);
  });
});
