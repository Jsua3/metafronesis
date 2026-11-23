// Mismo andamiaje que game-world.interaction.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo soporta).
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
import { DataDrivenWorldScene, GameWorldComponent } from './game-world.component';
import { MARKER_INTERACT_RADIUS } from './interaction-priority.util';
import { BibliotecaManifest } from './object-sprite.util';
import type { Mock } from 'vitest';

interface FakeNode {
  x: number; y: number; scene: object; visible: boolean; alpha: number; scale: number;
  setScale: Mock; setAlpha: Mock; setVisible: Mock; setPosition: Mock;
  setStrokeStyle: Mock; setDepth: Mock;
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
  };
  return self;
}

interface FakeSprite { play: Mock; stop: Mock; setFrame: Mock; frame?: { name: number } }
const fakeSprite = (): FakeSprite => ({ play: vi.fn(), stop: vi.fn(), setFrame: vi.fn() });

/** Superficie privada de la escena que estos casos ejercitan. */
interface SceneProbe {
  player: { x: number; y: number };
  world: SimulationWorldState;
  markers: Map<string, FakeNode>;
  markerData: Map<string, MapObjectState>;
  markerLabels: Map<string, FakeNode>;
  doorHints: Map<string, FakeNode>;
  npcMarkers: Map<string, FakeNode>;
  ambientMovers: Map<string, unknown>;
  npcMovers: Map<string, unknown>;
  proximityAnimations: Map<string, { sprite: FakeSprite; animationKey: string; playing: boolean }>;
  requestedArt: Set<string>;
  nearestKey: string | null;
  sound: { play: Mock };
  add: Record<string, Mock>;
  anims: { exists: Mock; create: Mock; generateFrameNumbers: Mock };
  textures: { exists: Mock; get: Mock };
  load: { spritesheet: Mock; image: Mock; once: Mock; on: Mock; off: Mock; start: Mock };
  ready: boolean;
  updateNearestInteraction(suppressSound?: boolean): void;
  setReduceMotion(reduced: boolean): void;
  buildArtSprite(object: MapObjectState): { sprite: unknown; animation: unknown } | null;
  reportProximityAnimation(): void;
  queueMissingArt(): boolean;
}

const objectState = (key: string, type: MapObjectState['type'], x: number, y: number, extra: Partial<MapObjectState> = {}): MapObjectState => ({
  key, label: key.toUpperCase(), type, x, y, width: 32, height: 32, color: '#4fa3a5', icon: 'x', shortCode: '',
  collision: false, interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, ...extra,
});

const VENTANA = '/assets/biblioteca/modelos/arte/ventana.png';
const VENTANA_HOJA = '/assets/biblioteca/modelos/arte/ventana-cerca.png';
const MANIFEST: BibliotecaManifest = {
  esquema: 1,
  sprites: {
    'modelos/arte/ventana.png': { ancho: 32, alto: 32, origen: 'modelo' },
    'modelos/arte/ventana-cerca.png': { ancho: 32, alto: 32, cuadros: 3, fps: 6, origen: 'modelo' },
  },
};
const conArte = (key: string, type: MapObjectState['type'], x: number, y: number): MapObjectState =>
  objectState(key, type, x, y, { metadata: { arte: VENTANA, animacionCerca: { hoja: VENTANA_HOJA, cuadros: 3, fps: 6 } } });

interface Harness {
  scene: SceneProbe;
  callbacks: {
    onProximity: Mock; onProximityAlso: Mock; onArtLoading: Mock; reduceMotion: boolean; sfxMuted: boolean;
    artManifest: BibliotecaManifest | null;
  };
  /** Oyentes que la escena registró en el cargador, por evento. */
  listeners: Record<string, ((...args: unknown[]) => void)[]>;
  sprites: Record<string, FakeSprite>;
  loaded: Set<string>;
}

