import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

/** Escalas admitidas: siempre enteras, para que cada píxel del kit sea un cuadrado exacto en pantalla. */
export type UiFiguraEscala = 1 | 2 | 3 | 4;

/**
 * Ruta de un personaje del kit, saneada: solo minúsculas, cifras, guiones y una barra (`camila/bata`). Va dentro de un
 * `url()` de CSS, así que cualquier otra cosa (comillas, paréntesis, `..`) se descarta en vez de escaparse.
 */
const RUTA_KIT = /^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/;

export function rutaFiguraKit(personaje: string | null | undefined): string | null {
  const limpio = (personaje ?? '').trim();
  return RUTA_KIT.test(limpio) ? `/assets/characters/kit/${limpio}/idle.png` : null;
}

/** Cualquier número a una escala entera entre 1 y 4 (el kit no se ve bien a medias ni enorme). */
export function escalaEntera(valor: unknown): UiFiguraEscala {
  const n = Math.round(Number(valor));
  return (Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 2) as UiFiguraEscala;
}

/** El cuadro de reposo va de 0 a 3 (la hoja `idle.png` tiene cuatro columnas). */
function fotogramaValido(valor: unknown): number {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) ? Math.min(3, Math.max(0, n)) : 0;
}

/**
 * Figura del kit de personajes (DISENO C8): un personaje de frente, en pixel art auténtico, sobre su sombra de contacto
 * escalonada. Cada cuadro de la hoja `idle.png` mide 48 × 72 y la hoja 192 × 576 (cuatro cuadros de reposo por fila; la
 * primera fila mira al frente). Se pinta a escala ENTERA con `image-rendering: pixelated`: nada de suavizado.
 *
 * Es decorativa (`aria-hidden`) salvo que se le dé `etiqueta`, y entonces es una imagen con nombre. Se queda quieta;
 * con `respira` da tres respiraciones de reposo al aparecer (nunca un bucle, y nada con movimiento reducido).
 */
@Component({
  selector: 'ui-figura-pixel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-figura-pixel',
    '[class.ui-figura-pixel--x1]': 'escalaFinal() === 1',
    '[class.ui-figura-pixel--x2]': 'escalaFinal() === 2',
    '[class.ui-figura-pixel--x3]': 'escalaFinal() === 3',
    '[class.ui-figura-pixel--x4]': 'escalaFinal() === 4',
    '[class.ui-figura-pixel--respira]': 'respira()',
    '[style.--figura]': 'fondo()',
    '[style.--fotograma]': 'fotogramaFinal()',
    '[attr.role]': "etiqueta() ? 'img' : null",
    '[attr.aria-label]': 'etiqueta() || null',
    '[attr.aria-hidden]': "etiqueta() ? null : 'true'",
  },
  template: '<span class="ui-figura-pixel__sombra"></span><span class="ui-figura-pixel__cuadro"></span>',
  styleUrl: './ui-figura-pixel.scss',
})
export class UiFiguraPixel {
  /** Carpeta del personaje bajo `assets/characters/kit/`: `'camila/bata'`, `'docente-universidad'`… */
  readonly personaje = input.required<string>();
  readonly escala = input<UiFiguraEscala, unknown>(2, { transform: escalaEntera });
  /** Columna del cuadro de reposo (0 a 3). */
  readonly fotograma = input(0);
  /** Nombre accesible; sin él la figura es decorativa. */
  readonly etiqueta = input<string | null>(null);
  readonly respira = input(false, { transform: booleanAttribute });

  readonly ruta = computed(() => rutaFiguraKit(this.personaje()));
  protected readonly escalaFinal = computed(() => this.escala());
  protected readonly fotogramaFinal = computed(() => fotogramaValido(this.fotograma()));
  protected readonly fondo = computed(() => {
    const ruta = this.ruta();
    return ruta ? `url('${ruta}')` : 'none';
  });
}
