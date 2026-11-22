import { AriaDescriber, InputModalityDetector } from '@angular/cdk/a11y';
import {
  ConnectedPosition, OverlayRef, createFlexibleConnectedPositionStrategy, createOverlayRef,
  createRepositionScrollStrategy,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy, Component, ComponentRef, DestroyRef, Directive, ElementRef, Injectable, Injector, effect,
  inject, input, signal,
} from '@angular/core';
import { contenedorDePiel } from '../piel';

/** Retardo con el ratón la primera vez (plan visual §2.6). */
export const UI_TOOLTIP_SHOW_DELAY_MS = 400;
/** Si otro globo estuvo abierto hace menos de esto, el siguiente aparece sin retardo. */
export const UI_TOOLTIP_WARM_MS = 300;
/** Gracia al salir el puntero: deja pasar al globo sin que desaparezca (WCAG 1.4.13, «se puede sobrevolar»). */
export const UI_TOOLTIP_HIDE_GRACE_MS = 100;
/** Tiempo visible del motivo que se muestra al pulsar un control bloqueado (clic o toque, sin hover). */
export const UI_TOOLTIP_TAP_VISIBLE_MS = 4000;
/** Duración de la salida (§2.7: 100–140 ms). */
const UI_TOOLTIP_LEAVE_MS = 120;

const POSITIONS: ConnectedPosition[] = [
  { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8, panelClass: 'ui-tooltip-pane--above' },
  { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8, panelClass: 'ui-tooltip-pane--below' },
];

/** Globo visible (role="tooltip"). Nace de su disparador: el origen de la transformación sigue a la posición. */
@Component({
  selector: 'ui-tooltip-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-tooltip ds-motion',
    role: 'tooltip',
    '[class.ui-tooltip--leaving]': 'leaving()',
  },
  template: '{{ text() }}',
  styleUrl: './ui-tooltip.scss',
})
export class UiTooltipPanel {
  readonly text = signal('');
  readonly leaving = signal(false);
}

/** Estado compartido entre globos: cuál está abierto y cuándo se cerró el último (retardo saltado entre vecinos). */
@Injectable({ providedIn: 'root' })
export class UiTooltipCoordinator {
  visible: UiTooltipController | null = null;
  lastHiddenAt = Number.NEGATIVE_INFINITY;

  isWarm(asking: UiTooltipController): boolean {
    return (this.visible !== null && this.visible !== asking) || Date.now() - this.lastHiddenAt < UI_TOOLTIP_WARM_MS;
  }
}

export interface UiTooltipOptions {
  /** Añadir el texto a aria-describedby del disparador (no, si el componente ya lo describe por su cuenta). */
  describe: boolean;
}

/**
 * Comportamiento del globo sobre un elemento (plan visual §2.6, F2-6): lo usan la directiva `uiTooltip` y los
 * botones de shared/ui (motivo de deshabilitado, nombre del botón de icono). Ratón: 400 ms, 0 ms entre vecinos;
 * teclado: al instante con el foco; toque: nunca (tampoco por el mouseenter de compatibilidad que sigue al toque);
 * Esc o pulsar lo cierran sin mover el foco.
 */
export class UiTooltipController {
  readonly text = signal<string | null>(null);

  private readonly modality: InputModalityDetector;
  private readonly coordinator: UiTooltipCoordinator;
  private readonly describer: AriaDescriber;
  private overlayRef: OverlayRef | null = null;
  private panel: ComponentRef<UiTooltipPanel> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private described: string | null = null;
  /** Oyentes del disparador (toda la vida) y del globo visible (mientras se ve). */
  private readonly triggerListeners: Listener[] = [];
  private panelListeners: Listener[] = [];

  constructor(private readonly element: HTMLElement, private readonly injector: Injector, private readonly options: UiTooltipOptions) {
    this.modality = injector.get(InputModalityDetector);
    this.coordinator = injector.get(UiTooltipCoordinator);
    this.describer = injector.get(AriaDescriber);
    const listen = (type: string, listener: EventListener) => this.triggerListeners.push(on(element, type, listener));
    listen('mouseenter', () => this.onPointerEnter());
    listen('mouseleave', () => this.scheduleHide());
    listen('focusin', () => {
      if (this.modality.mostRecentModality === 'keyboard') this.show();
    });
    listen('focusout', () => this.hide());
    listen('mousedown', () => this.hideNow());
  }

  /** Actualiza el texto (null = sin globo) y la descripción accesible. */
  setText(text: string | null | undefined): void {
    const value = text?.trim() ? text : null;
    this.text.set(value);
    if (this.options.describe) this.describe(value);
    if (!value) this.hideNow();
    else if (this.panel) this.render(value);
  }

  /**
   * Muestra el globo YA, sin retardo ni condición de modalidad (motivo de un control bloqueado al pulsarlo, también
   * con un toque). Se va solo a los `visibleMs`, al pulsar fuera, con Esc o al perder el foco.
   */
  showNow(visibleMs = UI_TOOLTIP_TAP_VISIBLE_MS): void {
    if (!this.text()) return;
    this.show();
    this.hideTimer = setTimeout(() => this.hide(), visibleMs);
  }

