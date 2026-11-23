import { MapObjectState } from '../../core/models/simulation.model';
import { MissingItem } from './evidence-gating.config';
import { CopyContext, imperativeMissing, joinSpanish } from './evidence-copy.util';

const MUNDO = { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {} };

function obj(partial: Partial<MapObjectState> & Pick<MapObjectState, 'key' | 'label' | 'type'>): MapObjectState {
  return {
    x: 0, y: 0, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
    ...partial,
  };
}

const npc = (key: string): MissingItem => ({ kind: 'npc', key });
const used = (key: string): MissingItem => ({ kind: 'toolUsed', key });
const owned = (key: string): MissingItem => ({ kind: 'toolOwned', key });
const inspected = (key: string): MissingItem => ({ kind: 'inspected', key });

/** Una clave interna: palabras en minúscula unidas por guion, o un prefijo de clave. */
const SLUG = /[a-z]+-[a-z]+|npc:|tool:|inspected:|@/;

describe('joinSpanish', () => {
  it.each([
    [[], ''],
    [['a'], 'a'],
    [['a', 'b'], 'a y b'],
    [['a', 'b', 'c'], 'a, b y c'],
    [['a', 'b', 'c', 'd'], 'a, b, c y d'],
    [['hablar', 'investigar'], 'hablar e investigar'],
    [['hablar', 'hielo'], 'hablar y hielo'],
    [['a', '', 'b'], 'a y b'],
  ])('%j → «%s»', (items, expected) => {
    expect(joinSpanish(items as string[])).toBe(expected);
  });
});

describe('imperativeMissing: nombra con lo que hay en el mundo', () => {
  it('nombra con lo que hay en el mundo, no con una tabla de un caso', () => {
    const ctx: CopyContext = {
      world: { ...MUNDO, objects: [obj({ key: 'expediente', label: 'Expediente', type: 'OBJECT' })], tools: [{ code: 'KIT', label: 'Kit de apoyo', icon: '', category: '', description: '', active: true }] },
      npcs: [{ key: 'ana', displayName: 'Ana' }],
    };
    expect(imperativeMissing([inspected('expediente'), npc('ana'), owned('KIT')], ctx))
      .toEqual([expect.stringMatching(/^revisa Expediente/), 'habla con Ana', 'recoge Kit de apoyo']);
  });

  it('sin nombre conocido usa una frase general sin clave', () => {
    expect(imperativeMissing([npc('x-1')], { world: MUNDO, npcs: [] })).toEqual(['habla con alguien de la sala']);
    const unknown = imperativeMissing([inspected('otro-z'), owned('NOPE'), used('NOPE')], { world: MUNDO, npcs: [] });
    expect(unknown).toEqual(['revisa algo de la sala', 'recoge algo de la sala', 'usa algo de la sala']);
    for (const phrase of unknown) expect(phrase).not.toMatch(SLUG);
  });

  it('una persona exigida como «revisada» se «habla»: lo dice el tipo del objeto o el escenario', () => {
    const ctx: CopyContext = {
      world: { ...MUNDO, objects: [obj({ key: 'madre', label: 'Madre', type: 'PERSON', x: 190, y: 420 })] },
      npcs: [{ key: 'ana', displayName: 'Ana' }],
    };
    expect(imperativeMissing([inspected('madre')], ctx)).toEqual(['habla con Madre (en el extremo izquierdo, al frente)']);
    expect(imperativeMissing([inspected('ana')], ctx)).toEqual(['habla con Ana']);
  });

  it('distingue TENER (recoge) de USAR (usa) una herramienta y la nombra con la etiqueta del mundo', () => {
    const tools = [{ code: 'KIT', label: 'Kit de apoyo', icon: '', category: '', description: '', active: true }];
    const ctx: CopyContext = { world: { ...MUNDO, tools }, npcs: [] };
    expect(imperativeMissing([owned('KIT')], ctx)).toEqual(['recoge Kit de apoyo']);
    expect(imperativeMissing([used('KIT')], ctx)).toEqual(['usa Kit de apoyo']);
  });

  it('el lugar se dice solo de lo que está en la sala actual, con las coordenadas vivas', () => {
    const ctx: CopyContext = {
      world: {
        ...MUNDO,
        objects: [
          obj({ key: 'caja', label: 'Caja azul', type: 'OBJECT', x: 190, y: 420 }),
          obj({ key: 'kit', label: 'Kit en la mesa', type: 'TOOL', toolCode: 'KIT', x: 318, y: 428 }),
        ],
      },
      npcs: [],
    };
    expect(imperativeMissing([inspected('caja')], ctx)).toEqual(['revisa Caja azul (en el extremo izquierdo, al frente)']);
    expect(imperativeMissing([owned('KIT')], ctx)).toEqual(['recoge Kit en la mesa (a la izquierda, al frente)']);
    // lo que no está en esta sala no lleva lugar
    expect(imperativeMissing([inspected('lejos')], ctx)).toEqual(['revisa algo de la sala']);
  });

  it('elimina duplicados y conserva el orden', () => {
    const ctx: CopyContext = { world: MUNDO, npcs: [{ key: 'ana', displayName: 'Ana' }] };
    expect(imperativeMissing([npc('ana'), owned('KIT'), npc('ana')], ctx)).toEqual(['habla con Ana', 'recoge algo de la sala']);
  });

  it('dos requisitos distintos sin nombre conocido no repiten la misma frase', () => {
    const ctx: CopyContext = { world: MUNDO, npcs: [] };
    expect(imperativeMissing([inspected('nota-perdida'), inspected('otra-nota')], ctx)).toEqual(['revisa algo de la sala']);
  });

  it('con cualquier mezcla nunca aparece una clave', () => {
    const ctx: CopyContext = { world: MUNDO, npcs: [] };
    for (const phrase of imperativeMissing([npc('enfermera-urgencias'), inspected('expediente-caso'), owned('SPIKES'), used('PAP@x')], ctx)) {
      expect(phrase).not.toMatch(SLUG);
    }
  });
});
