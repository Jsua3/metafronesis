import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Iconos de pixel de la pantalla del juego (bloque U1): una matriz de caracteres por icono, dibujada como SVG con
 * `crispEdges` a la escala del punto de mundo (`--pixel-px`). Reemplazan a los Material Symbols dentro del juego para
 * que botones y avisos sean del mismo oficio que el cuadro de diálogo. Siempre decorativos: el nombre accesible lo
 * lleva el botón que los contiene.
 *
 * Colores: `X` es el color del texto (currentColor), `s` la tinta suave, `l` la luz de la sala, `d` el contorno y
 * `p` la penumbra de la placa (para las colas de los avisos).
 */
export const ICONOS_PIXEL = {
  'ir-a': ['........X', '......XXX', '....XXXX.', '..XXXXXX.', 'XXXXXXXX.', '....XXX..', '....XX...', '....X....'],
  ayuda: ['..XXXXX..', '.XX...XX.', '.XX...XX.', '.....XX..', '....XX...', '....XX...', '.........', '....XX...', '....XX...'],
  bitacora: ['XXXX.XXXX', 'X..XXX..X', 'X.s.X.s.X', 'X..sXs..X', 'X.s.X.s.X', 'X..sXs..X', 'X...X...X', 'XXXXXXXXX'],
  ajustes: ['...X.X...', '.X.XXX.X.', '..XXXXX..', 'XXXX.XXXX', '.XX...XX.', 'XXXX.XXXX', '..XXXXX..', '.X.XXX.X.', '...X.X...'],
  inicio: ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', '.X.....X.', '.X.XX..X.', '.X.XX..X.', '.XXXXXXX.'],
  lugar: ['.XXXXX.', 'XX...XX', 'XX...XX', 'XXX.XXX', '.XXXXX.', '..XXX..', '...X...'],
  aviso: ['....X....', '...XXX...', '..XX.XX..', '..XX.XX..', '.XXXXXXX.', '.XXX.XXX.', 'XXXXXXXXX'],
  candado: ['..XXX..', '.X...X.', '.X...X.', 'XXXXXXX', 'XXXdXXX', 'XXXdXXX', 'XXXXXXX'],
  lupa: ['.XXXX....', 'X....X...', 'X....X...', 'X....X...', 'X....X...', '.XXXXX...', '.....XX..', '......XX.', '.......XX'],
  cerrar: ['XX...XX', '.XX.XX.', '..XXX..', '.XX.XX.', 'XX...XX'],
  pausa: ['XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX'],
  hecho: ['......X', '.....XX', 'X...XX.', 'XX.XX..', '.XXX...', '..X....'],
  plano: ['XXXXXXXXX', 'X...X...X', 'X...X...X', 'XXXXXXXXX', 'X.X.....X', 'X.X.....X', 'XXXXXXXXX'],
  'cola-abajo': ['dpppppd', '.dpppd.', '..dpd..', '...d...'],
  'cola-arriba': ['...d...', '..dpd..', '.dpppd.', 'dpppppd'],
  'cola-derecha': ['d...', 'pd..', 'ppd.', 'pppd', 'ppd.', 'pd..', 'd...'],
  'cola-izquierda': ['...d', '..dp', '.dpp', 'dppp', '.dpp', '..dp', '...d'],
} as const satisfies Record<string, readonly string[]>;

export type NombreIconoPixel = keyof typeof ICONOS_PIXEL;

const COLORES: Readonly<Record<string, string>> = {
  X: 'currentColor', s: 'var(--pixel-tinta-suave)', l: 'var(--luz)', d: 'var(--pixel-contorno)', p: 'var(--pixel-penumbra)',
};

interface Tramo { x: number; y: number; w: number; color: string }

/** Un rectángulo por tramo horizontal del mismo color (pocas formas, bordes exactos). */
export function tramosDe(nombre: NombreIconoPixel): { ancho: number; alto: number; tramos: Tramo[] } {
  const filas = ICONOS_PIXEL[nombre];
  const tramos: Tramo[] = [];
  filas.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      const c = fila[x];
      if (c === '.') { x++; continue; }
      let fin = x;
      while (fin < fila.length && fila[fin] === c) fin++;
      tramos.push({ x, y, w: fin - x, color: COLORES[c] ?? 'currentColor' });
      x = fin;
    }
  });
  return { ancho: filas[0].length, alto: filas.length, tramos };
}

@Component({
  selector: 'app-pixel-icono',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--iw]': 'dibujo().ancho', '[style.--ih]': 'dibujo().alto' },
  template: `
    <svg [attr.viewBox]="'0 0 ' + dibujo().ancho + ' ' + dibujo().alto" shape-rendering="crispEdges" focusable="false">
      @for (t of dibujo().tramos; track $index) {
        <rect [attr.x]="t.x" [attr.y]="t.y" [attr.width]="t.w" height="1" [attr.fill]="t.color" />
      }
    </svg>
  `,
  styles: [`
    :host { display: block; flex: none; width: calc(var(--iw) * var(--pixel-px, 2px)); height: calc(var(--ih) * var(--pixel-px, 2px)); }
    svg { display: block; width: 100%; height: 100%; }
  `],
})
export class PixelIconoComponent {
  readonly nombre = input.required<NombreIconoPixel>();
  protected readonly dibujo = computed(() => tramosDe(this.nombre()));
}
