/**
 * Tipografía del lienzo del mundo (plan visual F6-8). Antes todo texto de Phaser era `Arial, sans-serif`: otra
 * identidad que la del resto de la interfaz. Ahora es Poppins (autoalojada, F0) con respaldo, y el lienzo no crea sus
 * textos hasta que la fuente está disponible, porque Phaser mide el texto al crearlo.
 */

/** Pila de fuentes de todo texto del lienzo. */
export const WORLD_FONT_FAMILY = "Poppins, 'Segoe UI', system-ui, sans-serif";

/**
 * Rótulos del mundo (nombres de personas y objetos, el verbo al pasar el cursor): la letra de los nombres de las placas
 * del cuadro (bloque U1), sobre la penumbra de las placas y con su tinta crema. Un solo lenguaje con la interfaz.
 */
export const WORLD_LABEL_FONT_FAMILY = "'JetBrains Mono', Consolas, monospace";
/** Tinta de los rótulos (`--pixel-tinta`). */
export const WORLD_LABEL_INK = '#f2ecdf';
/** Fondo de los rótulos: la penumbra de las placas (`--pixel-penumbra`, #1b1826), casi opaca. */
export const WORLD_LABEL_PLATE = 'rgba(27,24,38,.94)';

/** Plazo máximo de espera: pasado, el texto sale con la fuente de respaldo y el juego sigue. */
export const WORLD_FONT_TIMEOUT_MS = 2000;

/** Pesos que usa el lienzo (texto 400/600, pistas en negrita 800; rótulos en JetBrains Mono 400 y 700). */
const WORLD_FONT_FACES = [
  '400 12px Poppins', '600 12px Poppins', '800 12px Poppins', '400 12px "JetBrains Mono"', '700 12px "JetBrains Mono"',
];

/**
 * Se cumple cuando Poppins y JetBrains Mono (los pesos del lienzo) ya están cargadas y `document.fonts.ready` también, o al vencer el
 * plazo. Nunca se rechaza: sin `FontFaceSet` (jsdom, WebView antiguo) o con la carga fallida resuelve igual.
 */
export function whenWorldFontsReady(
  fonts: Pick<FontFaceSet, 'load' | 'ready'> | undefined = typeof document === 'undefined' ? undefined : document.fonts,
  timeoutMs: number = WORLD_FONT_TIMEOUT_MS,
): Promise<void> {
  if (!fonts) return Promise.resolve();
  const loaded = Promise.all(WORLD_FONT_FACES.map(face => fonts.load(face)))
    .then(() => fonts.ready)
    .then(() => undefined, () => undefined);
  const timeout = new Promise<void>(resolve => { setTimeout(resolve, timeoutMs); });
  return Promise.race([loaded, timeout]);
}
