/**
 * Vocabularios cerrados de la reacción del personaje (contrato `x-siep` 2.1). Un valor fuera de estas listas se trata
 * como ausente: nunca se inventa una cara ni un gesto. Módulo puro: sin Angular ni Phaser.
 */
export const EMOCIONES = ['neutral', 'alegre', 'preocupada', 'triste', 'cautelosa', 'en-crisis'] as const;
export type Emocion = typeof EMOCIONES[number];

export const GESTOS = ['se-acerca', 'asiente', 'se-aparta', 'baja-la-mirada', 'se-agita'] as const;
export type Gesto = typeof GESTOS[number];

export function esEmocion(v: unknown): v is Emocion {
  return typeof v === 'string' && (EMOCIONES as readonly string[]).includes(v);
}

export function esGesto(v: unknown): v is Gesto {
  return typeof v === 'string' && (GESTOS as readonly string[]).includes(v);
}
