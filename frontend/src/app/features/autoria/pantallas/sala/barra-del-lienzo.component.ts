import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';

import type { PuertaCaso } from '../../modelo/caso';
import type { FaltaDeSala } from '../../modelo/salas-a-documento';

/**
 * La barra fina del lienzo de la sala (E4, EDITOR.md §4.4). Pieza de presentación (sin servicios: entradas y salidas):
 * - el control de tamaño compacto («Ajustar» o «×2»), que reemplaza la franja «×2» de 840 px;
 * - «Por resolver en esta sala» como globo, con su cuenta a la vista (antes era una lista bajo el lienzo);
 * - «Teclas», la ayuda del teclado en un globo (antes, un párrafo fijo que restaba alto al lienzo).
 * Los globos son `<details>`: se abren con clic, Enter o Espacio sin código; Esc los cierra y devuelve el foco, y un clic
 * fuera de la barra también los cierra (no tapan el lienzo sin salida clara).
 */
@Component({
  selector: 'app-barra-del-lienzo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'alPulsarFuera($event)' },
  template: `
    @if (ancho() !== null && ancho()! <= 960) {
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <div role="group" aria-label="Tamaño de la sala" class="zoom">
        <button type="button" class="zoom__opcion" [attr.aria-pressed]="escala() === 1" (click)="escalaCambio.emit(1)">Ajustar</button>
        <button type="button" class="zoom__opcion" [attr.aria-pressed]="escala() === 2" (click)="escalaCambio.emit(2)">×2</button>
      </div>
    }
    @if (faltas().length || puertas().length) {
      <details class="faltas" (keydown.escape)="cerrar($event)">
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <summary class="faltas__resumen"><span class="faltas__marca" aria-hidden="true">!</span>
          Por resolver en esta sala <span class="faltas__cuenta">{{ faltas().length + puertas().length }}</span></summary>
        <section aria-labelledby="faltas-sala" class="faltas__hoja">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <h3 id="faltas-sala" class="solo-lector">Por resolver en esta sala</h3>
          <ul>
            @for (puerta of puertas(); track puerta.id) {
              <li>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <span>Esta puerta no se guarda hasta que elijas a qué sala lleva.</span>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton boton-texto" (click)="irAPuerta.emit(puerta.id)">Ir a la pieza</button>
              </li>
            }
            @for (f of faltas(); track $index) {
              <!-- El id lo nombra la pieza que incumple (aria-describedby en la capa de piezas del muro). -->
              <li [id]="'falta-' + salaId() + '-' + $index"><span>{{ f.regla }}: {{ f.mensaje }}</span>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton boton-texto" (click)="irAFalta.emit(f)">Ir a la pieza</button>
              </li>
            }
          </ul>
        </section>
      </details>
    }
    <!-- Solo mirar (pantalla angosta): no hay teclas que enseñar; el aviso de la cabecera ya dice qué se puede hacer. -->
    @if (!estrecha()) {
    <details class="teclas" (keydown.escape)="cerrar($event)">
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <summary class="teclas__resumen">Teclas</summary>
      <div class="teclas__hoja">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p>Elige algo en la sala o en la lista y muévelo arrastrando o con las flechas del teclado.</p>
          <dl>
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <div><dt><kbd>Mayús</kbd> + flecha</dt><dd>mover de a un píxel</dd></div>
            <div><dt><kbd>Supr</kbd></dt><dd>quitarlo de la sala</dd></div>
            <div><dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>deshacer</dd></div>
            <div><dt><kbd>Ctrl</kbd>+<kbd>Y</kbd></dt><dd>rehacer</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>soltar lo señalado</dd></div>
          </dl>
      </div>
    </details>
    }
  `,
  styleUrl: './barra-del-lienzo.component.scss',
})
export class BarraDelLienzoComponent {
  readonly salaId = input.required<string>();
  /** Ancho de la sala por piezas; `null` en una sala de imagen fija (sin control de tamaño). */
  readonly ancho = input<number | null>(null);
  readonly escala = input<1 | 2>(1);
  readonly faltas = input<FaltaDeSala[]>([]);
  readonly puertas = input<PuertaCaso[]>([]);
  readonly estrecha = input(false);
  readonly escalaCambio = output<1 | 2>();
  readonly irAFalta = output<FaltaDeSala>();
  readonly irAPuerta = output<string>();

  private readonly raiz: HTMLElement = inject(ElementRef).nativeElement;

  /** Un clic fuera de la barra cierra el globo abierto (sin mover el foco: la docente está eligiendo otra cosa). */
  protected alPulsarFuera(evento: Event): void {
    if (this.raiz.contains(evento.target as Node)) return;
    this.raiz.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open'));
  }

  /** Esc cierra el globo abierto y devuelve el foco a su botón. */
  protected cerrar(evento: Event): void {
    const detalles = evento.currentTarget as HTMLDetailsElement;
    if (!detalles.open) return;
    evento.stopPropagation();
    detalles.open = false;
    detalles.querySelector<HTMLElement>('summary')?.focus();
  }
}
