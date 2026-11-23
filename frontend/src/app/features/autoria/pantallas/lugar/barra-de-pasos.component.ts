import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Barra inferior fija de crear un caso, como la de «Nuevo proyecto» de Unity Hub o Premiere: «Atrás · Paso N de M ·
 * Continuar». Componente presentacional (sin servicios): la pantalla proyecta sus acciones en tres ranuras
 * (`[atras]`, `[estado]` y `[accion]`) y la barra solo pone el orden, la medida (64 px) y el «dónde estoy».
 *
 * Conserva el nombre «Pasos para crear el caso» del indicador anterior (contrato de nombres, EDITOR.md §6.2). El avance se
 * dibuja con marcas de 2 px por paso, el detalle pixel del simulador, y el texto «Paso N de M» lo dice para el lector.
 */
@Component({
  selector: 'app-barra-de-pasos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="barra" aria-label="Pasos para crear el caso">
      <div class="lado"><ng-content select="[atras]" /></div>
      <div class="centro">
        <p class="cuenta">Paso {{ paso() }} de {{ total() }}<span class="rotulo"> · {{ rotulo() }}</span></p>
        <span class="marcas" aria-hidden="true">
          @for (n of pasos(); track n) { <span class="marca" [class.hecha]="n < paso()" [class.actual]="n === paso()"></span> }
        </span>
      </div>
      <div class="lado lado--fin"><ng-content select="[estado]" /><ng-content select="[accion]" /></div>
    </nav>
  `,
  styles: `
    :host { display: block; position: sticky; inset-block-end: 0.75rem; z-index: var(--autoria-capa-4); margin-block-start: auto; }
    /* Material de panel, no de vidrio (el vidrio es solo de la barra superior): opaco del todo, para que nada de lo que se
       desplaza por detrás se lea a través (con 96 % se veían los temas del panel como un fantasma), filo de 1 px y sombra. */
    .barra {
      display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 0.75rem;
      block-size: 4rem; padding-inline: 0.75rem;
      border: 1px solid var(--l-filo-fuerte, var(--linea)); border-radius: var(--l-radio-tarjeta, var(--radio-tarjeta));
      background: var(--l-superficie, var(--superficie));
      box-shadow: inset 0 1px 0 var(--l-brillo, transparent), var(--sombra-menu);
    }
    @media (forced-colors: active) { .barra { border-color: CanvasText; } }
    .lado { display: flex; align-items: center; gap: 0.75rem; min-inline-size: 0; }
    .lado--fin { justify-content: flex-end; }
    .centro { display: flex; flex-direction: column; align-items: center; gap: 0.375rem; min-inline-size: 0; }
    .cuenta { margin: 0; font-size: var(--autoria-texto-14); font-weight: 700; color: var(--texto-secundario); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .rotulo { font-weight: 600; }
    .marcas { display: flex; gap: 0.25rem; }
    /* Una marca por paso: la hecha y la actual se llenan; la actual es más larga, así el avance se lee sin color. */
    .marca {
      inline-size: 1rem; block-size: var(--l-pixel, 2px); background: var(--borde-control);
      transition: inline-size var(--ds-dur-move) var(--ds-spring-soft), background-color var(--ds-dur-base) var(--ds-ease-out);
    }
    .marca.hecha { background: var(--primario); }
    .marca.actual { inline-size: 2rem; background: var(--primario); }
    @media (max-width: 40rem) {
      :host { inset-block-end: 0.5rem; }
      .barra { gap: 0.5rem; padding-inline: 0.5rem; grid-template-columns: auto minmax(0, 1fr) auto; }
      .rotulo { display: none; }
      /* En el teléfono «Paso N de M» no cabe junto a dos botones: quedan las marcas a la vista y el texto para el lector. */
      .cuenta { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
    }
    @media (prefers-reduced-motion: reduce) { .marca { transition: none; } }
  `,
})
export class BarraDePasosComponent {
  readonly paso = input.required<number>();
  readonly total = input(2);
  /** Qué se hace en este paso, en dos o tres palabras («Elegir el lugar»). */
  readonly rotulo = input('');
  protected readonly pasos = computed(() => Array.from({ length: this.total() }, (_, i) => i + 1));
}
