import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';

import { DRAFT_COPY } from './draft-copy';
import { PixelIconoComponent } from './pixel/pixel-icono.component';

/** Cuánto se ve la franja completa al entrar a una escena con aviso, antes de plegarse a su chip. */
export const SENSITIVE_UNFOLDED_MS = 8000;

let nextNoticeId = 0;

/**
 * Aviso ético de la escena sensible (ETH-01), bajo la cabecera del juego. Al entrar a una escena con aviso se ve completo
 * `SENSITIVE_UNFOLDED_MS` y luego se pliega a un chip «Contenido sensible» que sigue siempre a la vista y lo despliega de nuevo.
 * Plegar no oculta el aviso a nadie: el texto completo queda en el DOM (solo para lectores de pantalla) y el chip es un
 * botón con `aria-expanded`. Ocupa su propio sitio en la cabecera (no flota), así que no tapa al personaje ni los controles.
 * Con movimiento reducido el pliegue ocurre sin animación.
 */
@Component({
  selector: 'app-sensitive-notice',
  standalone: true,
  imports: [PixelIconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as notice) {
      <div class="sensitive-strip" [class.u-placa]="unfolded()" [class.u-sombra]="unfolded()"
        [class.sensitive-strip--folded]="!unfolded()" [class.sensitive-strip--still]="reduceMotion()">
        <p class="sensitive-strip__text" [id]="textId" [class.sr-only]="!unfolded()">{{ notice }}</p>
        <button type="button" class="sensitive-strip__chip u-boton" [class.u-sombra]="!unfolded()" [attr.aria-expanded]="unfolded()"
          [attr.aria-controls]="textId" (click)="toggle()">
          <app-pixel-icono nombre="aviso" />{{ copy.sensitiveChip.text }}
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    /* Bloque U1: desplegado es una placa del cuadro de diálogo con el texto y su chip; plegado queda solo el chip, una
       placa-botón con el triángulo de aviso en ámbar (el mismo del aviso de ficha «Aún no tienes esta herramienta»).
       Va en el carril de avisos de arriba al centro: no tapa al personaje ni los controles. */
    .sensitive-strip {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: calc(2 * var(--pixel-px, 2px));
      padding: calc(3 * var(--pixel-px, 2px)) calc(5 * var(--pixel-px, 2px)) calc(4 * var(--pixel-px, 2px));
      color: var(--pixel-tinta);
      font-size: var(--pixel-tam, 14px);
      line-height: 1.4;
      animation: sensitive-strip-in .2s ease-out;
    }
    .sensitive-strip--folded { padding: 0; }
    .sensitive-strip__text { margin: 0; align-self: stretch; }
    .sensitive-strip__chip { flex: none; color: var(--pixel-ambar); font-weight: 700; }
    .sensitive-strip--still { animation: none; }
    @keyframes sensitive-strip-in { from { opacity: .4; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .sensitive-strip { animation: none; } }
  `],
})
export class SensitiveNoticeComponent {
  /** El aviso de la escena (`null` si no hay: no se pinta nada). */
  readonly text = input<string | null>(null);
  /** Identifica la escena: al cambiar, el aviso vuelve a verse completo. */
  readonly sceneKey = input<string | null>(null);
  /** Con el ajuste «Reducir movimiento» el pliegue no se anima. */
  readonly reduceMotion = input(false);

  protected readonly copy = DRAFT_COPY;
  protected readonly textId = `sensitive-notice-${nextNoticeId++}`;
  protected readonly unfolded = signal(true);

  constructor() {
    effect(onCleanup => {
      this.sceneKey();
      if (!this.text()) return;
      untracked(() => this.unfolded.set(true));
      const timer = setTimeout(() => this.unfolded.set(false), SENSITIVE_UNFOLDED_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected toggle(): void {
    this.unfolded.update(open => !open);
  }
}
