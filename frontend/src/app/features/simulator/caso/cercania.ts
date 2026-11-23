/**
 * Qué hace una persona cuando el estudiante se acerca (4.3.7 del plan del bloque B): voltear hacia él y, si la
 * consultante está activada, un gesto. Módulo puro: sin Angular ni Phaser.
 */
import { Activation, WorldComment } from '../../../core/models/simulation.model';
import { Gesto, esGesto } from './vocabulario';

export interface ReaccionCercania {
  mirar: boolean;
  gesto: Gesto | null;
}

/** La misma persona no repite su reacción automática antes de este tiempo. */
export const ESPERA_REPETIR_MS = 4000;

const CONSULTANTE: Readonly<Record<Activation, ReaccionCercania>> = {
  CALM: { mirar: true, gesto: null },
  TENSE: { mirar: true, gesto: 'se-aparta' },
  CRISIS: { mirar: false, gesto: 'se-agita' },
};

export function reaccionAlAcercarse(p: { esConsultante: boolean; activation: Activation }): ReaccionCercania {
  return p.esConsultante ? { ...CONSULTANTE[p.activation] } : { mirar: true, gesto: null };
}

/** El gesto del comentario, si es del vocabulario, reemplaza el de la reacción de base. */
export function conComentario(base: ReaccionCercania, c: WorldComment): ReaccionCercania {
  return esGesto(c.gesture) ? { ...base, gesto: c.gesture } : base;
}
