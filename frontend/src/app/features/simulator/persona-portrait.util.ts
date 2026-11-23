/**
 * Expresión del retrato según la persona consultante (R-12): el vínculo y la activación se dicen con la cara, nunca con
 * una cifra. El mapa es el definitivo; el kit de esta rama solo trae cuatro estados de retrato, así que mientras
 * `cautelosa` y `en-crisis` no existan se cae a la cara más cercana (P4 las añade y P6 las fusiona sin tocar esto).
 */
import type { Activation, Bond, Persona } from '../../core/models/simulation.model';
import type { PortraitState } from '../character/kit/kit-engine';

/** Estados que este mapa puede pedir; los dos últimos los trae el kit de seis estados (P4/P6). */
export type PersonaPortrait = PortraitState | 'cautelosa' | 'en-crisis';

const BOND_FACE: Readonly<Record<Bond, PersonaPortrait>> = {
  WITHDRAWN: 'triste',
  GUARDED: 'cautelosa',
  OPEN: 'alegre',
};

const ACTIVATION_FACE: Readonly<Record<Activation, PersonaPortrait>> = {
  CALM: 'neutral',
  TENSE: 'preocupada',
  CRISIS: 'en-crisis',
};

/** Qué cara se usa cuando la pedida no está en el kit. */
const FALLBACK: Readonly<Record<string, PersonaPortrait>> = {
  cautelosa: 'preocupada',
  'en-crisis': 'triste',
};

/** La cara definitiva: la activación manda salvo que esté serena; entonces habla el vínculo. */
export function definitivePortrait(persona: Pick<Persona, 'bond' | 'activation'>): PersonaPortrait {
  return persona.activation === 'CALM'
    ? BOND_FACE[persona.bond] ?? 'neutral'
    : ACTIVATION_FACE[persona.activation] ?? 'neutral';
}

/**
 * Retrato de la persona entre los `available` del kit: el definitivo si existe y, si no, su cara cercana
 * (`cautelosa` → `preocupada`, `en-crisis` → `triste`) y, como último recurso, `neutral`.
 */
export function portraitStateForPersona(
  persona: Pick<Persona, 'bond' | 'activation'>,
  available: readonly string[],
): PersonaPortrait {
  let face: PersonaPortrait | undefined = definitivePortrait(persona);
  while (face) {
    if (available.includes(face)) return face;
    face = FALLBACK[face];
  }
  return 'neutral';
}
