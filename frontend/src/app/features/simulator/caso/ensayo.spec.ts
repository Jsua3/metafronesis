import { readFileSync } from 'fs';
import { join } from 'path';

import type { Milestone, RehearsalBlock, RehearsalComment, RehearsalOption } from '../../../core/models/simulation.model';
import { armarPanel, cuerpoExplorado, escenaDesde, debeConfirmarEnsayo, estadoComentario, palabraDeActivacion, palabraDeVinculo, porQueNoAparece, reintentarSinDesde, veredictoDeLectura } from './ensayo';

describe('escenaDesde', () => {
  it.each([['33', 33], ['1', 1], [null, null], [undefined, null], ['', null], ['abc', null], ['0', null], ['-2', null], ['3.5', null]] as const)(
    '«%s» da %s', (raw, esperado) => expect(escenaDesde(raw)).toBe(esperado));
});

describe('debeConfirmarEnsayo', () => {
  it('solo en modo ensayo y ante un 403, 404 o 409', () => {
    for (const status of [403, 404, 409]) expect(debeConfirmarEnsayo('rehearsal', { status })).toBe(true);
    for (const status of [0, 400, 500]) expect(debeConfirmarEnsayo('rehearsal', { status })).toBe(false);
    expect(debeConfirmarEnsayo('student', { status: 403 })).toBe(false);
    expect(debeConfirmarEnsayo('rehearsal', new Error('x'))).toBe(false);
    expect(debeConfirmarEnsayo('rehearsal', null)).toBe(false);
  });
});

describe('veredictoDeLectura', () => {
  it('distingue el ensayo descartado del cerrado, por el código y no por el texto', () => {
    expect(veredictoDeLectura({ status: 404, error: { code: 'REHEARSAL_GONE' } })).toBe('perdido');
    expect(veredictoDeLectura({ status: 409, error: { code: 'REHEARSAL_CLOSED' } })).toBe('cerrado');
    expect(veredictoDeLectura({ status: 404, error: {} })).toBeNull();
    expect(veredictoDeLectura({ status: 403, error: { code: 'REHEARSAL_GONE' } })).toBeNull();
    expect(veredictoDeLectura({ status: 409, error: null })).toBeNull();
    expect(veredictoDeLectura(null)).toBeNull();
  });
});

describe('reintentarSinDesde', () => {
  it('solo un 400 con una escena pedida', () => {
    expect(reintentarSinDesde(33, { status: 400 })).toBe(true);
    expect(reintentarSinDesde(null, { status: 400 })).toBe(false);
    expect(reintentarSinDesde(33, { status: 500 })).toBe(false);
  });
});

const OPCION: RehearsalOption = { id: 41, text: 'Quedarse y explicar', offered: true, missing: [], retainedBy: null };
const COMENTARIO: RehearsalComment = { index: 0, personaje: 'enfermera', line: 'Está muy callada.', due: true, retainedBy: null, missing: [] };

const BLOQUE: RehearsalBlock = {
  sceneId: 7,
  options: [OPCION, { ...OPCION, id: 42, text: 'Derivar', offered: false, retainedBy: 'condition' }],
  comments: [COMENTARIO],
  warnings: ['Una respuesta no lleva a ninguna escena.'],
  persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
  milestones: ['escucha'],
  path: [{ nodeId: 3, title: 'Urgencias' }, { nodeId: 7, title: 'Sala de escucha' }],
  explored: { talked: ['enfermera'], inspected: [], has: [], used: ['PAP'] },
  explorable: [
    { kind: 'talked', key: 'enfermera', label: 'Enfermera' },
    { kind: 'inspected', key: 'carpeta', label: 'Carpeta' },
    { kind: 'has', key: 'PAP', label: 'PAP' },
    { kind: 'used', key: 'PAP', label: 'PAP' },
  ],
  scenes: [
    { id: 3, key: 'a', title: 'Urgencias', start: true, terminal: false },
    { id: 7, key: 'b', title: 'Sala de escucha', start: false, terminal: false },
  ],
};
const HITOS: Milestone[] = [
  { key: 'escucha', label: 'Escuchar sin juzgar', description: '', decisive: false },
  { key: 'remision', label: 'Remitir', description: '', decisive: true },
];

describe('porQueNoAparece', () => {
  it('explica por qué no aparece cada respuesta', () => {
    expect(porQueNoAparece({ ...OPCION, offered: false, retainedBy: 'facts', missing: [{ kind: 'talked', key: 'enf', label: 'Enfermera' }, { kind: 'used', key: 'PAP', label: 'PAP' }] }))
      .toBe('Le falta: hablar con Enfermera y usar PAP');
    expect(porQueNoAparece({ ...OPCION, offered: false, retainedBy: 'condition', missing: [] }))
      .toBe('La retiene otra parte de la condición: un hito, un conteo o el estado de la persona.');
    expect(porQueNoAparece({ ...OPCION, offered: false, retainedBy: 'broken', missing: [] }))
      .toBe('El requisito guardado está roto: revísalo en el guion.');
  });
});

