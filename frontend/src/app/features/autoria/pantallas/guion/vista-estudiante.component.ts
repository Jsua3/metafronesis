import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, untracked } from '@angular/core';

import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { Escena, Respuesta } from '../../modelo/caso';
import type { Expresion } from '../../modelo/escenario';
import type { PersonajeDeLinea } from './linea.component';

const LETRAS = ['A', 'B', 'C', 'D'];
/** El juego muestra hasta cuatro opciones (A a D); la vista no enseña más de las que vería el estudiante. */
const MAX_OPCIONES = 4;

/** En qué punto de la escena va la mini simulación. */
type Momento = { tipo: 'linea'; indice: number } | { tipo: 'decidir' } | { tipo: 'despues'; respuestaId: string };

/**
 * «Así lo verá el estudiante» (EDITOR.md §3.4): una MINI SIMULACIÓN de la escena en la piel del juego, no una foto fija.
 * Avanza las líneas como el cuadro de diálogo del juego, ofrece las opciones A a D y, al elegir una, muestra cómo reacciona
 * el personaje y lo que lee el estudiante después: justo lo que la docente escribe a ciegas. Nunca dice la clase de la
 * respuesta, igual que el juego (lo fija `no-classification-leak.spec.ts` del simulador).
 *
 * Por qué no se incrusta el juego: el servidor lo prohíbe (`X_FRAME_OPTIONS = "DENY"` y `frame-ancestors 'none'`).
 *
 * Patrón: State (el momento de la escena es un estado con tres formas) en una pieza de presentación: recibe la escena y
 * la línea que la docente está escribiendo, y no toca el store.
 */
