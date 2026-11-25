import { readFileSync } from 'fs';
import { join } from 'path';

// Mismo andamiaje que game-world.collision.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo
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

import { MapObjectState, NpcConfig, SimulationWorldState } from '../../core/models/simulation.model';
import { DataDrivenWorldScene } from './game-world.component';
import { MARKER_INTERACT_RADIUS, NPC_INTERACT_RADIUS } from './interaction-priority.util';
import type { Mock } from 'vitest';

interface FakeNode {
  x: number; y: number; scene: object; visible: boolean; alpha: number; scale: number;
  setScale: Mock; setAlpha: Mock; setVisible: Mock; setPosition: Mock;
  setStrokeStyle: Mock; setDepth: Mock; setOrigin: Mock; setText: Mock;
  [extra: string]: unknown;
}

function node(x = 0, y = 0): FakeNode {
  const self: FakeNode = {
    x, y, scene: {}, visible: true, alpha: 1, scale: 1,
    setScale: vi.fn((v: number) => { self.scale = v; return self; }),
    setAlpha: vi.fn((v: number) => { self.alpha = v; return self; }),
    setVisible: vi.fn((v: boolean) => { self.visible = v; return self; }),
    setPosition: vi.fn((nx: number, ny: number) => { self.x = nx; self.y = ny; return self; }),
    setStrokeStyle: vi.fn(() => self),
    setDepth: vi.fn(() => self),
    setOrigin: vi.fn(() => self),
    setText: vi.fn((t: string) => { self['text'] = t; return self; }),
  };
  return self;
}

/** Superficie privada de la escena que estos casos ejercitan. */
interface SceneProbe {
  player: { x: number; y: number };
  world: SimulationWorldState;
  markers: Map<string, FakeNode>;
  markerData: Map<string, MapObjectState>;
  markerLabels: Map<string, FakeNode>;
  doorHints: Map<string, FakeNode>;
  npcMarkers: Map<string, FakeNode>;
  sound: { play: Mock };
  add: { ellipse: Mock; text: Mock };
  nearestKey: string | null;
  alsoKey: string | null;
  revealed: string[];
  targetRing?: { halo: FakeNode; ring: FakeNode };
  updateNearestInteraction(suppressSound?: boolean): void;
  interactNearest(): void;
  setOrientation(next: { nextTargetKey: string | null; doorStates: Record<string, 'open' | 'locked'>; dimmedKeys: ReadonlySet<string> }): void;
  setCompactLabels(compact: boolean): void;
  ready: boolean;
  ambientMovers: Map<string, unknown>;
  npcMovers: Map<string, unknown>;
  followLabels: string[];
}

const objectState = (key: string, type: MapObjectState['type'], x: number, y: number): MapObjectState => ({
  key, label: key.toUpperCase(), type, x, y, width: 32, height: 32, color: '#4fa3a5', icon: 'x', shortCode: '',
  collision: false, interactionPrompt: 'texto sembrado', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
});

const npcConfig = (key: string, displayName: string, x: number, y: number): NpcConfig => ({
  key, displayName, x, y, npcType: 'colleague', portrait: '', recipeId: 'psicologa-hospitalaria', dialogue: { lines: [{ text: 'hola' }] },
});

interface Harness {
  scene: SceneProbe;
  callbacks: {
    onProximity: Mock; onProximityAlso: Mock; onNothingNearby: Mock;
    onInteract: Mock; onNpcInteract: Mock; reduceMotion: boolean; sfxMuted: boolean;
  };
  nodes: Record<string, FakeNode>;
}

/**
 * Sala de urgencias mínima: psicóloga (780,440) y puerta (838,440), enfermera (560,330), kit (318,428).
 * El jugador empieza lejos de todo.
 */
