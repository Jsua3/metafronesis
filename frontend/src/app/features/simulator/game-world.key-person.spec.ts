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

import { readFileSync } from 'fs';
import { join } from 'path';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';
import { DataDrivenWorldScene } from './game-world.component';
import {
  KEY_PERSON_CHEVRON, KEY_PERSON_COLOR, KEY_PERSON_COLOR_HEX, isKeyPerson, keyPersonAccessibleName, resolveKeyPerson,
} from './key-person.util';
import { WorldPlacesListComponent } from './world-places-list.component';
import { PlaceCandidate, selectPlaces } from './world-places.util';
import type { Mock } from 'vitest';

/**
 * Persona clave (P6, tarea 4): `metadata.personaClave === true` la marca el docente (a lo sumo una por sala). El juego
 * la señala con un chevrón y su nombre sobre la cabeza, en el acento del juego #B69CFF (nunca el morado de la guía
 * #7C3AED), SIEMPRE visible aunque no sea la más cercana, y la lista accesible de la sala la anuncia como «persona a
 * atender»: el aviso no depende solo del color (tiene forma y texto).
 */

const ACENTO_GUIA = '#7C3AED';

const objeto = (key: string, label: string, extra: Partial<MapObjectState> = {}): MapObjectState => ({
  key, label, type: 'PERSON', x: 300, y: 240, width: 48, height: 48, color: '#4fa3a5', icon: 'person', shortCode: '',
  collision: false, interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  ...extra,
});
const clave = (key: string, label: string, extra: Partial<MapObjectState> = {}) =>
  objeto(key, label, { metadata: { personaClave: true }, ...extra });

interface FakeGraphics {
  fillStyle: Mock; lineStyle: Mock; fillTriangle: Mock; strokeTriangle: Mock;
}
interface FakeText { args: unknown[]; setOrigin: Mock; setScale: Mock }
interface FakeContainer {
  x: number; y: number; depth: number | null; visible: boolean; children: unknown[];
  setDepth: Mock; setScale: Mock; setPosition: Mock; setVisible: Mock;
}

function fakeGraphics(): FakeGraphics {
  const g = {} as FakeGraphics;
  g.fillStyle = vi.fn(() => g); g.lineStyle = vi.fn(() => g);
  g.fillTriangle = vi.fn(() => g); g.strokeTriangle = vi.fn(() => g);
  return g;
}

interface SceneProbe {
  world: SimulationWorldState;
  markers: Map<string, { x: number; y: number }>;
  markerData: Map<string, MapObjectState>;
  npcMarkers: Map<string, unknown>;
  nearestKey: string | null;
  labelScale: number;
  add: Record<string, Mock>;
  tweens: { add: Mock };
  keyPersonIndicator?: { key: string; container: FakeContainer };
  buildKeyPersonIndicator(marker: { x: number; y: number }, object: MapObjectState): void;
  resetOrientationVisuals(): void;
  syncKeyPersonIndicator(): void;
  placeCandidates(): PlaceCandidate[];
  setReduceMotion(reduced: boolean): void;
}

function crearEscena(objects: MapObjectState[], reduceMotion = false, callbacks: Record<string, unknown> = {}) {
  const scene = new DataDrivenWorldScene({ reduceMotion, sfxMuted: true, ...callbacks } as never) as unknown as SceneProbe;
  scene.world = { map: { key: 'sala-demo', width: 960, height: 528 }, objects, collisions: [], inventory: [] } as unknown as SimulationWorldState;
  scene.markers = new Map();
  scene.markerData = new Map();
  scene.npcMarkers = new Map();
  scene.nearestKey = null;
  scene.labelScale = 1.5;
  const graphics: FakeGraphics[] = [];
  const texts: FakeText[] = [];
  const containers: FakeContainer[] = [];
  scene.add = {
    graphics: vi.fn(() => { const g = fakeGraphics(); graphics.push(g); return g; }),
    text: vi.fn((...args: unknown[]) => {
      const t = { args } as FakeText;
      t.setOrigin = vi.fn(() => t); t.setScale = vi.fn(() => t);
      texts.push(t);
      return t;
    }),
    container: vi.fn((x: number, y: number, children: unknown[]) => {
      const c = { x, y, depth: null, visible: true, children } as FakeContainer;
      c.setDepth = vi.fn((d: number) => { c.depth = d; return c; });
      c.setScale = vi.fn(() => c);
      c.setPosition = vi.fn((nx: number, ny: number) => { c.x = nx; c.y = ny; return c; });
      c.setVisible = vi.fn((v: boolean) => { c.visible = v; return c; });
      containers.push(c);
      return c;
    }),
  };
  scene.tweens = { add: vi.fn() };
  for (const obj of objects) {
    scene.markers.set(obj.key, { x: obj.x, y: obj.y });
    scene.markerData.set(obj.key, obj);
  }
  return { scene, graphics, texts, containers };
}

