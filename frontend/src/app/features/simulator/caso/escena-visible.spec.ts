import { describe, expect, it } from 'vitest';
import { escenaRetenida } from './escena-visible';

const antes = { key: 'llegada', title: 'La llegada' };

describe('escenaRetenida', () => {
  it('si la decisión lleva a otra escena, retiene la anterior para seguir mostrándola', () => {
    expect(escenaRetenida(antes, { key: 'sala-de-espera' })).toBe(antes);
  });

  it('si la escena es la misma, no retiene nada (no hay cambio que posponer)', () => {
    expect(escenaRetenida(antes, { key: 'llegada' })).toBeNull();
  });

  it('sin escena anterior o sin escena nueva no retiene nada', () => {
    expect(escenaRetenida(null, antes)).toBeNull();
    expect(escenaRetenida(antes, null)).toBeNull();
  });
});
