// Mismo andamiaje que game-world.proximity-animation.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo soporta).
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
    Loader: { Events: { COMPLETE: 'complete', PROGRESS: 'progress' } },
    Game: class {},
  },
}));

import { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import { DataDrivenWorldScene } from './game-world.component';
import { BibliotecaManifest } from './object-sprite.util';
import { actorDepth } from './depth-sort.util';
import { kitFrameIndex } from '../character/kit/kit-phaser';

/**
 * Cómo dibuja el juego un objeto según su punto de apoyo y si la puerta ya está pintada (revisión final · B2 y B3).
 *
 * Lo que el editor coloca tiene por posición el punto donde APOYA en el suelo (`metadata.apoyo = "pies"`): el juego dibuja con
 * la base en (x, y) —origen abajo al centro—, pone la sombra y el orden de profundidad en (x, y) y el rótulo debajo. Lo que no lo
 * dice (casos de antes) se dibuja como siempre. Una puerta con `metadata.pintada` no recibe sprite: ya está en el fondo.
 */

interface Llamada { metodo: string; args: unknown[] }
interface Dibujado {
  tipo: string;
  args: unknown[];
  x: number;
  y: number;
  llamadas: Llamada[];
  hijos?: Dibujado[];
  [extra: string]: unknown;
}

/** Un objeto de Phaser de pruebas: guarda cómo se creó y qué se le pidió; cualquier método que no conoce devuelve el mismo objeto. */
function dibujado(tipo: string, args: unknown[], hijos?: Dibujado[]): Dibujado {
  const numeros = args.filter((a): a is number => typeof a === 'number');
  const base: Dibujado = {
    tipo, args, x: numeros[0] ?? 0, y: numeros[1] ?? 0, llamadas: [], hijos,
    texture: { key: typeof args[2] === 'string' ? args[2] : 'x' }, width: 32, height: 32, displayHeight: 32, anims: { stop: () => undefined },
  };
  const proxy: Dibujado = new Proxy(base, {
    get(objetivo, propiedad: string) {
      if (propiedad in objetivo) return objetivo[propiedad];
      return (...parametros: unknown[]) => {
        objetivo.llamadas.push({ metodo: propiedad, args: parametros });
        if (propiedad === 'setPosition') { objetivo.x = parametros[0] as number; objetivo.y = parametros[1] as number; }
        if (propiedad === 'add') hijos?.push(...([parametros[0]].flat() as Dibujado[]));
        return proxy;
      };
    },
    set(objetivo, propiedad: string, valor) { objetivo[propiedad] = valor; return true; },
  });
  return proxy;
}

const llamo = (d: Dibujado, metodo: string, ...args: unknown[]) =>
  d.llamadas.some((l) => l.metodo === metodo && JSON.stringify(l.args) === JSON.stringify(args));

interface SceneProbe {
  world: SimulationWorldState;
  assetsLoaded: boolean;
  labelScale: number;
  labelWrap: number;
  callbacks: { reduceMotion: boolean; sfxMuted: boolean; artManifest: BibliotecaManifest | null; kit?: unknown };
  markers: Map<string, Dibujado>;
  markerData: Map<string, MapObjectState>;
  markerLabels: Map<string, Dibujado>;
  doorHints: Map<string, Dibujado>;
  proximityAnimations: Map<string, unknown>;
  personWalkers: Map<string, unknown>;
  ambientMovers: Map<string, unknown>;
  add: Record<string, (...args: unknown[]) => Dibujado>;
  tweens: { add: ReturnType<typeof vi.fn> };
  textures: { exists: (key: string) => boolean; get: () => { frameTotal: number } };
  anims: { exists: () => boolean };
  actorVisual: () => unknown;
  createMarker(object: MapObjectState): void;
}

const MESA = '/assets/biblioteca/modelos/arte/mesa.png';
const MANIFEST: BibliotecaManifest = { esquema: 1, sprites: { 'modelos/arte/mesa.png': { ancho: 64, alto: 40, origen: 'modelo' } } };

const objeto = (key: string, type: MapObjectState['type'], x: number, y: number, metadata: Record<string, unknown> = {}): MapObjectState => ({
  key, label: key.toUpperCase(), type, x, y, width: 64, height: 40, color: '#4fa3a5', icon: 'x', shortCode: '',
  collision: false, interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, metadata,
});

/** Una escena con lo mínimo para dibujar marcadores; las texturas de la biblioteca existen. */
function crearEscena(): { scene: SceneProbe; creados: Dibujado[] } {
  const creados: Dibujado[] = [];
  const fabrica = (tipo: string) => (...args: unknown[]) => {
    const hijos = tipo === 'container' && Array.isArray(args[2]) ? [...(args[2] as Dibujado[])] : tipo === 'container' ? [] : undefined;
    const d = dibujado(tipo, args, hijos);
    creados.push(d);
    return d;
  };
  const callbacks = { reduceMotion: true, sfxMuted: true, artManifest: MANIFEST };
  const scene = new DataDrivenWorldScene(callbacks as never) as unknown as SceneProbe;
  scene.world = { map: { key: 'sala-demo', width: 960, height: 528 }, objects: [], collisions: [], inventory: [] } as unknown as SimulationWorldState;
  scene.assetsLoaded = true;
  scene.labelScale = 1;
  scene.labelWrap = 160;
  scene.markers = new Map(); scene.markerData = new Map(); scene.markerLabels = new Map();
  scene.doorHints = new Map(); scene.proximityAnimations = new Map();
  scene.personWalkers = new Map(); scene.ambientMovers = new Map();
  scene.add = {
    text: fabrica('text'), ellipse: fabrica('ellipse'), circle: fabrica('circle'), rectangle: fabrica('rectangle'),
    sprite: fabrica('sprite'), image: fabrica('image'), container: fabrica('container'), graphics: fabrica('graphics'),
  };
  scene.tweens = { add: vi.fn() };
  scene.textures = { exists: (key) => key.startsWith('biblioteca') || key === 'dungeon-tiles' || key === 'object-art', get: () => ({ frameTotal: 4 }) };
  scene.anims = { exists: () => false };
  return { scene, creados };
}

const de = (creados: Dibujado[], tipo: string) => creados.filter((c) => c.tipo === tipo);

describe('createMarker: el punto de apoyo de lo que trae el editor (revisión final · B2)', () => {
  it('con apoyo en los pies, el arte se dibuja con la base en (x, y): origen abajo al centro, sin el −6 de siempre', () => {
    const { scene, creados } = crearEscena();
    scene.createMarker(objeto('mesa', 'PROP', 300, 400, { arte: MESA, apoyo: 'pies' }));
    const arte = de(creados, 'image').find((i) => String(i.args[2]).includes('mesa'))!;
    expect(arte, 'se dibujó el arte de la mesa').toBeDefined();
    expect([arte.args[0], arte.args[1]], 'dentro del marcador, sobre su punto de apoyo').toEqual([0, 0]);
    expect(llamo(arte, 'setOrigin', 0.5, 1), 'con la base abajo').toBe(true);
  });

  it('sin apoyo declarado (un caso hecho antes), el arte se dibuja centrado y 6 px arriba, como siempre', () => {
    const { scene, creados } = crearEscena();
    scene.createMarker(objeto('mesa', 'PROP', 300, 400, { arte: MESA }));
    const arte = de(creados, 'image').find((i) => String(i.args[2]).includes('mesa'))!;
    expect([arte.args[0], arte.args[1]]).toEqual([0, -6]);
    expect(arte.llamadas.some((l) => l.metodo === 'setOrigin')).toBe(false);
  });

  it('la sombra de contacto y el orden de profundidad usan el punto de apoyo: en (x, y) con apoyo, 16 px más abajo sin él', () => {
    for (const [apoyo, pies] of [[true, 0], [false, 16]] as const) {
      const { scene, creados } = crearEscena();
      scene.createMarker(objeto('mesa', 'PROP', 300, 400, apoyo ? { arte: MESA, apoyo: 'pies' } : { arte: MESA }));
      const sombra = de(creados, 'ellipse').find((e) => e.args[2] === 26)!;
      expect(sombra.args[1], `sombra (apoyo=${apoyo})`).toBe(pies);
      const marcador = scene.markers.get('mesa')!;
      expect([marcador.x, marcador.y], 'el marcador sigue en la posición del dato').toEqual([300, 400]);
      expect(marcador['__feetOffset'], `distancia centro→pies (apoyo=${apoyo})`).toBe(pies);
      expect(llamo(marcador, 'setDepth', actorDepth(400 + pies))).toBe(true);
    }
  });

  it('el rótulo queda 12 px bajo el apoyo con apoyo en los pies, y 28 px bajo el marcador sin él', () => {
    for (const [metadata, desplazamiento] of [[{ arte: MESA, apoyo: 'pies' }, 12], [{ arte: MESA }, 28]] as const) {
      const { scene, creados } = crearEscena();
      scene.createMarker(objeto('mesa', 'PROP', 300, 400, { ...metadata }));
      const rotulo = de(creados, 'text')[0];
      expect([rotulo.args[0], rotulo.args[1]]).toEqual([300, 400 + desplazamiento]);
    }
  });

  it('una persona con apoyo en los pies tiene los pies del kit sobre su sombra, en (x, y), y no 16 px más abajo', () => {
    for (const [metadata, pies] of [[{ apoyo: 'pies' }, 0], [{}, 16]] as const) {
      const { scene, creados } = crearEscena();
      scene.callbacks.kit = {
        catalog: { extras: 'extra', actors: {}, portraitKeys: {}, templates: {}, speakers: {}, voices: [] }, recipes: { extra: {} },
      };
      scene.actorVisual = () => ({ recipeId: 'extra' });
      scene.createMarker(objeto('ana', 'PERSON', 300, 400, { ...metadata }));
      const cuerpo = de(creados, 'sprite')[0];
      expect(cuerpo, 'se dibujó con el kit').toBeDefined();
      expect(cuerpo.args[1], `pies del cuerpo (${JSON.stringify(metadata)})`).toBe(pies);
      expect(scene.markers.get('ana')!['__feetOffset']).toBe(pies);
    }
  });
});

/** Revisión final · C4: el campo «Mirando» del editor (`facing`) manda en cómo nace la persona; sin él, de frente. */
describe('createMarker: hacia dónde mira la persona al crearse (revisión final · C4)', () => {
  function persona(facing: string | undefined) {
    const { scene, creados } = crearEscena();
    scene.callbacks.kit = {
      catalog: { extras: 'extra', actors: {}, portraitKeys: {}, templates: {}, speakers: {}, voices: [] }, recipes: { extra: {} },
    };
    scene.actorVisual = () => ({ recipeId: 'extra', key: 'extra' });
    scene.createMarker({ ...objeto('ana', 'PERSON', 300, 400, { apoyo: 'pies' }), ...(facing ? { facing } : {}) });
    return de(creados, 'sprite')[0];
  }

  it.each(['up', 'left', 'right', 'down'] as const)('mirando «%s»: nace con el cuadro de reposo de esa vista', (mirando) => {
    const cuerpo = persona(mirando);
    expect(cuerpo.args[3], 'cuadro con el que nace').toBe(kitFrameIndex('idle', mirando));
    // Con movimiento reducido (estas pruebas) la pose es un cuadro fijo de esa vista.
    expect(cuerpo.llamadas.find((l) => l.metodo === 'setTexture')?.args[1], 'y el cuadro fijo de la pose').toBe(kitFrameIndex('idle', mirando));
  });

  it('sin «mirando», o con un valor que no es una dirección, nace de frente', () => {
    expect(persona(undefined).args[3]).toBe(kitFrameIndex('idle', 'down'));
    expect(persona('arriba').args[3]).toBe(kitFrameIndex('idle', 'down'));
  });
});

describe('createMarker: la puerta pintada en el fondo (revisión final · B3)', () => {
  const puerta = (metadata: Record<string, unknown>) =>
    objeto('puerta-consultorio', 'EXIT', 730, 236, { targetNodeKey: 'consultorio', entryX: 480, entryY: 380, ...metadata });

  it('una puerta pintada no recibe sprite ni el tile de Kenney: solo la pista para cruzar', () => {
    const { scene, creados } = crearEscena();
    scene.createMarker(puerta({ pintada: true }));
    expect(de(creados, 'image'), 'ni la puerta del juego ni el tile de dungeon-tiles').toEqual([]);
    expect(de(creados, 'sprite')).toEqual([]);
    expect(scene.doorHints.has('puerta-consultorio'), 'la pista de la puerta sigue').toBe(true);
    expect(scene.markers.has('puerta-consultorio'), 'y el marcador, que es el área para cruzar').toBe(true);
  });

  it('no deja ni la sombra ni el pulso de siempre encima del fondo', () => {
    const { scene, creados } = crearEscena();
    scene.createMarker(puerta({ pintada: true }));
    const sombra = de(creados, 'ellipse').find((e) => e.args[2] === 26)!;
    const pulso = de(creados, 'circle').find((c) => c.args[2] === 22)!;
    expect(llamo(sombra, 'setVisible', false)).toBe(true);
    expect(llamo(pulso, 'setVisible', false)).toBe(true);
    expect(scene.tweens.add, 'el pulso oculto no se anima').not.toHaveBeenCalled();
  });

  it('una puerta que no dice «pintada» se dibuja como siempre (con el tile si no hay arte propio)', () => {
    const { scene, creados } = crearEscena();
    scene.createMarker(puerta({}));
    expect(de(creados, 'image').length, 'el tile o el sprite de la puerta').toBeGreaterThan(0);
  });

  it('«pintada» no cambia nada en lo que no es una puerta', () => {
    const { scene, creados } = crearEscena();
    scene.createMarker(objeto('mesa', 'PROP', 300, 400, { arte: MESA, pintada: true }));
    expect(de(creados, 'image').some((i) => String(i.args[2]).includes('mesa'))).toBe(true);
  });
});
