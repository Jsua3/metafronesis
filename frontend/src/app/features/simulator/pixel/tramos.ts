/**
 * Tramos de la interfaz del juego (U1, V7; muestra aprobada por el usuario: «Sí, con tus ajustes»). Una sola escala de
 * letra y teclas sigue al área visible (fichas en `styles/tokens/_pixel.scss`); cuando achicar ya no alcanza, el tramo
 * reorganiza. Las consultas de aquí son las mismas que las de las fichas (lo comprueba una prueba unitaria): lo que el
 * código decide (la escala entera del retrato, si la frase de la persona se enfoca) no puede ir por otro lado que el CSS.
 */
export type Tramo = 'compacto' | 'medio' | 'amplio';

/** Compacto: 700 px de alto o menos, o 1100 de ancho o menos. */
export const CONSULTA_COMPACTO = '(max-height: 700px), (max-width: 1100px)';
/** Amplio: 1700 de ancho y 1000 de alto o más. */
export const CONSULTA_AMPLIO = '(min-width: 1700px) and (min-height: 1000px)';

/** El tramo de un área de página (en px de CSS: con el zoom del navegador, el área ya viene dividida). */
export function tramoDe(ancho: number, alto: number): Tramo {
  if (alto <= 700 || ancho <= 1100) return 'compacto';
  if (ancho >= 1700 && alto >= 1000) return 'amplio';
  return 'medio';
}

/**
 * Escala entera del retrato del kit en el cuadro de diálogo (32 px de arte por punto): la misma medida que `--retrato`
 * en cada tramo. Teléfono (560 de ancho o menos): 2 (64 px); pantalla muy baja (520 de alto o menos): 3 (96 px);
 * compacto: 4 (128 px); medio: 6 (192 px); amplio: 9 (288 px). En el modo lateral: 3 (96 px), y 6 (192 px) en amplio.
 */
export function escalaDelRetrato(ancho: number, alto: number, lateral: boolean): number {
  if (ancho <= 560) return 2;
  if (alto <= 520) return 3;
  const tramo = tramoDe(ancho, alto);
  if (lateral) return tramo === 'amplio' ? 6 : 3;
  return tramo === 'amplio' ? 9 : tramo === 'compacto' ? 4 : 6;
}
