import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NAV_ITEMS } from '../../shared/layout/nav-items';
import { PaginaEstadoComponent } from '../../shared/layout/pagina-estado/pagina-estado.component';
import { UiButton } from '../../shared/ui/button/ui-button';

@Component({
  selector: 'app-forbidden', imports: [RouterLink, UiButton, PaginaEstadoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-pagina-estado tipo="sin-permiso" titulo="Esta sección no es para tu rol"
    [texto]="mensaje()" detalle="Si crees que es un error, escribe a quien administra la plataforma en tu programa.">
    <a ui-button routerLink="/portal/dashboard">Volver al inicio</a>
  </app-pagina-estado>`,
})
export class ForbiddenComponent {
  private readonly route = inject(ActivatedRoute);
  readonly seccion = input<string | undefined>();
  protected readonly mensaje = computed(() => {
    const seccion = this.seccion() ?? this.route.snapshot.queryParamMap.get('seccion') ?? this.route.snapshot.queryParamMap.get('desde');
    const item = NAV_ITEMS.find(i => i.id === seccion || i.route === seccion);
    if (!item) return 'No tienes permiso para abrir esta página.';
    const nombres = { ESTUDIANTE: 'estudiantes', PROFESOR: 'docentes', ADMIN: 'administradores' };
    return `«${item.label}» es para ${item.roles.map(rol => nombres[rol]).join(', ')}.`;
  });
}
