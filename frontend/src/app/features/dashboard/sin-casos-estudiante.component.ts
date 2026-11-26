import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { guiaSinCasos } from './student-guidance.util';

/**
 * El vacío «sin casos» del estudiante (Inicio y Casos): dice qué pasa, por qué y qué puede hacer, según su situación real
 * (sin grupo, con una invitación esperando, en un grupo que aún no tiene casos). Un estado vacío genérico dejó a 24
 * estudiantes sin saber que son sus docentes quienes asignan los casos ni cómo avisarles.
 *
 * `invitaciones`: la lista que ya tiene la pantalla; `null` si no cargó (se habla sin afirmar nada de más). Sin pasarla
 * (`undefined`), el componente la pide él mismo, una sola vez: así Casos no carga las invitaciones salvo cuando hace falta.
 * El botón siempre lleva a Grupos, que es donde se acepta una invitación o se ve a qué grupo se pertenece.
 */
@Component({
  selector: 'app-sin-casos-estudiante',
  imports: [RouterLink, UiButton, UiVacioIlustrado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-vacio-ilustrado escena="casos" [titulo]="guia().titulo" [frase]="guia().texto" [attr.data-motivo]="guia().motivo">
      <a ui-button [variant]="guia().motivo === 'invitacion-pendiente' ? 'primary' : 'secondary'" routerLink="/portal/invitaciones">{{ guia().accion }}</a>
    </ui-vacio-ilustrado>
  `,
})
export class SinCasosEstudianteComponent {
  private readonly injector = inject(Injector);

  readonly invitaciones = input<readonly Invitation[] | null | undefined>(undefined);
  /** Lo que pidió el propio componente (solo si no se le pasó nada): `null` mientras llega o si falló. */
  private readonly propias = signal<readonly Invitation[] | null>(null);
  private pedido = false;

  protected readonly guia = computed(() => {
    const dada = this.invitaciones();
    return guiaSinCasos(dada === undefined ? this.propias() : dada);
  });

  constructor() {
    effect(() => {
      if (this.invitaciones() !== undefined || untracked(() => this.pedido)) return;
      this.pedido = true;
      // Se pide con el `Injector` y no con `inject()`: si la pantalla las pasa, el servicio ni se construye.
      this.injector.get(InvitationsApi).list().subscribe({
        next: lista => this.propias.set(lista),
        // Sin las invitaciones el vacío sigue sirviendo: dice lo cierto sin afirmar el motivo.
        error: () => this.propias.set(null),
      });
    });
  }
}
