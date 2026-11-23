// Mismo andamiaje que game-world.key-person.spec.ts: Phaser toca canvas/WebGL al importarse; la escena nunca arranca, se le dan dobles mínimos.
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
    Loader: { Events: { COMPLETE: 'complete', PROGRESS: 'progress' } },
    Game: class {},
  },
}));

import { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import type { Gesto } from './caso/vocabulario';
import { DataDrivenWorldScene, GameWorldComponent } from './game-world.component';
import type { Mock } from 'vitest';

/**
 * Órdenes angostas del mundo (bloque B, tarea 5): encuadrar, gesto y estado en palabras de la persona clave. La escena
 * solo ejecuta; qué gesto y cuándo lo decide el director.
 */

const persona = (key: string, x: number, y: number, extra: Partial<MapObjectState> = {}): MapObjectState => ({
  key, label: 'Marta', type: 'PERSON', x, y, width: 48, height: 48, color: '#4fa3a5', icon: 'person', shortCode: '',
  collision: false, interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  metadata: { personaClave: true }, ...extra,
});

interface FakeBox {
  x: number; y: number; angle: number; scene: object | null;
  setPosition: Mock; setAngle: Mock; destroy: Mock; setDepth: Mock; setScale: Mock;
}
interface FakeText { text: string; setOrigin: Mock }
interface TweenConfig { targets: FakeBox; x: number; y: number; angle: number; onComplete: () => void; onStop: () => void }

function caja(x: number, y: number): FakeBox {
  const c = { x, y, angle: 0, scene: {} } as FakeBox;
  c.setPosition = vi.fn((nx: number, ny: number) => { c.x = nx; c.y = ny; return c; });
  c.setAngle = vi.fn((a: number) => { c.angle = a; return c; });
  c.destroy = vi.fn(() => { c.scene = null; });
  c.setDepth = vi.fn(() => c);
  c.setScale = vi.fn(() => c);
  return c;
}

interface SceneProbe {
  world: SimulationWorldState; player?: FakeBox;
  markers: Map<string, FakeBox>; markerData: Map<string, MapObjectState>; npcMarkers: Map<string, FakeBox>;
  add: Record<string, Mock>; tweens: unknown; cameras: { main: Record<string, unknown> };
  labelScale: number;
  frameActors(key: string): void;
  releaseFrame(): void;
  playGesture(key: string, gesto: Gesto): Promise<void>;
  setPersonaState(text: string | null): void;
  buildKeyPersonIndicator(marker: FakeBox, object: MapObjectState): void;
  resetOrientationVisuals(): void;
  endGestures(): void;
  isGesturing(key: string): boolean;
}

interface Opciones { jugador?: { x: number; y: number }; reduceMotion?: boolean }

function escenaConPersona(key: string, at: { x: number; y: number }, opciones: Opciones = {}) {
  const scene = new DataDrivenWorldScene({
    reduceMotion: opciones.reduceMotion ?? false, sfxMuted: true,
  } as never) as unknown as SceneProbe;
  const objeto = persona(key, at.x, at.y);
  scene.world = { map: { key: 'sala', width: 960, height: 528 }, objects: [objeto], collisions: [], inventory: [] } as unknown as SimulationWorldState;
  const marker = caja(at.x, at.y);
  scene.markers = new Map([[key, marker]]);
  scene.markerData = new Map([[key, objeto]]);
  scene.npcMarkers = new Map();
  scene.labelScale = 1;
  if (opciones.jugador) scene.player = caja(opciones.jugador.x, opciones.jugador.y);
  const reloj = relojDeEscena(scene);   // mirar sostiene la mirada con un aviso de reloj

  // Lienzo de 1366×650 a dpr 1: zoom normal 1 y cercano 2 en una sala de 960 (bloque M1).
  const camera = {
    stopFollow: vi.fn(), pan: vi.fn(), startFollow: vi.fn(), removeBounds: vi.fn(), centerOn: vi.fn(),
    width: 1366, height: 650, zoom: 1, fadeEffect: { isRunning: false },
    setZoom: vi.fn(function (this: { zoom: number }, k: number) { this.zoom = k; }),
  };
  scene.cameras = { main: camera };

  const pendientes: TweenConfig[] = [];
  const tweens = {
    add: vi.fn((config: TweenConfig) => { pendientes.push(config); }),
    /** Termina los tramos uno tras otro (cada uno encadena el siguiente) dejando al marcador donde cada tramo lo manda. */
    completarTodos: (desvio = 0) => {
      while (pendientes.length > 0) {
        const t = pendientes.shift()!;
        t.targets.x = t.x + desvio; t.targets.y = t.y; t.targets.angle = t.angle;
        t.onComplete();
      }
    },
    /** Como Phaser 4: `killAll` destruye los tweens sin emitir `stop` ni `complete`. */
    killAll: vi.fn(() => { pendientes.length = 0; }),
  };
  scene.tweens = tweens;

  const textos: FakeText[] = [];
  scene.add = {
    graphics: vi.fn(() => {
      const g: Record<string, Mock> = {};
      for (const m of ['fillStyle', 'lineStyle', 'fillTriangle', 'strokeTriangle']) g[m] = vi.fn(() => g);
      return g;
    }),
    text: vi.fn((_x: number, _y: number, text: string) => {
      const t = { text } as FakeText;
      t.setOrigin = vi.fn(() => t);
      textos.push(t);
      return t;
    }),
    container: vi.fn((x: number, y: number) => caja(x, y)),
  };
  return { scene, camera, tweens, marker, reloj, textos: () => textos };
}

/** La sala se repinta: el indicador anterior desaparece (`resetOrientationVisuals`) y se vuelve a crear con la escena. */
function escenaConPersonaClave(key: string) {
  const base = escenaConPersona(key, { x: 400, y: 300 });
  const objeto = base.scene.markerData.get(key)!;
  base.scene.buildKeyPersonIndicator(base.marker, objeto);
  const repintar = () => {
    base.scene.resetOrientationVisuals();
    base.scene.buildKeyPersonIndicator(base.marker, objeto);
  };
  return { ...base, repintar };
}

describe('mundo: encuadre', () => {
  // Bloque M1: la cámara la decide el controlador cada cuadro (`stepCamera`); el encuadre es un momento, no un `pan`.
  const cuadro = (scene: unknown) => (scene as { stepCamera(delta: number): void }).stepCamera(16);

  // A 1366×650 en una sala de 960: plano general ×1, caminar ×2 y cercano ×3 (regla 7).
  it('en la reacción la cámara va a quien reacciona, de cerca', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 } });
    scene.frameActors('familia');
    cuadro(scene);
    expect(camera.setZoom).toHaveBeenLastCalledWith(3);
    expect(camera.centerOn).toHaveBeenLastCalledWith(480, expect.any(Number));
    expect(camera.pan).not.toHaveBeenCalled();
    expect(camera.startFollow).not.toHaveBeenCalled();
  });

  it('con una clave que no está en la sala la cámara sigue en el plano de caminar', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 } });
    scene.frameActors('nadie');
    cuadro(scene);
    expect(camera.zoom).toBe(2);
  });

  it('releaseFrame sostiene un momento el plano (sin amagar) y después vuelve al de caminar', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 }, reduceMotion: true });
    const probe = scene as unknown as { time: { now: number } };
    probe.time = { now: 0 };
    scene.frameActors('familia');
    cuadro(scene);
    expect(camera.zoom).toBe(3);
    scene.releaseFrame();
    probe.time.now = 100;
    cuadro(scene);
    expect(camera.zoom).toBe(3);
    probe.time.now = 1500;
    cuadro(scene);
    expect(camera.zoom).toBe(2);
  });

  it('si el personaje echa a andar, el plano sostenido se suelta enseguida', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 }, reduceMotion: true });
    const probe = scene as unknown as { time: { now: number }; player: { x: number; y: number } };
    probe.time = { now: 0 };
    scene.frameActors('familia');
    cuadro(scene);
    scene.releaseFrame();
    probe.player.x = 380;
    probe.time.now = 100;
    cuadro(scene);
    expect(camera.zoom).toBe(2);
  });

  it('entre un plano y otro viaja: pasa por un zoom intermedio dibujado al entero de abajo y llega exacto', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 } });
    const probe = scene as unknown as { camNow(): number; time: { now: number } };
    probe.time = { now: 0 };
    cuadro(scene);                                   // corte al plano de caminar (×2)
    expect(camera.zoom).toBe(2);
    scene.frameActors('familia');
    probe.time.now = 1;
    cuadro(scene);                                   // empieza el viaje (700 ms)
    probe.time.now = 350;
    cuadro(scene);                                   // a mitad: zoom entre 2 y 3, la escena dibuja a ×2
    expect(camera.zoom).toBe(2);
    probe.time.now = 800;
    cuadro(scene);                                   // llegó: ×3 exacto
    expect(camera.zoom).toBe(3);
  });

  it('con el lienzo todavía sin tamaño la cámara espera y encuadra al tenerlo', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 } });
    camera.height = 1;
    cuadro(scene);
    expect(camera.setZoom).not.toHaveBeenCalled();
    camera.height = 650;
    cuadro(scene);
    expect(camera.zoom).toBe(2);
  });

  it('durante un fundido de puerta la cámara no cambia de zoom', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 480, y: 300 }, { jugador: { x: 400, y: 300 } });
    camera.fadeEffect.isRunning = true;
    scene.frameActors('familia');
    cuadro(scene);
    expect(camera.setZoom).not.toHaveBeenCalled();
  });
});

