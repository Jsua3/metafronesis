import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewEncapsulation, afterEveryRender, afterNextRender,
  booleanAttribute, effect, inject, input, signal,
} from '@angular/core';

import { GlassBarMachine } from './glass-bar-machine';

const media = (query: string, fallback: boolean): (() => boolean) => {
  const list = typeof matchMedia === 'function' ? matchMedia(query) : null;
  return () => list?.matches ?? fallback;
};

/** Campos que abren el teclado y se quedan el Escape (gemela, «enCampoDeTexto»; movil.md, «campo»). */
const TEXT_FIELD = 'textarea, select, [contenteditable="true"], input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"])';

function focusInTextField(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return !!active && (active.isContentEditable || active.matches(TEXT_FIELD));
}

/**
 * Barra de vidrio modular (plan visual §2.8, F3; /barra-de-vidrio-modular, réplica Recomendada). El anfitrión ES el
 * `<header class="cromo">`: `<header ui-glass-bar label="…">`. El consumidor proyecta los tres módulos
 * (`.modulo.modulo-logo`, `.modulo.modulo-principal`, `.modulo.modulo-cuenta`), que quedan como hijos DIRECTOS de la
 * píldora; cualquier otro hijo (p. ej. la barra inferior fija) queda como hijo directo del header (invariante 3).
 *
 * El componente solo cablea eventos a `GlassBarMachine` y pinta `data-estado` (servido «inicial» desde la primera
 * pintura), `data-modalidad`, `data-ancho` (escritorio | movil) y `data-teclado`; la luz que sigue al ratón se escribe por CSSOM (`--puntero-x/y`), no con estilos en
 * línea del marcado. Los estilos son globales (src/styles/components/_glass-bar.scss): los selectores de estado
 * cruzan del header a los módulos proyectados.
 */
@Component({
  selector: 'header[ui-glass-bar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'cromo ds-motion',
    'data-vidrio': 'pseudo',
    '[attr.data-estado]': 'machine.state()',
    '[attr.data-modalidad]': 'machine.modality()',
    '[attr.data-teclado]': "machine.keyboard() ? 'abierto' : null",
    // Dueño del vidrio por ancho (una sola regla en _glass-bar.scss): píldora/módulos en escritorio, dos barras en móvil.
    '[attr.data-ancho]': "desktop() ? 'escritorio' : 'movil'",
    '(pointerenter)': 'machine.pointerEnter($any($event).pointerType)',
    '(pointerleave)': 'machine.pointerLeave($any($event).pointerType)',
    '(click)': 'onStripClick($event)',
  },
  template: `
    @if (navSkip()) {
      <a class="psy-skip-link" href="#" (click)="skipToNavigation($event)">Saltar a la navegación</a>
    }
    <nav class="bandeja ds-motion" [attr.aria-label]="desktop() ? label() : compactLabel()" (pointermove)="followLight($event)" (pointerleave)="resetLight()">
      <ng-content select=".modulo-logo" />
      <ng-content select=".modulo-principal" />
      <ng-content select=".modulo-cuenta" />
    </nav>
    <ng-content />
  `,
})
export class UiGlassBar {
  readonly label = input.required<string>();
  /** Nombre de la barra de arriba por debajo de 64rem, donde la navegación principal es la barra inferior. */
  readonly compactLabel = input('Marca y cuenta');
  /**
   * Pinta «Saltar a la navegación» como primer hijo del header (plan visual F3-6): solo donde hay navegación (el
   * acceso no la tiene). Va tras «Saltar al contenido principal», que pinta app-root.
   */
  readonly navSkip = input(false, { transform: booleanAttribute });
  /**
   * Congela el estado que se ve (editor de casos, DG-9): con una ayuda abierta la barra no cambia, para que lo que la
   * guía señala no salte 6 px. Al soltarla cae al estado que le toca.
   */
  readonly congelada = input(false, { transform: booleanAttribute });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly isFinePointer = media('(hover: hover) and (pointer: fine)', true);
  private readonly prefersReducedMotion = media('(prefers-reduced-motion: reduce)', false);
  private readonly isDesktop = media('(min-width: 64rem)', true);
  private readonly wide = signal(this.isDesktop());
  /** Ancho de escritorio (≥ 64rem, la misma media que el CSS de la barra). La barra inferior lo lee para esconderse. */
  readonly desktop = this.wide.asReadonly();
  protected readonly machine = new GlassBarMachine({
    isFinePointer: this.isFinePointer,
    isDesktop: this.isDesktop,
    prefersReducedMotion: this.prefersReducedMotion,
  });

