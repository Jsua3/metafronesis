import { readFileSync } from 'fs';
import { join } from 'path';
import { GESTOS } from './vocabulario';
import { ESTRATEGIAS_GESTO, msDeGesto, pasosDeGesto } from './gestos';

const DERECHA = { haciaJugador: { x: 1, y: 0 } } as const;

it.each(GESTOS)('«%s» vuelve a su sitio, dura a lo sumo 900 ms y se mueve poco', gesto => {
  const pasos = pasosDeGesto(gesto, DERECHA, false);
  expect(pasos.length).toBeGreaterThan(0);
  expect(pasos.reduce((s, p) => s + p.dx, 0)).toBe(0);
  expect(pasos.reduce((s, p) => s + p.dy, 0)).toBe(0);
  expect(pasos.at(-1)!.angulo).toBe(0);
  expect(msDeGesto(gesto)).toBeLessThanOrEqual(900);
  for (const p of pasos) {
    expect(Math.abs(p.dx)).toBeLessThanOrEqual(8);
    expect(Math.abs(p.angulo)).toBeLessThanOrEqual(8);
  }
});

it('se acerca hacia el jugador y se aparta en contra', () => {
  expect(pasosDeGesto('se-acerca', DERECHA, false)[0].dx).toBeGreaterThan(0);
  expect(pasosDeGesto('se-aparta', DERECHA, false)[0].dx).toBeLessThan(0);
});

it('con el jugador a la izquierda o abajo, los signos siguen al jugador', () => {
  expect(pasosDeGesto('se-acerca', { haciaJugador: { x: -1, y: 0 } }, false)[0].dx).toBeLessThan(0);
  expect(pasosDeGesto('se-acerca', { haciaJugador: { x: 0, y: 1 } }, false)[0].dy).toBeGreaterThan(0);
  expect(pasosDeGesto('se-aparta', { haciaJugador: { x: 0, y: 1 } }, false)[0].dy).toBeLessThan(0);
});

it('con movimiento reducido no hay pasos', () => {
  for (const gesto of GESTOS) expect(pasosDeGesto(gesto, DERECHA, true)).toEqual([]);
});

it('el registro cubre todo el vocabulario', () => {
  expect(Object.keys(ESTRATEGIAS_GESTO).sort()).toEqual([...GESTOS].sort());
});

it('el módulo caso/ es puro: ni Angular ni Phaser', () => {
  for (const file of ['vocabulario.ts', 'reaccion.ts', 'gestos.ts', 'guia.ts', 'cercania.ts', 'comentarios.ts', 'ensayo.ts']) {
    const source = readFileSync(join(__dirname, file), 'utf-8');
    expect(source).not.toMatch(/from '@angular|from 'phaser'/);
  }
});
