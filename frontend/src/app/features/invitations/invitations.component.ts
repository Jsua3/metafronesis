import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { CaseAccessCache } from '../../core/api/case-access.cache';
import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { ConfirmacionIngreso, confirmacionIngreso } from '../dashboard/student-guidance.util';
import { formatDate } from './format-date.util';

/** Lo que dice la pantalla; aparte para que quien redacta lo revise sin abrir la plantilla. */
const GRUPOS_COPY = {
  eyebrow: 'Tu entrenamiento',
  titulo: 'Tus grupos',
  descripcion: 'Tus docentes te invitan a sus grupos. Al aceptar, verás los casos que te asignen en ese grupo.',
  pendientes: {
    titulo: 'Invitaciones pendientes',
    vacio: 'No tienes invitaciones pendientes.',
    ayuda: 'Cuando tu docente te invite a un grupo, aparecerá aquí.',
  },
  miembro: { titulo: 'Grupos a los que perteneces', vacio: 'Aún no perteneces a ningún grupo.', ayuda: 'Acepta una invitación para entrar a un grupo.' },
  vacio: {
    titulo: 'Aún no perteneces a ningún grupo',
    texto: 'Los casos los asigna tu docente a tu grupo. Pídele que te invite con tu correo: la invitación aparecerá aquí y, al aceptarla, verás tus casos.',
  },
  ingreso: { accion: 'Ver mis casos' },
  error: 'No pudimos cargar tus grupos.',
  cargando: 'Cargando tus grupos…',
} as const;

/**
 * Grupos del estudiante (DISENO §4.6; plan visual F7b-5; C5 de E2-10; decisión 22 del usuario: un docente no suma a un
 * estudiante sin su aceptación). Antes se llamaba «Invitaciones» y mostraba membresías: el nombre mentía. Ahora son dos
 * secciones: las invitaciones pendientes arriba (aceptar, rechazar con confirmación) y los grupos a los que se pertenece
 * debajo (salir, con confirmación y nunca a un clic, desde un menú). Una invitación que ya no está vigente (409) se dice
 * y la lista se vuelve a pedir. Escribe el número de pendientes en la insignia de la barra (`NavBadgesService`).
 *
 * Al cambiar de grupo cambian los casos asignados: se vacía la caché de acceso (`CaseAccessCache.vaciar()`), que si no
 * seguiría mostrando por hasta un minuto los casos de antes. Al ACEPTAR, una tarjeta dice el nombre del grupo y qué sigue:
 * «Ver mis casos» si el grupo ya tiene casos, o por qué todavía no los hay (los asigna el docente). El número sale de la
 * respuesta de aceptar (`casesCount`, del grupo, no del catálogo mezclado de todos sus grupos).
 */
