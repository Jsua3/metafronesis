import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TemaService } from '../../core/tema/tema.service';
import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { PaginaEstadoComponent } from '../../shared/layout/pagina-estado/pagina-estado.component';
import { UiButton } from '../../shared/ui/button/ui-button';

@Component({
  selector: 'app-not-found', imports: [RouterLink, PublicBarComponent, PaginaEstadoComponent, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (outsidePortal) {
      <div class="perdida publico" [attr.data-skin]="tema.piel()">
        <app-public-bar mode="acceso" />
        <main id="main-content" tabindex="-1" class="perdida__main">
          <app-pagina-estado tipo="no-encontrada" titulo="No encontramos esta página" texto="Puede que la dirección haya cambiado o que la página ya no exista.">
            <a ui-button routerLink="/">Volver a la portada</a>
          </app-pagina-estado>
        </main>
      </div>
    } @else {
      <app-pagina-estado tipo="no-encontrada" titulo="No encontramos esta página" texto="Puede que la dirección haya cambiado o que la página ya no exista.">
        <a ui-button routerLink="/portal/dashboard">Volver al inicio</a>
      </app-pagina-estado>
    }
  `,
  styles: [`.perdida { min-height: 100vh; } .perdida__main { padding: calc(var(--asb-alto-modulo-superior) + var(--ds-space-8)) var(--ds-space-4) var(--ds-space-8); }`],
})
export class NotFoundComponent {
  protected readonly outsidePortal = inject(ActivatedRoute).snapshot.data['fueraDelPortal'] === true;
  protected readonly tema = inject(TemaService);
}
