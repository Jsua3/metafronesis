import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GESTOS, type Gesto } from '../../../../core/models/simulation.model';
import { CasoStore, MAX_COMENTARIOS } from '../../estado/caso.store';
import { DeshacerBorrado } from '../../marco/deshacer-borrado';
import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { Comentario, Escena } from '../../modelo/caso';
import { EXPRESIONES } from '../../modelo/escenario';
import { NOMBRE_GESTO, problemaDeLaFrase } from '../../modelo/frase';
import { NOMBRE_EXPRESION } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { SelectorCondicionComponent } from './selector-condicion.component';

// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
const AYUDA_CUANDO = 'Marca lo que el estudiante debe haber hecho en esta sala para que lo diga. Si marcas varias cosas, tienen que cumplirse todas.';

interface ItemComentario {
  /** La posición en `escena.comentarios`, la del documento (la del ancla `comentario-<k>`). */
  k: number;
  comentario: Comentario;
  /** Los comentarios de la misma persona, de dos en dos: para subir y bajar sin saltar a los de otra. */
  esPrimero: boolean;
  esUltimo: boolean;
  anterior: number | null;
  siguiente: number | null;
}

interface FraseInvalida { texto: string; problema: string }

interface GrupoPersona {
  /** La clave del personaje (`ref`); `null` en el grupo de quienes ya no están en la sala. */
  ref: string | null;
  nombre: string;
  items: ItemComentario[];
}

/**
 * «Lo que dicen al acercarte»: frases cortas que un personaje dice cuando el estudiante se le acerca, con su «Cuando…» opcional, su
 * cara y su gesto. Van agrupadas por persona de la sala; el orden entre las de una misma persona es el del documento. Se guarda al
 * salir de cada campo. Un «cuando» que el editor no sabe armar (un hito, un «alguna de estas»…) lo conserva el selector.
 */
