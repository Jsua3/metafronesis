import type { CasoBorrador } from '../../modelo/caso';
import { centrarEn, encuadrar, encuadrarLegible, seVe, ventana, zoomEn } from './camara';
import { caminoIluminado } from './iluminar';

// req: EDITOR-PRO.md punto 3 (lienzo de Caminos: zoom, mover, ver todo y caminos que se iluminan)
describe('Caminos · la cámara del lienzo', () => {
  it('«Ver todo» encuadra el caso centrado y no agiganta un caso corto', () => {
    const c = encuadrar({ w: 400, h: 200 }, { w: 1000, h: 600 });
    expect(c.z).toBe(1);
    expect([c.x, c.y]).toEqual([300, 200]);
    const grande = encuadrar({ w: 2000, h: 1000 }, { w: 1000, h: 600 }, 0);
    expect(grande.z).toBe(0.5);
  });

  it('un caso que no cabe legible se encuadra al mínimo desde el inicio, sin lienzo vacío arriba ni abajo', () => {
    // 8 escenas en 6 columnas (como el caso 2) en un lienzo de 816 × 658: «Ver todo» bajaría a 48 %.
    const mundo = { w: 1592, h: 644 }, vista = { w: 816, h: 658 };
    expect(encuadrar(mundo, vista).z).toBeLessThan(0.5);
    const c = encuadrarLegible(mundo, vista, { x: 136, y: 102 }, 0.75);
    expect(c.z).toBe(0.75);
    expect(c.x).toBe(24);
    // En alto, 644 × 0,75 = 483 cabe: se centra el mapa entero.
    expect(c.y).toBe(Math.round((658 - 483) / 2));
    // Si cabe con buena escala, es «Ver todo» sin más.
    expect(encuadrarLegible({ w: 400, h: 200 }, { w: 1000, h: 600 }, { x: 0, y: 0 }, 0.75)).toEqual(encuadrar({ w: 400, h: 200 }, { w: 1000, h: 600 }));
  });

  it('centra el inicio lejos de la izquierda y acota ambos extremos', () => {
    const mundo = { w: 3000, h: 1000 }, vista = { w: 800, h: 600 };
    const centro = encuadrarLegible(mundo, vista, { x: 1800, y: 500 }, 0.75);
    expect(centro.x + 1800 * centro.z).toBe(400);
    expect(encuadrarLegible(mundo, vista, { x: 2990, y: 500 }, 0.75).x).toBe(800 - 24 - 3000 * 0.75);
    const todo = encuadrar({ w: 10000, h: 1000 }, vista);
    expect(todo.z).toBeLessThan(0.3);
    expect(seVe(todo, { x: 0, y: 0, w: 10000, h: 1000 }, vista)).toBe(true);
  });

  it('acercar con el cursor deja quieto el punto que está bajo el cursor', () => {
    const c = { x: 10, y: 20, z: 1 };
    const ancla = { x: 300, y: 200 };
    const antes = { x: (ancla.x - c.x) / c.z, y: (ancla.y - c.y) / c.z };
    const d = zoomEn(c, ancla, 1.5);
    expect(antes.x * d.z + d.x).toBeCloseTo(ancla.x);
    expect(antes.y * d.z + d.y).toBeCloseTo(ancla.y);
    expect(zoomEn(c, ancla, 99).z).toBe(2);
  });

  it('centra un punto del mundo y sabe si un rectángulo se ve', () => {
    const vista = { w: 800, h: 600 };
    const c = centrarEn({ x: 0, y: 0, z: 1 }, { x: 1000, y: 1000 }, vista);
    expect([c.x, c.y]).toEqual([-600, -700]);
    expect(seVe(c, { x: 950, y: 950, w: 100, h: 100 }, vista)).toBe(true);
    expect(seVe(c, { x: 0, y: 0, w: 100, h: 100 }, vista)).toBe(false);
    expect(ventana({ x: -100, y: 0, z: 2 }, vista)).toEqual({ x: 50, y: -0, w: 400, h: 300 });
  });
});

describe('Caminos · el camino que se ilumina', () => {
  const escena = (id: string, destinos: string[]) => ({
    id, respuestas: destinos.map((d, i) => ({ id: `${id}-${i}`, destinoId: d })),
  });
  const caso = {
    inicioId: 'a',
    escenas: [escena('a', ['b', 'c']), escena('b', ['d']), escena('c', ['d']), escena('d', ['e']), escena('e', [])],
  } as unknown as CasoBorrador;

  it('ilumina el camino más corto desde el inicio y lo que sale de la escena', () => {
    expect([...caminoIluminado(caso, 'd')].sort()).toEqual(['a-0', 'b-0', 'd-0']);
  });

  it('en el inicio, solo lo que sale; en una escena sin salida, solo cómo se llega', () => {
    expect([...caminoIluminado(caso, 'a')].sort()).toEqual(['a-0', 'a-1']);
    expect([...caminoIluminado(caso, 'e')].sort()).toEqual(['a-0', 'b-0', 'd-0']);
  });
});
