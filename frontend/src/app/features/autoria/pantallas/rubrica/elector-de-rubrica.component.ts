import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

/** Una rúbrica que el caso puede adoptar: «programa» son las competencias del programa; un número, una de la biblioteca. */
export interface OpcionDeRubrica {
  id: 'programa' | number;
  nombre: string;
  detalle: string;
  /** Por qué no se puede elegir (p. ej. sus pesos no suman 100); vacía si se puede. */
  motivo: string;
}

/**
 * Elegir con qué rúbrica se valora el caso (EDITOR.md §5.3): las competencias del programa (recomendada) o una copia de una
 * rúbrica de la biblioteca. Es un grupo de botones de opción reales y un botón para confirmar; si el cambio deja sin contar
 * criterios que las respuestas ya marcan, lo dice antes, con sus nombres.
 *
 * Patrón: pieza de presentación (entradas y salidas). Quien la usa carga las opciones y calcula lo que se perdería.
 */
@Component({
  selector: 'app-elector-de-rubrica',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'cancelar.emit()' },
  template: `
    <form class="elector" (submit)="$event.preventDefault(); confirmar.emit()" aria-labelledby="elector-titulo">
      <h2 class="elector__titulo" id="elector-titulo" tabindex="-1">{{ titulo() }}</h2>
      <p class="elector__ayuda">El caso guarda su propia copia: si la rúbrica cambia después en la biblioteca, este caso no cambia.</p>
      @if (cargando()) {
        <p class="elector__estado" role="status">Cargando tus rúbricas…</p>
      }
      @if (error()) {
        <p class="elector__error" role="alert">{{ error() }}</p>
      }
      <fieldset class="opciones">
        <legend class="solo-lector">Rúbrica para el caso</legend>
        @for (o of opciones(); track o.id) {
          <label class="opcion" [class.deshabilitada]="!!o.motivo">
            <input type="radio" name="rubrica-elegida" [value]="o.id" [checked]="elegida() === o.id" [disabled]="!!o.motivo"
                   (change)="elegir.emit(o.id)" />
            <span class="opcion__texto">
              <span class="opcion__nombre">{{ o.nombre }}@if (o.id === 'programa') { <span class="pildora pildora-primaria">Recomendada</span> }</span>
              <span class="opcion__detalle">{{ o.motivo || o.detalle }}</span>
            </span>
          </label>
        }
      </fieldset>
      @if (comprobando()) {
        <p class="elector__estado" role="status">Comprobando qué criterios marcados se conservan…</p>
      }
      @if (errorComprobacion()) {
        <div class="elector__error-fila" role="alert">
          <p class="elector__error">{{ errorComprobacion() }}</p>
          <button type="button" class="boton" (click)="recomprobar.emit()">Volver a comprobar</button>
        </div>
      }
      @if (perdidas().length) {
        <p class="elector__aviso" role="note">
          <span aria-hidden="true">▲</span> {{ avisoDePerdidas() }}
        </p>
      }
      <div class="elector__acciones">
        <button type="submit" class="boton boton-primario" [attr.aria-disabled]="elegida() === null || ocupado() || comprobando() || !!errorComprobacion()">
          {{ ocupado() ? 'Guardando…' : 'Usar en el caso' }}
        </button>
        <button type="button" class="boton" (click)="cancelar.emit()">Cancelar</button>
      </div>
    </form>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .elector {
      display: flex; flex-direction: column; gap: 0.625rem; padding: 1rem; border-radius: var(--l-radio-tarjeta);
      background: var(--l-superficie); box-shadow: inset 0 0 0 2px var(--ds-primary), var(--l-sombra-trabajo);
    }
    .elector__titulo { margin: 0; font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .elector__ayuda, .elector__estado { margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .elector__error { margin: 0; color: var(--peligro); font-weight: 700; }
    .elector__error-fila { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; }
    .opciones { display: flex; flex-direction: column; gap: 0.375rem; margin: 0; padding: 0; border: 0; min-inline-size: 0; }
    .opcion {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 0.75rem; min-block-size: 2.75rem;
      padding: 0.625rem 0.75rem; border-radius: var(--l-radio-control); cursor: pointer; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte);
      transition: box-shadow var(--ds-dur-fade) var(--ds-ease-out), background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .opcion:has(input:checked) { background: var(--l-tinte); box-shadow: inset 0 0 0 2px var(--ds-primary); }
    .opcion:has(input:focus-visible) { outline: 2px solid var(--ds-focus); outline-offset: 2px; }
    .opcion.deshabilitada { cursor: default; opacity: 0.75; }
    .opcion input { inline-size: 1.25rem; block-size: 1.25rem; margin: 0.125rem 0 0; accent-color: var(--ds-primary); }
    .opcion__texto { display: flex; flex-direction: column; gap: 0.125rem; min-inline-size: 0; }
    .opcion__nombre { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-weight: 800; overflow-wrap: anywhere; }
    .opcion__detalle { color: var(--ds-text-2); font-size: var(--autoria-texto-14); line-height: 1.25rem; }
    .elector__aviso {
      margin: 0; padding: 0.625rem 0.75rem; border-radius: var(--l-radio-control); background: var(--aviso-tinte);
      color: var(--aviso-texto); font-weight: 700; line-height: 1.5rem;
    }
    .elector__acciones { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    @media (forced-colors: active) {
      .elector, .opcion { border: 1px solid CanvasText; }
      .opcion:has(input:checked) { border-width: 3px; }
    }
  `,
})
export class ElectorDeRubricaComponent {
  readonly titulo = input.required<string>();
  readonly opciones = input.required<readonly OpcionDeRubrica[]>();
  readonly elegida = input<OpcionDeRubrica['id'] | null>(null);
  readonly cargando = input(false);
  readonly ocupado = input(false);
  readonly error = input('');
  /** Los nombres de los criterios que hoy marcan respuestas y que la rúbrica elegida no tiene. */
  readonly perdidas = input<readonly string[]>([]);
  /** Cuántas respuestas marcan esos criterios. */
  readonly respuestasAfectadas = input(0);
  /** Se está averiguando qué criterios se pierden: no se confirma hasta saberlo. */
  readonly comprobando = input(false);
  readonly errorComprobacion = input('');

  readonly elegir = output<OpcionDeRubrica['id']>();
  readonly confirmar = output<void>();
  readonly cancelar = output<void>();
  readonly recomprobar = output<void>();

  protected avisoDePerdidas(): string {
    const n = this.respuestasAfectadas();
    const quien = n === 1 ? '1 respuesta marca' : `${n} respuestas marcan`;
    const nombres = this.perdidas().map((p) => `«${p}»`).join(', ');
    return `${quien} criterios que la rúbrica elegida no tiene (${nombres}). Esas marcas dejarán de contar.`;
  }

  constructor() {
    // Al abrirse, el foco va al título: el lector de pantalla anuncia qué se está eligiendo.
    const raiz: HTMLElement = inject(ElementRef).nativeElement;
    afterNextRender(() => raiz.querySelector<HTMLElement>('#elector-titulo')?.focus());
  }
}