function crearEscena(player = { x: 480, y: 430 }): Harness {
  const callbacks = {
    onProximity: vi.fn(), onProximityAlso: vi.fn(), onNothingNearby: vi.fn(),
    onInteract: vi.fn(), onNpcInteract: vi.fn(), reduceMotion: false, sfxMuted: false,
  };
  const scene = new DataDrivenWorldScene(callbacks as never) as unknown as SceneProbe;
  scene.world = { map: { key: 'hospital-urgencias', width: 960, height: 528 }, objects: [], collisions: [], inventory: [] } as unknown as SimulationWorldState;
  scene.player = { ...player };
  scene.sound = { play: vi.fn() };
  scene.markers = new Map(); scene.markerData = new Map(); scene.markerLabels = new Map();
  scene.doorHints = new Map(); scene.npcMarkers = new Map();
  scene.ambientMovers = new Map(); scene.npcMovers = new Map();
  scene.ready = true;
  const nodes: Record<string, FakeNode> = {};
  const addMarker = (obj: MapObjectState) => {
    // el contenedor del marcador se coloca en (x, y); los pies están 16 px más abajo
    nodes[obj.key] = node(obj.x, obj.y);
    scene.markers.set(obj.key, nodes[obj.key]);
    scene.markerData.set(obj.key, obj);
    if (obj.type === 'EXIT') {
      const hint = node(obj.x, obj.y - 90);
      hint['__doorBg'] = node(); hint['__doorLock'] = node();
      scene.doorHints.set(obj.key, hint);
      nodes[`${obj.key}#hint`] = hint;
    } else {
      const label = node(); scene.markerLabels.set(obj.key, label); nodes[`${obj.key}#label`] = label;
    }
  };
  const addNpc = (cfg: NpcConfig) => {
    const container = node(cfg.x, cfg.y);
    container['__npcConfig'] = cfg;
    const label = node(); label['displayHeight'] = 14;
    container['__labelSprite'] = label; container['__hintSprite'] = node(); container['__labelOffsetY'] = -80;
    scene.npcMarkers.set(cfg.key, container);
    nodes[`npc:${cfg.key}`] = container;
  };
  addMarker(objectState('tool-pap', 'TOOL', 318, 412));
  addMarker(objectState('puerta-sala-escucha', 'EXIT', 838, 424));
  addMarker(objectState('zona-restringida', 'OBJECT', 660, 268));
  addNpc(npcConfig('enfermera-urgencias', 'Enfermera de urgencias', 560, 330));
  addNpc(npcConfig('psicologa-orientadora', 'Psicóloga hospitalaria', 780, 440));
  const ellipses: FakeNode[] = [];
  scene.add = { ellipse: vi.fn(() => { const e = node(); ellipses.push(e); return e; }), text: vi.fn(() => node()) };
  nodes['#ellipses'] = ellipses as unknown as FakeNode;
  return { scene, callbacks, nodes };
}

const move = (h: Harness, x: number, y: number) => { h.scene.player.x = x; h.scene.player.y = y; h.scene.updateNearestInteraction(true); };

describe('DataDrivenWorldScene: proximidad unificada de personas y objetos', () => {
  it('sin nada cerca no se ofrece nada y no se avisa', () => {
    const h = crearEscena();
    h.scene.updateNearestInteraction(true);
    expect(h.scene.nearestKey).toBeNull();
    expect(h.callbacks.onProximity).not.toHaveBeenCalled();
    expect(h.callbacks.onProximityAlso).not.toHaveBeenCalled();
  });

  it('una persona a ≤ 60 px sale como candidato principal con un MapObjectState sintético npc:{clave}', () => {
    const h = crearEscena();
    move(h, 559, 373); // 43 px de la enfermera
    expect(h.scene.nearestKey).toBe('npc:enfermera-urgencias');
    expect(h.callbacks.onProximity).toHaveBeenCalledTimes(1);
    const emitted = h.callbacks.onProximity.mock.calls[0][0] as MapObjectState;
    expect(emitted).toMatchObject({
      key: 'npc:enfermera-urgencias', label: 'Enfermera de urgencias', type: 'PERSON', x: 560, y: 330,
      decisionOptionId: null, toolCode: null, dialogue: null, interactionPrompt: '', interactionText: '',
    });
  });

  it('el alcance de una persona es 72 px: a 70 px sí, a 80 px no; los objetos 74', () => {
    expect(NPC_INTERACT_RADIUS).toBe(72);
    expect(MARKER_INTERACT_RADIUS).toBe(74);
    const h = crearEscena();
    move(h, 560, 400); // 70 px
    expect(h.scene.nearestKey).toBe('npc:enfermera-urgencias');
    move(h, 560, 406); // 76 px: lo más lejos que acepta el servidor (60 + 16); el actual aguanta
    expect(h.scene.nearestKey).toBe('npc:enfermera-urgencias');
    move(h, 560, 407); // 77 px: el servidor ya la rechazaría, el cliente deja de ofrecerla
    expect(h.scene.nearestKey).toBeNull();
    expect(h.callbacks.onProximity).toHaveBeenLastCalledWith(null);
    move(h, 560, 405); // 75 px: ya no la ofrece al volver (sin histéresis a la entrada)
    expect(h.scene.nearestKey).toBeNull();
  });

  it('una persona y una puerta a igual distancia: la persona es la principal y la puerta la secundaria', () => {
    const h = crearEscena();
    move(h, 810, 440); // psicóloga a 30, puerta (pies en y=440) a 28
    expect(h.scene.nearestKey).toBe('npc:psicologa-orientadora');
    expect(h.scene.alsoKey).toBe('puerta-sala-escucha');
    const also = h.callbacks.onProximityAlso.mock.calls.at(-1)?.[0] as MapObjectState;
    expect(also.key).toBe('puerta-sala-escucha');
    expect(also.type).toBe('EXIT');
  });

  it('la puerta gana cuando el jugador está sobre ella', () => {
    const h = crearEscena();
    move(h, 836, 424);
    expect(h.scene.nearestKey).toBe('puerta-sala-escucha');
    expect(h.scene.alsoKey).toBe('npc:psicologa-orientadora');
  });

  it('un marcador sigue saliendo con su nombre de pantalla y su posición viva', () => {
    const h = crearEscena();
    h.nodes['tool-pap'].x = 321; // el marcador se movió respecto del dato original
    move(h, 330, 420);
    const emitted = h.callbacks.onProximity.mock.calls[0][0] as MapObjectState;
    expect(emitted).toMatchObject({ key: 'tool-pap', type: 'TOOL', x: 321, y: 412 });
  });

  it('no repite avisos mientras el candidato no cambia', () => {
    const h = crearEscena();
    move(h, 559, 373);
    move(h, 558, 374);
    move(h, 557, 375);
    expect(h.callbacks.onProximity).toHaveBeenCalledTimes(1);
    expect(h.callbacks.onProximityAlso).not.toHaveBeenCalled();
  });

  it('la histéresis evita el parpadeo entre dos candidatos a distancia parecida', () => {
    const h = crearEscena();
    move(h, 810, 440);
    expect(h.scene.nearestKey).toBe('npc:psicologa-orientadora');
    // la puerta mejora por poco al actual (menos de 8 px de puntaje): no cambia
    move(h, 822, 440);
    expect(h.scene.nearestKey).toBe('npc:psicologa-orientadora');
    move(h, 838, 424);
    expect(h.scene.nearestKey).toBe('puerta-sala-escucha');
  });

  it('suena el aviso de proximidad al entrar en alcance, no al cargar la sala ni con sonido apagado', () => {
    const h = crearEscena();
    move(h, 559, 373);
    expect(h.scene.sound.play).not.toHaveBeenCalled(); // update(true) = sin sonido
    h.scene.player.x = 480; h.scene.player.y = 430; h.scene.updateNearestInteraction();
    h.scene.player.x = 559; h.scene.player.y = 373; h.scene.updateNearestInteraction();
    expect(h.scene.sound.play).toHaveBeenCalledTimes(1);
    expect(h.scene.sound.play).toHaveBeenCalledWith('proximity-blip', { volume: 0.45 });
    h.callbacks.sfxMuted = true;
    h.scene.player.x = 480; h.scene.player.y = 430; h.scene.updateNearestInteraction();
    h.scene.player.x = 559; h.scene.player.y = 373; h.scene.updateNearestInteraction();
    expect(h.scene.sound.play).toHaveBeenCalledTimes(1);
  });
});

