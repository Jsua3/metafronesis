import {
  EXIT_PENALTY_PX,
  HYSTERESIS_PX,
  LABEL_MAX_SCREEN_WIDTH_PX,
  LABEL_MIN_SCREEN_PX,
  MARKER_INTERACT_RADIUS,
  NPC_BONUS_PX,
  NPC_INTERACT_RADIUS,
  NPC_SERVER_REACH_PX,
  NearbyCandidate,
  REVEAL_RADIUS,
  labelScaleFor,
  pickNearby,
  selectRevealed,
} from './interaction-priority.util';

const npc = (key: string, distance: number): NearbyCandidate =>
  ({ key: `npc:${key}`, kind: 'npc', exit: false, distance, radius: NPC_INTERACT_RADIUS });
const marker = (key: string, distance: number, exit = false): NearbyCandidate =>
  ({ key, kind: 'marker', exit, distance, radius: MARKER_INTERACT_RADIUS });

describe('constantes de interacción', () => {
  it('el cliente nunca promete más que el servidor (NPC 60 + 16 de tolerancia, marcadores 120)', () => {
    expect(NPC_INTERACT_RADIUS).toBe(72);
    expect(NPC_INTERACT_RADIUS).toBeLessThanOrEqual(60 + 16);
    expect(MARKER_INTERACT_RADIUS).toBe(74);
    expect(MARKER_INTERACT_RADIUS).toBeLessThanOrEqual(120);
    expect(REVEAL_RADIUS).toBe(140);
    expect([NPC_BONUS_PX, EXIT_PENALTY_PX, HYSTERESIS_PX]).toEqual([18, 12, 8]);
  });
});

