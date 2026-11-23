import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UiButton } from '../../shared/ui/button/ui-button';

/**
 * ETH-01: el almacenamiento falló y el consentimiento NO está registrado; el aviso previo sigue (sin mundo) y se puede
 * reintentar. Vive aparte de `simulation-play` para que su hoja no pase el tope de 20 kB por componente (pasada final,
 * B4b): lo que se ve y lo que se anuncia son lo de antes (el texto lo dice la región viva del juego).
 */
@Component({
  selector: 'app-error-consentimiento',
  imports: [MatIconModule, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'consent-error' },
  template: `
    <mat-icon aria-hidden="true">error</mat-icon>
    <p>{{ texto() }}</p>
    <button ui-button type="button" variant="secondary" (click)="reintentar.emit()">Reintentar</button>
  `,
  styles: [`
    :host {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px 10px;
      margin-top: 14px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid rgba(226,90,79,.5); background: rgba(226,90,79,.1);
    }
    mat-icon { color: #f1a79f; }
    p { margin: 0; color: #f4f7fb; font-size: .9rem; line-height: 1.5; }
    button { grid-column: 2; justify-self: start; }
  `],
})
export class ErrorConsentimientoComponent {
  readonly texto = input.required<string>();
  readonly reintentar = output<void>();
}
