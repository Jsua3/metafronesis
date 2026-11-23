import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { CondicionFinal, Final, Hito } from '../../modelo/caso';
import { describirCondicion } from '../../modelo/condiciones';
import {
  type ParteDeCondicion, type TipoDeParte, condicionDePartes, parteNueva, partesDeCondicion,
} from '../../modelo/partes-de-condicion';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS } from '../../modelo/persona';

/** Las frases que el editor sabe armar; una condición que no es una lista de ellas se conserva tal cual. */
const TIPOS_DE_FRASE: { tipo: TipoDeParte; nombre: string }[] = [
  { tipo: 'hito', nombre: 'Si cumplió el hito' },
  { tipo: 'sin-hito', nombre: 'Si no cumplió el hito' },
  { tipo: 'contraindicadas', nombre: 'Si eligió respuestas contraindicadas' },
  { tipo: 'ninguna-contraindicada', nombre: 'Si no eligió ninguna respuesta contraindicada' },
  { tipo: 'riesgo', nombre: 'Si eligió respuestas con riesgo' },
  { tipo: 'persona', nombre: 'Si la persona terminó' },
];

type PartePersona = Extract<ParteDeCondicion, { tipo: 'persona' }>;

/**
 * «El final … llega cuando…»: la condición de un final propio dicha en frases unidas por «y» (tablero 28), con la frase
 * entera en palabras debajo. Una condición que el editor no sabe partir en frases («o», comparaciones) se muestra en
 * palabras y se conserva tal cual. Salió de `finales.component.ts` (E5) para que la pantalla solo ordene y pinte.
 *
 * Patrón: pieza de presentación con su lógica pura (`partes-de-condicion.ts`); avisa la condición nueva y quien la usa la
 * guarda en el store.
 */
