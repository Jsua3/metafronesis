import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PIEZAS, type ClavePieza } from './vineta-catalogo';

/**
 * Una capa de la viñeta (hoja del patrón Composite: `ui-vineta` es el compuesto). Se coloca en px del arte con el
 * origen abajo a la izquierda; la escala ENTERA la hereda de la viñeta por la variable `--vineta-e`, así que todas las
 * capas crecen juntas y cada píxel sigue siendo un cuadrado. Con `pieza` pinta un fotograma de la hoja de la
 * biblioteca; sin ella es solo el sitio de lo que se le proyecte (un personaje del kit). Presentacional: sin servicios.
 *
 * Las medidas y la imagen van por variables CSS en el anfitrión (no hay `style` en las plantillas); la ruta sale del
 * catálogo cerrado, nunca de un texto libre, así que no hay nada que escapar dentro del `url()`.
 */
@Component({
  selector: 'ui-pieza-pixel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-pieza-pixel',
    '[class.ui-pieza-pixel--hoja]': '!!datos()',
    '[class.ui-pieza-pixel--flota]': 'flota()',
    '[style.--px]': 'x()',
    '[style.--py]': 'y()',
    '[style.--pw]': 'datos()?.ancho ?? null',
    '[style.--ph]': 'datos()?.alto ?? null',
    '[style.--pcuadros]': 'datos()?.cuadros ?? null',
    '[style.--pcuadro]': 'cuadroFinal()',
    '[style.--porden]': 'orden()',
    '[style.--pimg]': 'imagen()',
    'aria-hidden': 'true',
  },
  template: '<ng-content />',
  styleUrl: './ui-pieza-pixel.scss',
})
export class UiPiezaPixel {
  readonly pieza = input<ClavePieza | null>(null);
  readonly x = input(0);
  readonly y = input(0);
  /** Fotograma de la hoja (0 por defecto: el reposo); se recorta al rango de la hoja. */
  readonly cuadro = input(0);
  readonly flota = input(false);
  /** Orden de entrada para el escalonado (0 = con el resto). */
  readonly orden = input(0);

  protected readonly datos = computed(() => {
    const clave = this.pieza();
    return clave ? PIEZAS[clave] : null;
  });
  protected readonly cuadroFinal = computed(() => {
    const total = this.datos()?.cuadros ?? 1;
    const n = Math.trunc(Number(this.cuadro()));
    return Number.isFinite(n) ? Math.min(total - 1, Math.max(0, n)) : 0;
  });
  protected readonly imagen = computed(() => {
    const d = this.datos();
    return d ? `url('/assets/biblioteca/${d.ruta}')` : null;
  });
}
