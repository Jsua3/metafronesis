import { describe, expect, it } from 'vitest';

import { VIEW_ROWS, ViewId } from '../character/kit/kit-engine';
import {
  MARGEN_ANGULAR_GRADOS,
  Mirada,
  RETARDO_VECINA_MS,
  actualizarMirada,
  direccionDeVector,
  miradaInicial,
  mirarHacia,
  orientacionDeDato,
  pasosDeGiro,
} from './direccion-ocho';

const RAD = Math.PI / 180;
/** Vector unitario a `grados` en pantalla (0 = derecha, 90 = abajo: la y crece hacia abajo). */
const hacia = (grados: number): [number, number] => [Math.cos(grados * RAD), Math.sin(grados * RAD)];

/** Aplica una lista de pasos [dx, dy, deltaMs] y devuelve la mirada final. */
function recorrer(m: Mirada, pasos: Array<[number, number, number]>, opciones = {}): Mirada {
  return pasos.reduce((acc, [dx, dy, ms]) => actualizarMirada(acc, dx, dy, ms, opciones), m);
}

describe('direccionDeVector', () => {
  it('las 8 combinaciones de teclas dan las 8 vistas', () => {
    const teclas: Array<[number, number, ViewId]> = [
      [0, 1, 'down'], [-1, 1, 'down-left'], [-1, 0, 'left'], [-1, -1, 'up-left'],
      [0, -1, 'up'], [1, -1, 'up-right'], [1, 0, 'right'], [1, 1, 'down-right'],
    ];
    for (const [dx, dy, vista] of teclas) expect(direccionDeVector(dx, dy, null)).toBe(vista);
    expect(new Set(teclas.map(([, , v]) => v))).toEqual(new Set(VIEW_ROWS));
  });

  it('un vector nulo (o casi) no tiene dirección', () => {
    expect(direccionDeVector(0, 0, 'left')).toBeNull();
    expect(direccionDeVector(1e-9, -1e-9, null)).toBeNull();
  });

  it('cerca de la frontera entre dos vecinas conserva la anterior dentro del margen y cambia fuera de él', () => {
    expect(MARGEN_ANGULAR_GRADOS).toBe(10);
    // Frontera entre derecha (0°) y abajo-derecha (45°): 22,5°.
    expect(direccionDeVector(...hacia(22.5 + 9), 'right')).toBe('right');
    expect(direccionDeVector(...hacia(22.5 + 11), 'right')).toBe('down-right');
    expect(direccionDeVector(...hacia(22.5 - 9), 'down-right')).toBe('down-right');
    expect(direccionDeVector(...hacia(22.5 - 11), 'down-right')).toBe('right');
    // Sin anterior manda el sector más cercano.
    expect(direccionDeVector(...hacia(22.5 + 1), null)).toBe('down-right');
    // También cruzando el 180°: izquierda frente a arriba-izquierda.
    expect(direccionDeVector(...hacia(-180 + 31), 'left')).toBe('left');
    expect(direccionDeVector(...hacia(-180 + 34), 'left')).toBe('up-left');
  });

  it('una diagonal de teclado (45° exactos) siempre sale de la cardinal anterior', () => {
    expect(direccionDeVector(1, 1, 'right')).toBe('down-right');
    expect(direccionDeVector(-1, -1, 'up')).toBe('up-left');
  });
});

describe('pasosDeGiro', () => {
  it('a una vecina o a la misma vista no hay pasos intermedios', () => {
    expect(pasosDeGiro('left', 'left')).toEqual([]);
    expect(pasosDeGiro('left', 'up-left')).toEqual(['up-left']);
  });

  it('un giro de 90° o 135° pasa por las vistas de en medio, por el camino corto', () => {
    expect(pasosDeGiro('left', 'up')).toEqual(['up-left', 'up']);
    expect(pasosDeGiro('down', 'up-right')).toEqual(['down-right', 'right', 'up-right']);
    expect(pasosDeGiro('up-left', 'down-left')).toEqual(['left', 'down-left']);
  });

  it('media vuelta: de un lado al otro pasa de frente; de arriba a abajo, por el lado del objetivo', () => {
    expect(pasosDeGiro('left', 'right')).toEqual(['down-left', 'down', 'down-right', 'right']);
    expect(pasosDeGiro('up-left', 'down-right')).toEqual(['left', 'down-left', 'down', 'down-right']);
    expect(pasosDeGiro('up', 'down', -5)).toEqual(['up-left', 'left', 'down-left', 'down']);
    expect(pasosDeGiro('up', 'down', 5)).toEqual(['up-right', 'right', 'down-right', 'down']);
    expect(pasosDeGiro('down', 'up', -1)).toEqual(['down-left', 'left', 'up-left', 'up']);
  });
});

