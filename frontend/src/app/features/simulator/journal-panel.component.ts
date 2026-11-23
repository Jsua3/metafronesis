import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import {
  Component, ElementRef, Injector, afterNextRender, effect, inject, input, output, untracked, ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AudioDirectorService } from './audio-director.service';
import { DRAFT_COPY } from './draft-copy';
import { UiButton } from '../../shared/ui/button/ui-button';
import { SafeExitButtonComponent } from './safe-exit-button.component';

export type JournalSaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Bitácora reflexiva como overlay modal centrado (HUD redesign):
 * reflexión guiada + trazabilidad de decisiones + recursos de apoyo.
 */
@Component({
  selector: 'app-journal-panel',
  standalone: true,
  imports: [A11yModule, CommonModule, FormsModule, MatIconModule, SafeExitButtonComponent, UiButton],
  template: `
    <div class="journal-modal"
      [cdkTrapFocus]="open()"
      [cdkTrapFocusAutoCapture]="open()"
      [class.journal-modal--open]="open()"
      role="dialog"
      aria-modal="true"
      [attr.aria-hidden]="!open()"
      aria-label="Bitácora reflexiva cifrada">

      <div class="sheet-header">
        <mat-icon aria-hidden="true">menu_book</mat-icon>
        <div class="sheet-header__copy">
          <h2 id="journal-heading">Bitácora reflexiva</h2>
          <p class="psy-eyebrow sheet-sub">Razonamiento ético y formativo</p>
        </div>
        <button cdkFocusInitial class="sheet-close psy-icon-button" type="button" aria-label="Cerrar bitácora y continuar la simulación" (click)="onCloseClick()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="journal-columns">
        <section class="journal-write" aria-label="Registro reflexivo">
          <ul class="guided-prompts" aria-label="Preguntas guía">
            @for (prompt of prompts(); track prompt) {
              <li>{{ prompt }}</li>
            }
          </ul>

          <textarea
            [(ngModel)]="text"
            [disabled]="disabled() || saveState() === 'saving'"
            placeholder="Registra señales observadas, hipótesis de riesgo, ruta ética y decisión profesional."
            aria-labelledby="journal-heading"
            aria-describedby="encrypt-note journal-status"></textarea>

          <!-- Nunca «disabled»: sin texto queda aria-disabled y dice por qué (se lee por aria-describedby y sale en un
               globo); guardando o con una acción en curso queda ocupado, sin doble envío. -->
          <button ui-button variant="primary" type="button" icon="encrypted"
            [loading]="saveState() === 'saving' || (disabled() && !!text.trim())"
            [disabledReason]="text.trim() ? null : saveReason"
            (click)="save.emit(text)">
            {{ saveState() === 'saving' ? 'Guardando…' : 'Guardar bitácora' }}
          </button>

          @if (message()) {
            <p id="journal-status" class="journal-message"
              [class.journal-message--error]="saveState() === 'error'"
              [class.journal-message--saved]="saveState() === 'saved'"
              role="status" aria-live="polite">{{ message() }}</p>
          }
        </section>

        @if (timeline().length || resources().length) {
          <aside class="journal-context" aria-label="Contexto del caso">
            @if (timeline().length) {
              <div class="context-block">
                <h3 class="context-title">Trazabilidad</h3>
                <ol>
                  @for (stage of timeline(); track $index) {
                    <li>{{ stage }}</li>
                  }
                </ol>
              </div>
            }
            @if (resources().length) {
              <div class="context-block">
                <h3 class="context-title">Apoyo profesional</h3>
                <ul>
                  @for (resource of resources(); track resource) {
                    <li>{{ resource }}</li>
                  }
                </ul>
              </div>
            }
          </aside>
        }
      </div>

      <footer class="sheet-footer">
        <p class="encrypt-note" id="encrypt-note">
          <mat-icon aria-hidden="true">lock</mat-icon>
          Tu bitácora se guarda cifrada.
        </p>
        <div class="footer-actions">
          <!-- REGLA-004: la bitácora tampoco atrapa; la pausa nunca depende de «disabled». -->
          <app-safe-exit-button data-hide-key [pausing]="pausing()" (pause)="safeExit.emit()" />
          <button class="psy-button psy-button--ghost continue-btn" type="button" (click)="onCloseClick()">
            Continuar simulación
          </button>
        </div>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: contents; }
    .journal-modal {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(760px, 94vw);
      max-height: min(620px, 88vh);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 12px;
      padding: 20px;
      border: 1px solid rgba(182,156,255,.3);
      border-radius: 18px;
      background: rgba(13,18,32,.96);
      box-shadow: 0 28px 80px -32px rgba(124,77,255,.55);
      color: #e8f0f4;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translate(-50%, -47%) scale(.97);
      transition: opacity 220ms ease, transform 220ms cubic-bezier(.2,.8,.2,1), visibility 220ms;
      overflow: hidden;
      z-index: 100;
    }
    .journal-modal--open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translate(-50%, -50%) scale(1);
    }
    .sheet-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(182,156,255,.14);
    }
    .sheet-header > mat-icon { color: #B69CFF; flex-shrink: 0; }
    .sheet-header__copy { flex: 1; min-width: 0; }
    .sheet-header h2 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: 1.1rem;
      color: rgba(232,240,244,.95);
    }
    .sheet-close {
      background: rgba(255,255,255,.06);
      border-color: rgba(255,255,255,.1);
      color: rgba(232,240,244,.5);
      flex-shrink: 0;
    }
    .sheet-sub { color: rgba(182,156,255,.82); margin: 2px 0 0; }

    .journal-columns {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: 16px;
      min-height: 0;
    }
    .journal-write {
      display: grid;
      grid-template-rows: auto minmax(96px, 1fr) auto auto;
      gap: 12px;
      min-height: 0;
    }
    .guided-prompts {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 4px;
      color: rgba(232,240,244,.55);
      font-size: .76rem;
      line-height: 1.4;
    }
    textarea {
      width: 100%;
      min-height: 96px;
      resize: none;
      padding: 12px 14px;
      /* El borde delimita el campo: token de borde fuerte de la piel (≥ 3:1, WCAG 1.4.11). El foco es el anillo global. */
      border: 1px solid var(--ds-border-strong);
      border-radius: 12px;
      background: rgba(255,255,255,.04);
      color: #e8f0f4;
      font: inherit;
      line-height: 1.55;
    }
    textarea:disabled { opacity: .4; cursor: not-allowed; }
    .journal-message { margin: 0; font-weight: 800; font-size: .84rem; color: #6EC67A; }
    .journal-message--error { color: #c97a86; }
    .journal-message--saved { color: #6EC67A; }

    .journal-context {
      display: grid;
      align-content: start;
      gap: 14px;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
      border: 1px solid rgba(182,156,255,.16);
      border-radius: 12px;
      background: rgba(124,77,255,.06);
    }
    .context-block { display: grid; gap: 8px; }
    .context-title {
      margin: 0;
      color: #B69CFF;
      font-size: .75rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .journal-context ol,
    .journal-context ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
    .journal-context li { color: rgba(232,240,244,.66); font-size: .78rem; line-height: 1.4; overflow-wrap: anywhere; }

    .sheet-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid rgba(255,255,255,.06);
      padding-top: 12px;
    }
    .encrypt-note {
      display: flex; gap: 8px; align-items: center; flex: 1 1 0; min-width: 0;
      margin: 0; font-size: .75rem;
      color: rgba(232,240,244,.62);
    }
    .encrypt-note mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .footer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-shrink: 0; }
    .continue-btn { flex-shrink: 0; }

    /* Pantallas bajas (844x390): las columnas se desplazan por dentro y el pie, con la salida segura, queda siempre a la vista. */
    @media (max-height: 520px) {
      .journal-modal { padding: 12px 16px; gap: 8px; max-height: 94vh; }
      .journal-columns { overflow-y: auto; }
    }
    @media (max-width: 700px) {
      .sheet-footer { flex-wrap: wrap; }
      .footer-actions { flex-wrap: wrap; width: 100%; }
      .journal-modal { padding: 14px; max-height: 92vh; }
      .journal-columns { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
      .journal-context { order: 2; }
      /* Angosto (V7): la indicación del campo ocupa cuatro renglones; el campo crece hasta mostrarla entera, sin barra. */
      textarea { field-sizing: content; }
    }
    @media (prefers-reduced-motion: reduce) {
      .journal-modal { transition: none; }
    }
  `]
})
export class JournalPanelComponent {
  readonly open = input(false);
  /** Hay una salida segura pedida que espera: el botón «Salida segura» de la bitácora dice «Pausando…» (F6-6). */
  readonly pausing = input(false);
  readonly disabled = input(false);
  readonly message = input('');
  readonly saveState = input<JournalSaveState>('idle');
  readonly timeline = input<string[]>([]);
  readonly resources = input<string[]>([]);
  readonly prompts = input<string[]>([
    '¿Qué señales de riesgo identificaste?',
    '¿Qué decisión cambiarías si repitieras el caso?',
    '¿Qué principio ético aplicaste?',
    '¿Qué ruta institucional consideraste?',
    '¿Cómo evitaste revictimizar a la persona afectada?'
  ]);
  readonly save = output<string>();
  readonly closeSheet = output<void>();
  /** Pausa reanudable pedida desde la bitácora (REGLA-004); el anfitrión llama a la salida segura real. */
  readonly safeExit = output<void>();

