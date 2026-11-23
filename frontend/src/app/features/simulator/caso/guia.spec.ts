import { armarGuia, avisarOpcionNueva, opcionesNuevas, pasoSalida } from './guia';

const LUGARES = [
  { key: 'puerta-sala', label: 'Sala de escucha', kind: 'door' },
  { key: 'carpeta', label: 'Historia clínica', kind: 'object' },
  { key: 'npc:enfermera', label: 'Enfermera', kind: 'person' },
  { key: 'familia', label: 'Familia', kind: 'person', note: 'persona a atender' },
  { key: 'carpeta', label: 'Historia clínica', kind: 'object' },
] as const;

it('lista personas y objetos con su marca de visto, sin puertas ni repetidos', () => {
  const guia = armarGuia({ goal: '  Contener a la familia ', lugares: LUGARES, inspeccionados: ['carpeta'], hablados: new Set(['enfermera']) });
  expect(guia.objetivo).toBe('Contener a la familia');
  expect(guia.enEstaSala).toEqual([
    { key: 'npc:enfermera', label: 'Enfermera', tipo: 'persona', visto: true },
    { key: 'familia', label: 'Familia', tipo: 'persona', visto: false },
    { key: 'carpeta', label: 'Historia clínica', tipo: 'objeto', visto: true },
  ]);
  expect(guia.quedaPorConocer).toBe(true);
});

it('un objeto sin revisar no se nombra, pero deja algo por conocer', () => {
  const guia = armarGuia({ goal: '', lugares: LUGARES, inspeccionados: ['familia'], hablados: new Set(['enfermera']) });
  expect(guia.enEstaSala.map(e => e.key)).toEqual(['npc:enfermera', 'familia']);
  expect(guia.quedaPorConocer).toBe(true);
});

it('una persona del mapa cuenta como vista si se habló con ella o si se inspeccionó', () => {
  expect(armarGuia({ goal: '', lugares: LUGARES, inspeccionados: ['carpeta', 'familia'], hablados: new Set(['enfermera']) }).quedaPorConocer).toBe(false);
  expect(armarGuia({ goal: '', lugares: LUGARES, inspeccionados: ['carpeta'], hablados: new Set(['enfermera', 'familia']) }).quedaPorConocer).toBe(false);
});

it('sin nada en la sala no queda nada por conocer', () => {
  expect(armarGuia({ goal: '', lugares: [], inspeccionados: [], hablados: new Set() }))
    .toEqual({ objetivo: '', enEstaSala: [], quedaPorConocer: false, siguiente: null, hechos: 0, total: 0 });
});

describe('el siguiente paso (V7, guía para las primeras testers)', () => {
  const PAP = { key: 'tool-pap', label: 'Kit PAP', recogida: false };

  it('primero la siguiente persona sin hablar, con la cuenta de la sala (personas y herramientas)', () => {
    const guia = armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set(['enfermera']), herramientas: [PAP] });
    expect(guia.siguiente).toBe('Habla con Familia');
    expect([guia.hechos, guia.total]).toEqual([1, 3]);
  });

  it('con las personas habladas, la herramienta por recoger; nunca un objeto sin revisar', () => {
    const guia = armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set(['enfermera', 'familia']), herramientas: [PAP] });
    expect(guia.siguiente).toBe('Recoge la herramienta «Kit PAP»');
    expect(guia.siguiente).not.toContain('Historia clínica');
  });

  it('con todo hecho, por dónde seguir: la primera puerta abierta y «Ir a…»', () => {
    const guia = armarGuia({
      goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set(['enfermera', 'familia']), herramientas: [{ ...PAP, recogida: true }],
    });
    expect(guia.siguiente).toBe(pasoSalida('Sala de escucha'));
    expect(guia.siguiente).toContain('«Ir a…»');
    expect([guia.hechos, guia.total]).toEqual([3, 3]);
  });

  it('una puerta cerrada (con aviso) no se propone', () => {
    const cerrada = LUGARES.map(l => l.kind === 'door' ? { ...l, note: 'cerrada' } : l);
    const guia = armarGuia({ goal: 'x', lugares: cerrada, inspeccionados: [], hablados: new Set(['enfermera', 'familia']) });
    expect(guia.siguiente).toBeNull();
  });
});

it('descarta los rótulos vacíos y conserva el orden dado: personas primero, luego objetos', () => {
  const guia = armarGuia({
    goal: '',
    lugares: [
      { key: 'o1', label: 'Mesa', kind: 'object' },
      { key: 'p1', label: '  ', kind: 'person' },
      { key: 'p2', label: 'Madre', kind: 'person' },
      { key: 'p3', label: 'Padre', kind: 'person' },
      { key: 'o2', label: 'Foto', kind: 'object' },
    ],
    inspeccionados: ['o1', 'o2'],
    hablados: new Set(),
  });
  expect(guia.enEstaSala.map(e => e.key)).toEqual(['p2', 'p3', 'o1', 'o2']);
});

it('las opciones nuevas son las que no estaban antes; en la primera carga ninguna lo es', () => {
  expect(opcionesNuevas([1, 2], [1, 2, 3])).toEqual([3]);
  expect(opcionesNuevas([1, 2], [2])).toEqual([]);
  expect(opcionesNuevas(null, [1, 2])).toEqual([]);
});

it('el aviso de respuesta nueva solo sale con opciones nuevas en el MISMO nodo', () => {
  expect(avisarOpcionNueva({ nodoAntes: 1, nodoDespues: 1, antes: [1], despues: [1, 2] })).toBe(true);
  expect(avisarOpcionNueva({ nodoAntes: 1, nodoDespues: 2, antes: [1], despues: [1, 2] })).toBe(false);
  expect(avisarOpcionNueva({ nodoAntes: 1, nodoDespues: 1, antes: [1, 2], despues: [1, 2] })).toBe(false);
  // Sin nodo previo registrado (primera lectura) o sin lista previa: nada es nuevo ni se compara.
  expect(avisarOpcionNueva({ nodoAntes: null, nodoDespues: 1, antes: [1], despues: [1, 2] })).toBe(true);
  expect(avisarOpcionNueva({ nodoAntes: 1, nodoDespues: 1, antes: null, despues: [1, 2] })).toBe(false);
});