describe('DataDrivenWorldScene: interactNearest despacha por clave', () => {
  it('una persona abre su conversación (onNpcInteract) y no pasa por onInteract', () => {
    const h = crearEscena();
    move(h, 559, 373);
    h.scene.interactNearest();
    expect(h.callbacks.onNpcInteract).toHaveBeenCalledTimes(1);
    expect((h.callbacks.onNpcInteract.mock.calls[0][0] as NpcConfig).key).toBe('enfermera-urgencias');
    expect(h.callbacks.onInteract).not.toHaveBeenCalled();
    expect(h.callbacks.onNothingNearby).not.toHaveBeenCalled();
  });

  it('un marcador sigue el camino de siempre (onInteract con el objeto)', () => {
    const h = crearEscena();
    move(h, 330, 420);
    h.scene.interactNearest();
    expect((h.callbacks.onInteract.mock.calls[0][0] as MapObjectState).key).toBe('tool-pap');
    expect(h.callbacks.onNpcInteract).not.toHaveBeenCalled();
  });

  it('con la persona más cercana que la puerta, E actúa sobre la persona (nunca una puerta le roba la E)', () => {
    const h = crearEscena();
    move(h, 800, 440); // psicóloga a 20, puerta a 38 (+12)
    h.scene.interactNearest();
    expect((h.callbacks.onNpcInteract.mock.calls[0][0] as NpcConfig).key).toBe('psicologa-orientadora');
    expect(h.callbacks.onInteract).not.toHaveBeenCalled();
  });

  it('sin nada al alcance avisa una sola vez por pulsación, sin sonido y sin interactuar', () => {
    const h = crearEscena();
    h.scene.updateNearestInteraction(true);
    h.scene.interactNearest();
    expect(h.callbacks.onNothingNearby).toHaveBeenCalledTimes(1);
    h.scene.interactNearest();
    expect(h.callbacks.onNothingNearby).toHaveBeenCalledTimes(2); // una por pulsación
    expect(h.scene.sound.play).not.toHaveBeenCalled();
    expect(h.callbacks.onInteract).not.toHaveBeenCalled();
    expect(h.callbacks.onNpcInteract).not.toHaveBeenCalled();
  });
});

