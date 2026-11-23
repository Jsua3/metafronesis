import { Historial, MAXIMO_ESTADOS } from './historial';

describe('Historial', () => {
  it('deshacer y rehacer recorren los estados en orden', () => {
    const h = new Historial(0);
    h.hacer(1);
    h.hacer(2);
    expect(h.puedeDeshacer).toBe(true);
    expect(h.deshacer()).toBe(1);
    expect(h.deshacer()).toBe(0);
    expect(h.puedeDeshacer).toBe(false);
    expect(h.deshacer()).toBeNull();
    expect(h.rehacer()).toBe(1);
    expect(h.rehacer()).toBe(2);
    expect(h.puedeRehacer).toBe(false);
    expect(h.rehacer()).toBeNull();
  });

  it('hacer después de deshacer descarta lo rehacible', () => {
    const h = new Historial('a');
    h.hacer('b');
    h.hacer('c');
    h.deshacer();
    h.hacer('d');
    expect(h.puedeRehacer).toBe(false);
    expect(h.rehacer()).toBeNull();
    expect(h.deshacer()).toBe('b');
  });

  it('el historial no guarda más de 100 estados', () => {
    const h = new Historial(0);
    for (let i = 1; i < 150; i++) h.hacer(i);
    let pasos = 0;
    let ultimo: number | null = null;
    for (let v = h.deshacer(); v !== null; v = h.deshacer()) {
      pasos++;
      ultimo = v;
    }
    expect(MAXIMO_ESTADOS).toBe(100);
    expect(pasos).toBe(MAXIMO_ESTADOS - 1);
    expect(ultimo).toBe(50);
  });

  it('empezar de nuevo olvida todo lo anterior', () => {
    const h = new Historial(0);
    h.hacer(1);
    h.empezar(7);
    expect(h.puedeDeshacer).toBe(false);
    expect(h.actual).toBe(7);
  });
});
