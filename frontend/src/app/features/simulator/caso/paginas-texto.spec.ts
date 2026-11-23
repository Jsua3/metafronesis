import { describe, expect, it } from 'vitest';

import { frasesDe, paginarSiNoCabe, partirEnPaginas } from './paginas-texto';

describe('paginas-texto: un parlamento largo se parte en páginas por frases (U1, V5)', () => {
  it('separa las frases con su puntuación y lo que las cierra, y unidas dan el texto', () => {
    const texto = '(Baja la voz.) Está bien. ¿Quién es usted? «No sé…» Sigamos';
    expect(frasesDe(texto)).toEqual(['(Baja la voz.) ', 'Está bien. ', '¿Quién es usted? ', '«No sé…» ', 'Sigamos']);
    expect(frasesDe(texto).join('')).toBe(texto);
  });

  it('un texto sin puntuación es una sola frase', () => {
    expect(frasesDe('sin punto final')).toEqual(['sin punto final']);
  });

  it('agrupa tantas frases enteras como quepan según la medida de quien llama', () => {
    const texto = 'Uno dos. Tres cuatro. Cinco seis. Siete ocho.';
    // «Cabe» hasta 23 caracteres: dos frases por página.
    expect(partirEnPaginas(texto, pagina => pagina.length <= 23)).toEqual(['Uno dos. Tres cuatro.', 'Cinco seis. Siete ocho.']);
  });

  it('si todo cabe, una sola página con el texto entero', () => {
    const texto = 'Corto. Muy corto.';
    expect(partirEnPaginas(texto, () => true)).toEqual([texto]);
  });

  it('una frase que no cabe ni sola va sola en su página: no se corta a media frase', () => {
    const larga = 'Esta frase es más larga que cualquier página posible.';
    expect(partirEnPaginas(`Hola. ${larga} Adiós.`, pagina => pagina.length <= 10)).toEqual(['Hola.', larga, 'Adiós.']);
  });

  it('las páginas unidas conservan todo el texto', () => {
    const texto = 'Primera frase. Segunda frase algo más larga. Tercera. ¿Cuarta? ¡Quinta!';
    const paginas = partirEnPaginas(texto, pagina => pagina.length <= 30);
    expect(paginas.length).toBeGreaterThan(1);
    expect(paginas.join(' ')).toBe(texto);
  });
});

describe('paginarSiNoCabe: se pagina solo lo que de verdad no cabe (V6, living-world.e2e.ts:101)', () => {
  // Una placa de 35 caracteres por renglón y 24 px por renglón.
  const renglon = 24;
  const alto = (pagina: string) => Math.ceil(pagina.length / 35) * renglon;
  const abuela = '¡Déjenme pasar! ¡Quiero ver a mi nieta y a mi hija! ¿Por qué nadie nos dice nada?';

  it('nunca parte un texto que cabe entero (la línea de la abuela, tres renglones en una placa de tres)', () => {
    expect(paginarSiNoCabe(abuela, 3 * renglon, renglon, alto)).toEqual([abuela]);
  });

  it('pagina solo cuando de verdad no cabe', () => {
    expect(paginarSiNoCabe(abuela, 2 * renglon, renglon, alto).length).toBeGreaterThan(1);
  });

  it('cada página se llena antes de abrir la siguiente', () => {
    const largo = Array.from({ length: 9 }, (_, i) => `Frase número ${i + 1} del parlamento.`).join(' ');
    const disponible = 4 * renglon;
    const tope = disponible - renglon;
    const paginas = paginarSiNoCabe(largo, disponible, renglon, alto);
    expect(paginas.join(' ')).toBe(largo);
    paginas.forEach((pagina, i) => {
      expect(alto(pagina)).toBeLessThanOrEqual(tope);
      const siguiente = paginas[i + 1];
      // Con la primera frase de la página siguiente, esta ya no cabría: estaba llena.
      if (siguiente) expect(alto(`${pagina} ${frasesDe(siguiente)[0].trim()}`)).toBeGreaterThan(tope);
    });
  });

  it('con poco sitio, páginas de al menos dos renglones', () => {
    const paginas = paginarSiNoCabe(abuela, renglon, renglon, alto);
    paginas.forEach(pagina => expect(alto(pagina)).toBeLessThanOrEqual(2 * renglon));
    expect(paginas.join(' ')).toBe(abuela);
  });
});
