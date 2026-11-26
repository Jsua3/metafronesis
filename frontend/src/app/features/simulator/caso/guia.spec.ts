import { armarGuia, avisarOpcionNueva, leerGuiaAutorada, opcionesNuevas, pasoCumplido, pasoSalida } from './guia';

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
    .toEqual({ objetivo: '', enEstaSala: [], quedaPorConocer: false, siguiente: null, hechos: 0, total: 0, siguienteLugar: null });
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

describe('a quién apunta el siguiente paso (P9): una sola fuente para el texto, el anillo del mundo, el plano y «Ir a…»', () => {
  const PAP = { key: 'tool-pap', label: 'Kit PAP', recogida: false };

  it('la siguiente persona sin hablar, con la clave que usa el mundo', () => {
    const guia = armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set(['enfermera']) });
    expect(guia.siguiente).toBe('Habla con Familia');
    expect(guia.siguienteLugar).toEqual({ key: 'familia', label: 'Familia', tipo: 'persona' });
  });

  it('una persona del escenario conserva su prefijo npc: (es la clave del mundo)', () => {
    const guia = armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set() });
    expect(guia.siguienteLugar).toEqual({ key: 'npc:enfermera', label: 'Enfermera', tipo: 'persona' });
  });

  it('con las personas habladas, la herramienta; con todo hecho, la primera puerta abierta', () => {
    const habladas = new Set(['enfermera', 'familia']);
    expect(armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: habladas, herramientas: [PAP] }).siguienteLugar)
      .toEqual({ key: 'tool-pap', label: 'Kit PAP', tipo: 'herramienta' });
    expect(armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: habladas, herramientas: [{ ...PAP, recogida: true }] }).siguienteLugar)
      .toEqual({ key: 'puerta-sala', label: 'Sala de escucha', tipo: 'puerta' });
  });

  it('sin nada que proponer (todo hecho y la única puerta cerrada) no apunta a nadie, y el texto y el lugar nunca se contradicen', () => {
    const cerrada = LUGARES.map(l => l.kind === 'door' ? { ...l, note: 'cerrada' } : l);
    const guia = armarGuia({ goal: 'x', lugares: cerrada, inspeccionados: [], hablados: new Set(['enfermera', 'familia']) });
    expect(guia.siguiente).toBeNull();
    expect(guia.siguienteLugar).toBeNull();
    const con = armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set(['enfermera']) });
    expect(con.siguiente).toContain(con.siguienteLugar!.label);
  });

  it('nunca apunta a un objeto sin revisar (no se anuncia evidencia por descubrir)', () => {
    const guia = armarGuia({ goal: 'x', lugares: LUGARES, inspeccionados: [], hablados: new Set(['enfermera', 'familia']) });
    expect(guia.siguienteLugar?.key).not.toBe('carpeta');
  });
});