  destroy(): void {
    this.hideNow();
    this.overlayRef?.dispose();
    this.overlayRef = null;
    if (this.options.describe) this.describe(null);
    this.triggerListeners.splice(0).forEach(off => off());
  }

  private onPointerEnter(): void {
    if (!this.text() || this.modality.mostRecentModality === 'touch') return;
    this.clearTimers();
    if (this.coordinator.isWarm(this)) {
      this.show();
      return;
    }
    this.showTimer = setTimeout(() => this.show(), UI_TOOLTIP_SHOW_DELAY_MS);
  }

  private show(): void {
    const text = this.text();
    if (!text) return;
    this.clearTimers();
    const previous = this.coordinator.visible;
    if (previous && previous !== this) previous.hideNow();
    if (!this.panel) {
      this.overlayRef ??= this.createOverlay();
      this.panel = this.overlayRef.attach(new ComponentPortal(UiTooltipPanel, null, this.injector));
      const pane = this.overlayRef.overlayElement;
      this.panelListeners = [
        on(pane, 'mouseenter', () => this.clearTimers()),
        on(pane, 'mouseleave', () => this.scheduleHide()),
        on(this.element.ownerDocument, 'keydown', event => {
          if ((event as KeyboardEvent).key === 'Escape' && this.panel) this.hide();
        }),
        // Pulsar fuera (ratón, dedo o lápiz) lo cierra: sin hover, es la única forma natural de descartarlo.
        on(this.element.ownerDocument, 'pointerdown', event => {
          const target = event.target as Node | null;
          if (this.panel && target && !this.element.contains(target) && !pane.contains(target)) this.hide();
        }),
      ];
    }
    // DP-24: el globo vive en la capa del CDK, fuera de la piel de su disparador; se la copia en cada aparición (el
    // shell cambia de piel con el tema). Sin contenedor con piel, queda la de :root.
    const piel = contenedorDePiel(this.element)?.getAttribute('data-skin');
    const pane = this.overlayRef!.overlayElement;
    if (piel) pane.setAttribute('data-skin', piel);
    else pane.removeAttribute('data-skin');
    this.panel.instance.leaving.set(false);
    this.render(text);
    this.coordinator.visible = this;
  }

  private render(text: string): void {
    this.panel!.instance.text.set(text);
    this.panel!.changeDetectorRef.detectChanges();
  }

  private scheduleHide(): void {
    clearTimeout(this.showTimer);
    if (!this.panel) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), UI_TOOLTIP_HIDE_GRACE_MS);
  }

  /** Salida animada (100–140 ms) y luego fuera del DOM. */
  private hide(): void {
    this.clearTimers();
    if (!this.panel) return;
    this.panel.instance.leaving.set(true);
    this.panel.changeDetectorRef.detectChanges();
    this.hideTimer = setTimeout(() => this.hideNow(), UI_TOOLTIP_LEAVE_MS);
  }

  hideNow(): void {
    this.clearTimers();
    if (this.panel) {
      this.overlayRef?.detach();
      this.panel = null;
      this.panelListeners.splice(0).forEach(off => off());
    }
    if (this.coordinator.visible === this) {
      this.coordinator.visible = null;
      this.coordinator.lastHiddenAt = Date.now();
    }
  }

  private createOverlay(): OverlayRef {
    const positionStrategy = createFlexibleConnectedPositionStrategy(this.injector, this.element)
      .withPositions(POSITIONS)
      .withFlexibleDimensions(false)
      .withViewportMargin(8)
      .withPush(true);
    return createOverlayRef(this.injector, {
      positionStrategy,
      scrollStrategy: createRepositionScrollStrategy(this.injector),
      panelClass: 'ui-tooltip-pane',
    });
  }

  private describe(text: string | null): void {
    if (this.described) this.describer.removeDescription(this.element, this.described, 'tooltip');
    this.described = text;
    if (text) this.describer.describe(this.element, text, 'tooltip');
  }

  private clearTimers(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.showTimer = undefined;
    this.hideTimer = undefined;
  }

}

type Listener = () => void;

/** Añade un oyente y devuelve la función que lo quita. */
function on(target: EventTarget, type: string, listener: EventListener): Listener {
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}

/** Crea el comportamiento de globo sobre el elemento anfitrión (en un contexto de inyección). */
export function injectUiTooltip(options: UiTooltipOptions): UiTooltipController {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const controller = new UiTooltipController(element, inject(Injector), options);
  inject(DestroyRef).onDestroy(() => controller.destroy());
  return controller;
}

/**
 * Globo de ayuda (plan visual §2.6, F2-6): `[uiTooltip]="texto"`. Complementa, nunca sustituye, al nombre del
 * control; su texto se lee como descripción (aria-describedby) salvo que repita el aria-label. `null` o vacío: sin
 * globo.
 */
@Directive({ selector: '[uiTooltip]' })
export class UiTooltip {
  readonly text = input<string | null | undefined>(null, { alias: 'uiTooltip' });

  constructor() {
    const controller = injectUiTooltip({ describe: true });
    effect(() => controller.setText(this.text()));
  }
}
