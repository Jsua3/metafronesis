import { Assignment } from '../../core/models/assignment.model';
import { enSecuencia, fraseDeSecuencia, haceEsperar, lineaDeSecuencia, previaDelUltimo, tituloDe } from './secuencia.util';

const a = (id: number, partial: Partial<Assignment> = {}): Assignment => ({
  id, caseId: id, caseVersionId: id + 100, caseTitle: `Caso ${id}`, target: { type: 'GROUP', groupId: 1 }, state: 'OPEN', active: true, sortOrder: id, ...partial,
});

/** La secuencia que ve el docente dice lo mismo que aplica el servidor (`apps/progression/access.py`, RN-04). */
// req: RN-04, RF-15
describe('secuencia de casos del grupo', () => {
  it('desempata versiones clonadas por el id del caso', () => {
    const lista = [a(2, { sortOrder: 0, caseId: 2, caseVersionId: 2 }), a(1, { sortOrder: 0, caseId: 1, caseVersionId: 100 })];
    expect(enSecuencia(lista).map(item => item.id)).toEqual([1, 2]);
  });
  it('ordena por el orden y, a igual orden, por el caso (como el servidor)', () => {
    const lista = [a(3, { sortOrder: 0 }), a(2, { sortOrder: 0 }), a(1, { sortOrder: 5 })];
    expect(enSecuencia(lista).map(item => item.id)).toEqual([2, 3, 1]);
  });

  it('no modifica la lista original', () => {
    const lista = [a(2), a(1)];
    enSecuencia(lista);
    expect(lista.map(item => item.id)).toEqual([2, 1]);
  });

  it('un caso en pausa o con la ventana cerrada no hace esperar; uno programado sí', () => {
    expect(haceEsperar(a(1))).toBe(true);
    expect(haceEsperar(a(1, { state: 'SCHEDULED' }))).toBe(true);
    expect(haceEsperar(a(1, { active: false }))).toBe(false);
    expect(haceEsperar(a(1, { state: 'CLOSED' }))).toBe(false);
  });

  it('el caso nuevo va después del último que hace esperar', () => {
    expect(previaDelUltimo([a(1), a(2), a(3, { state: 'CLOSED' }), a(4, { active: false })])?.id).toBe(2);
    expect(previaDelUltimo([a(1, { active: false })])).toBeNull();
    expect(previaDelUltimo([])).toBeNull();
  });

  it('nombra el caso por su título y, sin él, no inventa uno', () => {
    expect(tituloDe(a(1))).toBe('Caso 1');
    expect(tituloDe(a(1, { caseTitle: null }), new Map([[101, 'Del catálogo']]))).toBe('Del catálogo');
    expect(tituloDe(a(1, { caseTitle: null }))).toBe('el caso anterior');
  });

  it('dice cuándo lo podrán empezar, con y sin caso previo', () => {
    expect(fraseDeSecuencia('Violencia Familiar')).toBe('Tus estudiantes lo harán después de terminar «Violencia Familiar».');
    expect(fraseDeSecuencia(null)).toBe('Tus estudiantes pueden empezarlo de inmediato.');
    expect(fraseDeSecuencia(null, true)).toBe('No hay otro caso por terminar antes: tus estudiantes podrán empezarlo cuando se abra.');
    expect(fraseDeSecuencia('X', true)).toBe('Tus estudiantes lo harán después de terminar «X».');
  });

  it('una línea por caso: el primero se abre ya, los demás tras el anterior que cuenta', () => {
    const ordenadas = [a(1), a(2, { active: false }), a(3, { state: 'CLOSED' }), a(4)];
    expect(lineaDeSecuencia(ordenadas)).toEqual([
      'Primer caso: se puede empezar de inmediato.',
      'En pausa: no cuenta en la secuencia.',
      'Ya cerró: no hace esperar a los siguientes.',
      'Se abre al terminar «Caso 1».',
    ]);
  });
});