describe('estadoComentario', () => {
  it('dice cuándo se dirá y, si no, por qué todavía no', () => {
    expect(estadoComentario(COMENTARIO)).toBe('Se dirá al acercarte.');
    expect(estadoComentario({ ...COMENTARIO, due: false, retainedBy: 'condition', missing: [{ kind: 'inspected', key: 'carpeta', label: 'Carpeta' }] }))
      .toBe('Todavía no: le falta revisar Carpeta');
    expect(estadoComentario({ ...COMENTARIO, due: false, retainedBy: 'condition', missing: [] }))
      .toBe('La retiene otra parte de la condición: un hito, un conteo o el estado de la persona.');
    expect(estadoComentario({ ...COMENTARIO, due: false, retainedBy: 'broken' })).toBe('Su condición está mal escrita: revísala en el guion.');
    expect(estadoComentario({ ...COMENTARIO, due: false, retainedBy: 'absent' })).toBe('Su personaje no está visible en esta sala.');
  });
});

describe('armarPanel', () => {
  const panel = armarPanel(BLOQUE, { hitosDeclarados: HITOS });

  it('toma las escenas, las casillas y el camino del servidor (no de listas globales)', () => {
    expect(panel.escenaId).toBe(7);
    expect(panel.escenas).toEqual([{ id: 3, title: 'Urgencias' }, { id: 7, title: 'Sala de escucha' }]);
    expect(panel.explorado.map(c => [c.kind, c.key, c.marcada])).toEqual([
      ['talked', 'enfermera', true], ['inspected', 'carpeta', false], ['has', 'PAP', false], ['used', 'PAP', true],
    ]);
    expect(panel.camino).toEqual(['Urgencias', 'Sala de escucha']);
    expect(panel.avisos).toEqual(['Una respuesta no lleva a ninguna escena.']);
  });

  it('los hitos son los declarados, con su cumplimiento; la persona va en palabras', () => {
    expect(panel.hitos).toEqual([{ key: 'escucha', label: 'Escuchar sin juzgar', cumplido: true }, { key: 'remision', label: 'Remitir', cumplido: false }]);
    expect(panel.persona).toEqual({ bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' });
  });

  it('solo las respuestas que no se ofrecen traen su porqué; los comentarios, su estado', () => {
    expect(panel.ocultas).toEqual([{ id: 42, text: 'Derivar', porQue: 'La retiene otra parte de la condición: un hito, un conteo o el estado de la persona.' }]);
    expect(panel.comentarios).toEqual([{ index: 0, personaje: 'enfermera', line: 'Está muy callada.', estado: 'Se dirá al acercarte.' }]);
  });

  it('sin hitos declarados (el editor no cargó) usa las claves cumplidas', () => {
    expect(armarPanel(BLOQUE, { hitosDeclarados: [] }).hitos).toEqual([{ key: 'escucha', label: 'escucha', cumplido: true }]);
  });
});

describe('cuerpoExplorado', () => {
  const panel = armarPanel(BLOQUE, { hitosDeclarados: HITOS });

  it('marcar una casilla manda lo explorado completo de la sala con el cambio', () => {
    expect(cuerpoExplorado(panel, { kind: 'inspected', key: 'carpeta', marcada: true }))
      .toEqual({ talked: ['enfermera'], inspected: ['carpeta'], has: [], used: ['PAP'] });
  });

  it('desmarcar quita solo esa clave de ese tipo (la misma clave en otro tipo se queda)', () => {
    expect(cuerpoExplorado(panel, { kind: 'used', key: 'PAP', marcada: false }))
      .toEqual({ talked: ['enfermera'], inspected: [], has: [], used: [] });
  });
});

describe('palabras de la persona', () => {
  it('vínculo y activación en palabras', () => {
    expect(['WITHDRAWN', 'GUARDED', 'OPEN'].map(b => palabraDeVinculo(b as never))).toEqual(['Retraída', 'Cautelosa', 'Abierta']);
    expect(['CALM', 'TENSE', 'CRISIS'].map(a => palabraDeActivacion(a as never))).toEqual(['Serena', 'Tensa', 'En crisis']);
  });
});

it('ensayo.ts es puro: ni Angular ni Phaser', () => {
  expect(readFileSync(join(__dirname, 'ensayo.ts'), 'utf-8')).not.toMatch(/from '@angular|from 'phaser'/);
});
