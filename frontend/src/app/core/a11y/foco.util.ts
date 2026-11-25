/**
 * Utilidades de foco compartidas por quien lo devuelve o lo lleva a un sitio (navegación entre pantallas, cierre de
 * diálogos). Una sola definición de «foco perdido» y de «encabezado principal» para que todos coincidan.
 */

/** El foco se perdió: no hay elemento enfocado, está en `<body>` o el elemento ya no está en la página. */
export function focoPerdido(doc: Document = document): boolean {
  const activo = doc.activeElement;
  return !activo || activo === doc.body || activo === doc.documentElement || !activo.isConnected;
}

/** Un elemento que se puede ver y recibir el foco: no oculto, no inerte y sin `display: none` heredado. */
function esAlcanzable(elemento: HTMLElement): boolean {
  if (elemento.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  // `checkVisibility` no existe en todos los entornos (jsdom): sin él se da por visible.
  return typeof elemento.checkVisibility === 'function' ? elemento.checkVisibility() : true;
}

/**
 * Encabezado principal de la pantalla actual: el primer `h1` visible dentro de `<main>` (o de cualquier `h1` si la
 * pantalla no usa `<main>`). Sin encabezado, el propio `<main>` (`#main-content` primero): el destino de «Saltar al
 * contenido».
 */
export function encabezadoPrincipal(doc: Document = document): HTMLElement | null {
  const encabezados = Array.from(doc.querySelectorAll<HTMLElement>('main h1, [role="main"] h1'));
  const deLaPagina = encabezados.find(esAlcanzable)
    ?? Array.from(doc.querySelectorAll<HTMLElement>('h1')).find(esAlcanzable);
  return deLaPagina ?? doc.getElementById('main-content') ?? doc.querySelector<HTMLElement>('main');
}

/**
 * Enfoca por programa un elemento que no es un control (un encabezado, un `<main>`): le da `tabindex="-1"` si no tiene
 * (se enfoca por script, pero no entra en el orden del tabulador). No desplaza la página: quien navega ya decidió dónde
 * queda el scroll (arriba, o donde estaba al volver atrás). Devuelve si el foco quedó en él.
 */
export function enfocarPorPrograma(elemento: HTMLElement | null): boolean {
  if (!elemento) return false;
  if (!elemento.hasAttribute('tabindex')) elemento.setAttribute('tabindex', '-1');
  elemento.focus({ preventScroll: true });
  return elemento.ownerDocument.activeElement === elemento;
}
