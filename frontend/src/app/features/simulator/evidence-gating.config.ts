import { SimulationWorldState } from '../../core/models/simulation.model';

/**
 * Ayudantes de las puertas: qué le falta al jugador para abrirlas (personas habladas, herramientas, objetos
 * revisados). El servidor sigue siendo la autoridad; aquí solo se explica por qué una salida está cerrada.
 *
 * Claves reales: npcs = keys de NpcConfig o PERSON del mapa; tools = tool_code adquirido;
 * inspected = object_key contra world.inspectedObjectKeys.
 */
/** Subconjunto del mundo que usan las puertas (lo cumple SimulationWorldState completo). */
export type EvidenceWorld = Pick<SimulationWorldState, 'inventory' | 'inspectedObjectKeys' | 'usedToolKeys' | 'flags'>;

/** Una herramienta cuenta como usada si hay una aplicación persistida: 'PAP' o 'PAP@objetivo'. */
export function isToolUsed(usedToolKeys: readonly string[], code: string): boolean {
  return usedToolKeys.some(k => k === code || k.startsWith(`${code}@`));
}

export function toolUsed(world: Pick<SimulationWorldState, 'usedToolKeys'>, code: string): boolean {
  return isToolUsed(world.usedToolKeys, code);
}

/** Personas habladas: la señal del componente más lo que el servidor persistió en flags['viewedNpcKeys']. */
export function collectViewedNpcKeys(
  world: Pick<SimulationWorldState, 'flags'> | null | undefined,
  viewedNpcKeys: ReadonlySet<string>,
): Set<string> {
  const viewed = new Set(viewedNpcKeys);
  const fromWorld = world?.flags?.['viewedNpcKeys'];
  if (Array.isArray(fromWorld)) {
    fromWorld
      .filter((key): key is string => typeof key === 'string' && key.length > 0)
      .forEach(key => viewed.add(key));
  }
  return viewed;
}

/**
 * Lo que falta, estructurado. Distingue TENER de USAR una herramienta:
 * toolOwned = recogerla; toolUsed = aplicarla en una conversación.
 */
export interface MissingItem { kind: 'npc' | 'toolUsed' | 'toolOwned' | 'inspected'; key: string }

/** Lo que pide una puerta (metadatos `requiresNpcs`, `requiresTools` y `requiresInspected`). */
export interface DoorRequirements { npcs?: string[]; tools?: string[]; inspected?: string[] }

export function missingEvidenceItems(
  req: DoorRequirements | null | undefined,
  world: EvidenceWorld | null,
  viewedNpcKeys: ReadonlySet<string>,
): MissingItem[] {
  if (!req || !world) return [];
  const missing: MissingItem[] = [];
  const viewed = collectViewedNpcKeys(world, viewedNpcKeys);
  for (const key of req.npcs ?? []) if (!viewed.has(key)) missing.push({ kind: 'npc', key });
  for (const key of req.tools ?? []) if (!world.inventory.includes(key)) missing.push({ kind: 'toolOwned', key });
  for (const key of req.inspected ?? []) if (!world.inspectedObjectKeys.includes(key)) missing.push({ kind: 'inspected', key });
  return missing;
}
