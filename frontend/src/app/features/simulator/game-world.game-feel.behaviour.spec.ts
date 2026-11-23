// Mismo andamiaje que game-world.collision.spec.ts: Phaser toca canvas/WebGL al importarse
// (jsdom no lo soporta). Solo se evalúa `extends Phaser.Scene`; la escena nunca arranca aquí.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
    Game: class {},
  },
}));

import { crisisVignetteState, roomEntryFlash } from './game-feel.util';
import { DataDrivenWorldScene } from './game-world.component';
import type { Mock } from 'vitest';

interface FakeTween { stop: Mock; isPlaying: () => boolean; }
interface FakeVignette { scene: object; alpha: number; setAlpha(alpha: number): FakeVignette; }
interface FakeCamera { flash: Mock; shake: Mock; flashEffect: { alpha: number }; }

/** Superficie privada de la escena que estos casos ejercitan (la escena nunca arranca). */
interface SceneProbe {
  tweens: { add: Mock };
  cameras: { main: FakeCamera | undefined };
  crisisVignette?: FakeVignette;
  pendingRoomFlash: unknown;
  ready: boolean;
  setPersonaScene(activation: 'CALM' | 'TENSE' | 'CRISIS', intensity: 'LOW' | 'MEDIUM' | 'HIGH'): void;
  setReduceMotion(reduced: boolean): void;
  setMotionPaused(paused: boolean): void;
  playRevealEffects(): void;
  playPendingRoomFlash(): void;
}

interface Harness {
  scene: SceneProbe;
  /** Todos los pulsos creados, en orden. */
  tweens: FakeTween[];
  vignette: FakeVignette | undefined;
  camera: FakeCamera;
}

/** Escena sin arrancar con dobles mínimos de tweens, cámara y capa de viñeta. */
function crearEscena(opciones: { reduceMotion?: boolean; conVineta?: boolean } = {}): Harness {
  const { reduceMotion = false, conVineta = true } = opciones;
  const scene = new DataDrivenWorldScene({ reduceMotion } as never) as unknown as SceneProbe;
  const tweens: FakeTween[] = [];
  scene.tweens = {
    add: vi.fn(() => {
      let vivo = true;
      const tween: FakeTween = {
        stop: vi.fn(() => { vivo = false; }),
        isPlaying: () => vivo,
      };
      tweens.push(tween);
      return tween;
    }),
  };
  const camera: FakeCamera = { flash: vi.fn(), shake: vi.fn(), flashEffect: { alpha: 1 } };
  scene.cameras = { main: camera };
  scene.ready = true;
  let vignette: FakeVignette | undefined;
  if (conVineta) {
    vignette = {
      scene: {},
      alpha: 1,
      setAlpha(alpha: number) { this.alpha = alpha; return this; },
    };
    scene.crisisVignette = vignette;
  }
  return { scene, tweens, vignette, camera };
}

