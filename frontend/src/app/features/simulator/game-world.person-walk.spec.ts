// Mismo andamiaje que game-world.npc-motion.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo soporta).
// Solo se evalúa `extends Phaser.Scene`; la escena nunca arranca aquí: se le dan dobles mínimos.
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

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Mock } from 'vitest';
import { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import { DataDrivenWorldScene } from './game-world.component';
import { playerHitbox, rectsIntersect } from './player-motion.util';

/**
 * Las personas del caso que caminan (P6, tarea 4) dentro de la escena: leen `metadata.movimiento`, usan la colisión del
 * jugador con SUS pies, tratan al jugador como un obstáculo móvil, se detienen con cualquier capa abierta (diálogo,
 * lectura, bitácora: `motionPaused`) y con «Reducir movimiento» quedan quietas en su sitio, también si cambia en caliente.
 */

interface FakeNode { x: number; y: number; setPosition: Mock }
interface Point { x: number; y: number }

interface WalkerProbe {
  key: string;
  state: { x: number; y: number; walking: boolean; target: Point | null; pauseMs: number; direction: string };
  lastPose: { direction: string | null; walking: boolean };
}

interface WalkScene {
  player: Point | undefined;
  world: SimulationWorldState;
  markers: Map<string, FakeNode>;
  markerData: Map<string, MapObjectState>;
  npcMarkers: Map<string, FakeNode>;
  ambientMovers: Map<string, unknown>;
  personWalkers: Map<string, WalkerProbe>;
  motionPaused: boolean;
  callbacks: { reduceMotion: boolean };
  wouldCollide: (x: number, y: number, ignoreObjectKey?: string) => boolean;
  registerPersonWalk(marker: FakeNode, object: MapObjectState): void;
  updatePersonWalkers(delta: number): void;
  applyAmbientLife(marker: FakeNode, object: MapObjectState): void;
  setReduceMotion(reduced: boolean): void;
  setMotionPaused(paused: boolean): void;
  resetPersonWalkers(room: string): void;
  markerMoves(key: string): boolean;
}

function node(x: number, y: number): FakeNode {
  const self: FakeNode = {
    x, y,
    setPosition: vi.fn((nx: number, ny: number) => { self.x = nx; self.y = ny; return self; }),
  };
  return self;
}

/** Generador con semilla (mulberry32): la escena usa Math.random para el destino y las pausas. */
function semilla(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const persona = (key: string, x: number, y: number, movimiento?: unknown, extra: Partial<MapObjectState> = {}): MapObjectState => ({
  key, label: key.toUpperCase(), type: 'PERSON', x, y, width: 48, height: 48, color: '#4fa3a5', icon: 'person', shortCode: '',
  collision: false, interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  metadata: movimiento === undefined ? {} : { movimiento }, ...extra,
});

function crearEscena(reduceMotion = false): WalkScene {
  const scene = new DataDrivenWorldScene({ reduceMotion, sfxMuted: true } as never) as unknown as WalkScene;
  scene.world = { map: { key: 'sala-demo', width: 960, height: 528 }, objects: [], collisions: [], inventory: [] } as unknown as SimulationWorldState;
  scene.player = { x: 40, y: 480 };
  scene.markers = new Map();
  scene.markerData = new Map();
  scene.npcMarkers = new Map();
  scene.ambientMovers = new Map();
  scene.personWalkers = new Map();
  scene.motionPaused = false;
  scene.wouldCollide = () => false;
  return scene;
}

function agregar(scene: WalkScene, object: MapObjectState): FakeNode {
  const marker = node(object.x, object.y);
  scene.markers.set(object.key, marker);
  scene.markerData.set(object.key, object);
  scene.registerPersonWalk(marker, object);
  return marker;
}

/** Pasa `ms` de juego en cuadros de 16 ms. */
function pasar(scene: WalkScene, ms: number): void {
  for (let t = 0; t < ms; t += 16) scene.updatePersonWalkers(16);
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(semilla(20261027)); });
afterEach(() => vi.restoreAllMocks());

describe('personas que caminan: registro desde metadata.movimiento', () => {
  it('quieto, ausente, desconocido o mal formado no se registra: queda como siempre', () => {
    const scene = crearEscena();
    for (const [i, movimiento] of [undefined, 'quieto', 'vuela', 7, { tipo: 'va-y-viene' }, { tipo: 'va-y-viene', hasta: { x: 'a' } }].entries()) {
      agregar(scene, persona(`p${i}`, 300, 240, movimiento));
    }
    expect(scene.personWalkers.size).toBe(0);
    pasar(scene, 5000);
    for (const marker of scene.markers.values()) expect([marker.x, marker.y]).toEqual([300, 240]);
  });

  it('deambula y va-y-viene se registran; lo que no es una persona, no', () => {
    const scene = crearEscena();
    agregar(scene, persona('a', 300, 240, 'deambula'));
    agregar(scene, persona('b', 300, 300, { tipo: 'va-y-viene', hasta: { x: 400, y: 300 } }));
    agregar(scene, persona('c', 300, 360, 'deambula', { type: 'OBJECT' }));
    expect([...scene.personWalkers.keys()]).toEqual(['a', 'b']);
    expect(scene.markerMoves('a')).toBe(true);
    expect(scene.markerMoves('c')).toBe(false);
  });

  it('la persona con metadata.movimiento no recibe además el vaivén ambiental heredado', () => {
    const scene = crearEscena();
    const objeto = persona('a', 300, 240, 'deambula', { movementPattern: { type: 'wander', radius: 28 } });
    const marker = node(300, 240);
    scene.markers.set('a', marker);
    scene.markerData.set('a', objeto);
    scene.applyAmbientLife(marker, objeto);
    expect(scene.ambientMovers.size).toBe(0);
  });
});

describe('personas que caminan: en la escena', () => {
  it('deambula: camina de verdad, sin pisar la colisión del jugador ni salir de la sala', () => {
    const scene = crearEscena();
    // Un mueble ocupa el centro; la colisión es la del jugador, con los PIES (16 px bajo el centro del marcador).
    const mueble = { x: 330, y: 200, width: 80, height: 80 };
    scene.wouldCollide = (x, y) => rectsIntersect(playerHitbox(x, y), mueble);
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));

    let recorrido = 0;
    let previo = { x: marker.x, y: marker.y };
    for (let paso = 0; paso < 1500; paso++) {
      scene.updatePersonWalkers(16);
      expect(rectsIntersect(playerHitbox(marker.x, marker.y + 16), mueble), `cuadro ${paso}: (${marker.x}, ${marker.y})`).toBe(false);
      expect(marker.x).toBeGreaterThanOrEqual(24);
      expect(marker.x).toBeLessThanOrEqual(960 - 24);
      expect(marker.y).toBeGreaterThanOrEqual(24);
      expect(marker.y).toBeLessThanOrEqual(528 - 24);
      recorrido += dist(previo, marker);
      previo = { x: marker.x, y: marker.y };
    }
    expect(recorrido).toBeGreaterThan(40);
  });

  it('una persona con colisión propia (collision: true) no choca consigo misma: también camina', () => {
    const scene = crearEscena();
    const yo = persona('madre', 300, 240, 'deambula', { collision: true });
    scene.world.objects = [yo, persona('sofa', 600, 240, undefined, { collision: true })];
    delete (scene as unknown as Record<string, unknown>)['wouldCollide']; // la colisión real del juego, no el doble
    const marker = agregar(scene, yo);

    let recorrido = 0;
    let previo = { x: marker.x, y: marker.y };
    for (let paso = 0; paso < 1500; paso++) {
      scene.updatePersonWalkers(16);
      recorrido += dist(previo, marker);
      previo = { x: marker.x, y: marker.y };
    }
    expect(recorrido).toBeGreaterThan(40);
  });

  it('va-y-viene: llega a «hasta» y vuelve a su posición original', () => {
    const scene = crearEscena();
    const marker = agregar(scene, persona('ronda', 200, 300, { tipo: 'va-y-viene', hasta: { x: 320, y: 300 } }));
    const llegadas: number[] = [];
    let caminabaAntes = false;
    for (let t = 0; t < 60_000 && llegadas.length < 4; t += 16) {
      scene.updatePersonWalkers(16);
      const caminando = scene.personWalkers.get('ronda')!.state.walking;
      if (caminabaAntes && !caminando) llegadas.push(Math.round(marker.x));
      caminabaAntes = caminando;
    }
    expect(llegadas).toEqual([320, 200, 320, 200]);
  });

  it('el jugador es un obstáculo: la persona se detiene antes y nunca se superpone', () => {
    const scene = crearEscena();
    scene.player = { x: 260, y: 300 - 16 }; // sus pies quedan en medio del camino de la persona
    const marker = agregar(scene, persona('ronda', 200, 300, { tipo: 'va-y-viene', hasta: { x: 320, y: 300 } }));
    for (let t = 0; t < 30_000; t += 16) {
      scene.updatePersonWalkers(16);
      expect(rectsIntersect(playerHitbox(marker.x, marker.y + 16), playerHitbox(scene.player.x, scene.player.y)), `t=${t}`).toBe(false);
    }
    expect(marker.x).toBeLessThan(260);
  });

  // req: P6 Tarea 4
  it('se detiene al abrir un diálogo y retoma al cerrarlo', () => {
    const scene = crearEscena();
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 6000);
    expect(dist(marker, { x: 300, y: 240 })).toBeGreaterThan(0); // sin diálogo, camina

    scene.motionPaused = true; // el diálogo (o la lectura local de una nota) abierto pausa el mundo
    const enPausa = { x: marker.x, y: marker.y };
    const llamadas = marker.setPosition.mock.calls.length;
    pasar(scene, 10_000);
    expect({ x: marker.x, y: marker.y }).toEqual(enPausa);
    expect(marker.setPosition.mock.calls.length).toBe(llamadas);

    scene.motionPaused = false; // lo cierran: retoma desde donde estaba
    pasar(scene, 10_000);
    expect(dist(marker, enPausa)).toBeGreaterThan(0);
  });

  // req: P6 Tarea 4 (Review Focus 5)
  it('con reduceMotion queda quieta en su posición original', () => {
    const scene = crearEscena(true);
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 20_000);
    expect([marker.x, marker.y]).toEqual([300, 240]);
    expect(marker.setPosition).not.toHaveBeenCalled();
  });

  it('si reduceMotion cambia en caliente: vuelve a su sitio y queda quieta; al permitirlo, retoma', () => {
    const scene = crearEscena();
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 8000);
    expect(dist(marker, { x: 300, y: 240 })).toBeGreaterThan(0);

    scene.callbacks.reduceMotion = true;
    scene.setReduceMotion(true);
    expect([marker.x, marker.y]).toEqual([300, 240]);
    pasar(scene, 20_000);
    expect([marker.x, marker.y]).toEqual([300, 240]);

    scene.callbacks.reduceMotion = false;
    scene.setReduceMotion(false);
    pasar(scene, 20_000);
    expect(dist(marker, { x: 300, y: 240 })).toBeGreaterThan(0);
  });
});