  text = '';
  /** Por qué «Guardar» espera: sin texto no hay nada que guardar. */
  protected readonly saveReason = DRAFT_COPY.journalSaveReason.text;
  private readonly audio = inject(AudioDirectorService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  /** Dónde estaba el foco al abrirse (el botón de la cabecera o, con la tecla J, el juego): a ese sitio vuelve al cerrarse (WCAG 2.4.3). */
  private returnFocusTo: HTMLElement | null = null;
  private wasOpen = false;

  constructor() {
    effect(() => { if (this.open()) this.audio.playSfx('ui_select'); });
    // La bitácora no se destruye al cerrarse (solo se oculta), así que la trampa de foco del CDK no devuelve el foco al
    // destruirse: sin esto, cerrarla con Esc lo dejaba en <body> y quien navega con teclado volvía a empezar por arriba.
    // El efecto corre antes de que la trampa mueva el foco adentro, y ahí todavía está en quien abrió.
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open === this.wasOpen) return;
        this.wasOpen = open;
        if (open) this.rememberFocus();
        else this.restoreFocus();
      });
    });
  }

  private rememberFocus(): void {
    const active = document.activeElement;
    this.returnFocusTo = active instanceof HTMLElement && active !== document.body && !this.host.contains(active) ? active : null;
  }

  private restoreFocus(): void {
    const back = this.returnFocusTo;
    this.returnFocusTo = null;
    afterNextRender(() => {
      // Si otra capa ya tomó el foco (la pausa, una pantalla), no se le roba: solo se restaura cuando se perdió con la bitácora.
      const active = document.activeElement;
      if (active && active !== document.body && !this.host.contains(active)) return;
      const usable = back && back.isConnected && !back.closest('[aria-hidden="true"], [inert], [hidden]') ? back : null;
      // Quien la abrió puede haber desaparecido (el menú de ajustes se cierra al elegirla): el contenedor del juego recibe el
      // foco antes que <body>, y se prueba cada candidato hasta que uno lo toma de verdad.
      for (const candidate of [usable, document.getElementById('game-area'), document.getElementById('main-content')]) {
        if (!candidate) continue;
        candidate.focus({ preventScroll: true });
        if (document.activeElement === candidate) break;
      }
    }, { injector: this.injector });
  }

  onCloseClick(): void {
    this.audio.playSfx('ui_cancel');
    this.closeSheet.emit();
  }

  clear() {
    this.text = '';
  }
}
