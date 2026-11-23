// Mismo andamiaje que game-world.interaction.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo
// soporta). Solo se evalúa `extends Phaser.Scene`; la escena nunca arranca aquí: se le dan dobles mínimos.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: {
      Clamp: (value: number) => value,
      Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
    },
    Input: { Keyboard: { JustDown: () => false } },
    Game: class {},
  },
}));

import type { Mock } from 'vitest';
import { NpcConfig, NpcMotionConfig } from '../../core/models/simulation.model';
import { DataDrivenWorldScene } from './game-world.component';
import { MovementPattern } from './scene-motion.util';

/**
 * Caracteriza el movimiento de las personas (NPC) y de los objetos con vida ambiental ANTES de
 * reorganizar la elección de destino con Strategy (P-10): qué hace cada comportamiento, cuándo
 * espera, cómo bordea obstáculos y cómo cicla por las anclas o los puntos de patrulla.
 * Los casos marcados «comportamiento actual» fijan rarezas que P-10 no debe cambiar en silencio.
 */

interface Point { x: number; y: number }
interface FakeNode { x: number; y: number; setPosition: Mock }

interface NpcMoverProbe {
  key: string;
  cfg: NpcMotionConfig;
  zone: { x: number; y: number; width: number; height: number };
  target: Point | null;
  anchorIdx: number;
  pauseUntil: number;
  lastPose: { direction: string | null; walking: boolean };
}

interface AmbientMoverProbe {
  key: string;
  origin: Point;
  pattern: MovementPattern;
  target: Point | null;
  retargetAt: number;
  patrolIdx: number;
}

/** Superficie privada de la escena que estos casos ejercitan. */
interface MotionScene {
  player: Point | undefined;
  npcMarkers: Map<string, FakeNode>;
  npcMovers: Map<string, NpcMoverProbe>;
  markers: Map<string, FakeNode>;
  ambientMovers: Map<string, AmbientMoverProbe>;
  motionPaused: boolean;
  time: { now: number };
  wouldCollide: (x: number, y: number) => boolean;
  registerNpcMover(npc: NpcConfig, pos: Point): void;
  updateNpcMovers(time: number, delta: number): void;
  updateAmbientMovers(time: number, delta: number): void;
  nextNpcTarget(mover: NpcMoverProbe, container: FakeNode): Point | null;
  nextAmbientTarget(mover: AmbientMoverProbe): Point | null;
}

function node(x: number, y: number): FakeNode {
  const self: FakeNode = {
    x, y,
    setPosition: vi.fn((nx: number, ny: number) => { self.x = nx; self.y = ny; return self; }),
  };
  return self;
}

function crearEscena(reduceMotion = false): MotionScene {
  const scene = new DataDrivenWorldScene({ reduceMotion } as never) as unknown as MotionScene;
  scene.player = undefined;
  scene.npcMarkers = new Map();
  scene.npcMovers = new Map();
  scene.markers = new Map();
  scene.ambientMovers = new Map();
  scene.time = { now: 0 };
  scene.wouldCollide = () => false;
  return scene;
}

function addNpc(scene: MotionScene, motion: NpcMotionConfig, at: Point = { x: 100, y: 100 }) {
  const container = node(at.x, at.y);
  scene.npcMarkers.set('npc-1', container);
  scene.registerNpcMover({ key: 'npc-1', motion, facing: 'down' } as NpcConfig, at);
  return { mover: scene.npcMovers.get('npc-1')!, container };
}

function addAmbient(scene: MotionScene, pattern: MovementPattern, at: Point) {
  const marker = node(at.x, at.y);
  scene.markers.set('obj-1', marker);
  const mover: AmbientMoverProbe = { key: 'obj-1', origin: { ...at }, pattern, target: null, retargetAt: 0, patrolIdx: 0 };
  scene.ambientMovers.set('obj-1', mover);
  return { mover, marker };
}

/** Fija los próximos valores de Math.random; el último se repite. */
function rand(...values: number[]) {
  const spy = vi.spyOn(Math, 'random');
  for (const v of values) spy.mockReturnValueOnce(v);
  spy.mockReturnValue(values[values.length - 1] ?? 0.5);
  return spy;
}

afterEach(() => vi.restoreAllMocks());

