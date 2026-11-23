import { MAX_LARGO_TEMA, MAX_TEMAS, normalizarTemas, problemaDeTema } from './temas-sensibles';

describe('temas sensibles del caso', () => {
  it('normaliza: sin espacios sobrantes, sin vacíos y sin repetidos aunque cambien las mayúsculas', () => {
    expect(normalizarTemas(['  Violencia  de pareja ', '', 'violencia de pareja', 'Riesgo de feminicidio'])).toEqual([
      'Violencia de pareja', 'Riesgo de feminicidio',
    ]);
  });

  it('un tema vacío no es un error: simplemente no se agrega', () => {
    expect(problemaDeTema('   ', [])).toBeNull();
  });

  it('dice el tope de caracteres, las etiquetas, los enlaces y los repetidos', () => {
    expect(problemaDeTema('a'.repeat(MAX_LARGO_TEMA + 1), [])).toContain(`${MAX_LARGO_TEMA} caracteres`);
    expect(problemaDeTema('<b>riesgo</b>', [])).toContain('sin etiquetas');
    expect(problemaDeTema('mira https://x.co', [])).toContain('sin enlaces');
    expect(problemaDeTema('RIESGO', ['riesgo'])).toContain('ya está');
  });

  it('dice el tope de temas', () => {
    const ocho = Array.from({ length: MAX_TEMAS }, (_, i) => `Tema ${i}`);
    expect(problemaDeTema('Otro', ocho)).toContain(`${MAX_TEMAS} temas`);
    expect(problemaDeTema('Otro', ocho.slice(1))).toBeNull();
  });
});