@Component({
  selector: 'app-vista-estudiante',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vista-estudiante' },
  template: `
    <h2 class="vista__titulo" id="vista-titulo">Así lo verá el estudiante</h2>
    <div class="juego" role="group" aria-labelledby="vista-titulo">
      @switch (momento().tipo) {
        @case ('linea') {
          @if (lineaActual(); as l) {
            <div class="juego__dialogo">
              <img class="pixel juego__retrato" [src]="retrato(l.personajeId, l.expresion)" alt="" width="64" height="64" />
              <div class="juego__texto">
                <p class="juego__nombre">{{ nombre(l.personajeId) }}</p>
                <p aria-live="polite">{{ l.texto || '…' }}</p>
              </div>
            </div>
            <div class="juego__pie">
              <span class="juego__cuenta">Línea {{ indiceLinea() + 1 }} de {{ escena().lineas.length }}</span>
              <button type="button" class="juego__boton" (click)="avanzar()">{{ esUltimaLinea() ? 'Ver las respuestas' : 'Siguiente' }} ›</button>
            </div>
          } @else {
            <p class="juego__vacio">Todavía nadie dice nada en esta escena.</p>
            @if (opciones().length) { <button type="button" class="juego__boton" (click)="avanzar()">Ver las respuestas ›</button> }
          }
        }
        @case ('decidir') {
          <p class="juego__pregunta">¿Qué haces?</p>
          @if (opciones().length) {
            <ol class="juego__opciones">
              @for (o of opciones(); track o.respuesta.id) {
                <li>
                  <button type="button" class="juego__opcion" (click)="elegir(o.respuesta)">
                    <span class="juego__letra" aria-hidden="true">{{ o.letra }}</span>
                    <span>{{ o.respuesta.texto || 'Respuesta sin escribir' }}</span>
                    <span class="solo-lector">, opción {{ o.letra }}</span>
                  </button>
                </li>
              }
            </ol>
          } @else {
            <p class="juego__vacio">Aún no hay respuestas para elegir.</p>
          }
        }
        @case ('despues') {
          @if (elegida(); as r) {
            <p class="juego__eleccion"><span class="juego__letra" aria-hidden="true">{{ letraDe(r) }}</span> {{ r.texto || 'Respuesta sin escribir' }}</p>
            <div class="juego__dialogo" aria-live="polite">
              <img class="pixel juego__retrato" [src]="retrato(reacciona(r), caraDe(r))" alt="" width="64" height="64" />
              <div class="juego__texto">
                <p class="juego__nombre">{{ nombre(reacciona(r)) }}</p>
                <p>{{ r.reaccion?.linea || 'No dice nada: solo cambia su cara.' }}</p>
              </div>
            </div>
            <div class="juego__despues">
              <p class="juego__nombre">Lo que lees después</p>
              <p>{{ r.retroalimentacion || 'Todavía no escribiste lo que lee el estudiante después.' }}</p>
            </div>
          }
          <button type="button" class="juego__boton" (click)="reiniciar()">Volver a empezar la escena</button>
        }
      }
    </div>
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <p class="vista__nota">Como en el juego, las respuestas no dicen su clase.@if (hayRequisitos()) { Las que tienen un requisito solo aparecen si el estudiante lo cumple.}</p>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; min-inline-size: 0; }
    .vista__titulo { margin: 0; font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .vista__nota { margin: 0; color: var(--texto-secundario); font-size: var(--autoria-texto-14); line-height: 1.25rem; }
    /* El cuadro del juego, siempre oscuro (el juego lo es en las dos pieles), con el borde de píxel de su caja de diálogo. */
    .juego {
      display: flex; flex-direction: column; gap: 0.75rem; padding: 0.875rem; border-radius: 0.5rem;
      background: var(--juego-fondo); color: var(--juego-texto);
      box-shadow: inset 0 0 0 2px var(--juego-borde), inset 0 0 0 4px var(--juego-hundido), 0 6px 0 -2px var(--juego-hundido);
    }
    .juego p { margin: 0; overflow-wrap: anywhere; }
    .juego__dialogo { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.75rem; align-items: start; }
    .juego__retrato { border-radius: 0.25rem; background: var(--juego-hundido); box-shadow: 0 0 0 1px var(--juego-borde); }
    .juego__texto { display: flex; flex-direction: column; gap: 0.25rem; line-height: 1.5rem; }
    .juego__nombre { color: var(--juego-acento-claro); font-weight: 800; font-size: var(--autoria-texto-14); letter-spacing: 0.02em; }
    .juego__pie { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .juego__cuenta { color: var(--juego-texto-suave); font-size: var(--autoria-texto-14); }
    .juego__pregunta { font-weight: 800; }
    .juego__vacio { color: var(--juego-texto-suave); }
    .juego__opciones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
    .juego__opcion, .juego__boton {
      display: flex; align-items: center; gap: 0.625rem; min-block-size: 2.75rem; padding: 0.375rem 0.75rem; cursor: pointer;
      border: 1px solid var(--juego-borde); border-radius: 0.375rem; background: var(--juego-elevado); color: var(--juego-texto);
      font: inherit; font-size: var(--autoria-texto-16); text-align: start;
      transition: scale var(--ds-dur-press) var(--ds-ease-out), background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .juego__opcion { inline-size: 100%; }
    .juego__boton { align-self: flex-end; font-weight: 700; color: var(--juego-acento-claro); }
    .juego__opcion:focus-visible, .juego__boton:focus-visible { outline: 3px solid var(--juego-acento-claro); outline-offset: 2px; }
    .juego__opcion:active, .juego__boton:active { scale: 0.98; }
    .juego__letra {
      display: inline-grid; place-items: center; flex: none; inline-size: 1.75rem; block-size: 1.75rem; border-radius: 0.25rem;
      background: var(--juego-hundido); color: var(--juego-acento-claro); font-weight: 800; box-shadow: 0 0 0 1px var(--juego-borde);
    }
    .juego__eleccion { display: flex; align-items: flex-start; gap: 0.5rem; color: var(--juego-texto-suave); }
    .juego__despues { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.625rem 0.75rem; border-radius: 0.375rem; background: var(--juego-hundido); line-height: 1.5rem; }
    @media (hover: hover) and (pointer: fine) {
      .juego__opcion:hover, .juego__boton:hover { background: var(--juego-escenario); border-color: var(--juego-acento); }
    }
    @media (prefers-reduced-motion: reduce) { .juego__opcion, .juego__boton { transition: none; } }
    @media (forced-colors: active) { .juego { border: 2px solid CanvasText; } }
  `,
})
export class VistaEstudianteComponent {
  readonly escena = input.required<Escena>();
  readonly personajes = input.required<readonly PersonajeDeLinea[]>();
  /** La línea que la docente está escribiendo: la vista salta a ella para que vea su turno tal como saldrá. */
  readonly lineaEnfocada = input<string | null>(null);

