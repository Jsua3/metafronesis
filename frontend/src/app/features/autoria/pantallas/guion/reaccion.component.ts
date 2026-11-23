import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { GESTOS, type Gesto } from '../../../../core/models/simulation.model';
import { CasoStore } from '../../estado/caso.store';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { ClaseRespuesta, Escena, Reaccion, Respuesta } from '../../modelo/caso';
import { EXPRESIONES } from '../../modelo/escenario';
import { NOMBRE_GESTO, problemaDeLaFrase } from '../../modelo/frase';
import { NOMBRE_EXPRESION } from '../../modelo/textos';

/** El gesto que hace el personaje si la docente no elige uno: el de la clase de la respuesta. */
const GESTO_DE_CLASE: Record<ClaseRespuesta, Gesto> = {
  RECOMMENDED: 'se-acerca', ACCEPTABLE: 'asiente', RISKY: 'baja-la-mirada', CONTRAINDICATED: 'se-aparta',
};

/**
 * «Cómo reacciona»: lo que hace el personaje cuando el estudiante elige una respuesta: una frase, su cara, su gesto y quién reacciona.
 * Todo es opcional; lo que se deja en blanco se decide solo (cara según cómo quede la persona, gesto de la clase, quien habla en la
 * escena). Emite la reacción completa; el almacén quita las claves vacías.
 */
