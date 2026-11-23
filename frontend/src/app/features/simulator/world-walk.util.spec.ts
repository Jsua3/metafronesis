import {
  NO_WALK,
  WALK_AXIS_DEADZONE_PX,
  WALK_GROUND_RADIUS_PX,
  WALK_REACH_MARGIN_PX,
  WALK_STUCK_MS,
  WalkPoint,
  WalkState,
  cancelWalkOnKeys,
  reachRadius,
  startWalk,
  tickWalk,
} from './world-walk.util';
import { PlayerMotionInput, computePlayerStep } from './player-motion.util';

/**
 * Caminar hasta un punto con el ratón (plan visual F6-7, VD-5): la caminata es una función pura de la posición, el
 * destino y el tiempo, y produce las mismas «teclas» que el teclado: el mundo las aplica con el MISMO movimiento por
 * sub-pasos con colisión y deslizamiento. Sin Phaser: se prueba aquí con un mundo de rectángulos.
 */

const NONE: PlayerMotionInput = { left: false, right: false, up: false, down: false };

describe('world-walk: la caminata pide las teclas que acercan al destino', () => {
  // req: BLOQUE-H, RNF-04 (VD-5)
  it('con el destino a la derecha pide solo «derecha»', () => {
    const tick = tickWalk(startWalk({ x: 300, y: 100, radius: 6 }), { x: 100, y: 100 }, 16);
    expect(tick.input).toEqual({ ...NONE, right: true });
    expect(tick.arrived).toBe(false);
    expect(tick.gaveUp).toBe(false);
  });

  it('en diagonal pide los dos ejes (el movimiento normaliza la diagonal)', () => {
    const tick = tickWalk(startWalk({ x: 50, y: 40, radius: 6 }), { x: 200, y: 160 }, 16);
    expect(tick.input).toEqual({ ...NONE, left: true, up: true });
  });

  it('un eje dentro de la zona muerta no se pulsa: sin temblor a un píxel del destino', () => {
    const near = WALK_AXIS_DEADZONE_PX - 1;
    const tick = tickWalk(startWalk({ x: 100 + near, y: 400, radius: 6 }), { x: 100, y: 100 }, 16);
    expect(tick.input).toEqual({ ...NONE, down: true });
  });

  it('sin destino no pide nada', () => {
    const tick = tickWalk(NO_WALK, { x: 10, y: 10 }, 16);
    expect(tick.input).toEqual(NONE);
    expect(tick.arrived).toBe(false);
    expect(tick.state).toEqual(NO_WALK);
  });
});

describe('world-walk: radios de llegada', () => {
  it('hacia algo señalado se detiene antes de su límite de interacción, con margen', () => {
    expect(reachRadius(72)).toBe(72 - WALK_REACH_MARGIN_PX);
    expect(reachRadius(74)).toBe(74 - WALK_REACH_MARGIN_PX);
  });

  it('nunca pide un radio menor de 8 px (no se queda dando vueltas)', () => {
    expect(reachRadius(10)).toBe(8);
    expect(reachRadius(0)).toBe(8);
  });

  it('en el suelo basta la tolerancia de unos píxeles', () => {
    expect(WALK_GROUND_RADIUS_PX).toBeGreaterThanOrEqual(WALK_AXIS_DEADZONE_PX);
    expect(WALK_GROUND_RADIUS_PX).toBeLessThanOrEqual(12);
  });
});

describe('world-walk: llegada', () => {
  it('se detiene al entrar en el radio del destino (el de interacción de una persona)', () => {
    const state = startWalk({ x: 400, y: 300, radius: 60 });
    const far = tickWalk(state, { x: 100, y: 300 }, 16);
    expect(far.arrived).toBe(false);
    const inside = tickWalk(far.state, { x: 345, y: 300 }, 16);
    expect(inside.arrived).toBe(true);
    expect(inside.input).toEqual(NONE);
    expect(inside.state).toEqual(NO_WALK);
  });

  it('en el suelo llega al punto clicado (radio de unos píxeles)', () => {
    const tick = tickWalk(startWalk({ x: 200, y: 200, radius: 6 }), { x: 204, y: 203 }, 16);
    expect(tick.arrived).toBe(true);
  });
});