/**
 * La pared del fondo pintado (revisión final · B1). La copia de un lugar levanta las paredes del encuadre como zonas de choque
 * (`world.collisions`) y la sala dice su encuadre en `map.ambient`: quien deambula no sube por la pared ni con la colisión del
 * servidor ni —en un caso hecho antes, sin esas zonas— gracias a los límites de la zona caminable.
 */
describe('personas que caminan: la pared pintada de la sala', () => {
  /** Lo que el servidor guarda para `tres-paredes` (zona caminable x 96–864, y 236–486): todo lo demás es pared o borde. */
  const PAREDES = [
    { x: 0, y: 0, width: 960, height: 236 }, { x: 0, y: 236, width: 96, height: 250 },
    { x: 864, y: 236, width: 96, height: 250 }, { x: 0, y: 486, width: 960, height: 42 },
  ];
  const ZONA = { minX: 96, maxX: 864, minY: 236, maxY: 486 };
  /** Los pies, con el hitbox entero dentro de la zona: 11 px de cada lado y 16 de alto. */
  const PIES = { minX: 107, maxX: 853, minY: 252, maxY: 486 };

  /** Una sala con encuadre; los pies de la persona (marcador + `pies`) son los que cuentan. */
  function salaConEncuadre(conParedes: boolean): WalkScene {
    const scene = crearEscena();
    scene.world = {
      map: { key: 'sala-demo', width: 960, height: 528, ambient: { encuadre: 'tres-paredes' } }, objects: [],
      collisions: conParedes ? PAREDES.map((z, i) => ({ id: i, key: `pared-${i}`, label: 'Pared', ...z })) : [], inventory: [],
    } as unknown as SimulationWorldState;
    return scene;
  }

  function recorre(scene: WalkScene, objeto: MapObjectState, pies: number, cuadros = 4000) {
    const marker = agregar(scene, objeto);
    const visto = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let recorrido = 0;
    let previo = { x: marker.x, y: marker.y };
    for (let paso = 0; paso < cuadros; paso++) {
      scene.updatePersonWalkers(16);
      const hitbox = playerHitbox(marker.x, marker.y + pies);
      expect(PAREDES.some((p) => rectsIntersect(hitbox, p)), `cuadro ${paso}: pies en (${marker.x}, ${marker.y + pies})`).toBe(false);
      visto.minX = Math.min(visto.minX, marker.x); visto.maxX = Math.max(visto.maxX, marker.x);
      visto.minY = Math.min(visto.minY, marker.y + pies); visto.maxY = Math.max(visto.maxY, marker.y + pies);
      recorrido += dist(previo, marker);
      previo = { x: marker.x, y: marker.y };
    }
    expect(recorrido, 'caminó de verdad').toBeGreaterThan(100);
    return visto;
  }

  it('con las paredes del servidor, una persona con apoyo en los pies deambula sin pisar la pared y puede llegar al borde del piso', () => {
    const scene = salaConEncuadre(true);
    delete (scene as unknown as Record<string, unknown>)['wouldCollide']; // la colisión real del juego
    const visto = recorre(scene, persona('madre', 240, 330, undefined, { metadata: { movimiento: 'deambula', apoyo: 'pies' } }), 0);
    expect(visto.minY, 'sube hasta la pared del fondo, sin entrar').toBeGreaterThanOrEqual(PIES.minY);
    expect(visto.minY, 'y llega a acercarse a ella').toBeLessThan(PIES.minY + 40);
    expect(visto.maxY, 'y baja hasta cerca del borde delantero').toBeGreaterThan(PIES.maxY - 50);
  });

  it('con las paredes del servidor, una persona de un caso de antes (marcador 16 px sobre sus pies) tampoco pisa la pared', () => {
    const scene = salaConEncuadre(true);
    delete (scene as unknown as Record<string, unknown>)['wouldCollide'];
    recorre(scene, persona('madre', 240, 260, 'deambula'), 16);
  });

  it('en un caso sin paredes en el servidor, el encuadre de la sala basta: sus pies no salen de la zona caminable', () => {
    const scene = salaConEncuadre(false);
    scene.wouldCollide = () => false; // nada bloquea: solo los límites de la zona
    const visto = recorre(scene, persona('madre', 240, 330, undefined, { metadata: { movimiento: 'deambula', apoyo: 'pies' } }), 0, 6000);
    expect(visto.minY).toBeGreaterThanOrEqual(PIES.minY);
    expect(visto.maxY).toBeLessThanOrEqual(PIES.maxY);
    expect(visto.minX).toBeGreaterThanOrEqual(PIES.minX);
    expect(visto.maxX).toBeLessThanOrEqual(PIES.maxX);
    expect(PIES.minX).toBeGreaterThan(ZONA.minX); // (la zona es de pies; el hitbox sale 11 px a cada lado)
  });

  it('un va-y-viene con apoyo en los pies camina entre sus dos puntos, que están dentro de la zona', () => {
    const scene = salaConEncuadre(true);
    delete (scene as unknown as Record<string, unknown>)['wouldCollide'];
    const marker = agregar(scene, persona('ronda', 200, 300, undefined, {
      metadata: { movimiento: { tipo: 'va-y-viene', hasta: { x: 320, y: 300 } }, apoyo: 'pies' },
    }));
    const llegadas: number[] = [];
    let caminabaAntes = false;
    for (let t = 0; t < 60_000 && llegadas.length < 4; t += 16) {
      scene.updatePersonWalkers(16);
      const caminando = scene.personWalkers.get('ronda')!.state.walking;
      if (caminabaAntes && !caminando) llegadas.push(Math.round(marker.x));
      caminabaAntes = caminando;
    }
    expect(llegadas).toEqual([320, 200, 320, 200]);
  });
});

