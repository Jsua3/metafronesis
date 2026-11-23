import { playerHitbox, rectsIntersect } from './player-motion.util';
import {
  PERSON_PAUSE_MAX_MS,
  PERSON_PAUSE_MIN_MS,
  PERSON_WALK_SPEED_PX_S,
  PersonWalkEnv,
  PersonWalkState,
  WalkBounds,
  bodyBlocks,
  parsePersonMovement,
  personWalkBounds,
  resumePersonWalk,
  startPersonWalk,
  tickPersonWalk,
} from './person-walk.util';
import { SceneRect } from './scene-layer.types';
import { WALK_STUCK_MS, WalkPoint } from './world-walk.util';

/**
 * Personajes que caminan (P6, tarea 4): `metadata.movimiento` = «quieto» | «deambula» | «va-y-viene». La conducta es una
 * función pura del estado, el tiempo y un mundo (colisión, límites y un generador aleatorio inyectado): aquí se prueba
 * con un mundo de rectángulos y una semilla fija, sin Phaser.
 */

/** Generador con semilla (mulberry32): mismas pruebas, mismos recorridos. */
function semilla(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOUNDS: WalkBounds = { minX: 20, minY: 20, maxX: 940, maxY: 510 };

/** Mundo de rectángulos: pisa un mueble si el hitbox de pies de (x, y) lo toca. */
function mundo(muebles: SceneRect[], rand: () => number, extra?: (x: number, y: number, from: WalkPoint) => boolean): PersonWalkEnv {
  return {
    bounds: BOUNDS,
    rand,
    blocked: (x, y, from) => muebles.some(m => rectsIntersect(playerHitbox(x, y), m)) || (extra?.(x, y, from) ?? false),
  };
}

function enZona(p: WalkPoint, muebles: SceneRect[]): boolean {
  return p.x >= BOUNDS.minX && p.x <= BOUNDS.maxX && p.y >= BOUNDS.minY && p.y <= BOUNDS.maxY
    && !muebles.some(m => rectsIntersect(playerHitbox(p.x, p.y), m));
}

const camina = (state: PersonWalkState, ms: number, env: PersonWalkEnv): PersonWalkState => tickPersonWalk(state, ms, env);

/** Deja pasar `ms` de tiempo en cuadros de `cuadro` ms (un solo cuadro nunca avanza más de 250 ms). */
function corre(state: PersonWalkState, ms: number, env: PersonWalkEnv, cuadro = 16): PersonWalkState {
  let s = state;
  for (let t = 0; t < ms; t += cuadro) s = tickPersonWalk(s, Math.min(cuadro, ms - t), env);
  return s;
}

describe('person-walk: leer metadata.movimiento', () => {
  it('ausente, desconocido o mal formado = quieto, sin lanzar', () => {
    for (const raw of [undefined, null, '', 'corre', 42, true, [], {}, { tipo: 'vuela' }, 'DEAMBULA ']) {
      expect(() => parsePersonMovement(raw)).not.toThrow();
      expect(parsePersonMovement(raw), JSON.stringify(raw)).toEqual({ tipo: 'quieto' });
    }
  });

  it('«quieto» y «deambula» como texto', () => {
    expect(parsePersonMovement('quieto')).toEqual({ tipo: 'quieto' });
    expect(parsePersonMovement('deambula')).toEqual({ tipo: 'deambula' });
  });

  it('va-y-viene lleva el punto de vuelta; la ida es la posición del objeto', () => {
    expect(parsePersonMovement({ tipo: 'va-y-viene', hasta: { x: 300, y: 120 } }))
      .toEqual({ tipo: 'va-y-viene', hasta: { x: 300, y: 120 } });
  });

  it('un va-y-viene sin «hasta» válido es quieto', () => {
    for (const hasta of [undefined, null, 5, 'x', {}, { x: 1 }, { y: 2 }, { x: '1', y: 2 }, { x: NaN, y: 2 }, { x: 1, y: Infinity }]) {
      expect(parsePersonMovement({ tipo: 'va-y-viene', hasta }), JSON.stringify(hasta)).toEqual({ tipo: 'quieto' });
    }
  });
});

describe('person-walk: quieto', () => {
  it('no se mueve nunca, haya el tiempo que haya', () => {
    const env = mundo([], semilla(1));
    let s = startPersonWalk({ tipo: 'quieto' }, { x: 200, y: 200 }, 'left', 0);
    for (let i = 0; i < 50; i++) s = camina(s, 250, env);
    expect([s.x, s.y, s.walking, s.direction]).toEqual([200, 200, false, 'left']);
  });
});

describe('person-walk: deambula', () => {
  // Una sala con muebles repartidos, uno de ellos pegado al origen.
  const MUEBLES: SceneRect[] = [
    { x: 250, y: 150, width: 90, height: 40 },
    { x: 420, y: 260, width: 40, height: 120 },
    { x: 150, y: 300, width: 160, height: 30 },
    { x: 330, y: 380, width: 60, height: 60 },
    { x: 520, y: 150, width: 30, height: 200 },
  ];
  const ORIGEN: WalkPoint = { x: 380, y: 220 };

  // req: P6 Tarea 4 (Review Focus 5)
  it('deambula nunca pisa una colisión ni sale de la zona caminable (100 pasos con semilla fija)', () => {
    const env = mundo(MUEBLES, semilla(20261027));
    let s = startPersonWalk({ tipo: 'deambula' }, ORIGEN, 'down', 0);
    let recorrido = 0;
    let previo: WalkPoint = { x: s.x, y: s.y };
    for (let paso = 0; paso < 100; paso++) {
      s = camina(s, 400, env);
      expect(enZona(s, MUEBLES), `paso ${paso}: (${s.x}, ${s.y})`).toBe(true);
      recorrido += Math.hypot(s.x - previo.x, s.y - previo.y);
      previo = { x: s.x, y: s.y };
    }
    // La prueba discrimina: de verdad camina (no se pasó 100 pasos quieta), y a la velocidad pedida como mucho.
    expect(recorrido).toBeGreaterThan(300);
    expect(recorrido).toBeLessThanOrEqual(PERSON_WALK_SPEED_PX_S * 0.4 * 100 + 1);
  });

  it('con varias semillas y a cuadros cortos tampoco pisa ni sale', () => {
    for (const seed of [1, 7, 42, 99, 12345]) {
      const env = mundo(MUEBLES, semilla(seed));
      let s = startPersonWalk({ tipo: 'deambula' }, ORIGEN, 'down', 0);
      for (let i = 0; i < 600; i++) {
        s = camina(s, 16, env);
        expect(enZona(s, MUEBLES), `semilla ${seed}, cuadro ${i}`).toBe(true);
      }
    }
  });

  it('se queda cerca de donde la puso el docente', () => {
    const env = mundo(MUEBLES, semilla(5));
    let s = startPersonWalk({ tipo: 'deambula' }, ORIGEN, 'down', 0);
    let maxima = 0;
    for (let i = 0; i < 400; i++) {
      s = camina(s, 100, env);
      maxima = Math.max(maxima, Math.hypot(s.x - ORIGEN.x, s.y - ORIGEN.y));
    }
    expect(maxima).toBeGreaterThan(30);
    expect(maxima).toBeLessThanOrEqual(200);
  });

  it('entre un destino y el siguiente espera entre 1 y 3 segundos', () => {
    const env = mundo([], semilla(3));
    let s = startPersonWalk({ tipo: 'deambula' }, { x: 480, y: 260 }, 'down', 0);
    const pausas: number[] = [];
    let caminaba = false;
    for (let i = 0; i < 3000 && pausas.length < 8; i++) {
      s = camina(s, 16, env);
      if (caminaba && !s.walking && s.pauseMs > 0) pausas.push(s.pauseMs);
      caminaba = s.walking;
    }
    expect(pausas.length).toBeGreaterThanOrEqual(5);
    for (const pausa of pausas) {
      expect(pausa).toBeGreaterThanOrEqual(PERSON_PAUSE_MIN_MS - 34);
      expect(pausa).toBeLessThanOrEqual(PERSON_PAUSE_MAX_MS);
    }
  });

  it('con la pausa inicial no se mueve hasta que termina', () => {
    const env = mundo([], semilla(9));
    let s = startPersonWalk({ tipo: 'deambula' }, { x: 480, y: 260 }, 'down', 1500);
    s = corre(s, 1400, env);
    expect([s.x, s.y, s.walking]).toEqual([480, 260, false]);
    s = corre(s, 1000, env);
    expect(s.walking).toBe(true);
  });

  // req: P6 Tarea 4 (Review Focus 5: sala llena de muebles)
  it('en una sala llena de muebles no queda atrapada: se mueve por donde hay paso', () => {
    // Rejilla de muebles con pasillos de 40 px.
    const rejilla: SceneRect[] = [];
    for (let cx = 100; cx < 900; cx += 120) {
      for (let cy = 60; cy < 500; cy += 100) rejilla.push({ x: cx, y: cy, width: 70, height: 50 });
    }
    const env = mundo(rejilla, semilla(77));
    const origen = { x: 100 + 35, y: 60 + 50 + 20 }; // en un pasillo
    expect(enZona(origen, rejilla)).toBe(true);
    let s = startPersonWalk({ tipo: 'deambula' }, origen, 'down', 0);
    let recorrido = 0;
    let previo: WalkPoint = { x: s.x, y: s.y };
    for (let i = 0; i < 1500; i++) {
      s = camina(s, 50, env);
      expect(enZona(s, rejilla), `cuadro ${i}: (${s.x}, ${s.y})`).toBe(true);
      recorrido += Math.hypot(s.x - previo.x, s.y - previo.y);
      previo = { x: s.x, y: s.y };
    }
    expect(recorrido).toBeGreaterThan(200);
  });

  it('encerrada del todo no lanza, no se mueve ni pisa nada, y sigue intentándolo', () => {
    const env = mundo([], semilla(4), () => true); // todo bloqueado
    let s = startPersonWalk({ tipo: 'deambula' }, { x: 400, y: 300 }, 'down', 0);
    for (let i = 0; i < 100; i++) s = camina(s, 500, env);
    expect([s.x, s.y, s.walking]).toEqual([400, 300, false]);
  });

  it('si el destino deja de ser alcanzable a medio camino, lo suelta tras la pausa y elige otro', () => {
    let muro = false;
    // El muro aparece a la derecha del origen cuando se activa: lo que estaba libre al elegir ya no lo está.
    const env = mundo([], semilla(11), (x) => muro && x > 410);
    let s = startPersonWalk({ tipo: 'deambula' }, { x: 400, y: 300 }, 'down', 0);
    // Avanza hasta que haya un destino hacia la derecha o se agoten los intentos.
    let intentos = 0;
    while (intentos++ < 200 && !(s.target && s.target.x > 440)) {
      s = camina(s, 500, env);
      if (s.target && s.target.x <= 440) s = { ...s, target: null, pauseMs: 0 };
    }
    expect(s.target && s.target.x > 440).toBe(true);
    muro = true;
    // Se rinde con una pausa de 1 a 3 s.
    let rendida = false;
    // Llega hasta el muro (puede estar lejos), choca, pasa el tiempo de atasco y se rinde.
    for (let t = 0; t <= 15_000 + WALK_STUCK_MS && !rendida; t += 16) {
      s = camina(s, 16, env);
      rendida = s.target === null && s.pauseMs >= PERSON_PAUSE_MIN_MS - 34;
    }
    expect(rendida).toBe(true);
    // Retira el muro: tras la pausa vuelve a caminar hacia otro destino.
    muro = false;
    for (let i = 0; i < 400 && !s.walking; i++) s = camina(s, 50, env);
    expect(s.walking).toBe(true);
  });
});

describe('person-walk: va-y-viene', () => {
  const IDA: WalkPoint = { x: 100, y: 200 };
  const VUELTA: WalkPoint = { x: 220, y: 200 };

  // req: P6 Tarea 4
  it('va-y-viene alterna entre los dos puntos', () => {
    const env = mundo([], semilla(8));
    let s = startPersonWalk({ tipo: 'va-y-viene', hasta: VUELTA }, IDA, 'down', 0);
    const llegadas: WalkPoint[] = [];
    let caminaba = false;
    for (let i = 0; i < 6000 && llegadas.length < 6; i++) {
      s = camina(s, 16, env);
      if (caminaba && !s.walking) llegadas.push({ x: Math.round(s.x), y: Math.round(s.y) });
      caminaba = s.walking;
    }
    expect(llegadas).toEqual([VUELTA, IDA, VUELTA, IDA, VUELTA, IDA]);
  });

  it('siempre va sobre la línea entre los dos puntos y mira hacia donde camina', () => {
    const env = mundo([], semilla(8));
    let s = startPersonWalk({ tipo: 'va-y-viene', hasta: VUELTA }, IDA, 'down', 0);
    const miradas: string[] = [];
    for (let i = 0; i < 1500; i++) {
      s = camina(s, 16, env);
      expect(s.y).toBe(200);
      expect(s.x).toBeGreaterThanOrEqual(IDA.x - 0.001);
      expect(s.x).toBeLessThanOrEqual(VUELTA.x + 0.001);
      if (s.walking) miradas.push(s.direction);
    }
    // Camina mirando a izquierda o derecha; al dar la vuelta pasa de frente por las vistas de en medio (80 ms cada una).
    expect(new Set(miradas)).toEqual(new Set(['left', 'right', 'down-left', 'down', 'down-right']));
    expect(miradas.filter(v => v === 'left' || v === 'right').length / miradas.length).toBeGreaterThan(0.9);
  });

  it('espera 1 a 3 segundos en cada extremo', () => {
    const env = mundo([], semilla(2));
    let s = startPersonWalk({ tipo: 'va-y-viene', hasta: VUELTA }, IDA, 'down', 0);
    const pausas: number[] = [];
    let caminaba = false;
    for (let i = 0; i < 4000 && pausas.length < 4; i++) {
      s = camina(s, 16, env);
      if (caminaba && !s.walking) pausas.push(s.pauseMs);
      caminaba = s.walking;
    }
    expect(pausas).toHaveLength(4);
    for (const pausa of pausas) {
      expect(pausa).toBeGreaterThanOrEqual(PERSON_PAUSE_MIN_MS - 34);
      expect(pausa).toBeLessThanOrEqual(PERSON_PAUSE_MAX_MS);
    }
  });

  it('un mueble en medio no se atraviesa: se rinde, vuelve atrás y no queda atrapada', () => {
    const mueble: SceneRect[] = [{ x: 150, y: 150, width: 20, height: 100 }];
    const env = mundo(mueble, semilla(6));
    let s = startPersonWalk({ tipo: 'va-y-viene', hasta: VUELTA }, IDA, 'down', 0);
    let xMax = 0;
    for (let i = 0; i < 1500; i++) {
      s = camina(s, 50, env);
      expect(enZona(s, mueble), `cuadro ${i}`).toBe(true);
      xMax = Math.max(xMax, s.x);
    }
    expect(xMax).toBeLessThan(150);
    // Sigue yendo y viniendo (no se queda parada para siempre contra el mueble).
    let movimientos = 0;
    let caminaba = s.walking;
    for (let i = 0; i < 3000; i++) {
      s = camina(s, 50, env);
      if (s.walking && !caminaba) movimientos++;
      caminaba = s.walking;
    }
    expect(movimientos).toBeGreaterThan(2);
  });
});

describe('person-walk: el cuerpo del jugador es un obstáculo móvil', () => {
  it('bodyBlocks: pisar al jugador bloquea, estar lejos no', () => {
    const jugador = { x: 300, y: 300 };
    expect(bodyBlocks({ x: 305, y: 300 }, { x: 320, y: 300 }, jugador)).toBe(true);
    expect(bodyBlocks({ x: 400, y: 300 }, { x: 410, y: 300 }, jugador)).toBe(false);
    expect(bodyBlocks({ x: 305, y: 300 }, { x: 320, y: 300 }, null)).toBe(false);
  });

  it('si el jugador ya la tiene encima (se le echó encima), alejarse sí se puede; acercarse no', () => {
    const jugador = { x: 300, y: 300 };
    expect(bodyBlocks({ x: 306, y: 300 }, { x: 304, y: 300 }, jugador)).toBe(false);
    expect(bodyBlocks({ x: 302, y: 300 }, { x: 304, y: 300 }, jugador)).toBe(true);
  });

  it('un va-y-viene con el jugador plantado en su camino se detiene antes y nunca se superpone', () => {
    const jugador = { x: 160, y: 200 };
    const env = mundo([], semilla(13), (x, y, from) => bodyBlocks({ x, y }, from, jugador));
    let s = startPersonWalk({ tipo: 'va-y-viene', hasta: { x: 220, y: 200 } }, { x: 100, y: 200 }, 'down', 0);
    for (let i = 0; i < 1500; i++) {
      s = camina(s, 50, env);
      expect(rectsIntersect(playerHitbox(s.x, s.y), playerHitbox(jugador.x, jugador.y)), `cuadro ${i}: (${s.x}, ${s.y})`).toBe(false);
    }
    expect(s.x).toBeLessThan(160);
  });

  it('una deambula con el jugador moviéndose nunca lo pisa', () => {
    let jugador: WalkPoint = { x: 480, y: 260 };
    const env = mundo([], semilla(31), (x, y, from) => bodyBlocks({ x, y }, from, jugador));
    let s = startPersonWalk({ tipo: 'deambula' }, { x: 480, y: 260 }, 'down', 0);
    // El jugador empieza lejos y camina hacia la persona, la rebasa y vuelve.
    jugador = { x: 300, y: 260 };
    let paso = 0;
    for (let i = 0; i < 1200; i++) {
      jugador = { x: 300 + 180 * (0.5 + 0.5 * Math.sin(paso / 40)), y: 260 + 40 * Math.sin(paso / 17) };
      paso++;
      const antes = { x: s.x, y: s.y };
      s = camina(s, 50, env);
      const solapa = rectsIntersect(playerHitbox(s.x, s.y), playerHitbox(jugador.x, jugador.y));
      const seAcerco = Math.hypot(s.x - jugador.x, s.y - jugador.y) < Math.hypot(antes.x - jugador.x, antes.y - jugador.y);
      // Si hay solape lo causó el jugador al echársele encima, nunca un paso de la persona hacia él.
      if (solapa) expect(seAcerco, `cuadro ${i}`).toBe(false);
    }
  });
});

describe('person-walk: velocidad y pasos', () => {
  it('avanza a PERSON_WALK_SPEED_PX_S sin importar los cuadros por segundo', () => {
    const env = mundo([], semilla(1));
    const largo = startPersonWalk({ tipo: 'va-y-viene', hasta: { x: 900, y: 200 } }, { x: 100, y: 200 }, 'down', 0);
    const lento = corre(largo, 1000, env, 200); // 5 fps
    const rapido = corre(largo, 1000, env, 10); // 100 fps
    expect(lento.x - 100).toBeCloseTo(PERSON_WALK_SPEED_PX_S, 0);
    expect(rapido.x - 100).toBeCloseTo(PERSON_WALK_SPEED_PX_S, 0);
  });

  it('un cuadro enorme (volver de otra pestaña) no la teletransporta', () => {
    const env = mundo([], semilla(1));
    const largo = startPersonWalk({ tipo: 'va-y-viene', hasta: { x: 900, y: 200 } }, { x: 100, y: 200 }, 'down', 0);
    const s = camina(largo, 60_000, env);
    expect(s.x - 100).toBeLessThan(PERSON_WALK_SPEED_PX_S * 0.3);
  });
});

describe('person-walk: la zona caminable del encuadre (revisión final · B1)', () => {
  const TRES_PAREDES = { x: 96, y: 236, ancho: 768, alto: 250 };

  it('sin zona, los límites son toda la sala con su margen, como siempre', () => {
    expect(personWalkBounds(960, 528)).toEqual({ minX: 24, minY: 24, maxX: 936, maxY: 504 });
  });

  it('con zona, los límites son los de la zona caminable con el hitbox de pies (22 × 16) entero dentro, no los del cuarto', () => {
    // El hitbox mide 11 px a cada lado de los pies y 16 de alto: es lo que el servidor hace valer con las paredes de la copia.
    expect(personWalkBounds(960, 528, 24, TRES_PAREDES)).toEqual({ minX: 107, minY: 252, maxX: 853, maxY: 486 });
  });

  it('el marcador de una persona sin apoyo en los pies está 16 px sobre sus pies: la zona se corre lo mismo', () => {
    expect(personWalkBounds(960, 528, 24, TRES_PAREDES, 16)).toEqual({ minX: 107, minY: 236, maxX: 853, maxY: 470 });
  });

  it('una zona que se sale del cuarto no lo agranda: manda el margen de la sala', () => {
    expect(personWalkBounds(960, 528, 24, { x: 0, y: 0, ancho: 960, alto: 528 })).toEqual({ minX: 24, minY: 24, maxX: 936, maxY: 504 });
  });

  it('deambular con esos límites jamás sale de la zona, aunque el mundo no bloquee nada (un caso viejo sin paredes)', () => {
    const bounds = personWalkBounds(960, 528, 24, TRES_PAREDES);
    const env: PersonWalkEnv = { bounds, rand: semilla(7), blocked: () => false };
    let s = startPersonWalk({ tipo: 'deambula' }, { x: 120, y: 260 });
    let recorrido = 0;
    for (let t = 0; t < 120_000; t += 16) {
      const antes = { x: s.x, y: s.y };
      s = tickPersonWalk(s, 16, env);
      recorrido += Math.hypot(s.x - antes.x, s.y - antes.y);
      expect(s.x, `x en ${t} ms`).toBeGreaterThanOrEqual(bounds.minX);
      expect(s.x).toBeLessThanOrEqual(bounds.maxX);
      expect(s.y, `y en ${t} ms`).toBeGreaterThanOrEqual(bounds.minY);
      expect(s.y).toBeLessThanOrEqual(bounds.maxY);
    }
    expect(recorrido, 'caminó de verdad').toBeGreaterThan(200);
  });
});

/** Revisión final · C2: lo que la escena recuerda de una persona al reconstruir la sala, y cuándo vale todavía. */
describe('resumePersonWalk: retomar donde iba al reconstruir la sala', () => {
  const origen = { x: 300, y: 240 };
  const caminando: PersonWalkState = {
    ...startPersonWalk({ tipo: 'deambula' }, origen), x: 340, y: 262, target: { x: 380, y: 280 }, pauseMs: 0, walking: true, direction: 'right',
  };

  it('devuelve el estado guardado si el movimiento y el origen siguen siendo los mismos', () => {
    expect(resumePersonWalk(caminando, { tipo: 'deambula' }, { x: 300, y: 240 })).toBe(caminando);
    const ida = startPersonWalk({ tipo: 'va-y-viene', hasta: { x: 400, y: 240 } }, origen);
    expect(resumePersonWalk(ida, { tipo: 'va-y-viene', hasta: { x: 400, y: 240 } }, origen)).toBe(ida);
  });

  it('no devuelve nada si no había nada guardado', () => {
    expect(resumePersonWalk(undefined, { tipo: 'deambula' }, origen)).toBeNull();
  });

  it('empieza de nuevo si cambió el origen, el tipo de movimiento o el punto de ida', () => {
    expect(resumePersonWalk(caminando, { tipo: 'deambula' }, { x: 301, y: 240 })).toBeNull();
    expect(resumePersonWalk(caminando, { tipo: 'va-y-viene', hasta: { x: 400, y: 240 } }, origen)).toBeNull();
    const ida = startPersonWalk({ tipo: 'va-y-viene', hasta: { x: 400, y: 240 } }, origen);
    expect(resumePersonWalk(ida, { tipo: 'va-y-viene', hasta: { x: 410, y: 240 } }, origen)).toBeNull();
  });
});
