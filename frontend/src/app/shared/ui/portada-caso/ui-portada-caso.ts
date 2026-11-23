import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, linkedSignal } from '@angular/core';

export type UiPortadaTamano = 'mini' | 'tarjeta' | 'heroe';

/**
 * Medida en px de cada tamaño. La imagen fuente de la primera sala mide 960 × 528, así que las tres son divisiones
 * enteras (÷8, ÷4, ÷2) y el pixel art no se emborrona. Si el contenedor es más estrecho, la portada se encoge con él
 * (nunca desborda) y conserva la proporción.
 */
export const PORTADA_MEDIDAS: Readonly<Record<UiPortadaTamano, { ancho: number; alto: number }>> = {
  mini: { ancho: 120, alto: 66 },
  tarjeta: { ancho: 240, alto: 132 },
  heroe: { ancho: 480, alto: 264 },
};

/**
 * Portada de un caso (DISENO C9): la imagen pixel art de su primera sala o, si no la tiene (las salas por piezas y los
 * casos de antes no tienen imagen fija) o la imagen falla al cargar, una composición de respaldo: el tinte de marca, el
 * mosaico de doodles muy tenue y la puerta del consultorio a escala entera, una «puerta cerrada que espera». Nunca
 * queda un recuadro roto.
 *
 * Siempre es decorativa (`alt=""`): el título del caso va al lado. Con `umbral`, la portada lleva el nombre de la
 * transición de vistas que la lleva hasta el umbral del juego (DP-10). Solo la tarjeta que se pulsa debe llevarlo:
 * dos elementos con el mismo nombre cancelan la transición.
 */
@Component({
  selector: 'ui-portada-caso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-portada-caso',
    '[class.ui-portada-caso--mini]': "tamano() === 'mini'",
    '[class.ui-portada-caso--tarjeta]': "tamano() === 'tarjeta'",
    '[class.ui-portada-caso--heroe]': "tamano() === 'heroe'",
    '[class.ui-portada-caso--respaldo]': '!imagen()',
    '[class.vt-portada]': 'umbral()',
    '[attr.data-titulo]': 'titulo()',
    'aria-hidden': 'true',
  },
  template: `
    @if (imagen(); as src) {
      <img class="ui-portada-caso__imagen" alt="" [src]="src" [width]="medida().ancho" [height]="medida().alto"
        decoding="async" [attr.loading]="tamano() === 'heroe' ? null : 'lazy'" (error)="fallo.set(true)" />
    } @else {
      <span class="ui-portada-caso__mosaico"></span>
      <span class="ui-portada-caso__suelo"></span>
      <img class="ui-portada-caso__puerta" alt="" src="/assets/game/doors/door_consultorio.png" width="39" height="74" />
    }
  `,
  styleUrl: './ui-portada-caso.scss',
})
export class UiPortadaCaso {
  /** URL de la imagen de la primera sala (BK-1), o nada. */
  readonly portada = input<string | null | undefined>(null);
  /** El título del caso (solo para depurar y para las pruebas: la portada no se lee). */
  readonly titulo = input.required<string>();
  readonly tamano = input<UiPortadaTamano>('tarjeta');
  /** Esta portada viaja al umbral del juego con la transición de vistas. */
  readonly umbral = input(false, { transform: booleanAttribute });

  /**
   * La imagen falló al cargar: se pasa al respaldo en vez de dejar el icono de imagen rota. Vuelve a falso cuando llega
   * otra portada (una URL nueva merece otra oportunidad).
   */
  protected readonly fallo = linkedSignal({ source: this.portada, computation: () => false });
  protected readonly medida = computed(() => PORTADA_MEDIDAS[this.tamano()]);
  readonly imagen = computed(() => {
    const src = this.portada()?.trim();
    return src && !this.fallo() ? src : null;
  });
}
