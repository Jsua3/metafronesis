import {
  CHARACTER_HEIGHT_PX,
  DOOR_FALLBACK_HEIGHT,
  DOOR_HINT_GAP,
  DOOR_SPRITE_FEET_Y,
  PREVIOUS_PX_PER_M,
  PX_PER_M,
  WORLD_SPRITES,
  doorHintY,
  furniturePlacement,
  metersOf,
  staleSpriteSize,
  worldSprite,
  worldSpriteForTexture,
} from './world-scale.util';

/**
 * Lo que medía cada sprite en el juego antes de la F8: el cuerpo opaco del PNG por la escala
 * fraccionaria con que se dibujaba (muebles: min(ancho de la huella / ancho, tope de alto / alto);
 * puertas: DOOR_SPRITE_SCALE = 1,45). [grupo, nombre, ancho, alto, escala de entonces]
 */
const BEFORE: ReadonlyArray<readonly [string, string, number, number, number]> = [
  ['furniture', 'counter', 236, 73, 0.9041],
  ['furniture', 'gurney', 122, 46, 1],
  ['furniture', 'waiting_chairs', 155, 56, 0.7097],
  ['furniture', 'plant', 48, 64, 0.875],
  ['furniture', 'sofa', 146, 74, 0.7027],
  ['furniture', 'coffee_table', 96, 60, 0.4333],
  ['furniture', 'shelf', 124, 148, 0.5867],
  ['furniture', 'chair', 27, 42, 0.9565],
  ['furniture', 'file_cabinet', 130, 97, 0.6186],
  ['furniture', 'desk', 224, 106, 0.6415],
  ['doors', 'door_urgencias', 44, 48, 1.45],
  ['doors', 'door_urgencias_side', 30, 60, 1.45],
  ['doors', 'door_salida_institucional', 36, 60, 1.45],
  ['doors', 'door_salida_institucional_side', 22, 58, 1.45],
  ['doors', 'door_recepcion', 36, 60, 1.45],
  ['doors', 'door_recepcion_side', 22, 58, 1.45],
  ['doors', 'door_sala_escucha', 30, 60, 1.45],
  ['doors', 'door_sala_escucha_side', 18, 58, 1.45],
  ['doors', 'door_consultorio', 32, 60, 1.45],
  ['doors', 'door_consultorio_side', 20, 58, 1.45],
];

/** Cuerpo opaco de los iconos recogibles (el PNG es de 64×64): pasan a 2:1 exactos. */
const PICKUPS: ReadonlyArray<readonly [string, number, number]> = [
  ['tool_pap', 56, 42],
  ['tool_spikes', 46, 56],
  ['tool_reflection_journal', 44, 56],
  ['tool_safety_route', 52, 56],
  ['tool_risk_meter', 55, 51],
  ['object_expediente', 56, 44],
  ['object_marco_normativo', 44, 56],
  ['object_registro', 56, 50],
  ['object_acceso_restringido', 30, 56],
  ['object_cierre', 51, 56],
];

/** Altura plausible de cada mueble, en metros: [mínimo, máximo]. */
const PLAUSIBLE_METERS: Readonly<Record<string, readonly [number, number]>> = {
  counter: [1.2, 1.6],
  gurney: [0.8, 1.2],
  waiting_chairs: [0.75, 1.1],
  plant: [1.0, 1.5],
  sofa: [0.8, 1.2],
  coffee_table: [0.4, 0.7],
  shelf: [1.6, 2.1],
  chair: [0.75, 1.1],
  file_cabinet: [1.0, 1.6],
  desk: [1.2, 1.7],
};