@Component({
  selector: 'app-invitations',
  imports: [RouterLink, UiButton, UiCabeceraIlustrada, UiCard, UiErrorState, UiMenu, UiSection, UiSkeleton, UiVacioIlustrado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Cabecera ilustrada (ronda 3): el buzón de bienestar y el carné que da acceso. Sin invitaciones, la escena pasa al
         vacío (una sola viñeta por pantalla). -->
    <ui-cabecera-ilustrada [eyebrow]="copy.eyebrow" [title]="copy.titulo" [description]="copy.descripcion"
      [escena]="state() === 'empty' ? null : 'invitacion'" />

    <p class="ds-sr-only" role="status">{{ statusText() }}</p>

    <!-- Aceptaste: el grupo y qué sigue. Lo que se anuncia a lectores de pantalla ya sale de la región de estado de arriba. -->
    @if (ingreso(); as ingresoActual) {
      <ui-card class="inv-ingreso" superficie="tinte">
        <div class="inv-item__text">
          <h2 class="inv-item__title">{{ ingresoActual.titulo }}</h2>
          <p class="inv-item__meta">{{ ingresoActual.texto }}</p>
        </div>
        <a #verMisCasos ui-button [variant]="ingresoActual.conCasos ? 'primary' : 'secondary'" routerLink="/portal/simulador">{{ copy.ingreso.accion }}</a>
      </ui-card>
    }

    @switch (state()) {
      @case ('loading') {
        <div class="inv-loading" aria-busy="true">
          @for (bone of [1, 2, 3]; track bone) {
            <ui-skeleton shape="row" />
          }
        </div>
      }
      @case ('error') {
        <ui-error-state [kind]="errorKind()" [status]="errorStatus()" [message]="copy.error" (retry)="load()" />
      }
      @case ('empty') {
        <ui-vacio-ilustrado escena="invitacion" [titulo]="copy.vacio.titulo" [frase]="copy.vacio.texto" />
      }
      @case ('ready') {
        <ui-section [title]="copy.pendientes.titulo">
          @if (pendientes().length) {
            <ul class="inv-list">
              @for (item of pendientes(); track item.groupId) {
                <li>
                  <ui-card class="inv-item" superficie="tinte">
                    <div class="inv-item__text">
                      <h3 class="inv-item__title">{{ item.groupName }}</h3>
                      @if (detalle(item); as linea) {
                        <p class="inv-item__meta">{{ linea }}</p>
                      }
                    </div>
                    <div class="inv-item__actions">
                      <button ui-button type="button" [loading]="busy() === item.groupId"
                        [attr.aria-label]="busy() === item.groupId ? 'Aceptando invitación…' : 'Aceptar la invitación a ' + item.groupName" (click)="accept(item)">{{ busy() === item.groupId ? 'Aceptando…' : 'Aceptar' }}</button>
                      <button ui-button type="button" variant="secondary"
                        [attr.aria-label]="'Rechazar la invitación a ' + item.groupName" (click)="decline(item)">Rechazar</button>
                    </div>
                  </ui-card>
                </li>
              }
            </ul>
          } @else {
            <p class="inv-vacio"><strong class="inv-vacio__titulo">{{ copy.pendientes.vacio }}</strong> {{ copy.pendientes.ayuda }}</p>
          }
        </ui-section>

        <ui-section [title]="copy.miembro.titulo">
          @if (miembro().length) {
            <ul class="inv-list">
              @for (item of miembro(); track item.groupId) {
                <li>
                  <ui-card class="inv-item">
                    <div class="inv-item__text">
                      <h3 class="inv-item__title">{{ item.groupName }}</h3>
                      @if (detalle(item); as linea) {
                        <p class="inv-item__meta">{{ linea }}</p>
                      }
                    </div>
                    <ui-menu iconOnly [label]="'Más acciones de ' + item.groupName" [items]="acciones" (itemSelected)="onAccion($event, item)" />
                  </ui-card>
                </li>
              }
            </ul>
          } @else {
            <p class="inv-vacio"><strong class="inv-vacio__titulo">{{ copy.miembro.vacio }}</strong> {{ copy.miembro.ayuda }}</p>
          }
        </ui-section>
      }
    }
  `,
  styles: [`
    /* Maquetación de página del portal: ancho máximo centrado y secciones con aire entre ellas. */
    :host {
      display: grid;
      gap: var(--ds-space-6);
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      max-inline-size: var(--l-ancho-pagina);
      margin-inline: auto;
      color: var(--ds-text-1);
    }
    .inv-loading,
    .inv-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .inv-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ds-space-4);
    }
    .inv-item__text {
      display: grid;
      flex: 1 1 14rem;
      gap: var(--ds-space-1);
      min-inline-size: 0;
    }
    .inv-item__title {
      margin: 0;
      font-size: var(--ds-type-h3-size);
      line-height: var(--ds-type-h3-line);
      font-weight: var(--ds-type-h3-weight);
      overflow-wrap: anywhere;
    }
    .inv-item__meta,
    .inv-vacio {
      margin: 0;
      color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }
    /* Una sección vacía se lee como un hueco que espera, no como una nota suelta: el contorno punteado ocupa el lugar de
       la tarjeta que vendrá, y el cuadrito hueco (un píxel de la firma, sin relleno) dice «nada pendiente». */
    .inv-vacio {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--ds-space-1) var(--ds-space-2);
      padding: var(--ds-space-4) var(--ds-space-5);
      border: 1px dashed var(--ds-border);
      border-radius: var(--l-radio-tarjeta, var(--ds-radius-lg));
    }
    .inv-vacio::before {
      content: '';
      flex: none;
      align-self: center;
      box-sizing: border-box;
      inline-size: 0.625rem;
      block-size: 0.625rem;
      border: 2px solid var(--l-acento, var(--ds-primary));
    }
    .inv-vacio__titulo {
      color: var(--ds-text-1);
      font-weight: var(--ds-type-h3-weight);
    }
    .inv-ingreso {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ds-space-4);
    }
    .inv-item__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ds-space-3);
    }
  `],
})
export class InvitationsComponent {
  private readonly api = inject(InvitationsApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly badges = inject(NavBadgesService);
  private readonly cache = inject(CaseAccessCache);

  protected readonly copy = GRUPOS_COPY;
  protected readonly invitations = signal<Invitation[]>([]);
  /** Lo que ve el estudiante: las pendientes y los grupos donde está. Las rechazadas y las retiradas no se muestran. */
  protected readonly pendientes = computed(() => this.invitations().filter(i => i.status === 'INVITED'));
  protected readonly miembro = computed(() => this.invitations().filter(i => i.status === 'ACTIVE'));
  protected readonly acciones: UiMenuItem[] = [{ value: 'salir', label: 'Salir del grupo', icon: 'logout', tone: 'danger' }];
  private readonly loading = signal(true);
  private readonly error = signal<{ status?: number } | null>(null);
  /** El grupo cuya respuesta está en curso: sus botones esperan y nada se envía dos veces. */
  protected readonly busy = signal<number | null>(null);
  /** La confirmación de la última invitación aceptada; se quita al responder otra o al salir de un grupo. */
  protected readonly ingreso = signal<ConfirmacionIngreso | null>(null);
  private readonly actionStatus = signal('');

  protected readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.pendientes().length === 0 && this.miembro().length === 0),
  });
  /** Región de estado SIEMPRE presente: la carga y el resultado de cada respuesta. */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? this.copy.cargando : this.actionStatus()));
  protected readonly errorKind = computed(() => errorKindFromStatus(this.error()?.status));
  protected readonly errorStatus = computed(() => this.error()?.status ?? null);

  private readonly injector = inject(Injector);
  private confirming = false;

  constructor() {
    this.load();
  }

  /** «Te invitó Paula · 10 oct 2026»: cada dato que no llega se omite (nunca «Sin fecha» ni un docente inventado). */
  protected detalle(item: Invitation): string {
    const partes: string[] = [];
    if (item.teacherName) partes.push(`Te invitó ${item.teacherName}`);
    if (item.invitedAt) partes.push(formatDate(item.invitedAt));
    return partes.join(' · ');
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: invitations => {
        this.invitations.set(invitations);
        this.badges.fijar('invitaciones', this.pendientes().length);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: { status?: number } | null) => {
        this.error.set(err ?? {});
        this.loading.set(false);
      },
    });
  }

  protected accept(item: Invitation): void {
    this.respond(item, this.api.accept(item.groupId), `Te uniste a ${item.groupName}.`, updated => {
      const confirmacion = confirmacionIngreso(updated);
      this.ingreso.set(confirmacion);
      afterNextRender(() => document.querySelector<HTMLElement>('.inv-ingreso a')?.focus(), { injector: this.injector });
      // Lo que se anuncia: que entró y qué sigue, en una sola frase (la tarjeta no es una región viva).
      this.actionStatus.set(`Te uniste a ${updated.groupName}. ${confirmacion.texto}`);
    });
  }

  protected async decline(item: Invitation): Promise<void> {
    const confirmed = await this.confirmOnce({
      title: 'Rechazar invitación',
      message: `¿Rechazar la invitación a «${item.groupName}»? Tu docente podrá volver a invitarte.`,
      confirmLabel: 'Rechazar',
    });
    if (confirmed) this.respond(item, this.api.decline(item.groupId), `Rechazaste la invitación a ${item.groupName}.`);
  }

  protected onAccion(accion: string | undefined, item: Invitation): void {
    if (accion === 'salir') void this.leave(item);
  }

  protected async leave(item: Invitation): Promise<void> {
    const confirmed = await this.confirmOnce({
      title: 'Salir del grupo',
      message: `¿Salir de «${item.groupName}»? Dejarás de ver los casos de ese grupo. Tu docente podrá volver a invitarte.`,
      confirmLabel: 'Salir del grupo',
      tone: 'danger',
    });
    if (confirmed) this.respond(item, this.api.leave(item.groupId), `Saliste de ${item.groupName}.`);
  }

  private async confirmOnce(options: { title: string; message: string; confirmLabel: string; tone?: 'danger' }): Promise<boolean> {
    if (this.busy() !== null || this.confirming) return false;
    this.confirming = true;
    try {
      return await this.dialog.confirm(options);
    } finally {
      this.confirming = false;
    }
  }

  /** Envía la respuesta y pone en la lista la invitación que devuelve el servidor (sin recargar a ciegas). */
  private respond(item: Invitation, request: Observable<Invitation>, success: string, alExito?: (updated: Invitation) => void): void {
    if (this.busy() !== null) return;
    this.busy.set(item.groupId);
    this.actionStatus.set('Procesando tu respuesta…');
    this.ingreso.set(null);
    request.subscribe({
      next: updated => {
        this.invitations.update(list => list.map(entry => (entry.groupId === updated.groupId ? updated : entry)));
        this.badges.fijar('invitaciones', this.pendientes().length);
        this.busy.set(null);
        this.actionStatus.set(success);
        // Aceptar o salir cambia los casos que ve la persona: lo que la caché sabía ya no vale.
        if (updated.status === 'ACTIVE' || updated.status === 'REMOVED') this.cache.vaciar();
        alExito?.(updated);
        this.notify.success(success);
      },
      error: (err: unknown) => {
        this.busy.set(null);
        const text = apiErrorMessage(err, 'No pudimos registrar tu respuesta. Inténtalo de nuevo.');
        if (text) {
          this.actionStatus.set(text);
          this.notify.error(text);
        }
        // 409: la invitación ya se respondió o dejó de estar vigente (otra pestaña, el docente la canceló).
        if (err instanceof HttpErrorResponse && err.status === 409) this.load();
      },
    });
  }
}
