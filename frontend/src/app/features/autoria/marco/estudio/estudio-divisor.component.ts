import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/** Lo que avanza el divisor con cada flecha (px); con Mayús, el cuádruple. */
const PASO = 16;

/**
 * Divisor arrastrable entre un panel y el lienzo (EDITOR-PRO.md, punto 1). Es un `separator` enfocable (patrón «window
 * splitter» de las APG): se arrastra con el puntero, se mueve con ←/→ (Mayús: más rápido), Inicio/Fin van a los
 * límites y el doble clic o Enter vuelve al ancho por defecto.
 *
 * Patrón: componente de presentación. Emite el ancho propuesto; quien lo usa lo acota y lo guarda.
 *
 * ```html
 * <app-estudio-divisor etiqueta="Ancho del explorador" [valor]="ancho" [min]="216" [max]="400"
 *                      (cambio)="estudio.fijarAncho('explorador', $event)" (restablecer)="estudio.restablecerAncho('explorador')" />
 * ```
 * Con `[invertido]="true"` (un panel a la derecha) arrastrar a la izquierda agranda.
 */
@Component({
  selector: 'app-estudio-divisor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'separator', tabindex: '0', 'aria-orientation': 'vertical',
    '[attr.aria-label]': 'etiqueta()', '[attr.aria-valuenow]': 'valor()', '[attr.aria-valuemin]': 'min()', '[attr.aria-valuemax]': 'max()',
    '[class.arrastrando]': 'arrastrando()',
    '(pointerdown)': 'empezar($event)', '(pointermove)': 'mover($event)', '(pointerup)': 'soltar($event)',
    '(pointercancel)': 'soltar($event)', '(keydown)': 'tecla($event)', '(dblclick)': 'restablecer.emit()',
  },
  template: '<span class="filo" aria-hidden="true"></span>',
  styles: `
    /* 9 px de ancho para tomarlo; el filo visible es de 1 px y se enciende al acercarse o al arrastrar. */
    :host {
      position: relative; z-index: var(--autoria-capa-3); display: block; inline-size: 0.5625rem; margin-inline: -0.25rem;
      cursor: col-resize; touch-action: none; outline: none;
    }
    .filo {
      position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: 1px; translate: -50% 0; background: transparent;
      transition: background-color var(--ds-dur-fast) var(--ds-ease-out), inline-size var(--ds-dur-fast) var(--ds-ease-out);
    }
    @media (hover: hover) and (pointer: fine) { :host(:hover) .filo { inline-size: 3px; background: var(--l-filo-fuerte); } }
    :host(.arrastrando) .filo { inline-size: 3px; background: var(--ds-primary); }
    :host(:focus-visible) .filo { inline-size: 3px; background: var(--ds-focus); }
    @media (prefers-reduced-motion: reduce) { .filo { transition: none; } }
    @media (forced-colors: active) { :host(:focus-visible) .filo { background: Highlight; } }
  `,
})
export class EstudioDivisorComponent {
  readonly etiqueta = input.required<string>();
  readonly valor = input.required<number>();
  readonly min = input(0);
  readonly max = input(9999);
  /** `true` para un panel al lado final: arrastrar hacia el inicio lo agranda. */
  readonly invertido = input(false);
  readonly cambio = output<number>();
  readonly restablecer = output<void>();
  protected readonly arrastrando = signal(false);
  private inicio = { x: 0, valor: 0 };

  protected empezar(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.inicio = { x: e.clientX, valor: this.valor() };
    this.arrastrando.set(true);
  }

  protected mover(e: PointerEvent): void {
    if (!this.arrastrando()) return;
    const dx = (e.clientX - this.inicio.x) * (this.invertido() ? -1 : 1);
    this.cambio.emit(this.inicio.valor + dx);
  }

  protected soltar(e: PointerEvent): void {
    if (!this.arrastrando()) return;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    this.arrastrando.set(false);
  }

  protected tecla(e: KeyboardEvent): void {
    const paso = (e.shiftKey ? PASO * 4 : PASO) * (this.invertido() ? -1 : 1);
    const destinos: Record<string, () => number> = {
      ArrowRight: () => this.valor() + paso, ArrowLeft: () => this.valor() - paso, Home: () => this.min(), End: () => this.max(),
    };
    if (e.key === 'Enter') {
      e.preventDefault();
      this.restablecer.emit();
    } else if (destinos[e.key]) {
      e.preventDefault();
      this.cambio.emit(destinos[e.key]());
    }
  }
}
