import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * El indicador de tres píxeles del umbral (DISENO §4.4, pieza 5; C16): la firma de la marca (cian, azul, violeta) hecha
 * progreso. Cada cuadro se enciende al cumplirse una fase REAL del arranque (el intento respondió, la sala llegó, el
 * primer cuadro se dibujó), así que es determinado: tiene un final claro y nunca gira ni da vueltas.
 *
 * Es una barra de progreso para la tecnología asistiva (`role="progressbar"`, 0 a 3, con el paso en palabras). Lo que
 * se ve son tres cuadros de 6 × 6 px (tres píxeles lógicos del portal), de 25 % a 100 % de opacidad en 160 ms.
 */
@Component({
  selector: 'app-firma-progreso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'firma-progreso ds-motion',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '3',
    '[attr.aria-valuenow]': 'hechos()',
    '[attr.aria-valuetext]': 'texto()',
    '[attr.aria-label]': 'etiqueta()',
  },
  template: `
    @for (cuadro of cuadros; track cuadro) {
      <span class="firma-progreso__cuadro" [class.firma-progreso__cuadro--hecho]="hechos() > $index" [attr.data-cuadro]="cuadro"></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      gap: calc(var(--l-pixel, 2px) * 2);
      align-items: center;
    }
    .firma-progreso__cuadro {
      inline-size: calc(var(--l-pixel, 2px) * 3);
      block-size: calc(var(--l-pixel, 2px) * 3);
      opacity: 0.25;
      transition: opacity var(--ds-dur-fast) var(--ds-ease-out);
    }
    .firma-progreso__cuadro--hecho { opacity: 1; }
    [data-cuadro='cian'] { background: var(--marca-cian, var(--ds-info)); }
    [data-cuadro='azul'] { background: var(--marca-azul, var(--ds-primary)); }
    [data-cuadro='violeta'] { background: var(--ds-primary); }
    /* Con colores forzados los fondos desaparecen: cada cuadro se dibuja con su borde y el hecho se rellena. */
    @media (forced-colors: active) {
      .firma-progreso__cuadro { border: 1px solid CanvasText; background: Canvas; opacity: 1; }
      .firma-progreso__cuadro--hecho { background: CanvasText; }
    }
  `,
})
export class FirmaProgresoComponent {
  /** Cuántas fases se cumplieron (0 a 3). */
  readonly pasos = input(0);
  /** El paso en curso, en palabras («Cargando la sala»): lo lee la tecnología asistiva como `aria-valuetext`. */
  readonly texto = input('');
  readonly etiqueta = input('Progreso de la carga del caso');

  protected readonly cuadros = ['cian', 'azul', 'violeta'] as const;
  /** Nunca menos de 0 ni más de 3, aunque llegue otra cosa. */
  protected readonly hechos = computed(() => Math.max(0, Math.min(3, Math.round(this.pasos()))));
}