describe('movimiento de personas (NPC): registro', () => {
  it('una persona sin motion no se registra; con motion nace con su zona, su espera inicial y su mirada', () => {
    const scene = crearEscena();
    scene.registerNpcMover({ key: 'quieta', facing: 'down' } as NpcConfig, { x: 10, y: 10 });
    expect(scene.npcMovers.size).toBe(0);

    scene.time.now = 1000;
    scene.registerNpcMover(
      { key: 'ronda', motion: { behavior: 'subtle-wander', radius: 20 }, facing: 'left' } as NpcConfig,
      { x: 100, y: 100 },
    );

    expect(scene.npcMovers.get('ronda')).toMatchObject({
      key: 'ronda', target: null, anchorIdx: 0, pauseUntil: 1000 + 600,
      zone: { x: 80, y: 80, width: 40, height: 40 },
      lastPose: { direction: 'left', walking: false },
    });
  });

  it('startDelayMs reemplaza los 600 ms de espera inicial', () => {
    const scene = crearEscena();
    scene.time.now = 50;
    scene.registerNpcMover(
      { key: 'n', motion: { behavior: 'idle', startDelayMs: 0 }, facing: 'down' } as NpcConfig, { x: 0, y: 0 },
    );
    expect(scene.npcMovers.get('n')!.pauseUntil).toBe(50);
  });
});