describe('pickNearby', () => {
  it('sin candidatos no hay principal ni secundario', () => {
    expect(pickNearby([], null)).toEqual({ primary: null, secondary: null });
  });

  it('descarta lo que está fuera de su radio', () => {
    const far = marker('tool-pap', MARKER_INTERACT_RADIUS + 1);
    const farNpc = npc('enfermera-urgencias', NPC_INTERACT_RADIUS + 1);
    expect(pickNearby([far, farNpc], null)).toEqual({ primary: null, secondary: null });
  });

  it('una persona gana a un marcador a la misma distancia (el NPC tiene bono)', () => {
    const { primary, secondary } = pickNearby([marker('zona-restringida', 40), npc('medico-guardia', 40)], null);
    expect(primary?.key).toBe('npc:medico-guardia');
    expect(secondary?.key).toBe('zona-restringida');
  });

  it('una puerta a igual distancia que una persona pasa a secundaria', () => {
    const { primary, secondary } = pickNearby([marker('puerta-sala-escucha', 30, true), npc('psicologa-orientadora', 30)], null);
    expect(primary?.key).toBe('npc:psicologa-orientadora');
    expect(secondary?.key).toBe('puerta-sala-escucha');
  });

  it('un marcador claramente más cercano que la persona sigue ganando', () => {
    const { primary } = pickNearby([marker('tool-pap', 5), npc('enfermera-urgencias', 60)], null);
    expect(primary?.key).toBe('tool-pap');
  });

  it('empate exacto de puntaje: gana el NPC aunque llegue después en la lista', () => {
    // marcador 20 vs NPC 38 con bono 18 → ambos puntúan 20
    const { primary } = pickNearby([marker('a', 20), npc('b', 38)], null);
    expect(primary?.key).toBe('npc:b');
  });

  it('el secundario es el mejor del resto y es null si solo hay uno', () => {
    const only = pickNearby([marker('tool-pap', 30)], null);
    expect(only.primary?.key).toBe('tool-pap');
    expect(only.secondary).toBeNull();
    const three = pickNearby([marker('c', 60), marker('a', 20), marker('b', 40)], null);
    expect([three.primary?.key, three.secondary?.key]).toEqual(['a', 'b']);
  });

  describe('histéresis', () => {
    it('el candidato actual aguanta ocho píxeles fuera de su radio', () => {
      const justOut = marker('tool-pap', MARKER_INTERACT_RADIUS + HYSTERESIS_PX);
      expect(pickNearby([justOut], 'tool-pap').primary?.key).toBe('tool-pap');
      expect(pickNearby([justOut], null).primary).toBeNull();
      const tooFar = marker('tool-pap', MARKER_INTERACT_RADIUS + HYSTERESIS_PX + 1);
      expect(pickNearby([tooFar], 'tool-pap').primary).toBeNull();
    });

    it('una persona aguanta solo hasta lo que acepta el servidor (60 + 16), nunca los ocho píxeles completos', () => {
      expect(NPC_SERVER_REACH_PX).toBe(76);
      const holds = npc('enfermera-urgencias', NPC_SERVER_REACH_PX);
      expect(pickNearby([holds], 'npc:enfermera-urgencias').primary?.key).toBe('npc:enfermera-urgencias');
      const tooFar = npc('enfermera-urgencias', NPC_SERVER_REACH_PX + 1);
      expect(pickNearby([tooFar], 'npc:enfermera-urgencias').primary).toBeNull();
      // sin ser la actual, a 73 px ya no se ofrece
      expect(pickNearby([npc('enfermera-urgencias', NPC_INTERACT_RADIUS + 1)], null).primary).toBeNull();
    });

    it('no cambia de objetivo por una ventaja menor que la histéresis', () => {
      // actual: 40; nuevo: 35 (mejora 5 < 8) → se queda
      const { primary, secondary } = pickNearby([marker('actual', 40), marker('nuevo', 35)], 'actual');
      expect(primary?.key).toBe('actual');
      expect(secondary?.key).toBe('nuevo');
    });

    it('cambia cuando la ventaja supera la histéresis', () => {
      const { primary } = pickNearby([marker('actual', 40), marker('nuevo', 20)], 'actual');
      expect(primary?.key).toBe('nuevo');
    });

    it('con una clave actual que ya no existe se comporta como sin histéresis', () => {
      const { primary } = pickNearby([marker('a', 30)], 'fantasma');
      expect(primary?.key).toBe('a');
    });
  });

  describe('caso medido en los playtests: psicóloga (780,440) y puerta (838,440)', () => {
    const PSI = { x: 780, y: 440 };
    const DOOR = { x: 838, y: 440 };
    const at = (x: number, y: number) => pickNearby([
      npc('psicologa-orientadora', Math.hypot(x - PSI.x, y - PSI.y)),
      marker('puerta-sala-escucha', Math.hypot(x - DOOR.x, y - DOOR.y), true),
    ], null).primary?.key;

    it('en x=810 gana la psicóloga; en x=840 la puerta; en x=825 la puerta por poco', () => {
      expect(at(810, 440)).toBe('npc:psicologa-orientadora');
      expect(at(840, 440)).toBe('puerta-sala-escucha');
      expect(at(825, 440)).toBe('puerta-sala-escucha');
      expect(at(820, 440)).toBe('npc:psicologa-orientadora');
    });

    it('en la rejilla de 27 posiciones con la persona en rango la persona gana en 26 y la puerta solo sobre ella', () => {
      const wins = { persona: 0, puerta: 0 };
      let inRange = 0;
      for (let dx = -60; dx <= 60; dx += 20) {
        for (let dy = -40; dy <= 40; dy += 20) {
          const x = PSI.x + dx, y = PSI.y + dy;
          if (Math.hypot(dx, dy) > 60) continue;
          inRange += 1;
          if (at(x, y) === 'npc:psicologa-orientadora') wins.persona += 1; else wins.puerta += 1;
        }
      }
      expect(inRange).toBe(27);
      expect(wins).toEqual({ persona: 26, puerta: 1 });
      expect(at(840, 440)).toBe('puerta-sala-escucha'); // la única: el jugador está sobre la puerta
    });
  });

  it('pegado al médico gana el médico frente a «Acceso a quirófano» (TOUCH-12)', () => {
    // jugador en (640,290): médico a 0 px; zona restringida en (660,268) a ≈29,7 px
    const zona = marker('zona-restringida', Math.hypot(640 - 660, 290 - 268));
    const { primary, secondary } = pickNearby([zona, npc('medico-guardia', 0)], null);
    expect(primary?.key).toBe('npc:medico-guardia');
    expect(secondary?.key).toBe('zona-restringida');
  });

  it('no muta la lista que recibe', () => {
    const list = [marker('b', 40), npc('a', 30)];
    const copy = list.map(c => ({ ...c }));
    pickNearby(list, 'b');
    expect(list).toEqual(copy);
  });
});

