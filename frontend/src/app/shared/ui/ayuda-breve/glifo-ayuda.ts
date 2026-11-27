import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Glifo de ayuda: un bocadillo de diálogo en pixel art (rejilla de 10×10, esquinas recortadas y cola abajo a la
 * izquierda, como los del juego) con una «i» dentro. Solo dibujo decorativo: el trazo toma `currentColor` y el relleno
 * el tinte primario.
 *
 * Píxel uniforme (vara de calidad visual, regla 5): el tamaño va SIEMPRE en múltiplos enteros de la rejilla, 20 px por
 * defecto (×2). `--glifo-ayuda-tam` solo admite 10, 20, 30… px; un valor en rem daría píxeles desiguales.
 */
@Component({
  selector: 'ui-glifo-ayuda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
      <rect class="relleno" x="1" y="1" width="8" height="6" />
      <g fill="currentColor">
        <rect x="1" y="0" width="8" height="1" />
        <rect x="0" y="1" width="1" height="6" />
        <rect x="9" y="1" width="1" height="6" />
        <rect x="1" y="7" width="8" height="1" />
        <rect x="2" y="8" width="2" height="1" />
        <rect x="2" y="9" width="1" height="1" />
        <rect x="4" y="2" width="2" height="1" />
        <rect x="4" y="4" width="2" height="2" />
      </g>
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    svg { display: block; inline-size: var(--glifo-ayuda-tam, 20px); block-size: var(--glifo-ayuda-tam, 20px); }
    .relleno { fill: var(--ds-primary-subtle); }
  `,
})
export class UiGlifoAyuda {}
