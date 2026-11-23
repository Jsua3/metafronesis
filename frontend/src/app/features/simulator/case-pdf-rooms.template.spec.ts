import { CASE_PDF_ROOM_RENDERERS, CaseRoom, caseRoomMetadata } from './case-pdf-rooms.renderer';
import { DEPTH } from './depth-sort.util';

/**
 * El método plantilla de las salas del caso (P-14b): el orden de las capas lo fija `CaseRoom.render`
 * y cada sala solo aporta sus pasos. Se prueba con una sala mínima que anota cuándo se ejecuta cada paso
 * respecto de las capas que pinta la propia plantilla. Que el resultado de las cuatro salas reales no
 * cambia lo fija el maestro dorado (`scene-renderers.draw-calls.spec.ts`).
 */

/** Escena falsa: anota la profundidad de cada gráfico que se crea. */
function depthLogScene(log: string[]): never {
  const graphic: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'setDepth') return (depth: number) => { log.push(`graphics@${depth}`); return graphic; };
      if (prop === 'then') return undefined;
      return () => graphic;
    },
  });
  return {
    textures: { exists: () => false },
    add: new Proxy({}, { get: () => () => graphic }),
  } as never;
}

const OPTIONS = { width: 960, height: 528, reduceMotion: false } as const;

class ProbeRoom extends CaseRoom {
  readonly kind = 'hospital-urgencias';
  protected readonly lightPools = [{ x: 1, y: 2 }];

  constructor(protected readonly log: string[]) { super(); }

  protected paintWall(): void { this.log.push('paso: pared'); }
  protected paintFurniture(): void { this.log.push('paso: muebles'); }
}

class ProbeRoomWithFloor extends ProbeRoom {
  protected override paintFloor(): void { this.log.push('paso: piso'); }
}

describe('CaseRoom: el método plantilla fija el orden de las capas', () => {
  it('cascarón, pared, piso, muebles y luz, en ese orden', () => {
    const log: string[] = [];

    new ProbeRoomWithFloor(log).render(depthLogScene(log), OPTIONS);

    const shell = log.indexOf(`graphics@${DEPTH.BACKGROUND}`);
    const wallLayer = log.indexOf(`graphics@${DEPTH.ENVIRONMENT}`);
    const steps = ['paso: pared', 'paso: piso', 'paso: muebles'].map(step => log.indexOf(step));
    const lighting = log.lastIndexOf(`graphics@${DEPTH.LIGHTING_FLOOR}`);

    expect(shell).toBe(0);
    expect(wallLayer).toBeGreaterThan(shell);
    expect(steps[0]).toBeGreaterThan(wallLayer);        // la pared se pinta sobre su gráfico ya creado
    expect(steps[1]).toBeGreaterThan(steps[0]);
    expect(steps[2]).toBeGreaterThan(steps[1]);
    expect(lighting).toBeGreaterThan(steps[2]);
    expect(lighting).toBe(log.length - 1);               // la luz va al final y no queda nada después
  });

  it('el piso es un gancho: sin sobrescribirlo, la plantilla sigue con los muebles', () => {
    const log: string[] = [];

    new ProbeRoom(log).render(depthLogScene(log), OPTIONS);

    expect(log.filter(entry => entry.startsWith('paso:'))).toEqual(['paso: pared', 'paso: muebles']);
  });

  it('cada sala crea el gráfico de la pared una sola vez, antes de pintarla', () => {
    const log: string[] = [];

    new ProbeRoom(log).render(depthLogScene(log), OPTIONS);

    expect(log.filter(entry => entry === `graphics@${DEPTH.ENVIRONMENT}`)).toHaveLength(1);
  });

  it('devuelve la metadata de su sala', () => {
    const log: string[] = [];

    const metadata = new ProbeRoom(log).render(depthLogScene(log), OPTIONS);

    expect(metadata).toEqual(caseRoomMetadata('hospital-urgencias'));
  });

  it('cada sala real devuelve la metadata de la suya (los puntos de foco no se mezclan)', () => {
    const urgencias = caseRoomMetadata('hospital-urgencias').focusPoints;
    expect(caseRoomMetadata('comisaria-consultorio').focusPoints).not.toEqual(urgencias);

    for (const renderer of CASE_PDF_ROOM_RENDERERS) {
      const kind = renderer.key.replace('case-pdf-', '');
      const metadata = renderer.render(depthLogScene([]), OPTIONS);
      expect({ kind, focusPoints: metadata.focusPoints })
        .toEqual({ kind, focusPoints: caseRoomMetadata(kind).focusPoints });
    }
  });
});
