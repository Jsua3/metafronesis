/**
 * Orientación del jugador: banderas de producto y textos fijos genéricos en un solo lugar. No conoce ningún caso:
 * los nombres de personas, objetos, herramientas y salas salen siempre del mundo vivo y del documento del caso.
 *
 * Reglas de redacción (diseño F§5): tuteo, imperativo neutro, sin exclamaciones
 * ni lenguaje de logro, todo con tildes y nunca un identificador interno.
 * Orienta PROCESO y LUGAR; jamás insinúa cuál opción de decisión es adecuada.
 */

import { DRAFT_COPY } from './draft-copy';

/**
 * «Salida segura» es alcanzable en todos los estados jugables (F§4.7): introducción, contexto, exploración, ajustes,
 * ayuda, diálogo con y sin opciones, supervisión, bitácora y pausa. Verificado jugando (T9.8); mientras sea cierto, la
 * ayuda y el aviso pueden prometerla. Si un estado vuelve a perder la salida, esta bandera debe volver a false.
 */
export const SAFE_EXIT_ALWAYS_REACHABLE: boolean = true;

/** Textos fijos (F§5.3-5.6). Funciones solo donde hay datos que intercalar. */
export const ORIENTATION_COPY = {
  now: {
    nothingNearby: 'No hay nada a tu alcance. Acércate a una persona o un objeto.',
  },
  ui: {
    helpAriaLabel: 'Abrir cómo se juega',
    helpTitle: 'Cómo se juega',
    settingsHelpRow: 'Cómo se juega',
    settingsHelpAgain: 'Ver la ayuda otra vez',
    safeExit: 'Salida segura',
    backToMap: 'Volver al mapa',
    dockTools: (n: number, m: number): string => `Herramientas ${n} de ${m}`,
    dockLocked: 'Se consigue explorando las salas del caso.',
  },
  notices: {
    obtained: (label: string): string => `Obtuviste: ${label}. Ya está en tu barra de herramientas.`,
    registering: 'Registrando tu decisión…',
    supervision: 'Tu decisión quedó registrada en tu seguimiento formativo.',
    errorNpc: 'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.',
    errorTool: 'No pudimos usar la herramienta.',
    errorDecision: 'No pudimos registrar tu decisión. Inténtalo de nuevo.',
  },
  door: {
    before: (phrases: string): string => `Antes de pasar, ${phrases}.`,
    laterGate: 'Esta salida se abre más adelante: sigue en esta sala.',
    fallback: DRAFT_COPY.doorFallback.text,
  },
} as const;