/**
 * Revisión final · C1: una persona que camina y se pausa el mundo (diálogo, bitácora…) no sigue moviendo las piernas en su sitio:
 * la pose pasa a reposo y, al reanudar, vuelve la que le toca (la pose que ve el estudiante es `lastPose`, la que pidió a la hoja).
 */
describe('personas que caminan: la pose al pausar el mundo', () => {
  function caminando(): { scene: WalkScene; walker: WalkerProbe } {
    const scene = crearEscena();
    agregar(scene, persona('madre', 300, 240, 'deambula'));
    const walker = scene.personWalkers.get('madre')!;
    for (let t = 0; t < 30_000 && !walker.state.walking; t += 16) scene.updatePersonWalkers(16);
    expect(walker.state.walking, 'echó a andar').toBe(true);
    expect(walker.lastPose.walking, 'y la pose es la de caminar').toBe(true);
    return { scene, walker };
  }

  it('al pausar el mundo, la pose pasa a reposo (misma dirección) y no queda caminando en su sitio', () => {
    const { scene, walker } = caminando();
    const direccion = walker.state.direction;
    scene.setMotionPaused(true);
    expect(walker.lastPose).toEqual({ direction: direccion, walking: false });
    // El tiempo que pase en pausa no la mueve ni la vuelve a poner a caminar.
    for (let t = 0; t < 2000; t += 16) scene.updatePersonWalkers(16);
    expect(walker.lastPose.walking).toBe(false);
  });

  it('al reanudar, vuelve a la pose que le corresponde: caminando si iba caminando', () => {
    const { scene, walker } = caminando();
    scene.setMotionPaused(true);
    scene.setMotionPaused(false);
    expect(walker.state.walking).toBe(true);
    expect(walker.lastPose.walking, 'retoma la pose de caminar sin esperar al siguiente cuadro').toBe(true);
  });

  it('si estaba parada (en una pausa de las suyas), pausar y reanudar la deja de pie', () => {
    const scene = crearEscena();
    agregar(scene, persona('madre', 300, 240, 'deambula'));
    const walker = scene.personWalkers.get('madre')!;
    expect(walker.state.walking).toBe(false);
    scene.setMotionPaused(true);
    scene.setMotionPaused(false);
    expect(walker.lastPose.walking).toBe(false);
  });
});

