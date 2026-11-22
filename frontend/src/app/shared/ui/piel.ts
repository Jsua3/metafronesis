/** Las dos pieles del lenguaje visual: `game` (oscura) y `portal` (clara). */
export type UiPiel = 'game' | 'portal';

/**
 * El contenedor con piel más cercano a `elemento` (solo las dos pieles conocidas), o null. Lo usan las capas que el CDK
 * monta en `body`, fuera de cualquier piel (diálogos, hojas y globos: DISENO C13, DP-24), para vestirse con la de quien
 * las abre. Vive aparte para que el diálogo y el globo lo compartan sin importarse entre sí.
 */
export function contenedorDePiel(elemento: Element | null | undefined): Element | null {
  const contenedor = elemento?.closest('[data-skin]') ?? null;
  const piel = contenedor?.getAttribute('data-skin');
  return piel === 'game' || piel === 'portal' ? contenedor : null;
}

/** La piel de un contenedor devuelto por `contenedorDePiel`. */
export function pielDe(contenedor: Element): UiPiel {
  return contenedor.getAttribute('data-skin') === 'game' ? 'game' : 'portal';
}
