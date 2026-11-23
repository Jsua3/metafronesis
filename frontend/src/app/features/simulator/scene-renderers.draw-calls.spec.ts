import { createHash } from 'crypto';
import { CASE_PDF_ROOM_RENDERERS } from './case-pdf-rooms.renderer';
import { furnitureTextureKey } from './furniture-sprite.util';
import { renderPremiumClinicalRoom } from './premium-clinical-room.renderer';
import { WORLD_SPRITES } from './world-scale.util';

/**
 * Maestro dorado de los renderers de salas (A-01b y P-14b): registra, en orden, TODAS las llamadas
 * que cada renderer hace sobre la escena y sus gráficos —qué objeto crea, con qué profundidad y qué
 * rectángulos, elipses, líneas y textos pinta, con qué colores y transparencias— y las resume en una
 * huella. Es lo que garantiza que reorganizar el código (compartir primitivas, una plantilla común)
 * no mueve ni un píxel ni cambia el orden en que se apilan las capas.
 *
 * Las huellas se capturaron contra el código original, antes de refactorizar. Si cambian a propósito
 * (otro mueble, otro color), se recalculan y se anota en el registro de cambios.
 */

const RECORDED = Symbol('recorded');

interface TextureSizer { (key: string): { width: number; height: number } }

const exactSize: TextureSizer = key => {
  const spec = WORLD_SPRITES.find(entry => furnitureTextureKey(entry.name) === key)!;
  return { width: spec.width, height: spec.height };
};

function format(value: unknown): string {
  if (typeof value === 'function') return '[fn]';
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') {
    const recorded = (value as Record<symbol, unknown>)[RECORDED];
    if (recorded) return `<${String(recorded)}>`;
    if (Array.isArray(value)) return `[${value.map(format).join(',')}]`;
    const entries = Object.keys(value as object).sort()
      .map(key => `${key}:${format((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Escena falsa que anota cada llamada con un identificador estable por objeto. */
function recordingScene(hasTextures: boolean): { scene: never; log: string[] } {
  const log: string[] = [];
  const counters: Record<string, number> = {};

  const make = (kind: string, args: unknown[], size?: { width: number; height: number }) => {
    counters[kind] = (counters[kind] ?? 0) + 1;
    const id = `${kind}#${counters[kind]}`;
    log.push(`${id} = add.${kind}(${args.map(format).join(',')})`);
    const dims: Record<string, number> = size ?? { width: 0, height: 0 };
    const proxy: unknown = new Proxy({}, {
      get(_target, prop) {
        if (prop === RECORDED) return id;
        if (prop === 'then' || prop === 'toJSON') return undefined;
        if (prop === Symbol.toPrimitive) return () => 0;
        if (typeof prop === 'string' && prop in dims) return dims[prop];
        return (...callArgs: unknown[]) => {
          log.push(`${id}.${String(prop)}(${callArgs.map(format).join(',')})`);
          return proxy;
        };
      },
    });
    return proxy;
  };

  const scene = {
    textures: {
      exists: (key: string) => {
        log.push(`textures.exists(${key}) -> ${hasTextures}`);
        return hasTextures;
      },
    },
    tweens: {
      add: (config: unknown) => {
        log.push(`tweens.add(${format(config)})`);
        return {};
      },
    },
    add: new Proxy({}, {
      get: (_target, kind) => (...args: unknown[]) =>
        make(String(kind), args, kind === 'image' ? exactSize(String(args[2])) : undefined),
    }),
  };
  return { scene: scene as never, log };
}

function summary(log: string[]): { events: number; hash: string } {
  return {
    events: log.length,
    hash: createHash('sha256').update(log.join('\n')).digest('hex').slice(0, 16),
  };
}

const OPTIONS = { width: 960, height: 528, reduceMotion: false, ambientTone: 'calm' } as const;

/** Huellas capturadas sobre el código original (ver el encabezado). */
const GOLDEN: Record<string, { events: number; hash: string }> = {
  'case-pdf-hospital-urgencias · con texturas': { events: 262, hash: 'b61e845a5e2c1656' },
  'case-pdf-hospital-urgencias · sin texturas': { events: 328, hash: 'dd8f5508dc182b86' },
  'case-pdf-hospital-sala-escucha · con texturas': { events: 257, hash: '19aa4f7c1a224dd8' },
  'case-pdf-hospital-sala-escucha · sin texturas': { events: 305, hash: '322494b68a3e93fc' },
  'case-pdf-comisaria-recepcion · con texturas': { events: 247, hash: '5b8e7c110c787e8e' },
  'case-pdf-comisaria-recepcion · sin texturas': { events: 310, hash: '34e53b5548214a04' },
  'case-pdf-comisaria-consultorio · con texturas': { events: 249, hash: '187522509949fc97' },
  'case-pdf-comisaria-consultorio · sin texturas': { events: 344, hash: 'd63104925944bb61' },
  'premium-clinical-room · con movimiento': { events: 692, hash: 'fe929c391e3d35fd' },
  'premium-clinical-room · sin movimiento': { events: 677, hash: '11bba8aff0375239' },
};

describe('renderers de salas: secuencia exacta de llamadas de dibujo (maestro dorado)', () => {
  for (const renderer of CASE_PDF_ROOM_RENDERERS) {
    for (const hasTextures of [true, false]) {
      const name = `${renderer.key} · ${hasTextures ? 'con' : 'sin'} texturas`;
      it(`${name}: las llamadas no cambian`, () => {
        const { scene, log } = recordingScene(hasTextures);

        renderer.render(scene, OPTIONS);

        expect(summary(log)).toEqual(GOLDEN[name]);
      });
    }
  }

  for (const reduceMotion of [false, true]) {
    const name = `premium-clinical-room · ${reduceMotion ? 'sin' : 'con'} movimiento`;
    it(`${name}: las llamadas no cambian`, () => {
      const { scene, log } = recordingScene(true);

      renderPremiumClinicalRoom(scene, { ...OPTIONS, reduceMotion });

      expect(summary(log)).toEqual(GOLDEN[name]);
    });
  }

  it('el registrador distingue un cambio mínimo (control positivo del maestro dorado)', () => {
    const first = recordingScene(true);
    const second = recordingScene(true);
    CASE_PDF_ROOM_RENDERERS[0].render(first.scene, OPTIONS);
    CASE_PDF_ROOM_RENDERERS[0].render(second.scene, OPTIONS);
    expect(summary(first.log)).toEqual(summary(second.log));       // determinista

    second.log[10] = `${second.log[10]} `;
    expect(summary(second.log)).not.toEqual(summary(first.log));   // y sensible a un carácter
    expect(first.log.length).toBeGreaterThan(200);                 // y el render sí dibuja cosas
  });
});