describe('persona clave: quién lo es', () => {
  it('solo una PERSON con metadata.personaClave === true', () => {
    expect(isKeyPerson(clave('a', 'A'))).toBe(true);
    expect(isKeyPerson(objeto('b', 'B'))).toBe(false);
    expect(isKeyPerson(objeto('c', 'C', { metadata: { personaClave: false } }))).toBe(false);
    expect(isKeyPerson(objeto('d', 'D', { metadata: { personaClave: 'true' } }))).toBe(false);
    expect(isKeyPerson(objeto('e', 'E', { type: 'OBJECT', metadata: { personaClave: true } }))).toBe(false);
  });

  it('si hay más de una en la sala, solo cuenta la primera de la lista', () => {
    const lista = [objeto('x', 'X'), clave('primera', 'Primera'), clave('segunda', 'Segunda')];
    expect(resolveKeyPerson(lista)?.key).toBe('primera');
    expect(resolveKeyPerson([objeto('x', 'X')])).toBeNull();
    expect(resolveKeyPerson([])).toBeNull();
  });
});

describe('persona clave: el indicador sobre la cabeza', () => {
  // req: P6 Tarea 4 (el indicador no depende solo del color)
  it('lleva forma (un chevrón apuntando a la cabeza) y texto (su nombre), además del color', () => {
    const { scene, graphics, texts } = crearEscena([clave('madre', 'Marta')]);
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('madre')!);

    // Forma: un triángulo relleno cuya punta (último vértice) queda por debajo de su base.
    expect(graphics).toHaveLength(1);
    expect(graphics[0].fillTriangle).toHaveBeenCalledTimes(1);
    const [x1, y1, x2, y2, x3, y3] = graphics[0].fillTriangle.mock.calls[0] as number[];
    expect(y1).toBe(y2);
    expect(y3).toBeGreaterThan(y1);
    expect(x3).toBeGreaterThan(Math.min(x1, x2));
    expect(x3).toBeLessThan(Math.max(x1, x2));
    expect(Math.abs(x2 - x1)).toBe(KEY_PERSON_CHEVRON.halfWidth * 2);
    expect(y3 - y1).toBe(KEY_PERSON_CHEVRON.height);

    // Texto: su nombre.
    expect(texts).toHaveLength(1);
    expect(texts[0].args[2]).toBe('Marta');
  });

  it('va en #B69CFF y nunca en el morado de la guía', () => {
    expect(KEY_PERSON_COLOR).toBe('#B69CFF');
    expect(KEY_PERSON_COLOR_HEX).toBe(0xb69cff);
    const { scene, graphics, texts } = crearEscena([clave('madre', 'Marta')]);
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('madre')!);

    expect(graphics[0].fillStyle).toHaveBeenCalledWith(0xb69cff, 1);
    expect((texts[0].args[3] as { color: string }).color).toBe('#B69CFF');
    // Ni en el código del juego ni en el del indicador asoma el morado de la guía.
    for (const archivo of ['game-world.component.ts', 'key-person.util.ts']) {
      const fuente = readFileSync(join(__dirname, archivo), 'utf-8');
      expect(fuente.toLowerCase(), archivo).not.toContain(ACENTO_GUIA.toLowerCase());
    }
  });

  it('está siempre visible: no depende de ser la persona más cercana', () => {
    const { scene, containers } = crearEscena([clave('madre', 'Marta')]);
    expect(scene.nearestKey).toBeNull();
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('madre')!);

    expect(containers).toHaveLength(1);
    expect(containers[0].visible).toBe(true);
    expect(containers[0].setVisible).not.toHaveBeenCalledWith(false);
    // Sobre los actores (como los rótulos del mundo) y escalado para que el nombre se lea.
    expect(containers[0].depth).not.toBeNull();
    expect(containers[0].setScale).toHaveBeenCalledWith(1.5);
  });

  it('se coloca sobre la cabeza, por encima de los pies de la persona', () => {
    const { scene, containers } = crearEscena([clave('madre', 'Marta', { y: 240 })]);
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('madre')!);

    expect(containers[0].x).toBe(300);
    // Los pies del marcador están 16 px bajo su centro y la cabeza del cuerpo del kit a 64 px sobre ellos.
    expect(containers[0].y).toBeLessThan(240 + 16 - 64);
  });

  it('con varias personas clave solo la primera por orden de la lista lleva indicador', () => {
    const { scene, texts } = crearEscena([clave('primera', 'Primera', { x: 100 }), clave('segunda', 'Segunda', { x: 500 })]);
    for (const obj of scene.world.objects) scene.buildKeyPersonIndicator(scene.markers.get(obj.key)!, obj);

    expect(texts.map(t => t.args[2])).toEqual(['Primera']);
  });

  it('una persona que no es clave no lleva indicador', () => {
    const { scene, containers } = crearEscena([objeto('otra', 'Otra')]);
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('otra')!);
    expect(containers).toHaveLength(0);
  });

  it('sigue a la persona cuando camina', () => {
    const { scene, containers } = crearEscena([clave('madre', 'Marta')]);
    const marker = scene.markers.get('madre')!;
    scene.buildKeyPersonIndicator(marker, scene.markerData.get('madre')!);
    const yInicial = containers[0].y;

    marker.x = 340;
    marker.y = 250;
    scene.syncKeyPersonIndicator();

    expect(containers[0].x).toBe(340);
    expect(containers[0].y).toBe(yInicial + 10);
  });

  // Contrato del e2e (como `data-proximity`): el juego publica en su host el nombre que lleva el indicador.
  it('avisa al anfitrión el nombre de la persona a atender cuando dibuja su indicador, y lo retira al reconstruir la sala', () => {
    const alAtender = vi.fn();
    const { scene } = crearEscena([clave('madre', 'Marta')], false, { onKeyPersonIndicator: alAtender });
    expect(alAtender).not.toHaveBeenCalled();
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('madre')!);
    expect(alAtender).toHaveBeenLastCalledWith('Marta');
    scene.resetOrientationVisuals();
    expect(alAtender).toHaveBeenLastCalledWith(null);
  });

  it('una persona que no es clave no avisa nada, y sin el aviso conectado no pasa nada', () => {
    const alAtender = vi.fn();
    const { scene } = crearEscena([objeto('otra', 'Otra')], false, { onKeyPersonIndicator: alAtender });
    scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('otra')!);
    expect(alAtender).not.toHaveBeenCalled();
    const sin = crearEscena([clave('madre', 'Marta')]).scene;
    expect(() => sin.buildKeyPersonIndicator({ x: 300, y: 240 }, sin.markerData.get('madre')!)).not.toThrow();
  });

  // Revisión final · C5: contrato del e2e (`data-key-person-x/y`), como `data-player-x/y`: la posición viva de la persona a atender.
  describe('su posición viva, para la prueba de extremo a extremo', () => {
    it('se avisa al dibujar el indicador, al moverse la persona y se retira al reconstruir la sala', () => {
      const alMoverse = vi.fn();
      const { scene } = crearEscena([clave('madre', 'Marta')], false, { onKeyPersonPosition: alMoverse });
      const marker = scene.markers.get('madre')!;
      scene.buildKeyPersonIndicator(marker, scene.markerData.get('madre')!);
      expect(alMoverse).toHaveBeenLastCalledWith({ x: 300, y: 240 });

      marker.x = 340.4;
      marker.y = 250.6;
      scene.syncKeyPersonIndicator();
      expect(alMoverse).toHaveBeenLastCalledWith({ x: 340, y: 251 });

      scene.resetOrientationVisuals();
      expect(alMoverse).toHaveBeenLastCalledWith(null);
    });

    it('solo avisa cuando la posición (redondeada) cambia: un cuadro sin mover a la persona no cuesta nada', () => {
      const alMoverse = vi.fn();
      const { scene } = crearEscena([clave('madre', 'Marta')], false, { onKeyPersonPosition: alMoverse });
      const marker = scene.markers.get('madre')!;
      scene.buildKeyPersonIndicator(marker, scene.markerData.get('madre')!);
      alMoverse.mockClear();
      for (let cuadro = 0; cuadro < 60; cuadro++) scene.syncKeyPersonIndicator();
      expect(alMoverse).not.toHaveBeenCalled();
      marker.x = 300.3; // sigue siendo 300 al redondear
      scene.syncKeyPersonIndicator();
      expect(alMoverse).not.toHaveBeenCalled();
      marker.x = 301;
      scene.syncKeyPersonIndicator();
      expect(alMoverse).toHaveBeenCalledTimes(1);
    });

    it('sin persona a atender no publica nada, y sin el aviso conectado no pasa nada', () => {
      const alMoverse = vi.fn();
      const { scene } = crearEscena([objeto('otra', 'Otra')], false, { onKeyPersonPosition: alMoverse });
      scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('otra')!);
      scene.syncKeyPersonIndicator();
      expect(alMoverse).not.toHaveBeenCalled();
      const sin = crearEscena([clave('madre', 'Marta')]).scene;
      sin.buildKeyPersonIndicator(sin.markers.get('madre')!, sin.markerData.get('madre')!);
      expect(() => sin.syncKeyPersonIndicator()).not.toThrow();
    });

    it('el anfitrión lo escribe como data-key-person-x/y directo en el DOM, sin Angular', () => {
      const fuente = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');
      expect(fuente).toContain('onKeyPersonPosition: position => this.writeKeyPersonPosition(position),');
      expect(fuente).toContain("host.setAttribute('data-key-person-x', String(position.x));");
      expect(fuente).toContain("host.setAttribute('data-key-person-y', String(position.y));");
      expect(fuente).not.toContain('[attr.data-key-person-x]');
    });
  });

  it('no se anima: ni con movimiento normal ni reducido', () => {
    for (const reducido of [false, true]) {
      const { scene } = crearEscena([clave('madre', 'Marta')], reducido);
      scene.buildKeyPersonIndicator({ x: 300, y: 240 }, scene.markerData.get('madre')!);
      scene.setReduceMotion?.call(scene, reducido);
      expect(scene.tweens.add).not.toHaveBeenCalled();
    }
  });
});

