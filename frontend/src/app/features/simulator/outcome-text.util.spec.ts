import { levelWord, milestoneMark, missedFactPhrase, missedFactsText, responseClassWord } from './outcome-text.util';

// req: RN-08, RN-09 (el cierre habla en palabras, nunca en cifras)
describe('outcome-text.util', () => {
  it('la clase de una respuesta sale en palabras', () => {
    expect(responseClassWord('RECOMMENDED')).toBe('Recomendada');
    expect(responseClassWord('ACCEPTABLE')).toBe('Aceptable');
    expect(responseClassWord('RISKY')).toBe('Con riesgo');
    expect(responseClassWord('CONTRAINDICATED')).toBe('Contraindicada');
  });

  it('el nivel de una competencia sale en palabras y, sin nivel, «Sin evidencia»', () => {
    expect(levelWord('EN_INICIO')).toBe('En inicio');
    expect(levelWord('EN_PROCESO')).toBe('En proceso');
    expect(levelWord('LOGRADO')).toBe('Logrado');
    expect(levelWord('DESTACADO')).toBe('Destacado');
    expect(levelWord(null)).toBe('Sin evidencia');
  });

  it('un hito decisivo lleva la palabra «clave»; los demás, nada', () => {
    expect(milestoneMark({ decisive: true })).toBe('clave');
    expect(milestoneMark({ decisive: false })).toBeNull();
  });

  it('un texto que no es una clase ni un nivel conocido (reporte antiguo) devuelve nulo', () => {
    expect(responseClassWord('ADEQUATE')).toBeNull();
    expect(responseClassWord(undefined)).toBeNull();
    expect(levelWord('MEDIO')).toBeNull();
  });

  it('ninguna palabra lleva dígitos ni lenguaje de puntaje', () => {
    const words = [
      responseClassWord('RECOMMENDED'), responseClassWord('RISKY'), levelWord('LOGRADO'), levelWord(null), milestoneMark({ decisive: true }),
    ].join(' ');
    expect(words).not.toMatch(/\d|puntaje|estrés|desempeño/i);
  });

  it('lo que faltó explorar se dice con un verbo por tipo de hecho', () => {
    expect(missedFactPhrase({ kind: 'talked', key: 'a', label: 'la enfermera' })).toBe('hablar con la enfermera');
    expect(missedFactPhrase({ kind: 'inspected', key: 'a', label: 'el informe' })).toBe('revisar el informe');
    expect(missedFactPhrase({ kind: 'has', key: 'a', label: 'la llave' })).toBe('tener la llave');
    expect(missedFactPhrase({ kind: 'used', key: 'a', label: 'la guía' })).toBe('usar la guía');
  });

  it('las frases se unen con comas y una «y» antes de la última', () => {
    const f = (label: string) => ({ kind: 'has' as const, key: label, label });
    expect(missedFactsText([])).toBe('');
    expect(missedFactsText([f('A')])).toBe('tener A');
    expect(missedFactsText([f('A'), f('B')])).toBe('tener A y tener B');
    expect(missedFactsText([f('A'), f('B'), f('C')])).toBe('tener A, tener B y tener C');
  });
});