describe('movimiento de personas (NPC): subtle-wander', () => {
  it('elige un punto de su zona y camina hacia él a 18 px/s', () => {
    const scene = crearEscena();
    rand(0.75, 0.5); // zona 60..140 → destino (120, 100)
    const { mover, container } = addNpc(scene, { behavior: 'subtle-wander', radius: 40, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect(mover.target).toEqual({ x: 120, y: 100 });
    expect([container.x, container.y]).toEqual([109, 100]); // 18 px/s × 0,5 s = 9 px
    // Nace de frente y echa a andar a la derecha: el giro pasa por la vista de en medio (8 direcciones).
    expect(mover.lastPose).toEqual({ direction: 'down-right', walking: true });
  });

  it('respeta la espera inicial: antes de pauseUntil no pide destino ni se mueve', () => {
    const scene = crearEscena();
    rand(0.75, 0.5);
    const { mover, container } = addNpc(scene, { behavior: 'subtle-wander', radius: 40 }); // espera 600 ms

    scene.updateNpcMovers(599, 500);
    expect([mover.target, container.x, container.y]).toEqual([null, 100, 100]);

    scene.updateNpcMovers(600, 500);
    expect(mover.target).toEqual({ x: 120, y: 100 });
    expect(container.x).toBe(109);
  });

  it('da el destino por alcanzado a ≤ 2 px: queda quieto, mira hacia donde iba y espera 2400 ms', () => {
    const scene = crearEscena();
    rand(0.75, 0.5); // zona 80..120 → destino (110, 100): un paso de 9 px lo deja a 1 px
    const { mover, container } = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect(container.x).toBe(109);
    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(2400);
    expect(mover.lastPose).toEqual({ direction: 'down-right', walking: false });
    scene.updateNpcMovers(100, 100);   // en la pausa termina el giro
    expect(mover.lastPose).toEqual({ direction: 'right', walking: false });
  });

  it('con el destino bloqueado no se mueve y vuelve a intentar 600 ms después', () => {
    const scene = crearEscena();
    scene.wouldCollide = () => true;
    rand(0.75, 0.5);
    const { mover, container } = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(600);
    expect([container.x, container.y]).toEqual([100, 100]);
  });

  it('bloqueado del todo en el camino: descarta el destino y espera 900 ms sin caminar', () => {
    const scene = crearEscena();
    let calls = 0;
    scene.wouldCollide = () => calls++ > 0; // el destino está libre; el camino, no
    rand(0.75, 0.5);
    const { mover, container } = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(900);
    expect([container.x, container.y]).toEqual([100, 100]);
    expect(mover.lastPose.walking).toBe(false);
  });

  it('si la diagonal choca, se desliza por el eje X libre', () => {
    const scene = crearEscena();
    const answers = [false, true, false]; // destino libre, diagonal bloqueada, solo X libre
    let i = 0;
    scene.wouldCollide = () => answers[i++] ?? false;
    rand(0.75, 0.25); // destino (110, 90)
    const { container } = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect(container.x).toBeCloseTo(106.364, 3);
    expect(container.y).toBe(100);
  });

  it('si X también choca, se desliza por el eje Y libre', () => {
    const scene = crearEscena();
    const answers = [false, true, true, false]; // destino libre, diagonal y X bloqueadas, Y libre
    let i = 0;
    scene.wouldCollide = () => answers[i++] ?? false;
    rand(0.75, 0.25);
    const { container } = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect(container.x).toBe(100);
    expect(container.y).toBeCloseTo(93.636, 3);
  });
});

describe('movimiento de personas (NPC): pace y patrol por anclas', () => {
  const anchors = [{ x: 110, y: 100, pauseMs: 1000, face: 'up' as const }, { x: 110, y: 130 }];

  it('pace va al primer ancla, mira hacia su `face`, espera su pauseMs y pasa al siguiente', () => {
    const scene = crearEscena();
    const { mover, container } = addNpc(scene, { behavior: 'pace', anchors, speed: 100, startDelayMs: 0 });

    scene.updateNpcMovers(0, 100); // 100 px/s × 0,1 s = 10 px: llega justo

    expect([container.x, container.y]).toEqual([110, 100]);
    expect(mover.anchorIdx).toBe(1);
    expect(mover.pauseUntil).toBe(1000);
    expect(mover.target).toBeNull();
    scene.updateNpcMovers(100, 300);   // en la pausa gira hacia su `face` pasando por las vistas de en medio
    expect(mover.lastPose).toEqual({ direction: 'up', walking: false });
  });

  it('durante la pausa no se mueve; al terminar va al ancla siguiente y, al llegar, vuelve al primero', () => {
    const scene = crearEscena();
    const { mover, container } = addNpc(scene, { behavior: 'pace', anchors, speed: 100, startDelayMs: 0 });
    scene.updateNpcMovers(0, 100);

    scene.updateNpcMovers(500, 100);
    expect([container.x, container.y]).toEqual([110, 100]); // en pausa

    scene.updateNpcMovers(1000, 100);
    expect(mover.target).toEqual({ x: 110, y: 130 });
    expect(container.y).toBe(110);
    scene.updateNpcMovers(1100, 100);
    scene.updateNpcMovers(1200, 100); // llega a (110, 130)

    expect(container.y).toBe(130);
    expect(mover.anchorIdx).toBe(0);              // cíclico: 0 → 1 → 0
    expect(mover.pauseUntil).toBe(1200 + 1600);   // sin pauseMs: la de `pace` por defecto
    expect(mover.target).toBeNull();
  });

  it('patrol usa las mismas anclas y su pausa por defecto (900 ms)', () => {
    const scene = crearEscena();
    const { mover } = addNpc(scene, {
      behavior: 'patrol', anchors: [{ x: 110, y: 100 }], speed: 100, startDelayMs: 0,
    });

    scene.updateNpcMovers(0, 100);

    expect(mover.pauseUntil).toBe(900);
    expect(mover.anchorIdx).toBe(0); // un solo ancla: vuelve a sí mismo
  });

  it('sin anclas no hay destino: espera 600 ms', () => {
    const scene = crearEscena();
    const { mover, container } = addNpc(scene, { behavior: 'pace', startDelayMs: 0 });

    scene.updateNpcMovers(0, 100);

    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(600);
    expect([container.x, container.y]).toEqual([100, 100]);
  });

  it('comportamiento actual: subtle-wander con anclas no las recorre, pero sí usa su cara y su pausa al llegar', () => {
    const scene = crearEscena();
    rand(0.75, 0.5); // destino (110, 100), a 10 px
    const { mover, container } = addNpc(scene, {
      behavior: 'subtle-wander', radius: 20, speed: 100, startDelayMs: 0,
      anchors: [{ x: 5, y: 5, pauseMs: 333, face: 'left' }],
    });

    scene.updateNpcMovers(0, 100);

    expect([container.x, container.y]).toEqual([110, 100]); // fue a su destino aleatorio, no al ancla
    scene.updateNpcMovers(100, 300);   // en la pausa gira hacia la cara del ancla
    expect(mover.lastPose).toEqual({ direction: 'left', walking: false });
    expect(mover.pauseUntil).toBe(333);
    expect(mover.anchorIdx).toBe(0); // no avanza: solo pace y patrol ciclan
  });
});

describe('movimiento de personas (NPC): avoidant', () => {
  const zone = { x: 50, y: 50, width: 100, height: 100 };
  const cfg: NpcMotionConfig = { behavior: 'avoidant', zone, startDelayMs: 0 };

  it('sin jugador no reacciona: espera 600 ms', () => {
    const scene = crearEscena();
    const { mover } = addNpc(scene, cfg);

    scene.updateNpcMovers(0, 500);

    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(600);
  });

  it('solo reacciona con el jugador a 70 px o menos', () => {
    const scene = crearEscena();
    scene.player = { x: 180, y: 100 }; // a 80 px
    const { mover } = addNpc(scene, cfg);

    scene.updateNpcMovers(0, 500);

    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(600);
  });

  it('con el jugador cerca da un paso corto (16 px) hacia el punto de la zona más lejano a él', () => {
    const scene = crearEscena();
    scene.player = { x: 160, y: 100 }; // a 60 px
    rand(0); // todos los candidatos caen en la esquina (50, 50)
    const { mover, container } = addNpc(scene, cfg);

    scene.updateNpcMovers(0, 500);

    expect(mover.target!.x).toBeCloseTo(88.686, 3);
    expect(mover.target!.y).toBeCloseTo(88.686, 3);
    expect(container.x).toBeLessThan(100); // se aleja del jugador
    expect(container.y).toBeLessThan(100);
  });

  it('si el punto elegido está bloqueado no se mueve', () => {
    const scene = crearEscena();
    scene.player = { x: 160, y: 100 };
    scene.wouldCollide = () => true;
    rand(0);
    const { mover } = addNpc(scene, cfg);

    scene.updateNpcMovers(0, 500);

    expect(mover.target).toBeNull();
    expect(mover.pauseUntil).toBe(600);
  });
});

describe('movimiento de personas (NPC): quietas y movimiento reducido', () => {
  it('idle nunca se traslada ni pide destino', () => {
    const scene = crearEscena();
    const { container } = addNpc(scene, { behavior: 'idle', startDelayMs: 0 });
    const pick = vi.spyOn(scene, 'nextNpcTarget');

    scene.updateNpcMovers(0, 500);
    scene.updateNpcMovers(5000, 500);

    expect(pick).not.toHaveBeenCalled();
    expect([container.x, container.y]).toEqual([100, 100]);
  });

  it('attentive gira hacia el jugador a 110 px o menos y nunca se traslada', () => {
    const scene = crearEscena();
    scene.player = { x: 200, y: 100 }; // a 100 px, a su derecha
    const { mover, container } = addNpc(scene, { behavior: 'attentive' });

    scene.updateNpcMovers(0, 500);
    scene.updateNpcMovers(500, 100);   // de frente a la derecha: el giro pasa por la vista de en medio

    expect(mover.lastPose).toEqual({ direction: 'right', walking: false });
    expect([container.x, container.y]).toEqual([100, 100]);
  });

  it('attentive no reacciona a más de 110 px', () => {
    const scene = crearEscena();
    scene.player = { x: 250, y: 100 }; // a 150 px
    const { mover } = addNpc(scene, { behavior: 'attentive' });

    scene.updateNpcMovers(0, 500);

    expect(mover.lastPose).toEqual({ direction: 'down', walking: false });
  });

  it('con movimiento reducido solo queda idle, salvo attentive que sigue girando', () => {
    const scene = crearEscena(true);
    rand(0.75, 0.5);
    scene.player = { x: 200, y: 100 };
    const walker = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);
    expect(walker.mover.target).toBeNull();
    expect([walker.container.x, walker.container.y]).toEqual([100, 100]);

    scene.npcMovers.clear();
    const watcher = addNpc(scene, { behavior: 'attentive' });
    scene.updateNpcMovers(0, 500);
    expect(watcher.mover.lastPose.direction).toBe('right');
  });

  it('con el mundo en pausa (diálogo abierto) nada se mueve', () => {
    const scene = crearEscena();
    rand(0.75, 0.5);
    scene.motionPaused = true;
    const { mover, container } = addNpc(scene, { behavior: 'subtle-wander', radius: 20, startDelayMs: 0 });

    scene.updateNpcMovers(0, 500);

    expect([mover.target, container.x, container.y]).toEqual([null, 100, 100]);
  });
});

describe('movimiento ambiental de objetos: wander y patrol', () => {
  it('wander elige un punto a ≤ radius del origen y avanza a 22 px/s', () => {
    const scene = crearEscena();
    rand(0.25, 0.5); // ángulo π/2, a la mitad del radio → 15 px hacia abajo
    const { mover, marker } = addAmbient(scene, { type: 'wander', radius: 30 }, { x: 200, y: 200 });

    scene.updateAmbientMovers(0, 1000);

    expect(mover.target!.x).toBeCloseTo(200, 6);
    expect(mover.target!.y).toBeCloseTo(215, 6);
    expect(mover.retargetAt).toBe(2600);
    expect(marker.y).toBeCloseTo(215, 6); // 22 px alcanzan: llega de una vez
  });

  it('wander nunca se aleja más de su radio, sea cual sea el azar', () => {
    const scene = crearEscena();
    const { mover } = addAmbient(scene, { type: 'wander', radius: 30 }, { x: 200, y: 200 });
    for (const a of [0, 0.3, 0.6, 0.99]) {
      for (const r of [0, 0.5, 0.999]) {
        rand(a, r);
        const t = scene.nextAmbientTarget(mover)!;
        expect(Math.hypot(t.x - 200, t.y - 200)).toBeLessThanOrEqual(30 + 1e-9);
      }
    }
  });

  it('comportamiento actual: patrol arranca en el punto 1 (el 0 queda para el final de la primera vuelta)', () => {
    const scene = crearEscena();
    const points: Array<[number, number]> = [[10, 10], [50, 10], [50, 50]];
    const { mover } = addAmbient(scene, { type: 'patrol', points }, { x: 10, y: 10 });

    const visited = [1, 2, 3, 4].map(() => scene.nextAmbientTarget(mover));

    expect(visited).toEqual([{ x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 10 }, { x: 50, y: 10 }]);
    expect(mover.patrolIdx).toBe(1);
  });

  it('patrol de un solo punto siempre devuelve ese punto', () => {
    const scene = crearEscena();
    const { mover } = addAmbient(scene, { type: 'patrol', points: [[10, 10]] }, { x: 0, y: 0 });

    expect(scene.nextAmbientTarget(mover)).toEqual({ x: 10, y: 10 });
    expect(scene.nextAmbientTarget(mover)).toEqual({ x: 10, y: 10 });
    expect(mover.patrolIdx).toBe(0);
  });

  it('patrol sin puntos o un patrón idle no dan destino', () => {
    const scene = crearEscena();
    const empty = addAmbient(scene, { type: 'patrol', points: [] }, { x: 0, y: 0 }).mover;
    expect(scene.nextAmbientTarget(empty)).toBeNull();
    expect(empty.patrolIdx).toBe(0);

    const idle: AmbientMoverProbe = { key: 'x', origin: { x: 0, y: 0 }, pattern: { type: 'idle' }, target: null, retargetAt: 0, patrolIdx: 0 };
    expect(scene.nextAmbientTarget(idle)).toBeNull();
  });

  it('camina por la ruta de patrol a 22 px/s, empezando por el punto 1', () => {
    const scene = crearEscena();
    const { mover, marker } = addAmbient(scene, { type: 'patrol', points: [[10, 10], [50, 10]] }, { x: 10, y: 10 });

    scene.updateAmbientMovers(0, 1000);

    expect(mover.patrolIdx).toBe(1);
    expect([marker.x, marker.y]).toEqual([32, 10]);
  });

  it('con el destino bloqueado se queda quieto y pide otro después', () => {
    const scene = crearEscena();
    scene.wouldCollide = () => true;
    rand(0.25, 0.5);
    const { mover, marker } = addAmbient(scene, { type: 'wander', radius: 30 }, { x: 200, y: 200 });

    scene.updateAmbientMovers(0, 1000);

    expect(mover.target).toBeNull();
    expect([marker.x, marker.y]).toEqual([200, 200]);
  });

  it('cambia de destino cuando vence el tiempo aunque no haya llegado', () => {
    const scene = crearEscena();
    rand(0.25, 0.5);
    const { mover } = addAmbient(scene, { type: 'wander', radius: 30 }, { x: 200, y: 200 });
    mover.target = { x: 5000, y: 5000 };
    mover.retargetAt = 100;

    scene.updateAmbientMovers(100, 16);

    expect(mover.target!.y).toBeCloseTo(215, 6);
    expect(mover.retargetAt).toBe(2700);
  });

  it('con movimiento reducido o el mundo en pausa nada se mueve', () => {
    const reduced = crearEscena(true);
    rand(0.25, 0.5);
    const a = addAmbient(reduced, { type: 'wander', radius: 30 }, { x: 200, y: 200 });
    reduced.updateAmbientMovers(0, 1000);
    expect([a.mover.target, a.marker.x, a.marker.y]).toEqual([null, 200, 200]);

    const paused = crearEscena();
    paused.motionPaused = true;
    const b = addAmbient(paused, { type: 'wander', radius: 30 }, { x: 200, y: 200 });
    paused.updateAmbientMovers(0, 1000);
    expect([b.mover.target, b.marker.x, b.marker.y]).toEqual([null, 200, 200]);
  });
});
