/**
 * La persona consultante como icono de pixel art sobre su cabeza (decisión 13): reemplaza al tinte rojo/verde/azul, que
 * cambiaba los píxeles del sprite. El icono sale del vínculo y la activación (nunca de una cifra): la crisis manda;
 * sin crisis, la confianza (abierta y serena) o el ánimo decaído (retraída); el resto no lleva icono.
 */
import type { RgbaImage } from '../character/kit/kit-engine';
import type { Persona } from '../../core/models/simulation.model';

export type PersonaIconKind = 'crisis' | 'confianza' | 'decaida';
export const PERSONA_ICON_KINDS: readonly PersonaIconKind[] = ['crisis', 'confianza', 'decaida'];

type PersonaLike = Pick<Persona, 'bond' | 'activation'>;

export function personaIconKind(persona: PersonaLike): PersonaIconKind | null {
  if (persona.activation === 'CRISIS') return 'crisis';
  if (persona.bond === 'OPEN' && persona.activation === 'CALM') return 'confianza';
  if (persona.bond === 'WITHDRAWN') return 'decaida';
  return null;
}

/**
 * Cómo nace un icono: con el último estado conocido, u oculto si aún no hay ninguno. La escena
 * recrea a los actores en cada render; sin esto, la señal se apagaba al primer `setWorld`.
 */
export function personaIconView(persona: PersonaLike | null): { visible: boolean; key: string } {
  const kind = persona ? personaIconKind(persona) : null;
  return { visible: kind !== null, key: personaIconKey(kind ?? 'crisis') };
}

/** Colores de palette.v2.json: contorno del kit, blanco, coral profundo, verde y azul. */
const ICON_COLORS: Record<string, string> = { o: '#15131d', w: '#ffffff', r: '#a95366', g: '#5b8d70', b: '#3d78a8' };

/** Globo de 7×8 con una marca blanca: «!» de crisis, corazón de confianza, gota de ánimo decaído. */
export const PERSONA_ICON_GRIDS: Readonly<Record<PersonaIconKind, readonly string[]>> = Object.freeze({
  crisis: ['.ooooo.', 'orrwrro', 'orrwrro', 'orrwrro', 'orrrrro', 'orrwrro', '.ooooo.', '...o...'],
  confianza: ['.ooooo.', 'ogwgwgo', 'owwwwwo', 'owwwwwo', 'ogwwwgo', 'oggwggo', '.ooooo.', '...o...'],
  decaida: ['.ooooo.', 'obbwbbo', 'obwwwbo', 'owwwwwo', 'obwwwbo', 'obbbbbo', '.ooooo.', '...o...'],
});

export function personaIconImage(kind: PersonaIconKind): RgbaImage {
  const grid = PERSONA_ICON_GRIDS[kind];
  const width = grid[0]!.length;
  const height = grid.length;
  const rgba = new Uint8Array(width * height * 4);
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = ICON_COLORS[ch];
    if (!color) return;
    const i = (y * width + x) * 4;
    rgba[i] = parseInt(color.slice(1, 3), 16);
    rgba[i + 1] = parseInt(color.slice(3, 5), 16);
    rgba[i + 2] = parseInt(color.slice(5, 7), 16);
    rgba[i + 3] = 255;
  }));
  return { width, height, rgba };
}

export function personaIconKey(kind: PersonaIconKind): string {
  return `patient-icon-${kind}`;
}