  /**
   * El momento vuelve a la línea enfocada (o a la primera) cuando cambia la ESCENA o la línea que se escribe; no cuando se
   * guarda algo de la misma escena (el caso se rehace en cada cambio y la vista no debe saltar mientras se lee).
   */
  private readonly clave = computed(() => `${this.escena().id}|${this.lineaEnfocada() ?? ''}`);
  protected readonly momento = linkedSignal<string, Momento>({
    source: this.clave,
    computation: () => {
      const i = untracked(this.escena).lineas.findIndex((l) => l.id === untracked(this.lineaEnfocada));
      return { tipo: 'linea', indice: Math.max(0, i) };
    },
  });

  protected readonly indiceLinea = computed(() => {
    const m = this.momento();
    return m.tipo === 'linea' ? Math.min(m.indice, Math.max(0, this.escena().lineas.length - 1)) : 0;
  });
  protected readonly lineaActual = computed(() => this.escena().lineas[this.indiceLinea()] ?? null);
  protected readonly esUltimaLinea = computed(() => this.indiceLinea() >= this.escena().lineas.length - 1);
  protected readonly opciones = computed(() =>
    this.escena().respuestas.slice(0, MAX_OPCIONES).map((respuesta, i) => ({ respuesta, letra: LETRAS[i] })));
  protected readonly hayRequisitos = computed(() => this.escena().respuestas.some((r) => Object.keys(r.requiere ?? {}).length > 0));
  protected readonly elegida = computed(() => {
    const m = this.momento();
    return m.tipo === 'despues' ? this.escena().respuestas.find((r) => r.id === m.respuestaId) ?? null : null;
  });

  protected avanzar(): void {
    this.momento.set(this.esUltimaLinea() || !this.lineaActual() ? { tipo: 'decidir' } : { tipo: 'linea', indice: this.indiceLinea() + 1 });
  }

  protected elegir(r: Respuesta): void {
    this.momento.set({ tipo: 'despues', respuestaId: r.id });
  }

  protected reiniciar(): void {
    this.momento.set({ tipo: 'linea', indice: 0 });
  }

  protected letraDe(r: Respuesta): string {
    return LETRAS[this.escena().respuestas.indexOf(r)] ?? '';
  }

  /** Quién reacciona: el que eligió la docente o, si no, quien habla primero en la escena (como el juego). */
  protected reacciona(r: Respuesta): string {
    return r.reaccion?.personaje ?? this.escena().lineas[0]?.personajeId ?? '';
  }

  /** La cara elegida para la reacción; sin elegir, la del último turno (el juego la calcula según cómo quede la persona). */
  protected caraDe(r: Respuesta): Expresion {
    return r.reaccion?.emocion ?? this.escena().lineas.at(-1)?.expresion ?? 'neutral';
  }

  protected nombre(id: string): string {
    return this.personajes().find((p) => p.id === id)?.nombre ?? 'Sin personaje';
  }

  protected retrato(id: string, cara: Expresion): string {
    return rutaRetrato(this.personajes().find((p) => p.id === id)?.recipeId ?? 'sin-receta', cara);
  }
}
