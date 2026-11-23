import { describe, expect, it } from 'vitest';

import { cajaDePieza, pasoDeTeclado, primerHueco, proyectarAlMuro, proyectarAlSuelo, zonasDeToque } from './arrastre-en-muro';

describe('zonas de toque con el dedo', () => {
  it('una pieza chica crece centrada hasta el mínimo; una grande no cambia', () => {
    const z = zonasDeToque(new Map([['reloj', { x: 100, y: 50, ancho: 24, alto: 24 }], ['tubo', { x: 300, y: 20, ancho: 72, alto: 24 }]]), 55);
    expect(z.get('reloj')).toEqual({ x: 84.5, y: 34.5, ancho: 55, alto: 55 });
    expect(z.get('tubo')).toEqual({ x: 300, y: 4.5, ancho: 72, alto: 55 });
  });
  it('dos vecinas que se pisarían reparten el borde a mitad de camino, sin achicar sus cajas', () => {
    const z = zonasDeToque(new Map([['a', { x: 100, y: 50, ancho: 24, alto: 24 }], ['b', { x: 140, y: 50, ancho: 24, alto: 24 }]]), 55);
    const a = z.get('a')!, b = z.get('b')!;
    expect(a.x + a.ancho).toBe(132);
    expect(b.x).toBe(132);
    expect(a.ancho).toBeGreaterThanOrEqual(24);
    expect(b.alto).toBe(55);
  });
});
import { ALTO_SALA, ancla, largoMuro } from './geometria';
import type { PlanDeSala } from '../../simulator/sala/composicion';

describe('arrastre en muro', () => {
  const muros = ['fondo', 'izquierda', 'derecha', 'camara'] as const;

  it('arrastrar por el fondo se ajusta a 8 px', () => {
    expect(proyectarAlMuro({ x: 197, y: 230 }, { muro: 'fondo', pos: 0 }, muros, 'tres-paredes', 960))
      .toEqual({ muro: 'fondo', pos: 104 });
  });

  it('pasar el extremo izquierdo del fondo salta al muro izquierdo si existe', () => {
    expect(proyectarAlMuro({ x: 88, y: 230 }, { muro: 'fondo', pos: 0 }, muros, 'tres-paredes', 960))
      .toEqual({ muro: 'izquierda', pos: 8 });
  });

  it('en una-pared no salta: se queda en el extremo', () => {
    expect(proyectarAlMuro({ x: -8, y: 230 }, { muro: 'fondo', pos: 0 }, muros, 'una-pared', 960))
      .toEqual({ muro: 'fondo', pos: 0 });
  });

  it('una ventana nunca salta al muro de la cámara', () => {
    expect(proyectarAlMuro({ x: 24, y: 540 }, { muro: 'izquierda', pos: 296 }, muros.slice(0, 3), 'tres-paredes', 960))
      .toEqual({ muro: 'izquierda', pos: 298 });
  });

  it('una puerta baja por el lateral y salta a la cámara', () => {
    expect(proyectarAlMuro({ x: 24, y: 536 }, { muro: 'izquierda', pos: 296 }, muros, 'tres-paredes', 960))
      .toEqual({ muro: 'camara', pos: 8 });
  });

  it('el muro de la cámara invierte ancla sin error de 1 px en 960 y 1920', () => {
    for (const ancho of [960, 1920]) {
      const largo = largoMuro('camara', 'tres-paredes', ancho);
      for (let pos = 0; pos <= largo; pos += 8) {
        expect(proyectarAlMuro(ancla('camara', pos, 'tres-paredes', ancho),
          { muro: 'camara', pos }, muros, 'tres-paredes', ancho)).toEqual({ muro: 'camara', pos });
      }
    }
  });

  it('las flechas mueven 8 y saltan en la esquina', () => {
    expect(pasoDeTeclado({ muro: 'fondo', pos: 16 }, 'ArrowLeft', muros, 'tres-paredes', 960))
      .toEqual({ muro: 'fondo', pos: 8 });
    expect(pasoDeTeclado({ muro: 'fondo', pos: 0 }, 'ArrowUp', muros, 'tres-paredes', 960))
      .toEqual({ muro: 'izquierda', pos: 8 });
    expect(pasoDeTeclado({ muro: 'camara', pos: 0 }, 'ArrowLeft', muros, 'tres-paredes', 960))
      .toEqual({ muro: 'izquierda', pos: 288 });
  });

  it('primerHueco respeta la holgura de las puertas y las franjas', () => {
    const ficha = { ocupa: 16, franja: [0, 20] as const, esPuerta: false };
    const puerta = { pos: 48, ocupa: 16, franja: [0, 20] as const, esPuerta: true };
    expect(primerHueco('fondo', ficha, [puerta], 96)).toBe(24);
    expect(primerHueco('fondo', { ...ficha, franja: [20, 40] }, [puerta], 96)).toBe(48);
    expect(primerHueco('fondo', { ...ficha, ocupa: 104 }, [], 96)).toBeNull();
  });

  it('usa la caja exacta del sprite y calcula alternativas geométricas', () => {
    const plan = { sprites: [{ id: 'a', x: 10, y: 20, w: 12, h: 15 }] } as PlanDeSala;
    const ficha = { ocupa: 40, franja: [20, 80] as const };
    expect(cajaDePieza('a', plan, { muro: 'fondo', pos: 40 }, ficha, 'tres-paredes', 960))
      .toEqual({ x: 10, y: 20, ancho: 12, alto: 15 });
    expect(cajaDePieza('b', null, { muro: 'fondo', pos: 40 }, ficha, 'tres-paredes', 960))
      .toEqual({ x: 116, y: 150, ancho: 40, alto: 60 });
    expect(cajaDePieza('b', null, { muro: 'camara', pos: 40 }, ficha, 'tres-paredes', 960).y).toBe(ALTO_SALA - 24);
    expect(cajaDePieza('b', null, { x: 100, y: 200 }, ficha, 'tres-paredes', 960))
      .toEqual({ x: 80, y: 170, ancho: 40, alto: 60 });
  });

  it('ajusta el suelo a la rejilla dentro de una zona con bordes no alineados', () => {
    expect(proyectarAlSuelo({ x: 0, y: 500 }, { x: 115, y: 236, ancho: 100, alto: 250 }))
      .toEqual({ x: 120, y: 480 });
  });
});
