import { WorldComment } from '../../../core/models/simulation.model';
import { conComentario, ESPERA_REPETIR_MS, reaccionAlAcercarse } from './cercania';

const COMENTARIO: WorldComment = { id: '7-0', objectKey: 'abuela', line: 'Hola', emotion: null, gesture: null };

it.each([
  ['CALM', { mirar: true, gesto: null }],
  ['TENSE', { mirar: true, gesto: 'se-aparta' }],
  ['CRISIS', { mirar: false, gesto: 'se-agita' }],
] as const)('la consultante %s', (activation, reaccion) => {
  expect(reaccionAlAcercarse({ esConsultante: true, activation })).toEqual(reaccion);
});

it('los demás solo voltean, y el gesto de un comentario manda', () => {
  const base = reaccionAlAcercarse({ esConsultante: false, activation: 'CRISIS' });
  expect(base).toEqual({ mirar: true, gesto: null });
  expect(conComentario(base, { ...COMENTARIO, gesture: 'baja-la-mirada' })).toEqual({ mirar: true, gesto: 'baja-la-mirada' });
  expect(conComentario(base, { ...COMENTARIO, gesture: 'vuela' })).toEqual(base);
  expect(conComentario(base, { ...COMENTARIO, gesture: null })).toEqual(base);
});

it('el gesto del comentario reemplaza el de la consultante en tensión', () => {
  const base = reaccionAlAcercarse({ esConsultante: true, activation: 'TENSE' });
  expect(conComentario(base, { ...COMENTARIO, gesture: 'asiente' })).toEqual({ mirar: true, gesto: 'asiente' });
});

it('la espera para repetir es de 4 s', () => {
  expect(ESPERA_REPETIR_MS).toBe(4000);
});
