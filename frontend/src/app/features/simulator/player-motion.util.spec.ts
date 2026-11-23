import {
  NUDGE_SUBSTEPS,
  PLAYER_HITBOX,
  PLAYER_MAX_DELTA_MS,
  PLAYER_MAX_FRAME_DELTA_MS,
  PLAYER_SPEED,
  PLAYER_SPRITE_OFFSET_Y,
  computeNudgeStep,
  computePlayerStep,
  playerHitbox,
  rectsIntersect,
  resolveDirection,
  splitFrameDelta,
} from './player-motion.util';

const NO_INPUT = { left: false, right: false, up: false, down: false };

describe('computePlayerStep — input → desplazamiento', () => {
  it('sin teclas no hay movimiento y conserva la última dirección', () => {
    const step = computePlayerStep(NO_INPUT, 'left', 16);
    expect(step.moving).toBe(false);
    expect(step.dx).toBe(0);
    expect(step.dy).toBe(0);
    expect(step.direction).toBe('left');
  });

  it('movimiento cardinal avanza speed*delta', () => {
    const step = computePlayerStep({ ...NO_INPUT, right: true }, 'down', 16);
    expect(step.moving).toBe(true);
    expect(step.dx).toBeCloseTo(PLAYER_SPEED * 0.016, 5);
    expect(step.dy).toBe(0);
    expect(step.direction).toBe('right');
  });

  it('la diagonal se normaliza (misma rapidez que el movimiento recto)', () => {
    const step = computePlayerStep({ ...NO_INPUT, right: true, down: true }, 'down', 16);
    const magnitude = Math.hypot(step.dx, step.dy);
    expect(magnitude).toBeCloseTo(PLAYER_SPEED * 0.016, 5);
    expect(step.dx).toBeCloseTo(step.dy, 5);
  });

  it('limita el delta (volver de una tab inactiva no teletransporta)', () => {
    const step = computePlayerStep({ ...NO_INPUT, right: true }, 'right', 500);
    expect(step.dx).toBeCloseTo(PLAYER_SPEED * (PLAYER_MAX_DELTA_MS / 1000), 5);
  });

  it('teclas opuestas se cancelan (idle, no temblor)', () => {
    const step = computePlayerStep({ left: true, right: true, up: false, down: false }, 'up', 16);
    expect(step.moving).toBe(false);
    expect(step.direction).toBe('up');
  });
});

