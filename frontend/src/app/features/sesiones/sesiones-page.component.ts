import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SesionDetalleComponent } from './sesion-detalle.component';
import { SesionListaComponent } from './sesion-lista.component';

/** «Sesiones» del docente: la lista o, con `sesionId` en la ruta, el detalle de una. */
@Component({
  selector: 'app-sesiones-page',
  imports: [SesionDetalleComponent, SesionListaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sesionId(); as id) {
      <app-sesion-detalle [sesionId]="+id" />
    } @else {
      <app-sesion-lista />
    }
  `,
})
export class SesionesPageComponent {
  readonly sesionId = input<string>();
}
