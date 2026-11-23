import { PROGRESO_INICIAL, claveProgreso, guardarProgreso, leerProgreso } from './progreso-tutorial';

describe('progreso del tutorial', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('la clave es por usuario', () => {
    expect(claveProgreso(7)).toBe('siep.tutorial.v1.7');
    expect(claveProgreso(null)).toBe('siep.tutorial.v1.anonimo');
  });

  it('sin nada guardado devuelve el inicial', () => {
    expect(leerProgreso(7)).toEqual(PROGRESO_INICIAL);
  });

  it('guarda y lee el mismo progreso', () => {
    const p = { ...PROGRESO_INICIAL, casoId: '41', capitulo: 2, paso: 1, completados: ['bienvenida', 'datos'], practicos: ['d-contexto'] };
    guardarProgreso(7, p);
    expect(leerProgreso(7)).toEqual(p);
    expect(leerProgreso(8)).toEqual(PROGRESO_INICIAL);
  });

  it('JSON roto u otra versión cuentan como sin progreso', () => {
    localStorage.setItem('siep.tutorial.v1.7', '{roto');
    expect(leerProgreso(7)).toEqual(PROGRESO_INICIAL);
    localStorage.setItem('siep.tutorial.v1.7', JSON.stringify({ ...PROGRESO_INICIAL, version: 2 }));
    expect(leerProgreso(7)).toEqual(PROGRESO_INICIAL);
  });

  it('sin localStorage no falla', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(leerProgreso(7)).toEqual(PROGRESO_INICIAL);
    expect(() => guardarProgreso(7, PROGRESO_INICIAL)).not.toThrow();
  });
});
