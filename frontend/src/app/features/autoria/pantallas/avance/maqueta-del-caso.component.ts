import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Generation } from '../../../../core/models/generacion.model';
import type { Escenario } from '../../modelo/escenario';
import type { EstadoParte, Parte } from './avance-partes';

interface Cuadro {
  clave: string;
  titulo: string;
  sala: string;
  final: boolean;
  estado: EstadoParte;
  vista: string | null;
}

const ESTADO_LEGIBLE: Record<EstadoParte, string> = {
  hecha: 'Escrita', 'en-curso': 'Escribiendo…', error: 'Con un problema', pendiente: 'En espera',
};

/**
 * La maqueta del caso mientras la IA lo arma: una ficha por escena con el cuarto real donde pasa, que se «revela» (de gris
 * atenuado a color, en un fundido lento) cuando la escena queda escrita; arriba, tres cifras (escenas, salas, personajes).
 * Es la versión visual y tranquila de la lista de partes, que sigue debajo con el detalle y lo que se puede hacer.
 *
 * Presentacional (patrón Observer: se deriva todo de las señales de entrada, sin servicios). Antes del esqueleto no se sabe
 * qué salas habrá: muestra cuatro fichas por decidir con la forma real. Nada se mueve en bucle; con movimiento reducido, sin
 * transiciones.
 */