@Component({
  selector: 'app-reaccion',
  imports: [AutoAltoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="reaccion" [id]="idBase()" tabindex="-1" [attr.aria-describedby]="idBase() + '-ayuda'">
      <legend>Cómo reacciona</legend>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <p [id]="idBase() + '-ayuda'" class="texto-secundario nota">Lo que hace el personaje cuando el estudiante elige esta respuesta. Si no escribes nada, solo cambia su cara y hace el gesto de su clase.</p>

      <label [for]="idBase() + '-linea'" class="etiqueta">Lo que dice</label>
      <textarea autoAlto [id]="idBase() + '-linea'" class="campo" rows="1" [value]="frase()"
                [attr.aria-invalid]="problema() ? 'true' : null"
                [attr.aria-describedby]="problema() ? idBase() + '-problema' : null"
                (change)="guardarFrase($any($event.target).value)"></textarea>
      @if (problema(); as p) {
        <p [id]="idBase() + '-problema'" role="alert" class="texto-secundario nota problema"><span aria-hidden="true">✕</span> {{ p }}</p>
      }

      <div class="tres-campos">
        <div class="campo-col">
          <label [for]="idBase() + '-cara'" class="etiqueta">Cara</label>
          <select [id]="idBase() + '-cara'" class="campo" (change)="elegirCara($any($event.target).value)">
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <option value="" [selected]="!reaccion().emocion">Según cómo quede la persona</option>
            @for (x of expresiones; track x) { <option [value]="x" [selected]="reaccion().emocion === x">{{ nombreExpresion[x] }}</option> }
          </select>
        </div>
        <div class="campo-col">
          <label [for]="idBase() + '-gesto'" class="etiqueta">Gesto</label>
          <select [id]="idBase() + '-gesto'" class="campo" (change)="elegirGesto($any($event.target).value)">
            <option value="" [selected]="!reaccion().gesto">{{ gestoPorDefecto() }}</option>
            @for (g of gestos; track g) { <option [value]="g" [selected]="reaccion().gesto === g">{{ nombreGesto[g] }}</option> }
          </select>
        </div>
        <div class="campo-col">
          <label [for]="idBase() + '-quien'" class="etiqueta">Quién reacciona</label>
          <select [id]="idBase() + '-quien'" class="campo" (change)="elegirPersonaje($any($event.target).value)">
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <option value="" [selected]="!reaccion().personaje">Quien habla en la escena</option>
            @for (p of quienes(); track p.id) { <option [value]="p.id" [selected]="reaccion().personaje === p.id">{{ p.nombre }}</option> }
          </select>
        </div>
      </div>

      <div class="vista" [id]="idBase() + '-vista'">
        @if (reaccion().emocion; as cara) {
          <img class="pixel" [src]="retrato()" [alt]="'Cara: ' + nombreCara(cara)" width="72" height="72" />
        } @else {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p class="texto-secundario nota">Su cara dependerá de cómo quede la persona</p>
        }
      </div>
    </fieldset>
  `,
  styles: `
    .reaccion { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 12px; border: 1px solid var(--linea); border-radius: var(--radio-control); background: var(--fondo-hundido); }
    legend { font-weight: 700; font-size: var(--autoria-texto-14); color: var(--texto-secundario); padding: 0 4px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-14); }
    .campo { min-height: 44px; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); line-height: 24px; border: 1px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; }
    textarea.campo { resize: none; }
    .nota { margin: 0; font-size: var(--autoria-texto-14); line-height: 20px; }
    .problema { color: var(--peligro); }
    .tres-campos { display: flex; flex-wrap: wrap; gap: 12px; }
    .campo-col { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; min-width: 0; }
    .vista { display: flex; align-items: center; min-height: 72px; }
    .vista img { border-radius: 6px; background: var(--juego-fondo); }
  `,
})
export class ReaccionComponent {
  readonly respuesta = input.required<Respuesta>();
  readonly escena = input.required<Escena>();
  readonly idBase = input.required<string>();
  /** La reacción completa tras el cambio; el almacén quita las claves vacías. */
  readonly cambio = output<Reaccion>();

  private readonly store = inject(CasoStore);
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly gestos = GESTOS;
  protected readonly nombreGesto = NOMBRE_GESTO;

  protected readonly reaccion = computed<Reaccion>(() => this.respuesta().reaccion ?? {});
  /** Lo que hay en el campo de la frase; vuelve a lo guardado cuando cambia la respuesta. */
  protected readonly frase = linkedSignal(() => this.reaccion().linea ?? '');
  protected readonly problema = signal<string | null>(null);

  protected readonly gestoPorDefecto = computed(() => {
    const clase = this.respuesta().clase;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (!clase) return 'El de su clase';
    const nombre = NOMBRE_GESTO[GESTO_DE_CLASE[clase]].toLowerCase();
    return `El de su clase: ${nombre}`;
  });

  /** Las personas de la sala de la escena; si la reacción nombra a otra (un caso importado), también sale para no perderla. */
  protected readonly quienes = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const sala = caso.salas.find((s) => s.id === this.escena().salaId);
    const ids = [...new Set((sala?.personajes ?? []).map((p) => p.ref))];
    const elegido = this.reaccion().personaje;
    if (elegido && !ids.includes(elegido)) ids.push(elegido);
    return ids.map((id) => ({ id, nombre: caso.personajes.find((p) => p.id === id)?.nombre ?? id }));
  });

  /** El retrato de quien reacciona (el elegido o, si no, quien habla primero en la escena) con la cara elegida. */
  protected readonly retrato = computed(() => {
    const caso = this.store.caso();
    const cara = this.reaccion().emocion;
    const id = this.reaccion().personaje ?? this.escena().lineas[0]?.personajeId;
    const receta = caso?.personajes.find((p) => p.id === id)?.recipeId ?? 'sin-receta';
    return rutaRetrato(receta, cara ?? 'neutral');
  });

  protected nombreCara(cara: string): string {
    return NOMBRE_EXPRESION[cara as keyof typeof NOMBRE_EXPRESION].toLowerCase();
  }

  protected guardarFrase(valor: string): void {
    const texto = valor.trim();
    const problema = problemaDeLaFrase(texto);
    this.problema.set(problema);
    if (problema) return; // el campo conserva lo escrito para que la docente lo corrija
    this.frase.set(texto);
    if (texto !== (this.reaccion().linea ?? '')) this.emitir({ linea: texto });
  }

  protected elegirCara(valor: string): void {
    this.emitir({ emocion: valor === '' ? undefined : (valor as Reaccion['emocion']) });
  }

  protected elegirGesto(valor: string): void {
    this.emitir({ gesto: valor === '' ? undefined : (valor as Gesto) });
  }

  protected elegirPersonaje(valor: string): void {
    this.emitir({ personaje: valor === '' ? undefined : valor });
  }

  private emitir(cambios: Partial<Reaccion>): void {
    this.cambio.emit({ ...this.reaccion(), ...cambios });
  }
}
