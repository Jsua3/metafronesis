import { partirNotaDeTransicion } from './nota-transicion';

// Bloque U1 (variante B): la tarjeta de capítulo lleva la pestaña «Capítulo n» sobre la placa del texto.
describe('partirNotaDeTransicion', () => {
  it('con el prefijo «Capítulo <n> · » separa la pestaña del texto', () => {
    expect(partirNotaDeTransicion('Capítulo 2 · La noticia. Hospital, madrugada.')).toEqual({
      capitulo: 'Capítulo 2',
      texto: 'La noticia. Hospital, madrugada.',
    });
  });

  it('acepta números de varias cifras y espacios de más', () => {
    expect(partirNotaDeTransicion('Capítulo 12  ·  Quince días después')).toEqual({ capitulo: 'Capítulo 12', texto: 'Quince días después' });
  });

  it('sin el prefijo todo va en la placa y no hay pestaña', () => {
    expect(partirNotaDeTransicion('Quince días después…')).toEqual({ capitulo: null, texto: 'Quince días después…' });
    expect(partirNotaDeTransicion('Capítulo dos · La noticia')).toEqual({ capitulo: null, texto: 'Capítulo dos · La noticia' });
  });

  it('una nota vacía no inventa pestaña', () => {
    expect(partirNotaDeTransicion('')).toEqual({ capitulo: null, texto: '' });
  });
});