describe('DataDrivenWorldScene: destino, anillo, rótulos y atenuados', () => {
  const orient = (h: Harness, over: Partial<{ nextTargetKey: string | null; doorStates: Record<string, 'open' | 'locked'>; dimmedKeys: ReadonlySet<string> }> = {}) =>
    h.scene.setOrientation({ nextTargetKey: null, doorStates: {}, dimmedKeys: new Set(), ...over });

  it('el destino lleva un solo anillo (anillo y halo), estático, creado una vez y reposicionado', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'tool-pap' });
    const ellipses = h.nodes['#ellipses'] as unknown as FakeNode[];
    expect(ellipses).toHaveLength(2);
    expect(h.scene.targetRing?.ring.x).toBe(318);
    expect(h.scene.targetRing?.ring.y).toBe(428); // pies del marcador: y + 16
    orient(h, { nextTargetKey: 'npc:enfermera-urgencias' });
    expect(ellipses).toHaveLength(2);
    expect([h.scene.targetRing?.ring.x, h.scene.targetRing?.ring.y]).toEqual([560, 330]);
    orient(h, { nextTargetKey: null });
    expect(h.scene.targetRing?.ring.visible).toBe(false);
    expect(h.scene.targetRing?.halo.visible).toBe(false);
  });

  it('el anillo de un marcador queda quieto aunque el icono flote; el de una persona que camina la sigue', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'tool-pap' });
    const ring = h.scene.targetRing!.ring;
    const placed = ring.setPosition.mock.calls.length;
    h.nodes['tool-pap'].y = 409; // la flotación suave del marcador (tween) lo sube unos píxeles
    move(h, 330, 420);
    move(h, 331, 421);
    expect(ring.setPosition.mock.calls.length).toBe(placed);
    expect([ring.x, ring.y]).toEqual([318, 428]);
    orient(h, { nextTargetKey: 'npc:enfermera-urgencias' });
    h.nodes['npc:enfermera-urgencias'].x = 570; h.nodes['npc:enfermera-urgencias'].y = 335;
    move(h, 559, 373);
    expect([h.scene.targetRing!.ring.x, h.scene.targetRing!.ring.y]).toEqual([570, 335]);
  });

  it('un destino que no existe en la sala no inventa anillo', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'tool-spikes' });
    expect(h.scene.add.ellipse).not.toHaveBeenCalled();
    expect(h.scene.targetRing).toBeUndefined();
  });

  it('el anillo no usa tweens ni animación (también con movimiento normal)', () => {
    const h = crearEscena();
    (h.scene as unknown as { tweens: { add: Mock } }).tweens = { add: vi.fn() };
    orient(h, { nextTargetKey: 'tool-pap' });
    move(h, 330, 420);
    expect((h.scene as unknown as { tweens: { add: Mock } }).tweens.add).not.toHaveBeenCalled();
  });

  it('el rótulo del destino se ve aunque esté lejos y se oculta al cambiar de destino', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'tool-pap' });
    expect(h.nodes['tool-pap#label'].alpha).toBe(1);
    orient(h, { nextTargetKey: 'zona-restringida' });
    expect(h.nodes['tool-pap#label'].alpha).toBe(0);
    expect(h.nodes['zona-restringida#label'].alpha).toBe(1);
  });

  it('a lo sumo destino y los dos más cercanos dentro de 140 px', () => {
    const h = crearEscena({ x: 700, y: 430 });
    h.scene.updateNearestInteraction(true);
    orient(h, { nextTargetKey: 'tool-pap' });
    // desde (700,430): psicóloga a 80, puerta a 138; zona restringida a 168 (fuera); enfermera a 183 (fuera)
    expect(h.scene.revealed).toEqual(['tool-pap', 'npc:psicologa-orientadora', 'puerta-sala-escucha']);
    expect(h.nodes['puerta-sala-escucha#hint'].visible).toBe(true);
    expect((h.nodes['npc:psicologa-orientadora']['__labelSprite'] as FakeNode).alpha).toBe(1);
    expect((h.nodes['npc:enfermera-urgencias']['__labelSprite'] as FakeNode).alpha).toBe(0);
    expect(h.nodes['zona-restringida#label'].alpha).toBe(0);
  });

  it('en táctil (modo compacto) solo el destino y el más cercano', () => {
    const h = crearEscena({ x: 700, y: 430 });
    h.scene.setCompactLabels(true);
    h.scene.updateNearestInteraction(true);
    orient(h, { nextTargetKey: 'tool-pap' });
    expect(h.scene.revealed).toEqual(['tool-pap', 'npc:psicologa-orientadora']);
    expect(h.nodes['puerta-sala-escucha#hint'].visible).toBe(false);
  });

  it('una puerta bloqueada enciende su candado y borde discontinuo; abierta, no', () => {
    const h = crearEscena();
    const hint = h.nodes['puerta-sala-escucha#hint'];
    orient(h, { doorStates: { 'puerta-sala-escucha': 'locked' } });
    expect((hint['__doorLock'] as FakeNode).setVisible).toHaveBeenLastCalledWith(true);
    expect((hint['__doorBg'] as FakeNode).setStrokeStyle).toHaveBeenLastCalledWith(1, 0x4fa3a5, 0);
    orient(h, { doorStates: { 'puerta-sala-escucha': 'open' } });
    expect((hint['__doorLock'] as FakeNode).setVisible).toHaveBeenLastCalledWith(false);
    expect((hint['__doorBg'] as FakeNode).setStrokeStyle).toHaveBeenLastCalledWith(1, 0x4fa3a5, 0.5);
  });

  it('un objeto atenuado baja a alfa .55, sin anillo, y su rótulo solo aparece muy cerca', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'zona-restringida', dimmedKeys: new Set(['zona-restringida']) });
    expect(h.nodes['zona-restringida'].alpha).toBe(0.55);
    expect(h.scene.add.ellipse).not.toHaveBeenCalled(); // atenuado: sin anillo aunque sea el destino
    expect(h.nodes['zona-restringida#label'].alpha).toBe(0);
    move(h, 660, 330); // a 62 px: dentro de su radio de interacción
    expect(h.nodes['zona-restringida#label'].alpha).toBe(1);
  });

  it('la misma orientación no repinta ni crea nada nuevo', () => {
    const h = crearEscena();
    const same = { nextTargetKey: 'tool-pap', doorStates: {} as Record<string, 'open' | 'locked'>, dimmedKeys: new Set<string>() };
    h.scene.setOrientation(same);
    const alphaCalls = h.nodes['tool-pap'].setAlpha.mock.calls.length;
    h.scene.updateNearestInteraction(true);
    h.scene.updateNearestInteraction(true);
    expect(h.nodes['tool-pap'].setAlpha.mock.calls.length).toBe(alphaCalls); // por cuadro no se repinta
    expect(h.scene.add.ellipse).toHaveBeenCalledTimes(2);
  });
});

