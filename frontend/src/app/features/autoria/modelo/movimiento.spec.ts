import type { SalaCaso } from './caso';
import type { Escenario } from './escenario';
import {
  NOMBRE_MOVIMIENTO, TEXTO_PERSONA_A_ATENDER, mismoMovimiento, movimientoAMetadata, movimientoDeMetadata, revisarPuntoDeIda, revisarTrayecto,
} from './movimiento';

describe('cómo se mueve una persona: lo que guarda el juego y lo que ve el docente', () => {
  it('sin dato, desconocido o mal formado se lee como quieto (igual que el juego)', () => {
    expect(movimientoDeMetadata(undefined)).toBe('quieto');
    expect(movimientoDeMetadata(null)).toBe('quieto');
    expect(movimientoDeMetadata('quieto')).toBe('quieto');
    expect(movimientoDeMetadata('vuela')).toBe('quieto');
    expect(movimientoDeMetadata([])).toBe('quieto');
    expect(movimientoDeMetadata({ tipo: 'va-y-viene' })).toBe('quieto');
    expect(movimientoDeMetadata({ tipo: 'va-y-viene', hasta: { x: 'a', y: 3 } })).toBe('quieto');
  });

  it('«deambula» se lee de las dos formas que acepta el juego', () => {
    expect(movimientoDeMetadata('deambula')).toBe('deambula');
    expect(movimientoDeMetadata({ tipo: 'deambula' })).toBe('deambula');
  });

  it('«va-y-viene» lleva el punto hasta donde va', () => {
    expect(movimientoDeMetadata({ tipo: 'va-y-viene', hasta: { x: 300, y: 340 } })).toEqual({ tipo: 'va-y-viene', hasta: { x: 300, y: 340 } });
  });

  it('se escribe como lo lee el juego: texto para quieto y deambula, objeto para ir y venir', () => {
    expect(movimientoAMetadata('quieto')).toBe('quieto');
    expect(movimientoAMetadata('deambula')).toBe('deambula');
    expect(movimientoAMetadata({ tipo: 'va-y-viene', hasta: { x: 300, y: 340 } })).toEqual({ tipo: 'va-y-viene', hasta: { x: 300, y: 340 } });
  });

  it('dos movimientos son el mismo si dicen lo mismo', () => {
    expect(mismoMovimiento('quieto', 'quieto')).toBe(true);
    expect(mismoMovimiento('quieto', 'deambula')).toBe(false);
    expect(mismoMovimiento({ tipo: 'va-y-viene', hasta: { x: 1, y: 2 } }, { tipo: 'va-y-viene', hasta: { x: 1, y: 2 } })).toBe(true);
    expect(mismoMovimiento({ tipo: 'va-y-viene', hasta: { x: 1, y: 2 } }, { tipo: 'va-y-viene', hasta: { x: 1, y: 3 } })).toBe(false);
    expect(mismoMovimiento('deambula', { tipo: 'va-y-viene', hasta: { x: 1, y: 2 } })).toBe(false);
  });

  it('las tres opciones se nombran en lenguaje del docente', () => {
    expect(NOMBRE_MOVIMIENTO).toEqual({ quieto: 'Se queda quieto', deambula: 'Camina por la sala', 'va-y-viene': 'Va y viene' });
    expect(TEXTO_PERSONA_A_ATENDER).toBe('persona a atender');
  });
});

describe('el punto hasta donde va y viene una persona', () => {
  const catalogo: Escenario['catalogo'] = {
    muebles: [
      { id: 'escritorio', nombre: 'Escritorio', arte: '', ancho: 120, alto: 60, colision: true },
      { id: 'alfombra', nombre: 'Alfombra', arte: '', ancho: 200, alto: 80, colision: false },
    ],
    objetos: [], herramientas: [],
  };
  // La huella del escritorio: x de 340 a 460, y de 300 a 360 (el punto de apoyo es su centro inferior).
  const sala: Pick<SalaCaso, 'encuadre' | 'muebles'> = {
    encuadre: 'tres-paredes',
    muebles: [{ ref: 'escritorio', x: 400, y: 360 }, { ref: 'alfombra', x: 600, y: 400 }],
  };
  const desde = { x: 200, y: 400 };

  it('un punto libre dentro de la zona por donde se camina se acepta', () => {
    expect(revisarPuntoDeIda(sala, catalogo, desde, { x: 600, y: 420 })).toEqual({ ok: true, punto: { x: 600, y: 420 } });
  });

  it('un punto que cae dentro de un mueble que choca se rechaza y dice con cuál', () => {
    const resultado = revisarPuntoDeIda(sala, catalogo, desde, { x: 400, y: 330 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('Ese punto cae dentro de «Escritorio». Elige un punto libre.');
  });

  it('un mueble que no choca (una alfombra) no estorba', () => {
    expect(revisarPuntoDeIda(sala, catalogo, desde, { x: 600, y: 400 }).ok).toBe(true);
  });

  it('la línea del suelo del mueble no cuenta como dentro: se puede estar justo delante', () => {
    expect(revisarPuntoDeIda(sala, catalogo, desde, { x: 400, y: 360 }).ok).toBe(true);
  });

  it('un punto fuera de la zona por donde se camina se rechaza', () => {
    const resultado = revisarPuntoDeIda(sala, catalogo, desde, { x: 20, y: 400 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('Ese punto queda fuera de la zona por donde se puede caminar. Elige uno dentro de la sala.');
  });

  it('un punto casi encima de la persona se rechaza: no habría camino que recorrer', () => {
    const resultado = revisarPuntoDeIda(sala, catalogo, desde, { x: 210, y: 405 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('Elige un punto un poco más lejos de donde está la persona.');
  });

  it('un mueble que el catálogo no conoce (un caso sin lugar) no estorba: el juego igual lo respeta', () => {
    const sinCatalogo: Escenario['catalogo'] = { muebles: [], objetos: [], herramientas: [] };
    expect(revisarPuntoDeIda(sala, sinCatalogo, desde, { x: 400, y: 330 }).ok).toBe(true);
  });
});


describe('trayectos', () => {
  const ruta = { tipo: 'ruta' as const, puntos: [{ x: 200, y: 250 }, { x: 300, y: 250 }], modo: 'circuito' as const };

  it('lee y guarda la ruta con la forma exacta del contrato', () => {
    expect(movimientoAMetadata(movimientoDeMetadata({ ...ruta, pausaMs: 1500 }))).toEqual({ ...ruta, pausaMs: 1500 });
  });

  it('no agrega la partida a puntos', () => {
    expect(movimientoAMetadata(movimientoDeMetadata(ruta))).toEqual(ruta);
  });

  it('revisarTrayecto rechaza 1 punto, 9 puntos, un n?mero infinito y una pausa de 10001', () => {
    for (const cambio of [
      { puntos: ruta.puntos.slice(0, 1) }, { puntos: Array(9).fill(ruta.puntos[0]) },
      { puntos: [{ x: Infinity, y: 0 }, ruta.puntos[0]] }, { pausaMs: 10001 },
    ]) expect(revisarTrayecto({ ...ruta, ...cambio }).length).toBeGreaterThan(0);
    expect(revisarTrayecto(ruta)).toEqual([]);
  });
});
