/**
 * Modalidad de puntero para textos que prometen atajos de teclado (J, E, Esc, «← →»): donde no hay
 * teclado se quitan, para no prometer lo que no existe. El CSS usa las mismas consultas; esto es para
 * los textos que no son CSS (aria-label, texto de Phaser). Lectura puntual, sin registrar nada global.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** `matchMedia` seguro: false si el navegador no lo implementa (jsdom, WebView antiguo) o lo bloquea. */
export function matchesMedia(query: string): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;
  } catch {
    return false;
  }
}

/** Avisa de los cambios de una consulta (un híbrido puede cambiar de puntero principal). Devuelve cómo dejar de escuchar. */
export function watchMedia(query: string, onChange: (matches: boolean) => void): () => void {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
    const list = window.matchMedia(query);
    const handler = (event: { matches: boolean }) => onChange(event.matches);
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  } catch {
    return () => undefined;
  }
}
