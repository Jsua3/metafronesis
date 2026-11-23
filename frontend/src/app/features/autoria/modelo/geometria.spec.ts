import { describe, expect, it } from 'vitest';

import type { Encuadre } from './escenario';
import { ANCHOS, ancla, borde, largoMuro, limites, llegada, paredes, redondear, zonaCaminable, type Muro } from './geometria';
import { GEOMETRIA_SALAS } from './geometria-salas.fixture';

/** La copia del editor reproduce la tabla dorada del servidor en todos los anchos y encuadres (contrato x-siep 2.2, §1). */
describe('geometría de las salas', () => {
  it('declara los mismos anchos que el servidor', () => {
    expect(ANCHOS).toEqual([...GEOMETRIA_SALAS.anchos]);
  });

  it('a 960 px da la tabla de siempre', () => {
    expect(zonaCaminable('tres-paredes')).toEqual({ x: 96, y: 236, ancho: 768, alto: 250 });
    expect(zonaCaminable('una-pared')).toEqual({ x: 24, y: 236, ancho: 912, alto: 250 });
  });

  it('redondea las mitades hacia arriba', () => {
    expect(redondear(8, 16)).toBe(1);
    expect(redondear(-8, 16)).toBe(0);
    expect(redondear(-24, 16)).toBe(-1);
  });

  it('rechaza un ancho fuera del catálogo', () => {
    expect(() => borde(1000)).toThrow();
  });

  for (const sala of GEOMETRIA_SALAS.salas) {
    const encuadre = sala.encuadre as Encuadre;
    it(`coincide con la tabla dorada en ${encuadre} a ${sala.ancho} px`, () => {
      expect(borde(sala.ancho)).toBe(sala.borde);
      const z = zonaCaminable(encuadre, sala.ancho);
      expect([z.x, z.y, z.ancho, z.alto]).toEqual([...sala.zona]);
      expect(limites(encuadre, sala.ancho)).toEqual([...sala.limites]);
      for (const [muro, largo] of Object.entries(sala.largos)) {
        expect(largoMuro(muro as Muro, encuadre, sala.ancho)).toBe(largo);
      }
      expect(paredes(encuadre, sala.ancho).map((p) => [p.clave, p.x, p.y, p.ancho, p.alto])).toEqual(
        sala.paredes.map((p) => [...p]),
      );
      for (const [muro, pos, ax, ay, lx, ly] of sala.muestras) {
        expect(ancla(muro as Muro, pos as number, encuadre, sala.ancho)).toEqual({ x: ax, y: ay });
        expect(llegada(muro as Muro, pos as number, encuadre, sala.ancho)).toEqual({ x: lx, y: ly });
      }
    });
  }
});
