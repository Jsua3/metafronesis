import type { CasoBorrador } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { ALTO_ESCENA, ANCHO_ESCENA } from '../modelo/trazado';
import { universidad } from '../testing/universidad';
import { type Cambio, type ResolverIds, aplicarPropuesta, dependencias, describirCambio, validarPropuesta } from './propuestas';

/**
 * Los números de una propuesta son filas del servidor. Aquí el servidor es «el orden del caso»: la escena 1 es la primera,
 * el personaje 1 es el primero del caso, etc.
 */
function caso(): CasoBorrador {
  return copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
}

function resolver(c: CasoBorrador): ResolverIds {
  const respuestas = c.escenas.flatMap((e) => e.respuestas.map((r) => ({ escenaId: e.id, respuestaId: r.id })));
  return {
    escena: (n) => c.escenas[n - 1]?.id,
    personaje: (n) => c.personajes[n - 1]?.id,
    sala: (n) => c.salas[n - 1]?.id,
    objeto: (n) => (c.salas[0].muebles[n - 1] ? { salaId: c.salas[0].id, tipo: 'mueble', indice: n - 1 } : undefined),
    respuesta: (n) => respuestas[n - 1],
  };
}

let siguiente = 0;
const ids = (prefijo: string) => `${prefijo}-p${siguiente++}`;

const personaje1 = 1; // psicóloga de Bienestar o la primera persona del caso
const linea = (nodeId: number | string, extra: Record<string, unknown> = {}) =>
  ({ op: 'add-line', nodeId, characterId: personaje1, text: 'Hola', expression: 'neutral', ...extra }) as Cambio;
const escenaNueva = (id: string, extra: Record<string, unknown> = {}) =>
  ({ op: 'add-scene', id, title: 'Dudar en la espera', narrative: '', intensity: 'MEDIUM', warningMessage: '', afterNodeId: null, ...extra }) as Cambio;
const respuesta = (nodeId: number | string, extra: Record<string, unknown> = {}) =>
  ({ op: 'add-response', nodeId, text: 'Te acompaño', responseClass: 'RECOMMENDED', feedbackText: 'Bien.', prohibitionReason: '', targetNodeId: 2, ...extra }) as Cambio;

describe('validarPropuesta', () => {
  it('propuesta inválida no modifica el caso', () => {
    const c = caso();
    const antes = structuredClone(c);
    for (const basura of [null, 'texto', [{ op: 'borrar-todo' }], [{}], { cambios: [] }]) {
      expect(validarPropuesta(c, basura, resolver(c)).ok).toBe(false);
    }
    expect(() => aplicarPropuesta(c, [{ op: 'borrar-todo' } as unknown as Cambio], [true], resolver(c), ids)).toThrow();
    expect(c).toEqual(antes);
  });

  it('un cambio sobre una escena inexistente invalida toda la propuesta', () => {
    const c = caso();
    expect(validarPropuesta(c, [linea(1), linea(99)], resolver(c)).ok).toBe(false);
    expect(validarPropuesta(c, [linea('nueva-7')], resolver(c)).ok).toBe(false); // no se declaró antes
  });

  it('una expresión que no existe o un personaje que no está invalidan la propuesta', () => {
    const c = caso();
    expect(validarPropuesta(c, [linea(1, { expression: 'furiosa' })], resolver(c)).ok).toBe(false);
    expect(validarPropuesta(c, [linea(1, { characterId: 999 })], resolver(c)).ok).toBe(false);
  });

  it('una propuesta bien formada es válida, con las diez operaciones', () => {
    const c = caso();
    c.escenas[0].respuestas = [{ id: 'r1', texto: 'Hola', clase: 'ACCEPTABLE', razon: '', retroalimentacion: '', efectos: {}, destinoId: c.escenas[1].id, marcaIa: false }];
    const r = validarPropuesta(c, [
      escenaNueva('nueva-1', { afterNodeId: 1 }),
      linea('nueva-1'),
      respuesta('nueva-1', { targetNodeId: 2 }),
      { op: 'place-character', mapId: 1, characterId: personaje1, x: 300, y: 350, expression: 'preocupada' },
      { op: 'move', objectId: 1, x: 400, y: 300 },
      { op: 'add-ending', key: 'se_va', title: 'Se va sin ayuda', message: 'Se fue.', tone: 'critical', when: { milestone: 'valorar_el_riesgo' } },
      { op: 'set-response-class', decisionId: 1, responseClass: 'RISKY', prohibitionReason: '' },
      { op: 'set-persona-effect', decisionId: 1, bond: 1, activation: null },
      { op: 'mark-milestone', decisionId: 1, milestoneKey: 'valorar_el_riesgo' },
      { op: 'set-intensity', nodeId: 1, intensity: 'HIGH', warningMessage: 'Habla de violencia.' },
    ], resolver(c));
    expect(r).toEqual({ ok: true, cambios: expect.any(Array) });
  });
});