/** Sala con un jugador y los objetos dados; cada objeto con hoja lleva su sprite de pruebas. */
function crearEscena(objects: MapObjectState[], artManifest: BibliotecaManifest | null = MANIFEST, reduceMotion = false): Harness {
  const callbacks = { onProximity: vi.fn(), onProximityAlso: vi.fn(), onArtLoading: vi.fn(), reduceMotion, sfxMuted: true, artManifest };
  const scene = new DataDrivenWorldScene(callbacks as never) as unknown as SceneProbe;
  scene.world = { map: { key: 'sala-demo', width: 960, height: 528 }, objects, collisions: [], inventory: [] } as unknown as SimulationWorldState;
  scene.player = { x: 480, y: 430 };
  scene.sound = { play: vi.fn() };
  scene.markers = new Map(); scene.markerData = new Map(); scene.markerLabels = new Map();
  scene.doorHints = new Map(); scene.npcMarkers = new Map();
  scene.ambientMovers = new Map(); scene.npcMovers = new Map();
  scene.proximityAnimations = new Map(); scene.requestedArt = new Set();
  scene.ready = true;
  const sprites: Record<string, FakeSprite> = {};
  for (const obj of objects) {
    scene.markers.set(obj.key, node(obj.x, obj.y));
    scene.markerData.set(obj.key, obj);
    scene.markerLabels.set(obj.key, node());
    if (obj.metadata?.['animacionCerca']) {
      sprites[obj.key] = fakeSprite();
      scene.proximityAnimations.set(obj.key, { sprite: sprites[obj.key], animationKey: 'cerca:x@6', playing: false });
    }
  }
  const loaded = new Set<string>();
  scene.add = { ellipse: vi.fn(() => node()), sprite: vi.fn(() => fakeSprite()), image: vi.fn(() => ({ texture: { key: 'x' }, width: 32, height: 32 })) };
  scene.anims = {
    exists: vi.fn(() => false),
    create: vi.fn(),
    generateFrameNumbers: vi.fn((key: string, range: { start: number; end: number }) => ({ key, ...range })),
  };
  scene.textures = {
    exists: vi.fn((key: string) => loaded.has(key)),
    get: vi.fn(() => ({ frameTotal: 4 })),
  };
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const registrar = (event: string, fn: (...args: unknown[]) => void) => { (listeners[event] ??= []).push(fn); };
  scene.load = {
    spritesheet: vi.fn(), image: vi.fn(), start: vi.fn(), once: vi.fn(registrar), on: vi.fn(registrar),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter(l => l !== fn);
    }),
  };
  return { scene, callbacks, sprites, loaded, listeners };
}

const move = (h: Harness, x: number, y: number) => { h.scene.player.x = x; h.scene.player.y = y; h.scene.updateNearestInteraction(true); };

describe('DataDrivenWorldScene: lo que se publica de la animación de cercanía (contrato del e2e)', () => {
  it('avisa qué anima y el cuadro de cada objeto, y solo cuando algo cambia', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430)]);
    const avisar = vi.fn();
    (h.callbacks as unknown as { onProximityAnimation: Mock }).onProximityAnimation = avisar;
    h.sprites['ventana'].frame = { name: 0 };

    h.scene.reportProximityAnimation();
    expect(avisar).toHaveBeenLastCalledWith({ playing: null, frames: { ventana: 0 } });
    h.scene.reportProximityAnimation(); // nada cambió: no vuelve a avisar
    expect(avisar).toHaveBeenCalledTimes(1);

    move(h, 480, 430); // se acerca: empieza a animar
    h.sprites['ventana'].frame = { name: 2 };
    h.scene.reportProximityAnimation();
    expect(avisar).toHaveBeenLastCalledWith({ playing: 'ventana', frames: { ventana: 2 } });

    move(h, 700, 430); // se aleja: vuelve al reposo, cuadro 0
    h.sprites['ventana'].frame = { name: 0 };
    h.scene.reportProximityAnimation();
    expect(avisar).toHaveBeenLastCalledWith({ playing: null, frames: { ventana: 0 } });
    expect(avisar).toHaveBeenCalledTimes(3);
  });

  // Revisión final · C8: la mayoría de las salas no tiene ninguna hoja de cercanía y `update()` lo pregunta en cada cuadro.
  it('en una sala sin animaciones de cercanía no trabaja por cuadro: ni arma el informe ni lo serializa', () => {
    const h = crearEscena([objectState('mesa', 'PROP', 500, 430)]);
    const avisar = vi.fn();
    (h.callbacks as unknown as { onProximityAnimation: Mock }).onProximityAnimation = avisar;
    h.scene.reportProximityAnimation(); // el primer cuadro publica «nada anima»
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenLastCalledWith({ playing: null, frames: {} });

    const serializar = vi.spyOn(JSON, 'stringify');
    for (let cuadro = 0; cuadro < 60; cuadro++) h.scene.reportProximityAnimation();
    expect(serializar).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledTimes(1);
    serializar.mockRestore();
  });

  it('al quedarse sin animaciones (otra sala) publica «nada anima» una vez', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430)]);
    const avisar = vi.fn();
    (h.callbacks as unknown as { onProximityAnimation: Mock }).onProximityAnimation = avisar;
    h.sprites['ventana'].frame = { name: 0 };
    h.scene.reportProximityAnimation();
    h.scene.proximityAnimations.clear(); // se reconstruyó la sala sin hojas
    h.scene.reportProximityAnimation();
    expect(avisar).toHaveBeenLastCalledWith({ playing: null, frames: {} });
    expect(avisar).toHaveBeenCalledTimes(2);
    h.scene.reportProximityAnimation();
    expect(avisar).toHaveBeenCalledTimes(2);
  });

  it('sin el aviso conectado no hace nada', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430)]);
    expect(() => h.scene.reportProximityAnimation()).not.toThrow();
  });
});

