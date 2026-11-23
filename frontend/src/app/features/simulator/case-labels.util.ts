import { NodeEditorState } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';

/** «Sala de urgencias (urgencias-crisis)»: el título primero, que es lo que se reconoce, y la clave entre paréntesis. */
export function nodeOptionLabel(node: Pick<NodeEditorState, 'key' | 'title'>): string {
  return `${node.title} (${node.key})`;
}

/** El tono de la insignia de estado de una versión de caso. */
export function statusTone(status: string | null | undefined): UiBadgeTone {
  const normalized = (status ?? '').toUpperCase();
  if (normalized === 'PUBLISHED') return 'success';
  if (normalized === 'IN_REVIEW') return 'info';
  return 'neutral';
}
