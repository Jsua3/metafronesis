import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, HostListener, input, output, signal } from '@angular/core';
import { SafeExitButtonComponent } from './safe-exit-button.component';
import { VolumeBarsComponent } from './volume-bars.component';

export type MobileAction = 'places' | 'plan' | 'near' | 'controls' | 'help' | 'journal' | 'settings' | 'sensitive' | 'catalog';

@Component({
  selector: 'app-mobile-sheet',
  standalone: true,
  imports: [A11yModule, SafeExitButtonComponent, VolumeBarsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mobile-sheet-backdrop" (click)="closed.emit()" aria-hidden="true"></div>
    <section class="mobile-sheet u-placa u-sombra" role="dialog" aria-modal="true"
      [attr.aria-label]="kind() === 'menu' ? 'Menú del juego' : 'Herramientas'" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
      <header class="mobile-sheet__header">
        <!-- BORRADOR: texto pendiente de Psicología. -->
        <h2>{{ kind() === 'menu' ? 'Menú' : 'Herramientas' }}</h2>
        <button type="button" class="u-boton" data-mobile-close cdkFocusInitial (click)="closed.emit()">Cerrar</button>
      </header>
      <div class="mobile-sheet__body">
        @if (kind() === 'menu') {
          @for (item of items; track item.key) {
            <!-- BORRADOR: texto pendiente de Psicología. -->
            <button type="button" class="u-boton mobile-sheet__row" [attr.data-mobile-action]="item.key"
              (click)="choose(item.key)">{{ item.label }}</button>
            @if (item.key === 'sensitive' && sensitiveOpen() && sensitiveText()) {
              <p class="mobile-sheet__notice">{{ sensitiveText() }}</p>
            }
          }
          <app-volume-bars label="Música ambiental" muteLabel="Silenciar la música" iconOn="music_note" iconOff="music_off"
            [level]="musicLevel()" [muted]="musicMuted()" [reduceMotion]="reduceMotion()"
            (levelChange)="musicLevelChange.emit($event)" (toggleMute)="toggleMusic.emit()" />
          <app-volume-bars label="Sonidos de acciones" muteLabel="Silenciar los sonidos de acciones" iconOn="graphic_eq" iconOff="volume_off"
            [level]="sfxLevel()" [muted]="sfxMuted()" [reduceMotion]="reduceMotion()"
            (levelChange)="sfxLevelChange.emit($event)" (toggleMute)="toggleSfx.emit()" />
        } @else {
          <ng-content />
        }
      </div>
      <footer class="mobile-sheet__footer">
        <app-safe-exit-button variante="placa" data-hide-key [pausing]="pausing()" (pause)="safeExit.emit()" />
      </footer>
    </section>
  `,
  styleUrl: './mobile-sheet.component.css',
})
export class MobileSheetComponent {
  readonly kind = input<'menu' | 'tools'>('menu');
  readonly pausing = input(false);
  readonly sensitiveText = input<string | null>(null);
  readonly musicLevel = input(6);
  readonly sfxLevel = input(6);
  readonly musicMuted = input(false);
  readonly sfxMuted = input(false);
  readonly reduceMotion = input(false);
  readonly closed = output<void>();
  readonly safeExit = output<void>();
  readonly action = output<MobileAction>();
  readonly musicLevelChange = output<number>();
  readonly sfxLevelChange = output<number>();
  readonly toggleMusic = output<void>();
  readonly toggleSfx = output<void>();
  readonly sensitiveOpen = signal(false);
  // BORRADOR: texto pendiente de Psicología.
  readonly items: readonly { key: MobileAction; label: string }[] = [
    { key: 'places', label: 'Ir a…' }, { key: 'plan', label: 'Plano' },
    { key: 'near', label: 'Vista cercana' }, { key: 'controls', label: 'Controles' },
    { key: 'help', label: 'Ayuda' }, { key: 'journal', label: 'Bitácora' },
    { key: 'settings', label: 'Ajustes' }, { key: 'sensitive', label: 'Contenido sensible' },
    { key: 'catalog', label: 'Volver al catálogo' },
  ];

  choose(key: MobileAction): void {
    if (key === 'sensitive') { this.sensitiveOpen.update(value => !value); return; }
    this.action.emit(key);
  }

  @HostListener('document:keydown.escape', ['$event'])
  escape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closed.emit();
  }
}