describe('mundo: gesto', () => {
  it('con movimiento reducido no encuadra ni hace gesto', async () => {
    const { scene, camera, tweens } = escenaConPersona('familia', { x: 400, y: 300 }, { reduceMotion: true, jugador: { x: 200, y: 300 } });
    scene.frameActors('familia');
    await scene.playGesture('familia', 'se-acerca');
    expect(camera.pan).not.toHaveBeenCalled();
    expect(tweens.add).not.toHaveBeenCalled();
  });

  it('el gesto anima al marcador y lo deja en su sitio', async () => {
    const { scene, marker, tweens } = escenaConPersona('familia', { x: 400, y: 300 });
    const done = scene.playGesture('familia', 'se-agita');
    tweens.completarTodos(7);   // el último tramo deja al marcador desviado: solo el ajuste final lo devuelve
    await done;
    expect(tweens.add).toHaveBeenCalled();
    expect({ x: marker.x, y: marker.y, angle: marker.angle }).toEqual({ x: 400, y: 300, angle: 0 });
  });

  it('se-acerca camina hacia el jugador y se-aparta se aleja', () => {
    const acerca = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    void acerca.scene.playGesture('familia', 'se-acerca');
    expect(acerca.tweens.add.mock.calls[0][0].x).toBeLessThan(400);
    const aparta = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    void aparta.scene.playGesture('familia', 'se-aparta');
    expect(aparta.tweens.add.mock.calls[0][0].x).toBeGreaterThan(400);
  });

  it('un gesto sobre una clave que no está resuelve sin error', async () => {
    const { scene } = escenaConPersona('familia', { x: 400, y: 300 });
    await expect(scene.playGesture('nadie', 'asiente')).resolves.toBeUndefined();
  });

  it('un repintado de la sala a mitad del gesto lo termina: resuelve, la persona vuelve a su sitio y puede gesticular otra vez', async () => {
    const { scene, marker, tweens } = escenaConPersona('familia', { x: 400, y: 300 });
    const done = scene.playGesture('familia', 'asiente');
    marker.x = 405;
    marker.angle = 3;
    scene.endGestures();   // lo que hace `renderWorld` justo antes de `tweens.killAll()` (Phaser descarta los tweens sin avisar)
    await expect(done).resolves.toBeUndefined();
    expect({ x: marker.x, y: marker.y, angle: marker.angle }).toEqual({ x: 400, y: 300, angle: 0 });
    expect(scene.isGesturing('familia')).toBe(false);
    const antes = tweens.add.mock.calls.length;
    void scene.playGesture('familia', 'asiente');
    expect(tweens.add.mock.calls.length).toBeGreaterThan(antes);
  });
});

