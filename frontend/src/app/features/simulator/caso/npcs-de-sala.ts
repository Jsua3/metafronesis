/**
 * Qué personas de ambiente se dibujan en una sala. El cliente carga el escenario de la clave del mapa
 * (`assets/game/scenarios/<clave>.json`), que puede traer personas de otro caso que usa el mismo mapa; el mundo del
 * caso en juego dice cuáles son las suyas en `ambient.ambientNpcs`. Módulo puro: sin Angular ni Phaser.
 */

/**
 * Los NPC del escenario que el ambiente del mapa nombra. Si el ambiente trae `ambientNpcs` (lista, aunque vacía)
 * solo quedan los de esa lista; si no la trae, se dibujan todos (compatibilidad con mundos sin ella).
 */
export function npcsDeLaSala<T extends { readonly key: string }>(npcs: readonly T[], ambiente: unknown): T[] {
  const lista = ambiente && typeof ambiente === 'object' ? (ambiente as { ambientNpcs?: unknown }).ambientNpcs : undefined;
  if (!Array.isArray(lista)) return [...npcs];
  const claves = new Set<string>();
  for (const entrada of lista) {
    const key = entrada && typeof entrada === 'object' ? (entrada as { key?: unknown }).key : undefined;
    if (typeof key === 'string' && key !== '') claves.add(key);
  }
  return npcs.filter(npc => claves.has(npc.key));
}