describe('DataDrivenWorldScene: animación de cercanía', () => {
  it('al ser nearestKey se reproduce y al dejar de serlo vuelve al cuadro 0', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430)]);
    const ventana = h.sprites['ventana'];
    expect(MARKER_INTERACT_RADIUS).toBe(74);

    move(h, 480, 430); // a 20 px: dentro del radio de 74
    expect(h.scene.nearestKey).toBe('ventana');
    expect(ventana.play).toHaveBeenCalledTimes(1);
    expect(ventana.play).toHaveBeenCalledWith('cerca:x@6');
    expect(ventana.stop).not.toHaveBeenCalled();

    move(h, 481, 430); // sigue siendo el principal: no se reinicia la animación
    expect(ventana.play).toHaveBeenCalledTimes(1);

    move(h, 700, 430); // lejos: deja de serlo
    expect(h.scene.nearestKey).toBeNull();
    expect(ventana.stop).toHaveBeenCalledTimes(1);
    expect(ventana.setFrame).toHaveBeenLastCalledWith(0);
  });

  it('solo se anima el objeto principal; el otro de la sala queda quieto', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430), conArte('cuadro', 'OBJECT', 460, 430)]);

    move(h, 505, 430);

    expect(h.scene.nearestKey).toBe('ventana');
    expect(h.sprites['ventana'].play).toHaveBeenCalledTimes(1);
    expect(h.sprites['cuadro'].play).not.toHaveBeenCalled();
  });

  it('con reduceMotion no se reproduce: queda el cuadro 0 fijo', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430)], MANIFEST, true);

    move(h, 480, 430);

    expect(h.scene.nearestKey).toBe('ventana');
    expect(h.sprites['ventana'].play).not.toHaveBeenCalled();
    expect(h.sprites['ventana'].stop).not.toHaveBeenCalled();
  });

  it('si cambia en caliente a movimiento reducido mientras anima, vuelve al cuadro 0; y al permitirlo retoma', () => {
    const h = crearEscena([conArte('ventana', 'OBJECT', 500, 430)]);
    const ventana = h.sprites['ventana'];
    move(h, 480, 430);
    expect(ventana.play).toHaveBeenCalledTimes(1);

    h.callbacks.reduceMotion = true;
    h.scene.setReduceMotion(true);
    expect(ventana.stop).toHaveBeenCalledTimes(1);
    expect(ventana.setFrame).toHaveBeenLastCalledWith(0);

    h.scene.setReduceMotion(true); // repetirlo no vuelve a tocar el sprite
    expect(ventana.stop).toHaveBeenCalledTimes(1);

    h.callbacks.reduceMotion = false;
    h.scene.setReduceMotion(false);
    expect(ventana.play).toHaveBeenCalledTimes(2);
  });

  it('PROP no entra en la prioridad de interacción', () => {
    const h = crearEscena([conArte('planta', 'PROP', 485, 430)]);

    move(h, 480, 430); // pegado al mueble

    expect(h.scene.nearestKey).toBeNull();
    expect(h.callbacks.onProximity).not.toHaveBeenCalled();
    expect(h.sprites['planta'].play).not.toHaveBeenCalled();
  });

  it('un PROP encima del jugador no le quita el turno a un objeto que sí se puede usar', () => {
    const h = crearEscena([conArte('planta', 'PROP', 481, 430), objectState('carne', 'OBJECT', 540, 430)]);

    move(h, 480, 430);

    expect(h.scene.nearestKey).toBe('carne');
  });

  it('NOTE y RESOURCE sí son candidatos (verbo «Revisar»)', () => {
    const h = crearEscena([objectState('cartel', 'NOTE', 500, 430), objectState('botiquin', 'RESOURCE', 700, 430)]);

    move(h, 480, 430);
    expect(h.scene.nearestKey).toBe('cartel');
    move(h, 690, 430);
    expect(h.scene.nearestKey).toBe('botiquin');
  });

  it('TOOL_TARGET y TRIGGER sin con qué actuar se dibujan sin interacción', () => {
    const h = crearEscena([objectState('meta', 'TOOL_TARGET', 485, 430), objectState('zona', 'TRIGGER', 475, 430)]);

    move(h, 480, 430);

    expect(h.scene.nearestKey).toBeNull();
  });
});

