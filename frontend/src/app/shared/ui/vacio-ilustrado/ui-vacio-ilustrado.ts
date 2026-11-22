import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { UiVineta, type MarcoVineta } from '../vineta/ui-vineta';
import type { EscalaVineta, NombreEscena } from '../vineta/vineta-catalogo';

/**
 * Vacío ilustrado (personalidad visual del portal, ronda 3). Patrón Composite + presentacional: compone una viñeta del
 * simulador (`ui-vineta`), un título que dice qué falta, una frase que dice qué esperar o qué hacer y, si se proyectan,
 * las acciones (`<ng-content>`: botones o enlaces del contenedor, que es quien sabe a dónde llevar). Sin servicios.
 * A diferencia de `ui-empty-state` (un mueble o un personaje suelto), aquí la ilustración es una escena con sentido.
 *
 * El título puede ser encabezado (`nivel="h1"`/`"h2"`/`"h3"`) cuando el vacío ES el contenido de la pantalla (404, sin
 * permiso), o un párrafo destacado (`"p"`, por defecto) cuando vive dentro de una sección que ya tiene su encabezado.
 * `lado` pone la viñeta a la izquierda del texto en pantallas anchas; en el teléfono siempre se apila.
 */
@Component({
  selector: 'ui-vacio-ilustrado',
  imports: [UiVineta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-vacio-ilustrado',
    '[class.ui-vacio-ilustrado--lado]': "disposicion() === 'lado'",
    '[class.ui-vacio-ilustrado--compacto]': "tamano() === 'compacto'",
    '[attr.role]': "anunciar() ? 'status' : null",
  },
  template: `
    <ui-vineta class="ui-vacio-ilustrado__vineta" [escena]="escena()" [personaje]="personaje()" [escala]="escala()"
      [marco]="marco()" />
    <div class="ui-vacio-ilustrado__texto">
      @switch (nivel()) {
        @case ('h1') { <h1 class="ui-vacio-ilustrado__titulo">{{ titulo() }}</h1> }
        @case ('h2') { <h2 class="ui-vacio-ilustrado__titulo">{{ titulo() }}</h2> }
        @case ('h3') { <h3 class="ui-vacio-ilustrado__titulo">{{ titulo() }}</h3> }
        @default { <p class="ui-vacio-ilustrado__titulo">{{ titulo() }}</p> }
      }
      @if (frase()) {
        <p class="ui-vacio-ilustrado__frase">{{ frase() }}</p>
      }
      <div class="ui-vacio-ilustrado__acciones"><ng-content /></div>
    </div>
  `,
  styleUrl: './ui-vacio-ilustrado.scss',
})
export class UiVacioIlustrado {
  readonly escena = input.required<NombreEscena>();
  readonly titulo = input.required<string>();
  readonly frase = input<string | null | undefined>(null);
  readonly personaje = input<string | null | undefined>(null);
  readonly nivel = input<'h1' | 'h2' | 'h3' | 'p'>('p');
  readonly disposicion = input<'apilada' | 'lado'>('apilada');
  readonly tamano = input<'amplio' | 'compacto'>('amplio');
  readonly escala = input<EscalaVineta>(2);
  readonly marco = input<MarcoVineta>('suelo');
  /** Anunciarlo a lectores de pantalla (role="status"): solo cuando es la respuesta a algo (una búsqueda vacía). */
  readonly anunciar = input(false);
}
