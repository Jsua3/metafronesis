/** Consultas compartidas para la composición del simulador, sin identificación del dispositivo. */
export const LOW_LANDSCAPE_QUERY = '(height < 500px) and (width < 1024px)';
export const PHONE_QUERY = '(width < 600px) and (height >= 500px)';
export const TABLET_QUERY = '(width >= 600px) and (width < 1024px) and (height >= 500px)';

/** Teléfono vertical u horizontal bajo: «Ir a…», «Controles» y «Bitácora» viven en el menú. */
export const MENU_QUERY = `${PHONE_QUERY}, ${LOW_LANDSCAPE_QUERY}`;

/** El paso de salida de la guía dice dónde está «Ir a…»; con menú, ese lugar cambia. */
export function textoSegunPantalla<T extends string | null | undefined>(texto: T, conMenu: boolean): T {
  // BORRADOR: texto pendiente de Psicología.
  return (conMenu && texto ? texto.replace('«Ir a…», arriba a la derecha', '«Ir a…», en el menú') : texto) as T;
}

/** Anchos con composición de teléfono o tableta: aquí la ficha del objetivo se abre como hoja. */
export const SHEET_QUERY = '(width < 1024px)';

export type ScreenClass = 'phone' | 'low-landscape' | 'tablet' | 'other';

/** En tamaños que cumplen dos condiciones, el alto bajo tiene prioridad. */
export function screenClass(width: number, height: number): ScreenClass {
  if (height < 500 && width < 1024) return 'low-landscape';
  if (width < 600) return 'phone';
  if (width < 1024 && height >= 500) return 'tablet';
  return 'other';
}
