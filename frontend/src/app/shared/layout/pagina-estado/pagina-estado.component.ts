import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { DoodlesComponent } from '../../ui/doodles/doodles.component';
import { UiVineta } from '../../ui/vineta/ui-vineta';

/**
 * Estructura ligera compartida de las pantallas de estado (presentacional: título, texto y acciones proyectadas); el
 * arte de la pantalla sin conexión no descarga recursos.
 */
@Component({
  selector: 'app-pagina-estado',
  imports: [DoodlesComponent, UiVineta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tipo() !== 'sin-conexion') {
      <app-doodles desde="#estado-pagina" hasta="#estado-pagina" intensidad="suave" [interactivo]="false" />
    }
    <section id="estado-pagina" class="estado" [class.estado--sin-conexion]="tipo() === 'sin-conexion'">
      <!-- El arte decorativo sale del simulador (ui-vineta, ronda 3): la 404 es alguien frente a la cartelera buscando
           por dónde seguir; «sin permiso», la cinta de zona restringida con el vigilante, que informa y no amenaza.
           Detrás, los doodles suaves de la portada, solo en esta zona y sin luz del cursor. «Sin conexión» no descarga
           nada (no hay red): ni viñeta ni doodles, su firma es solo CSS. -->
      @switch (tipo()) {
        @case ('no-encontrada') { <ui-vineta class="estado__vineta" escena="perdido" /> }
        @case ('sin-permiso') { <ui-vineta class="estado__vineta" escena="restringido" /> }
        @default { <div class="estado__arte" aria-hidden="true"><span></span><span></span><span></span></div> }
      }
      <h1>{{ titulo() }}</h1>
      <p>{{ texto() }}</p>
      @if (detalle()) { <p class="estado__detalle">{{ detalle() }}</p> }
      <div class="estado__acciones"><ng-content /></div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .estado { box-sizing: border-box; display: grid; justify-items: center; align-content: center;
      width: min(100%, 40rem); min-height: 55vh; margin-inline: auto; padding: var(--ds-space-6) var(--ds-space-4);
      text-align: center; color: var(--ds-text-1); overflow-wrap: anywhere; }
    .estado { position: relative; z-index: var(--ds-z-elevado); }
    .estado__vineta { inline-size: 100%; margin-bottom: var(--ds-space-5); }
    .estado__arte { display: flex; align-items: end; gap: var(--ds-space-2); margin-bottom: var(--ds-space-5); }
    .estado__arte span { width: 1rem; height: 1rem; background: var(--ds-primary); }
    .estado__arte span:nth-child(2) { height: 2rem; }
    .estado--sin-conexion .estado__arte span:last-child { box-sizing: border-box; background: transparent; border: 2px solid var(--ds-primary); }
    h1 { margin: var(--ds-space-2) 0; color: var(--ds-text-1); font-size: var(--ds-type-h1-size); line-height: var(--ds-type-h1-line); }
    p { max-width: 34rem; margin: var(--ds-space-2) 0; color: var(--ds-text-2); line-height: var(--ds-type-body-line); }
    .estado__acciones { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--ds-space-3); margin-top: var(--ds-space-5); }
    @media (forced-colors: active) { .estado__arte span { border: 1px solid CanvasText; } }
  `],
})
export class PaginaEstadoComponent {
  readonly tipo = input.required<'no-encontrada' | 'sin-permiso' | 'sin-conexion' | 'error'>();
  readonly titulo = input.required<string>();
  readonly texto = input.required<string>();
  readonly detalle = input<string | null>(null);
}