describe('mundo: estado de la persona', () => {
  it('se escribe bajo su nombre y sobrevive a repintar la sala', () => {
    const { scene, textos, repintar } = escenaConPersonaClave('familia');
    scene.setPersonaState('La persona se abre y está serena');
    repintar();
    expect(textos().filter(t => t.text === 'La persona se abre y está serena')).toHaveLength(2);
  });

  it('null la quita y el siguiente repintado ya no la trae', () => {
    const { scene, textos, repintar } = escenaConPersonaClave('familia');
    scene.setPersonaState('Está en calma');
    scene.setPersonaState(null);
    const antes = textos().length;
    repintar();
    expect(textos().slice(antes).map(t => t.text)).toEqual(['Marta']);
  });
});

describe('componente: data-reaction', () => {
  function componenteConEscena() {
    const host = document.createElement('div');
    const { scene, tweens } = escenaConPersona('familia', { x: 400, y: 300 });
    const component = Object.create(GameWorldComponent.prototype) as Record<string, unknown>;
    component['gameHost'] = { nativeElement: host };
    component['scene'] = scene;
    return { component: component as unknown as GameWorldComponent, host, completar: tweens.completarTodos };
  }

  it('el host marca el gesto en curso y lo retira al terminar', async () => {
    const { component, host, completar } = componenteConEscena();
    const done = component.playGesture('familia', 'asiente');
    expect(host.getAttribute('data-reaction')).toBe('asiente');
    completar();
    await done;
    expect(host.hasAttribute('data-reaction')).toBe(false);
  });

  it('un gesto con {mark: false} (el automático al acercarse) no toca data-reaction, pero sí gesticula', async () => {
    const { component, host, completar } = componenteConEscena();
    const done = component.playGesture('familia', 'asiente', { mark: false });
    expect(host.hasAttribute('data-reaction')).toBe(false);
    completar();
    await done;
    expect(host.hasAttribute('data-reaction')).toBe(false);
    const decision = component.playGesture('familia', 'asiente');   // el de una decisión sigue marcando
    expect(host.getAttribute('data-reaction')).toBe('asiente');
    completar();
    await decision;
  });

  it('un segundo gesto sobre la misma persona (que no empieza) no retira la marca del primero', async () => {
    const { component, host, completar } = componenteConEscena();
    const primero = component.playGesture('familia', 'asiente');
    await component.playGesture('familia', 'se-agita');
    expect(host.getAttribute('data-reaction')).toBe('asiente');
    completar();
    await primero;
    expect(host.hasAttribute('data-reaction')).toBe(false);
  });
});

