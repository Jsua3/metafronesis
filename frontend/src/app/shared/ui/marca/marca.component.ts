import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ISOTIPO_CAJA, ISOTIPO_CUADROS, ISOTIPO_PERFIL, ISOTIPO_PSI, PALABRA_CAJA, PALABRA_RUTAS } from './marca-isotipo';

let siguienteId = 0;

/**
 * Marca Metafrónesis: el isotipo (cuadros de píxel, perfil y Ψ) en vector, y la palabra como texto real (se lee, se
 * traduce y escala con el ajuste de letra). Toma los colores de la piel en la que vive: sobre la piel juego (oscura)
 * aclara los cuadros y la Ψ; sobre la piel portal (clara) usa los del logo original. Es decorativa: el nombre accesible
 * lo pone el enlace o el encabezado que la contiene.
 */
@Component({
  selector: 'app-marca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'marca', '[class.marca--isotipo]': "variante() === 'isotipo'" },
  template: `
    <svg class="marca__isotipo" [attr.viewBox]="caja" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient [attr.id]="id + '-perfil'" x1="320" y1="340" x2="470" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" class="marca__perfil-a" />
          <stop offset="0.5" class="marca__perfil-b" />
          <stop offset="1" class="marca__perfil-c" />
        </linearGradient>
        <linearGradient [attr.id]="id + '-psi'" x1="292" y1="250" x2="408" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0" class="marca__psi-a" />
          <stop offset="1" class="marca__psi-b" />
        </linearGradient>
      </defs>
      <g class="marca__cuadros marca__cuadros--claro">
        @for (c of cuadros; track $index) {
          <rect [attr.x]="c[0]" [attr.y]="c[1]" [attr.width]="c[2]" [attr.height]="c[2]" rx="1.5" [attr.fill]="c[3]" />
        }
      </g>
      <g class="marca__cuadros marca__cuadros--oscuro">
        @for (c of cuadros; track $index) {
          <rect [attr.x]="c[0]" [attr.y]="c[1]" [attr.width]="c[2]" [attr.height]="c[2]" rx="1.5" [attr.fill]="c[4]" />
        }
      </g>
      <g transform="scale(0.25)" [attr.fill]="'url(#' + id + '-perfil)'">
        @for (p of perfil; track $index) {
          <path [attr.d]="p[0]" [attr.transform]="'translate(' + p[1] + ')'" />
        }
      </g>
      <g transform="scale(0.25)" [attr.fill]="'url(#' + id + '-psi)'">
        @for (p of psi; track $index) {
          <path [attr.d]="p[0]" [attr.transform]="'translate(' + p[1] + ')'" />
        }
      </g>
    </svg>
    @if (variante() !== 'isotipo') {
      <!-- La palabra con la tipografía del logo original (vectorizada), en el color de la piel. -->
      <svg class="marca__palabra" [attr.viewBox]="cajaPalabra" aria-hidden="true" focusable="false">
        <g transform="scale(0.333333)" fill="currentColor">
          @for (p of palabra; track $index) {
            <path [attr.d]="p[0]" [attr.transform]="'translate(' + p[1] + ')'" />
          }
        </g>
      </svg>
    }
  `,
  styles: `
    :host {
      --marca-alto: 2rem;
      --marca-tinta: #0c3563;
      --marca-perfil-a: #1a74cc;
      --marca-perfil-b: #5a2bc0;
      --marca-perfil-c: #7a06ab;
      --marca-psi-a: #2f2c97;
      --marca-psi-b: #7400b8;

      display: inline-flex;
      align-items: center;
      gap: calc(var(--marca-alto) * 0.3);
      color: var(--marca-tinta);
      line-height: 1;
    }

    :host-context([data-skin='game']) {
      --marca-tinta: var(--ds-text-1);
      --marca-perfil-a: #3f8ff0;
      --marca-perfil-b: #7d5cf0;
      --marca-perfil-c: #b062ee;
      --marca-psi-a: #8c9bff;
      --marca-psi-b: #c48cff;
    }

    .marca__isotipo {
      flex: none;
      width: auto;
      height: var(--marca-alto);
      overflow: visible;
    }

    .marca__perfil-a { stop-color: var(--marca-perfil-a); }
    .marca__perfil-b { stop-color: var(--marca-perfil-b); }
    .marca__perfil-c { stop-color: var(--marca-perfil-c); }
    .marca__psi-a { stop-color: var(--marca-psi-a); }
    .marca__psi-b { stop-color: var(--marca-psi-b); }

    .marca__cuadros--oscuro { display: none; }
    :host-context([data-skin='game']) .marca__cuadros--claro { display: none; }
    :host-context([data-skin='game']) .marca__cuadros--oscuro { display: inline; }

    /* La palabra del logo: alta como media altura del isotipo (la proporción del logo horizontal). */
    .marca__palabra {
      flex: none;
      width: auto;
      height: calc(var(--marca-alto) * 0.46);
      overflow: visible;
    }

    @media (forced-colors: active) {
      .marca__cuadros rect { fill: CanvasText; }
      .marca__isotipo g { fill: CanvasText; }
      .marca__palabra { color: CanvasText; }
    }
  `,
})
export class MarcaComponent {
  /** horizontal: isotipo + palabra; isotipo: solo el símbolo. */
  readonly variante = input<'horizontal' | 'isotipo'>('horizontal');

  protected readonly id = `marca-${++siguienteId}`;
  protected readonly caja = ISOTIPO_CAJA.join(' ');
  protected readonly cuadros = ISOTIPO_CUADROS;
  protected readonly perfil = ISOTIPO_PERFIL;
  protected readonly psi = ISOTIPO_PSI;
  protected readonly cajaPalabra = PALABRA_CAJA.join(' ');
  protected readonly palabra = PALABRA_RUTAS;
}
