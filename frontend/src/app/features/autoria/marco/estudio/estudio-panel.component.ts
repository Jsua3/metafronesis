import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { EstudioHerramientaComponent } from './estudio-herramienta.component';

let siguiente = 0;

/**
 * Panel del estudio (Explorador o Inspector): cabecera compacta de 40 px con su título en versalitas, un hueco para
 * pestañas o herramientas (`[estudioPanelCabecera]`) y el botón que lo oculta; el cuerpo se desplaza solo.
 *
 * Patrón: componente de presentación. No sabe de anchos ni de almacenamiento: avisa `ocultar` y el marco decide.
 *
 * ```html
 * <app-estudio-panel titulo="Inspector" lado="fin" atajoOcultar="\" (ocultar)="estudio.alternar('inspector', false)">
 *   <div estudioPanelCabecera>…pestañas…</div>
 *   …contenido…
 * </app-estudio-panel>
 * ```
 */
@Component({
  selector: 'app-estudio-panel',
  imports: [EstudioHerramientaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', '[attr.aria-labelledby]': 'id', '[attr.data-lado]': 'lado()' },
  template: `
    <div class="cab">
      <p class="titulo" [id]="id">{{ titulo() }}</p>
      <div class="cab__extra"><ng-content select="[estudioPanelCabecera]" /></div>
      <button type="button" [estudioHerramienta]="'Ocultar ' + titulo().toLowerCase()" [atajo]="atajoOcultar()"
              [globo]="lado() === 'fin' ? 'fin' : 'inicio'" (click)="ocultar.emit()">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="4" width="14" height="12" rx="2" />
          @if (lado() === 'fin') { <path d="M12.5 4v12" /> } @else { <path d="M7.5 4v12" /> }
        </svg>
      </button>
    </div>
    <div class="cuerpo" [class.cuerpo--lleno]="lleno()"><ng-content /></div>
  `,
  styles: `
    :host {
      display: grid; grid-template-rows: auto minmax(0, 1fr); min-inline-size: 0; min-block-size: 0;
      background: var(--l-superficie); color: var(--ds-text-1); font-size: var(--autoria-texto-14);
    }
    :host([hidden]) { display: none; }
    :host([data-lado='inicio']) { border-inline-end: 1px solid var(--l-filo); }
    :host([data-lado='fin']) { border-inline-start: 1px solid var(--l-filo); }
    .cab {
      display: flex; align-items: center; gap: 0.375rem; min-block-size: 2.5rem; padding-inline: 0.75rem 0.25rem;
      border-block-end: 1px solid var(--l-filo);
    }
    .titulo {
      flex: none; margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700;
      font-variant-caps: all-small-caps; letter-spacing: 0.06em; line-height: 1.25rem;
    }
    .cab__extra { display: flex; align-items: center; flex: 1; min-inline-size: 0; }
    .cuerpo { min-block-size: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
    .cuerpo--lleno { overflow: hidden; display: grid; }
  `,
})
export class EstudioPanelComponent {
  readonly titulo = input.required<string>();
  /** A qué lado del lienzo vive: decide su filo y hacia dónde sale el globo de «Ocultar». */
  readonly lado = input<'inicio' | 'fin'>('inicio');
  readonly atajoOcultar = input<string | null>(null);
  /** El contenido maneja su propio desplazamiento (pestañas con listas largas): el cuerpo no se desplaza. */
  readonly lleno = input(false);
  readonly ocultar = output<void>();
  protected readonly id = `est-panel-${++siguiente}`;
}
