import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatusContext, doorStateMap, doorStatus } from './door-status.util';
import { CopyContext } from './evidence-copy.util';
import { interactionVerb } from './interaction-verb.util';
import { ORIENTATION_COPY } from './orientation.config';
import { readSeed } from './orientation-seed.testing';

function obj(key: string, type: MapObjectState['type'], x: number, y: number, label = key, metadata?: Record<string, unknown>): MapObjectState {
  return {
    key, label, type, x, y, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, metadata,
  };
}

const door = (metadata: Record<string, unknown>, key = 'puerta-x') => obj(key, 'EXIT', 838, 440, key, metadata);

function ctxFor(over: Partial<DoorStatusContext> = {}, objects: MapObjectState[] = []): DoorStatusContext {
  const world = { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {}, objects, ...over.world };
  const copy: CopyContext = { world, npcs: [] };
  return { nodeKey: 'hospital-urgencias', viewedNpcKeys: new Set(), copy, ...over, world };
}

const FAMILIA = obj('familia-crisis', 'PERSON', 190, 420, 'Familia en crisis');
const EXPEDIENTE = obj('expediente-caso', 'OBJECT', 740, 312, 'Expediente del caso');

describe('doorStatus: requisitos vivos', () => {
  it('sin requisitos la puerta está abierta y no hay mensaje', () => {
    expect(doorStatus(door({}), ctxFor())).toEqual({ state: 'open', missing: [], stageLocked: false, message: null });
    expect(doorStatus({ ...door({}), metadata: undefined }, ctxFor()).state).toBe('open');
  });

  it('requiresInspected sobre una persona de la sala: habla con ella, con el lugar vivo (F§5.4)', () => {
    const meta = { requiresInspected: ['familia-crisis'], lockedMessage: 'texto viejo del seed' };
    const locked = doorStatus(door(meta), ctxFor({}, [FAMILIA]));
    expect(locked.state).toBe('locked');
    expect(locked.stageLocked).toBe(false);
    expect(locked.missing).toEqual([{ kind: 'inspected', key: 'familia-crisis' }]);
    expect(locked.message).toBe('Antes de pasar, habla con Familia en crisis (en el extremo izquierdo, al frente).');
    const open = doorStatus(door(meta), ctxFor({ world: { inspectedObjectKeys: ['familia-crisis'] } as never }, [FAMILIA]));
    expect(open.state).toBe('open');
    expect(open.message).toBeNull();
  });

  it('requiresInspected sobre un objeto: lo revisa, con el lugar vivo', () => {
    const status = doorStatus(door({ requiresInspected: ['expediente-caso'] }, 'puerta-consultorio'), ctxFor({}, [EXPEDIENTE]));
    expect(status.message).toBe('Antes de pasar, revisa Expediente del caso (a la derecha, al fondo).');
  });

  it('si lo que falta no está en esta sala, usa la frase general sin lugar ni clave', () => {
    const status = doorStatus(door({ requiresInspected: ['expediente-caso'] }), ctxFor());
    expect(status.message).toBe('Antes de pasar, revisa algo de la sala.');
  });

  it('requiresNpcs usa la señal de personas habladas y lo persistido por el servidor', () => {
    const meta = { requiresNpcs: ['enfermera-urgencias'] };
    expect(doorStatus(door(meta), ctxFor({ copy: { world: null, npcs: [{ key: 'enfermera-urgencias', displayName: 'Enfermera' }] } })).message)
      .toBe('Antes de pasar, habla con Enfermera.');
    expect(doorStatus(door(meta), ctxFor({ viewedNpcKeys: new Set(['enfermera-urgencias']) })).state).toBe('open');
    expect(doorStatus(door(meta), ctxFor({ world: { flags: { viewedNpcKeys: ['enfermera-urgencias'] } } as never })).state).toBe('open');
  });

  it('requiresTools pide recoger la herramienta con el nombre que le da el mundo', () => {
    const meta = { requiresTools: ['KIT'] };
    const tools = [{ code: 'KIT', label: 'Kit de apoyo', icon: '', category: '', description: '', active: true }];
    const status = doorStatus(door(meta), ctxFor({ world: { tools } as never }));
    expect(status.missing).toEqual([{ kind: 'toolOwned', key: 'KIT' }]);
    expect(status.message).toBe('Antes de pasar, recoge Kit de apoyo.');
    expect(doorStatus(door(meta), ctxFor({ world: { inventory: ['KIT'] } as never })).state).toBe('open');
  });

  it('varios requisitos se unen con « y »', () => {
    const status = doorStatus(
      door({ requiresInspected: ['familia-crisis', 'expediente-caso'] }),
      ctxFor({}, [FAMILIA]),
    );
    expect(status.message).toBe(
      'Antes de pasar, habla con Familia en crisis (en el extremo izquierdo, al frente) y revisa algo de la sala.',
    );
  });
});

