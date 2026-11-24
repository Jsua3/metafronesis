import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { SesionesApi } from '../../core/api/sesiones.api';
import { Convocado, SesionDetalle, TransicionSesion } from '../../core/models/sesion.model';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  UiBadge, UiButton, UiCelda, UiCeldaAcciones, UiCeldaPrincipal, UiDataStateValue, UiDialog, UiPageActions, UiPageHeader,
  UiTable, UiTableRow, UiTableTable,
} from '../../shared/ui';
import { SesionDialogComponent, SesionDialogData, SesionDialogResult } from './sesion-dialog.component';
import { ESTADOS, INTENTOS, REFRESCO_MS, TRANSICIONES, horario, seRefresca, transicionesDe } from './sesion-presentacion';

/** Una sesión: su estado, los botones que el estado permite (los manda el servidor) y sus convocados en vivo. */
@Component({
  selector: 'app-sesion-detalle',
  imports: [
    UiBadge, UiButton, UiCelda, UiCeldaAcciones, UiCeldaPrincipal, UiPageActions, UiPageHeader, UiTable, UiTableRow, UiTableTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: textos pendientes de Psicología (VD-23). -->
    @if (sesion(); as s) {
      <ui-page-header [title]="s.caso.titulo" [eyebrow]="s.espacioAcademico" volverA="/portal/sesiones" volverEtiqueta="Sesiones"
        [description]="(s.grupo?.nombre ?? 'Sin grupo') + ' · ' + horario(s.inicio, s.fin) + (s.lugar ? ' · ' + s.lugar : '')">
        @for (accion of transiciones(); track accion) {
          <button ui-button uiPageActions type="button" [attr.data-accion]="accion" [variant]="presentacion[accion].variante"
            [icon]="presentacion[accion].icono" [loading]="ocupado() === accion" (click)="transicionar(accion)">
            {{ presentacion[accion].etiqueta }}
          </button>
        }
        @if (s.acciones.includes('editar')) {
          <button ui-button uiPageActions type="button" data-accion="editar" variant="secondary" icon="edit" (click)="editar()">Editar</button>
        }
      </ui-page-header>
      <p class="sd-estado"><ui-badge [tone]="estados[s.estado].tono">{{ estados[s.estado].etiqueta }}</ui-badge></p>

      <section class="sd-convocados" aria-labelledby="sd-convocados-titulo">
        <header class="sd-cabecera">
          <h2 id="sd-convocados-titulo">Convocados · {{ s.totalConvocados }}</h2>
          @if (gestiona()) {
            <button ui-button type="button" data-accion="sincronizar" variant="secondary" icon="sync" [loading]="ocupado() === 'sincronizar'"
              (click)="sincronizar()">Sincronizar con el grupo</button>
          }
        </header>
        <ui-table label="Convocados de la sesión" density="compact" apilar [state]="estado()">
          <table ui-table>
            <thead><tr><th>Estudiante</th><th>Correo</th><th>Intento</th><th><span class="sd-oculto">Acciones</span></th></tr></thead>
            <tbody>
              @for (c of s.convocados; track c.estudianteId) {
                <tr uiRow>
                  <td uiCeldaPrincipal>{{ c.nombre }} @if (c.estadoConvocatoria === 'RETIRADA') { <span class="sd-sub">(retirado)</span> }</td>
                  <td uiCelda="Correo">{{ c.email }}</td>
                  <td uiCelda="Intento"><ui-badge [tone]="intentos[c.intento].tono">{{ intentos[c.intento].etiqueta }}</ui-badge></td>
                  <td uiCeldaAcciones>
                    @if (gestiona() && c.estadoConvocatoria === 'ACTIVA') {
                      <button ui-button type="button" size="sm" variant="ghost" (click)="retirar(c)">Retirar</button>
                    }
                    @if (c.puedeRepetir) {
                      <button ui-button type="button" size="sm" variant="ghost" (click)="repetir(c)">Autorizar repetición</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </ui-table>
      </section>
    }
  `,
  styles: [`
    :host { display: grid; gap: var(--ds-space-5); }
    .sd-estado { margin: 0; }
    .sd-cabecera { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-3); }
    .sd-cabecera h2 { margin: 0; font-size: var(--ds-type-title-s-size, 1.125rem); }
    .sd-sub { color: var(--ds-text-2); }
    .sd-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `],
})
export class SesionDetalleComponent {
  readonly sesionId = input.required<number>();

  private readonly api = inject(SesionesApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly estados = ESTADOS;
  protected readonly intentos = INTENTOS;
  protected readonly presentacion = TRANSICIONES;
  protected readonly horario = horario;
  protected readonly sesion = signal<SesionDetalle | null>(null);
  protected readonly estado = signal<UiDataStateValue>('loading');
  protected readonly ocupado = signal<string | null>(null);
  protected readonly transiciones = computed(() => transicionesDe(this.sesion()?.acciones ?? []));
  protected readonly gestiona = computed(() => this.sesion()?.acciones.includes('gestionarConvocados') ?? false);

  /** Número de la última carga pedida: una respuesta que ya no es la última (o que una acción superó) se descarta. */
  private ultimaCarga = 0;

  constructor() {
    effect(() => this.cargar(this.sesionId()));
    effect(onCleanup => {
      const actual = this.sesion();
      if (!actual || !seRefresca(actual.estado)) return;
      const reloj = setInterval(() => this.cargar(actual.id, true), REFRESCO_MS);
      onCleanup(() => clearInterval(reloj));
    });
  }

  private cargar(id: number, silencioso = false): void {
    const numero = ++this.ultimaCarga;
    if (!silencioso) this.estado.set('loading');
    this.api.detalle(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: sesion => {
        if (numero !== this.ultimaCarga) return; // llegó una carga más nueva o una acción con estado más reciente
        this.sesion.set(sesion);
        this.estado.set('ready');
      },
      error: err => {
        if (silencioso || numero !== this.ultimaCarga) return;
        this.estado.set('error');
        // BORRADOR: texto pendiente de Psicología (VD-23).
        const texto = apiErrorMessage(err, 'No pudimos cargar la sesión.');
        if (texto) this.notify.error(texto);
      },
    });
  }

  /** Pinta la sesión que devolvió una acción e invalida cualquier carga que siga en vuelo. */
  private aplicar(sesion: SesionDetalle): void {
    this.ultimaCarga++;
    this.sesion.set(sesion);
    this.estado.set('ready');
  }

  /** Corre una petición que devuelve la sesión actualizada y la pinta; los errores del servidor salen en un aviso. */
  private ejecutar(clave: string, peticion: Observable<SesionDetalle | unknown>, exito?: string): void {
    this.ocupado.set(clave);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: respuesta => {
        this.ocupado.set(null);
        if (respuesta && typeof respuesta === 'object' && 'convocados' in respuesta) this.aplicar(respuesta as SesionDetalle);
        else this.cargar(this.sesionId(), true);
        if (exito) this.notify.success(exito);
      },
      error: err => {
        this.ocupado.set(null);
        // BORRADOR: texto pendiente de Psicología (VD-23).
        const texto = apiErrorMessage(err, 'No pudimos completar la acción.');
        if (texto) this.notify.error(texto);
      },
    });
  }

  protected async transicionar(accion: TransicionSesion): Promise<void> {
    const confirmar = this.presentacion[accion].confirmar;
    if (confirmar && !(await this.dialog.confirm(confirmar))) return;
    this.ejecutar(accion, this.api.transicionar(this.sesionId(), accion));
  }

  protected sincronizar(): void {
    this.ocupado.set('sincronizar');
    this.api.sincronizar(this.sesionId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ agregados }) => {
        this.ocupado.set(null);
        // BORRADOR: textos pendientes de Psicología (VD-23).
        this.notify.success(agregados ? `Se sumaron ${agregados} estudiantes del grupo.` : 'No hay estudiantes nuevos en el grupo.');
        this.cargar(this.sesionId(), true);
      },
      error: err => {
        this.ocupado.set(null);
        // BORRADOR: texto pendiente de Psicología (VD-23).
        const texto = apiErrorMessage(err, 'No pudimos sincronizar con el grupo.');
        if (texto) this.notify.error(texto);
      },
    });
  }

  protected async retirar(convocado: Convocado): Promise<void> {
    // BORRADOR: textos pendientes de Psicología (VD-23).
    const ok = await this.dialog.confirm({
      title: `¿Retirar a ${convocado.nombre}?`, message: 'Deja de ver el caso de esta sesión y recibe un aviso.',
      confirmLabel: 'Retirar', tone: 'danger',
    });
    if (ok) this.ejecutar('retirar', this.api.retirar(this.sesionId(), convocado.estudianteId), 'Convocatoria retirada.');
  }

  protected repetir(convocado: Convocado): void {
    // BORRADOR: texto pendiente de Psicología (VD-23).
    const motivo = window.prompt(`¿Por qué ${convocado.nombre} puede repetir el caso?`)?.trim();
    if (motivo) this.ejecutar('repetir', this.api.autorizarRepeticion(this.sesionId(), convocado.estudianteId, motivo), 'Repetición autorizada.');
  }

  protected editar(): void {
    const actual = this.sesion();
    if (!actual) return;
    const ref = this.dialog.open<SesionDialogResult | undefined, SesionDialogData>(SesionDialogComponent, { data: { modo: 'editar', sesion: actual } });
    ref.closed.subscribe(resultado => {
      if (resultado) this.aplicar(resultado);
    });
  }
}
