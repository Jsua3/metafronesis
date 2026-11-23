import { DialogueState, SimulationAttemptState } from '../../core/models/simulation.model';

/**
 * Estados de vista del gameplay (HUD redesign).
 *
 * - `outcome`: intento completado o salida segura → overlay de resultado (salvo `holdOutcome`).
 * - `journal`: bitácora abierta → overlay centrado.
 * - `dialogue-right`: panel lateral derecho. Desde el bloque I1 el resolvedor ya no lo devuelve (queda en el tipo porque el
 *   anfitrión todavía tiene su marcado y sus estilos).
 * - `dialogue-cinematic`: toda conversación, con opciones o sin ellas → sobre el mundo.
 * - `explore`: navegación normal, el canvas domina la pantalla.
 */
export type SimulationViewMode =
  | 'explore'
  | 'dialogue-right'
  | 'dialogue-cinematic'
  | 'journal'
  | 'outcome';

export interface ViewModeInput {
  status: SimulationAttemptState['status'] | null;
  journalOpen: boolean;
  dialogue: DialogueState | null;
  /**
   * Respaldo de la decisión en dos tiempos: mientras haya un resultado de decisión por aplicar,
   * el diálogo (la supervisión) se sigue viendo aunque el intento ya figure como terminado.
   * El anfitrión lo activa solo con un resultado pendiente, que la pausa descarta.
   */
  holdOutcome?: boolean;
}

export function resolveViewMode(input: ViewModeInput): SimulationViewMode {
  if (input.status && input.status !== 'IN_PROGRESS') {
    return input.holdOutcome && input.dialogue ? 'dialogue-cinematic' : 'outcome';
  }
  if (input.journalOpen) return 'journal';
  // Bloque I1: toda conversación, con opciones o sin ellas, va sobre el mundo (la placa de quien habla y las fichas de
  // respuesta), como en la maqueta «Diálogo vivo». El panel lateral (`dialogue-right`) ya no lo pide nadie.
  if (input.dialogue) return 'dialogue-cinematic';
  return 'explore';
}
