import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Barra de estado del estudio (EDITOR-PRO.md, punto 1): una franja de 30 px al pie, con lo que informa a la izquierda
 * (guardado, pendientes) y lo que se ajusta a la derecha (zoom, atajos). Texto de 14 px en gris, cifras tabulares.
 *
 * Patrón: componente de presentación; solo reparte. Lo que deba anunciarse lleva su propio `role="status"`.
 *
 * ```html
 * <app-estudio-barra-estado>
 *   <span estudioEstadoInicio>Guardado</span>
 *   <button estudioHerramienta="Atajos" atajo="?">?</button>
 * </app-estudio-barra-estado>
 * ```
 * Los elementos de la barra pueden usar la clase `est-dato` (texto con separador) y `est-dato-boton` (un dato pulsable).
 */
@Component({
  selector: 'app-estudio-barra-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-label': 'Barra de estado' },
  template: `
    <div class="lado"><ng-content select="[estudioEstadoInicio]" /></div>
    <div class="lado lado--fin"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-block-size: 1.875rem; padding-inline: 0.5rem;
      border-block-start: 1px solid var(--l-filo); background: var(--l-superficie); color: var(--ds-text-2);
      font-size: var(--autoria-texto-14); line-height: 1.25rem; font-variant-numeric: tabular-nums; overflow: hidden;
    }
    .lado { display: flex; align-items: center; gap: 0.125rem; min-inline-size: 0; white-space: nowrap; }
    .lado--fin { flex: none; }
    :host ::ng-deep .est-dato { display: inline-flex; align-items: center; gap: 0.375rem; padding-inline: 0.5rem; }
    :host ::ng-deep .est-dato + .est-dato, :host ::ng-deep .est-dato + .est-dato-boton, :host ::ng-deep .est-dato-boton + .est-dato {
      border-inline-start: 1px solid var(--l-filo);
    }
    :host ::ng-deep .est-dato-boton {
      position: relative; display: inline-flex; align-items: center; gap: 0.375rem; min-block-size: 1.625rem; padding: 0 0.5rem;
      border: 0; border-radius: 0.375rem; background: transparent; color: inherit; font: inherit; cursor: pointer;
    }
    :host ::ng-deep .est-dato-boton::after { content: ''; position: absolute; inset: -0.5rem 0; }
    @media (hover: hover) and (pointer: fine) {
      :host ::ng-deep .est-dato-boton:hover { background: var(--l-superficie-hundida); color: var(--ds-text-1); }
    }
    :host ::ng-deep .est-herramienta { inline-size: 1.75rem; block-size: 1.75rem; }
    @media (pointer: coarse) {
      :host ::ng-deep .est-herramienta { min-inline-size: 2.75rem; min-block-size: 2.75rem; }
      :host ::ng-deep .est-dato-boton { min-block-size: 2.75rem; }
    }
  `,
})
export class EstudioBarraEstadoComponent {}