describe('DataDrivenWorldScene: los rótulos se dibujan sobre los actores y siguen a su dueño', () => {
  const orient = (h: Harness, over: { nextTargetKey?: string | null } = {}) =>
    h.scene.setOrientation({ nextTargetKey: over.nextTargetKey ?? null, doorStates: {}, dimmedKeys: new Set() });

  it('el rótulo de una persona se coloca sobre su cabeza y su pista apilada encima del nombre', () => {
    const h = crearEscena();
    move(h, 559, 373);
    const npc = h.nodes['npc:enfermera-urgencias'];
    const label = npc['__labelSprite'] as FakeNode;
    const hint = npc['__hintSprite'] as FakeNode;
    expect(label.setPosition).toHaveBeenLastCalledWith(560, 330 - 80);
    expect(hint.setPosition).toHaveBeenLastCalledWith(560, 330 - 80 - 14 - 2);
    expect(label.alpha).toBe(1);
    expect(hint.alpha).toBe(1);
  });

  it('el rótulo de un marcador se coloca bajo el icono en su posición de reposo, aunque el icono flote', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'tool-pap' });
    const label = h.nodes['tool-pap#label'];
    expect([label.x, label.y]).toEqual([318, 412 + 28]);
    h.nodes['tool-pap'].y = 409; // flotación del tween
    move(h, 330, 420);
    expect([label.x, label.y]).toEqual([318, 412 + 28]);
  });

  it('solo el rótulo de quien se desplaza se recoloca por cuadro', () => {
    const h = crearEscena();
    move(h, 559, 373);
    expect(h.scene.followLabels).toEqual([]); // la enfermera está quieta: nada que seguir por cuadro
    h.scene.npcMovers.set('enfermera-urgencias', {});
    move(h, 558, 373);
    h.callbacks.onProximity.mockClear();
    // un cambio del conjunto visible reconstruye la lista de seguimiento
    move(h, 480, 430);
    move(h, 559, 373);
    expect(h.scene.followLabels).toEqual(['npc:enfermera-urgencias']);
    const npc = h.nodes['npc:enfermera-urgencias'];
    const label = npc['__labelSprite'] as FakeNode;
    npc.x = 566; npc.y = 331; // camina
    h.scene.updateNearestInteraction(true);
    expect([label.x, label.y]).toEqual([566, 331 - 80]);
  });

  it('los rótulos de marcadores y personas viven fuera de sus contenedores (sobre los actores)', () => {
    const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');
    expect(source).toContain('const LABEL_DEPTH = DEPTH.UI - 1;');
    expect(source).toMatch(/const marker = this\.add\.container\(object\.x, object\.y, \[markerShadow, pulse, main\]\);/);
    expect(source).not.toMatch(/this\.add\.container\([^)]*\[[^\]]*\blabel\b[^\]]*\]\)/);
    // Tres de rótulos (marcador, nombre y pista de una persona), dos del ratón (F6-7: contorno y verbo al pasar) y el
    // chevrón con el nombre de la persona clave (P6), la flecha del siguiente paso y la frase «E · …» de un marcador cercano (P9).
    expect(source.match(/\.setDepth\(LABEL_DEPTH\)/g) ?? []).toHaveLength(8);
  });
});

/** Lo privado que los casos de orientarse en el juego (P9) ejercitan, más allá de `SceneProbe`. */
interface OrientacionProbe extends SceneProbe {
  nearRing?: { halo: FakeNode; ring: FakeNode };
  stepMark?: FakeNode;
  markerPrompt?: FakeNode;
  walk: { target: { x: number; y: number; radius: number } | null };
  walkInteractKey: string | null;
  walkGoal: { key: string; label: string } | null;
  motionPaused: boolean;
  examinedKeys: ReadonlySet<string>;
  handlePointerDown(pointer: unknown): void;
  finishWalkInteract(arrived: boolean): void;
  walkToKey(key: string): boolean;
  setShortcutsEnabled(enabled: boolean): void;
}