describe('aplicarPropuesta', () => {
  it('aplicar solo los seleccionados', () => {
    const c = caso();
    const cambios = [linea(1, { text: 'Uno' }), linea(1, { text: 'Dos' }), linea(1, { text: 'Tres' })];
    const { caso: nuevo, tocados } = aplicarPropuesta(c, cambios, [true, false, true], resolver(c), ids);
    expect(nuevo.escenas[0].lineas.map((l) => l.texto)).toEqual(['Uno', 'Tres']);
    expect(c.escenas[0].lineas).toEqual([]); // el original no cambia
    expect(tocados.guiones).toEqual([c.escenas[0].id]);
  });

  it('todo lo nuevo queda con marcaIa true y los finales pasan el caso a modo propio', () => {
    const c = caso();
    const { caso: nuevo, tocados } = aplicarPropuesta(c, [
      escenaNueva('nueva-1'),
      linea('nueva-1'),
      respuesta('nueva-1', { responseClass: 'RISKY', targetNodeId: 1 }),
      { op: 'add-ending', key: 'ruta-activada', title: 'F', message: 'T', tone: 'warning', when: { count: 'contraindicated', gte: 2 } },
    ] as Cambio[], [true, true, true, true], resolver(c), ids);
    const escena = nuevo.escenas.at(-1)!;
    expect(escena.marcaIa).toBe(true);
    expect(escena.lineas[0].marcaIa).toBe(true);
    expect(escena.respuestas[0].marcaIa).toBe(true);
    expect(nuevo.finales.find((f) => f.id === 'ruta_activada')).toMatchObject({ marcaIa: true, tono: 'warning' });
    expect(nuevo.modoFinales).toBe('propio');
    expect(tocados).toMatchObject({ escenasNuevas: [escena.id], guiones: [escena.id], respuestas: [escena.respuestas[0].id], finales: true });
  });

  // M2: la narración que propone la IA llega a la escena nueva.
  it('la escena nueva conserva la narración que propuso la IA', () => {
    const c = caso();
    const { caso: nuevo } = aplicarPropuesta(c, [escenaNueva('nueva-1', { narrative: 'La persona duda en la puerta.' })] as Cambio[], [true], resolver(c), ids);
    expect(nuevo.escenas.at(-1)!.narracion).toBe('La persona duda en la puerta.');
  });

  // M5: pasar de automático a propio por una propuesta no deja al caso con un solo final.
  describe('un final propuesto en modo automático', () => {
    const final = { op: 'add-ending', key: 'se_va', title: 'Se va sin ayuda', message: 'Se fue.', tone: 'critical', when: { count: 'contraindicated', gte: 1 } } as Cambio;

    it('siembra los cuatro finales del modelo (editables) y agrega el propuesto antes del de por defecto', () => {
      const c = caso();
      expect(c.modoFinales).toBe('automatico');
      const { caso: nuevo } = aplicarPropuesta(c, [final], [true], resolver(c), ids);
      expect(nuevo.modoFinales).toBe('propio');
      expect(nuevo.finales.map((f) => f.id)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'se_va', 'con_brechas']);
      expect(nuevo.finales.map((f) => f.marcaIa)).toEqual([false, false, false, true, false]);
      expect(nuevo.finales.at(-1)!.condicion).toBeNull();
      expect(nuevo.finales[0].condicion).not.toBeNull();
    });

    it('si el caso ya tiene finales propios, solo se agrega el propuesto', () => {
      const c = caso();
      c.modoFinales = 'propio';
      c.finales = [{ id: 'mio', nombre: 'Mío', texto: 'T', tono: 'neutral', condicion: { milestone: c.hitos[0].clave }, marcaIa: false }];
      const { caso: nuevo } = aplicarPropuesta(c, [final], [true], resolver(c), ids);
      expect(nuevo.finales.map((f) => f.id)).toEqual(['mio', 'se_va']);
    });

    it('si la clave propuesta es la de uno del modelo, no se repite', () => {
      const c = caso();
      const { caso: nuevo } = aplicarPropuesta(c, [{ ...final, key: 'critica' } as Cambio], [true], resolver(c), ids);
      expect(new Set(nuevo.finales.map((f) => f.id)).size).toBe(5);
    });

    it('la descripción dice que se agregan también los cuatro finales del modelo', () => {
      const c = caso();
      expect(describirCambio(c, final, [final])).toContain('los cuatro finales del modelo');
      c.modoFinales = 'propio';
      expect(describirCambio(c, final, [final])).not.toContain('los cuatro finales del modelo');
    });
  });

  it('una respuesta lleva a la escena que el número dice, o a una nueva de la propuesta', () => {
    const c = caso();
    const { caso: nuevo } = aplicarPropuesta(c, [
      escenaNueva('nueva-1', { afterNodeId: 2 }),
      respuesta(2, { targetNodeId: 'nueva-1' }),
      respuesta(2, { responseClass: 'CONTRAINDICATED', prohibitionReason: 'Apura a la persona.', targetNodeId: 1 }),
    ] as Cambio[], [true, true, true], resolver(c), ids);
    const [hacia, contra] = nuevo.escenas[1].respuestas;
    expect(hacia.destinoId).toBe(nuevo.escenas.at(-1)!.id);
    expect(nuevo.escenas.at(-1)!.salaId).toBe('consultorio'); // la sala de la escena de referencia
    expect(contra).toMatchObject({ clase: 'CONTRAINDICATED', razon: 'Apura a la persona.', destinoId: c.escenas[0].id });
  });

  it('una línea de una escena nueva no se puede aplicar sin su escena', () => {
    const c = caso();
    const cambios: Cambio[] = [escenaNueva('nueva-1'), linea('nueva-1')];
    expect(dependencias(cambios)).toEqual([[], [0]]);
    expect(() => aplicarPropuesta(c, cambios, [false, true], resolver(c), ids)).toThrow();
  });

  it('colocar un personaje fuera del piso lo deja en el borde y le da una clave libre', () => {
    const c = caso();
    const { caso: nuevo, tocados } = aplicarPropuesta(c, [{ op: 'place-character', mapId: 2, characterId: personaje1, x: 5000, y: 10, expression: 'alegre' }] as Cambio[], [true], resolver(c), ids);
    const p = nuevo.salas.find((s) => s.id === 'consultorio')!.personajes.at(-1)!;
    expect(p).toMatchObject({ x: 864, y: 236, expresion: 'alegre' });
    expect(p.clave).toBeTruthy();
    expect(tocados.salas).toEqual(['consultorio']);
  });

  it('cambiar la clase, el efecto en la persona y los hitos de una respuesta existente', () => {
    const c = caso();
    c.escenas[0].respuestas = [{ id: 'r1', texto: 'Hola', clase: 'ACCEPTABLE', razon: '', retroalimentacion: '', efectos: { persona: { bond: -1 }, hitos: ['a'] }, destinoId: c.escenas[1].id, marcaIa: false }];
    const { caso: nuevo, tocados } = aplicarPropuesta(c, [
      { op: 'set-response-class', decisionId: 1, responseClass: 'CONTRAINDICATED', prohibitionReason: 'Presiona.' },
      { op: 'set-persona-effect', decisionId: 1, bond: null, activation: 1 },
      { op: 'mark-milestone', decisionId: 1, milestoneKey: 'valorar_el_riesgo' },
      { op: 'mark-milestone', decisionId: 1, milestoneKey: 'a' },
      { op: 'set-intensity', nodeId: 2, intensity: 'HIGH', warningMessage: 'Habla de violencia.' },
    ] as Cambio[], [true, true, true, true, true], resolver(c), ids);
    expect(nuevo.escenas[0].respuestas[0]).toMatchObject({
      clase: 'CONTRAINDICATED', razon: 'Presiona.', efectos: { persona: { bond: -1, activation: 1 }, hitos: ['a', 'valorar_el_riesgo'] }, marcaIa: true,
    });
    expect(nuevo.escenas[1]).toMatchObject({ intensidad: 'HIGH', advertencia: 'Habla de violencia.', marcaIa: true });
    expect(tocados).toMatchObject({ respuestas: ['r1'], escenas: [c.escenas[1].id] });
  });

  describe('A7 · todo lo que la IA cambia o coloca queda marcado «sugerido por la IA»', () => {
    const respuestaPropia = (c: CasoBorrador) => {
      c.escenas[0].respuestas = [{ id: 'r1', texto: 'Hola', clase: 'ACCEPTABLE', razon: '', retroalimentacion: '', efectos: {}, destinoId: c.escenas[1].id, marcaIa: false }];
    };

    it('cambiar la clase, el efecto en la persona o un hito marca la respuesta que se toca (y solo esa)', () => {
      for (const cambio of [
        { op: 'set-response-class', decisionId: 1, responseClass: 'RISKY', prohibitionReason: '' },
        { op: 'set-persona-effect', decisionId: 1, bond: 1, activation: null },
        { op: 'mark-milestone', decisionId: 1, milestoneKey: 'valorar_el_riesgo' },
      ] as Cambio[]) {
        const c = caso();
        respuestaPropia(c);
        c.escenas[1].respuestas = [{ id: 'r2', texto: 'Otra', clase: 'ACCEPTABLE', razon: '', retroalimentacion: '', efectos: {}, destinoId: c.escenas[0].id, marcaIa: false }];
        const { caso: nuevo } = aplicarPropuesta(c, [cambio], [true], resolver(c), ids);
        expect(nuevo.escenas[0].respuestas[0].marcaIa, cambio.op).toBe(true);
        expect(nuevo.escenas[1].respuestas[0].marcaIa, cambio.op).toBe(false);
      }
    });

    it('cambiar la intensidad de una escena existente la marca', () => {
      const c = caso();
      expect(c.escenas[1].marcaIa).toBeFalsy();
      const { caso: nuevo } = aplicarPropuesta(c, [{ op: 'set-intensity', nodeId: 2, intensity: 'HIGH', warningMessage: 'Habla de violencia.' }] as Cambio[], [true], resolver(c), ids);
      expect(nuevo.escenas[1].marcaIa).toBe(true);
      expect(nuevo.escenas[0].marcaIa).toBeFalsy();
    });

    it('colocar un personaje deja a esa persona marcada; las demás no', () => {
      const c = caso();
      const { caso: nuevo } = aplicarPropuesta(c, [{ op: 'place-character', mapId: 2, characterId: personaje1, x: 300, y: 350, expression: 'alegre' }] as Cambio[], [true], resolver(c), ids);
      const personas = nuevo.salas.find((s) => s.id === 'consultorio')!.personajes;
      expect(personas.at(-1)!.marcaIa).toBe(true);
      expect(personas.slice(0, -1).every((p) => !p.marcaIa)).toBe(true);
    });

    it('mover algo lo marca', () => {
      const c = caso();
      const { caso: nuevo } = aplicarPropuesta(c, [{ op: 'move', objectId: 1, x: 400, y: 300 }] as Cambio[], [true], resolver(c), ids);
      expect(nuevo.salas[0].muebles[0].marcaIa).toBe(true);
      expect(nuevo.salas[0].muebles[1].marcaIa).toBeFalsy();
    });
  });

  it('con los mismos ids de entrada da el mismo resultado (el store la vuelve a aplicar si otro cambio falla)', () => {
    const c = caso();
    const cambios = [escenaNueva('nueva-1'), linea('nueva-1')];
    const generar = () => { let n = 0; return (prefijo: string) => `${prefijo}-fijo${n++}`; };
    const a = aplicarPropuesta(c, cambios, [true, true], resolver(c), generar());
    const b = aplicarPropuesta(c, cambios, [true, true], resolver(c), generar());
    expect(a.caso).toEqual(b.caso);
  });

  it('varias escenas nuevas desde la misma escena no quedan encima de otra', () => {
    const c = caso();
    const r = (texto: string) => respuesta(2, { text: texto, targetNodeId: 'nueva-1' });
    const { caso: nuevo } = aplicarPropuesta(c, [
      escenaNueva('nueva-1', { afterNodeId: 2 }), escenaNueva('nueva-2', { afterNodeId: 2 }), escenaNueva('nueva-3', { afterNodeId: 2 }), r('A'),
    ] as Cambio[], [true, true, true, true], resolver(c), ids);
    const cajas = nuevo.escenas.map((e) => e.posicion);
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        expect(Math.abs(cajas[i].x - cajas[j].x) < ANCHO_ESCENA && Math.abs(cajas[i].y - cajas[j].y) < ALTO_ESCENA).toBe(false);
      }
    }
  });

  it('las dependencias encadenadas se cuentan completas', () => {
    const cambios: Cambio[] = [escenaNueva('nueva-1'), escenaNueva('nueva-2', { afterNodeId: 'nueva-1' }), linea('nueva-2')];
    expect(dependencias(cambios)).toEqual([[], [0], [1, 0]]);
  });
});