describe('world-scale.util — la tabla de tamaños del mundo (spec §13.1, decisión 12)', () => {
  it('39 px/m: el cuerpo del personaje (64 px) es un adulto de 1,6 a 1,7 m', () => {
    expect(PX_PER_M).toBe(39);
    expect(metersOf(CHARACTER_HEIGHT_PX)).toBeGreaterThan(1.6);
    expect(metersOf(CHARACTER_HEIGHT_PX)).toBeLessThan(1.7);
  });

  it('hay 30 sprites (10 muebles, 10 puertas, 10 objetos) y ninguno se repite', () => {
    expect(WORLD_SPRITES).toHaveLength(30);
    for (const group of ['furniture', 'doors', 'objects']) {
      expect(WORLD_SPRITES.filter(spec => spec.group === group)).toHaveLength(10);
    }
    expect(new Set(WORLD_SPRITES.map(spec => `${spec.group}/${spec.name}`)).size).toBe(30);
  });

  it('todo tamaño es un entero positivo', () => {
    for (const spec of WORLD_SPRITES) {
      expect(Number.isInteger(spec.width) && spec.width > 0).toBe(true);
      expect(Number.isInteger(spec.height) && spec.height > 0).toBe(true);
    }
  });

  it.each(BEFORE)('%s/%s mide lo de antes por 39/46 (±1 px)', (group, name, width, height, scale) => {
    const spec = worldSprite(group as 'furniture' | 'doors', name);
    const k = PX_PER_M / PREVIOUS_PX_PER_M;
    expect(Math.abs(spec.width - width * scale * k)).toBeLessThanOrEqual(1);
    expect(Math.abs(spec.height - height * scale * k)).toBeLessThanOrEqual(1);
  });

  it.each(PICKUPS)('%s: el icono recogible es el cuerpo del 64×64 a la mitad', (name, width, height) => {
    const spec = worldSprite('objects', name);
    expect([spec.width, spec.height]).toEqual([Math.round(width / 2), Math.round(height / 2)]);
    expect(spec.width).toBeLessThanOrEqual(32);
    expect(spec.height).toBeLessThanOrEqual(32);
  });

  it.each(Object.entries(PLAUSIBLE_METERS))('el mueble %s mide una altura plausible', (name, [min, max]) => {
    const meters = metersOf(worldSprite('furniture', name).height);
    expect(meters).toBeGreaterThanOrEqual(min);
    expect(meters).toBeLessThanOrEqual(max);
  });

  it('las puertas superan al personaje, salvo la doble puerta baja de urgencias (arte original, sin rediseño)', () => {
    for (const spec of WORLD_SPRITES.filter(entry => entry.group === 'doors' && entry.name !== 'door_urgencias')) {
      expect(spec.height).toBeGreaterThanOrEqual(CHARACTER_HEIGHT_PX + 6);
    }
    expect(worldSprite('doors', 'door_recepcion').height).toBe(74);
  });

  it('un mueble de sombra: ancho del sprite + 8, a escala 1, con la base apenas bajo los pies', () => {
    expect(furniturePlacement('counter', 490, 300)).toEqual({
      image: { x: 400, y: 303 },
      shadow: { x: 490, y: 300, width: 189, height: 19 },
    });
    // las coordenadas siempre son enteras, aunque los pies vengan de una escala fraccionaria de la planta
    const plant = furniturePlacement('plant', 822, 388 + 18 * 1.05);
    expect([plant.image.x, plant.image.y, plant.shadow.y].every(Number.isInteger)).toBe(true);
    expect(() => furniturePlacement('no-existe', 0, 0)).toThrow('sprite del mundo desconocido');
  });

  it('una textura con otro tamaño que la tabla (PNG viejo en caché) se fuerza al de la tabla', () => {
    const sofa = worldSprite('furniture', 'sofa');
    expect(staleSpriteSize(sofa, 87, 44)).toBeNull();
    expect(staleSpriteSize(sofa, 146, 74)).toEqual({ width: 87, height: 44 });
  });

  it('cada textura de Phaser encuentra su ficha', () => {
    expect(worldSpriteForTexture('furniture-sofa')).toBe(worldSprite('furniture', 'sofa'));
    expect(worldSpriteForTexture('door-door_urgencias_side')).toBe(worldSprite('doors', 'door_urgencias_side'));
    expect(worldSpriteForTexture('object-tool_pap')).toBe(worldSprite('objects', 'tool_pap'));
    expect(worldSpriteForTexture('dungeon-tiles')).toBeNull();
  });

  it('el aviso de una puerta flota 13 px sobre su borde alto', () => {
    expect(DOOR_SPRITE_FEET_Y).toBe(16);
    expect(DOOR_HINT_GAP).toBe(13);
    // puerta de 74 px con el marcador en y=440: base en 456, borde alto en 382, aviso centrado en 369
    expect(doorHintY(440, 74)).toBe(369);
    expect(doorHintY(440, 59)).toBe(384);
    // una puerta de respaldo (sin arte propio) mide 48 px
    expect(DOOR_FALLBACK_HEIGHT).toBe(48);
    expect(doorHintY(440, DOOR_FALLBACK_HEIGHT)).toBe(395);
  });
});