describe('doorStatus: etapa exigida (requiresNodes)', () => {
  const MUNDO = { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {}, objects: [] };
  const COPY: CopyContext = { world: MUNDO, npcs: [] };

  it('una puerta bloqueada por la etapa usa la frase general, sin contar decisiones de un caso', () => {
    const status = doorStatus(door({ requiresNodes: ['otra-escena'] }), { nodeKey: 'esta-escena', world: MUNDO, viewedNpcKeys: new Set(), copy: COPY });
    expect(status).toMatchObject({ state: 'locked', stageLocked: true, message: 'Esta salida se abre más adelante: sigue en esta sala.' });
  });

  it('el contexto de las puertas ya no pide número de decisión', () => {
    const ctx: DoorStatusContext = { nodeKey: 'x', world: MUNDO, viewedNpcKeys: new Set(), copy: COPY };
    expect(doorStatus(door({}), ctx).state).toBe('open');
  });

  it('se abre cuando el nodo actual es el que la habilita', () => {
    const status = doorStatus(door({ requiresNodes: ['esta-escena'] }), ctxFor({ nodeKey: 'esta-escena' }));
    expect(status).toEqual({ state: 'open', missing: [], stageLocked: false, message: null });
  });

  it('evidencia y etapa se suman en dos frases', () => {
    const both = doorStatus(
      door({ requiresNodes: ['otro-nodo'], requiresNpcs: ['enfermera-urgencias'] }),
      ctxFor({ copy: { world: null, npcs: [{ key: 'enfermera-urgencias', displayName: 'Enfermera' }] } }),
    );
    expect(both).toMatchObject({ state: 'locked', stageLocked: true });
    expect(both.message).toBe('Antes de pasar, habla con Enfermera. Esta salida se abre más adelante: sigue en esta sala.');
  });
});

describe('puertas auxiliares', () => {
  it('doorStateMap solo mira las salidas de la sala', () => {
    const objects = [
      obj('puerta-sala-escucha', 'EXIT', 838, 440, 'Sala de escucha familiar', { requiresInspected: ['familia-crisis'] }),
      obj('puerta-urgencias', 'EXIT', 122, 460, 'Sala de urgencias', {}),
      FAMILIA,
    ];
    expect(doorStateMap(objects, ctxFor({}, objects))).toEqual({
      'puerta-sala-escucha': 'locked', 'puerta-urgencias': 'open',
    });
  });

  it('la barra, el aviso y la lista leen el mismo motivo (una sola fuente)', () => {
    const exit = obj('puerta-consultorio', 'EXIT', 838, 440, 'Consultorio', { requiresInspected: ['expediente-caso'] });
    const status = doorStatus(exit, ctxFor({}, [EXPEDIENTE, exit]));
    const verb = interactionVerb(exit, status);
    expect(verb?.locked).toBe(true);
    expect(verb?.reason).toBe(status.message);
  });

  it('el respaldo para una puerta que el servidor rechaza no usa el texto antiguo del seed', () => {
    expect(ORIENTATION_COPY.door.fallback).toBe('Antes de pasar, explora un poco más la sala.');
    expect(ORIENTATION_COPY.door.fallback).not.toMatch(/información clave|Qué hacer/);
  });
});

describe('puertas del seed', () => {
  const doors = readSeed().doors;

  it('el seed trae puertas con requisitos (si no, este contrato estaría vacío)', () => {
    expect(doors.length).toBeGreaterThanOrEqual(8);
    expect(doors.some(d => d.requiresInspected.length)).toBe(true);
    expect(doors.some(d => d.requiresNodes.length)).toBe(true);
  });

  it('cada puerta del seed, bloqueada por cada requisito, da un motivo legible: sin claves ni nombres de herramienta', () => {
    for (const seedDoor of doors) {
      const meta = {
        requiresInspected: seedDoor.requiresInspected, requiresNpcs: seedDoor.requiresNpcs,
        requiresTools: seedDoor.requiresTools, requiresNodes: seedDoor.requiresNodes,
      };
      const status = doorStatus(door(meta, seedDoor.key), ctxFor({ nodeKey: 'hospital-urgencias' }));
      const hasRequirement = Object.values(meta).some(list => list.length);
      expect(status.state).toBe(hasRequirement ? 'locked' : 'open');
      if (status.message === null) continue;
      expect(status.message).toMatch(/^(Antes de pasar, |Esta salida se abre )/);
      expect(status.message).not.toMatch(/[a-z]+-[a-z]+|npc:|tool:|@|PAP|SPIKES|RISK_METER|EPICEE/);
      expect(status.message).not.toMatch(/orientación de ingreso|Completa la contención/);
      expect(status.message).not.toMatch(/\b(accion|decision|informacion|psicologa|recepcion)\b/i);
    }
  });
});
