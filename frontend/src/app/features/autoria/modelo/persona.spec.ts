import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS, fraseDePaso, fraseDeRespuesta, pasoDeRespuesta } from './persona';
import { nuevaRespuesta } from './fabricas';

describe('lo que le pasa a la persona, en palabras', () => {
  it('nombra el vínculo y la activación con las palabras del modelo, sin cifras', () => {
    expect(VINCULO_EN_PALABRAS).toEqual({ WITHDRAWN: 'retraída', GUARDED: 'cautelosa', OPEN: 'abierta' });
    expect(ACTIVACION_EN_PALABRAS).toEqual({ CALM: 'serena', TENSE: 'tensa', CRISIS: 'en crisis' });
  });

  it('un paso se dice como se abre, se cierra, se calma o se tensa', () => {
    expect(fraseDePaso(1, -1)).toBe('se abre y se calma');
    expect(fraseDePaso(-1, 1)).toBe('se cierra y se tensa');
    expect(fraseDePaso(-1, 0)).toBe('se cierra');
    expect(fraseDePaso(0, 1)).toBe('se tensa');
    expect(fraseDePaso(0, 0)).toBe('se queda como estaba');
  });

  it('en modo automático la persona reacciona según la clase de la respuesta', () => {
    expect(fraseDeRespuesta(nuevaRespuesta('r', null, { clase: 'RECOMMENDED' }))).toBe('se abre y se calma');
    expect(fraseDeRespuesta(nuevaRespuesta('r', null, { clase: 'ACCEPTABLE' }))).toBe('se queda como estaba');
    expect(fraseDeRespuesta(nuevaRespuesta('r', null, { clase: 'RISKY' }))).toBe('se cierra');
    expect(fraseDeRespuesta(nuevaRespuesta('r', null, { clase: 'CONTRAINDICATED' }))).toBe('se cierra y se tensa');
    expect(fraseDeRespuesta(nuevaRespuesta('r', null))).toBeNull(); // sin clase no hay nada que decir
  });

  it('en modo propio manda lo que eligió la docente y lo que no tocó queda igual', () => {
    const propia = nuevaRespuesta('r', null, { clase: 'RECOMMENDED', efectos: { persona: { bond: -1 } } });
    expect(pasoDeRespuesta(propia)).toEqual([-1, 0]);
    expect(fraseDeRespuesta(propia)).toBe('se cierra');
  });
});
