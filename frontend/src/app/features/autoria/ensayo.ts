import type { CasoStore } from './estado/caso.store';

/** La ruta del ensayo (especificación 4.3.8): el juego real con el borrador, que arma el bloque B. `desde` es el nodo donde empieza. */
export const RUTA_ENSAYO = (caseVersionId: string, desde?: number): string =>
  `/portal/casos/${encodeURIComponent(caseVersionId)}/ensayo${desde ? `?desde=${desde}` : ''}`;

type Abrir = (url: string, destino: string) => Window | null;

/**
 * Abre el ensayo en otra pestaña con el borrador al día. La pestaña se abre en el mismo clic (si se abriera después de esperar,
 * el navegador la tomaría por una ventana emergente y la bloquearía), vacía y sin `opener`; en cuanto lo pendiente llega al
 * servidor se le pone la dirección. Si el navegador no la dejó abrir, se va al ensayo en esta misma pestaña, también tras guardar.
 */
export async function abrirEnsayo(
  store: Pick<CasoStore, 'caso' | 'sincronizado'> & Partial<Pick<CasoStore, 'error' | 'conflicto'>>, desde?: number,
  abrir: Abrir = window.open.bind(window), navegar: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  const pestana = abrir('about:blank', '_blank');
  if (pestana) pestana.opener = null;
  await store.sincronizado();
  const caso = store.caso();
  // Con un error o un conflicto de guardado el ensayo mostraría un borrador viejo: la pestaña provisional se cierra y el
  // aviso de la barra dice qué pasó (igual que `irAlEnsayo` en esta pestaña).
  if (!caso || store.error?.() || store.conflicto?.()) {
    pestana?.close?.();
    return;
  }
  const direccion = RUTA_ENSAYO(caso.id, desde);
  if (!pestana) navegar(direccion);
  else if (!pestana.closed) pestana.location.href = direccion;
}

/**
 * Va al ensayo en ESTA pestaña, con el borrador al día (el clic normal de «Probar»). Espera a que lo pendiente llegue al
 * servidor y, si quedó un error o un conflicto, no entra: el ensayo mostraría un borrador viejo sin que la docente lo sepa
 * (el aviso de la barra ya le dice qué pasó). La navegación lleva `state.umbral` con el título para que el umbral del juego
 * pinte desde el primer cuadro y corre la transición del editor al ensayo (`core/navigation/transiciones.ts`).
 */
export async function irAlEnsayo(
  store: Pick<CasoStore, 'caso' | 'sincronizado' | 'error' | 'conflicto' | 'navegar'>, desde?: number,
): Promise<boolean> {
  await store.sincronizado();
  const caso = store.caso();
  if (!caso || store.error() || store.conflicto()) return false;
  return store.navegar(RUTA_ENSAYO(caso.id, desde), { umbral: { titulo: caso.titulo } });
}

/**
 * El clic de «Probar»: el primario sin modificadores va al ensayo en esta pestaña (`irAlEnsayo`). Con Ctrl, Meta o Mayús, o
 * con el botón del medio (que llega como `auxclick`), se abre otra pestaña como pide la especificación, pero no siguiendo el
 * enlace a ciegas: el navegador la abriría antes de que lo pendiente llegue al servidor y el ensayo cargaría una versión
 * anterior. Se abre una pestaña provisional en el mismo gesto y se le pone la dirección cuando el borrador está al día
 * (`abrirEnsayo`). Alt y el botón derecho quedan para el navegador. Enter sobre el enlace llega como el clic primario.
 */
export async function alPulsarProbar(
  evento: MouseEvent, store: Pick<CasoStore, 'caso' | 'sincronizado' | 'error' | 'conflicto' | 'navegar'>, desde?: number,
  abrir?: Abrir,
): Promise<boolean> {
  if (evento.altKey || evento.button > 1) return false;
  evento.preventDefault();
  if (evento.button === 1 || evento.ctrlKey || evento.metaKey || evento.shiftKey) {
    await abrirEnsayo(store, desde, abrir);
    return false;
  }
  return irAlEnsayo(store, desde);
}