describe('actualizarMirada', () => {
  it('arranca mirando a donde se le diga (de frente si no)', () => {
    expect(miradaInicial().actual).toBe('down');
    expect(miradaInicial('up-left').actual).toBe('up-left');
  });

  it('al soltar una diagonal tecla por tecla queda mirando en diagonal', () => {
    let m = recorrer(miradaInicial('down'), [[-1, 1, 16], [-1, 1, 16], [-1, 1, 16]]);
    expect(m.actual).toBe('down-left');
    // Se suelta «abajo» un cuadro antes que «izquierda»: 30 ms de solo izquierda y luego nada.
    m = recorrer(m, [[-1, 0, 30], [0, 0, 16], [0, 0, 500]]);
    expect(m.actual).toBe('down-left');
  });

  it('una vecina sostenida el retardo después de su primer cuadro se confirma; antes, no', () => {
    expect(RETARDO_VECINA_MS).toBe(70);
    const base = recorrer(miradaInicial('down-left'), [[-1, 1, 16]]);
    expect(recorrer(base, [[-1, 0, 35], [-1, 0, 35]]).actual).toBe('down-left');
    expect(recorrer(base, [[-1, 0, 35], [-1, 0, 35], [-1, 0, 35]]).actual).toBe('left');
  });

  it('con cuadros lentos (10 fps), un solo cuadro con una tecla al soltar la diagonal no la confirma', () => {
    const m = recorrer(miradaInicial('down'), [[-1, 1, 100], [-1, 1, 100], [-1, 0, 100], [0, 0, 100]]);
    expect(m.actual).toBe('down-left');
  });

  it('un vector que oscila en la frontera entre dos vecinas no hace parpadear la vista', () => {
    let m = recorrer(miradaInicial('right'), [[1, 0, 16]]);
    const vistas = new Set<ViewId>();
    // Una persona que va a un punto a ~22° alterna entre los dos lados de la frontera cada cuadro.
    for (let k = 0; k < 60; k++) {
      m = actualizarMirada(m, ...hacia(k % 2 ? 12 : 36), 16);
      vistas.add(m.actual);
    }
    expect(vistas.size).toBe(1);
  });

  it('un giro de más de 45° empieza en el acto y pasa por las vistas de en medio', () => {
    let m = recorrer(miradaInicial('left'), [[-1, 0, 16]]);
    m = actualizarMirada(m, 1, 0, 16);
    expect(m.actual).toBe('down-left');
    const vistas: ViewId[] = [m.actual];
    for (let k = 0; k < 20; k++) {
      m = actualizarMirada(m, 1, 0, 16);
      if (vistas[vistas.length - 1] !== m.actual) vistas.push(m.actual);
    }
    expect(vistas).toEqual(['down-left', 'down', 'down-right', 'right']);
  });

  it('el giro sigue hasta el final aunque se suelten las teclas', () => {
    let m = recorrer(miradaInicial('up'), [[0, -1, 16], [0, 1, 16]]);
    expect(m.actual).not.toBe('down');
    m = recorrer(m, [[0, 0, 400]]);
    expect(m.actual).toBe('down');
  });

  it('con movimiento reducido el giro llega de una vez', () => {
    const m = recorrer(miradaInicial('left'), [[-1, 0, 16], [1, 0, 16]], { reducirMovimiento: true });
    expect(m.actual).toBe('right');
  });

  it('el giro se puede afinar: menos milisegundos por paso, giro más rápido', () => {
    const lento = recorrer(miradaInicial('left'), [[1, 0, 16], [1, 0, 100]], { msPorPaso: 90 });
    const rapido = recorrer(miradaInicial('left'), [[1, 0, 16], [1, 0, 100]], { msPorPaso: 30 });
    expect(lento.actual).toBe('down');
    expect(rapido.actual).toBe('right');
  });

  it('no muta la mirada que recibe', () => {
    const m = miradaInicial('left');
    const copia = structuredClone(m);
    actualizarMirada(m, 1, 0, 16);
    expect(m).toEqual(copia);
  });
});

describe('mirarHacia', () => {
  it('se vuelve hacia una vista dada pasando por las de en medio, y el giro avanza con actualizarMirada', () => {
    let m = mirarHacia(miradaInicial('left'), 'right');
    expect(m.actual).toBe('down-left');
    expect(m.destino).toBe('right');
    m = actualizarMirada(m, 0, 0, 1000);
    expect(m.actual).toBe('right');
  });

  it('a la vista en la que ya está no cambia nada; con movimiento reducido llega de una vez', () => {
    const m = miradaInicial('up');
    expect(mirarHacia(m, 'up')).toEqual(m);
    expect(mirarHacia(m, 'down', { reducirMovimiento: true }).actual).toBe('down');
  });

  it('elige el lado de la media vuelta por el objetivo', () => {
    expect(mirarHacia(miradaInicial('up'), 'down', {}, -3).actual).toBe('up-left');
    expect(mirarHacia(miradaInicial('up'), 'down', {}, 3).actual).toBe('up-right');
  });

  it('el siguiente movimiento no espera el retardo: quien se volvió estaba quieto', () => {
    const m = actualizarMirada(mirarHacia(miradaInicial('down'), 'down-left', { reducirMovimiento: true }), -1, 0, 16);
    expect(m.actual).toBe('left');
  });
});

describe('orientacionDeDato', () => {
  it('acepta las 8 direcciones del kit tal cual (las 4 de siempre siguen valiendo)', () => {
    for (const vista of VIEW_ROWS) expect(orientacionDeDato(vista)).toBe(vista);
  });

  it('lo desconocido o vacío mira de frente, también un nombre en español (el dato guarda los ids del kit)', () => {
    for (const raro of ['norte', 'arriba', 'arriba-derecha', '', null, undefined, 3, { x: 1 }]) expect(orientacionDeDato(raro)).toBe('down');
  });
});