@Component({
  selector: 'app-comentarios',
  imports: [RouterLink, SelectorCondicionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="comentarios-titulo" aria-describedby="comentarios-ayuda" class="bloque">
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      @if (conTitulo()) { <h2 id="comentarios-titulo" tabindex="-1">Lo que dicen al acercarte</h2> }
      <p id="comentarios-ayuda" class="texto-secundario nota">Frases cortas que un personaje dice cuando el estudiante se le acerca. No cambian la evaluación. Se dicen una vez, en este orden.</p>

      @if (grupos().length === 0) {
        <p class="texto-secundario nota">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          En esta sala no hay nadie que pueda comentar. Agrega una persona en la sala.
        </p>
        @if (escena().salaId) { <a class="boton" [routerLink]="rutas.a('/editor/sala', escena().salaId!)">Abrir sala</a> }
      }

      @for (g of grupos(); track g.ref ?? 'ausentes'; let gi = $index) {
        <div role="group" class="grupo" [attr.aria-labelledby]="'comentarios-g-' + gi" [attr.data-grupo]="g.ref === null ? 'ausentes' : null">
          <h3 [id]="'comentarios-g-' + gi" class="grupo-titulo">
            @if (g.ref === null) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              Personas que ya no están en esta sala
            } @else { {{ g.nombre }} }
          </h3>
          @for (it of g.items; track it.k) {
            <div class="tarjeta comentario" [id]="'comentario-' + it.k" tabindex="-1">
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <strong>Comentario {{ it.k + 1 }}</strong>
              @if (g.ref === null) {
                <p class="texto-secundario nota aviso"><span aria-hidden="true">▲</span> {{ nombreDe(it.comentario.personaje) }} ya no está en esta sala: este comentario no se dirá.</p>
              }

              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <label [for]="'comentario-' + it.k + '-texto'" class="etiqueta">Lo que dice {{ nombreDe(it.comentario.personaje) }}</label>
              <input type="text" class="campo" [id]="'comentario-' + it.k + '-texto'" [value]="invalidas()[it.k]?.texto ?? it.comentario.linea"
                     [attr.aria-invalid]="invalidas()[it.k] ? 'true' : null"
                     [attr.aria-describedby]="invalidas()[it.k] ? 'comentario-' + it.k + '-problema' : null"
                     (change)="guardarFrase(it.k, $any($event.target).value)" />
              @if (invalidas()[it.k]?.problema; as p) {
                <p [id]="'comentario-' + it.k + '-problema'" role="alert" class="texto-secundario nota problema"><span aria-hidden="true">✕</span> {{ p }}</p>
              } @else if (!it.comentario.linea) {
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p class="texto-secundario nota">Escribe lo que dice; un comentario vacío no se dirá.</p>
              }

              <app-selector-condicion [condicion]="it.comentario.cuando" [salaId]="escena().salaId" leyenda="Cuando…" vacio="La primera vez que se acerque"
                                      [ayuda]="ayudaCuando" [idBase]="'comentario-' + it.k + '-cuando'" (cambio)="cambiarCuando(it.k, $event)" />

              <div class="dos-campos">
                <div class="campo-col">
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <label [for]="'comentario-' + it.k + '-cara'" class="etiqueta">Cara</label>
                  <select [id]="'comentario-' + it.k + '-cara'" class="campo" (change)="elegirCara(it.k, $any($event.target).value)">
                    <option value="" [selected]="!it.comentario.emocion">Según cómo quede la persona</option>
                    @for (x of expresiones; track x) { <option [value]="x" [selected]="it.comentario.emocion === x">{{ nombreExpresion[x] }}</option> }
                  </select>
                </div>
                <div class="campo-col">
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <label [for]="'comentario-' + it.k + '-gesto'" class="etiqueta">Gesto</label>
                  <select [id]="'comentario-' + it.k + '-gesto'" class="campo" (change)="elegirGesto(it.k, $any($event.target).value)">
                    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                    <option value="" [selected]="!it.comentario.gesto">Sin gesto: solo voltea</option>
                    @for (g2 of gestos; track g2) { <option [value]="g2" [selected]="it.comentario.gesto === g2">{{ nombreGesto[g2] }}</option> }
                  </select>
                </div>
              </div>

              <div class="vista" [id]="'comentario-' + it.k + '-vista'">
                @if (it.comentario.emocion; as cara) {
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <img class="pixel" [src]="retrato(it.comentario)" [alt]="'Cara: ' + nombreCara(cara)" width="72" height="72" />
                } @else {
                  <p class="texto-secundario nota">Su cara dependerá de cómo quede la persona</p>
                }
              </div>

              <div class="acciones">
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton" [id]="'comentario-' + it.k + '-subir'" [attr.aria-label]="'Subir el comentario ' + (it.k + 1)"
                        [attr.aria-disabled]="it.esPrimero ? 'true' : null" (click)="!it.esPrimero && mover(it.k, it.anterior!, 'subir')">Subir</button>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton" [id]="'comentario-' + it.k + '-bajar'" [attr.aria-label]="'Bajar el comentario ' + (it.k + 1)"
                        [attr.aria-disabled]="it.esUltimo ? 'true' : null" (click)="!it.esUltimo && mover(it.k, it.siguiente!, 'bajar')">Bajar</button>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton peligro" [id]="'comentario-' + it.k + '-quitar'" [attr.aria-label]="'Quitar el comentario ' + (it.k + 1)"
                        (click)="quitar(it.k)">Quitar</button>
              </div>
            </div>
          }
          @if (g.ref !== null && pendiente()?.ref === g.ref) {
            <!-- Un comentario nuevo vive aquí hasta que tiene una frase válida; entonces entra al caso. -->
            <div class="tarjeta comentario" [id]="'comentario-' + nuevoK()" tabindex="-1">
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <strong>Comentario {{ nuevoK() + 1 }}</strong>
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <label [for]="'comentario-' + nuevoK() + '-texto'" class="etiqueta">Lo que dice {{ g.nombre }}</label>
              <input type="text" class="campo" [id]="'comentario-' + nuevoK() + '-texto'"
                     [attr.aria-invalid]="problemaNuevo() ? 'true' : null"
                     [attr.aria-describedby]="problemaNuevo() ? 'comentario-' + nuevoK() + '-problema' : 'comentario-' + nuevoK() + '-nota'"
                     (change)="guardarNuevo($any($event.target).value)" />
              @if (problemaNuevo(); as p) {
                <p [id]="'comentario-' + nuevoK() + '-problema'" role="alert" class="texto-secundario nota problema"><span aria-hidden="true">✕</span> {{ p }}</p>
              } @else {
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p [id]="'comentario-' + nuevoK() + '-nota'" class="texto-secundario nota">Escribe lo que dice; se agrega al salir del campo.</p>
              }
              <div class="acciones">
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <button type="button" class="boton peligro" [attr.aria-label]="'Quitar el comentario ' + (nuevoK() + 1)" (click)="descartarNuevo(gi)">Quitar</button>
              </div>
            </div>
          }
          @if (g.ref !== null) {
            <button type="button" class="boton" [id]="'comentarios-agregar-' + gi" [attr.aria-disabled]="enElTope() ? 'true' : null"
                    [attr.aria-describedby]="enElTope() ? 'comentarios-tope' : null" (click)="!enElTope() && agregar(g.ref)">Agregar lo que dice {{ g.nombre }}</button>
          }
        </div>
      }
      @if (enElTope()) {
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <p id="comentarios-tope" class="texto-secundario nota"><span aria-hidden="true">▲</span> Ya hay 6 comentarios en esta escena: quita uno para agregar otro.</p>
      }
    </section>
  `,
  styles: `
    .bloque { display: flex; flex-direction: column; gap: 12px; }
    .grupo { display: flex; flex-direction: column; gap: 12px; }
    .grupo-titulo { margin: 0; font-size: var(--autoria-texto-16); font-weight: 700; }
    .comentario { display: flex; flex-direction: column; gap: 8px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { min-height: 44px; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); line-height: 24px; border: 1px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; }
    .nota { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .problema { color: var(--peligro); }
    .dos-campos { display: flex; flex-wrap: wrap; gap: 12px; }
    .campo-col { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; min-width: 0; }
    .vista { display: flex; align-items: center; min-height: 72px; }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .peligro { color: var(--peligro); }
  `,
})
export class ComentariosComponent {
  readonly escena = input.required<Escena>();
  /**
   * Dentro del guion el bloque va plegado y su botón hace de título (con el mismo id, `comentarios-titulo`, que nombra la
   * sección y recibe el foco): entonces aquí no se repite.
   */
  readonly conTitulo = input(true);

  private readonly store = inject(CasoStore);
  private readonly deshacer = inject(DeshacerBorrado);
  protected readonly rutas = inject(RutasAutoria);
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly gestos: readonly Gesto[] = GESTOS;
  protected readonly nombreGesto = NOMBRE_GESTO;
  protected readonly ayudaCuando = AYUDA_CUANDO;

  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly escenaId = computed(() => this.escena().id);

  /**
   * Las frases que no pasaron la validación, por posición: lo escrito (para que la docente lo corrija sin perderlo) y por qué no se
   * guardó. Siguen a su comentario cuando otro sube, baja o se quita, y se vacían al cambiar de escena.
   */
  protected readonly invalidas = linkedSignal<Record<number, FraseInvalida>>(() => { this.escenaId(); return {}; });

  /** El comentario que se está escribiendo y todavía no tiene frase válida: no entra al caso (ni con la frase vacía). */
  protected readonly pendiente = linkedSignal<{ ref: string } | null>(() => { this.escenaId(); return null; });
  protected readonly problemaNuevo = linkedSignal<string | null>(() => { this.escenaId(); return null; });

  private readonly lista = computed<Comentario[]>(() => this.escena().comentarios ?? []);
  protected readonly enElTope = computed(() => this.lista().length >= MAX_COMENTARIOS);
  /** La posición que tendrá el comentario nuevo en el documento: la misma que le pone el servidor. */
  protected readonly nuevoK = computed(() => this.lista().length);

  /** Las personas de la sala (sin repetir, en el orden de la sala) y, al final, quienes ya no están pero aún tienen comentarios. */
  protected readonly grupos = computed<GrupoPersona[]>(() => {
    const caso = this.store.caso();
    const sala = caso?.salas.find((s) => s.id === this.escena().salaId);
    const refs = [...new Set((sala?.personajes ?? []).map((p) => p.ref))];
    const lista = this.lista();
    const itemsDe = (pertenece: (ref: string) => boolean): ItemComentario[] => {
      const posiciones = lista.flatMap((c, k) => (pertenece(c.personaje) ? [k] : []));
      return posiciones.map((k, i) => ({
        k, comentario: lista[k], esPrimero: i === 0, esUltimo: i === posiciones.length - 1,
        anterior: posiciones[i - 1] ?? null, siguiente: posiciones[i + 1] ?? null,
      }));
    };
    const grupos: GrupoPersona[] = refs.map((ref) => ({ ref, nombre: this.nombreDe(ref), items: itemsDe((r) => r === ref) }));
    const ausentes = itemsDe((r) => !refs.includes(r));
    if (ausentes.length) grupos.push({ ref: null, nombre: '', items: ausentes });
    return grupos;
  });

  protected nombreDe(ref: string): string {
    return this.store.caso()?.personajes.find((p) => p.id === ref)?.nombre ?? ref;
  }

  protected nombreCara(cara: string): string {
    return NOMBRE_EXPRESION[cara as keyof typeof NOMBRE_EXPRESION].toLowerCase();
  }

  protected retrato(c: Comentario): string {
    const receta = this.store.caso()?.personajes.find((p) => p.id === c.personaje)?.recipeId ?? 'sin-receta';
    return rutaRetrato(receta, c.emocion ?? 'neutral');
  }

  protected agregar(ref: string): void {
    if (this.pendiente()) { this.enfocar(`comentario-${this.nuevoK()}-texto`); return; }
    if (this.enElTope()) return;
    this.problemaNuevo.set(null);
    this.pendiente.set({ ref });
    this.enfocar(`comentario-${this.nuevoK()}-texto`);
  }

  /** La frase del comentario nuevo: solo cuando es válida entra al caso, con la frase ya escrita. */
  protected guardarNuevo(valor: string): void {
    const pendiente = this.pendiente();
    if (!pendiente) return;
    const texto = valor.trim();
    if (!texto) { this.problemaNuevo.set(null); return; }
    const problema = problemaDeLaFrase(texto);
    this.problemaNuevo.set(problema);
    if (problema) return; // el campo conserva lo escrito para que la docente lo corrija
    const k = this.nuevoK();
    this.pendiente.set(null);
    this.guardar([...this.lista(), { personaje: pendiente.ref, linea: texto }]);
    this.enfocar(`comentario-${k}-texto`);
  }

  protected descartarNuevo(gi: number): void {
    this.pendiente.set(null);
    this.problemaNuevo.set(null);
    this.enfocar(`comentarios-agregar-${gi}`);
  }

  /** Saca el comentario; el foco va al siguiente de la misma persona o, si no hay, a su botón de agregar. */
  protected quitar(k: number): void {
    const grupos = this.grupos();
    const gi = grupos.findIndex((g) => g.items.some((it) => it.k === k));
    const siguiente = grupos[gi]?.items.find((it) => it.k === k)?.siguiente ?? null;
    this.invalidas.update((todas) => this.reubicar(todas, (pos) => (pos === k ? null : pos > k ? pos - 1 : pos)));
    // Nada del caso apunta a una frase: se quita al instante y el marco ofrece «Deshacer» durante 8 s (EDITOR.md §4.6).
    this.deshacer.comentario(this.escena().id, k);
    if (siguiente !== null) this.enfocar(`comentario-${siguiente - 1}-texto`);
    else this.enfocar(grupos[gi]?.ref != null ? `comentarios-agregar-${gi}` : 'comentarios-titulo');
  }

  /** Cambia de lugar dos comentarios de la misma persona; el resto del documento queda como estaba. El foco sigue al movido. */
  protected mover(k: number, otro: number, direccion: 'subir' | 'bajar'): void {
    const nueva = [...this.lista()];
    [nueva[k], nueva[otro]] = [nueva[otro], nueva[k]];
    this.invalidas.update((todas) => this.reubicar(todas, (pos) => (pos === k ? otro : pos === otro ? k : pos)));
    this.guardar(nueva);
    this.enfocar(`comentario-${otro}-${direccion}`);
  }

  protected guardarFrase(k: number, valor: string): void {
    const texto = valor.trim();
    const problema = problemaDeLaFrase(texto);
    if (problema) {
      this.invalidas.update((todas) => ({ ...todas, [k]: { texto: valor, problema } }));
      return; // el campo conserva lo escrito para que la docente lo corrija
    }
    this.invalidas.update((todas) => { const { [k]: _, ...resto } = todas; return resto; });
    if (texto !== this.lista()[k].linea) this.cambiar(k, { linea: texto });
  }

  protected cambiarCuando(k: number, condicion: Record<string, unknown>): void {
    this.cambiar(k, { cuando: Object.keys(condicion).length ? condicion : undefined });
  }

  protected elegirCara(k: number, valor: string): void {
    this.cambiar(k, { emocion: valor === '' ? undefined : (valor as Comentario['emocion']) });
  }

  protected elegirGesto(k: number, valor: string): void {
    this.cambiar(k, { gesto: valor === '' ? undefined : (valor as Gesto) });
  }

  /** Cambia campos de un comentario; un campo en `undefined` se quita (ausente = sin cuando, sin cara, sin gesto). */
  private cambiar(k: number, cambios: Partial<Comentario>): void {
    const nuevo: Comentario = { ...this.lista()[k], ...cambios };
    for (const clave of ['cuando', 'emocion', 'gesto'] as const) if (nuevo[clave] === undefined) delete nuevo[clave];
    this.guardar(this.lista().map((c, i) => (i === k ? nuevo : c)));
  }

  private guardar(lista: Comentario[]): void {
    this.store.fijarComentarios(this.escena().id, lista);
  }

  /** Lleva cada frase inválida a su nueva posición (`null` la descarta). */
  private reubicar(todas: Record<number, FraseInvalida>, nueva: (pos: number) => number | null): Record<number, FraseInvalida> {
    const salida: Record<number, FraseInvalida> = {};
    for (const [pos, valor] of Object.entries(todas)) {
      const destino = nueva(Number(pos));
      if (destino !== null) salida[destino] = valor;
    }
    return salida;
  }

  /** Pone el foco cuando ya se dibujó el cambio. */
  private enfocar(id: string): void {
    // El título puede vivir fuera (el botón del bloque plegado del guion): si no está aquí, se busca en la página.
    afterNextRender(() => (this.raiz.nativeElement.querySelector<HTMLElement>(`#${id}`) ?? document.getElementById(id))?.focus(), { injector: this.injector });
  }
}