/**
 * Órdenes del mundo para mirar y anclar la burbuja (bloque B, tarea 20): solo lecturas y poses; quién reacciona lo decide
 * quien llama.
 */
interface MirarProbe extends SceneProbe {
  scale: { displayScale: { x: number; y: number } };
  personWalkers: Map<string, unknown>;
  faceTowards(key: string, target: 'player' | string, holdMs?: number): void;
  peopleNear(key: string, radiusPx: number): string[];
  screenAnchorOf(key: string): { x: number; y: number } | null;
  characterVisualOf(key: string): { key: string } | null;
  isKeyPerson(key: string): boolean;
}

const VISUAL = { key: 'v-abuela' };

function conSprite(marker: FakeBox) {
  const sprite = { play: vi.fn(), anims: { stop: vi.fn() }, setTexture: vi.fn() };
  const bag = marker as unknown as Record<string, unknown>;
  bag['__personSprite'] = sprite;
  bag['__personVisual'] = VISUAL;
  return sprite;
}

function escenaConVarias(gente: Record<string, { x: number; y: number; type?: string; npc?: boolean }>) {
  const base = escenaConPersona('relleno', { x: 0, y: 0 });
  const scene = base.scene as unknown as MirarProbe;
  scene.markers = new Map();
  scene.markerData = new Map();
  scene.npcMarkers = new Map();
  const objetos: MapObjectState[] = [];
  for (const [key, def] of Object.entries(gente)) {
    if (def.npc) { scene.npcMarkers.set(key, caja(def.x, def.y)); continue; }
    const objeto = persona(key, def.x, def.y, { type: (def.type ?? 'PERSON') as MapObjectState['type'], metadata: {} });
    objetos.push(objeto);
    scene.markers.set(key, caja(def.x, def.y));
    scene.markerData.set(key, objeto);
  }
  scene.world = { ...scene.world, objects: objetos } as SimulationWorldState;
  return { scene, reloj: base.reloj };
}

