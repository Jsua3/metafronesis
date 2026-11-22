import { Signal, signal } from '@angular/core';

/**
 * Máquina de estados de la barra de vidrio modular (plan visual F3; /barra-de-vidrio-modular, réplica Recomendada).
 * Traducción del bloque «MÁQUINA DE ESTADOS» de assets/gemela.html, sin DOM: el componente le pasa posiciones,
 * tipos de puntero y teclas, y pinta `data-estado` con lo que derive.
 *
 * - `inicial` si la página está arriba (≤ 8 px) o no es escritorio; si no, `atencion` con el cursor en la franja y
 *   `scroll` sin él. En el tope no hay atención.
 * - Atención por ratón: entra en 0 ms y sale con 280 ms de gracia; un toque (o el ratón sintetizado tras un toque
 *   en un híbrido) nunca la abre por `pointerenter`. Con dedo, un toque en un hueco del módulo central alterna, y
 *   desplazarse más de 24 px o pulsar fuera la suelta.
 * - Modalidad: Tab marca «teclado» (el foco que llega con Tab despliega la barra) y un `pointerdown` marca
 *   «puntero» (el foco que deja un clic no la retiene). Escape suelta la atención salvo en un campo de texto.
 */
export type GlassBarState = 'inicial' | 'scroll' | 'atencion';
export type GlassBarModality = 'puntero' | 'teclado';

export interface GlassBarSignals {
  /** `(hover: hover) and (pointer: fine)`, en vivo. */
  isFinePointer(): boolean;
  /** `(min-width: 64rem)`, en vivo. */
  isDesktop(): boolean;
  /** `(prefers-reduced-motion: reduce)`, en vivo: en móvil la barra nunca compacta. */
  prefersReducedMotion?(): boolean;
}

/** px: en móvil, recorrido hacia abajo desde el ancla que compacta la barra. */
export const GLASS_BAR_COMPACT_PX = 24;
/** px: en móvil, recorrido hacia arriba desde el ancla que la devuelve. */
export const GLASS_BAR_EXPAND_PX = 12;
/** px: un salto mayor no es un gesto (ancla, restaurar el desplazamiento). */
export const GLASS_BAR_JUMP_PX = 200;
/** px: el viewport visual encogido más que esto (con foco en un campo) = teclado virtual abierto. */
export const GLASS_BAR_KEYBOARD_PX = 150;

export interface GlassBarTimers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

/** px: desplazado = max(scrollY, 0) > umbral. */
export const GLASS_BAR_THRESHOLD_PX = 8;
/** ms de gracia al salir el ratón de la franja. */
export const GLASS_BAR_GRACE_MS = 280;
/** px: con dedo, desplazarse más que esto desde que se abrió suelta la atención. */
export const GLASS_BAR_FINGER_RELEASE_PX = 24;

