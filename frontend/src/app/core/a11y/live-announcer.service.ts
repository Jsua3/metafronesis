import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject } from '@angular/core';

export type AnnouncePoliteness = 'polite' | 'assertive';

export interface AnnounceOptions {
  /** Repite el mensaje aunque sea idéntico al anterior dentro de la ventana de duplicados. */
  force?: boolean;
}

/** Una escritura idéntica a la anterior dentro de esta ventana es la misma noticia llegando por dos caminos. */
export const LIVE_DUPLICATE_WINDOW_MS = 1_000;
/** La región se vacía y se escribe 50 ms después: así el lector trata el texto como un cambio, también si es igual. */
export const LIVE_WRITE_DELAY_MS = 50;
/** El texto no se queda en la región: pasado este tiempo (como mínimo) se vacía, y un lector no lo relee al recorrer. */
export const LIVE_CLEAR_MIN_MS = 8_000;
/** Un mensaje largo espera más: la región no se vacía mientras todavía se está leyendo. */
const LIVE_CLEAR_PER_CHAR_MS = 100;

interface RegionState {
  element: HTMLElement;
  write: number | undefined;
  clear: number | undefined;
  last: { text: string; at: number } | null;
  /** Lo que espera su turno para escribirse: lo que llega antes de la escritura se suma, no la cancela. */
  pending: string[];
}

/**
 * Regiones vivas persistentes (plan visual F6-12; WCAG 4.1.3): dos —`polite` y `assertive`— montadas al arrancar
 * como hijas directas de `<body>`. Quien anuncia no sabe cómo se pinta: solo da el texto y la urgencia.
 *
 * - Existen antes de que cambie su contenido (una región que nace con su texto no se anuncia) y se vacían antes de
 *   escribir (así un texto igual al anterior vuelve a leerse).
 * - El mismo mensaje llegando por dos caminos dentro de `LIVE_DUPLICATE_WINDOW_MS` se anuncia una sola vez.
 * - `assertive` es para errores y para la salida segura; todo lo demás va en `polite`. Cada región lleva solo el rol
 *   que le corresponde: nunca `role="status"` con `aria-live="assertive"`.
 * - Con un diálogo `aria-modal` abierto, Chromium y Firefox ocultan a los lectores lo que queda fuera de él, también
 *   las regiones vivas. Igual que el `LiveAnnouncer` del CDK, cada modal «posee» las dos regiones con `aria-owns`
 *   (el panel de diálogo del juego es un `aria-modal` que no vive en una capa del CDK).
 */
@Injectable({ providedIn: 'root' })
export class LiveRegionAnnouncer implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly regions: Record<AnnouncePoliteness, RegionState> = {
    polite: this.mount('polite'),
    assertive: this.mount('assertive'),
  };

  announce(message: string, politeness: AnnouncePoliteness = 'polite', options: AnnounceOptions = {}): void {
    const text = message.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const region = this.regions[politeness];
    const now = Date.now();
    if (!options.force && region.last && region.last.text === text && now - region.last.at < LIVE_DUPLICATE_WINDOW_MS) return;
    region.last = { text, at: now };

    // Dos mensajes que salen casi a la vez («Obtuviste: …» y «Interactuar: …») se leen los dos, en orden y en una
    // sola escritura: el segundo no cancela al primero. Lo que llega con la región ya escrita empieza un lote nuevo.
    if (region.write !== undefined) {
      if (region.pending[region.pending.length - 1] !== text) region.pending.push(text);
      return;
    }
    region.pending = [text];
    this.exposeToModals();
    window.clearTimeout(region.clear);
    region.element.textContent = '';
    region.write = window.setTimeout(() => {
      const written = region.pending.reduce(
        (all, part) => (all ? `${all}${/[.!?…:]$/.test(all) ? ' ' : '. '}${part}` : part), '',
      );
      region.write = undefined;
      region.pending = [];
      // Un diálogo que se pinta justo después de pedir el anuncio (su efecto corre antes que su plantilla) ya existe.
      this.exposeToModals();
      region.element.textContent = written;
      region.clear = window.setTimeout(() => {
        region.element.textContent = '';
      }, Math.max(LIVE_CLEAR_MIN_MS, written.length * LIVE_CLEAR_PER_CHAR_MS));
    }, LIVE_WRITE_DELAY_MS);
  }

  ngOnDestroy(): void {
    const ids = this.regionIds();
    for (const modal of Array.from(this.document.querySelectorAll('[aria-owns]'))) {
      const rest = (modal.getAttribute('aria-owns') ?? '').split(/\s+/).filter(id => id && !ids.includes(id));
      if (rest.length) modal.setAttribute('aria-owns', rest.join(' '));
      else modal.removeAttribute('aria-owns');
    }
    for (const region of Object.values(this.regions)) {
      window.clearTimeout(region.write);
      window.clearTimeout(region.clear);
      region.element.remove();
    }
  }

  private regionIds(): string[] {
    return [this.regions.polite.element.id, this.regions.assertive.element.id];
  }

  /**
   * Cada `aria-modal="true"` ABIERTO posee las dos regiones (sin pisar lo que ya poseía) y cada uno que ya no lo está
   * las suelta. Hay modales siempre presentes que viven cerrados (la bitácora lleva `aria-hidden`): si poseyeran las
   * regiones, estas quedarían dentro de un subárbol oculto y ningún anuncio se leería.
   */
  private exposeToModals(): void {
    const ids = this.regionIds();
    const owned = (element: Element) => (element.getAttribute('aria-owns') ?? '').split(/\s+/).filter(Boolean);
    const isOpenModal = (element: Element) =>
      element.getAttribute('aria-modal') === 'true' && !element.closest('[aria-hidden="true"], [inert], [hidden]');
    // Quien ya no es un modal abierto suelta las regiones (conserva lo que poseyera por otra razón).
    for (const owner of Array.from(this.document.querySelectorAll('[aria-owns]'))) {
      const current = owned(owner);
      const rest = current.filter(id => !ids.includes(id));
      if (isOpenModal(owner) || rest.length === current.length) continue;
      if (rest.length) owner.setAttribute('aria-owns', rest.join(' '));
      else owner.removeAttribute('aria-owns');
    }
    // Cada modal abierto las posee.
    for (const modal of Array.from(this.document.querySelectorAll('[aria-modal="true"]'))) {
      if (!isOpenModal(modal)) continue;
      const current = owned(modal);
      const missing = ids.filter(id => !current.includes(id));
      if (missing.length) modal.setAttribute('aria-owns', [...current, ...missing].join(' '));
    }
  }

  private mount(politeness: AnnouncePoliteness): RegionState {
    const element = this.document.createElement('div');
    element.id = `siep-live-${politeness}`;
    element.className = 'ds-sr-only';
    element.setAttribute('data-live-region', politeness);
    element.setAttribute('aria-live', politeness);
    element.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    element.setAttribute('aria-atomic', 'true');
    this.document.body.appendChild(element);
    return { element, write: undefined, clear: undefined, last: null, pending: [] };
  }
}
