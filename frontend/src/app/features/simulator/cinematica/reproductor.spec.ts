import { RelojDeCinematica } from './reproductor';

describe('RelojDeCinematica', () => {
  it('pasa de plano al cumplir su duración y termina tras el último', () => {
    const reloj = new RelojDeCinematica([1000, 500]);
    expect(reloj.avanzar(200)).toBe('sigue');
    expect(reloj.progreso).toBeCloseTo(0.2);
    for (let i = 0; i < 3; i++) expect(reloj.avanzar(200)).toBe('sigue');
    expect(reloj.avanzar(200)).toBe('cambio');
    expect(reloj.indice).toBe(1);
    expect(reloj.transcurrido).toBe(0);
    expect(reloj.avanzar(250)).toBe('sigue');
    expect(reloj.avanzar(250)).toBe('fin');
    expect(reloj.terminada).toBe(true);
    expect(reloj.avanzar(100)).toBe('fin');
  });

  it('en pausa el tiempo no corre', () => {
    const reloj = new RelojDeCinematica([1000]);
    reloj.pausar();
    expect(reloj.avanzar(5000)).toBe('sigue');
    expect(reloj.transcurrido).toBe(0);
    expect(reloj.alternarPausa()).toBe(false);
    reloj.avanzar(100);
    expect(reloj.transcurrido).toBe(100);
  });

  it('un salto de tiempo enorme (pestaña dormida) no se come planos', () => {
    const reloj = new RelojDeCinematica([300, 300, 300]);
    expect(reloj.avanzar(60_000)).toBe('cambio');
    expect(reloj.indice).toBe(1);
    expect(reloj.transcurrido).toBe(0);
  });

  it('siguiente y anterior a mano; siguiente en el último termina', () => {
    const reloj = new RelojDeCinematica([1000, 1000]);
    expect(reloj.anterior()).toBe('cambio');
    expect(reloj.indice).toBe(0);
    reloj.avanzar(200);
    expect(reloj.siguiente()).toBe('cambio');
    expect(reloj.indice).toBe(1);
    expect(reloj.anterior()).toBe('cambio');
    expect(reloj.indice).toBe(0);
    reloj.siguiente();
    expect(reloj.siguiente()).toBe('fin');
  });

  it('sin planos termina en el acto', () => {
    expect(new RelojDeCinematica([]).avanzar(16)).toBe('fin');
  });
});