describe('DataDrivenWorldScene: proximidad visible (P9)', () => {
  const orient = (h: Harness, over: Partial<{ nextTargetKey: string | null; doorStates: Record<string, 'open' | 'locked'>; dimmedKeys: ReadonlySet<string> }> = {}) =>
    h.scene.setOrientation({ nextTargetKey: null, doorStates: {}, dimmedKeys: new Set(), ...over });
  const probe = (h: Harness) => h.scene as unknown as OrientacionProbe;
  const hintOf = (h: Harness, npc: string) => h.nodes[`npc:${npc}`]['__hintSprite'] as FakeNode;

  it('al entrar en el radio de una persona aparece su anillo de cercanía y «E · Hablar con …» junto a ella', () => {
    const h = crearEscena();
    expect(probe(h).nearRing).toBeUndefined();
    move(h, 559, 373); // 43 px de la enfermera
    expect(h.scene.nearestKey).toBe('npc:enfermera-urgencias');
    const ring = probe(h).nearRing!;
    expect([ring.ring.x, ring.ring.y, ring.ring.visible]).toEqual([560, 330, true]);
    expect(hintOf(h, 'enfermera-urgencias').setText).toHaveBeenLastCalledWith('E · Hablar con Enfermera de urgencias');
    expect(hintOf(h, 'enfermera-urgencias').alpha).toBe(1);
  });

  it('al salir del radio el anillo y la frase desaparecen', () => {
    const h = crearEscena();
    move(h, 559, 373);
    move(h, 480, 430);
    expect(h.scene.nearestKey).toBeNull();
    expect(probe(h).nearRing!.ring.visible).toBe(false);
    expect(probe(h).nearRing!.halo.visible).toBe(false);
    expect(hintOf(h, 'enfermera-urgencias').alpha).toBe(0);
  });

  it('el anillo de cercanía se crea una vez (anillo y halo) y sigue al candidato, aunque camine', () => {
    const h = crearEscena();
    const ellipses = h.nodes['#ellipses'] as unknown as FakeNode[];
    move(h, 559, 373);
    expect(ellipses).toHaveLength(2);
    h.nodes['npc:enfermera-urgencias'].x = 566; h.nodes['npc:enfermera-urgencias'].y = 334;
    move(h, 560, 376);
    expect(ellipses).toHaveLength(2);
    expect([probe(h).nearRing!.ring.x, probe(h).nearRing!.ring.y]).toEqual([566, 334]);
  });

  it('el anillo de cercanía no se parece al del siguiente paso: otro trazo, otro relleno, y conviven', () => {
    const h = crearEscena();
    orient(h, { nextTargetKey: 'npc:enfermera-urgencias' });
    move(h, 559, 373);
    const ellipses = h.nodes['#ellipses'] as unknown as FakeNode[];
    expect(ellipses).toHaveLength(4);
    expect(probe(h).nearRing!.ring).not.toBe(h.scene.targetRing!.ring);
    const llamadas = h.scene.add.ellipse.mock.calls as number[][];
    const [, , ancho, alto, relleno, opacidad] = llamadas[3];
    expect([ancho, alto, relleno, opacidad]).toEqual([84, 30, 0xffffff, 0.14]);   // la cercanía lleva relleno tenue
    expect(llamadas[1].length).toBe(4);                                          // el del siguiente paso, solo trazo
  });

  it('lo atenuado (otra etapa) no lleva anillo de cercanía', () => {
    const h = crearEscena();
    orient(h, { dimmedKeys: new Set(['zona-restringida']) });
    move(h, 660, 330);
    expect(h.scene.nearestKey).toBe('zona-restringida');
    expect(probe(h).nearRing).toBeUndefined();
  });

  it('E y «Interactuar» actúan sobre ese mismo candidato resaltado', () => {
    const h = crearEscena();
    move(h, 559, 373);
    const resaltado = probe(h).nearRing!.ring;
    h.scene.interactNearest();
    expect(h.callbacks.onNpcInteract).toHaveBeenCalledTimes(1);
    expect((h.callbacks.onNpcInteract.mock.calls[0][0] as NpcConfig).key).toBe('enfermera-urgencias');
    expect([resaltado.x, resaltado.y]).toEqual([560, 330]);
  });

  it('con puntero táctil o sin atajos la frase no menciona la tecla', () => {
    const h = crearEscena();
    probe(h).setShortcutsEnabled(false);
    move(h, 559, 373);
    expect(hintOf(h, 'enfermera-urgencias').setText).toHaveBeenLastCalledWith('Enter · Hablar con Enfermera de urgencias');
    const t = crearEscena();
    const original = window.matchMedia;
    (window as unknown as { matchMedia: unknown }).matchMedia = vi.fn(() => ({ matches: true }));
    try {
      move(t, 559, 373);
      expect(hintOf(t, 'enfermera-urgencias').setText).toHaveBeenLastCalledWith('Hablar con Enfermera de urgencias');
    } finally {
      (window as unknown as { matchMedia: unknown }).matchMedia = original;
    }
  });

  it('un objeto cercano dice «E · Revisar …» bajo su rótulo, una sola vez, y lo retira al alejarse', () => {
    const h = crearEscena();
    (h.nodes['zona-restringida#label'] as FakeNode)['displayHeight'] = 14;
    move(h, 660, 330);
    const texts = h.scene.add.text.mock.calls as unknown[][];
    expect(texts).toHaveLength(1);
    expect(texts[0][2]).toBe('E · Revisar ZONA-RESTRINGIDA');
    const prompt = probe(h).markerPrompt!;
    expect([prompt.x, prompt.y]).toEqual([h.nodes['zona-restringida#label'].x, h.nodes['zona-restringida#label'].y + 14 + 2]);
    expect(prompt.visible).toBe(true);
    move(h, 661, 331);
    expect(h.scene.add.text).toHaveBeenCalledTimes(1); // la misma pieza, sin crear otra
    move(h, 480, 430);
    expect(prompt.visible).toBe(false);
  });

  it('una herramienta dice «Recoger …»; una puerta no lleva esta frase (ya dice «E Pasar a … →» en su rótulo)', () => {
    const h = crearEscena();
    (h.nodes['tool-pap#label'] as FakeNode)['displayHeight'] = 14;
    move(h, 330, 420);
    expect((h.scene.add.text.mock.calls as unknown[][])[0][2]).toBe('E · Recoger TOOL-PAP');
    const d = crearEscena();
    move(d, 836, 424);
    expect(d.scene.nearestKey).toBe('puerta-sala-escucha');
    expect(d.scene.add.text).not.toHaveBeenCalled();
  });

  it('nada de esto usa tweens ni crea piezas por cuadro: moverse dentro del radio no vuelve a crear ni a repintar', () => {
    const h = crearEscena();
    (h.scene as unknown as { tweens: { add: Mock } }).tweens = { add: vi.fn() };
    move(h, 559, 373);
    const creadas = h.scene.add.ellipse.mock.calls.length + h.scene.add.text.mock.calls.length;
    const textos = hintOf(h, 'enfermera-urgencias').setText.mock.calls.length;
    for (let i = 0; i < 20; i++) move(h, 559 + (i % 3), 373);
    expect(h.scene.add.ellipse.mock.calls.length + h.scene.add.text.mock.calls.length).toBe(creadas);
    expect(hintOf(h, 'enfermera-urgencias').setText.mock.calls.length).toBe(textos);
    expect((h.scene as unknown as { tweens: { add: Mock } }).tweens.add).not.toHaveBeenCalled();
  });
});