describe('DataDrivenWorldScene: game feel del bloque B (comportamiento)', () => {
  describe('viñeta de crisis', () => {
    it('una persona en crisis crea un solo pulso y reaplicar un estado igual no lo reinicia', () => {
      const { scene, tweens } = crearEscena();

      scene.setPersonaScene('CRISIS', 'MEDIUM');
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({ yoyo: true, repeat: -1 }));

      scene.setPersonaScene('CRISIS', 'MEDIUM');
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      expect(tweens[0].stop).not.toHaveBeenCalled();
    });

    it('al bajar de la crisis el pulso se detiene y la viñeta queda fija', () => {
      const { scene, tweens, vignette } = crearEscena();

      scene.setPersonaScene('CRISIS', 'MEDIUM');
      scene.setPersonaScene('TENSE', 'MEDIUM');

      expect(tweens[0].stop).toHaveBeenCalledTimes(1);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      expect(vignette!.alpha).toBe(crisisVignetteState('TENSE', 'MEDIUM', false).alpha);
    });

    it('activar movimiento reducido detiene el pulso y deja la viñeta fija', () => {
      const { scene, tweens, vignette } = crearEscena();

      scene.setPersonaScene('CRISIS', 'MEDIUM');
      scene.setReduceMotion(true);

      expect(tweens[0].stop).toHaveBeenCalledTimes(1);
      expect(vignette!.alpha).toBe(crisisVignetteState('CRISIS', 'MEDIUM', true).alpha);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    });

    it('con el mundo en pausa la crisis se congela y al reanudar vuelve a pulsar', () => {
      const { scene, tweens, vignette } = crearEscena();

      scene.setPersonaScene('CRISIS', 'MEDIUM');
      scene.setMotionPaused(true);
      expect(tweens[0].stop).toHaveBeenCalledTimes(1);
      expect(vignette!.alpha).toBe(crisisVignetteState('CRISIS', 'MEDIUM', true).alpha);

      scene.setMotionPaused(false);
      expect(scene.tweens.add).toHaveBeenCalledTimes(2);
      expect(tweens[1].isPlaying()).toBe(true);
    });

    it('al reanudar tras una pausa el pulso arranca donde quedó la viñeta fija: sin escalón', () => {
      const { scene, vignette } = crearEscena();

      scene.setPersonaScene('CRISIS', 'MEDIUM');
      scene.setMotionPaused(true);
      const fija = vignette!.alpha;
      scene.setMotionPaused(false);

      const pulso = scene.tweens.add.mock.calls[1][0] as { alpha: { from: number } };
      expect(pulso.alpha.from).toBe(fija);
    });

    it('tensa se ve fija y sin pulso; serena no se ve ni lanza con un valor roto', () => {
      const tensa = crearEscena();
      tensa.scene.setPersonaScene('TENSE', 'MEDIUM');
      expect(tensa.vignette!.alpha).toBe(crisisVignetteState('TENSE', 'MEDIUM', false).alpha);
      expect(tensa.vignette!.alpha).toBeGreaterThan(0);
      expect(tensa.scene.tweens.add).not.toHaveBeenCalled();

      const serena = crearEscena();
      serena.scene.setPersonaScene('CALM', 'MEDIUM');
      expect(serena.vignette!.alpha).toBe(0);
      expect(serena.scene.tweens.add).not.toHaveBeenCalled();

      const roto = crearEscena();
      expect(() => roto.scene.setPersonaScene(undefined as never, undefined as never)).not.toThrow();
      expect(roto.vignette!.alpha).toBe(0);
      expect(roto.scene.tweens.add).not.toHaveBeenCalled();
    });

    it('una escena de intensidad alta oscurece un poco la viñeta', () => {
      const media = crearEscena();
      media.scene.setPersonaScene('TENSE', 'MEDIUM');
      const alta = crearEscena();
      alta.scene.setPersonaScene('TENSE', 'HIGH');
      expect(media.vignette!.alpha).toBe(crisisVignetteState('TENSE', 'MEDIUM', false).alpha);
      expect(alta.vignette!.alpha).toBe(crisisVignetteState('TENSE', 'HIGH', false).alpha);
      expect(alta.vignette!.alpha).toBeGreaterThan(media.vignette!.alpha);
    });

    it('antes de que exista la viñeta, la persona, movimiento reducido y pausa no lanzan ni tocan los tweens', () => {
      const { scene } = crearEscena({ conVineta: false });

      expect(() => {
        scene.setPersonaScene('CRISIS', 'HIGH');
        scene.setReduceMotion(true);
        scene.setMotionPaused(true);
      }).not.toThrow();
      expect(scene.tweens.add).not.toHaveBeenCalled();
    });
  });

  describe('efectos al revelar la sala', () => {
    const destello = () => roomEntryFlash('a', 'b', false);

    it('revelar la sala destella el cambio de sala una sola vez, suave, y nunca sacude la cámara (RN-08)', () => {
      const { scene, camera } = crearEscena();
      scene.pendingRoomFlash = destello();

      scene.playRevealEffects();
      expect(camera.flash).toHaveBeenCalledTimes(1);
      expect(camera.flash).toHaveBeenCalledWith(120, 214, 222, 236);
      expect(camera.flashEffect.alpha).toBe(roomEntryFlash('a', 'b', false)!.peakAlpha);
      expect(camera.flashEffect.alpha).toBeLessThanOrEqual(0.25);
      expect(camera.shake).not.toHaveBeenCalled();

      scene.playPendingRoomFlash();
      expect(camera.flash).toHaveBeenCalledTimes(1);
    });

    it('con movimiento reducido no hay sacudida ni destello', () => {
      const { scene, camera } = crearEscena({ reduceMotion: true });
      scene.pendingRoomFlash = destello();

      scene.playRevealEffects();

      expect(camera.shake).not.toHaveBeenCalled();
      expect(camera.flash).not.toHaveBeenCalled();
    });

    it('con la escena destruida no lanza', () => {
      const { scene } = crearEscena();
      scene.cameras = { main: undefined };
      scene.pendingRoomFlash = destello();

      expect(() => scene.playRevealEffects()).not.toThrow();
      scene.pendingRoomFlash = destello();
      expect(() => scene.playPendingRoomFlash()).not.toThrow();
    });
  });
});
