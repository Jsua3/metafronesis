import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, output, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiMenu, type UiMenuItem } from '../../../../shared/ui/menu/ui-menu';
import { motivoSinGuardar } from '../../estado/persistir';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import type { ClaseRespuesta, CompetenciaCaso, EfectosRespuesta, Escena, Hito, Reaccion, Respuesta } from '../../modelo/caso';
import { competenciasMarcadas, conCompetencia, conHito, conPasoDePersona, sinPasoDePersona } from '../../modelo/efectos';
import { fraseDeRespuesta, pasoDeRespuesta } from '../../modelo/persona';
import { NOMBRE_CLASE } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { ReaccionComponent } from './reaccion.component';
import { SelectorCondicionComponent } from './selector-condicion.component';

/** Las cinco facetas de una respuesta, en el orden en que se leen (§3.4.1). */
export type Faceta = 'pasos' | 'criterios' | 'persona' | 'reaccion' | 'aparece';
const FACETAS: readonly Faceta[] = ['pasos', 'criterios', 'persona', 'reaccion', 'aparece'];
const LETRAS = ['A', 'B', 'C', 'D'];

/**
 * La consecuencia de cada clase, dicha en palabras: son las reglas de `modelo/finales.ts::condicionesDePlantilla`.
 * BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
 */
const CLASES: { valor: ClaseRespuesta; simbolo: string; consecuencia: string }[] = [
  { valor: 'RECOMMENDED', simbolo: '✓', consecuencia: 'Cuenta a favor del final protector.' },
  { valor: 'ACCEPTABLE', simbolo: '✓', consecuencia: 'No cambia el final por sí sola.' },
  { valor: 'RISKY', simbolo: '▲', consecuencia: 'Tres o más dejan el riesgo abierto al final.' },
  { valor: 'CONTRAINDICATED', simbolo: '✕', consecuencia: 'Dos, o una sin cumplir los pasos decisivos, llevan al final crítico.' },
];
const PASOS_VINCULO = [{ valor: -1, nombre: 'Se cierra' }, { valor: 0, nombre: 'Sin cambio' }, { valor: 1, nombre: 'Se abre' }];
const PASOS_ACTIVACION = [{ valor: -1, nombre: 'Se calma' }, { valor: 0, nombre: 'Sin cambio' }, { valor: 1, nombre: 'Se tensa' }];

/** Una escena a la que puede llevar la respuesta, como se lee en «Lleva a…»: «N · Título». */
export interface DestinoPosible { id: string; etiqueta: string }

/**
 * La ficha de una respuesta (EDITOR.md §3.4.1). Arriba, lo que el servidor exige para guardarla (texto, clase, destino; razón
 * si es contraindicada) y lo que lee el estudiante después; abajo, cinco FACETAS en fichas que muestran su valor sin abrirse y
 * se abren de a una (abrir una cierra la otra). Así la ficha mide unos 280 px cerrada en vez de los 1.200 del formulario de
 * doce bloques, y la docente ve de un vistazo qué falta. Mientras el servidor no pueda guardarla, el borde inferior dice por
 * qué (`motivoSinGuardar`) con la marca «Solo en esta pantalla»: se acaba la sorpresa de «no se guarda».
 *
 * Patrón: pieza de presentación (SOLID, S) dentro del Composite del guion. No toca el store: emite intenciones. Los
 * cambios de efectos salen como FUNCIONES (`(efectos) => efectos`) para que el contenedor las aplique sobre la respuesta
 * vigente: dos casillas marcadas antes de que la pantalla se redibuje no se pisan.
 */
