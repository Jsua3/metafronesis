import { InputKind, nextInputKind, touchControlsVisible } from './world-input-kind.util';

/**
 * La cruceta táctil se decide por la ENTRADA real (plan visual F6-7, VD-5), no solo por `(pointer: coarse)`: en un
 * portátil táctil el primer toque la muestra y mover el ratón la oculta; sin entrada aún vale el puntero principal.
 * Un navegador que solo EMULA el tacto (sin ningún puntero fino) no la oculta por un clic de ratón.
 */

describe('world-input-kind: qué entrada manda', () => {
  // req: BLOQUE-H, RNF-04 (VD-5)
  it('un toque fija «touch» aunque el puntero principal sea fino', () => {
    expect(nextInputKind(null, 'touch', true)).toBe('touch');
    expect(nextInputKind('mouse', 'touch', true)).toBe('touch');
  });

  it('el ratón fija «mouse» solo si el dispositivo tiene un puntero fino', () => {
    expect(nextInputKind('touch', 'mouse', true)).toBe('mouse');
    expect(nextInputKind('touch', 'mouse', false)).toBe('touch');
    expect(nextInputKind(null, 'mouse', false)).toBeNull();
  });

  it('el lápiz y lo desconocido no cambian nada', () => {
    const states: Array<InputKind> = [null, 'touch', 'mouse'];
    for (const state of states) {
      expect(nextInputKind(state, 'pen', true)).toBe(state);
      expect(nextInputKind(state, '', true)).toBe(state);
    }
  });
});

describe('world-input-kind: cuándo se ve la cruceta', () => {
  it('sin entrada todavía decide el puntero principal', () => {
    expect(touchControlsVisible(null, true)).toBe(true);
    expect(touchControlsVisible(null, false)).toBe(false);
  });

  it('el último toque la muestra aunque el principal sea fino (portátil táctil)', () => {
    expect(touchControlsVisible('touch', false)).toBe(true);
  });

  it('el último movimiento del ratón la oculta aunque el principal sea grueso (tableta con ratón)', () => {
    expect(touchControlsVisible('mouse', true)).toBe(false);
  });
});