describe('la guía escrita en el caso (`ambiente.guia`)', () => {
  const GUIA = leerGuiaAutorada({
    guia: {
      paso: 2,
      titulo: 'Contén antes de informar',
      pasos: [
        { texto: 'Habla con Gloria.', hecho: { talked: 'abuela' }, lugar: 'abuela' },
        { texto: 'Recoge la guía.', hecho: { has: 'PAP' }, lugar: 'kit-pap' },
        { texto: 'Usa los primeros auxilios.', hecho: { used: 'PAP' } },
        { texto: 'Decide qué responder.' },
      ],
    },
  })!;
  const LUG = [
    { key: 'abuela', label: 'Gloria', kind: 'person' },
    { key: 'kit-pap', label: 'Guía PAP', kind: 'object' },
    { key: 'puerta', label: 'Sala de escucha', kind: 'door' },
  ] as const;
  const mundo = (m: Partial<{ hablados: string[]; inspeccionados: string[]; inventario: string[]; usadas: string[] }> = {}) => ({
    hablados: new Set(m.hablados ?? []), inspeccionados: m.inspeccionados ?? [], inventario: m.inventario ?? [], herramientasUsadas: m.usadas ?? [],
  });
  const armar = (m = mundo()) => armarGuia({ goal: 'x', lugares: LUG, inspeccionados: [], hablados: m.hablados, autorada: { guia: GUIA, mundo: m } });

  it('un consejo sin hecho se da por cumplido cuando se cumple un paso posterior; la decisión final queda como paso actual', () => {
    const conConsejo = leerGuiaAutorada({ guia: { paso: 4, titulo: 'Comunica', pasos: [
      { texto: 'El médico ya lo dijo con palabras claras. Quédate.' },
      { texto: 'Usa la tarjeta EPICEE con Gloria.', hecho: { used: 'SPIKES@gloria' }, lugar: 'abuela' },
      { texto: 'Decide qué haces ahora.' },
    ] } })!;
    const con = (usadas: string[]) => armarGuia({ goal: 'x', lugares: LUG, inspeccionados: [], hablados: new Set(),
      autorada: { guia: conConsejo, mundo: { ...mundo({ usadas }) } } });
    expect(con([]).pasos!.map(p => p.hecho)).toEqual([false, false, false]);
    const despues = con(['SPIKES@gloria']);
    expect(despues.pasos!.map(p => p.hecho)).toEqual([true, true, false]);
    expect(despues.siguiente).toBe('Decide qué haces ahora.');
    expect([despues.hechos, despues.total]).toEqual([2, 3]);
  });

  it('lee la forma del contrato y descarta lo que no la tiene', () => {
    expect(GUIA.paso).toBe(2);
    expect(leerGuiaAutorada(undefined)).toBeNull();
    expect(leerGuiaAutorada({ guia: { pasos: [] } })).toBeNull();
    expect(leerGuiaAutorada({ guia: { paso: 1, pasos: [{ texto: ' ' }, { texto: 'A', hecho: { x: 1 } }] } })?.pasos).toEqual([{ texto: 'A' }]);
  });

  it('pasoCumplido evalúa los cuatro hechos; sin hecho nunca se marca solo', () => {
    const m = mundo({ hablados: ['abuela'], inspeccionados: ['cartel'], inventario: ['PAP'], usadas: ['PAP@familia'] });
    expect(pasoCumplido({ talked: 'abuela' }, m)).toBe(true);
    expect(pasoCumplido({ talked: 'otro' }, m)).toBe(false);
    expect(pasoCumplido({ inspected: 'cartel' }, m)).toBe(true);
    expect(pasoCumplido({ has: 'PAP' }, m)).toBe(true);
    expect(pasoCumplido({ used: 'PAP' }, m)).toBe(true);
    expect(pasoCumplido({ used: 'PA' }, m)).toBe(false);
    expect(pasoCumplido(undefined, m)).toBe(false);
  });

  it('la pestaña dice «Paso N · título» y la lista marca cada paso', () => {
    const g = armar(mundo({ hablados: ['abuela'] }));
    expect(g.pestana).toBe('Paso 2 · Contén antes de informar');
    expect(g.pasos?.map(p => p.hecho)).toEqual([true, false, false, false]);
    expect([g.hechos, g.total, g.siguiente]).toEqual([1, 4, 'Recoge la guía.']);
  });

  it('la guía espera a que se vuelva a hablar con Gloria en esta escena', () => {
    const m = mundo({ hablados: ['abuela'], inspeccionados: ['abuela'] });
    const alEntrar = { ...m, viewedNpcKeysHere: [] };
    const trasHablar = { ...mundo(), viewedNpcKeysHere: ['abuela'] };
    expect(armar(alEntrar).pasos?.[0].hecho).toBe(false);
    expect(armar(alEntrar).siguienteLugar?.key).toBe('abuela');
    expect(armar(trasHablar).pasos?.[0].hecho).toBe(true);
  });

  it('sin la lista de la escena conserva las marcas antiguas, incluidas las claves con prefijo y las inspecciones', () => {
    expect(pasoCumplido({ talked: 'abuela' }, mundo({ hablados: ['npc:abuela'] }))).toBe(true);
    expect(pasoCumplido({ talked: 'abuela' }, mundo({ inspeccionados: ['abuela'] }))).toBe(true);
  });

  it('un uso con objetivo solo se cumple con la clave completa', () => {
    const m = mundo({ usadas: ['PAP', 'PAP@camilo', 'PAP@camilo@extra', 'PAP@camila'] });
    expect(pasoCumplido({ used: 'PAP' }, m)).toBe(true);
    expect(pasoCumplido({ used: 'PAP@camilo' }, m)).toBe(true);
    expect(pasoCumplido({ used: 'PAP@cami' }, m)).toBe(false);
    expect(pasoCumplido({ used: 'PAP@camilo' }, mundo({ usadas: ['PAP', 'PAP@camilo@extra', 'PAP@camila'] }))).toBe(false);
  });

  it('pone el nombre en el título y los pasos sin alterar los datos de la guía', () => {
    const ambiente = {
      guia: {
        paso: 2,
        titulo: '{nombre}, escucha',
        pasos: [{ texto: 'Habla con Gloria, {nombre}.', hecho: { talked: 'abuela' }, lugar: 'abuela' }],
      },
    };
    const m = mundo();
    const mostrar = (nombre: string) => armarGuia({
      goal: 'x', lugares: LUG, inspeccionados: [], hablados: m.hablados,
      autorada: { guia: leerGuiaAutorada(ambiente, nombre)!, mundo: m },
    });
    const conNombre = mostrar('Ana María');
    expect(conNombre.pestana).toBe('Paso 2 · Ana, escucha');
    expect(conNombre.pasos).toEqual([{ texto: 'Habla con Gloria, Ana.', hecho: false }]);
    expect(conNombre.siguiente).toBe('Habla con Gloria, Ana.');
    expect(conNombre.siguienteLugar?.key).toBe('abuela');
    expect(mostrar('').pestana).toBe('Paso 2 · Escucha');
    expect(mostrar('').pasos).toEqual([{ texto: 'Habla con Gloria.', hecho: false }]);
    expect(ambiente.guia.titulo).toBe('{nombre}, escucha');
    expect(ambiente.guia.pasos[0].texto).toBe('Habla con Gloria, {nombre}.');
  });

  it('«Ir allí» apunta al primer paso pendiente con lugar y sigue al mundo', () => {
    expect(armar().siguienteLugar).toEqual({ key: 'abuela', label: 'Gloria', tipo: 'persona' });
    expect(armar(mundo({ hablados: ['abuela'] })).siguienteLugar?.key).toBe('kit-pap');
  });

  it('si ningún pendiente trae lugar, cae al siguiente lugar calculado (la puerta con todo hecho)', () => {
    const g = armar(mundo({ hablados: ['abuela'], inventario: ['PAP'] }));
    expect(g.siguiente).toBe('Usa los primeros auxilios.');
    expect(g.siguienteLugar?.key).toBe('puerta');
  });

  it('sin guía escrita, nada cambia', () => {
    const g = armarGuia({ goal: 'x', lugares: LUG, inspeccionados: [], hablados: new Set() });
    expect(g.pestana).toBeUndefined();
    expect(g.pasos).toBeUndefined();
  });
});