describe('describirCambio', () => {
  it('cada parte se dice con nombres del caso y sin números ni palabras técnicas', () => {
    const c = caso();
    const r = resolver(c);
    const cambios: Cambio[] = [
      escenaNueva('nueva-1'),
      linea(1),
      respuesta(1, { targetNodeId: 'nueva-1' }),
      { op: 'place-character', mapId: 1, characterId: personaje1, x: 300, y: 350, expression: 'preocupada' },
      { op: 'add-ending', key: 'k', title: 'Final X', message: 'Texto.', tone: 'neutral', when: null },
      { op: 'set-intensity', nodeId: 1, intensity: 'HIGH', warningMessage: 'Aviso' },
    ];
    const textos = cambios.map((x) => describirCambio(c, x, cambios, r));
    expect(textos[0]).toBe('Escena nueva «Dudar en la espera»');
    expect(textos[2]).toContain('lleva a «Dudar en la espera»');
    expect(textos[4]).toContain('llega cuando no se cumple ningún otro');
    expect(textos[5]).toContain('intensidad alta');
    for (const t of textos) expect(t).not.toMatch(/\bnodo\b|\bID\b|nueva-\d|undefined|\[object/i);
  });

  it('A8 · la expresión se dice con su nombre del kit, no con la clave cruda', () => {
    const c = caso();
    const r = resolver(c);
    const dicha = describirCambio(c, linea(1, { expression: 'en-crisis' }), [], r);
    expect(dicha).toContain('(en crisis)');
    expect(dicha).not.toContain('en-crisis');
    expect(describirCambio(c, linea(1, { expression: 'preocupada' }), [], r)).toContain('(preocupada)');
  });
});
