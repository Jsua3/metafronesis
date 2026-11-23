import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tarjeta de capítulo (bloque U1): el velo fuerte de la paleta y, al centro, la pestaña del capítulo sobre la placa del
 * texto. Vive aparte de `simulation-play` para que su hoja no pase el tope de 20 kB por componente (pasada final, B4b);
 * lo que se ve es exactamente lo de antes. Su sitio en la pila de capas (fijo, z 340, bajo el pie elevado) lo pone
 * `simulation-play` sobre el anfitrión (`.transition-note`), porque las pruebas de capas lo comparan con su pie.
 * Sin rol: es decorativa, el cambio de escena ya lo anuncia la región viva del juego.
 */
@Component({
  selector: 'app-nota-transicion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="transition-note__bloque">
      @if (capitulo(); as capitulo) {
        <p class="transition-note__capitulo u-rotulo">{{ capitulo }}</p>
      }
      <p class="transition-note__texto u-placa u-sombra">{{ texto() }}</p>
    </div>
  `,
  styles: [`
    :host {
      display: grid; place-items: center;
      background: var(--pixel-velo-fuerte); pointer-events: none;
      animation: transition-note-in 420ms ease;
    }
    .transition-note__bloque { display: grid; justify-items: start; width: min(88vw, 640px); }
    .transition-note__capitulo { margin-bottom: calc(-1 * var(--pixel-px)); }
    .transition-note__texto {
      box-sizing: border-box; width: 100%; margin: 0;
      padding: calc(8 * var(--pixel-px)) calc(12 * var(--pixel-px)) calc(9 * var(--pixel-px));
      text-align: center; font-family: var(--pixel-f-texto); font-size: calc(var(--pixel-tam) * 1.5); font-weight: 600; font-style: italic;
      line-height: 1.6; letter-spacing: .02em;
    }
    @keyframes transition-note-in { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      :host { animation: none; }
    }
  `],
})
export class NotaTransicionComponent {
  readonly capitulo = input<string | null>(null);
  readonly texto = input.required<string>();
}
