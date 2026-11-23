// Phaser toca canvas/WebGL al importarse (jsdom no lo soporta). Solo se evalúa
// `extends Phaser.Scene` al cargar el módulo; la escena nunca arranca aquí.
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

import { SimulationWorldState } from '../../core/models/simulation.model';
import { DataDrivenWorldScene } from './game-world.component';

interface CollisionProbe {
  world?: SimulationWorldState;
  wouldCollide(x: number, y: number): boolean;
}

/** Escena sin arrancar con un mundo de hospital-urgencias (geometría local del caso PDF). */
function sceneWith(collisions: SimulationWorldState['collisions']): CollisionProbe {
  const scene = new DataDrivenWorldScene({} as never) as unknown as CollisionProbe;
  scene.world = {
    map: { key: 'hospital-urgencias', width: 960, height: 528 },
    collisions,
    objects: [],
  } as unknown as SimulationWorldState;
  return scene;
}

describe('DataDrivenWorldScene.wouldCollide — autoridad espacial del servidor', () => {
  it('bloquea una posición que solo rechaza la geometría de la BD', () => {
    // (320, 430) está libre en caseRoomCollisions('hospital-urgencias'), pero la
    // BD declara una zona extra ahí: el servidor rechazaría esa posición.
    const scene = sceneWith([{ key: 'extra', label: null, x: 300, y: 400, width: 40, height: 40 }]);

    expect(scene.wouldCollide(320, 430)).toBe(true);
  });

  it('conserva la geometría local de la sala aunque la BD no la declare', () => {
    expect(sceneWith([]).wouldCollide(450, 280)).toBe(true); // mostrador de triage
  });

  it('acepta un punto libre en ambas geometrías', () => {
    expect(sceneWith([]).wouldCollide(480, 430)).toBe(false);
  });
});
