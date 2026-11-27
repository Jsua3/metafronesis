import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject } from '@angular/core';

import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { roleLabel } from '../../shared/ui/labels';
import { CuentaRecordada, CuentasRecordadasService } from './cuentas-recordadas.service';

/**
 * «Quitar cuentas de esta lista…» (SIEP-281): una fila por cuenta recordada en este navegador, con su botón, y «Quitar
 * todas». Quita solo el recuerdo local (la cuenta sigue existiendo y la sesión actual no se cierra). La cuenta actual
 * también puede quitarse. Se abre con `UiDialog.open(CuentasRecordadasDialogoComponent)`.
 */
@Component({
  selector: 'app-cuentas-recordadas-dialogo',
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: texto pendiente de Psicología -->
    <ui-dialog-frame title="Quitar cuentas de esta lista"
      description="Solo se quitan de este navegador. Las cuentas siguen existiendo y tu sesión actual no se cierra.">
      <ul class="cuentas-dialogo__lista">
        @for (cuenta of cuentas(); track cuenta.id) {
          <li class="cuentas-dialogo__fila">
            <span class="cuentas-dialogo__datos">
              <span class="cuentas-dialogo__nombre">{{ nombre(cuenta) }}</span>
              <span class="cuentas-dialogo__detalle">{{ rol(cuenta) }} · {{ cuenta.email }}</span>
            </span>
            <!-- BORRADOR: texto pendiente de Psicología -->
            <button ui-button type="button" variant="secondary" class="cuentas-dialogo__quitar"
              [attr.aria-label]="'Quitar de esta lista: ' + nombre(cuenta)" (click)="quitar(cuenta.id)">Quitar</button>
          </li>
        }
      </ul>
      <!-- BORRADOR: texto pendiente de Psicología -->
      <button ui-button uiDialogActions type="button" variant="secondary" class="cuentas-dialogo__cerrar" (click)="ref.close()">Cerrar</button>
      <button ui-button uiDialogActions type="button" variant="danger" class="cuentas-dialogo__todas" (click)="quitarTodas()">Quitar todas</button>
    </ui-dialog-frame>
  `,
  styles: [`
    .cuentas-dialogo__lista { display: grid; margin: 0; padding: 0; list-style: none; }
    /* Una fila por cuenta: datos que se recortan y un botón corto que nunca se parte (el nombre accesible lleva el resto). */
    .cuentas-dialogo__fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--ds-space-3); padding-block: var(--ds-space-2); border-block-end: 1px solid var(--ds-border); }
    .cuentas-dialogo__fila:last-child { border-block-end: 0; }
    .cuentas-dialogo__quitar { white-space: nowrap; }
    .cuentas-dialogo__datos { display: flex; flex-direction: column; min-inline-size: 0; }
    .cuentas-dialogo__nombre { color: var(--ds-text-1); font-weight: 600; overflow-wrap: anywhere; }
    .cuentas-dialogo__detalle { color: var(--ds-text-3); font-size: var(--ds-type-caption-size); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class CuentasRecordadasDialogoComponent {
  protected readonly ref = inject<DialogRef<void>>(DialogRef);
  private readonly servicio = inject(CuentasRecordadasService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly cuentas = this.servicio.cuentas;

  protected nombre(cuenta: CuentaRecordada): string {
    return `${cuenta.nombre} ${cuenta.apellido}`.trim() || cuenta.email;
  }

  protected rol(cuenta: CuentaRecordada): string {
    return roleLabel(cuenta.rol);
  }

  protected quitar(id: number): void {
    this.servicio.quitar(id);
    if (this.servicio.cuentas().length === 0) {
      this.ref.close();
      return;
    }
    // La fila quitada se lleva el foco: pasa al primer botón que queda para no perderlo en `<body>`.
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.cuentas-dialogo__quitar')?.focus(), { injector: this.injector });
  }

  protected quitarTodas(): void {
    this.servicio.quitarTodas();
    this.ref.close();
  }
}