  constructor() {
    effect(() => this.machine.freeze(this.congelada()));
    const cleanups: Array<() => void> = [];
    const listen = (target: EventTarget, type: string, fn: (event: Event) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    };

    // Modalidad: en captura sobre document, para marcar el Tab antes de que el foco se mueva. Se pinta en el DOM en
    // el mismo evento (paintModality): esperar a la detección de cambios llega tarde para ese Tab.
    listen(document, 'pointerdown', event => {
      this.machine.pointerDown((event as PointerEvent).pointerType);
      this.paintModality();
    }, { capture: true, passive: true });
    listen(document, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (key !== 'Tab') return;
      this.machine.keyDown(key, false);
      this.paintModality();
    }, { capture: true });
    listen(window, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Escape') this.machine.keyDown(key, focusInTextField());
    });
    listen(window, 'scroll', () => this.syncScroll(), { passive: true });
    listen(document, 'click', event => {
      const principal = this.host.querySelector('.modulo-principal');
      this.machine.outsideClick(!!principal?.contains(event.target as Node));
    });
    const desktop = typeof matchMedia === 'function' ? matchMedia('(min-width: 64rem)') : null;
    if (desktop) {
      listen(desktop, 'change', event => {
        const matches = (event as MediaQueryListEvent).matches;
        this.wide.set(matches);
        this.machine.setDesktop(matches);
      });
    }

    // Teclado virtual (móvil): foco en un campo + viewport visual encogido (references/movil.md §8). Los oyentes de
    // foco escriben en una microtarea: Chrome dispara focusout en el acto cuando Angular retira, en plena pintura, un
    // elemento con foco (el botón del acceso al entrar), y ahí escribir una señal es NG0600.
    const viewport = () => window.visualViewport ?? null;
    const measureKeyboard = () => this.machine.measureKeyboard(focusInTextField(), viewport()?.height ?? null);
    listen(window, 'focusin', () => queueMicrotask(measureKeyboard));
    listen(window, 'focusout', event => {
      const next = (event as FocusEvent).relatedTarget as HTMLElement | null;
      if (!next?.matches?.(TEXT_FIELD)) queueMicrotask(() => this.machine.measureKeyboard(false, viewport()?.height ?? null));
    });
    const visual = viewport();
    if (visual) listen(visual, 'resize', measureKeyboard);
    const portrait = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
    if (portrait) listen(portrait, 'change', () => this.machine.resetKeyboardReference(viewport()?.height ?? window.innerHeight));

    // Una carga ya desplazada nace en su estado.
    afterNextRender(() => this.syncScroll());
    // Techo de cada plegable = su ancho natural (desvío F3-a de _glass-bar.scss); se vuelve a medir tras cada
    // pintura (cambian los destinos al cambiar de rol) y cuando termina de cargar la fuente.
    afterEveryRender(() => this.measureFolds());
    void document.fonts?.ready.then(() => this.measureFolds());

    inject(DestroyRef).onDestroy(() => {
      cleanups.forEach(cleanup => cleanup());
      this.machine.destroy();
    });
  }

  /**
   * Invariante 7 de la barra: la modalidad llega al DOM en el MISMO evento. El navegador decide adónde va Tab justo
   * después del keydown, y los plegados solo son enfocables con data-modalidad="teclado"; la detección de cambios
   * pintaría el atributo más tarde. El binding del host escribe luego el mismo valor.
   */
  private paintModality(): void {
    const modality = this.machine.modality();
    if (modality) this.host.setAttribute('data-modalidad', modality);
    else this.host.removeAttribute('data-modalidad');
  }

  /** Posición y tope del documento (el tope con el alto VIGENTE del viewport: en iOS crece al plegarse su barra). */
  private syncScroll(): void {
    this.machine.sync(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
  }

  /**
   * Ancho natural de cada plegable (su contenido más el relleno de 0,75rem por lado), escrito por CSSOM en
   * `--asb-ancho-natural`. `scrollWidth` incluye el contenido que desborda aunque el plegable esté cerrado; se le
   * resta el relleno de ese instante. Sin caja (oculto en móvil) no se toca el valor anterior.
   */
  private measureFolds(): void {
    for (const fold of this.host.querySelectorAll<HTMLElement>('a.control-plegable')) {
      if (!fold.scrollWidth) continue;
      const style = getComputedStyle(fold);
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const value = `calc(${Math.ceil(fold.scrollWidth - padding)}px + 1.5rem)`;
      if (fold.style.getPropertyValue('--asb-ancho-natural') !== value) fold.style.setProperty('--asb-ancho-natural', value);
    }
  }

  /**
   * El enlace de salto lleva el foco al primer destino de la navegación principal: en escritorio, el módulo central;
   * por debajo de 64rem, la barra inferior (si no la hay, se queda en la píldora). Con <base href="/"> un href="#"
   * navegaría a la portada: se intercepta el clic.
   */
  protected skipToNavigation(event: Event): void {
    event.preventDefault();
    const bottom = this.desktop() ? null : this.host.querySelector<HTMLElement>('.modulo-inferior:not([hidden]) .pestana');
    const target = bottom ?? this.host.querySelector<HTMLElement>('.modulo-principal :is(a, button)');
    target?.focus();
  }

  /** Con dedo, un toque en un hueco del módulo central (no en un enlace ni un botón) alterna la atención. */
  protected onStripClick(event: Event): void {
    const target = event.target as Element | null;
    if (!target?.closest('.modulo-principal')) return;
    this.machine.tapStrip(!!target.closest('a, button'));
  }

  /** Luz que sigue al ratón, en % de la píldora (gemela, «ESCENA»). */
  protected followLight(event: PointerEvent): void {
    if (this.prefersReducedMotion() || !this.isFinePointer() || event.pointerType !== 'mouse') return;
    const nav = event.currentTarget as HTMLElement;
    const box = nav.getBoundingClientRect();
    nav.style.setProperty('--puntero-x', String(((event.clientX - box.left) / (box.width || 1)) * 100));
    nav.style.setProperty('--puntero-y', String(((event.clientY - box.top) / (box.height || 1)) * 100));
  }

  protected resetLight(): void {
    const nav = this.host.querySelector<HTMLElement>('nav.bandeja');
    nav?.style.setProperty('--puntero-x', '50');
    nav?.style.setProperty('--puntero-y', '50');
  }
}
