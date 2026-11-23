import { ClinicalToolState, MapObjectState } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';
import { EvidenceWorld, MissingItem } from './evidence-gating.config';
import { placeHint } from './place-hint.util';

/**
 * Una sola redacción de «lo que falta» para la puerta (principio P4: una fuente por concepto). Nombra con lo que
 * hay en el mundo vivo y en el escenario; nunca una clave interna ni el nombre de un caso.
 */
export interface CopyContext {
  /** Mundo vivo (lo cumple SimulationWorldState). `objects` da el nombre y el lugar de lo que está en la sala; `tools`, el nombre de las herramientas. */
  world: (EvidenceWorld & { objects?: readonly MapObjectState[]; tools?: readonly ClinicalToolState[] }) | null;
  /** NPC del escenario (nombran a las personas que no son un objeto del mundo). */
  npcs: readonly { key: string; displayName: string }[];
}

const VERBS = { talk: 'habla con', inspect: 'revisa', collect: 'recoge', use: 'usa' } as const;

/** Une con comas y «y» (o «e» ante un sonido «i»): «a», «a y b», «a, b y c». */
export function joinSpanish(items: readonly string[]): string {
  const list = items.filter(item => item.length > 0);
  if (list.length <= 1) return list[0] ?? '';
  const last = list[list.length - 1];
  const conjunction = /^h?i(?![aeiou])/i.test(last) ? 'e' : 'y';
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${last}`;
}

/** El objeto del mundo (en la sala actual) al que se refiere lo que falta, si lo hay. */
function findLiveObject(item: MissingItem, ctx: CopyContext): MapObjectState | undefined {
  const objects = ctx.world?.objects;
  if (!objects) return undefined;
  if (item.kind === 'toolOwned') return objects.find(o => o.type === 'TOOL' && o.toolCode === item.key);
  if (item.kind === 'inspected' || item.kind === 'npc') return objects.find(o => o.key === item.key);
  return undefined;
}

function toolLabel(item: MissingItem, ctx: CopyContext, live: MapObjectState | undefined): string | null {
  return ctx.world?.tools?.find(tool => tool.code === item.key)?.label ?? live?.label ?? null;
}

function phraseFor(item: MissingItem, ctx: CopyContext): string {
  const live = findLiveObject(item, ctx);
  const npc = ctx.npcs.find(n => n.key === item.key);

  let text: string;
  if (item.kind === 'toolOwned' || item.kind === 'toolUsed') {
    const verb = VERBS[item.kind === 'toolOwned' ? 'collect' : 'use'];
    text = `${verb} ${toolLabel(item, ctx, live) ?? DRAFT_COPY.unknownThing.text}`;
  } else {
    const isPerson = item.kind === 'npc' || live?.type === 'PERSON' || npc !== undefined;
    const verb = VERBS[isPerson ? 'talk' : 'inspect'];
    const name = live?.label ?? npc?.displayName ?? (isPerson ? DRAFT_COPY.unknownPerson.text : DRAFT_COPY.unknownThing.text);
    text = `${verb} ${name}`;
  }

  // El lugar solo se dice de lo que está en la sala actual (el mundo vivo trae sus coordenadas).
  if (live) return `${text} (${placeHint(live.x, live.y)})`;
  return text;
}


/** Imperativo, para las puertas: «habla con Ana (en el extremo izquierdo, al frente)». */
export function imperativeMissing(items: readonly MissingItem[], ctx: CopyContext): string[] {
  // Se deduplica por frase, no por clave: dos requisitos sin nombre conocido dirían lo mismo dos veces.
  return [...new Set(items.map(item => phraseFor(item, ctx)))];
}