@Component({
  selector: 'app-maqueta-del-caso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="maqueta" aria-labelledby="maqueta-titulo">
      <h2 id="maqueta-titulo" class="seccion">Tu caso, escena por escena</h2>
      <dl class="cifras">
        <div><dt>Escenas escritas</dt><dd>{{ cuadros().length ? escritas() + ' de ' + cuadros().length : '…' }}</dd></div>
        <div><dt>Salas</dt><dd>{{ cuadros().length ? salas() : '…' }}</dd></div>
        <div><dt>Personajes</dt><dd>{{ cuadros().length && escenario() ? personajes() : '…' }}</dd></div>
      </dl>
      @if (cuadros().length) {
        <ol class="cuadros">
          @for (c of cuadros(); track c.clave; let i = $index) {
            <li class="cuadro" [attr.data-estado]="c.estado">
              <span class="arte">
                @if (c.vista) { <img class="pixel" [src]="c.vista" alt="" width="960" height="528" decoding="async" /> }
                @else { <span class="hueco" aria-hidden="true"></span> }
                <span class="numero" aria-hidden="true">{{ i + 1 }}</span>
                @if (c.final) { <span class="fin" aria-hidden="true">Final</span> }
              </span>
              <span class="titulo">{{ c.titulo }}</span>
              <span class="estado"><span class="cuadrito" aria-hidden="true"></span>{{ estadoLegible[c.estado] }} · {{ c.sala }}</span>
            </li>
          }
        </ol>
      } @else {
        <ol class="cuadros" aria-hidden="true">
          @for (n of [1, 2, 3, 4]; track n) { <li class="cuadro" data-estado="pendiente"><span class="arte"><span class="hueco"></span></span><span class="raya"></span></li> }
        </ol>
        <p class="nota">La IA primero decide las escenas y en qué sala pasa cada una; después las escribe una por una.</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .maqueta { display: flex; flex-direction: column; gap: 0.75rem; }
    .seccion { margin: 0; font-size: var(--autoria-texto-14); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--texto-secundario); }
    .cifras { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border: 1px solid var(--linea); border-radius: var(--radio-control); overflow: hidden; }
    .cifras div { display: flex; flex-direction: column-reverse; gap: 0.125rem; padding: 0.5rem 0.75rem; min-inline-size: 0; }
    .cifras div + div { border-inline-start: 1px solid var(--linea); }
    .cifras dt { font-size: var(--autoria-texto-14); color: var(--texto-secundario); }
    .cifras dd { margin: 0; font-size: var(--autoria-texto-20); font-weight: 700; line-height: 1.75rem; font-variant-numeric: tabular-nums; }
    .cuadros { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
    .cuadro { display: flex; flex-direction: column; gap: 0.25rem; min-inline-size: 0; }
    .arte { position: relative; display: block; overflow: hidden; aspect-ratio: 16 / 9; border-radius: var(--radio-control); border: 1px solid var(--linea); background: var(--fondo-hundido); }
    .arte img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
    .hueco {
      display: block; inline-size: 100%; block-size: 100%;
      background: repeating-conic-gradient(var(--fondo-hundido) 0 25%, color-mix(in oklab, var(--fondo-hundido) 80%, var(--linea)) 0 50%) 0 0 / 1rem 1rem;
    }
    /* La revelación: lo que falta se ve gris y atenuado; al quedar escrita, la sala toma su color en un fundido lento. */
    .arte img, .arte .hueco { transition: filter var(--ds-dur-slow) var(--ds-ease-out), opacity var(--ds-dur-slow) var(--ds-ease-out); }
    [data-estado='pendiente'] .arte img, [data-estado='pendiente'] .hueco { filter: grayscale(1); opacity: 0.45; }
    [data-estado='en-curso'] .arte img { filter: grayscale(0.5); opacity: 0.8; }
    [data-estado='en-curso'] .arte { border-color: var(--l-acento, var(--primario)); box-shadow: 0 0 0 1px var(--l-acento, var(--primario)); }
    [data-estado='error'] .arte { border-color: var(--peligro); box-shadow: 0 0 0 1px var(--peligro); }
    .numero, .fin {
      position: absolute; inset-block-start: 0.375rem; padding: 0 0.375rem; min-inline-size: 1.5rem; text-align: center;
      font-size: var(--autoria-texto-14); font-weight: 700; line-height: 1.5rem; border-radius: var(--l-pixel, 2px);
      color: var(--sobre-primario); background: var(--primario);
    }
    .numero { inset-inline-start: 0.375rem; }
    .fin { inset-inline-end: 0.375rem; }
    .titulo { font-size: var(--autoria-texto-14); font-weight: 700; line-height: 1.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .estado { display: flex; align-items: center; gap: 0.375rem; font-size: var(--autoria-texto-14); line-height: 1.25rem; color: var(--texto-secundario); min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* El cuadrito de estado, 8 px con esquinas de 2: el detalle pixel del simulador, con forma distinta por estado (no solo color). */
    .cuadrito { flex: none; inline-size: 0.5rem; block-size: 0.5rem; border-radius: var(--l-pixel, 2px); border: var(--l-pixel, 2px) solid var(--borde-control); }
    [data-estado='hecha'] .cuadrito { background: var(--adecuada); border-color: var(--adecuada); }
    [data-estado='en-curso'] .cuadrito { border-color: var(--l-acento, var(--primario)); background: linear-gradient(to top, var(--l-acento, var(--primario)) 50%, transparent 50%); }
    [data-estado='error'] .cuadrito { background: var(--peligro); border-color: var(--peligro); transform: rotate(45deg); }
    .raya { display: block; block-size: 0.75rem; inline-size: 70%; border-radius: var(--l-pixel, 2px); background: var(--fondo-hundido); }
    .nota { margin: 0; font-size: var(--autoria-texto-14); line-height: 1.375rem; color: var(--texto-secundario); }
    @media (prefers-reduced-motion: reduce) { .arte img, .arte .hueco { transition: none; } }
  `,
})
export class MaquetaDelCasoComponent {
  readonly generacion = input<Generation | null>(null);
  readonly partes = input<Parte[]>([]);
  /** El escenario del lugar (para los nombres de las salas y sus personajes); `null` mientras llega o si no se pudo leer. */
  readonly escenario = input<Escenario | null>(null);
  /** La imagen de cada sala por su id. */
  readonly vistas = input<Record<string, string | null>>({});
  protected readonly estadoLegible = ESTADO_LEGIBLE;

  protected readonly cuadros = computed<Cuadro[]>(() => {
    const estados = new Map(this.partes().map((p) => [p.clave, p.estado]));
    const salas = this.escenario()?.salas ?? [];
    return (this.generacion()?.skeleton?.escenas ?? []).map((e) => ({
      clave: e.clave, titulo: e.titulo, final: e.final,
      sala: salas.find((s) => s.id === e.clave)?.nombre ?? e.clave,
      estado: estados.get(`escena-${e.clave}`) ?? 'pendiente',
      vista: this.vistas()[e.clave] ?? null,
    }));
  });
  protected readonly escritas = computed(() => this.cuadros().filter((c) => c.estado === 'hecha').length);
  protected readonly salas = computed(() => new Set(this.cuadros().map((c) => c.clave)).size);
  /** Los personajes distintos que viven en las salas elegidas por el esqueleto. */
  protected readonly personajes = computed(() => {
    const claves = new Set(this.cuadros().map((c) => c.clave));
    const salas = (this.escenario()?.salas ?? []).filter((s) => claves.has(s.id));
    return new Set(salas.flatMap((s) => s.personajes.map((p) => p.ref))).size;
  });
}
