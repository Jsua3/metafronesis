import { directionTowards, turnStepBetween } from './gaze.util';

describe('gaze.util', () => {
  it('directionTowards elige el eje dominante y el horizontal gana los empates', () => {
    expect(directionTowards(-10, 3)).toBe('left');
    expect(directionTowards(2, -9)).toBe('up');
    expect(directionTowards(5, 5)).toBe('right');
  });

  it('un giro de media vuelta pasa por una dirección intermedia', () => {
    expect(turnStepBetween('left', 'right', 1)).toBe('down');
    expect(turnStepBetween('up', 'down', -4)).toBe('left');
    expect(turnStepBetween('up', 'down', 4)).toBe('right');
  });

  it('un cuarto de giro o ninguno no lleva paso intermedio', () => {
    expect(turnStepBetween('left', 'up', 0)).toBeNull();
    expect(turnStepBetween('down', 'down', 0)).toBeNull();
  });
});
