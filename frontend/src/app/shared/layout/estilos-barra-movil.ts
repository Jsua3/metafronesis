import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/** Solo lleva los estilos globales de la barra móvil y del carril, para que viajen con el código que los usa. */
@Component({
  selector: 'app-estilos-barra-movil',
  template: '',
  styleUrl: './barra-movil.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', hidden: '' },
})
export class EstilosBarraMovilComponent {}