describe('DataDrivenWorldScene: la flecha del siguiente paso (P9)', () => {
  const orient = (h: Harness, nextTargetKey: string | null) =>
    h.scene.setOrientation({ nextTargetKey, doorStates: {}, dimmedKeys: new Set() });
  const flecha = (h: Harness) => (h.scene as unknown as OrientacionProbe).stepMark!;

  it('el destino lleva una flecha estática junto a él (además del anillo) y se retira al cambiar a nada', () => {
    const h = crearEscena();
    orient(h, 'npc:enfermera-urgencias');
    expect((h.scene.add.text.mock.calls as unknown[][])[0].slice(2, 3)).toEqual(['▶']);
    expect([flecha(h).x, flecha(h).y, flecha(h).visible]).toEqual([560 - 22, 330 - 46, true]);
    orient(h, null);
    expect(flecha(h).visible).toBe(false);
  });

  it('según qué señala va a otra altura: una herramienta más baja que una persona', () => {
    const h = crearEscena();
    orient(h, 'tool-pap');
    expect([flecha(h).x, flecha(h).y]).toEqual([318 - 22, 428 - 26]);
    orient(h, 'puerta-sala-escucha');
    expect(flecha(h).y).toBe(440 - 52);
  });

  it('se crea una sola vez y una persona que camina se la lleva', () => {
    const h = crearEscena();
    orient(h, 'npc:enfermera-urgencias');
    orient(h, 'tool-pap');
    orient(h, 'npc:enfermera-urgencias');
    expect(h.scene.add.text).toHaveBeenCalledTimes(1);
    h.nodes['npc:enfermera-urgencias'].x = 570; h.nodes['npc:enfermera-urgencias'].y = 335;
    move(h, 559, 373);
    expect([flecha(h).x, flecha(h).y]).toEqual([570 - 22, 335 - 46]);
  });

  it('un destino que no existe en la sala o está atenuado no inventa flecha', () => {
    const h = crearEscena();
    orient(h, 'tool-spikes');
    expect(h.scene.add.text).not.toHaveBeenCalled();
    h.scene.setOrientation({ nextTargetKey: 'zona-restringida', doorStates: {}, dimmedKeys: new Set(['zona-restringida']) });
    expect(h.scene.add.text).not.toHaveBeenCalled();
  });
});

