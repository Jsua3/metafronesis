import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild,
} from '@angular/core';

import type { AmbitoPregunta, Eleccion } from '../../../../core/api/coautoria.api';

/** Lo que muestra la tarjeta: la pregunta pendiente o una ya respondida que se vuelve a abrir para cambiarla. */
export interface PreguntaVisible {
  numero: number;
  ambito: AmbitoPregunta;
  texto: string;
  porque: string;
  opciones: string[];
  recomendada: number;
  /** La elección anterior, si se está cambiando una respuesta. */
  previa?: Eleccion;
}

export const NOMBRE_AMBITO: Record<AmbitoPregunta, string> = {
  historia: 'Historia', personajes: 'Personajes', lugar: 'Lugar', evaluacion: 'Evaluación',
};

const MAXIMO_PROPIA = 300;
const PROPIA = 3;

/**
 * Una pregunta de la IA coautora: tres opciones (una recomendada) y una cuarta propia en texto libre, más «Decide tú» y
 * «Saltar las preguntas» (diseño §4 ②). Las opciones son un grupo de radio nativo: se recorre con las flechas y se responde
 * con «Responder» o con Intro.
 */
@Component({
  selector: 'app-tarjeta-pregunta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = pregunta();
    <form class="tarjeta-pregunta" (submit)="$event.preventDefault(); responderElegida()" [attr.aria-busy]="ocupado()">
      <div class="cabeza">
        <span class="ambito">{{ nombreAmbito() }}</span>
        <span class="cuenta">Pregunta {{ p.numero }} de {{ tope() }}</span>
      </div>
      <div class="progreso" aria-hidden="true">
        @for (n of pasos(); track n) {
          <span class="paso" [class.hecho]="n < p.numero" [class.actual]="n === p.numero"></span>
        }
      </div>
      <fieldset>
        <legend #titulo tabindex="-1" class="texto-pregunta">{{ p.texto }}</legend>
        <p class="porque">{{ p.porque }}</p>
        <div class="opciones">
          @for (opcion of p.opciones; track $index; let i = $index) {
            <label class="opcion" [class.elegida]="elegida() === i">
              <input type="radio" name="opcion" [value]="i" [checked]="elegida() === i" (change)="elegir(i)" />
              <span class="opcion-texto">{{ opcion }}</span>
              @if (i === p.recomendada) {
                <span class="pildora recomendada">Recomendada</span>
              }
            </label>
          }
          <label class="opcion propia" [class.elegida]="elegida() === propia">
            <input type="radio" name="opcion" [value]="propia" [checked]="elegida() === propia" (change)="elegir(propia)" />
            <span class="opcion-texto">Ninguna me convence: escribo la mía</span>
          </label>
          @if (elegida() === propia) {
            <div class="campo-propio">
              <label class="sr-only" [for]="idPropia">Tu respuesta</label>
              <input #campoPropio type="text" class="campo" [id]="idPropia" [attr.maxlength]="maximoPropia"
                     placeholder="Escribe tu respuesta" [value]="propiaTexto()" (input)="propiaTexto.set($any($event.target).value)" />
            </div>
          }
        </div>
      </fieldset>
      <div class="acciones">
        <button type="submit" class="boton boton-primario" [attr.aria-disabled]="!puedeResponder()">
          {{ p.previa ? 'Cambiar mi respuesta' : 'Responder' }}
        </button>
        <button type="button" class="boton" [attr.aria-disabled]="ocupado()" (click)="decide()">Decide tú</button>
        @if (!p.previa) {
          <button type="button" class="boton boton-texto saltar" [attr.aria-disabled]="ocupado()" (click)="pedirSaltar()">
            Saltar las preguntas
          </button>
        } @else {
          <button type="button" class="boton boton-texto saltar" (click)="cancelar.emit()">Dejarla como estaba</button>
        }
      </div>
    </form>
  `,
  styles: `
    :host { display: block; }
    .tarjeta-pregunta {
      display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--linea);
      border-radius: var(--radio-control); background: var(--superficie);
    }
    .cabeza { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: var(--autoria-texto-16); }
    .ambito { font-weight: 700; color: var(--primario); }
    .progreso { display: flex; gap: 4px; }
    .paso { flex: 1; block-size: 4px; border-radius: 2px; background: var(--linea); }
    .paso.hecho { background: var(--primario); }
    .paso.actual { background: color-mix(in srgb, var(--primario) 55%, var(--linea)); }
    fieldset { margin: 0; padding: 0; border: 0; min-inline-size: 0; display: flex; flex-direction: column; gap: 8px; }
    .texto-pregunta { padding: 0; font-weight: 700; font-size: var(--autoria-texto-18); line-height: 1.4; }
    .texto-pregunta:focus { outline: none; }
    .texto-pregunta:focus-visible { outline: 2px solid var(--primario); outline-offset: 2px; }
    .porque { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5; }
    .opciones { display: flex; flex-direction: column; gap: 8px; }
    .opcion {
      display: flex; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--borde-control);
      border-radius: var(--radio-control); cursor: pointer; font-size: var(--autoria-texto-16); line-height: 1.4;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .opcion:hover { border-color: var(--primario); }
    .opcion.elegida { border-color: var(--primario); background: var(--primario-tinte); box-shadow: inset 0 0 0 1px var(--primario); }
    .opcion input { inline-size: 20px; block-size: 20px; flex: none; margin: 0; accent-color: var(--primario); }
    .opcion-texto { flex: 1; min-inline-size: 0; }
    .recomendada { flex: none; }
    .propia .opcion-texto { font-style: italic; }
    .campo-propio { padding-inline-start: 32px; }
    .campo {
      inline-size: 100%; box-sizing: border-box; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16);
      border: 2px solid var(--borde-control); border-radius: var(--radio-control);
    }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .saltar { margin-inline-start: auto; }
    .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { .opcion { transition: none; } }
  `,
})
export class TarjetaPreguntaComponent {
  readonly pregunta = input.required<PreguntaVisible>();
  readonly tope = input.required<number>();
  readonly ocupado = input(false);
  readonly responder = output<Eleccion>();
  readonly saltar = output<void>();
  readonly cancelar = output<void>();

  protected readonly propia = PROPIA;
  protected readonly maximoPropia = MAXIMO_PROPIA;
  protected readonly idPropia = `propia-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly elegida = signal<number | null>(null);
  protected readonly propiaTexto = signal('');
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');
  private readonly campoPropio = viewChild<ElementRef<HTMLInputElement>>('campoPropio');

  protected readonly nombreAmbito = computed(() => NOMBRE_AMBITO[this.pregunta().ambito]);
  protected readonly pasos = computed(() => Array.from({ length: this.tope() }, (_, i) => i + 1));
  protected readonly puedeResponder = computed(() => {
    if (this.ocupado()) return false;
    const i = this.elegida();
    if (i === null) return false;
    return i !== PROPIA || this.propiaTexto().trim().length > 0;
  });

  constructor() {
    // Una pregunta nueva empieza sin elegir (o con la elección anterior, si se está cambiando) y recibe el foco.
    effect(() => {
      const p = this.pregunta();
      untracked(() => {
        const previa = p.previa;
        this.elegida.set(previa?.tipo === 'opcion' ? previa.indice : previa?.tipo === 'propia' ? PROPIA : null);
        this.propiaTexto.set(previa?.tipo === 'propia' ? previa.texto : '');
        queueMicrotask(() => this.titulo()?.nativeElement.focus());
      });
    });
  }

  protected elegir(i: number): void {
    this.elegida.set(i);
    if (i === PROPIA) queueMicrotask(() => this.campoPropio()?.nativeElement.focus());
  }

  protected responderElegida(): void {
    if (!this.puedeResponder()) return;
    const i = this.elegida()!;
    this.responder.emit(i === PROPIA ? { tipo: 'propia', texto: this.propiaTexto().trim() } : { tipo: 'opcion', indice: i });
  }

  protected decide(): void {
    if (!this.ocupado()) this.responder.emit({ tipo: 'decide' });
  }

  protected pedirSaltar(): void {
    if (!this.ocupado()) this.saltar.emit();
  }
}
