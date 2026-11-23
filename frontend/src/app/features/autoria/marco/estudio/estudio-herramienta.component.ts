import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** «Ctrl+Mayús+Z» → «Control+Shift+Z», el formato que pide `aria-keyshortcuts`. */
export function atajoAria(atajo: string): string {
  const nombres: Record<string, string> = { ctrl: 'Control', mayús: 'Shift', mayus: 'Shift', alt: 'Alt', supr: 'Delete', cmd: 'Meta' };
  return atajo.split('+').map((t) => nombres[t.trim().toLowerCase()] ?? t.trim()).join('+');
}

/**
 * Botón de herramienta del estudio (EDITOR-PRO.md, punto 2): un icono de 16–20 px en una tecla de 36 px con área de toque
 * de 44 px, y un globo que dice su nombre y su atajo al pasar el cursor (con una pausa breve) o al enfocarlo con el teclado.
 *
 * Patrón: Decorator sobre el `<button>` o el `<a>` nativo (selector de atributo): conserva su semántica, su foco y su
 * `disabled`; solo agrega el nombre accesible, `aria-keyshortcuts`, `aria-pressed` (si es un interruptor) y el globo.
 *
 * ```html
 * <button type="button" estudioHerramienta="Ver todo" atajo="F" (click)="verTodo()"><svg …/></button>
 * ```
 */
@Component({
  selector: 'button[estudioHerramienta], a[estudioHerramienta]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'est-herramienta',
    '[attr.aria-label]': 'estudioHerramienta()',
    '[attr.aria-keyshortcuts]': 'aria()',
    '[attr.aria-pressed]': 'activa()',
    '[attr.data-globo]': 'globo()',
  },
  template: `
    <ng-content />
    <span class="est-globo" aria-hidden="true">{{ estudioHerramienta() }}@if (atajo(); as a) {<kbd>{{ a }}</kbd>}</span>
  `,
  styles: `
    :host {
      position: relative; display: inline-grid; place-items: center; flex: none; inline-size: 2.25rem; block-size: 2.25rem;
      padding: 0; border: 1px solid transparent; border-radius: var(--l-radio-chico, 0.5rem); background: transparent;
      color: var(--ds-text-2); font: inherit; text-decoration: none; cursor: pointer;
      transition: background-color var(--ds-dur-fast) var(--ds-ease-out), color var(--ds-dur-fast) var(--ds-ease-out),
        scale var(--ds-dur-press) var(--ds-ease-out);
    }
    /* El área de toque llega a 44 px sin agrandar la tecla (densidad profesional con AA). */
    @media (pointer: coarse) { :host { min-inline-size: 2.75rem; min-block-size: 2.75rem; } }
    :host::after { content: ''; position: absolute; inset: -0.25rem; }
    :host ::ng-deep svg { inline-size: 1.125rem; block-size: 1.125rem; fill: none; stroke: currentColor; stroke-width: 1.6;
      stroke-linecap: round; stroke-linejoin: round; }
    @media (hover: hover) and (pointer: fine) {
      :host(:hover) { background: var(--l-superficie-hundida); color: var(--ds-text-1); }
    }
    :host(:active) { scale: 0.94; }
    :host([aria-pressed='true']) { background: var(--l-tinte); border-color: var(--l-tinte-filo); color: var(--ds-primary); }
    :host([disabled]), :host([aria-disabled='true']) { color: var(--ds-text-3); cursor: not-allowed; }

    .est-globo {
      position: absolute; z-index: var(--autoria-capa-10); inset-block-start: calc(100% + 0.375rem); inset-inline-start: 50%;
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.5rem; border-radius: 0.375rem;
      background: var(--ds-text-1); color: var(--ds-surface-1); font-size: var(--autoria-texto-14); font-weight: 600;
      line-height: 1.25rem; white-space: nowrap; pointer-events: none; opacity: 0; translate: -50% -0.125rem;
      transition: opacity var(--ds-dur-fast) var(--ds-ease-out), translate var(--ds-dur-fast) var(--ds-ease-out);
    }
    .est-globo kbd {
      padding: 0 0.25rem; border-radius: 0.25rem; background: color-mix(in oklab, var(--ds-surface-1) 22%, transparent);
      color: inherit; font: inherit; font-weight: 700;
    }
    :host([data-globo='arriba']) .est-globo { inset-block: auto calc(100% + 0.375rem); }
    :host([data-globo='fin']) .est-globo { inset-inline-start: auto; inset-inline-end: 0; translate: 0 -0.125rem; }
    :host([data-globo='inicio']) .est-globo { inset-inline-start: 0; translate: 0 -0.125rem; }
    /* Con el cursor, tras una pausa (no parpadea al cruzar la barra); con el teclado, en el acto. */
    @media (hover: hover) and (pointer: fine) {
      :host(:hover) .est-globo { opacity: 1; translate: -50% 0; transition-delay: 450ms; }
      :host([data-globo='fin']:hover) .est-globo, :host([data-globo='inicio']:hover) .est-globo { translate: 0 0; }
    }
    :host(:focus-visible) .est-globo { opacity: 1; translate: -50% 0; }
    :host([data-globo='fin']:focus-visible) .est-globo, :host([data-globo='inicio']:focus-visible) .est-globo { translate: 0 0; }
    /* En pantallas táctiles o estrechas no hay cursor que pase por encima: el nombre lo da el lector y el globo sobra. */
    @media (hover: none), (max-width: 63.999rem) { .est-globo { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      :host, .est-globo { transition: none; }
    }
    @media (forced-colors: active) {
      :host([aria-pressed='true']) { outline: 2px solid Highlight; }
      .est-globo { border: 1px solid CanvasText; }
    }
  `,
})
export class EstudioHerramientaComponent {
  /** El nombre de la herramienta: es su nombre accesible y el texto del globo. */
  readonly estudioHerramienta = input.required<string>();
  /** El atajo tal como se lee («F», «Ctrl+K»); se anuncia también en `aria-keyshortcuts`. */
  readonly atajo = input<string | null>(null);
  /** `true` o `false` lo vuelve interruptor (`aria-pressed`); `null`, un botón común. */
  readonly activa = input<boolean | null>(null);
  /** Hacia dónde sale el globo: debajo (por defecto), arriba, o alineado al inicio o al fin (junto a los bordes). */
  readonly globo = input<'abajo' | 'arriba' | 'inicio' | 'fin'>('abajo');
  protected readonly aria = computed(() => {
    const a = this.atajo();
    return a ? atajoAria(a) : null;
  });
}