describe('DataDrivenWorldScene: clic o toque para ir (P9)', () => {
  const probe = (h: Harness) => h.scene as unknown as OrientacionProbe;
  const pointer = (over: Partial<{ wasTouch: boolean; button: number; worldX: number; worldY: number }> = {}) =>
    ({ wasTouch: false, button: 0, worldX: 0, worldY: 0, ...over });
  const graficos = () => {
    const g: Record<string, unknown> = { active: true };
    for (const m of ['clear', 'lineStyle', 'strokeRect', 'setDepth', 'setVisible']) g[m] = vi.fn(() => g);
    return g;
  };
  /** Una sala con el jugador a 70 px de la enfermera (dentro del radio de percepción) y el dibujo del contorno de mentira. */
  function conRaton(): Harness {
    const h = crearEscena({ x: 560, y: 400 });
    (h.scene.add as unknown as { graphics: Mock }).graphics = vi.fn(graficos);
    return h;
  }

  it('el clic en el suelo camina hasta ahí, sin interactuar al llegar', () => {
    const h = conRaton();
    probe(h).handlePointerDown(pointer({ worldX: 400, worldY: 420 }));
    expect(probe(h).walk.target).toEqual({ x: 400, y: 420, radius: 6 });
    expect(probe(h).walkInteractKey).toBeNull();
  });

  it('el clic en una persona camina hasta su alcance y recuerda que debe interactuar al llegar', () => {
    const h = conRaton();
    probe(h).handlePointerDown(pointer({ worldX: 560, worldY: 330 - 20 }));
    expect(probe(h).walk.target).toEqual({ x: 560, y: 330, radius: 72 - 14 });
    expect(probe(h).walkInteractKey).toBe('npc:enfermera-urgencias');
  });

  it('el toque del dedo también camina, con un margen de puntería mayor que el del ratón, y no dibuja contorno', () => {
    const h = conRaton();
    const casi = { worldX: 560 + 22 + 10, worldY: 330 - 20 };   // fuera de la caja del cursor, dentro de la del dedo
    probe(h).handlePointerDown(pointer(casi));
    expect(probe(h).walkInteractKey).toBeNull();               // un cursor lo falla: camina al suelo
    probe(h).handlePointerDown(pointer({ ...casi, wasTouch: true }));
    expect(probe(h).walkInteractKey).toBe('npc:enfermera-urgencias');
    expect(probe(h).walk.target).toMatchObject({ x: 560, y: 330 });
  });

  it('con una capa abierta o con un botón que no es el principal no camina', () => {
    const h = conRaton();
    probe(h).handlePointerDown(pointer({ button: 2, worldX: 400, worldY: 420 }));
    expect(probe(h).walk.target).toBeNull();
    probe(h).motionPaused = true;
    probe(h).handlePointerDown(pointer({ wasTouch: true, worldX: 400, worldY: 420 }));
    expect(probe(h).walk.target).toBeNull();
  });

  it('un clic en el suelo suelta lo que esperaba una persona', () => {
    const h = conRaton();
    probe(h).handlePointerDown(pointer({ worldX: 560, worldY: 330 - 20 }));
    probe(h).handlePointerDown(pointer({ worldX: 300, worldY: 450 }));
    expect(probe(h).walkInteractKey).toBeNull();
  });

  it('«Ir a…» solo lleva: no hereda la interacción de un clic anterior', () => {
    const h = conRaton();
    probe(h).handlePointerDown(pointer({ worldX: 560, worldY: 330 - 20 }));
    expect(probe(h).walkToKey('puerta-sala-escucha')).toBe(true);
    expect(probe(h).walkInteractKey).toBeNull();
    expect(probe(h).walkGoal).toMatchObject({ key: 'puerta-sala-escucha' });
  });

  it('al llegar a lo clicado, interactúa con eso: pasa a ser el candidato principal y se abre su conversación', () => {
    const h = conRaton();
    move(h, 810, 440);                                   // la psicóloga es la principal
    expect(h.scene.nearestKey).toBe('npc:psicologa-orientadora');
    probe(h).walkInteractKey = 'puerta-sala-escucha';    // pero se clicó la puerta
    probe(h).finishWalkInteract(true);
    expect(h.scene.nearestKey).toBe('puerta-sala-escucha');
    expect((h.callbacks.onProximity.mock.calls.at(-1)?.[0] as MapObjectState).key).toBe('puerta-sala-escucha');
    expect((h.callbacks.onInteract.mock.calls.at(-1)?.[0] as MapObjectState).key).toBe('puerta-sala-escucha');
    expect(probe(h).walkInteractKey).toBeNull();
  });

  it('al llegar a una persona abre su conversación; si se rindió (muro, atasco) no hace nada', () => {
    const h = conRaton();
    move(h, 559, 373);
    probe(h).walkInteractKey = 'npc:enfermera-urgencias';
    probe(h).finishWalkInteract(false);
    expect(h.callbacks.onNpcInteract).not.toHaveBeenCalled();
    expect(probe(h).walkInteractKey).toBeNull();
    probe(h).walkInteractKey = 'npc:enfermera-urgencias';
    probe(h).finishWalkInteract(true);
    expect((h.callbacks.onNpcInteract.mock.calls[0][0] as NpcConfig).key).toBe('enfermera-urgencias');
  });

  it('sin nada clicado, llegar no interactúa', () => {
    const h = conRaton();
    move(h, 559, 373);
    probe(h).finishWalkInteract(true);
    expect(h.callbacks.onNpcInteract).not.toHaveBeenCalled();
    expect(h.callbacks.onInteract).not.toHaveBeenCalled();
  });
});