describe('world-walk: sin avance se abandona', () => {
  const target = { x: 600, y: 100, radius: 6 };

  function idleFor(ms: number, from: WalkState = startWalk(target)): { gaveUp: boolean; state: WalkState } {
    let state = from;
    let elapsed = 0;
    let gaveUp = false;
    // El primer cuadro fija la referencia; los siguientes, en el mismo sitio, acumulan tiempo atascado.
    const position: WalkPoint = { x: 100, y: 100 };
    state = tickWalk(state, position, 16).state;
    while (elapsed < ms && !gaveUp) {
      const tick = tickWalk(state, position, 16);
      state = tick.state;
      gaveUp = tick.gaveUp;
      elapsed += 16;
    }
    return { gaveUp, state };
  }

  it('pasado el plazo sin moverse la caminata se rinde (pared, mueble o rechazo del servidor)', () => {
    expect(idleFor(WALK_STUCK_MS + 64).gaveUp).toBe(true);
  });

  it('antes del plazo sigue intentando', () => {
    expect(idleFor(WALK_STUCK_MS - 64).gaveUp).toBe(false);
  });

  it('avanzar reinicia el contador: un tropiezo breve no la cancela', () => {
    const first = idleFor(WALK_STUCK_MS - 64);
    const moved = tickWalk(first.state, { x: 110, y: 100 }, 16);
    expect(moved.state.stuckMs).toBe(0);
    expect(moved.gaveUp).toBe(false);
  });

  it('el primer cuadro nunca cuenta como atascado', () => {
    const tick = tickWalk(startWalk(target), { x: 100, y: 100 }, 5_000);
    expect(tick.gaveUp).toBe(false);
  });
});

describe('world-walk: cualquier tecla de movimiento la cancela', () => {
  const walking = startWalk({ x: 400, y: 300, radius: 6 });

  it.each(['left', 'right', 'up', 'down'] as const)('con «%s» pulsada la caminata termina', key => {
    expect(cancelWalkOnKeys(walking, { ...NONE, [key]: true })).toEqual(NO_WALK);
  });

  it('sin teclas la caminata sigue', () => {
    expect(cancelWalkOnKeys(walking, NONE)).toBe(walking);
  });
});

describe('world-walk: con el movimiento por pasos del teclado', () => {
  interface Rect { x: number; y: number; width: number; height: number }
  const hits = (rect: Rect, x: number, y: number) =>
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

  /** Lo mismo que `movePlayer` de la escena: paso completo; si choca, solo horizontal y luego solo vertical. */
  function slide(pos: WalkPoint, dx: number, dy: number, walls: Rect[]): WalkPoint {
    const blocked = (x: number, y: number) => walls.some(wall => hits(wall, x, y));
    if (!blocked(pos.x + dx, pos.y + dy)) return { x: pos.x + dx, y: pos.y + dy };
    if (dx !== 0 && !blocked(pos.x + dx, pos.y)) return { x: pos.x + dx, y: pos.y };
    if (dy !== 0 && !blocked(pos.x, pos.y + dy)) return { x: pos.x, y: pos.y + dy };
    return pos;
  }

  function run(start: WalkPoint, target: { x: number; y: number; radius: number }, walls: Rect[]) {
    let state = startWalk(target);
    let pos = start;
    for (let frame = 0; frame < 1_500; frame += 1) {
      const tick = tickWalk(state, pos, 16);
      state = tick.state;
      if (tick.arrived) return { outcome: 'arrived' as const, pos };
      if (tick.gaveUp) return { outcome: 'gaveUp' as const, pos };
      const step = computePlayerStep(tick.input, 'down', 16);
      pos = slide(pos, step.dx, step.dy, walls);
    }
    return { outcome: 'timeout' as const, pos };
  }

  it('llega a un punto libre', () => {
    const result = run({ x: 50, y: 50 }, { x: 400, y: 250, radius: 6 }, []);
    expect(result.outcome).toBe('arrived');
    expect(Math.hypot(result.pos.x - 400, result.pos.y - 250)).toBeLessThanOrEqual(6);
  });

  it('rodea un muro corto deslizándose por él (el mismo deslizamiento que el teclado)', () => {
    // Un muro vertical con el destino en diagonal: el eje libre lo lleva hasta pasar su extremo.
    const wall: Rect = { x: 200, y: 0, width: 12, height: 230 };
    const result = run({ x: 100, y: 130 }, { x: 420, y: 300, radius: 6 }, [wall]);
    expect(result.outcome).toBe('arrived');
  });

  it('se rinde ante un muro que cierra el paso por completo', () => {
    const wall: Rect = { x: 200, y: -1_000, width: 12, height: 3_000 };
    const result = run({ x: 100, y: 100 }, { x: 420, y: 100, radius: 6 }, [wall]);
    expect(result.outcome).toBe('gaveUp');
  });

  it('se detiene dentro del radio de interacción de una persona sin tocarla', () => {
    const result = run({ x: 50, y: 200 }, { x: 500, y: 200, radius: 60 }, []);
    expect(result.outcome).toBe('arrived');
    expect(result.pos.x).toBeGreaterThan(430);
    expect(result.pos.x).toBeLessThan(500);
  });
});
