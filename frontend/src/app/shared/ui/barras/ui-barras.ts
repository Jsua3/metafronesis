import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiBarrasTono = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type UiBarrasPatron = 'liso' | 'rayas' | 'puntos';

export interface UiBarrasDato {
  etiqueta: string;
  valor: number;
  tono?: UiBarrasTono;
  patron?: UiBarrasPatron;
}

/** Patrón por defecto de cada tono: dos tonos vecinos nunca se distinguen solo por el color (WCAG 1.4.1). */
const PATRON_POR_TONO: Readonly<Record<UiBarrasTono, UiBarrasPatron>> = {
  neutral: 'liso',
  success: 'liso',
  info: 'rayas',
  warning: 'puntos',
  danger: 'rayas',
};

export interface UiBarrasFila {
  etiqueta: string;
  valor: number;
  tono: UiBarrasTono;
  patron: UiBarrasPatron;
  /** De 0 a 1: la parte de la pista (lista) o de la barra entera (apilada) que ocupa. */
  ratio: number;
  /** Lo que se lee: «3 de 9» con denominador, o la cantidad sola. */
  texto: string;
}

const numero = new Intl.NumberFormat('es-CO');
const decimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/**
 * La cantidad dicha con su denominador cuando lo hay: «3 de 9». Nunca un porcentaje suelto: con grupos de 9 a 30
 * estudiantes, «33 %» exagera y esconde cuántas personas son (idea de Kimi-c, DISENO C10).
 */
export function textoCantidad(valor: number, total: number | null | undefined): string {
  const cantidad = numero.format(valor);
  return total !== null && total !== undefined && total > 0 ? `${cantidad} de ${numero.format(total)}` : cantidad;
}

/** Filas listas para pintar: tono y patrón resueltos, valores negativos o no numéricos a 0 y la proporción acotada. */
export function filasDeBarras(
  datos: readonly UiBarrasDato[], modo: 'lista' | 'apilada', total: number | null, unidad: 'cantidad' | 'porcentaje' = 'cantidad',
): UiBarrasFila[] {
  const limpios = datos.map(dato => ({ ...dato, valor: Number.isFinite(dato.valor) ? Math.max(0, dato.valor) : 0 }));
  const suma = limpios.reduce((acumulado, dato) => acumulado + dato.valor, 0);
  const maximo = Math.max(0, ...limpios.map(dato => dato.valor));
  // Lista: contra el total (si lo hay) o contra la barra más larga. Apilada: contra el total o la suma de las partes.
  const base = total && total > 0 ? total : modo === 'apilada' ? suma : maximo;
  return limpios.map(dato => {
    const tono = dato.tono ?? 'neutral';
    return {
      etiqueta: dato.etiqueta,
      valor: dato.valor,
      tono,
      patron: dato.patron ?? PATRON_POR_TONO[tono],
      ratio: base > 0 ? Math.min(1, dato.valor / base) : 0,
      texto: unidad === 'porcentaje' ? `${decimal.format(dato.valor)} %` : textoCantidad(dato.valor, total),
    };
  });
}

/**
 * Gráfico de barras (DISENO C10; reemplaza las «gráficas formativas»). La lectura en palabras (`descripcion`) es
 * obligatoria y va EN LA PÁGINA, en un párrafo encima del gráfico (GOV.UK), no escondida en un `alt`. Los datos van
 * también en una tabla solo para lectores de pantalla; el dibujo es decorativo para ellos (no se leen dos veces).
 *
 * - `lista`: una fila por dato con la etiqueta, la barra y la cantidad («3 de 9» si hay `total`).
 * - `apilada`: una barra entera partida con su leyenda en texto debajo.
 *
 * El color nunca va solo: cada tono lleva su patrón (liso, rayas, puntos) y su etiqueta escrita.
 */
@Component({
  selector: 'ui-barras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-barras', '[class.ui-barras--apilada]': "modo() === 'apilada'" },
  template: `
    <p class="ui-barras__descripcion">{{ descripcion() }}</p>
    @if (modo() === 'lista') {
      <ul class="ui-barras__lista" aria-hidden="true">
        @for (fila of filas(); track fila.etiqueta) {
          <li class="ui-barras__fila">
            <span class="ui-barras__etiqueta">{{ fila.etiqueta }}</span>
            <span class="ui-barras__pista">
              <span class="ui-barras__barra" [class]="tinta(fila)" [class.ui-barras__barra--hay]="fila.valor > 0"
                [style.--ratio]="fila.ratio"></span>
            </span>
            <span class="ui-barras__valor">{{ fila.texto }}</span>
          </li>
        }
      </ul>
    } @else {
      <div class="ui-barras__apilada" aria-hidden="true">
        @for (fila of filas(); track fila.etiqueta) {
          @if (fila.ratio > 0) {
            <span class="ui-barras__barra" [class]="tinta(fila)" [style.--ratio]="fila.ratio"></span>
          }
        }
      </div>
      <ul class="ui-barras__leyenda" aria-hidden="true">
        @for (fila of filas(); track fila.etiqueta) {
          <li class="ui-barras__clave">
            <span class="ui-barras__muestra" [class]="tinta(fila)"></span>
            <span class="ui-barras__etiqueta">{{ fila.etiqueta }}</span>
            <span class="ui-barras__valor">{{ fila.texto }}</span>
          </li>
        }
      </ul>
    }
    <!-- Envuelta: una tabla no encoge a 1 px (mide lo que su contenido) y desbordaría la página aunque no se vea. -->
    <div class="ds-sr-only">
      <table>
        <caption>{{ descripcion() }}</caption>
        <thead><tr><th scope="col">{{ etiquetaColumna() }}</th><th scope="col">Cantidad</th></tr></thead>
        <tbody>
          @for (fila of filas(); track fila.etiqueta) {
            <tr><th scope="row">{{ fila.etiqueta }}</th><td>{{ fila.texto }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './ui-barras.scss',
})
export class UiBarras {
  readonly datos = input.required<readonly UiBarrasDato[]>();
  /** La lectura en palabras: «De 12 estudiantes, 9 terminaron el caso…». */
  readonly descripcion = input.required<string>();
  readonly modo = input<'lista' | 'apilada'>('lista');
  /** El denominador común (estudiantes del grupo, criterios de la rúbrica). Con él, cada cantidad se escribe «N de total». */
  readonly total = input<number | null>(null);
  /**
   * `porcentaje`: los valores ya son porcentajes (0 a 100) y se escriben «62,5 %», sin «de 100», que no es un número de
   * personas. Con `total` en 100 las barras se miden contra la escala completa.
   */
  readonly unidad = input<'cantidad' | 'porcentaje'>('cantidad');
  /** Encabezado de la primera columna de la tabla para lectores de pantalla. */
  readonly etiquetaColumna = input('Categoría');

  readonly filas = computed(() => filasDeBarras(this.datos(), this.modo(), this.total(), this.unidad()));

  /** Tono y patrón de una barra o de su muestra en la leyenda (las clases fijas del elemento se conservan). */
  protected tinta(fila: UiBarrasFila): string {
    return `ui-barras__tinta--${fila.tono} ui-barras__tinta--${fila.patron}`;
  }
}