@Component({
  selector: 'app-respuesta',
  imports: [AutoAltoDirective, ReaccionComponent, RouterLink, SelectorCondicionComponent, UiMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ficha-respuesta', '[class.marca-ia]': 'respuesta().marcaIa', '(keydown)': 'alTeclear($event)' },
  template: `
    @let r = respuesta();
    @let i = indice();
    <div class="ficha__fila">
      <span class="ficha__letra" aria-hidden="true">{{ letra() }}</span>
      <label class="solo-lector" [for]="'rt' + i">Respuesta {{ i + 1 }}</label>
      <textarea autoAlto [id]="'rt' + i" class="campo ficha__texto" rows="1" [value]="r.texto" placeholder="Lo que puede responder el estudiante"
                (change)="editarTexto('texto', $any($event.target).value)"></textarea>
      <ui-menu class="ficha__mas" iconOnly [label]="'Más acciones de la respuesta ' + (i + 1)" [items]="acciones()" (itemSelected)="alElegir($event)" />
    </div>
    @if (r.marcaIa) {
      <div class="ficha__ia">
        <span class="pildora">Sugerido por la IA</span>
        <button type="button" class="boton boton-compacto" data-accion="aceptar-ia" (click)="aceptar.emit()">Aceptar respuesta</button>
        <button type="button" class="boton boton-texto boton-compacto" (click)="descartar.emit()">Descartar respuesta</button>
      </div>
    }

    <fieldset class="clasificacion" (focusin)="claseEnfocada.set(r.clase)" (focusout)="alSalirDeClase($event)">
      <legend class="solo-lector">Clasificación de la respuesta {{ i + 1 }}</legend>
      @for (c of clases; track c.valor) {
        <label class="opcion" [class]="'opcion ' + c.valor">
          <input type="radio" [name]="'rc' + r.id" [value]="c.valor" [checked]="r.clase === c.valor"
                 [attr.aria-describedby]="claseEnfocada() !== undefined ? 'rcc' + i : null"
                 (focus)="claseEnfocada.set(c.valor)" (change)="editar.emit({ clase: c.valor })" />
          <span aria-hidden="true">{{ c.simbolo }}</span> {{ nombreClase[c.valor] }}
        </label>
      }
    </fieldset>
    @if (consecuencia(); as texto) { <p class="nota consecuencia" [id]="'rcc' + i">{{ texto }}</p> }

    @if (r.clase === 'CONTRAINDICATED') {
      <div class="campo-rotulado">
        <label [for]="'rz' + i" class="rotulo">Por qué es contraindicada</label>
        <textarea autoAlto [id]="'rz' + i" class="campo" rows="1" [value]="r.razon" [attr.aria-invalid]="r.razon.trim() ? null : 'true'"
                  [attr.aria-describedby]="r.razon.trim() ? null : 'rzn' + i" (change)="editarTexto('razon', $any($event.target).value)"></textarea>
      </div>
      @if (!r.razon.trim()) {
        <p [id]="'rzn' + i" class="nota">Explica por qué esta respuesta puede hacerle daño a la persona.</p>
      }
    }

    <div class="ficha__destino">
      <label [for]="'rl' + i" class="ficha__destino-rotulo">Lleva a…</label>
      <select [id]="'rl' + i" class="campo" (change)="destino.emit($any($event.target).value)">
        <option value="" [selected]="!r.destinoId && !pendiente()">Ninguna escena todavía</option>
        @for (d of destinos(); track d.id) { <option [value]="d.id" [selected]="d.id === r.destinoId">{{ d.etiqueta }}</option> }
        <option value="nueva" [selected]="pendiente()">Una escena nueva</option>
      </select>
    </div>
    @if (pendiente()) {
      <div class="acciones">
        <button type="button" class="boton boton-secundario crear-escena-nueva" (click)="crearEscena.emit()">Crear la escena nueva</button>
        <span class="nota">Elegir en la lista no crea nada; el botón sí.</span>
      </div>
    }
    @if (creada(); as c) {
      <div role="group" aria-label="Escena creada" class="creada">
        <p>Se creó «{{ c.titulo }}», conectada a la respuesta {{ i + 1 }}. Usa la misma sala que esta escena; puedes cambiarla después.</p>
        <a class="boton boton-compacto" [routerLink]="rutas.a('/editor/escena', c.escenaId)">Abrir su guion</a>
      </div>
    }

    <div class="campo-rotulado">
      <label [for]="'rf' + i" class="rotulo">Lo que lee el estudiante después de elegir</label>
      <textarea autoAlto [id]="'rf' + i" class="campo" rows="1" [value]="r.retroalimentacion"
                (change)="editarTexto('retroalimentacion', $any($event.target).value)"></textarea>
    </div>

    <!-- Las cinco facetas: el valor se lee sin abrir; abrir una cierra la otra (grupo de revelado). -->
    <div class="facetas" role="group" [attr.aria-label]="'Detalles de la respuesta ' + (i + 1)">
      @for (f of facetas; track f) {
        <button type="button" class="faceta" [attr.aria-expanded]="abierta(f)" [attr.aria-controls]="'faceta-' + f + '-' + r.id"
                [id]="'faceta-boton-' + f + '-' + r.id" (click)="alternar(f)">
          <span class="faceta__nombre">{{ nombreFaceta[f] }}</span><span class="faceta__valor">{{ valor()[f] }}</span>
        </button>
      }
      <!-- «Llévame ahí» enfoca anclas que viven dentro de una faceta cerrada: estas marcas las reciben y la abren. -->
      @for (a of anclasCerradas(); track a.id) {
        <span class="ancla-plegada" [id]="a.id" tabindex="-1" (focus)="abrirDesdeAncla(a.faceta, a.id)"></span>
      }
    </div>

    @if (abierta('pasos')) {
      <fieldset class="faceta-panel hitos" [id]="'faceta-pasos-' + r.id">
        <legend>Pasos profesionales que cumple</legend>
        @for (h of hitos(); track h.clave) {
          <label class="casilla">
            <input type="checkbox" [checked]="r.efectos.hitos?.includes(h.clave) ?? false"
                   (change)="efectos.emit(conHitoFn(h.clave, $any($event.target).checked))" />
            {{ h.nombre }}
          </label>
        } @empty {
          <p class="nota">Este caso todavía no tiene pasos profesionales.</p>
        }
      </fieldset>
    }
    @if (abierta('criterios')) {
      <fieldset class="faceta-panel competencias" [id]="'competencias-' + r.id" tabindex="-1">
        <legend>Criterios de la rúbrica que evidencia (uno o dos)</legend>
        @for (c of competencias(); track c.codigo) {
          <label class="casilla">
            <input type="checkbox" [checked]="marcadas().includes(c.codigo)"
                   (change)="efectos.emit(conCompetenciaFn(c.codigo, $any($event.target).checked))" />
            {{ c.nombre }}
          </label>
        } @empty {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p class="nota">Este caso aún no tiene rúbrica propia. Elígela en <a [routerLink]="rutas.a('/editor/rubrica')">Evaluación</a>.</p>
        }
      </fieldset>
    }
    @if (abierta('persona')) {
      <fieldset class="faceta-panel persona" [id]="'faceta-persona-' + r.id">
        <legend>Qué le pasa a la persona después de esta respuesta</legend>
        <label class="opcion-simple">
          <input type="radio" [name]="'pm' + r.id" value="automatica" [checked]="!r.efectos.persona" (change)="efectos.emit(sinPaso)" />
          Automático: según la clase
        </label>
        <label class="opcion-simple">
          <input type="radio" [name]="'pm' + r.id" value="propia" [checked]="!!r.efectos.persona" (change)="efectos.emit(pasoPropio)" />
          Lo elijo yo
        </label>
        @if (r.efectos.persona; as paso) {
          <div class="dos-campos">
            <div class="campo-col">
              <label [for]="'pv' + i" class="rotulo-simple">Vínculo</label>
              <select [id]="'pv' + i" class="campo" (change)="efectos.emit(conPasoFn('bond', $any($event.target).value))">
                @for (o of pasosVinculo; track o.valor) { <option [value]="o.valor" [selected]="(paso.bond ?? 0) === o.valor">{{ o.nombre }}</option> }
              </select>
            </div>
            <div class="campo-col">
              <label [for]="'pa' + i" class="rotulo-simple">Activación</label>
              <select [id]="'pa' + i" class="campo" (change)="efectos.emit(conPasoFn('activation', $any($event.target).value))">
                @for (o of pasosActivacion; track o.valor) { <option [value]="o.valor" [selected]="(paso.activation ?? 0) === o.valor">{{ o.nombre }}</option> }
              </select>
            </div>
          </div>
        } @else {
          <p class="persona-auto nota">{{ textoAutomatico() }}</p>
        }
      </fieldset>
    }
    @if (abierta('reaccion')) {
      <app-reaccion class="faceta-panel faceta-panel--hijo" [id]="'faceta-reaccion-' + r.id" [respuesta]="r" [escena]="escena()"
                    [idBase]="'reaccion-' + r.id" (cambio)="reaccion.emit($event)" />
    }
    @if (abierta('aparece')) {
      <app-selector-condicion class="faceta-panel faceta-panel--hijo" [id]="'faceta-aparece-' + r.id" [condicion]="r.requiere"
                              [salaId]="escena().salaId" leyenda="Aparece si…" vacio="Siempre aparece."
                              [idBase]="'aparece-si-' + r.id" (cambio)="requisito.emit($event)" />
    }

    @if (motivo(); as m) {
      <p class="sin-guardar" [id]="'rsg' + i"><span class="sin-guardar__marca">Solo en esta pantalla</span> {{ m }}</p>
    }
  `,
  styleUrl: './respuesta.component.scss',
})
export class RespuestaComponent {
  readonly respuesta = input.required<Respuesta>();
  readonly indice = input.required<number>();
  readonly escena = input.required<Escena>();
  readonly destinos = input.required<readonly DestinoPosible[]>();
  readonly hitos = input.required<readonly Hito[]>();
  readonly competencias = input.required<readonly CompetenciaCaso[]>();
  /** La docente eligió «Una escena nueva» y falta pulsar «Crear la escena nueva». */
  readonly pendiente = input(false);
  readonly creada = input<{ escenaId: string; titulo: string } | null>(null);
  /** «Ver todo abierto» del guion: abre las cinco facetas a la vez. */
  readonly todoAbierto = input(false);
  /** Hay sitio para una respuesta más (el juego muestra hasta 4): si no, «Duplicar» se apaga. */
  readonly puedeDuplicar = input(true);

  readonly editar = output<Partial<Omit<Respuesta, 'id'>>>();
  readonly efectos = output<(e: EfectosRespuesta) => EfectosRespuesta>();
  readonly requisito = output<Record<string, unknown>>();
  readonly reaccion = output<Reaccion>();
  /** El valor de «Lleva a…»: el id de una escena, `''` (ninguna) o `'nueva'`. */
  readonly destino = output<string>();
  readonly crearEscena = output<void>();
  readonly aceptar = output<void>();
  readonly descartar = output<void>();
  readonly duplicar = output<void>();
  readonly borrar = output<void>();

  protected readonly rutas = inject(RutasAutoria);
  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly clases = CLASES;
  protected readonly nombreClase = NOMBRE_CLASE;
  protected readonly facetas = FACETAS;
  protected readonly pasosVinculo = PASOS_VINCULO;
  protected readonly pasosActivacion = PASOS_ACTIVACION;
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly nombreFaceta: Record<Faceta, string> = { pasos: 'Pasos', criterios: 'Criterios', persona: 'Persona', reaccion: 'Reacción', aparece: 'Aparece' };

  /** La faceta abierta; vuelve a cerrarse cuando la ficha pasa a mostrar otra respuesta. */
  // Se ata al ID y no al objeto: cada cambio guardado rehace la respuesta, y eso no debe cerrar la faceta abierta.
  private readonly idRespuesta = computed(() => this.respuesta().id);
  private readonly faceta = linkedSignal<string, Faceta | null>({ source: this.idRespuesta, computation: () => null });
  /** La clase que la docente tiene enfocada (o la elegida al entrar al grupo); `undefined` = el grupo no tiene el foco. */
  protected readonly claseEnfocada = signal<ClaseRespuesta | null | undefined>(undefined);

  protected readonly letra = computed(() => LETRAS[this.indice()] ?? String(this.indice() + 1));
  protected readonly marcadas = computed(() => competenciasMarcadas(this.respuesta().efectos));
  protected readonly motivo = computed(() => motivoSinGuardar(this.respuesta()));
  protected readonly consecuencia = computed(() => {
    const enfocada = this.claseEnfocada();
    const c = CLASES.find((x) => x.valor === enfocada);
    return c ? `${NOMBRE_CLASE[c.valor]}: ${c.consecuencia.charAt(0).toLowerCase()}${c.consecuencia.slice(1)}` : null;
  });

  /** Lo que cada faceta dice cerrada: su valor, para no tener que abrirla a ver. */
  protected readonly valor = computed<Record<Faceta, string>>(() => {
    const r = this.respuesta();
    const pasos = r.efectos.hitos?.length ?? 0;
    const criterios = this.marcadas().length;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return {
      pasos: String(pasos),
      criterios: this.competencias().length === 0 ? 'sin rúbrica' : String(criterios),
      persona: fraseDeRespuesta(r) ?? 'falta la clase',
      reaccion: Object.values(r.reaccion ?? {}).some((v) => v !== undefined && v !== '') ? 'sí' : 'no',
      aparece: Object.keys(r.requiere ?? {}).length ? 'con requisito' : 'siempre',
    };
  });

  /** Las anclas de «Llévame ahí» que hoy no se ven porque su faceta está cerrada. */
  protected readonly anclasCerradas = computed(() => {
    const id = this.respuesta().id;
    const todas: { faceta: Faceta; id: string }[] = [
      { faceta: 'criterios', id: `competencias-${id}` },
      { faceta: 'reaccion', id: `reaccion-${id}` },
      { faceta: 'aparece', id: `aparece-si-${id}` },
    ];
    return todas.filter((a) => !this.abierta(a.faceta));
  });

  protected readonly acciones = computed<UiMenuItem[]>(() => [
    { value: 'duplicar', label: `Duplicar la respuesta ${this.indice() + 1}`, icon: 'content_copy', disabled: !this.puedeDuplicar() },
    { value: 'borrar', label: `Borrar la respuesta ${this.indice() + 1}`, icon: 'delete', tone: 'danger' },
  ]);

  protected readonly textoAutomatico = computed(() => {
    const frase = fraseDeRespuesta(this.respuesta());
    return frase ? `Si el estudiante la elige, la persona ${frase}.` : 'Elige la clase para ver qué le pasa a la persona.';
  });

  protected abierta(f: Faceta): boolean {
    return this.todoAbierto() || this.faceta() === f;
  }

  /** Abrir una faceta cierra la otra; el foco va a su primer control (y vuelve a la ficha al cerrarla). */
  protected alternar(f: Faceta): void {
    const abrir = this.faceta() !== f;
    this.faceta.set(abrir ? f : null);
    if (abrir) this.enfocar(`#faceta-${f}-${this.respuesta().id} input, #faceta-${f}-${this.respuesta().id} select, #faceta-${f}-${this.respuesta().id} textarea, #faceta-${f}-${this.respuesta().id} a`);
  }

  /** Esc cierra la faceta abierta y devuelve el foco a su ficha. */
  cerrarFaceta(): boolean {
    const f = this.faceta();
    if (!f) return false;
    this.faceta.set(null);
    this.enfocar(`#faceta-boton-${f}-${this.respuesta().id}`);
    return true;
  }

  protected abrirDesdeAncla(f: Faceta, ancla: string): void {
    this.faceta.set(f);
    afterNextRender(() => {
      const el = document.getElementById(ancla);
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus();
    }, { injector: this.injector });
  }

  protected alSalirDeClase(evento: FocusEvent): void {
    const hacia = evento.relatedTarget as Node | null;
    if (!hacia || !(evento.currentTarget as HTMLElement).contains(hacia)) this.claseEnfocada.set(undefined);
  }

  /** Alt+1…4 clasifica la respuesta enfocada (§4.6); Esc cierra la faceta. No actúa dentro de una lista desplegable. */
  protected alTeclear(evento: KeyboardEvent): void {
    if ((evento.target as HTMLElement).tagName === 'SELECT') return;
    if (evento.key === 'Escape' && this.cerrarFaceta()) {
      evento.stopPropagation();
      return;
    }
    const n = Number(evento.key);
    if (!evento.altKey || evento.ctrlKey || evento.metaKey || !(n >= 1 && n <= 4)) return;
    evento.preventDefault();
    this.editar.emit({ clase: CLASES[n - 1].valor });
  }

  protected editarTexto(campo: 'texto' | 'razon' | 'retroalimentacion', valor: string): void {
    if (valor !== this.respuesta()[campo]) this.editar.emit({ [campo]: valor });
  }

  protected alElegir(valor: string | undefined): void {
    if (valor === 'duplicar') this.duplicar.emit();
    else if (valor === 'borrar') this.borrar.emit();
  }

  // Los cambios de efectos se emiten como funciones: el contenedor las aplica sobre la respuesta vigente.
  protected conHitoFn = (clave: string, cumple: boolean) => (e: EfectosRespuesta) => conHito(e, clave, cumple);
  protected conCompetenciaFn = (codigo: string, evidencia: boolean) => (e: EfectosRespuesta) => conCompetencia(e, codigo, evidencia);
  protected conPasoFn = (eje: 'bond' | 'activation', valor: string) => (e: EfectosRespuesta) => conPasoDePersona(e, { [eje]: Number(valor) });
  protected readonly sinPaso = (e: EfectosRespuesta) => sinPasoDePersona(e);
  /** «Lo elijo yo» empieza donde lo dejaba la clase, para que la docente corrija en vez de partir de cero. */
  protected readonly pasoPropio = (e: EfectosRespuesta) => {
    const [vinculo, activacion] = pasoDeRespuesta({ clase: this.respuesta().clase, efectos: e }) ?? [0, 0];
    return conPasoDePersona(e, { bond: vinculo, activation: activacion });
  };

  private enfocar(selector: string): void {
    afterNextRender(() => this.raiz.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
