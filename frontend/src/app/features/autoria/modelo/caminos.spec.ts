import { estadoDeCaminos, revisarCaminos } from './caminos';
import type { CasoBorrador, Escena, Respuesta } from './caso';

const resp = (id: string, destinoId: string | null, texto = `Respuesta ${id}`): Respuesta =>
  ({ id, texto, clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: '', destinoId, marcaIa: false });

const esc = (id: string, respuestas: Respuesta[] = [], esFinal = false): Escena =>
  ({ id, titulo: `Escena ${id.toUpperCase()}`, narracion: '', salaId: 'consultorio', lineas: [], respuestas, esFinal, posicion: { x: 0, y: 0 }, intensidad: 'MEDIUM', advertencia: null });

const caso = (escenas: Escena[], inicioId: string | null = escenas[0]?.id ?? null): CasoBorrador => ({
  id: 'c', revision: 0, hitos: [], nivelRiesgo: null, titulo: 'C', lugarId: 'universidad', salas: [], escenas, inicioId, modoFinales: 'automatico', finales: [],
  personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
});

const tipos = (c: CasoBorrador) => revisarCaminos(c).map((a) => `${a.tipo}:${a.escenaId ?? '-'}`).sort();

describe('revisarCaminos', () => {
  it('un caso bien formado no tiene avisos', () => {
    expect(revisarCaminos(caso([esc('a', [resp('1', 'b'), resp('2', 'c')]), esc('b', [], true), esc('c', [], true)]))).toEqual([]);
  });

  it('sin-salida: una escena sin respuestas que no es final', () => {
    const avisos = revisarCaminos(caso([esc('a', [resp('1', 'b')]), esc('b'), esc('c', [], true)]));
    const a = avisos.find((x) => x.tipo === 'sin-salida')!;
    expect(a).toMatchObject({ escenaId: 'b', mensaje: 'La escena «Escena B» no tiene respuestas ni está marcada como final.' });
  });

  it('inalcanzable: ninguna respuesta lleva a la escena', () => {
    const avisos = revisarCaminos(caso([esc('a', [resp('1', 'b')]), esc('b', [], true), esc('c', [], true)]));
    expect(avisos).toEqual([{ tipo: 'inalcanzable', escenaId: 'c', mensaje: 'Ninguna respuesta lleva a la escena «Escena C».' }]);
  });

  it('el inicio nunca se marca como inalcanzable', () => {
    expect(tipos(caso([esc('a', [resp('1', 'b')]), esc('b', [], true)]))).toEqual([]);
  });

  it('sin-final: el caso no tiene ninguna escena final', () => {
    const avisos = revisarCaminos(caso([esc('a', [resp('1', 'b')]), esc('b', [resp('2', 'a')])]));
    expect(avisos).toContainEqual({ tipo: 'sin-final', escenaId: null, mensaje: 'Ningún camino termina en un final.' });
  });

  it('respuesta-sin-destino: una respuesta que no lleva a ninguna escena', () => {
    const avisos = revisarCaminos(caso([esc('a', [resp('1', 'b'), resp('2', null, 'Me voy')]), esc('b', [], true)]));
    expect(avisos).toEqual([{
      tipo: 'respuesta-sin-destino', escenaId: 'a', respuestaId: '2',
      mensaje: 'La respuesta «Me voy» de «Escena A» no lleva a ninguna escena.',
    }]);
  });

  it('sin-inicio: el caso no tiene escena de inicio', () => {
    const avisos = revisarCaminos(caso([esc('a', [], true)], null));
    expect(avisos).toContainEqual({ tipo: 'sin-inicio', escenaId: null, mensaje: 'El caso no tiene escena de inicio.' });
  });

  it('un ciclo no cuelga el revisor y su escena sin final se avisa', () => {
    // a → b → a, y el final f existe pero no se llega a él.
    const c = caso([esc('a', [resp('1', 'b')]), esc('b', [resp('2', 'a')]), esc('f', [], true)]);
    const avisos = revisarCaminos(c);
    expect(tipos(c)).toEqual(['inalcanzable:f', 'sin-final:a', 'sin-final:b']);
    expect(avisos.find((x) => x.escenaId === 'a')!.mensaje).toBe('Desde «Escena A» ningún camino termina en un final.');
  });

  it('una escena sin salida no arrastra avisos de «sin final» a las anteriores', () => {
    const c = caso([esc('a', [resp('1', 'b'), resp('2', 'f')]), esc('b'), esc('f', [], true)]);
    expect(tipos(c)).toEqual(['sin-salida:b']);
  });

  it('una respuesta sin texto se nombra como «sin escribir»', () => {
    const avisos = revisarCaminos(caso([esc('a', [resp('1', null, '')]), esc('b', [], true)]));
    expect(avisos.find((x) => x.tipo === 'respuesta-sin-destino')!.mensaje).toBe('La respuesta «sin escribir» de «Escena A» no lleva a ninguna escena.');
  });

  it('final-sin-hito: un final propio que espera un paso que el caso ya no declara', () => {
    const c = caso([esc('a', [resp('1', 'b')]), esc('b', [], true)]);
    c.modoFinales = 'propio';
    c.hitos = [{ clave: 'valorar', nombre: 'Valorar', descripcion: '', decisivo: true }];
    c.finales = [
      { id: 'f0', nombre: 'Con paso', texto: 'Fin', tono: 'neutral', condicion: { milestone: 'valorar' }, marcaIa: false },
      { id: 'f1', nombre: 'Cierre', texto: 'Fin', tono: 'neutral', condicion: { all: [{ not: { milestone: 'borrado' } }] }, marcaIa: false },
    ];
    expect(revisarCaminos(c)).toEqual([
      { tipo: 'final-sin-hito', escenaId: null, mensaje: 'El final «Cierre» espera un paso del caso que ya no existe.' },
    ]);
  });

  it('en modo automático los finales guardados no generan avisos', () => {
    const c = caso([esc('a', [resp('1', 'b')]), esc('b', [], true)]);
    c.finales = [{ id: 'f1', nombre: 'Cierre', texto: 'Fin', tono: 'neutral', condicion: { milestone: 'borrado' }, marcaIa: false }];
    expect(revisarCaminos(c)).toEqual([]);
  });
});

describe('estadoDeCaminos', () => {
  it('sin avisos dice que todos los caminos llegan a un final', () => {
    expect(estadoDeCaminos(caso([esc('a', [resp('1', 'b')]), esc('b', [], true)]))).toBe('Todos los caminos del caso llegan a alguna escena final.');
  });

  it('con un callejón no dice que todo llega a un final', () => {
    const c = caso([esc('a', [resp('1', 'b'), resp('2', 'c')]), esc('b', [], true), esc('c')]);
    expect(estadoDeCaminos(c)).toBe('Hay 1 aviso en los caminos del caso. Revísalo en el mapa.');
    c.escenas[0].respuestas.push(resp('3', null));
    expect(estadoDeCaminos(c)).toBe('Hay 2 avisos en los caminos del caso. Revísalos en el mapa.');
  });
});
