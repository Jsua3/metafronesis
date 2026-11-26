import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import type { CharacterVisual } from '../character/kit/character-visual.resolver';
import { kitFrameIndex } from '../character/kit/kit-phaser';
import { seCruzan } from './camara/camara';
import type { Caja, EstadoCamara, Sujeto } from './camara/camara';
import { actorDepth } from './depth-sort.util';
import { DataDrivenWorldScene } from './game-world.component';
import { apoyoDeMueble, bordesDelMueble, cobijaDeCama, pisaElMueble } from './sala/apoyos-de-mueble';
import type { MuebleDeCatalogo } from './sala/catalogo';
import type { MuebleDeSala } from './sala/escena-de-sala';
import { tickWalk } from './world-walk.util';
import type { WalkState } from './world-walk.util';

// La escena se instancia y usa las rutas de dibujo y proximidad. jsdom sustituye los objetos de dibujo de Phaser.
vi.mock('phaser', () => ({ __esModule: true, default: { Scene: class {} } }));

const catalogo: { muebles: Record<string, MuebleDeCatalogo> } = JSON.parse(readFileSync(
  join(__dirname, '../../../assets/biblioteca/piezas/manifiesto.json'), 'utf8',
));
const mueble = (id: string, clave: string, x = 350, y = 324): MuebleDeSala => ({
  id, clave, x, y, ficha: catalogo.muebles[clave], espejo: false,
});
const cama = mueble('cama', 'hospital/cama-recuperacion');
const escritorio = mueble('escritorio', 'comisaria/escritorio-funcionario');
const soportes = new Map([['cama', cama], ['escritorio', escritorio]]);

function objeto(key: string, type: MapObjectState['type'], x: number, y: number, metadata: Record<string, unknown>): MapObjectState {
  return {
    key, type, x, y, metadata, width: 48, height: 48, label: key,
    color: '#4fa3a5', icon: '', shortCode: '', collision: false, interactionPrompt: '', interactionText: '',
    decisionOptionId: null, toolCode: null, dialogue: null,
  };
}
const persona = objeto('Yuliana', 'PERSON', 350, 324, {
  postura: 'en-cama', cama: 'cama', recipeId: 'sobreviviente', movimiento: 'deambula',
});
const informe = objeto('Informe', 'OBJECT', 336, 282, { apoyo: 'sobre', mueble: 'escritorio' });

interface Dibujo {
  x: number; y: number; alpha: number; visible: boolean; depth: number;
  frame: { name: string }; hijos: Dibujo[];
  displayWidth: number; displayHeight: number; originX: number; originY: number;
  setCrop: ReturnType<typeof vi.fn>; setPosition: ReturnType<typeof vi.fn>; setText: ReturnType<typeof vi.fn>;
}

function dibujo(x = 0, y = 0, hijos: Dibujo[] = []): Dibujo {
  const nodo = {
    x, y, angle: 0, visible: true, alpha: 1, scene: {}, displayWidth: 50, displayHeight: 14, depth: 0,
    frame: { name: '0' }, hijos, originX: 0.5, originY: 0.5,
    setPosition: vi.fn((nx: number, ny: number) => { nodo.x = nx; nodo.y = ny; return nodo; }),
    setAlpha: vi.fn((alpha: number) => { nodo.alpha = alpha; return nodo; }),
    setDepth: vi.fn((depth: number) => { nodo.depth = depth; return nodo; }),
    setVisible: vi.fn((visible: boolean) => { nodo.visible = visible; return nodo; }),
    setFrame: vi.fn((frame: number) => { nodo.frame.name = String(frame); return nodo; }),
    setY: vi.fn((ny: number) => { nodo.y = ny; return nodo; }),
    setOrigin: vi.fn((ox: number, oy: number) => { nodo.originX = ox; nodo.originY = oy; return nodo; }),
    setStrokeStyle: vi.fn(() => nodo), setScale: vi.fn(() => nodo), setWordWrapWidth: vi.fn(() => nodo),
    setCrop: vi.fn(() => nodo), setFlipX: vi.fn(() => nodo), setText: vi.fn(() => nodo),
    play: vi.fn(() => nodo),
  };
  return nodo;
}

