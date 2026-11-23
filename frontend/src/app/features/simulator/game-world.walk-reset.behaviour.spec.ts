// Mismo andamiaje que game-world.game-feel.behaviour.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo
// soporta). Solo se evalúa `extends Phaser.Scene`; la escena nunca arranca aquí.
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

import { DataDrivenWorldScene } from './game-world.component';
import { NO_WALK, WalkState, startWalk } from './world-walk.util';

/** Superficie privada de la escena que estos casos ejercitan (la escena nunca arranca). */
interface SceneProbe {
  ready: boolean;
  walk: WalkState;
  walkGoal: { key: string; label: string } | null;
  setWorld(world: unknown): void;
}

const world = (key: string) => ({ map: { key } });

function crearEscena(): SceneProbe {
  const callbacks = { reduceMotion: false, onProximity: vi.fn(), onProximityAlso: vi.fn() };
  const scene = new DataDrivenWorldScene(callbacks as never) as unknown as SceneProbe;
  scene.ready = false; // sin Phaser no hay render: solo importa el estado de la caminata
  return scene;
}

describe('DataDrivenWorldScene.setWorld: la caminata del ratón no cruza de mapa (revisión de F6)', () => {
  // req: BLOQUE-H, RNF-04 (VD-5)
  it('un mapa nuevo suelta la caminata y el destino de «Ir a…» (casos del editor, render heredado)', () => {
    const scene = crearEscena();
    scene.setWorld(world('sala-a'));
    scene.walk = startWalk({ x: 120, y: 80, radius: 6 });
    scene.walkGoal = { key: 'puerta-b', label: 'Puerta' };

    scene.setWorld(world('sala-b'));

    expect(scene.walk).toEqual(NO_WALK);
    expect(scene.walkGoal).toBeNull();
  });

  it('un refresco del MISMO mapa conserva la caminata en curso', () => {
    const scene = crearEscena();
    scene.setWorld(world('sala-a'));
    scene.walk = startWalk({ x: 120, y: 80, radius: 6 });
    scene.walkGoal = { key: 'puerta-b', label: 'Puerta' };

    scene.setWorld(world('sala-a'));

    expect(scene.walk.target).toEqual({ x: 120, y: 80, radius: 6 });
    expect(scene.walkGoal).toEqual({ key: 'puerta-b', label: 'Puerta' });
  });
});
