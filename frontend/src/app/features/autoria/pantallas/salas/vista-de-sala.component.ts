import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Lo que se cuenta de una sala bajo su imagen: ya resuelto a nombres legibles por el contenedor. */
export interface FichaDeSala {
  id: string;
  nombre: string;
  descripcion: string;
  encuadre: string;
  vista: string | null;
  personajes: string;
  muebles: string;
  objetos: string;
  puertas: string;
}

/**
 * La vista previa grande de la sala enfocada (paso 2 de crear un caso), como el visor de un recurso en Unity: la imagen a
 * todo el ancho del inspector, su nombre y lo que trae. Presentacional: recibe la ficha ya armada y emite `cerrar`.
 * Sin sala enfocada muestra un marco vacío que dice cómo llenarlo, y no lleva el id `vista-sala` (lo usa `aria-controls`).
 */
@Component({
  selector: 'app-vista-de-sala',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ficha(); as f) {
      @for (x of [f]; track x.id) {
        <section id="vista-sala" class="vista" aria-label="Vista previa de la sala">
          <div class="marco">
            @if (x.vista) {
              <img class="pixel" [src]="x.vista" alt="" width="960" height="528" decoding="async" />
            } @else {
              <span class="patron" aria-hidden="true"></span>
            }
            <span class="encuadre" aria-hidden="true">{{ x.encuadre }}</span>
          </div>
          <div class="cabeza">
            <h3>{{ x.nombre }}</h3>
            <button type="button" class="boton boton-texto cerrar" (click)="cerrar.emit()">Cerrar</button>
          </div>
          <p class="desc">{{ x.descripcion }}</p>
          <dl>
            <dt>Personajes</dt><dd>{{ x.personajes || 'Ninguno' }}</dd>
            <dt>Muebles</dt><dd>{{ x.muebles || 'Ninguno' }}</dd>
            <dt>Objetos</dt><dd>{{ x.objetos || 'Ninguno' }}</dd>
            <dt>Puertas</dt><dd>{{ x.puertas || 'Ninguna' }}</dd>
          </dl>
        </section>
      }
    } @else {
      <div class="vista vista--vacia">
        <div class="marco">
          <!-- Sin sala enfocada, el visor no queda en blanco: la entrada del lugar, atenuada, a la espera. -->
          @if (espera(); as src) { <img class="pixel" [src]="src" alt="" width="960" height="528" decoding="async" /> }
          @else { <span class="patron" aria-hidden="true"></span> }
        </div>
        <p class="desc">Pasa el cursor por una sala o llega a ella con el teclado para verla aquí en grande.</p>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .vista { display: flex; flex-direction: column; gap: 0.625rem; animation: aparecer var(--ds-dur-base) var(--ds-ease-out); }
    @keyframes aparecer { from { opacity: 0; } }
    .marco { position: relative; overflow: hidden; aspect-ratio: 16 / 9; border-radius: var(--radio-control); border: 1px solid var(--linea); background: var(--fondo-hundido); }
    .marco img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
    .patron {
      display: block; inline-size: 100%; block-size: 100%;
      background: repeating-conic-gradient(var(--fondo-hundido) 0 25%, color-mix(in oklab, var(--fondo-hundido) 80%, var(--linea)) 0 50%) 0 0 / 1.5rem 1.5rem;
    }
    .encuadre {
      position: absolute; inset-block-end: 0.5rem; inset-inline-start: 0.5rem; padding: 0.125rem 0.5rem;
      font-size: var(--autoria-texto-14); font-weight: 700; color: var(--sobre-primario);
      background: var(--primario);
      box-shadow: inset 0 calc(-1 * var(--l-pixel, 2px)) 0 var(--primario-oscuro); border-radius: var(--l-pixel, 2px);
    }
    .cabeza { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .cabeza h3 { margin: 0; font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .cerrar { flex: none; }
    .desc { margin: 0; font-size: var(--autoria-texto-14); line-height: 1.375rem; color: var(--texto-secundario); }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; font-size: var(--autoria-texto-14); line-height: 1.375rem; }
    dt { font-weight: 700; }
    dd { margin: 0; min-inline-size: 0; overflow-wrap: anywhere; }
    .vista--vacia .marco { border-style: dashed; }
    .vista--vacia .patron, .vista--vacia img { opacity: 0.45; filter: grayscale(0.6); }
    @media (prefers-reduced-motion: reduce) { .vista { animation: none; } }
  `,
})
export class VistaDeSalaComponent {
  readonly ficha = input<FichaDeSala | null>(null);
  /** La imagen que espera en el visor vacío (la primera sala del lugar). */
  readonly espera = input<string | null>(null);
  readonly cerrar = output<void>();
}
