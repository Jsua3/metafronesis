import { beginStick, moveStick, endStick } from './floating-stick.util';

describe('palanca flotante', () => {
  it('conserva el toque bajo 12 px y no permite que otro dedo lo termine', () => {
    const start = beginStick(null, 7, 80, 90)!;
    expect(beginStick(start, 9, 50, 50)).toBe(start);
    expect(moveStick(start, 9, 160, 90)).toBe(start);
    const short = moveStick(start, 7, 91, 90)!;
    expect(short.dragging).toBe(false);
    expect(endStick(short, 9).state).toBe(short);
    expect(endStick(short, 7)).toEqual({ state: null, tap: true });
  });
  it('a partir de 12 px camina en ocho direcciones y limita el mando a 56 px', () => {
    const start = beginStick(null, 3, 0, 0)!;
    const diagonal = moveStick(start, 3, 100, -100)!;
    expect(diagonal.dragging).toBe(true);
    expect(diagonal.input).toEqual({ up: true, down: false, left: false, right: true });
    expect(Math.hypot(diagonal.dx, diagonal.dy)).toBeCloseTo(56);
    const back = moveStick(diagonal, 3, 1, 1)!;
    expect(back.dragging).toBe(true);
    expect(back.input).toEqual({ up: false, down: false, left: false, right: false });
    expect(endStick(back, 3).tap).toBe(false);
  });
});