const BROWSER_TIMERS: GlassBarTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: id => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class GlassBarMachine {
  private readonly stateSignal = signal<GlassBarState>('inicial');
  private readonly modalitySignal = signal<GlassBarModality | null>(null);
  private readonly keyboardSignal = signal(false);
  readonly state: Signal<GlassBarState> = this.stateSignal.asReadonly();
  readonly modality: Signal<GlassBarModality | null> = this.modalitySignal.asReadonly();
  /** Móvil: teclado virtual abierto (la barra inferior se retira). */
  readonly keyboard: Signal<boolean> = this.keyboardSignal.asReadonly();

  private scrolled = false;
  private attending = false;
  private desktop: boolean;
  private closeTimer: unknown = null;
  private scrollY = 0;
  private scrollAtAttend = 0;
  /** El ÚLTIMO puntero que tocó: en un portátil táctil la media dice «ratón» aunque toque un dedo. */
  private lastPointer: string;
  /** Móvil: compacta por dirección, y el ancla desde la que se mide el recorrido. */
  private compact = false;
  private anchor = 0;
  /** Móvil: el mayor alto del viewport visual visto en esta orientación (referencia del teclado). */
  private keyboardReference = 0;
  /** Congelada (DG-9): el estado que se ve no cambia, aunque la máquina siga anotando lo que pasa. */
  private frozen = false;

  constructor(private readonly signals: GlassBarSignals, private readonly timers: GlassBarTimers = BROWSER_TIMERS) {
    this.desktop = signals.isDesktop();
    this.lastPointer = signals.isFinePointer() ? 'mouse' : 'touch';
  }

  /**
   * Nueva posición de desplazamiento del documento. `maxScroll` es el tope (`scrollHeight − innerHeight`): en móvil
   * los extremos son zona muerta (rebote elástico).
   */
  sync(scrollY: number, maxScroll = Number.POSITIVE_INFINITY): void {
    this.scrollY = Math.max(scrollY, 0);
    this.scrolled = this.scrollY > GLASS_BAR_THRESHOLD_PX;
    if (!this.desktop) this.compactByDirection(Math.min(this.scrollY, Math.max(maxScroll, 0)), Math.max(maxScroll, 0));
    if (this.attending && this.isFinger() && Math.abs(this.scrollY - this.scrollAtAttend) > GLASS_BAR_FINGER_RELEASE_PX) {
      this.attending = false;
    }
    this.paint();
  }

  /**
   * Teclado virtual (móvil): abierto si el foco está en un campo de texto Y el viewport visual encogió más de
   * 150 px respecto del mayor alto visto en esta orientación (nunca contra el alto del layout, que también encoge).
   */
  measureKeyboard(fieldFocused: boolean, visualHeight: number | null): void {
    if (visualHeight !== null && visualHeight > this.keyboardReference) this.keyboardReference = visualHeight;
    this.keyboardSignal.set(!this.desktop && fieldFocused && visualHeight !== null
      && this.keyboardReference - visualHeight > GLASS_BAR_KEYBOARD_PX);
  }

  /** Cambió la orientación: el alto de referencia del teclado es el de la nueva. */
  resetKeyboardReference(visualHeight: number): void {
    this.keyboardReference = visualHeight;
  }

  pointerDown(pointerType: string): void {
    this.lastPointer = pointerType || 'mouse';
    this.modalitySignal.set('puntero');
  }

  keyDown(key: string, inTextField: boolean): void {
    if (key === 'Tab') this.modalitySignal.set('teclado');
    if (key === 'Escape' && !inTextField) {
      this.attending = false;
      this.paint();
    }
  }

  pointerEnter(pointerType: string): void {
    if (pointerType !== 'mouse') return;
    this.lastPointer = 'mouse';
    if (!this.signals.isFinePointer()) return;
    this.timers.clear(this.closeTimer);
    this.attending = true;
    this.paint();
  }

  pointerLeave(pointerType: string): void {
    if (pointerType !== 'mouse' || !this.signals.isFinePointer()) return;
    this.timers.clear(this.closeTimer);
    this.closeTimer = this.timers.set(() => {
      this.attending = false;
      this.paint();
    }, GLASS_BAR_GRACE_MS);
  }

  /** Clic dentro del módulo central; `onControl` si cayó en un enlace o un botón. */
  tapStrip(onControl: boolean): void {
    if (onControl || !this.isFinger()) return;
    this.attending = !this.attending;
    this.scrollAtAttend = this.scrollY;
    this.paint();
  }

  /** Clic en el documento; `insidePrincipal` si cayó dentro del módulo central. */
  outsideClick(insidePrincipal: boolean): void {
    if (!this.isFinger() || insidePrincipal) return;
    this.attending = false;
    this.paint();
  }

  setDesktop(isDesktop: boolean): void {
    this.desktop = isDesktop;
    this.compact = false;
    this.anchor = this.scrollY;
    this.keyboardSignal.set(false);
    this.paint();
  }

  /**
   * Congela el estado que se ve (editor de casos, DG-9): con una ayuda abierta —el buscador o la guía— la barra no
   * cambia de estado, para que lo que la guía señala no salte 6 px. La máquina sigue anotando el desplazamiento y la
   * atención; al soltarla, la barra cae al estado que le toca.
   */
  freeze(frozen: boolean): void {
    this.frozen = frozen;
    this.paint();
  }

  destroy(): void {
    this.timers.clear(this.closeTimer);
  }

  private isFinger(): boolean {
    return this.lastPointer !== 'mouse' || !this.signals.isFinePointer();
  }

  /**
   * Móvil (references/movil.md §5.2, código fiel): la DIRECCIÓN decide, con histéresis asimétrica. El ancla sigue
   * al extremo del recorrido en el sentido vigente; irse cuesta 24 px y volver 12. Los extremos son zona muerta, un
   * salto de más de 200 px no es un gesto y con movimiento reducido no hay estado compacto (WCAG 2.3.3).
   */
  private compactByDirection(position: number, top: number): void {
    if (this.signals.prefersReducedMotion?.()) {
      this.compact = false;
      return;
    }
    const travel = position - this.anchor;
    if (position <= GLASS_BAR_THRESHOLD_PX) {
      this.compact = false;
      this.anchor = position;
      return;
    }
    if (position >= top || Math.abs(travel) > GLASS_BAR_JUMP_PX) {
      this.anchor = position;
      return;
    }
    if ((this.compact && travel > 0) || (!this.compact && travel < 0)) {
      this.anchor = position;
      return;
    }
    if (travel > GLASS_BAR_COMPACT_PX) {
      this.compact = true;
      this.anchor = position;
    } else if (travel < -GLASS_BAR_EXPAND_PX) {
      this.compact = false;
      this.anchor = position;
    }
  }

  private derive(): GlassBarState {
    if (!this.scrolled) return 'inicial';
    // Por debajo de 64rem no hay puntero que atender: compacta o no (por ancho, no por puntero).
    if (!this.desktop) return this.compact ? 'scroll' : 'inicial';
    return this.attending ? 'atencion' : 'scroll';
  }

  private paint(): void {
    if (this.frozen) return;
    this.stateSignal.set(this.derive());
  }
}