@Component({
  selector: 'app-condicion-del-final',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="condicion">
      <legend>El final «{{ final().nombre }}» llega cuando…</legend>
      @if (partes(); as lista) {
        @if (lista.length === 0) {
          <div class="frase">
            <select class="campo" aria-label="Tipo de condición" (change)="cambiarTipo(lista, 0, $any($event.target).value)">
              @for (t of tipos; track t.tipo) { <option [value]="t.tipo" [disabled]="!hitos().length && (t.tipo === 'hito' || t.tipo === 'sin-hito')">{{ t.nombre }}</option> }
              <option value="ninguna" selected>Ninguna condición en particular</option>
            </select>
          </div>
        }
        @for (p of lista; track $index; let j = $index) {
          <div class="frase">
            @if (j > 0) { <span class="y" aria-hidden="true">y</span> }
            <select class="campo" [attr.aria-label]="etiqueta('Tipo de condición', j, lista.length)" (change)="cambiarTipo(lista, j, $any($event.target).value)">
              @for (t of tipos; track t.tipo) { <option [value]="t.tipo" [selected]="p.tipo === t.tipo" [disabled]="!hitos().length && (t.tipo === 'hito' || t.tipo === 'sin-hito')">{{ t.nombre }}</option> }
              @if (lista.length === 1) { <option value="ninguna">Ninguna condición en particular</option> }
            </select>
            @switch (p.tipo) {
              @case ('hito') {
                <select class="campo" [attr.aria-label]="etiqueta('Hito', j, lista.length)" (change)="fijar(lista, j, { tipo: 'hito', clave: $any($event.target).value })">
                  @if (!existeHito(p.clave)) { <option value="" selected disabled>Elige un hito (el anterior ya no está)</option> }
                  @for (h of hitos(); track h.clave) { <option [value]="h.clave" [selected]="p.clave === h.clave">{{ h.nombre }}</option> }
                </select>
              }
              @case ('sin-hito') {
                <select class="campo" [attr.aria-label]="etiqueta('Hito', j, lista.length)" (change)="fijar(lista, j, { tipo: 'sin-hito', clave: $any($event.target).value })">
                  @if (!existeHito(p.clave)) { <option value="" selected disabled>Elige un hito (el anterior ya no está)</option> }
                  @for (h of hitos(); track h.clave) { <option [value]="h.clave" [selected]="p.clave === h.clave">{{ h.nombre }}</option> }
                </select>
              }
              @case ('contraindicadas') {
                <select class="campo" [attr.aria-label]="etiqueta('Cuántas', j, lista.length)" (change)="fijar(lista, j, { tipo: 'contraindicadas', n: +$any($event.target).value })">
                  @for (n of cantidades; track n) { <option [value]="n" [selected]="p.n === n">al menos {{ n }}</option> }
                </select>
              }
              @case ('riesgo') {
                <select class="campo" [attr.aria-label]="etiqueta('Cuántas', j, lista.length)" (change)="fijar(lista, j, { tipo: 'riesgo', n: +$any($event.target).value })">
                  @for (n of cantidades; track n) { <option [value]="n" [selected]="p.n === n">al menos {{ n }}</option> }
                </select>
              }
              @case ('persona') {
                <select class="campo" [attr.aria-label]="etiqueta('Cómo termina el vínculo', j, lista.length)" (change)="cambiarPersona($event, lista, j, p, 'bond')">
                  <option value="" [selected]="!p.bond">Cualquiera</option>
                  @for (v of vinculos; track v.valor) { <option [value]="v.valor" [selected]="p.bond === v.valor">{{ v.nombre }}</option> }
                </select>
                <select class="campo" [attr.aria-label]="etiqueta('Cómo termina la activación', j, lista.length)" (change)="cambiarPersona($event, lista, j, p, 'activation')">
                  <option value="" [selected]="!p.activation">Cualquiera</option>
                  @for (v of activaciones; track v.valor) { <option [value]="v.valor" [selected]="p.activation === v.valor">{{ v.nombre }}</option> }
                </select>
              }
            }
            <button type="button" class="boton cuadrado peligro" [attr.aria-label]="etiqueta('Quitar la condición', j, lista.length)" (click)="quitar(lista, j)">✕</button>
          </div>
        }
        @if (lista.length > 0) {
          <button type="button" class="boton agregar-condicion" (click)="agregar(lista)">Agregar otra condición (y…)</button>
        }
        @if (final().condicion) {
          <p class="texto-secundario en-palabras">El estudiante {{ describir(final().condicion) }}.</p>
        }
      } @else {
        <p><strong>Una condición combinada</strong></p>
        <p class="texto-secundario en-palabras">El estudiante {{ describir(final().condicion) }}. Esta condición se conserva como está.</p>
      }
    </fieldset>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    /* Un fieldset no se encoge por debajo de su contenido (min-inline-size: min-content): con una opción larga en el
       selector, la condición desbordaba la tarjeta y la página entera en un teléfono (390 px). */
    .condicion { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-inline-size: 0; margin: 0.375rem 0 0; padding: 0; border: 0; }
    .condicion legend { margin-block-end: 0.25rem; padding: 0; font-weight: 700; font-size: var(--autoria-texto-16); }
    .condicion p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .frase { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; inline-size: 100%; min-inline-size: 0; }
    .frase .y { font-weight: 700; }
    .campo { max-inline-size: 100%; min-block-size: 2.75rem; padding: 0 0.75rem; font: inherit; font-size: var(--autoria-texto-16); }
    .cuadrado { inline-size: 2.75rem; padding: 0; }
    .peligro { color: var(--peligro); }
    .en-palabras { inline-size: 100%; }
  `,
})
export class CondicionDelFinalComponent {
  readonly final = input.required<Final>();
  readonly hitos = input.required<readonly Hito[]>();
  /** La condición nueva (o `null`: sin condición en particular). */
  readonly cambiar = output<CondicionFinal | null>();

  protected readonly tipos = TIPOS_DE_FRASE;
  protected readonly cantidades = [1, 2, 3, 4, 5];
  protected readonly vinculos = Object.entries(VINCULO_EN_PALABRAS).map(([valor, nombre]) => ({ valor, nombre }));
  protected readonly activaciones = Object.entries(ACTIVACION_EN_PALABRAS).map(([valor, nombre]) => ({ valor, nombre }));

  /** Las frases de la condición; `null` si el editor no sabe mostrarla en frases (se conserva como está). */
  protected readonly partes = computed(() => partesDeCondicion(this.final().condicion));

  /** «Hito», «Hito 2»…: con una sola frase el nombre va solo; con varias, numerado. */
  protected etiqueta(base: string, indice: number, total: number): string {
    return total > 1 ? `${base} ${indice + 1}` : base;
  }

  protected existeHito(clave: string): boolean {
    return this.hitos().some((h) => h.clave === clave);
  }

  protected describir(c: CondicionFinal | null): string {
    return describirCondicion(c, [...this.hitos()]);
  }

  private guardar(partes: ParteDeCondicion[]): void {
    this.cambiar.emit(condicionDePartes(partes));
  }

  /** Cambiar el tipo de una frase la reemplaza por una nueva de ese tipo; «Ninguna condición» quita todas. */
  protected cambiarTipo(partes: ParteDeCondicion[], indice: number, tipo: string): void {
    if (tipo === 'ninguna') {
      this.guardar([]);
      return;
    }
    const nueva = parteNueva(tipo as TipoDeParte, [...this.hitos()]);
    if (!nueva) return;
    // El primer hito decisivo es la mejor primera elección para «cumplió el hito».
    const decisivo = this.hitos().find((h) => h.decisivo);
    if ((nueva.tipo === 'hito' || nueva.tipo === 'sin-hito') && decisivo) nueva.clave = decisivo.clave;
    this.guardar(partes.length ? partes.map((p, j) => (j === indice ? nueva : p)) : [nueva]);
  }

  protected fijar(partes: ParteDeCondicion[], indice: number, nueva: ParteDeCondicion): void {
    this.guardar(partes.map((p, j) => (j === indice ? nueva : p)));
  }

  protected cambiarPersona(evento: Event, partes: ParteDeCondicion[], indice: number, actual: PartePersona, eje: 'bond' | 'activation'): void {
    const campo = evento.target as HTMLSelectElement;
    const nueva = { ...actual, [eje]: campo.value || undefined } as PartePersona;
    if (!nueva.bond && !nueva.activation) {
      campo.value = actual[eje] ?? ''; // una condición sobre la persona dice al menos una cosa
      return;
    }
    this.fijar(partes, indice, nueva);
  }

  protected quitar(partes: ParteDeCondicion[], indice: number): void {
    this.guardar(partes.filter((_, j) => j !== indice));
  }

  /** La segunda frase nace como «no eligió ninguna contraindicada»: lo que más se pide junto a un hito cumplido. */
  protected agregar(partes: ParteDeCondicion[]): void {
    this.guardar([...partes, { tipo: 'ninguna-contraindicada' }]);
  }
}
