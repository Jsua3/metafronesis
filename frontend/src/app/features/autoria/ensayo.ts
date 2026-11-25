import type { CasoStore } from './estado/caso.store';

/** La ruta del ensayo (especificación 4.3.8): el juego real con el borrador, que arma el bloque B. `desde` es el nodo donde empieza. */
export const RUTA_ENSAYO = (caseVersionId: string, desde?: number): string =>
  `/portal/casos/${encodeURIComponent(caseVersionId)}/ensayo${desde ? `?desde=${desde}` : ''}`;

type Abrir = (url: string, destino: string) => Window | null;

/**
 * Abre el ensayo en otra pestaña con el borrador al día. La pestaña se abre en el mismo clic (si se abriera después de esperar,
 * el navegador la tomaría por una ventana emergente y la bloquearía), vacía y sin `opener`; en cuanto lo pendiente llega al
 * servidor se le pone la dirección. Si el navegador no la deja abrir, se informa y se conserva el editor.
 */
export async function abrirEnsayo(
  store: Pick<CasoStore, 'caso' | 'sincronizado'> & Partial<Pick<CasoStore, 'error' | 'conflicto' | 'haySinGuardar' | 'avisoEnsayo'>>, desde?: number,
  abrir: Abrir = window.open.bind(window), navegar: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  store.avisoEnsayo?.set(null);
  const pestana = abrir('about:blank', '_blank');
  if (!pestana) {
    store.avisoEnsayo?.set('No se pudo abrir la prueba. Permite las ventanas emergentes de este sitio y vuelve a probar; tu editor sigue abierto.');
    return;
  }
  if (pestana) pestana.opener = null;
  await store.sincronizado();
  const caso = store.caso();
  // Con un error o un conflicto de guardado el ensayo mostraría un borrador viejo: la pestaña provisional se cierra y el
  // aviso de la barra dice qué pasó (igual que `irAlEnsayo` en esta pestaña).
  if (!caso || store.error?.() || store.conflicto?.() || store.haySinGuardar?.()) {
    pestana?.close?.();
    return;
  }
  const direccion = RUTA_ENSAYO(caso.id, desde);
  if (!pestana.closed) pestana.location.href = direccion;
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

/** El ensayo siempre abre otra pestaña en el gesto, después espera la confirmación del guardado. */
export async function alPulsarProbar(
  evento: MouseEvent, store: Pick<CasoStore, 'caso' | 'sincronizado' | 'error' | 'conflicto' | 'navegar'> & Partial<Pick<CasoStore, 'haySinGuardar' | 'avisoEnsayo'>>, desde?: number,
  abrir?: Abrir,
): Promise<boolean> {
  if (evento.altKey || evento.button > 1) return false;
  evento.preventDefault();
  await abrirEnsayo(store, desde, abrir);
  return false;
}
