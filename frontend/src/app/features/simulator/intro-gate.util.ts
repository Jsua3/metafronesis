/**
 * Puerta de entrada al contenido sensible del simulador (ETH-01).
 *
 * Orden invariante: ningún contenido sensible (escena, narrativa, audio del
 * caso) puede mostrarse antes del consentimiento explícito del estudiante.
 * Tras consentir sale una sola tarjeta genérica por intento, en la escena
 * donde se entre (sin depender de ningún caso concreto).
 */

import { DRAFT_COPY } from './draft-copy';

export type IntroGateStep = 'consent' | 'card' | 'none';

export interface IntroGateContext {
  /** Estado del intento (`IN_PROGRESS`, `COMPLETED`, `SAFE_EXITED`…) o null. */
  attemptStatus: string | null;
  /** Consentimiento de contenido ya otorgado en esta sesión para este intento. */
  consentGiven: boolean;
  /** Tarjeta de introducción ya leída en esta sesión para este intento. */
  introRead: boolean;
}

export function resolveIntroStep(ctx: IntroGateContext): IntroGateStep {
  if (ctx.attemptStatus !== 'IN_PROGRESS') return 'none';
  if (!ctx.consentGiven) return 'consent';
  if (ctx.introRead) return 'none';
  return 'card';
}

/** Las líneas de la tarjeta: el caso, la escena y la sala, y dónde se lee el contexto. Los {…} se rellenan aquí. */
export function introCardLines(caseTitle: string, nodeTitle: string, mapTitle: string): string[] {
  const fill = (template: string, value: string) => template.replace(/{[^}]+}/, () => value);
  return [
    fill(DRAFT_COPY.introCase.text, caseTitle),
    fill(DRAFT_COPY.introScene.text, nodeTitle),
    ...(mapTitle ? [fill(DRAFT_COPY.introRoom.text, mapTitle)] : []),
    DRAFT_COPY.introBriefNote.text,
  ];
}
