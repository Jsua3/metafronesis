import { MapObjectState } from '../../core/models/simulation.model';
import { CopyContext, imperativeMissing, joinSpanish } from './evidence-copy.util';
import { MissingItem, missingEvidenceItems } from './evidence-gating.config';
import { ORIENTATION_COPY } from './orientation.config';

/**
 * Estado de una puerta: única fuente de verdad para el rótulo del mundo, la barra
 * contextual y el intento de cruzar (tryOpenDoor) (F§7.5).
 * El mensaje se calcula de los requisitos VIVOS y sustituye al `lockedMessage` del seed
 * (que nombra temas de las decisiones o pide cosas que no se exigen) sin re-sembrar.
 */
export interface DoorStatus {
  state: 'open' | 'locked';
  missing: MissingItem[];
  /** Bloqueada por la etapa del caso (requiresNodes), no por algo que el jugador pueda reunir ahora. */
  stageLocked: boolean;
  message: string | null;
}

export interface DoorStatusContext {
  /** Clave del nodo (etapa) actual del intento. */
  nodeKey: string;
  world: NonNullable<CopyContext['world']>;
  viewedNpcKeys: ReadonlySet<string>;
  copy: CopyContext;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

export function doorStatus(door: MapObjectState, ctx: DoorStatusContext): DoorStatus {
  const meta = (door.metadata ?? {}) as Record<string, unknown>;
  const requiresNodes = stringList(meta['requiresNodes']);
  const missing = missingEvidenceItems({
    npcs: stringList(meta['requiresNpcs']),
    tools: stringList(meta['requiresTools']),
    inspected: stringList(meta['requiresInspected']),
  }, ctx.world, ctx.viewedNpcKeys);
  const stageLocked = requiresNodes.length > 0 && !requiresNodes.includes(ctx.nodeKey);

  if (!missing.length && !stageLocked) return { state: 'open', missing: [], stageLocked: false, message: null };

  const parts: string[] = [];
  if (missing.length) parts.push(ORIENTATION_COPY.door.before(joinSpanish(imperativeMissing(missing, ctx.copy))));
  if (stageLocked) parts.push(ORIENTATION_COPY.door.laterGate);
  return { state: 'locked', missing, stageLocked, message: parts.join(' ') };
}

/** `doorStates` para el mundo: estado de cada salida de la sala actual, por clave. */
export function doorStateMap(
  objects: readonly MapObjectState[], ctx: DoorStatusContext,
): Record<string, 'open' | 'locked'> {
  const states: Record<string, 'open' | 'locked'> = {};
  for (const obj of objects) {
    if (obj.type === 'EXIT') states[obj.key] = doorStatus(obj, ctx).state;
  }
  return states;
}
