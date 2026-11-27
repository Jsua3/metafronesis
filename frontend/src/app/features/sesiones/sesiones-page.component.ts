import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SesionDetalleComponent } from './sesion-detalle.component';
import { SesionListaComponent } from './sesion-lista.component';

/** «Sesiones» del docente: la lista o, con `sesionId` en la ruta, el detalle de una. */
@Component({
  selector: 'app-sesiones-page',
  imports: [SesionDetalleComponent, SesionListaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sp-layout" [class.sp-layout--detalle]="!!sesionId()">
      <app-sesion-lista class="sp-lista" [class.sp-lista--detalle]="!!sesionId()" [compacta]="!!sesionId()" />
      @if (sesionId(); as id) {
        <app-sesion-detalle [sesionId]="+id" />
      }
    </div>
  `,
  styles: `
    :host { display: grid; min-inline-size: 0; container-type: inline-size; }
    .sp-layout { display: grid; min-inline-size: 0; }
    .sp-lista--detalle { display: none; }
    @media (max-width: 63.999rem) and (min-height: 31.25rem) {
      @container (min-width: 52.5rem) {
        .sp-layout--detalle { grid-template-columns: 18rem minmax(0, 1fr); gap: var(--ds-space-5); align-items: start; }
        .sp-lista--detalle { display: block; grid-column: 1; grid-row: 1; min-inline-size: 0; }
        .sp-lista--detalle + app-sesion-detalle { grid-column: 2; grid-row: 1; min-inline-size: 0; }
      }
    }
  `,
})
export class SesionesPageComponent {
  readonly sesionId = input<string>();
}
