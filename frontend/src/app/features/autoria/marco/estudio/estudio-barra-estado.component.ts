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
 * Los elementos de la barra pueden usar la clase `est-dato` o `est-dato-boton` para formar cápsulas.
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
      display: flex; align-items: center; justify-content: space-between; gap: 0.375rem; min-block-size: 2.75rem; padding-inline: 0.5rem;
      color: var(--asb-cromo-tinta, var(--ds-text-1)); background: transparent;
      font-size: var(--autoria-texto-14); line-height: 1.25rem; font-variant-numeric: tabular-nums; flex-wrap: nowrap;
    }
    .lado { display: flex; align-items: center; gap: 0.375rem; min-inline-size: 0; flex-wrap: nowrap; }
    .lado:first-child { flex: 1 1 auto; }
    .lado--fin { flex: 0 0 auto; white-space: nowrap; padding-inline: 0.25rem; }
    .lado { white-space: nowrap; }
    :host ::ng-deep .est-siguiente { min-inline-size: 0; }
    :host ::ng-deep .estado-donde, :host ::ng-deep .guardado-estado { flex: none; white-space: nowrap; }
    :host ::ng-deep .est-siguiente { flex: 0 1 auto; }
    .lado--fin, :host ::ng-deep .est-dato, :host ::ng-deep .lado:first-child > .est-dato-boton {
      border: 1px solid var(--asb-filo, color-mix(in oklab, var(--ds-text-1) 15%, transparent)); border-radius: 999px;
      background: var(--asb-cromo-velo, color-mix(in oklab, var(--ds-surface-page) 92%, transparent));
      backdrop-filter: var(--asb-cromo-desenfoque, var(--ds-glass-blur));
      box-shadow: var(--asb-cromo-apoyo, 0 1px 0 rgb(20 32 46 / 0.07), 0 8px 24px rgb(20 32 46 / 0.06));
    }
    :host ::ng-deep .est-dato { display: inline-flex; align-items: center; gap: 0.375rem; min-block-size: 2.25rem; padding-inline: 0.625rem; box-sizing: border-box; }
    :host ::ng-deep .est-dato-boton {
      position: relative; display: inline-flex; align-items: center; gap: 0.375rem; min-block-size: 1.625rem; padding: 0 0.5rem;
      border: 0; border-radius: 999px; background: transparent; color: inherit; font: inherit; cursor: pointer;
    }
    :host ::ng-deep .lado:first-child > .est-dato-boton { min-block-size: 2.25rem; }
    :host ::ng-deep .lado:first-child > .est-siguiente {
      background: color-mix(in oklab, var(--ds-primary) 12%, var(--ds-surface-1));
    }
    :host ::ng-deep .est-dato-boton::after { content: ''; position: absolute; inset: -0.5rem 0; }
    @media (hover: hover) and (pointer: fine) {
      :host ::ng-deep .est-dato-boton:hover { background: var(--l-superficie-hundida); color: var(--ds-text-1); }
      :host ::ng-deep .lado:first-child > .est-siguiente:hover { background: color-mix(in oklab, var(--ds-primary) 20%, var(--ds-surface-1)); color: var(--ds-primary); }
    }
    :host ::ng-deep .est-herramienta { inline-size: 1.75rem; block-size: 1.75rem; }
    @media (pointer: coarse) {
      :host ::ng-deep .est-herramienta { min-inline-size: 2.75rem; min-block-size: 2.75rem; }
      :host ::ng-deep .est-dato-boton { min-block-size: 2.75rem; }
    }
  `,
})
export class EstudioBarraEstadoComponent {}
