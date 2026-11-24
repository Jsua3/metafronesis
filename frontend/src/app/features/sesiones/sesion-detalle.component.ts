import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Provisional: la Task 10 lo reemplaza por el detalle real de la sesión. */
@Component({
  selector: 'app-sesion-detalle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class SesionDetalleComponent {
  readonly sesionId = input.required<number>();
}
