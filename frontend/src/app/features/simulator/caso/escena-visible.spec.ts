import { describe, expect, it } from 'vitest';
import { escenaRetenida, fichaDeLaSala } from './escena-visible';
import { leerGuiaAutorada } from './guia';

const antes = { key: 'llegada', title: 'La llegada' };

describe('escenaRetenida', () => {
  it('si la decisión lleva a otra escena, retiene la anterior para seguir mostrándola', () => {
    expect(escenaRetenida(antes, { key: 'sala-de-espera' })).toBe(antes);
  });

  it('si la escena es la misma, no retiene nada (no hay cambio que posponer)', () => {
    expect(escenaRetenida(antes, { key: 'llegada' })).toBeNull();
  });

  it('sin escena anterior o sin escena nueva no retiene nada', () => {
    expect(escenaRetenida(null, antes)).toBeNull();
    expect(escenaRetenida(antes, null)).toBeNull();
  });
});

describe('fichaDeLaSala', () => {
  it('muestra el título y el propósito del desvío y recupera la ficha principal al volver', () => {
    const escena = { ...antes, goal: 'Escucha a la familia.' };
    const mapa = { title: 'Entrada de urgencias', ambient: { guia: {
      paso: 0, titulo: 'Una noche en urgencias', objetivo: 'Observa cómo sigue la noche.',
      pasos: [{ texto: 'Vuelve con la familia.', lugar: 'salida' }],
    } } };
    const guia = leerGuiaAutorada(mapa.ambient);
    expect(fichaDeLaSala(escena, mapa, guia)).toEqual({ titulo: mapa.title, objetivo: 'Observa cómo sigue la noche.' });
    const regreso = { title: 'Sala de espera' };
    expect(fichaDeLaSala(escena, regreso, null)).toEqual({ titulo: escena.title, objetivo: escena.goal });
  });

  it('en una sala de ambiente publicada sin objetivo propio usa el paso de esa sala', () => {
    const guia = leerGuiaAutorada({ guia: { paso: '0', pasos: [{ texto: 'Vuelve con ella cuando quieras.' }] } });
    const ficha = fichaDeLaSala({ ...antes, goal: 'Objetivo anterior.' }, { title: 'Urgencias' }, guia);
    expect(ficha).toEqual({ titulo: 'Urgencias', objetivo: 'Vuelve con ella cuando quieras.' });
  });
});