describe('splitFrameDelta — velocidad independiente de los fps', () => {
  const walked = (frameMs: number, frames: number) => {
    let dx = 0;
    for (let f = 0; f < frames; f += 1) {
      for (const sub of splitFrameDelta(frameMs)) {
        dx += computePlayerStep({ ...NO_INPUT, right: true }, 'right', sub).dx;
      }
    }
    return dx;
  };

  it('a 60 fps un frame es un solo sub-paso (sin cambio de comportamiento)', () => {
    expect(splitFrameDelta(16)).toEqual([16]);
  });

  it('a 10 fps recorre lo mismo por segundo que a 60 fps (PLAYER_SPEED px/s)', () => {
    expect(walked(100, 10)).toBeCloseTo(PLAYER_SPEED, 5);
    expect(walked(1000 / 60, 60)).toBeCloseTo(PLAYER_SPEED, 5);
  });

  it('ningún sub-paso supera PLAYER_MAX_DELTA_MS (colisión por sub-paso, sin túneles)', () => {
    const subs = splitFrameDelta(100);
    expect(Math.max(...subs)).toBeLessThanOrEqual(PLAYER_MAX_DELTA_MS);
    expect(subs.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it('volver de una tab inactiva sigue acotado por PLAYER_MAX_FRAME_DELTA_MS', () => {
    const total = splitFrameDelta(5_000).reduce((a, b) => a + b, 0);
    expect(total).toBe(PLAYER_MAX_FRAME_DELTA_MS);
  });

  it('delta nulo o negativo no produce sub-pasos', () => {
    expect(splitFrameDelta(0)).toEqual([]);
    expect(splitFrameDelta(-5)).toEqual([]);
  });
});

describe('resolveDirection — dirección estable', () => {
  it('en diagonal conserva la última dirección si su eje sigue activo', () => {
    expect(resolveDirection(1, 1, 'right')).toBe('right');
    expect(resolveDirection(1, 1, 'down')).toBe('down');
    expect(resolveDirection(-1, -1, 'left')).toBe('left');
    expect(resolveDirection(-1, -1, 'up')).toBe('up');
  });

  it('si la última dirección ya no está activa manda el eje dominante', () => {
    expect(resolveDirection(1, 1, 'left')).toBe('right');   // |dx| >= |dy| → horizontal
    expect(resolveDirection(0, 1, 'right')).toBe('down');
    expect(resolveDirection(-1, 0, 'up')).toBe('left');
  });

  it('ir a la derecha NUNCA resuelve izquierda (y viceversa)', () => {
    for (const last of ['down', 'up', 'left', 'right'] as const) {
      expect(resolveDirection(1, 0, last)).toBe('right');
      expect(resolveDirection(-1, 0, last)).toBe('left');
    }
  });
});

describe('playerHitbox — colisión de pies', () => {
  it('es un rect de pies: centrado en x, apoyado en y', () => {
    const hb = playerHitbox(100, 200);
    expect(hb.width).toBe(PLAYER_HITBOX.width);
    expect(hb.height).toBe(PLAYER_HITBOX.height);
    expect(hb.x + hb.width / 2).toBe(100);          // centrado horizontal
    expect(hb.y + hb.height).toBe(200);             // borde inferior = pies
  });

  it('la cabeza/pelo no chocan: el hitbox no sube más allá de los pies', () => {
    const hb = playerHitbox(0, 0);
    // El sprite sube ~76 px desde los pies; el hitbox solo 16 (zona de pies).
    expect(hb.y).toBe(-PLAYER_HITBOX.height);
    expect(Math.abs(PLAYER_SPRITE_OFFSET_Y)).toBeGreaterThan(PLAYER_HITBOX.height);
  });
});

describe('computeNudgeStep (nudge táctil)', () => {
  it('nudge right produce dirección right, solo eje X y moving=true', () => {
    const step = computeNudgeStep('right', 'down');
    expect(step.direction).toBe('right');
    expect(step.moving).toBe(true);
    expect(step.dx).toBeCloseTo(PLAYER_SPEED * (PLAYER_MAX_DELTA_MS / 1000), 5);
    expect(step.dy).toBe(0);
  });

  it('no hay diagonal: cada llamada mueve un solo eje', () => {
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const step = computeNudgeStep(dir, 'down');
      expect(step.dx === 0 || step.dy === 0).toBe(true);
      expect(Math.abs(step.dx) + Math.abs(step.dy)).toBeGreaterThan(0);
      expect(step.direction).toBe(dir);
    }
  });

  it('respeta PLAYER_SPEED con el delta clamp del contrato (sin salto fijo)', () => {
    const step = computeNudgeStep('up', 'up');
    expect(Math.hypot(step.dx, step.dy))
      .toBeLessThanOrEqual(PLAYER_SPEED * (PLAYER_MAX_DELTA_MS / 1000) + 1e-9);
  });

  it('NUDGE_SUBSTEPS acota el desplazamiento total de un tap (~20px)', () => {
    const total = NUDGE_SUBSTEPS * PLAYER_SPEED * (PLAYER_MAX_DELTA_MS / 1000);
    expect(total).toBeGreaterThanOrEqual(16);
    expect(total).toBeLessThanOrEqual(24);
  });
});

describe('rectsIntersect — AABB puro', () => {
  it('detecta solape y respeta bordes exclusivos', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false); // borde toca, no solapa
    expect(rectsIntersect(a, { x: -10, y: -10, width: 5, height: 5 })).toBe(false);
  });
});
