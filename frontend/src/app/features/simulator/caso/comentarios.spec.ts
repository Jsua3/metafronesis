import { WorldComment } from '../../../core/models/simulation.model';
import { DURACION_BURBUJA_MS, memoriaDeComentarios, siguienteComentario } from './comentarios';

const COMENTARIO: WorldComment = { id: '7-0', objectKey: 'abuela', line: 'Hola', emotion: null, gesture: null };

function almacenFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    datos,
  };
}

it('la burbuja dura 6 s', () => {
  expect(DURACION_BURBUJA_MS).toBe(6000);
});

it('sale un comentario por acercamiento, en el orden del documento, y no se repite', () => {
  const lista = [{ ...COMENTARIO, id: '7-0' }, { ...COMENTARIO, id: '7-1' }, { ...COMENTARIO, id: '7-2', objectKey: 'otra' }];
  const memoria = memoriaDeComentarios('a1', almacenFalso());
  expect(siguienteComentario(lista, 'abuela', memoria.dichos())!.id).toBe('7-0');
  memoria.marcar('7-0');
  expect(siguienteComentario(lista, 'abuela', memoria.dichos())!.id).toBe('7-1');
  memoria.marcar('7-1');
  expect(siguienteComentario(lista, 'abuela', memoria.dichos())).toBeNull();
  expect(siguienteComentario(lista, 'otra', memoria.dichos())!.id).toBe('7-2');
  expect(siguienteComentario([], 'abuela', memoria.dichos())).toBeNull();
});

it('la memoria sobrevive a recargar en la misma pestaña y no rompe sin almacenamiento', () => {
  const almacen = almacenFalso();
  memoriaDeComentarios('a1', almacen).marcar('7-0');
  expect(almacen.datos.has('siep_comentarios_a1')).toBe(true);
  expect(memoriaDeComentarios('a1', almacen).dichos().has('7-0')).toBe(true);
  expect(memoriaDeComentarios('a2', almacen).dichos().has('7-0')).toBe(false);
  const roto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('quota'); } };
  const memoria = memoriaDeComentarios('a1', roto);
  memoria.marcar('7-0');
  expect(memoria.dichos().has('7-0')).toBe(true);
});

it('un JSON roto o de otra forma se lee como vacío', () => {
  for (const basura of ['{no', '"x"', '{"a":1}', '[1,2]']) {
    const almacen = almacenFalso();
    almacen.datos.set('siep_comentarios_a1', basura);
    expect(memoriaDeComentarios('a1', almacen).dichos().size).toBe(0);
  }
});

it('sin almacenamiento explícito usa sessionStorage y sigue funcionando si es null', () => {
  const memoria = memoriaDeComentarios('a9', null);
  memoria.marcar('1-0');
  expect(memoria.dichos().has('1-0')).toBe(true);
});
