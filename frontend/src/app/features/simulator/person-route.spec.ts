import { parsePersonMovement, startPersonWalk, tickPersonWalk, resumePersonWalk, PersonWalkEnv } from './person-walk.util';

const env: PersonWalkEnv = { bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 }, rand: () => 0.5, blocked: () => false };
const origen = { x: 100, y: 100 };
const puntos = [{ x: 120, y: 100 }, { x: 120, y: 120 }];

describe('trayecto de personas', () => {
  it('lee una ruta válida y rechaza datos mal formados', () => {
    expect(parsePersonMovement({ tipo: 'ruta', puntos, modo: 'circuito', pausaMs: 0 })).toEqual({ tipo: 'ruta', puntos, modo: 'circuito', pausaMs: 0 });
    for (const dato of [{ tipo: 'ruta', puntos: [puntos[0]], modo: 'circuito' }, { tipo: 'ruta', puntos, modo: 'otro' }, { tipo: 'ruta', puntos, modo: 'circuito', pausaMs: -1 }, { tipo: 'ruta', puntos: [{ x: NaN, y: 0 }, puntos[0]], modo: 'circuito' }]) expect(parsePersonMovement(dato)).toEqual({ tipo: 'quieto' });
  });
  for (const [modo, esperado] of [['circuito', [puntos[0], puntos[1], origen, puntos[0]]], ['ida-y-vuelta', [puntos[0], puntos[1], puntos[0], origen]]] as const) {
    it(`recorre ${modo}`, () => {
      let s = startPersonWalk({ tipo: 'ruta', puntos, modo, pausaMs: 500 }, origen);
      const llegadas = [];
      for (let i = 0; i < 1000 && llegadas.length < 4; i++) {
        const antes = s;
        s = tickPersonWalk(s, 16, env);
        if (antes.pauseMs === 0 && s.pauseMs > 0) llegadas.push({ x: s.x, y: s.y });
      }
      expect(llegadas).toEqual(esperado);
    });
  }
  it('ante un estorbo fijo no lo atraviesa, no se sale de su tramo recto y vuelve por él', () => {
    // Tramo diagonal de (100, 100) a (160, 160) con un estorbo a partir de x = 110: deslizándose bajaría pegada a él.
    let s = startPersonWalk({ tipo: 'ruta', puntos: [{ x: 160, y: 160 }, { x: 100, y: 160 }], modo: 'circuito', pausaMs: 0 }, origen);
    const bloqueado = { ...env, blocked: (x: number) => x > 110 };
    let maxX = 0;
    let volvio = false;
    for (let i = 0; i < 2000; i++) {
      s = tickPersonWalk(s, 16, bloqueado);
      expect(Math.abs((s.x - 100) - (s.y - 100))).toBeLessThan(1e-9);
      maxX = Math.max(maxX, s.x);
      if (maxX > 109 && s.x === origen.x && s.y === origen.y) volvio = true;
    }
    expect(maxX).toBeLessThanOrEqual(110);
    expect(volvio).toBe(true);
  });
  it('ante un estorbo que se va (el estudiante) espera y sigue al mismo punto', () => {
    let s = startPersonWalk({ tipo: 'ruta', puntos: [{ x: 160, y: 100 }, { x: 160, y: 140 }], modo: 'circuito', pausaMs: 0 }, origen);
    let estorba = true;
    const ambiente = { ...env, blocked: (x: number) => estorba && x > 110 };
    for (let i = 0; i < 120; i++) s = tickPersonWalk(s, 16, ambiente);
    expect(s.x).toBeLessThanOrEqual(110);
    expect(s.routeIndex).toBe(1);
    estorba = false;
    for (let i = 0; i < 1000 && s.routeIndex === 1; i++) s = tickPersonWalk(s, 16, ambiente);
    expect(s.routeIndex).toBe(2);
    expect({ x: s.x, y: s.y }).toEqual({ x: 160, y: 100 });
  });
  it('no retoma un estado cuando cambia la ruta', () => {
    const ruta = { tipo: 'ruta' as const, puntos, modo: 'circuito' as const };
    expect(resumePersonWalk(startPersonWalk(ruta, origen), { ...ruta, pausaMs: 0 }, origen)).toBeNull();
  });
  it('aplica la pausa predeterminada o la fija al llegar', () => {
    for (const [pausaMs, esperada] of [[undefined, 2000], [10000, 10000]] as const) {
      let s = startPersonWalk({ tipo: 'ruta', puntos, modo: 'circuito', pausaMs }, origen);
      for (let i = 0; i < 100 && s.routeIndex === 1; i++) s = tickPersonWalk(s, 16, env);
      expect(s.routeIndex).toBe(2);
      expect(s.pauseMs).toBeGreaterThan(esperada - 20);
      expect(s.pauseMs).toBeLessThanOrEqual(esperada);
    }
  });
  it('rechaza coordenadas que el servidor no puede aceptar', () => {
    expect(parsePersonMovement({ tipo: 'ruta', puntos: [{ x: 1000001, y: 0 }, puntos[0]], modo: 'circuito' })).toEqual({ tipo: 'quieto' });
  });
});
