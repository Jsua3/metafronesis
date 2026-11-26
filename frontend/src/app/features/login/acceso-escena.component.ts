import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RECORRIDO_PASOS, RECORRIDO_ROTULOS } from './recorrido.util';

/**
 * Opciones de ejemplo del paso «Decide». Ilustran cómo se ve una decisión y ninguna es «la buena»: las tres son
 * conductas posibles de escucha (P1: nada codifica la respuesta). La que se resalta solo muestra que la elección queda
 * registrada; no se califica.
 */
const OPCIONES_DE_EJEMPLO = ['Escuchar sin interrumpir', 'Reflejar lo que dice', 'Ofrecer información de apoyo'] as const;
const OPCION_ELEGIDA = 1;

/**
 * La escena de la ventana del acceso: UNA imagen y una cámara que la recorre. El paso (0–3) decide a qué mira la cámara y
 * qué detalle aparece (las opciones de una decisión, la rúbrica sobre el cartel de ética, la hoja de la bitácora).
 * Es solo presentación: quien avanza el recorrido, lo pausa y lo detiene es `LoginComponent`.
 *
 * Todo lo que hay encima de la imagen es decoración (aria-hidden): el texto del paso, que está fuera, lo dice todo.
 * El host lleva `acceso__scene` porque `LoginComponent` le escribe la luz y el paralaje del puntero (--gx, --gy, --nx, --ny).
 */
@Component({
  selector: 'app-acceso-escena',
  standalone: true,
  templateUrl: './acceso-escena.component.html',
  styleUrl: './acceso-escena.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'acceso__scene', '[attr.data-paso]': 'clave()' },
})
export class AccesoEscenaComponent {
  readonly imagen = input.required<string>();
  /** El texto alternativo vive con la imagen: lo único que la escena dice a un lector de pantalla. */
  readonly alt = input('Escena del simulador: una psicóloga en formación escucha a una consultante en un consultorio con el letrero «Espacio seguro»');
  /** Índice del paso: 0 simula, 1 decide, 2 evalúa, 3 aprende. */
  readonly paso = input.required<number>();

  protected readonly clave = computed(() => RECORRIDO_PASOS[this.paso()] ?? RECORRIDO_PASOS[0]);
  protected readonly rotulo = computed(() => RECORRIDO_ROTULOS[this.clave()]);
  protected readonly opciones = OPCIONES_DE_EJEMPLO;
  protected readonly elegida = OPCION_ELEGIDA;
}