function salaMinima(soporte: MuebleDeSala, sujeto: MapObjectState, colisiones: SimulationWorldState['collisions'] = [],
  posicion = { x: 300, y: 415 }, tipo: MapObjectState['type'] = 'PROP') {
  const prop = objeto(soporte.id, tipo, soporte.x, soporte.y, { apoyo: 'pies' });
  const callbacks = {
    reduceMotion: false,
    kit: { recipes: { sobreviviente: {} } },
    onProximity: vi.fn(), onProximityAlso: vi.fn(), onInteract: vi.fn(), onWalkEnded: vi.fn(),
    onKeyPersonIndicator: vi.fn(),
  };
  const escena = new DataDrivenWorldScene(callbacks as never);
  const interno = escena as unknown as {
    world: SimulationWorldState;
    player: { x: number; y: number };
    assetsLoaded: boolean;
    walk: WalkState;
    markers: Map<string, Dibujo & Record<string, unknown>>;
    markerLabels: Map<string, Dibujo>;
    dibujosDeMarcador: Map<string, Dibujo>;
    markerPrompt: Dibujo;
    stepMark: Dibujo;
    personWalkers: Map<string, unknown>;
    apoyosDeLaSala: Map<string, { llegada: { x: number; y: number } }>;
    prepararApoyos(muebles: MuebleDeSala[]): void;
    createMarker(obj: MapObjectState): void;
    updateNearestInteraction(suppressSound: boolean): void;
    respirarEnCama(tiempo: number): void;
    finishWalkGoal(outcome: 'arrived'): void;
    wouldCollide(x: number, y: number): boolean;
    camState: EstadoCamara;
    roomSize: { width: number; height: number };
    stepCamera(delta: number): void;
    cuerpoVivo(key: string): Sujeto | null;
    cuerpoEnPantalla(pie: Sujeto, zoom: number): Caja;
    proyectarAviso(pie: Sujeto): Sujeto;
  };
  interno.world = {
    map: { key: 'ronda5-sala-minima', width: 960, height: 528 },
    objects: [prop, sujeto], collisions: colisiones, player: posicion, inventory: [],
  } as unknown as SimulationWorldState;
  interno.player = { ...posicion };
  interno.assetsLoaded = true;
  const visual = { key: 'kit-sobreviviente', recipeId: 'sobreviviente' } as CharacterVisual;
  const sprite = vi.fn((x: number, y: number, _textura: string, _cuadro: number) => dibujo(x, y));
  const image = vi.fn((x: number, y: number) => dibujo(x, y));
  Object.assign(escena, {
    ready: true,
    actorVisual: vi.fn(() => visual),
    buildKeyPersonIndicator: vi.fn(),
    buildArtSprite: vi.fn(() => null),
    textures: { exists: (clave: string) => clave !== 'persona-icon:crisis' },
    patientIcon: vi.fn(() => null),
    tweens: { add: vi.fn() },
    add: {
      container: (x: number, y: number, hijos?: Dibujo[]) => dibujo(x, y, hijos),
      text: (x: number, y: number) => dibujo(x, y),
      circle: (x: number, y: number) => dibujo(x, y),
      ellipse: (x: number, y: number) => dibujo(x, y),
      sprite, image,
    },
  });
  interno.prepararApoyos([{ ...soporte }]);
  interno.createMarker(sujeto);
  return { escena, interno, callbacks, sprite, visual };
}

describe('metadatos de apoyo de muebles', () => {
  it('resuelve la almohada y su espejo, y conserva el punto del tablero en coordenadas de la sala', () => {
    expect(apoyoDeMueble(persona, soportes)?.dibujo).toEqual({ x: 328, y: 272 });
    const espejo = new Map([['cama', { ...cama, espejo: true }]]);
    expect(apoyoDeMueble(persona, espejo)?.dibujo).toEqual({ x: 372, y: 272 });
    expect(apoyoDeMueble(informe, soportes)?.dibujo).toEqual({ x: 336, y: 282 });
  });

  it('descarta tipos, claves y puntos inválidos sin inventar un apoyo', () => {
    for (const camaInvalida of [null, '', [], 3, 'CAMA', 'escritorio', 'ausente']) {
      expect(apoyoDeMueble({ ...persona, metadata: { ...persona.metadata, cama: camaInvalida } }, soportes)).toBeNull();
    }
    expect(apoyoDeMueble({ ...persona, type: 'OBJECT' }, soportes)).toBeNull();
    expect(apoyoDeMueble({ ...informe, type: 'EXIT' }, soportes)).toBeNull();
    expect(apoyoDeMueble({ ...informe, x: 270 }, soportes)).toBeNull();
    expect(apoyoDeMueble({ ...informe, y: 300 }, soportes)).toBeNull();
    expect(apoyoDeMueble({ ...informe, y: NaN }, soportes)).toBeNull();
    expect(apoyoDeMueble({ ...informe, metadata: { apoyo: 'sobre', mueble: 'cama' } }, soportes)).toBeNull();
  });

  it('genera dos cuadros de cobija con un pliegue que sube un píxel y una base quieta', () => {
    const perfil = apoyoDeMueble(persona, soportes)!.cama!;
    const { width, height, rgba } = cobijaDeCama(perfil);
    const pixel = (x: number, y: number, cuadro: number) => {
      const indice = (y * width + x + cuadro * width / 2) * 4;
      return [...rgba.slice(indice, indice + 4)];
    };
    expect(pixel(12, 1, 0)[3]).toBe(0);
    expect(pixel(12, 1, 1)).toEqual(pixel(12, 2, 0));
    expect(pixel(12, 1, 1)).toEqual([0x92, 0xb0, 0xa8, 255]);
    expect(pixel(15, height - 1, 0)).toEqual(pixel(15, height - 1, 1));
  });
});