describe('DataDrivenWorldScene: carga del arte y de la hoja', () => {
  it('un objeto con hoja en el manifiesto se carga como spritesheet con sus cuadros y fps', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)]);

    expect(h.scene.queueMissingArt()).toBe(true);

    // El reposo como imagen y la hoja como spritesheet con el cuadro que dice el manifiesto.
    expect(h.scene.load.image).toHaveBeenCalledWith('biblioteca-modelos/arte/ventana.png', VENTANA);
    expect(h.scene.load.spritesheet).toHaveBeenCalledWith(
      'biblioteca-modelos/arte/ventana-cerca.png', VENTANA_HOJA, { frameWidth: 32, frameHeight: 32 },
    );
    expect(h.scene.load.start).toHaveBeenCalledTimes(1);

    // Ya cargada, se dibuja la hoja en el cuadro 0 con una animación en bucle a los fps del caso.
    h.loaded.add('biblioteca-modelos/arte/ventana.png');
    h.loaded.add('biblioteca-modelos/arte/ventana-cerca.png');
    const built = h.scene.buildArtSprite(conArte('ventana', 'PROP', 500, 430));
    expect(built?.animation).toMatchObject({ animationKey: 'cerca:biblioteca-modelos/arte/ventana-cerca.png@6', playing: false });
    expect(h.scene.add['sprite']).toHaveBeenCalledWith(0, -6, 'biblioteca-modelos/arte/ventana-cerca.png', 0);
    expect(h.scene.anims.generateFrameNumbers).toHaveBeenCalledWith('biblioteca-modelos/arte/ventana-cerca.png', { start: 0, end: 2 });
    expect(h.scene.anims.create).toHaveBeenCalledWith(expect.objectContaining({ frameRate: 6, repeat: -1 }));
  });

  it('hoja ausente cae al reposo', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)]);
    h.loaded.add('biblioteca-modelos/arte/ventana.png'); // el reposo llegó; la hoja falló al cargar

    const built = h.scene.buildArtSprite(conArte('ventana', 'PROP', 500, 430));

    expect(built?.animation).toBeNull();
    expect(h.scene.add['sprite']).not.toHaveBeenCalled();
    expect(h.scene.add['image']).toHaveBeenCalledWith(0, -6, 'biblioteca-modelos/arte/ventana.png');
    expect(h.scene.anims.create).not.toHaveBeenCalled();
  });

  it('hoja ausente del manifiesto: ni se pide ni se anima, queda el reposo', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)], { esquema: 1, sprites: {} });

    expect(h.scene.queueMissingArt()).toBe(true);
    expect(h.scene.load.image).toHaveBeenCalledTimes(1);
    expect(h.scene.load.spritesheet).not.toHaveBeenCalled();

    h.loaded.add('biblioteca-modelos/arte/ventana.png');
    expect(h.scene.buildArtSprite(conArte('ventana', 'PROP', 500, 430))?.animation).toBeNull();
  });

  it('sin manifiesto no hay animaciones, pero el reposo sí se dibuja', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)], null);
    h.loaded.add('biblioteca-modelos/arte/ventana.png');

    expect(h.scene.buildArtSprite(conArte('ventana', 'PROP', 500, 430))?.animation).toBeNull();
    expect(h.scene.add['image']).toHaveBeenCalledTimes(1);
  });

  it('un archivo que falló no se vuelve a pedir en cada pintado', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)]);

    expect(h.scene.queueMissingArt()).toBe(true);
    expect(h.scene.queueMissingArt()).toBe(false); // nada llegó (falló) y ya se pidió: no hay bucle de pedidos
    expect(h.scene.load.start).toHaveBeenCalledTimes(1);
  });

  it('sin nada que cargar no toca el cargador', () => {
    const h = crearEscena([objectState('mesa', 'PROP', 500, 430)]);

    expect(h.scene.queueMissingArt()).toBe(false);
    expect(h.scene.load.start).not.toHaveBeenCalled();
  });
});

