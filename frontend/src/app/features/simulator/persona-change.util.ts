/**
 * Cambio de la persona entre dos estados (sin cifras): qué se anuncia a lectores de pantalla. El texto sale del
 * registro de borradores (VD-23); aquí solo se decide cuál y cómo se une cuando cambian el vínculo y la activación.
 */
import type { Activation, Bond, Persona } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';

const BOND_ORDER: readonly Bond[] = ['WITHDRAWN', 'GUARDED', 'OPEN'];
const ACTIVATION_ORDER: readonly Activation[] = ['CALM', 'TENSE', 'CRISIS'];

/** Cuántos pasos se movió un eje (positivo = hacia el final de la lista); 0 si algún valor no se conoce. */
function step<T>(order: readonly T[], from: T, to: T): number {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  return a < 0 || b < 0 ? 0 : Math.sign(b - a);
}

const withoutSubject = (text: string): string => text.replace(/^La persona /, '');

/**
 * Frase para el lector de pantalla cuando la persona cambió, o `null` si no hay nada que decir (sin estado
 * anterior —primera carga—, o mismo vínculo y misma activación; el texto `label` puede cambiar sin que cambie el estado).
 */
export function personaChangeAnnouncement(
  previous: Pick<Persona, 'bond' | 'activation'> | null | undefined,
  next: Pick<Persona, 'bond' | 'activation'> | null | undefined,
): string | null {
  if (!previous || !next) return null;
  const activation = step(ACTIVATION_ORDER, previous.activation, next.activation);
  const bond = step(BOND_ORDER, previous.bond, next.bond);
  const parts: string[] = [];
  if (activation < 0) parts.push(DRAFT_COPY.personaChangeCalmer.text);
  if (activation > 0) parts.push(DRAFT_COPY.personaChangeTenser.text);
  if (bond > 0) parts.push(DRAFT_COPY.personaChangeOpens.text);
  if (bond < 0) parts.push(DRAFT_COPY.personaChangeCloses.text);
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  return `${[first, ...rest.map(withoutSubject)].join(' y ')}.`;
}
