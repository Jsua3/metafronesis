import { placeHint } from './place-hint.util';

describe('place-hint.util', () => {
  // Coordenadas reales del seed (seed_caso_pdf.py): márgenes ≥ 10 px respecto a los bordes de banda.
  const seed: Array<[string, number, number, string]> = [
    ['tool-pap', 318, 428, 'a la izquierda, al frente'],
    ['familia-crisis', 190, 420, 'en el extremo izquierdo, al frente'],
    ['enfermera-urgencias', 560, 330, 'en el centro, al fondo'],
    ['marco-normativo-hospital', 660, 320, 'a la derecha, al fondo'],
    ['psicologa-acompanante', 740, 400, 'a la derecha, al frente'],
    ['expediente-caso', 740, 312, 'a la derecha, al fondo'],
    ['marco-normativo-comisaria', 790, 318, 'en el extremo derecho, al fondo'],
    ['profesional-psicosocial', 700, 400, 'a la derecha, al frente'],
  ];

  it.each(seed)('%s (%d,%d) → %s', (_key, x, y, expected) => {
    expect(placeHint(x, y)).toBe(expected);
  });

  it('las puertas se describen por el lado: «puerta en el extremo derecho»', () => {
    expect(placeHint(838, 440, { door: true })).toBe('puerta en el extremo derecho');
    expect(placeHint(122, 460, { door: true })).toBe('puerta en el extremo izquierdo');
    expect(placeHint(480, 300, { door: true })).toBe('puerta en el centro');
  });

  it('bordes de banda horizontal: el límite inferior pertenece a la banda siguiente', () => {
    const horizontal: Array<[number, string]> = [
      [0, 'en el extremo izquierdo'], [199, 'en el extremo izquierdo'],
      [200, 'a la izquierda'], [399, 'a la izquierda'],
      [400, 'en el centro'], [599, 'en el centro'],
      [600, 'a la derecha'], [759, 'a la derecha'],
      [760, 'en el extremo derecho'], [960, 'en el extremo derecho'],
    ];
    for (const [x, expected] of horizontal) expect(placeHint(x, 400)).toBe(`${expected}, al frente`);
  });

  it('bordes de banda vertical: y < 360 es «al fondo»; desde 360, «al frente»', () => {
    expect(placeHint(480, 0)).toBe('en el centro, al fondo');
    expect(placeHint(480, 359)).toBe('en el centro, al fondo');
    expect(placeHint(480, 360)).toBe('en el centro, al frente');
    expect(placeHint(480, 540)).toBe('en el centro, al frente');
  });

  it('es estable (misma entrada, misma salida) y tolera valores no finitos', () => {
    expect(placeHint(318, 428)).toBe(placeHint(318, 428));
    expect(placeHint(Number.NaN, 10)).toBe('en la sala');
    expect(placeHint(10, Number.POSITIVE_INFINITY, { door: true })).toBe('en la sala');
  });

  it('nunca devuelve un identificador interno ni vocabulario de logro', () => {
    for (const x of [0, 150, 300, 500, 700, 900]) {
      for (const y of [100, 400]) {
        expect(placeHint(x, y)).toMatch(/^(en el extremo|a la|en el centro)/);
        expect(placeHint(x, y, { door: true })).toMatch(/^puerta /);
      }
    }
  });
});