describe('mundo: mirar', () => {
  it('faceTowards voltea a la persona hacia el jugador sin moverla', () => {
    const { scene, marker, reloj } = escenaConPersona('abuela', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    const sprite = conSprite(marker);
    (scene as unknown as MirarProbe).faceTowards('abuela', 'player');
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down-left', true);   // de frente a la izquierda: la vista de en medio
    reloj.avanzar(80);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-left', true);
    expect({ x: marker.x, y: marker.y }).toEqual({ x: 400, y: 300 });
  });

  it('elige la más cercana de las ocho vistas, también hacia otra clave', () => {
    const { scene, reloj } = escenaConVarias({ abuela: { x: 400, y: 300 }, medico: { x: 420, y: 100 } });
    const sprite = conSprite(scene.markers.get('abuela')!);
    (scene as unknown as MirarProbe).faceTowards('abuela', 'medico');
    reloj.avanzar(240);   // de frente a arriba es media vuelta: pasa por tres vistas de en medio, 80 ms cada una
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-up', true);
  });

  it('una persona que camina mira y retoma: la pose recordada cambia para que el paso siguiente la reponga', () => {
    const { scene, marker, reloj } = escenaConPersona('abuela', { x: 400, y: 300 }, { jugador: { x: 400, y: 500 } });
    const sprite = conSprite(marker);
    const walker = { key: 'abuela', state: { direction: 'left' }, feetOffsetY: 16, lastPose: { direction: 'left', walking: true } };
    (scene as unknown as MirarProbe).personWalkers = new Map([['abuela', walker]]);
    (scene as unknown as MirarProbe).faceTowards('abuela', 'player');
    reloj.avanzar(80);   // de la izquierda a abajo pasa por abajo-izquierda
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down', true);
    expect(walker.lastPose).toEqual({ direction: 'down', walking: false });
  });

  it('con una clave que no está no hace nada', () => {
    const { scene } = escenaConPersona('abuela', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    expect(() => (scene as unknown as MirarProbe).faceTowards('nadie', 'player')).not.toThrow();
  });
});

interface TimerFake { at: number; fn: () => void; remove(): void }

/** Reloj de la escena a mano: `delayedCall` guarda el aviso y `avanzar` lo dispara en orden. */
function relojDeEscena(scene: unknown) {
  let ahora = 0;
  let pendientes: TimerFake[] = [];
  (scene as { time: unknown }).time = {
    now: 0,
    delayedCall: (ms: number, fn: () => void) => {
      const timer: TimerFake = { at: ahora + ms, fn, remove() { pendientes = pendientes.filter(t => t !== timer); } };
      pendientes.push(timer);
      return timer;
    },
  };
  return {
    avanzar(ms: number) {
      ahora += ms;
      for (;;) {
        const due = pendientes.filter(t => t.at <= ahora).sort((a, b) => a.at - b.at)[0];
        if (!due) return;
        pendientes = pendientes.filter(t => t !== due);
        due.fn();
      }
    },
  };
}

interface CaminanteProbe extends MirarProbe {
  updatePersonWalkers(delta: number): void;
  wouldCollide: (x: number, y: number, ignore?: string) => boolean;
  motionPaused: boolean;
}

/** Una persona que camina hacia la izquierda (va-y-viene) y un jugador a su derecha. */
function escenaConCaminante() {
  const base = escenaConPersona('abuela', { x: 400, y: 300 }, { jugador: { x: 700, y: 300 } });
  const scene = base.scene as unknown as CaminanteProbe;
  const sprite = conSprite(base.marker);
  scene.motionPaused = false;
  scene.wouldCollide = () => false;
  const walker = {
    key: 'abuela', feetOffsetY: 16, lastPose: { direction: 'left', walking: true },
    state: {
      movement: { tipo: 'va-y-viene', hasta: { x: 100, y: 300 } }, origin: { x: 400, y: 300 }, x: 400, y: 300,
      target: { x: 100, y: 300 }, pauseMs: 0, stuckMs: 0, toFar: true, direction: 'left', walking: true,
    },
  };
  scene.personWalkers = new Map([['abuela', walker]]);
  return { scene, sprite, walker, marker: base.marker, reloj: relojDeEscena(scene) };
}

describe('mundo: la mirada se sostiene', () => {
  it('quien camina sigue mirando al jugador tras varios cuadros y retoma su rumbo al vencer', () => {
    const { scene, sprite, walker, reloj } = escenaConCaminante();
    scene.faceTowards('abuela', 'player', 1000);
    reloj.avanzar(240);   // pasó el giro (media vuelta: tres vistas de en medio)
    const mirando = sprite.play.mock.calls.length;
    for (let i = 0; i < 10; i++) scene.updatePersonWalkers(16);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-right', true);
    expect(sprite.play.mock.calls).toHaveLength(mirando);   // el paseo no la pisó
    expect(walker.lastPose).toEqual({ direction: 'right', walking: false });
    reloj.avanzar(1000);
    for (let i = 0; i < 16; i++) scene.updatePersonWalkers(16);   // retoma su rumbo girando por las vistas de en medio
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-walk-left', true);
  });

  it('una media vuelta pasa de frente por las tres vistas de en medio, una cada 80 ms', () => {
    const { scene, sprite, reloj } = escenaConCaminante();
    scene.faceTowards('abuela', 'player');
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down-left', true);
    reloj.avanzar(79);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down-left', true);
    reloj.avanzar(1);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down', true);
    reloj.avanzar(80);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down-right', true);
    reloj.avanzar(80);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-right', true);
  });

  it('con movimiento reducido gira de una vez al estado final', () => {
    const base = escenaConPersona('abuela', { x: 400, y: 300 }, { jugador: { x: 700, y: 300 }, reduceMotion: true });
    const sprite = conSprite(base.marker);
    const scene = base.scene as unknown as MirarProbe;
    scene.personWalkers = new Map([['abuela', { key: 'abuela', state: { direction: 'left' }, feetOffsetY: 16, lastPose: { direction: 'left', walking: false } }]]);
    relojDeEscena(scene);
    scene.faceTowards('abuela', 'player');
    expect(sprite.setTexture).toHaveBeenCalledTimes(1);   // sin paso intermedio: la cara final de una vez
    expect(sprite.play).not.toHaveBeenCalled();
  });

  it('un gesto durante la mirada la suelta y gesticula (no queda ocupada)', () => {
    const { scene, marker, reloj } = escenaConCaminante();
    scene.faceTowards('abuela', 'player');
    expect(scene.isGesturing('abuela')).toBe(false);   // mirar no es gesticular: el componente marca solo los gestos
    void scene.playGesture('abuela', 'asiente');
    expect(scene.isGesturing('abuela')).toBe(true);
    reloj.avanzar(5000);
    expect(marker.x).toBe(400);
  });

  it('un repintado de la sala (endGestures) suelta la mirada', () => {
    const { scene, sprite, reloj } = escenaConCaminante();
    scene.faceTowards('abuela', 'player');
    scene.endGestures();
    reloj.avanzar(10_000);   // los avisos pendientes ya no hacen nada
    scene.updatePersonWalkers(16);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-walk-left', true);
  });

  it('el NPC que mira recupera su orientación al vencer', () => {
    const { scene } = escenaConVarias({ vecino: { x: 360, y: 300, npc: true } });
    const reloj = relojDeEscena(scene);
    const contenedor = scene.npcMarkers.get('vecino')!;
    const sprite = conSprite(contenedor);
    (contenedor as unknown as Record<string, unknown>)['__npcSprite'] = sprite;
    (contenedor as unknown as Record<string, unknown>)['__npcVisual'] = VISUAL;
    scene.player = caja(100, 300);
    (scene as unknown as MirarProbe).faceTowards('npc:vecino', 'player', 500);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down-left', true);
    reloj.avanzar(80);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-left', true);
    reloj.avanzar(420);
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down', true);
  });
});

describe('mundo: gente cerca', () => {
  it('peopleNear y el objetivo usan la posición viva de la persona, no la de reposo del dato', () => {
    const { scene } = escenaConVarias({ carpeta: { x: 300, y: 300, type: 'OBJECT' }, abuela: { x: 900, y: 300 } });
    scene.markers.get('abuela')!.setPosition(340, 300);   // caminó hasta junto a la carpeta
    expect(scene.peopleNear('carpeta', 160)).toEqual(['abuela']);
  });

  it('peopleNear encuentra solo a las personas cercanas al objeto', () => {
    const { scene } = escenaConVarias({
      carpeta: { x: 300, y: 300, type: 'OBJECT' }, abuela: { x: 340, y: 300 }, medico: { x: 800, y: 300 },
    });
    expect(scene.peopleNear('carpeta', 160)).toEqual(['abuela']);
  });

  it('cuenta también a los NPC (con su prefijo) y no a la persona misma', () => {
    const { scene } = escenaConVarias({ abuela: { x: 340, y: 300 }, vecino: { x: 360, y: 320, npc: true }, lejano: { x: 900, y: 900, npc: true } });
    expect(scene.peopleNear('abuela', 160)).toEqual(['npc:vecino']);
  });
});

describe('mundo: cabeza en pantalla', () => {
  it('screenAnchorOf traduce la cabeza a px del host y es null fuera de la sala', () => {
    const { scene } = escenaConPersona('abuela', { x: 400, y: 300 });
    const probe = scene as unknown as MirarProbe;
    probe.cameras = { main: { worldView: { x: 0, y: 0 }, zoom: 2 } } as never;
    probe.scale = { displayScale: { x: 2, y: 2 } };   // 2 px del juego por px CSS
    const ancla = probe.screenAnchorOf('abuela')!;
    expect(ancla.x).toBe(400);
    expect(ancla.y).toBeLessThan(300 + 16);   // la cabeza queda por encima de los pies
    expect(probe.screenAnchorOf('nadie')).toBeNull();
  });

  it('descuenta el desplazamiento de la cámara', () => {
    const { scene } = escenaConPersona('abuela', { x: 400, y: 300 });
    const probe = scene as unknown as MirarProbe;
    probe.cameras = { main: { worldView: { x: 100, y: 50 }, zoom: 1 } } as never;
    probe.scale = { displayScale: { x: 1, y: 1 } };
    expect(probe.screenAnchorOf('abuela')).toEqual({ x: 300, y: 300 + 16 - 64 - 50 });
  });
});

describe('mundo: lecturas de la persona', () => {
  it('characterVisualOf lee el visual de la persona o del NPC; null si no está', () => {
    const { scene, marker } = escenaConPersona('abuela', { x: 400, y: 300 });
    conSprite(marker);
    const probe = scene as unknown as MirarProbe;
    const npc = caja(10, 10);
    (npc as unknown as Record<string, unknown>)['__npcVisual'] = { key: 'v-npc' };
    probe.npcMarkers = new Map([['vecino', npc]]);
    expect(probe.characterVisualOf('abuela')).toBe(VISUAL);
    expect(probe.characterVisualOf('npc:vecino')).toEqual({ key: 'v-npc' });
    expect(probe.characterVisualOf('nadie')).toBeNull();
  });

  it('isKeyPerson dice si la clave es la persona clave de la sala', () => {
    const { scene } = escenaConPersona('abuela', { x: 400, y: 300 });
    const probe = scene as unknown as MirarProbe;
    expect(probe.isKeyPerson('abuela')).toBe(true);
    expect(probe.isKeyPerson('otra')).toBe(false);
  });
});

interface NpcQueSeMueveProbe extends MirarProbe {
  npcMovers: Map<string, unknown>;
  motionPaused: boolean;
  wouldCollide: (x: number, y: number) => boolean;
  registerNpcMover(npc: unknown, pos: { x: number; y: number }): void;
  updateNpcMovers(time: number, delta: number): void;
}

describe('mundo: la mirada de un NPC que se mueve', () => {
  it.each(['attentive', 'subtle-wander'] as const)('un NPC «%s» que mira hacia algo no lo pisa su movimiento mientras dura la mirada', behavior => {
    const { scene: base, reloj } = escenaConVarias({ vecino: { x: 360, y: 300, npc: true }, abuela: { x: 360, y: 400 } });
    const scene = base as unknown as NpcQueSeMueveProbe;
    const contenedor = scene.npcMarkers.get('vecino')!;
    const sprite = conSprite(contenedor);
    const bag = contenedor as unknown as Record<string, unknown>;
    bag['__npcSprite'] = sprite;
    bag['__npcVisual'] = VISUAL;
    scene.motionPaused = false;
    scene.wouldCollide = () => false;
    scene.player = caja(300, 300);   // junto a él, a su izquierda: el «attentive» lo giraría hacia ahí
    scene.registerNpcMover({ key: 'vecino', facing: 'left', motion: { behavior, radius: 40, startDelayMs: 0 } }, { x: 360, y: 300 });

    scene.faceTowards('npc:vecino', 'abuela', 1000);   // mira hacia abajo: de la izquierda pasa primero por abajo-izquierda
    expect(sprite.play).toHaveBeenLastCalledWith('v-abuela-idle-down-left', true);
    const llamadas = sprite.play.mock.calls.length;
    for (let i = 0; i < 10; i++) scene.updateNpcMovers(i * 16, 16);
    expect(sprite.play.mock.calls).toHaveLength(llamadas);   // sin la línea que salta a quien está en `gesturing`, giraría o caminaría
    expect([contenedor.x, contenedor.y]).toEqual([360, 300]);

    reloj.avanzar(1000);   // vence la mirada: el movimiento vuelve a mandar
    scene.updateNpcMovers(500, 16);
    expect(sprite.play.mock.calls.length).toBeGreaterThan(llamadas);
  });
});
