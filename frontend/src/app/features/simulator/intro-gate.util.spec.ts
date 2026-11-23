import { IntroGateContext, introCardLines, resolveIntroStep } from './intro-gate.util';

/** Contexto base: intento en curso, sin nada visto todavía. */
function ctx(overrides: Partial<IntroGateContext> = {}): IntroGateContext {
  return {
    attemptStatus: 'IN_PROGRESS',
    consentGiven: false,
    introRead: false,
    ...overrides,
  };
}

describe('intro-gate.util', () => {
  describe('resolveIntroStep', () => {
    it.each([
      [{ attemptStatus: 'COMPLETED', consentGiven: true, introRead: false }, 'none'],
      [{ attemptStatus: 'SAFE_EXITED', consentGiven: true, introRead: false }, 'none'],
      [{ attemptStatus: null, consentGiven: true, introRead: false }, 'none'],
      [{ attemptStatus: 'IN_PROGRESS', consentGiven: false, introRead: false }, 'consent'],
      [{ attemptStatus: 'IN_PROGRESS', consentGiven: false, introRead: true }, 'consent'],
      [{ attemptStatus: 'IN_PROGRESS', consentGiven: true, introRead: false }, 'card'],
      [{ attemptStatus: 'IN_PROGRESS', consentGiven: true, introRead: true }, 'none'],
    ] as Array<[Partial<IntroGateContext>, string]>)('%o → %s, en cualquier escena', (overrides, step) => {
      expect(resolveIntroStep(ctx(overrides))).toBe(step);
    });

    it('pide consentimiento antes que cualquier contenido, también al reanudar a mitad de caso', () => {
      expect(resolveIntroStep(ctx())).toBe('consent');
    });
  });
});

describe('introCardLines', () => {
  it('nombra el caso, la escena y la sala, y dice dónde se lee el contexto', () => {
    expect(introCardLines('Caso de prueba', 'Recepción', 'Sala de espera')).toEqual([
      'Caso: Caso de prueba',
      'Escena: Recepción',
      'Empiezas en: Sala de espera',
      'El contexto del caso está en su ficha.',
    ]);
  });

  it('sin título de sala no pinta «Empiezas en:» vacío', () => {
    expect(introCardLines('Caso de prueba', 'Recepción', '')).toEqual([
      'Caso: Caso de prueba',
      'Escena: Recepción',
      'El contexto del caso está en su ficha.',
    ]);
  });

  it('un título con «$&» o llaves se copia tal cual', () => {
    expect(introCardLines('A $& {x}', 'B', 'C')[0]).toBe('Caso: A $& {x}');
  });
});
