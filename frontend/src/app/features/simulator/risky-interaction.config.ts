import { RESTRICTED_AREA_WARNING_MESSAGE } from './hospital-map.config';

export interface RiskyInteractionDef {
  warningMessage: string;
  speakerName: string;
  portraitKey: string;
}

/** Frontend-only consent gate before calling openInteraction on risky backend objects. */
export const RISKY_INTERACTIONS: Record<string, RiskyInteractionDef> = {
  'cuestionario-prematuro': {
    warningMessage: RESTRICTED_AREA_WARNING_MESSAGE,
    speakerName: 'Protocolo clínico',
    portraitKey: 'warning',
  },
  'contacto-agresor': {
    warningMessage:
      'Acción sensible: citar o contactar al agresor antes de medidas de protección puede escalar el peligro inmediato. ¿Deseas continuar?',
    speakerName: 'Protocolo de protección',
    portraitKey: 'warning',
  },
};

export function isRiskyInteraction(key: string): boolean {
  return key in RISKY_INTERACTIONS;
}

export function getRiskyInteractionDef(key: string): RiskyInteractionDef | null {
  return RISKY_INTERACTIONS[key] ?? null;
}
