import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Botón «Salida segura» (REGLA-004 / ETH-02): LA implementación única. El pie del juego y todas las superposiciones
 * (diálogo, bitácora, introducción, contexto) lo comparten: el mismo rótulo, el mismo nombre accesible y el mismo
 * estado «Pausando…» (F6-6).
 *
 * Presentacional: solo emite `pause`; quien lo aloja decide cómo pausar el intento y si la pausa queda en cola tras
 * una petición en curso (`pausing`): el toque se acepta siempre, el botón no se deshabilita.
 * El nombre accesible es el texto visible (WCAG 2.5.3): la pista `Esc` y el icono van ocultos a las tecnologías de
 * apoyo, y la pista solo se pinta con puntero fino y hover. El foco lo pinta el anillo global de la piel
 * (`--ds-focus`): este botón no trae uno propio. Sin la clase `close-btn`: los e2e la pulsan para avanzar o cerrar
 * diálogos.
 */
@Component({
  selector: 'app-safe-exit-button',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <button type="button" class="safe-exit-btn" [class.safe-exit-btn--compact]="compact()" [class.safe-exit-btn--placa]="variante() === 'placa'"
      [attr.aria-busy]="pausing() ? 'true' : null" (click)="pause.emit()">
      <mat-icon class="safe-exit-btn__icon" aria-hidden="true">exit_to_app</mat-icon>
      <span class="safe-exit-btn__label">{{ pausing() ? 'Pausando…' : 'Salida segura' }}</span>
      <kbd class="safe-exit-btn__kbd" aria-hidden="true">Esc</kbd>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: inline-flex; }
    .safe-exit-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      min-width: 44px;
      padding: 6px 14px;
      border: 1px solid rgba(226,90,79,.4);
      border-radius: 12px;
      background: rgba(226,90,79,.1);
      color: #f1a79f;
      font: inherit;
      font-size: .8rem;
      font-weight: 900;
      letter-spacing: .03em;
      white-space: nowrap;
      cursor: pointer;
      transition: border-color 160ms, background 160ms;
    }
    .safe-exit-btn:active { transform: translateY(1px); }
    /* Pausa pedida: el toque ya está en cola; se ve apagado y con cursor de espera, sin deshabilitarse. */
    .safe-exit-btn[aria-busy='true'] { opacity: .75; cursor: progress; }
    .safe-exit-btn__icon { flex-shrink: 0; font-size: 19px; width: 19px; height: 19px; }
    .safe-exit-btn__kbd {
      display: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: .75rem;
      font-weight: 700;
      color: rgba(241,167,159,.82);
    }
    /* El hover y la tecla solo donde existen un puntero fino y un teclado (un híbrido táctil no queda «pegado»). */
    @media (hover: hover) and (pointer: fine) {
      .safe-exit-btn:hover { border-color: rgba(226,90,79,.7); background: rgba(226,90,79,.18); }
      .safe-exit-btn__kbd {
        display: inline-block;
      }
    }
    /* Donde Esc hace otra cosa (panel de diálogo, bitácora: cierran y solo el segundo Esc pausa)
       el anfitrión añade data-hide-key y el botón no promete la tecla. */
    :host([data-hide-key]) .safe-exit-btn__kbd {
      display: none;
    }
    .safe-exit-btn--compact { padding: 4px 10px; gap: 6px; font-size: .75rem; }
    .safe-exit-btn--compact .safe-exit-btn__kbd {
      display: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .safe-exit-btn { transition: none; }
      .safe-exit-btn:active { transform: none; }
    }

    /* Variante «placa» (solo dentro del cuadro de diálogo del juego, bloque I1): la placa de pixel hermana de «Volver al
       mapa», con brasa en el canto y la puerta de pixel; sigue siendo lo primero que se encuentra en la fila. Usa las
       variables de arte que define el cuadro (--marco-salida*, --trama-salida*, --px, --icono-salida, --tam-boton). */
    .safe-exit-btn--placa {
      --m: var(--marco-salida); --t: var(--trama-salida);
      gap: calc(4 * var(--px));
      min-height: var(--alto-boton, 44px);
      padding: 0 12px 1px 8px;
      border-style: solid;
      border-width: calc(4 * var(--px));
      border-image: var(--m) 4 / calc(4 * var(--px)) stretch;
      border-radius: 0;
      background: #2e161c var(--t) 0 0 / calc(8 * var(--px)) repeat padding-box;
      image-rendering: pixelated;
      color: #ffd6c4;
      font-size: var(--tam-boton);
      font-weight: 700;
      letter-spacing: .02em;
      transition: none;
    }
    .safe-exit-btn--placa .safe-exit-btn__icon { display: none; }
    .safe-exit-btn--placa::before {
      content: '';
      flex: none;
      width: calc(11 * var(--px));
      height: calc(9 * var(--px));
      background: var(--icono-salida) 0 0 / 100% 100% no-repeat;
      image-rendering: pixelated;
    }
    .safe-exit-btn--placa:active {
      --m: var(--marco-salida-pulsada); --t: var(--trama-salida-pulsada);
      background: #22100f var(--t) 0 0 / calc(8 * var(--px)) repeat padding-box;
      transform: translateY(var(--px));
    }
    @media (hover: hover) and (pointer: fine) {
      .safe-exit-btn--placa:hover:not(:active) {
        --m: var(--marco-salida-sobre); --t: var(--trama-salida-sobre);
        background: #3e1c22 var(--t) 0 0 / calc(8 * var(--px)) repeat padding-box;
        color: #fff1ea;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .safe-exit-btn--placa:active { transform: none; }
    }
  `]
})
export class SafeExitButtonComponent {
  /** Variante densa para pantallas bajas y táctiles: mismo texto, menos relleno, sin pista de tecla. */
  readonly compact = input(false);
  /** Hay una salida segura pedida que espera (a que termine una petición en curso): el rótulo pasa a «Pausando…». */
  readonly pausing = input(false);
  /** Aspecto: «placa» es la placa de pixel del cuadro de diálogo del juego (bloque I1); fuera del cuadro, el de siempre. */
  readonly variante = input<'base' | 'placa'>('base');
  /** El estudiante pidió pausar el caso; el anfitrión llama a la salida segura real. */
  readonly pause = output<void>();
}