describe('selectRevealed', () => {
  const none = new Set<string>();
  const reveal = (c: NearbyCandidate[], target: string | null, primary: string | null, max = 2, dimmed = none) =>
    selectRevealed(c, target, primary, dimmed, max, []);

  it('sin destino ni nadie dentro de 140 px no se enseña ningún rótulo', () => {
    expect(reveal([marker('a', REVEAL_RADIUS + 1), npc('b', 200)], null, null)).toEqual([]);
  });

  it('el destino se ve siempre, aunque esté lejos', () => {
    expect(reveal([marker('tool-pap', 600), marker('otro', 90)], 'tool-pap', null)).toEqual(['tool-pap', 'otro']);
  });

  it('un destino que no existe en la sala no se inventa', () => {
    expect(reveal([marker('a', 50)], 'fantasma', null)).toEqual(['a']);
  });

  it('destino más los dos más cercanos de 140 px, ordenados por distancia, y ningún otro', () => {
    const list = [marker('lejos', 130), marker('cerca', 20), npc('medio', 60), marker('tope', 90), marker('fuera', 141)];
    expect(reveal(list, 'lejos', null)).toEqual(['lejos', 'cerca', 'npc:medio']);
  });

  it('en táctil (1 extra) solo el destino y el más cercano', () => {
    const list = [marker('destino', 100), marker('cerca', 20), npc('medio', 60)];
    expect(reveal(list, 'destino', null, 1)).toEqual(['destino', 'cerca']);
  });

  it('el principal siempre se ve y cuenta dentro del tope, aunque no sea el más cercano', () => {
    // la persona es el principal (bono) aunque el marcador esté 5 px más cerca
    const list = [marker('marcador', 30), npc('persona', 35), marker('otro', 50)];
    expect(reveal(list, null, 'npc:persona')).toEqual(['npc:persona', 'marcador']);
  });

  it('si el destino es el principal no gasta una segunda ranura', () => {
    const list = [marker('tool-pap', 30), marker('a', 40), marker('b', 50), marker('c', 60)];
    expect(reveal(list, 'tool-pap', 'tool-pap')).toEqual(['tool-pap', 'a', 'b']);
  });

  it('un objeto atenuado solo se revela dentro de su propio radio de interacción', () => {
    const dimmed = new Set(['marco-normativo-hospital']);
    const far = { ...marker('marco-normativo-hospital', 100) };
    const near = { ...marker('marco-normativo-hospital', 60) };
    expect(reveal([far, marker('b', 120)], null, null, 2, dimmed)).toEqual(['b']);
    expect(reveal([near, marker('b', 120)], null, null, 2, dimmed)).toEqual(['marco-normativo-hospital', 'b']);
  });

  it('trata igual a todos los objetos: el tipo no cambia nada, solo la distancia', () => {
    const doorFirst = reveal([marker('puerta', 40, true), marker('objeto', 41), npc('persona', 42)], null, null);
    expect(doorFirst).toEqual(['puerta', 'objeto']);
  });

  it('reutiliza el arreglo de salida y no lo deja con restos de la llamada anterior', () => {
    const out: string[] = ['viejo-1', 'viejo-2', 'viejo-3'];
    const result = selectRevealed([marker('a', 10)], null, null, none, 2, out);
    expect(result).toBe(out);
    expect(out).toEqual(['a']);
  });
});

describe('labelScaleFor', () => {
  it('en pantallas grandes no agranda (mínimo 1)', () => {
    expect(labelScaleFor(0.5, 1)).toBe(1);
    expect(labelScaleFor(0.84, 1)).toBe(1);
  });

  it('a 844x390 (960 / 478 ≈ 2,0 px de canvas por px de pantalla) un rótulo de 11 px mide 12 px de pantalla', () => {
    const displayScale = 960 / 478;
    const scale = labelScaleFor(displayScale, 1);
    expect((11 * scale) / displayScale).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX - 1e-9);
  });

  it('descuenta el zoom de la cámara y rechaza valores absurdos', () => {
    expect(labelScaleFor(2, 2)).toBeCloseTo(labelScaleFor(1, 1));
    expect(labelScaleFor(0, 1)).toBe(1);
    expect(labelScaleFor(2, 0)).toBe(1);
    expect(labelScaleFor(Number.NaN, 1)).toBe(1);
  });

  it('el ancho máximo de un rótulo en pantalla es 168 px', () => {
    expect(LABEL_MAX_SCREEN_WIDTH_PX).toBe(168);
  });
});
