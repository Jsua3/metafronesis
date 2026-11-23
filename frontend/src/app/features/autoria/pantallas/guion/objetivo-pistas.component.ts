import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, input, linkedSignal } from '@angular/core';

import { CasoStore } from '../../estado/caso.store';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { DeshacerBorrado } from '../../marco/deshacer-borrado';
import type { Escena } from '../../modelo/caso';

const MAX_OBJETIVO = 200;
const MAX_PISTA = 280;
const MAX_PISTAS = 3;

/** Una sola línea, sin espacios de más y sin pasar del tope. */
const unaLinea = (texto: string, tope: number): string => texto.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, tope);

/**
 * «Objetivo» y «Pistas» de una escena, en el guion. El objetivo es una frase que el estudiante ve en el juego; las pistas son lo
 * que puede pedir si no sabe cómo seguir. Se guarda al salir del campo (no en cada tecla).
 */
@Component({
  selector: 'app-objetivo-pistas',
  imports: [AutoAltoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="objetivo">
      <label for="objetivo-escena" class="etiqueta">Objetivo de la escena</label>
      <input id="objetivo-escena" type="text" class="campo" [attr.maxlength]="maxObjetivo" [value]="objetivo()"
             aria-describedby="objetivo-ayuda objetivo-cuenta"
             (input)="objetivo.set($any($event.target).value)" (change)="guardarObjetivo($event)" />
      <div class="objetivo__pie">
        <p id="objetivo-ayuda" class="texto-secundario nota">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          Una frase con lo que el estudiante busca aquí, sin decirle qué hacer. La ve en el juego. Hasta 200 caracteres.
        </p>
        <p id="objetivo-cuenta" class="texto-secundario nota cuenta">{{ objetivo().length }} de {{ maxObjetivo }}</p>
      </div>
      <p role="status" class="solo-lector">{{ avisoTope() }}</p>
    </div>

    <section id="pistas-escena" class="pistas" tabindex="-1" aria-labelledby="pistas-titulo">
      <h3 id="pistas-titulo" class="etiqueta">Pistas</h3>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <p id="pistas-ayuda" class="texto-secundario nota">Lo que el estudiante puede pedir si no sabe cómo seguir, de la más suave a la más directa. Hasta 3, de 280 caracteres.</p>
      @if (!e().salaId) {
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <p id="pistas-motivo" class="texto-secundario nota">Esta escena aún no tiene sala, y las pistas se guardan con la sala. Elige una sala para esta escena y podrás agregar pistas.</p>
      } @else {
        <ol class="lista">
          @for (p of pistas(); track p.id; let i = $index) {
            <li class="pista">
              <label [for]="'pista-texto-' + i" class="etiqueta">Pista {{ i + 1 }}</label>
              <textarea autoAlto [id]="'pista-texto-' + i" class="campo" rows="1" [attr.maxlength]="maxPista" [value]="p.texto"
                        (change)="guardarPista(i, $event)"></textarea>
              <button type="button" class="boton peligro" [attr.aria-label]="'Quitar la pista ' + (i + 1)" (click)="quitar(i)">Quitar la pista {{ i + 1 }}</button>
            </li>
          }
        </ol>
        <button id="agregar-pista" type="button" class="boton" [attr.aria-disabled]="enElTope() ? 'true' : null"
                [attr.aria-describedby]="enElTope() ? 'pistas-tope' : null" (click)="agregar()">Agregar una pista</button>
        @if (enElTope()) {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p id="pistas-tope" class="texto-secundario nota">Ya hay 3 pistas: quita una para agregar otra.</p>
        }
      }
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .objetivo, .pistas { display: flex; flex-direction: column; gap: 6px; }
    .pistas { align-items: flex-start; }
    .pistas h3 { margin: 0; }
    .pistas .lista { align-self: stretch; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-14); color: var(--texto-secundario); }
    .campo { min-height: 44px; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); line-height: 24px; border: 1px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; }
    textarea.campo { resize: none; }
    .nota { margin: 0; font-size: var(--autoria-texto-14); line-height: 20px; }
    /* La ayuda y la cuenta comparten renglón: la cuenta, a la derecha y con cifras de ancho fijo para que no baile. */
    .objetivo__pie { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
    .objetivo__pie .nota:first-child { flex: 1 1 16rem; }
    .cuenta { font-variant-numeric: tabular-nums; }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .pista { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .pista .campo { align-self: stretch; }
    .peligro { color: var(--peligro); }
    button[aria-disabled='true'] { opacity: 0.6; cursor: not-allowed; }
  `,
})
export class ObjetivoPistasComponent {
  readonly escena = input.required<Escena>();

  private readonly store = inject(CasoStore);
  private readonly deshacer = inject(DeshacerBorrado);
  private readonly injector = inject(Injector);

  protected readonly maxObjetivo = MAX_OBJETIVO;
  protected readonly maxPista = MAX_PISTA;
  protected readonly e = this.escena;

  /** Lo que hay escrito ahora en el campo (para el contador); vuelve a lo guardado cuando cambia la escena. */
  protected readonly objetivo = linkedSignal(() => this.escena().objetivo ?? '');
  protected readonly pistas = computed(() => this.escena().pistas ?? []);
  protected readonly enElTope = computed(() => this.pistas().length >= MAX_PISTAS);
  protected readonly avisoTope = computed(() => (this.objetivo().length >= MAX_OBJETIVO ? `Llegaste al tope de ${MAX_OBJETIVO} caracteres.` : ''));

  protected guardarObjetivo(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const texto = unaLinea(campo.value, MAX_OBJETIVO);
    campo.value = texto;
    this.objetivo.set(texto);
    if (texto !== (this.escena().objetivo ?? '')) this.store.editarObjetivo(this.escena().id, texto);
  }

  protected guardarPista(indice: number, evento: Event): void {
    const campo = evento.target as HTMLTextAreaElement;
    const texto = unaLinea(campo.value, MAX_PISTA);
    campo.value = texto;
    const textos = this.pistas().map((p) => p.texto);
    if (textos[indice] === texto) return;
    textos[indice] = texto;
    this.store.fijarPistas(this.escena().id, textos);
  }

  protected agregar(): void {
    if (this.enElTope()) return; // el tope solo impide agregar: nunca borra las que ya haya
    const textos = this.pistas().map((p) => p.texto);
    this.store.fijarPistas(this.escena().id, [...textos, '']);
    this.enfocar(`pista-texto-${textos.length}`);
  }

  protected quitar(indice: number): void {
    const quedan = this.pistas().length - 1;
    // Nada del caso apunta a una pista: se quita al instante y el marco ofrece «Deshacer» durante 8 s (EDITOR.md §4.6).
    this.deshacer.pista(this.escena().id, indice, MAX_PISTAS);
    // El foco pasa a la pista que ocupa ahora el lugar de la quitada, o al botón de agregar si era la última.
    this.enfocar(indice < quedan ? `pista-texto-${indice}` : 'agregar-pista');
  }

  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