describe('persona clave: la lista accesible de la sala («Ir a…»)', () => {
  const NOTA = 'persona a atender';

  it('el texto vive en el registro de borradores de Psicología', () => {
    expect(DRAFT_COPY.keyPerson.text).toBe(NOTA);
    expect(DRAFT_COPY.keyPerson.owner).toBe('Psicología');
  });

  // req: P6 Tarea 4
  it('la persona clave sale en la lista con «persona a atender»; las demás, sin esa nota', () => {
    const { scene } = crearEscena([
      objeto('vecina', 'Vecina', { dialogue: { text: 'Hola' } as never }),
      clave('madre', 'Marta', { dialogue: { text: 'Buenas' } as never }),
    ]);
    const lista = scene.placeCandidates();

    expect(lista.find(c => c.key === 'madre')).toMatchObject({ label: 'Marta', kind: 'person', note: NOTA });
    expect(lista.find(c => c.key === 'vecina')?.note).toBeUndefined();
  });

  it('aparece aunque todavía no tenga un diálogo escrito', () => {
    const { scene } = crearEscena([clave('madre', 'Marta')]);
    expect(scene.placeCandidates().map(c => c.key)).toEqual(['madre']);
  });

  it('la lista conserva la nota y la persona clave no pierde su sitio entre las personas', () => {
    const lista = selectPlaces([
      { key: 'a', label: 'Ana', kind: 'person' },
      { key: 'madre', label: 'Marta', kind: 'person', note: NOTA },
      { key: 'p', label: 'Sala', kind: 'door' },
    ], new Set());
    expect(lista.map(c => c.key)).toEqual(['a', 'madre', 'p']);
    expect(lista[1].note).toBe(NOTA);
    expect(lista[0].note).toBeUndefined();
  });

  describe('en pantalla', () => {
    let fixture: ComponentFixture<WorldPlacesListComponent>;
    afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

    function montar(places: PlaceCandidate[]) {
      TestBed.configureTestingModule({ imports: [WorldPlacesListComponent] });
      fixture = TestBed.createComponent(WorldPlacesListComponent);
      fixture.componentRef.setInput('places', places);
      fixture.detectChanges();
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.places__item'));
    }
    const texto = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('el botón de la persona clave dice su nombre y «persona a atender»; el del resto, solo su nombre', () => {
      const [ana, marta] = montar([
        { key: 'a', label: 'Ana', kind: 'person' },
        { key: 'madre', label: 'Marta', kind: 'person', note: NOTA },
      ]);
      expect(texto(ana)).toBe('Persona Ana');
      expect(texto(marta)).toBe(`Persona Marta ${NOTA}`);
      // Texto real del botón: el lector de pantalla lo lee sin depender del color.
      expect(marta.querySelector('.places__note')?.textContent?.trim()).toBe(NOTA);
    });
  });

  it('el nombre accesible junta el nombre y la nota', () => {
    expect(keyPersonAccessibleName('Marta')).toBe('Marta, persona a atender');
  });
});
