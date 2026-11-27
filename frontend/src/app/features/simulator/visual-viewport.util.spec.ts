import { observeVisualViewport } from './visual-viewport.util';

describe('visual viewport de la bitácora', () => {
  it('actualiza el espacio visible y limpia los oyentes', () => {
    const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 20 });
    const changes: number[] = [];
    const stop = observeVisualViewport(viewport, 800, value => changes.push(value));
    expect(changes).toEqual([280]);
    viewport.height = 450; viewport.dispatchEvent(new Event('resize'));
    viewport.offsetTop = 50; viewport.dispatchEvent(new Event('scroll'));
    expect(changes).toEqual([280, 330, 300]);
    stop(); viewport.dispatchEvent(new Event('resize'));
    expect(changes).toEqual([280, 330, 300]);
  });
  it('nunca reserva un espacio negativo', () => {
    const viewport = Object.assign(new EventTarget(), { height: 900, offsetTop: 0 });
    const changes: number[] = [];
    observeVisualViewport(viewport, 800, value => changes.push(value))();
    expect(changes).toEqual([0]);
  });
});
