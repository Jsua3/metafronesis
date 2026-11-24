import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { GrupoService } from '../../core/api/grupo.service';
import { SesionesApi } from '../../core/api/sesiones.api';
import { SesionDatos, SesionDetalle } from '../../core/models/sesion.model';
import { uniqueUiId } from '../../shared/ui/button/click-guard';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { fromWindowIso, toWindowIso } from '../grupos/assignment-window.util';

export type SesionDialogData = { modo: 'crear' } | { modo: 'editar'; sesion: SesionDetalle };
export type SesionDialogResult = SesionDetalle;

type Campo = keyof SesionDatos;

/** Crear o editar una sesión: grupo, caso de la biblioteca, horario y tiempo máximo. Guarda él mismo; cada error
 * (propio o del servidor) sale en su campo y recibe el foco. */
@Component({
  selector: 'app-sesion-dialog',
  imports: [UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: textos pendientes de Psicología (VD-23). -->
    <ui-dialog-frame [title]="titulo" description="Los estudiantes activos del grupo quedan convocados.">
      <form class="sd-form" novalidate [id]="formId" (submit)="enviar($event)">
        <ui-field label="Grupo" required [error]="errores().grupoId">
          <select uiControl name="grupoId" [value]="grupoId()" (change)="grupoId.set(leer($event))">
            <option value="">Elige un grupo</option>
            @for (g of grupos(); track g.id) {
              <option [value]="g.id">{{ g.nombre }} · {{ g.totalEstudiantes }} estudiantes</option>
            }
          </select>
        </ui-field>
        <ui-field label="Caso" required [error]="errores().caseVersionId" hint="Cualquier caso publicado de la biblioteca.">
          <select uiControl name="caseVersionId" [value]="caseVersionId()" (change)="caseVersionId.set(leer($event))">
            <option value="">Elige un caso</option>
            @for (c of casos(); track c.caseVersionId) {
              <option [value]="c.caseVersionId">{{ c.titulo }} · v{{ c.version }} · {{ c.autor }}</option>
            }
          </select>
        </ui-field>
        <ui-field label="Espacio académico" required [error]="errores().espacioAcademico">
          <input uiControl name="espacioAcademico" maxlength="255" [value]="espacioAcademico()" (input)="espacioAcademico.set(leer($event))" />
        </ui-field>
        <div class="sd-par">
          <ui-field label="Inicio" required [error]="errores().inicio">
            <input uiControl type="datetime-local" name="inicio" [value]="inicio()" (input)="inicio.set(leer($event))" />
          </ui-field>
          <ui-field label="Fin" required [error]="errores().fin">
            <input uiControl type="datetime-local" name="fin" [value]="fin()" (input)="fin.set(leer($event))" />
          </ui-field>
        </div>
        <ui-field label="Tiempo máximo (minutos)" required [error]="errores().tiempoMaximoMin" [hint]="ayudaTiempo()">
          <input uiControl type="number" min="1" name="tiempoMaximoMin" [value]="tiempoMaximoMin()" (input)="tiempoMaximoMin.set(leer($event))" />
        </ui-field>
        <ui-field label="Lugar" [error]="errores().lugar">
          <input uiControl name="lugar" maxlength="255" [value]="lugar()" (input)="lugar.set(leer($event))" />
        </ui-field>
        <ui-field label="Mensaje para los estudiantes" [error]="errores().mensaje">
          <textarea uiControl name="mensaje" rows="3" maxlength="2000" [value]="mensaje()" (input)="mensaje.set(leer($event))"></textarea>
        </ui-field>
      </form>
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cancelar</button>
      <button ui-button uiDialogActions type="submit" [attr.form]="formId" [loading]="guardando()">{{ confirmar }}</button>
    </ui-dialog-frame>
  `,
  styles: [`
    :host { display: block; }
    .sd-form { display: grid; gap: var(--ds-space-4); }
    .sd-par { display: grid; gap: var(--ds-space-4); grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
  `],
})
export class SesionDialogComponent {
  protected readonly ref = inject<DialogRef<SesionDialogResult | undefined>>(DialogRef);
  private readonly data = inject<SesionDialogData>(DIALOG_DATA);
  private readonly api = inject(SesionesApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly actual = this.data.modo === 'editar' ? this.data.sesion : null;

  protected readonly formId = uniqueUiId('sd-form');
  // BORRADOR: textos pendientes de Psicología (VD-23).
  protected readonly titulo = this.actual ? 'Editar sesión' : 'Nueva sesión';
  protected readonly confirmar = this.actual ? 'Guardar cambios' : 'Crear sesión';

  protected readonly grupos = toSignal(inject(GrupoService).listar().pipe(catchError(() => of([]))), { initialValue: [] });
  protected readonly casos = toSignal(this.api.casos().pipe(catchError(() => of([]))), { initialValue: [] });

  protected readonly grupoId = signal(this.actual?.grupo ? String(this.actual.grupo.id) : '');
  protected readonly caseVersionId = signal(this.actual ? String(this.actual.caso.caseVersionId) : '');
  protected readonly espacioAcademico = signal(this.actual?.espacioAcademico ?? '');
  protected readonly inicio = signal(fromWindowIso(this.actual?.inicio));
  protected readonly fin = signal(fromWindowIso(this.actual?.fin));
  protected readonly tiempoMaximoMin = signal(this.actual ? String(this.actual.tiempoMaximoMin) : '');
  protected readonly lugar = signal(this.actual?.lugar ?? '');
  protected readonly mensaje = signal(this.actual?.mensaje ?? '');
  protected readonly errores = signal<Partial<Record<Campo, string>>>({});
  protected readonly guardando = signal(false);

  private readonly estimado = computed(() =>
    this.casos().find(c => String(c.caseVersionId) === this.caseVersionId())?.tiempoEstimadoMin ?? null);
  // BORRADOR: texto pendiente de Psicología (VD-23).
  protected readonly ayudaTiempo = computed(() => {
    const tope = this.estimado();
    return tope ? `Hasta el tiempo estimado del caso: máximo ${tope} minutos.` : 'Elige un caso para ver su tiempo estimado.';
  });

  protected leer(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  // BORRADOR: textos pendientes de Psicología (VD-23).
  private validar(): Partial<Record<Campo, string>> {
    const errores: Partial<Record<Campo, string>> = {};
    if (!this.grupoId()) errores.grupoId = 'Elige un grupo.';
    if (!this.caseVersionId()) errores.caseVersionId = 'Elige un caso.';
    if (!this.espacioAcademico().trim()) errores.espacioAcademico = 'Escribe el espacio académico.';
    if (!this.inicio()) errores.inicio = 'Escribe la fecha y la hora de inicio.';
    if (!this.fin()) errores.fin = 'Escribe la fecha y la hora de fin.';
    else if (this.inicio() && this.fin() <= this.inicio()) errores.fin = 'El fin debe ser posterior al inicio.';
    const minutos = Number(this.tiempoMaximoMin());
    const tope = this.estimado();
    if (!Number.isInteger(minutos) || minutos < 1) errores.tiempoMaximoMin = 'Escribe los minutos (1 o más).';
    else if (tope && minutos > tope) errores.tiempoMaximoMin = `El caso tiene un tiempo estimado de máximo ${tope} minutos.`;
    return errores;
  }

  private mostrar(errores: Partial<Record<Campo, string>>): void {
    this.errores.set(errores);
    afterNextRender(() => this.host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
  }

  protected enviar(event: Event): void {
    event.preventDefault();
    const errores = this.validar();
    if (Object.keys(errores).length) return this.mostrar(errores);
    const datos: SesionDatos = {
      grupoId: Number(this.grupoId()), caseVersionId: Number(this.caseVersionId()),
      espacioAcademico: this.espacioAcademico().trim(), inicio: toWindowIso(this.inicio())!, fin: toWindowIso(this.fin())!,
      tiempoMaximoMin: Number(this.tiempoMaximoMin()), lugar: this.lugar().trim(), mensaje: this.mensaje().trim(),
    };
    this.guardando.set(true);
    const peticion = this.actual ? this.api.editar(this.actual.id, datos) : this.api.crear(datos);
    peticion.subscribe({
      next: sesion => this.ref.close(sesion),
      error: (err: unknown) => {
        this.guardando.set(false);
        const cuerpo = err instanceof HttpErrorResponse ? (err.error as { field?: string } | null) : null;
        // BORRADOR: texto pendiente de Psicología (VD-23).
        const texto = apiErrorMessage(err, 'No pudimos guardar la sesión.');
        if (texto) this.mostrar({ [(cuerpo?.field as Campo) ?? 'espacioAcademico']: texto });
      },
    });
  }
}
