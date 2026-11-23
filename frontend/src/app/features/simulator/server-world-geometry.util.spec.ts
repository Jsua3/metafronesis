import { CollisionZoneState, MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import { serverRejectsPlayerAt } from './server-world-geometry.util';

/** Mundo mínimo: solo lo que world_service.update_position mira. */
function world(opts: {
  width?: number;
  height?: number;
  collisions?: Array<Pick<CollisionZoneState, 'x' | 'y' | 'width' | 'height'>>;
  objects?: Array<Pick<MapObjectState, 'x' | 'y' | 'width' | 'height' | 'collision'> & { key?: string }>;
} = {}): SimulationWorldState {
  return {
    map: { width: opts.width ?? 960, height: opts.height ?? 528 },
    collisions: opts.collisions ?? [],
    objects: opts.objects ?? [],
  } as unknown as SimulationWorldState;
}

// Mostrador de triage del caso PDF (380,252,220,56): mismo rect en BD y frontend.
const COUNTER = { x: 380, y: 252, width: 220, height: 56 };

describe('serverRejectsPlayerAt (espejo de world_service.update_position)', () => {
  it('acepta un punto libre dentro del mapa', () => {
    expect(serverRejectsPlayerAt(world({ collisions: [COUNTER] }), 480, 430)).toBe(false);
  });

  it('rechaza el hitbox de pies que invade una zona de colisión de la BD', () => {
    // Pies fuera del mostrador, pero el hitbox (x-11..x+11) cruza x=380.
    expect(serverRejectsPlayerAt(world({ collisions: [COUNTER] }), 370, 300)).toBe(true);
  });

  it('trata los bordes que solo se tocan como libres, igual que el servidor', () => {
    // Hitbox derecho en x+11 = 380 (toca) → libre; un píxel más → choca.
    expect(serverRejectsPlayerAt(world({ collisions: [COUNTER] }), 369, 300)).toBe(false);
    expect(serverRejectsPlayerAt(world({ collisions: [COUNTER] }), 370, 300)).toBe(true);
  });

  it('bloquea solo los objetos marcados con colisión', () => {
    const kit = { x: 318, y: 428, width: 48, height: 48 };
    expect(serverRejectsPlayerAt(world({ objects: [{ ...kit, collision: true }] }), 342, 440)).toBe(true);
    expect(serverRejectsPlayerAt(world({ objects: [{ ...kit, collision: false }] }), 342, 440)).toBe(false);
  });

  it('puede ignorar un objeto concreto (la persona que camina no choca consigo misma)', () => {
    const persona = { key: 'madre', x: 318, y: 428, width: 48, height: 48, collision: true };
    const otra = { key: 'sofa', x: 500, y: 428, width: 48, height: 48, collision: true };
    const w = world({ objects: [persona, otra] });
    expect(serverRejectsPlayerAt(w, 342, 440)).toBe(true);
    expect(serverRejectsPlayerAt(w, 342, 440, 'madre')).toBe(false);
    // Lo demás sigue bloqueando.
    expect(serverRejectsPlayerAt(w, 520, 440, 'madre')).toBe(true);
  });

  it('exige el hitbox completo dentro de los límites del mapa', () => {
    const w = world({ width: 960, height: 528 });
    expect(serverRejectsPlayerAt(w, 11, 300)).toBe(false);
    expect(serverRejectsPlayerAt(w, 10, 300)).toBe(true);
    expect(serverRejectsPlayerAt(w, 949, 300)).toBe(false);
    expect(serverRejectsPlayerAt(w, 950, 300)).toBe(true);
    expect(serverRejectsPlayerAt(w, 480, 16)).toBe(false);
    expect(serverRejectsPlayerAt(w, 480, 15)).toBe(true);
    expect(serverRejectsPlayerAt(w, 480, 528)).toBe(false);
    expect(serverRejectsPlayerAt(w, 480, 529)).toBe(true);
  });

  it('usa los mismos límites por defecto que el servidor (960×540) si el mapa no trae tamaño', () => {
    const w = world({ width: 0, height: 0 });
    expect(serverRejectsPlayerAt(w, 949, 540)).toBe(false);
    expect(serverRejectsPlayerAt(w, 950, 540)).toBe(true);
    expect(serverRejectsPlayerAt(w, 480, 541)).toBe(true);
  });

  it('un punto flotante aceptado sigue aceptado tras el redondeo que se envía al servidor', () => {
    const w = world({ collisions: [COUNTER, { x: 0, y: 0, width: 96, height: 528 }] });
    const flipped: string[] = [];
    for (let x = 90; x <= 620; x += 0.37) {
      for (let y = 240; y <= 330; y += 0.53) {
        if (!serverRejectsPlayerAt(w, x, y) && serverRejectsPlayerAt(w, Math.round(x), Math.round(y))) {
          flipped.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
      }
    }
    expect(flipped).toEqual([]);
  });
});
