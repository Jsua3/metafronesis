import { PlayerMotionInput } from './player-motion.util';
import { TOUCH_HOLD_DELAY_MS, heldInput } from './touch-hold.util';

const idle: PlayerMotionInput = { left: false, right: false, up: false, down: false };

describe('heldInput', () => {
  it('espera 200 ms antes de caminar: un toque es solo el paso inicial', () => {
    expect(TOUCH_HOLD_DELAY_MS).toBe(200);
    expect(heldInput(idle, 'up', TOUCH_HOLD_DELAY_MS - 1)).toEqual(idle);
  });

  it('pasado el retardo, la dirección mantenida cuenta como tecla apretada', () => {
    expect(heldInput(idle, 'left', TOUCH_HOLD_DELAY_MS)).toEqual({ ...idle, left: true });
  });

  it('se suma al teclado sin anularlo', () => {
    const keyboard = { ...idle, down: true };
    expect(heldInput(keyboard, 'right', 1000)).toEqual({ ...idle, down: true, right: true });
  });

  it('sin dirección mantenida devuelve la entrada tal cual y nunca la muta', () => {
    const keyboard = { ...idle, up: true };
    expect(heldInput(keyboard, null, 5000)).toBe(keyboard);
    heldInput(keyboard, 'left', 5000);
    expect(keyboard).toEqual({ ...idle, up: true });
  });
});