describe('sala con muebles de apoyo', () => {
  it('al reaparecer la ficha durante el viaje, conserva visibles a la jugadora y a Yuliana en cama', () => {
    const { escena, interno } = salaMinima(cama, persona, [], { x: 303, y: 351 });
    Object.assign(escena, {
      cameras: { main: { width: 1366, height: 768, zoom: 1, fadeEffect: { isRunning: false },
        centerOn: vi.fn(), setZoom: vi.fn() } },
      scale: { zoom: 1, displayScale: { x: 1 } },
    });
    interno.roomSize = { width: 1200, height: 528 };
    escena.setOrientation({ nextTargetKey: persona.key, doorStates: {}, dimmedKeys: new Set() });
    escena.setCameraMoment({ tipo: 'conversacion', clave: persona.key }, 393, 61);
    interno.stepCamera(16);
    const ficha = { x: 12, y: 12, ancho: 440, alto: 314 };
    const moment = { tipo: 'explorar' } as const;
    // La posición intermedia del viaje deja a las dos bajo la ficha recién abierta.
    interno.camState = { centro: { x: 600, y: 430 }, zoom: 1.14 };
    escena.setCameraPlacas(() => [ficha]);
    escena.setCameraMoment(moment, 0);
    interno.stepCamera(16);
    for (const pie of [interno.player, interno.cuerpoVivo(persona.key)!]) {
      expect(seCruzan(ficha, interno.cuerpoEnPantalla(pie, interno.camState.zoom))).toBe(false);
    }
  });

  it('esquiva el cuerpo de la jugadora al colocar el puntero junto a la cama', () => {
    const { escena, interno } = salaMinima(cama, persona, [], { x: 303, y: 351 });
    Object.assign(escena, {
      cameras: { main: { width: 1366, height: 768, zoom: 1, fadeEffect: { isRunning: false },
        centerOn: vi.fn(), setZoom: vi.fn() } },
      scale: { zoom: 1, displayScale: { x: 1 } },
    });
    escena.setOrientation({ nextTargetKey: persona.key, doorStates: {}, dimmedKeys: new Set() });
    interno.stepCamera(16);
    const marca = interno.stepMark;
    const zoom = interno.camState.zoom;
    const ancla = interno.proyectarAviso(marca);
    const ancho = marca.displayWidth * zoom;
    const alto = marca.displayHeight * zoom;
    const puntero = { x: ancla.x - ancho * marca.originX, y: ancla.y - alto * marca.originY, ancho, alto };
    expect(marca.visible).toBe(true);
    expect(seCruzan(puntero, interno.cuerpoEnPantalla(interno.player, zoom))).toBe(false);
  });

  it('la cercanía sigue a la interlocutora mientras el diálogo está abierto y vuelve al objeto al cerrar', () => {
    const { escena, interno, callbacks } = salaMinima(escritorio, informe, [], { x: 336, y: 348 });
    const interlocutora = { ...persona, x: 370, y: 365, metadata: { recipeId: 'sobreviviente' } };
    interno.createMarker(interlocutora);
    interno.updateNearestInteraction(true);
    expect(callbacks.onProximity).toHaveBeenLastCalledWith(expect.objectContaining({ key: informe.key }));

    escena.setCameraMoment({ tipo: 'conversacion', clave: interlocutora.key }, 0);
    interno.updateNearestInteraction(true);
    expect(callbacks.onProximity).toHaveBeenLastCalledWith(expect.objectContaining({ key: interlocutora.key }));
    expect(interno.markerPrompt.setText).toHaveBeenLastCalledWith('E · Hablar con Yuliana');
    expect(callbacks.onProximityAlso).toHaveBeenLastCalledWith(null);

    escena.setCameraMoment({ tipo: 'explorar' }, 0);
    interno.updateNearestInteraction(true);
    expect(callbacks.onProximity).toHaveBeenLastCalledWith(expect.objectContaining({ key: informe.key }));
  });

  it('recorta a Yuliana de frente, conserva su visual y su interacción, y deja quieto el cuerpo', async () => {
    const { escena, interno, callbacks, sprite, visual } = salaMinima(cama, persona);
    const marker = interno.markers.get(persona.key)!;
    const [sombra, , acueste] = marker.hijos;
    const [cabeza, cobija] = acueste.hijos;
    expect(sombra.visible).toBe(false);
    expect(marker['__personSprite']).toBeUndefined();
    expect(escena.characterVisualOf(persona.key)).toBe(visual);
    expect(sprite.mock.calls[0]).toEqual([-24, 0, 'kit-sobreviviente-idle', kitFrameIndex('idle', 'down')]);
    expect(cabeza.setCrop).toHaveBeenCalledWith(0, 0, 48, 23);
    expect(marker.depth).toBeGreaterThan(actorDepth(cama.y) + 0.01);
    expect(interno.personWalkers.has(persona.key)).toBe(false);
    await escena.playGesture(persona.key, 'se-aparta');
    expect(marker.setPosition).not.toHaveBeenCalled();
    interno.respirarEnCama(1900);
    expect(cobija.frame.name).toBe('1');
    escena.setReduceMotion(true);
    interno.respirarEnCama(1950);
    expect(cobija.frame.name).toBe('0');

    const llegada = interno.apoyosDeLaSala.get(persona.key)!.llegada;
    Object.assign(interno.player, llegada);
    interno.updateNearestInteraction(true);
    expect(interno.dibujosDeMarcador.get(persona.key)).toBe(acueste);
    expect(interno.markerLabels.get(persona.key)).toMatchObject({ x: marker.x, y: marker.y - 18, alpha: 1 });
    expect(interno.markerPrompt).toMatchObject({ x: llegada.x, y: llegada.y + 12 });
    escena.interactNearest();
    expect(callbacks.onInteract).toHaveBeenCalledWith(expect.objectContaining({ key: persona.key }));
  });

  it('usa el cuerpo de pie si falta la cama o si la clave corresponde a otro tipo', () => {
    const falta = { ...persona, metadata: { ...persona.metadata, cama: 'otra' } };
    for (const { interno } of [salaMinima(cama, falta), salaMinima(cama, persona, [], undefined, 'OBJECT')]) {
      expect(interno.apoyosDeLaSala.has(persona.key)).toBe(false);
      expect(interno.markers.get(persona.key)?.['__personSprite']).toBeDefined();
    }
  });

  it('el informe va a la altura del tablero y «Ir a…» termina al frente sin confundir el punto dibujado con el suelo', () => {
    const { escena, interno, callbacks } = salaMinima(escritorio, informe);
    const marca = interno.markers.get(informe.key)!;
    expect(marca).toMatchObject({ x: informe.x, y: informe.y });
    expect(marca.depth).toBeGreaterThan(actorDepth(escritorio.y) + 0.01);
    expect(marca.hijos[0].visible).toBe(false);
    expect(escena.placeCandidates()).toContainEqual(expect.objectContaining({ key: informe.key }));
    expect(escena.walkToKey(informe.key)).toBe(true);
    const llegada = interno.apoyosDeLaSala.get(informe.key)!.llegada;
    expect(llegada).toEqual({ x: 336, y: 348 });
    expect(pisaElMueble(escritorio, llegada.x, llegada.y)).toBe(false);
    expect(interno.wouldCollide(336, 322)).toBe(true);
    expect(tickWalk(interno.walk, llegada, 16).arrived).toBe(true);
    escena.setOrientation({ nextTargetKey: informe.key, doorStates: {}, dimmedKeys: new Set() });
    expect(interno.dibujosDeMarcador.get(informe.key)).toBe(marca.hijos[2]);
    expect(interno.stepMark).toMatchObject({ x: marca.x - 22, y: marca.y });
    Object.assign(interno.player, llegada);
    interno.updateNearestInteraction(true);
    expect(interno.markerLabels.get(informe.key)).toMatchObject({ x: marca.x, y: marca.y - 32, alpha: 1 });
    expect(interno.markerPrompt).toMatchObject({ x: llegada.x, y: llegada.y + 12 });
    interno.finishWalkGoal('arrived');
    expect(callbacks.onWalkEnded).toHaveBeenCalledWith(informe.key, informe.label, 'arrived');
    expect(callbacks.onInteract).not.toHaveBeenCalled();
  });

  it('elige un lateral cuando el frente del escritorio está bloqueado', () => {
    const frente = { key: 'obstaculo', label: null, x: 310, y: 328, width: 65, height: 62 };
    const { interno, escena } = salaMinima(escritorio, informe, [frente]);
    const apoyo = apoyoDeMueble(informe, soportes)!;
    const [bordeFrontal, lateral] = bordesDelMueble(apoyo);
    expect(interno.wouldCollide(bordeFrontal.x, bordeFrontal.y)).toBe(true);
    expect(interno.apoyosDeLaSala.get(informe.key)?.llegada).toEqual(lateral);
    expect(escena.walkToKey(informe.key)).toBe(true);
    const ultimo = interno.walk.remaining?.at(-1) ?? interno.walk.target;
    expect(ultimo).toMatchObject(lateral);
  });
});
