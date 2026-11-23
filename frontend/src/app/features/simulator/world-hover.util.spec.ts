import { REVEAL_RADIUS } from './interaction-priority.util';
import { HOVER_HIT, HoverCandidate, pickHoverTarget } from './world-hover.util';

/**
 * Qué se resalta con el puntero en el mundo (plan visual F6-7, VD-5; VD-19). La regla central: el contorno, el verbo
 * y el cursor solo aparecen sobre lo que el jugador YA podría saber —dentro del radio de percepción o ya examinado—;
 * nada por descubrir se ilumina ni revela su sitio.
 */

const NONE: ReadonlySet<string> = new Set<string>();

function actor(key: string, x: number, y: number, playerDistance: number): HoverCandidate {
  return { key, x, y, playerDistance };
}

describe('world-hover: la puntería', () => {
  // req: BLOQUE-H, RNF-04 (VD-5)
  it('el puntero sobre el cuerpo del actor (arriba de sus pies) lo elige', () => {
    const nurse = actor('npc:enfermera', 300, 200, 60);
    expect(pickHoverTarget({ x: 300, y: 200 - HOVER_HIT.above + 4 }, [nurse], NONE)).toBe('npc:enfermera');
    expect(pickHoverTarget({ x: 300 + HOVER_HIT.halfWidth - 1, y: 200 }, [nurse], NONE)).toBe('npc:enfermera');
  });

  it('fuera de su caja no se elige: el mundo vacío no resalta nada', () => {
    const nurse = actor('npc:enfermera', 300, 200, 60);
    expect(pickHoverTarget({ x: 300 + HOVER_HIT.halfWidth + 6, y: 200 }, [nurse], NONE)).toBeNull();
    expect(pickHoverTarget({ x: 300, y: 200 - HOVER_HIT.above - 6 }, [nurse], NONE)).toBeNull();
    expect(pickHoverTarget({ x: 300, y: 200 + HOVER_HIT.below + 6 }, [nurse], NONE)).toBeNull();
  });

  it('entre dos actores solapados gana el más cercano al puntero', () => {
    const a = actor('kit-pap', 300, 200, 50);
    const b = actor('npc:familia', 316, 200, 50);
    expect(pickHoverTarget({ x: 312, y: 190 }, [a, b], NONE)).toBe('npc:familia');
    expect(pickHoverTarget({ x: 304, y: 190 }, [a, b], NONE)).toBe('kit-pap');
  });

  it('sin candidatos no hay nada', () => {
    expect(pickHoverTarget({ x: 10, y: 10 }, [], NONE)).toBeNull();
  });
});

describe('world-hover: solo lo que el jugador ya podría saber (VD-19)', () => {
  const pointerOn = (x: number, y: number) => ({ x, y: y - 10 });

  it('dentro del radio de percepción se resalta', () => {
    const door = actor('puerta-sala-escucha', 500, 300, REVEAL_RADIUS - 1);
    expect(pickHoverTarget(pointerOn(500, 300), [door], NONE)).toBe('puerta-sala-escucha');
  });

  it('fuera del radio y sin examinar NO se resalta, aunque el puntero esté justo encima', () => {
    const hidden = actor('evidencia-por-descubrir', 500, 300, REVEAL_RADIUS + 1);
    expect(pickHoverTarget(pointerOn(500, 300), [hidden], NONE)).toBeNull();
  });

  it('fuera del radio pero ya examinado se resalta', () => {
    const seen = actor('historia-clinica', 500, 300, REVEAL_RADIUS + 200);
    expect(pickHoverTarget(pointerOn(500, 300), [seen], new Set(['historia-clinica']))).toBe('historia-clinica');
  });

  it('lo que no es elegible no roba el puntero a lo que sí lo es', () => {
    const hidden = actor('evidencia-por-descubrir', 300, 200, REVEAL_RADIUS + 50);
    const known = actor('npc:enfermera', 312, 200, 40);
    expect(pickHoverTarget(pointerOn(302, 200), [hidden, known], NONE)).toBe('npc:enfermera');
  });

  it('con solo lo no elegible bajo el puntero, nada: ni siquiera se revela que allí hay algo', () => {
    const hidden = actor('evidencia-por-descubrir', 300, 200, REVEAL_RADIUS + 50);
    expect(pickHoverTarget(pointerOn(300, 200), [hidden], new Set(['otra-cosa']))).toBeNull();
  });
});