describe('DataDrivenWorldScene: la segunda ola de carga cuenta para el vigilante de arranque', () => {
  it('avisa al empezar y con cada archivo que llega o falla', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)]);

    expect(h.scene.queueMissingArt()).toBe(true);
    expect(h.callbacks.onArtLoading).toHaveBeenCalledTimes(1);

    h.listeners['progress'].forEach(fn => fn(0.5));
    h.listeners['progress'].forEach(fn => fn(1));
    expect(h.callbacks.onArtLoading).toHaveBeenCalledTimes(3);
  });

  it('al completar deja de escuchar el progreso (no se acumulan oyentes entre olas)', () => {
    const h = crearEscena([conArte('ventana', 'PROP', 500, 430)]);
    h.scene.queueMissingArt();
    h.scene.ready = false; // el repintado de al completar no es lo que se prueba aquí

    h.listeners['complete'].forEach(fn => fn());

    expect(h.scene.load.off).toHaveBeenCalledWith('progress', expect.any(Function));
    expect(h.listeners['progress']).toEqual([]);
  });

  it('sin nada que cargar no avisa ni registra oyentes', () => {
    const h = crearEscena([objectState('mesa', 'PROP', 500, 430)]);

    expect(h.scene.queueMissingArt()).toBe(false);
    expect(h.callbacks.onArtLoading).not.toHaveBeenCalled();
    expect(h.scene.load.on).not.toHaveBeenCalled();
  });

  describe('el vigilante del componente (25 s)', () => {
    const BOOT_WATCHDOG_MS = 25_000;

    interface ComponentProbe { armBootWatchdog(): void; onArtLoading(): void }

    /** El componente sin Angular: solo lo que usa el vigilante. */
    function componente(renderReady = false) {
      const bootFailed = { emit: vi.fn() };
      const component = Object.create(GameWorldComponent.prototype) as Record<string, unknown>;
      component['bootFailed'] = bootFailed;
      component['renderReady'] = () => renderReady;
      component['destroyed'] = false;
      component['zone'] = { run: (fn: () => void) => fn() };
      return { component: component as unknown as ComponentProbe, bootFailed };
    }

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('con la segunda ola en curso y progreso, no dispara a los 25 s', () => {
      const { component, bootFailed } = componente();
      component.armBootWatchdog();            // arranque: el mundo espera la primera pintura

      vi.advanceTimersByTime(20_000);
      component.onArtLoading();                   // llega un archivo de la segunda ola
      vi.advanceTimersByTime(BOOT_WATCHDOG_MS - 20_000 + 1_000); // pasan los 25 s desde el arranque
      expect(bootFailed.emit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(20_000);             // y ya 25 s sin ningún avance: ahora sí
      expect(bootFailed.emit).toHaveBeenCalledTimes(1);
    });

    it('sin progreso de la segunda ola sigue disparando a los 25 s (no se oculta un arranque colgado)', () => {
      const { component, bootFailed } = componente();
      component.armBootWatchdog();

      vi.advanceTimersByTime(BOOT_WATCHDOG_MS + 1);

      expect(bootFailed.emit).toHaveBeenCalledTimes(1);
    });

    it('una vez pintada la sala, el aviso de carga no rearma nada', () => {
      const { component, bootFailed } = componente(true);

      component.onArtLoading();
      vi.advanceTimersByTime(BOOT_WATCHDOG_MS * 2);

      expect(bootFailed.emit).not.toHaveBeenCalled();
    });
  });
});