/**
 * Revisión final · C2: abrir una interacción o usar una herramienta hace `world.set` y la escena reconstruye la sala. Quien
 * caminaba no vuelve a su origen: si la sala es la misma, retoma posición, destino y pausa.
 */
describe('personas que caminan: la sala se reconstruye sin cambiar de sala', () => {
  it('con la misma sala, la persona retoma donde iba (posición, destino y pausa)', () => {
    const scene = crearEscena();
    const objeto = persona('madre', 300, 240, 'deambula');
    scene.resetPersonWalkers('sala-demo'); // la primera vez no hay nada que recordar
    const marker = agregar(scene, objeto);
    pasar(scene, 9000);
    const antes = scene.personWalkers.get('madre')!.state;
    expect(dist(antes, { x: 300, y: 240 }), 'ya se había alejado de su origen').toBeGreaterThan(0);

    scene.resetPersonWalkers('sala-demo'); // setWorld → renderWorld/renderRoom
    expect(scene.personWalkers.size).toBe(0);
    const nuevo = node(objeto.x, objeto.y); // el marcador nace en el dato, en su origen
    scene.markers.set('madre', nuevo);
    scene.registerPersonWalk(nuevo, objeto);
    const despues = scene.personWalkers.get('madre')!.state;
    expect({ x: nuevo.x, y: nuevo.y }, 'el marcador vuelve a donde estaba').toEqual({ x: antes.x, y: antes.y });
    expect(despues.x).toBe(antes.x);
    expect(despues.y).toBe(antes.y);
    expect(despues.target).toEqual(antes.target);
    expect(despues.pauseMs).toBe(antes.pauseMs);
    expect(marker).not.toBe(nuevo);
  });

  it('una sala distinta no arrastra a las personas de la anterior: vuelven a su origen', () => {
    const scene = crearEscena();
    const objeto = persona('madre', 300, 240, 'deambula');
    scene.resetPersonWalkers('sala-demo');
    agregar(scene, objeto);
    pasar(scene, 9000);
    scene.resetPersonWalkers('otra-sala');
    const nuevo = node(objeto.x, objeto.y);
    scene.markers.set('madre', nuevo);
    scene.registerPersonWalk(nuevo, objeto);
    expect([nuevo.x, nuevo.y]).toEqual([300, 240]);
    expect(scene.personWalkers.get('madre')!.state.target).toBeNull();
  });

  it('si el docente cambió su origen o su movimiento, empieza de nuevo con el dato nuevo', () => {
    const scene = crearEscena();
    scene.resetPersonWalkers('sala-demo');
    agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 9000);
    scene.resetPersonWalkers('sala-demo');
    const movida = persona('madre', 500, 300, 'deambula');
    const nuevo = node(500, 300);
    scene.markers.set('madre', nuevo);
    scene.registerPersonWalk(nuevo, movida);
    expect([nuevo.x, nuevo.y]).toEqual([500, 300]);
  });

  it('las dos formas de reconstruir la sala (una sola sala y varias) pasan por ese mismo punto', () => {
    const fuente = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');
    expect(fuente.match(/this\.resetPersonWalkers\(/g) ?? []).toHaveLength(2);
    // `personWalkers.clear()` ya no se llama suelto al reconstruir: solo `resetPersonWalkers` lo hace (guardando antes el estado).
    expect(fuente.match(/this\.personWalkers\.clear\(\)/g) ?? []).toHaveLength(1);
  });
});
