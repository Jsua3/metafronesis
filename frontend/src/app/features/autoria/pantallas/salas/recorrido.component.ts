import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/** Una sala del recorrido tal como se pinta: su nombre y su miniatura (o `null` mientras se pinta). */
export interface FilaDeRecorrido {
  id: string;
  nombre: string;
  vista: string | null;
}

/**
 * «Tu recorrido»: las salas elegidas en orden, con asa de arrastre y botones subir y bajar (la vía de teclado). Componente
 * presentacional: no cambia el orden él mismo, emite `mover` y el contenedor decide (y anuncia el cambio). El arrastre se
 * arma solo desde el asa, para que tocar un botón no arrastre la fila.
 */
@Component({
  selector: 'app-recorrido',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="orden" class="recorrido">
      <h2 id="orden" class="seccion">Tu recorrido</h2>
      @if (filas().length) {
        <p class="ayuda">Cada sala será una escena, en este orden. Arrastra por el asa o usa las flechas. Después puedes agregar, quitar o reordenar.</p>
        <ol class="lista-orden">
          @for (f of filas(); track f.id; let i = $index; let ultimo = $last) {
            <li [class.destino]="destino() === i" (dragstart)="iniciar(i, $event)" (dragover)="sobre(i, $event)"
                (drop)="soltar($event, i)" (dragend)="terminar($event)">
              <span class="asa" aria-hidden="true" (pointerdown)="tomarAsa($event)" (pointerup)="soltarAsa($event)"
                    (pointercancel)="soltarAsa($event)"></span>
              <span class="posicion">{{ i + 1 }}</span>
              @if (f.vista) { <img class="pixel mini" [src]="f.vista" alt="" width="64" height="36" decoding="async" /> }
              @else { <span class="mini mini--vacia" aria-hidden="true"></span> }
              <span class="nombre-orden">{{ f.nombre }}</span>
              <span class="mover">
                <button type="button" class="boton" [attr.aria-label]="'Subir ' + f.nombre" [attr.aria-disabled]="i === 0" (click)="mover.emit({ desde: i, hasta: i - 1 })">↑</button>
                <button type="button" class="boton" [attr.aria-label]="'Bajar ' + f.nombre" [attr.aria-disabled]="ultimo" (click)="mover.emit({ desde: i, hasta: i + 1 })">↓</button>
              </span>
            </li>
          }
        </ol>
      } @else {
        <p class="ayuda vacio">Ninguna sala elegida. Marca las salas o usa una idea para empezar.</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .recorrido { display: flex; flex-direction: column; gap: 0.5rem; }
    .seccion { margin: 0; font-size: var(--autoria-texto-14); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--texto-secundario); }
    .ayuda { margin: 0; font-size: var(--autoria-texto-14); line-height: 1.375rem; color: var(--texto-secundario); }
    .vacio { padding: 0.75rem; border: 1px dashed var(--borde-control); border-radius: var(--radio-control); }
    .lista-orden { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
    .lista-orden li {
      display: flex; align-items: center; gap: 0.5rem; min-block-size: 2.75rem; padding-inline-start: 0.25rem;
      border-radius: var(--radio-control); border: 1px solid transparent; background: var(--l-superficie, var(--superficie));
      animation: entrar var(--ds-dur-base) var(--ds-ease-out);
    }
    @keyframes entrar { from { opacity: 0; transform: translateY(0.25rem); } }
    .lista-orden li.destino { border-color: var(--primario); background: var(--primario-tinte); }
    /* El asa: seis puntos de 2 px dibujados con un degradado, el mismo grano pixel del simulador. */
    .asa {
      flex: none; inline-size: 0.75rem; block-size: 1.25rem; cursor: grab; touch-action: none; user-select: none;
      background: radial-gradient(circle, var(--texto-secundario) 1px, transparent 1.5px) 0 0 / 0.375rem 0.375rem;
    }
    .posicion { flex: none; inline-size: 1.25rem; text-align: end; font-variant-numeric: tabular-nums; font-weight: 700; font-size: var(--autoria-texto-14); }
    .mini {
      flex: none; inline-size: 3rem; block-size: auto; aspect-ratio: 16 / 9; object-fit: cover;
      border-radius: var(--l-pixel, 2px); border: 1px solid var(--linea);
    }
    .mini--vacia { background: var(--fondo-hundido); }
    .nombre-orden { flex: 1; min-inline-size: 0; font-size: var(--autoria-texto-14); line-height: 1.25rem; overflow-wrap: anywhere; }
    .mover { display: flex; flex: none; gap: 0.25rem; }
    .mover .boton { inline-size: 2.75rem; min-block-size: 2.75rem; padding: 0; }
    @media (prefers-reduced-motion: reduce) { .lista-orden li { animation: none; } }
  `,
})
export class RecorridoComponent {
  readonly filas = input.required<FilaDeRecorrido[]>();
  readonly mover = output<{ desde: number; hasta: number }>();
  /** La fila sobre la que se suelta lo que se arrastra (para pintar la ranura). */
  protected readonly destino = signal<number | null>(null);
  private arrastrado: number | null = null;

  protected tomarAsa(evento: PointerEvent): void {
    const fila = (evento.currentTarget as HTMLElement | null)?.closest('li');
    if (fila) fila.draggable = true;
  }

  protected soltarAsa(evento: Event): void {
    const fila = (evento.currentTarget as HTMLElement | null)?.closest('li');
    if (fila) fila.draggable = false;
  }

  protected iniciar(indice: number, evento: DragEvent): void {
    this.arrastrado = indice;
    if (evento.dataTransfer) {
      evento.dataTransfer.effectAllowed = 'move';
      evento.dataTransfer.setData('text/plain', String(indice)); // Firefox no arrastra sin datos.
    }
  }

  protected sobre(indice: number, evento: DragEvent): void {
    if (this.arrastrado === null) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    if (this.destino() !== indice) this.destino.set(indice);
  }

  protected soltar(evento: DragEvent, indice: number): void {
    evento.preventDefault();
    if (this.arrastrado !== null) this.mover.emit({ desde: this.arrastrado, hasta: indice });
    this.terminar(evento);
  }

  protected terminar(evento?: Event): void {
    this.arrastrado = null;
    this.destino.set(null);
    const fila = (evento?.target as HTMLElement | null)?.closest?.('li');
    if (fila) fila.draggable = false;
  }
}
