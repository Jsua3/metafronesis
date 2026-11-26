import {
  ESCALON_MS, TOPE_DE_CAMINATA_MS, alfaReducido, leerAcompanantes, muestrearAcompanante, planearAcompanantes, planearDesvanecimiento,
  rutaEsquivando,
} from './acompanantes';

const LIMITES = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
const LIBRE = { bloqueado: () => false, limites: LIMITES };
/** Un muro vertical de x=190..210 con un hueco abajo (y >= 170). */
const MURO = { bloqueado: (x: number, y: number) => x >= 190 && x <= 210 && y < 170, limites: LIMITES };

describe('rutaEsquivando', () => {
  it('con el paso libre va en línea recta', () => {
    expect(rutaEsquivando({ x: 10, y: 100 }, { x: 100, y: 100 }, LIBRE)).toEqual([{ x: 100, y: 100 }]);
  });

  it('rodea un muro por el hueco y nunca pisa lo bloqueado', () => {
    const ruta = rutaEsquivando({ x: 100, y: 100 }, { x: 300, y: 100 }, MURO);
    expect(ruta.length).toBeGreaterThan(1);
    expect(ruta[ruta.length - 1]).toEqual({ x: 300, y: 100 });
    let previo = { x: 100, y: 100 };
    for (const p of ruta) {
      for (let t = 0; t <= 1; t += 0.02) {
        expect(MURO.bloqueado(previo.x + (p.x - previo.x) * t, previo.y + (p.y - previo.y) * t)).toBe(false);
      }
      previo = p;
    }
  });

  it('si no hay paso, cae a la línea recta en vez de colgarse', () => {
    const cerrado = { bloqueado: (x: number) => x >= 190 && x <= 210, limites: LIMITES };
    expect(rutaEsquivando({ x: 100, y: 100 }, { x: 300, y: 100 }, cerrado)).toEqual([{ x: 300, y: 100 }]);
  });

  it('una puerta sobre su propia pared (llegada bloqueada) igual se alcanza', () => {
    const pared = { bloqueado: (_x: number, y: number) => y < 20, limites: LIMITES };
    expect(rutaEsquivando({ x: 100, y: 120 }, { x: 100, y: 10 }, pared).slice(-1)[0]).toEqual({ x: 100, y: 10 });
  });
});

describe('planearAcompanantes', () => {
  const puerta = { x: 200, y: 40 };
  const entradas = [
    { key: 'abuela', desde: { x: 120, y: 80 } },
    { key: 'hermano', desde: { x: 260, y: 90 } },
    { key: 'nina', desde: { x: 200, y: 120 } },
  ];

  it('escalona a cada persona en el orden de la lista', () => {
    const plan = planearAcompanantes(entradas, puerta, LIBRE);
    expect(plan.pasos.map(p => p.key)).toEqual(['abuela', 'hermano', 'nina']);
    expect(plan.pasos.map(p => p.inicioMs)).toEqual([0, ESCALON_MS, ESCALON_MS * 2]);
  });

  it('tres personas cerca de la puerta caben en ~3,5 s', () => {
    expect(planearAcompanantes(entradas, puerta, LIBRE).totalMs).toBeLessThanOrEqual(3500);
  });

  it('un trayecto largo se acelera: ninguna caminata pasa del tope', () => {
    const plan = planearAcompanantes([{ key: 'lejos', desde: { x: 0, y: 290 } }], { x: 400, y: 0 }, LIBRE);
    expect(plan.pasos[0].caminaMs).toBeLessThanOrEqual(TOPE_DE_CAMINATA_MS + 1);
  });

  it('sin acompañantes no dura nada', () => {
    expect(planearAcompanantes([], puerta, LIBRE)).toEqual({ pasos: [], totalMs: 0 });
  });
});

describe('muestrearAcompanante', () => {
  const desde = { x: 0, y: 100 };
  const paso = planearAcompanantes([{ key: 'a', desde }, { key: 'b', desde }], { x: 100, y: 100 }, LIBRE).pasos[1];

  it('antes de su turno está quieta y visible en su sitio', () => {
    expect(muestrearAcompanante(paso, desde, 100)).toMatchObject({ x: 0, y: 100, alfa: 1, caminando: false, cruzo: false });
  });

  it('en camino mira hacia donde va y avanza', () => {
    const m = muestrearAcompanante(paso, desde, paso.inicioMs + paso.caminaMs / 2);
    expect(m.vista).toBe('right');
    expect(m.x).toBeGreaterThan(30);
    expect(m.x).toBeLessThan(70);
    expect(m.caminando).toBe(true);
  });

  it('al llegar cruzó y no se ve', () => {
    const m = muestrearAcompanante(paso, desde, paso.inicioMs + paso.caminaMs + 50);
    expect(m).toMatchObject({ x: 100, y: 100, alfa: 0, cruzo: true });
  });
});

describe('movimiento reducido y lectura de datos', () => {
  it('se desvanecen escalonadas sin caminar', () => {
    expect(planearDesvanecimiento(['a', 'b', 'c']).totalMs).toBe(2 * 80 + 200);
    expect(alfaReducido(0, 0)).toBe(1);
    expect(alfaReducido(0, 200)).toBe(0);
    expect(alfaReducido(2, 100)).toBe(1);
  });

  it('lee las claves y descarta lo que no es texto o se repite', () => {
    expect(leerAcompanantes({ acompanantes: ['a', ' b ', 'a', '', 3, null] })).toEqual(['a', 'b']);
    expect(leerAcompanantes({ acompanantes: 'a' })).toEqual([]);
    expect(leerAcompanantes(undefined)).toEqual([]);
  });
});
