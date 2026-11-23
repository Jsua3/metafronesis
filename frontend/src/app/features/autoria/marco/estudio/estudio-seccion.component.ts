import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

let siguiente = 0;

/**
 * Sección plegable del Inspector (EDITOR-PRO.md, punto 2): cabecera compacta de 36 px en versalitas con un resumen a la
 * derecha («Baja», «2 pistas») y el cuerpo que se abre con un resorte suave (rejilla de 0fr a 1fr, sin medir alturas).
 * Plegada, su contenido queda `inert`: no recibe el foco ni lo lee el lector.
 *
 * Patrón: componente de presentación con estado propio mínimo (`abierta`, enlazable con `[(abierta)]`).
 *
 * ```html
 * <app-estudio-seccion titulo="Intensidad" [resumen]="'Media'">
 *   <button estudioSeccionAccion …>…</button>   <!-- opcional: una acción junto al título -->
 *   …campos…
 * </app-estudio-seccion>
 * ```
 */
@Component({
  selector: 'app-estudio-seccion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="cab">
      <button type="button" class="cab__boton" [attr.aria-expanded]="abierta()" [attr.aria-controls]="id" (click)="abierta.set(!abierta())">
        <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 7.5 6 4 9.5" /></svg>
        <span class="cab__titulo">{{ titulo() }}</span>
        @if (resumen()) { <span class="cab__resumen">{{ resumen() }}</span> }
      </button>
      <ng-content select="[estudioSeccionAccion]" />
    </h3>
    <div class="cuerpo" [id]="id" [class.cuerpo--abierto]="abierta()" [attr.inert]="abierta() ? null : ''">
      <div class="interior"><div class="relleno"><ng-content /></div></div>
    </div>
  `,
  styles: `
    :host { display: block; border-block-end: 1px solid var(--l-filo); }
    .cab { display: flex; align-items: center; gap: 0.25rem; margin: 0; padding-inline-end: 0.25rem; font: inherit; }
    .cab__boton {
      position: relative; display: flex; align-items: center; gap: 0.375rem; flex: 1; min-inline-size: 0; min-block-size: 2.25rem;
      padding: 0 0.75rem; border: 0; background: transparent; color: var(--ds-text-2); font: inherit; font-size: var(--autoria-texto-14);
      font-weight: 700; font-variant-caps: all-small-caps; letter-spacing: 0.06em; text-align: start; cursor: pointer;
    }
    @media (pointer: coarse) { .cab__boton { min-block-size: 2.75rem; } }
    .cab__boton::after { content: ''; position: absolute; inset: -0.25rem 0; }
    @media (hover: hover) and (pointer: fine) { .cab__boton:hover { color: var(--ds-text-1); } }
    .chevron {
      flex: none; inline-size: 0.75rem; block-size: 0.75rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round;
      transition: rotate var(--ds-dur-base) var(--ds-spring-soft);
    }
    .cab__boton[aria-expanded='true'] .chevron { rotate: 90deg; }
    .cab__titulo { flex: none; }
    .cab__resumen {
      flex: 1; min-inline-size: 0; overflow: hidden; color: var(--ds-text-2); font-variant-caps: normal; font-weight: 500;
      letter-spacing: 0; text-align: end; text-overflow: ellipsis; white-space: nowrap;
    }
    .cuerpo { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--ds-dur-move) var(--ds-spring-soft); }
    .cuerpo--abierto { grid-template-rows: 1fr; }
    .interior { min-block-size: 0; overflow: hidden; }
    .relleno {
      display: flex; flex-direction: column; gap: 0.625rem; padding: 0.125rem 0.75rem 0.875rem;
      opacity: 0; transition: opacity var(--ds-dur-fast) var(--ds-ease-out);
    }
    .cuerpo--abierto .relleno { opacity: 1; }
    @media (prefers-reduced-motion: reduce) {
      .cuerpo, .relleno, .chevron { transition: none; }
    }
  `,
})
export class EstudioSeccionComponent {
  readonly titulo = input.required<string>();
  /** Lo que se ve con la sección plegada, a la derecha del título. */
  readonly resumen = input<string | null>(null);
  readonly abierta = model(true);
  protected readonly id = `est-seccion-${++siguiente}`;
}
