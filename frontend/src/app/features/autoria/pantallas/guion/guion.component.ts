import {
  ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, input, linkedSignal, signal, untracked,
} from '@angular/core';
import { EstudioSeccionComponent } from '../../marco/estudio/estudio-seccion.component';
import { EstudioRanuraDirective } from '../../marco/estudio/estudio.service';
import { injectMiniaturasDeSalas } from '../../marco/estudio/miniaturas-de-salas';
import { CamaraEscenaComponent } from './camara-escena.component';
import { Router, RouterLink } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { UiMenu, type UiMenuItem } from '../../../../shared/ui/menu/ui-menu';
import { RUTA_ENSAYO, alPulsarProbar } from '../../ensayo';
import { CasoStore } from '../../estado/caso.store';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { DeshacerBorrado } from '../../marco/deshacer-borrado';
import type { EfectosRespuesta, Escena, IntensidadEscena, Linea, Reaccion, Respuesta } from '../../modelo/caso';
import { escenasEnOrden } from '../../modelo/progreso';
import { NOMBRE_INTENSIDAD, plural } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { ComentariosComponent } from './comentarios.component';
import { dependenciasDeEscena, dependenciasDeRespuesta, respuestaEnBlanco } from './dependencias';
import { GuiaDeRedaccionComponent } from './guia-de-redaccion.component';
import { LineaComponent } from './linea.component';
import { ObjetivoPistasComponent } from './objetivo-pistas.component';
import { RespuestaComponent } from './respuesta.component';
import { VistaEstudianteComponent } from './vista-estudiante.component';

/** El juego muestra las opciones de una decisión como A, B, C y D. */
const MAX_RESPUESTAS = 4;
const INTENSIDADES: IntensidadEscena[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * El estudio de guion (EDITOR.md §3.4): la escena como un LIBRETO que se lee de arriba abajo —cabecera, «Antes de decidir»,
 * lo que dicen los personajes, lo que dicen al acercarte y lo que puede responder el estudiante— y, a la derecha, la mini
 * simulación de cómo lo verá el estudiante. Los bloques secundarios van plegados con su resumen y las respuestas son fichas
 * con facetas, para que una escena de cuatro respuestas quepa en unas dos pantallas en vez de casi diez.
 *
 * Patrón: contenedor del Composite del guion (SOLID, S y D). Es el único que habla con el store (Facade del caso) y con el
 * diálogo; `app-linea`, `app-respuesta`, `app-vista-estudiante` y `app-guia-de-redaccion` solo pintan y emiten intenciones.
 */
@Component({
  selector: 'app-guion',
  imports: [
    AutoAltoDirective, ComentariosComponent, GuiaDeRedaccionComponent, LineaComponent, ObjetivoPistasComponent, RespuestaComponent,
    RouterLink, UiMenu, VistaEstudianteComponent, CamaraEscenaComponent, EstudioRanuraDirective, EstudioSeccionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'alTeclear($event)' },
  templateUrl: './guion.component.html',
  styleUrl: './guion.component.scss',
})
export class GuionComponent {
  readonly escenaId = input.required<string>();

  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly dialogo = inject(UiDialog);
  private readonly deshacer = inject(DeshacerBorrado);
  private readonly injector = inject(Injector);
  protected readonly plural = plural;
  protected readonly intensidades = INTENSIDADES;
  protected readonly nombreIntensidad = NOMBRE_INTENSIDAD;
  protected readonly maximoRespuestas = MAX_RESPUESTAS;

  protected readonly anuncio = signal('');
  protected readonly lineaVista = signal<string | null>(null);
  /** La imagen de cada sala (las por piezas, compuestas con el pintor del juego), para la cámara. */
  private readonly miniaturas = injectMiniaturasDeSalas(true);
  protected miniaturaDe(e: { salaId: string | null }): string | null {
    return e.salaId ? this.miniaturas().get(e.salaId) ?? null : null;
  }
  protected readonly pendiente = signal<string | null>(null);
  protected readonly creada = signal<{ respuestaId: string; escenaId: string; titulo: string } | null>(null);
  protected readonly verTodo = signal(false);

  protected readonly escena = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.escenaId()) ?? null);
  /** Las escenas en el orden de la historia: el mismo número que el riel, «Lleva a…» y «Escena 2 de 8». */
  protected readonly orden = computed(() => {
    const caso = this.store.caso();
    return caso ? escenasEnOrden(caso) : [];
  });
  protected readonly personajes = computed(() => this.store.caso()?.personajes ?? []);
  protected readonly hitos = computed(() => this.store.caso()?.hitos ?? []);
  protected readonly competencias = computed(() => this.store.caso()?.competencias ?? []);
  protected readonly destinos = computed(() => this.orden().map((d, j) => ({ id: d.id, etiqueta: `${j + 1} · ${d.titulo}` })));
  protected readonly posicion = computed(() => this.orden().findIndex((e) => e.id === this.escenaId()));
  protected readonly anterior = computed(() => this.orden()[this.posicion() - 1] ?? null);
  protected readonly siguiente = computed(() => (this.posicion() < 0 ? null : this.orden()[this.posicion() + 1] ?? null));

  /** El número que el servidor le dio a la escena: sin él (la escena aún no se guardó) no hay desde dónde probar. */
  protected readonly nodoParaProbar = computed(() => (this.store.caso(), this.store.guardando(), this.store.nodoDeEscena(this.escenaId())));
  protected readonly rutaEnsayo = (nodo: number): string => RUTA_ENSAYO(this.store.caso()!.id, nodo);

  /** «Antes de decidir» va cerrado si está vacío (§3.4, punto 2); con algo escrito, abierto. Se recalcula al cambiar de escena. */
  protected readonly antesAbierto = linkedSignal<string, boolean>({
    source: this.escenaId,
    // Solo al cambiar de escena: guardar algo dentro no debe volver a abrir lo que la docente cerró.
    computation: (id) => {
      const e = untracked(this.store.caso)?.escenas.find((x) => x.id === id);
      return !!e && (!!e.objetivo?.trim() || (e.pistas?.length ?? 0) > 0 || (e.recursosApoyo?.length ?? 0) > 0);
    },
  });
  /** «Lo que dicen al acercarte» va plegado con su cuenta (§3.4, punto 4). */
  protected readonly comentariosAbiertos = linkedSignal(() => (this.escenaId(), false));

  protected readonly resumenAntes = computed(() => {
    const e = this.escena();
    if (!e) return '';
    const pistas = e.pistas?.length ?? 0;
    const recursos = e.recursosApoyo?.length ?? 0;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return [
      e.objetivo?.trim() ? 'Objetivo escrito' : 'Sin objetivo',
      pistas ? plural(pistas, 'pista', 'pistas') : 'sin pistas',
      recursos ? plural(recursos, 'recurso de apoyo', 'recursos de apoyo') : 'sin recursos de apoyo',
    ].join(' · ');
  });
  protected readonly cuentaComentarios = computed(() => {
    const n = this.escena()?.comentarios?.length ?? 0;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return n ? plural(n, 'frase', 'frases') : 'ninguna frase todavía';
  });
  /** Anclas de «Llévame ahí» que viven dentro de un bloque plegado: mientras está cerrado, estas marcas las reciben. */
  protected readonly anclasDeComentarios = computed(() => (this.escena()?.comentarios ?? []).map((_, k) => `comentario-${k}`));

  protected readonly accionesEscena = computed<UiMenuItem[]>(() => [
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    { value: 'borrar', label: 'Borrar la escena', icon: 'delete', tone: 'danger', disabled: this.orden().length <= 1 },
  ]);

  /** Una escena sin líneas ni respuestas: la pasarela invita a escribirla («Escribir la escena 3»). */
  protected sinEscribir(e: Escena): boolean {
    return !e.lineas.length && !e.respuestas.length;
  }

  protected numero(e: Escena): number {
    return this.orden().indexOf(e) + 1;
  }

  protected nombreSala(id: string | null): string {
    return id === null ? 'Sin sala' : this.store.caso()?.salas.find((s) => s.id === id)?.nombre ?? '';
  }

  protected lleganDesde(e: Escena): string {
    return this.orden()
      .filter((x) => x.id !== e.id && x.respuestas.some((r) => r.destinoId === e.id))
      .map((x) => `${this.numero(x)} · ${x.titulo}`)
      .join(', ');
  }

  protected resumenLineas(e: Escena): string {
    const ia = e.lineas.filter((l) => l.marcaIa).length;
    const base = plural(e.lineas.length, 'línea', 'líneas');
    return ia ? `${base} · ${ia} sugerida${ia === 1 ? '' : 's'} por la IA, sin revisar` : base;
  }

  /** ¿Cada respuesta de la escena lleva un requisito? Entonces puede que ninguna aparezca. */
  protected todasConRequisito(e: Escena): boolean {
    return e.respuestas.length > 0 && e.respuestas.every((r) => Object.keys(r.requiere ?? {}).length > 0);
  }

  protected enElTopeDeRespuestas(e: Escena): boolean {
    return e.respuestas.length >= MAX_RESPUESTAS;
  }

  protected describedbyAgregarRespuesta(e: Escena): string | null {
    if (!this.enElTopeDeRespuestas(e)) return null;
    return e.respuestas.length > MAX_RESPUESTAS ? 'respuestas-tope respuestas-exceso' : 'respuestas-tope';
  }

  // ─── La escena ────────────────────────────────────────────────────────────────────────────────

  protected nombrar(e: Escena, titulo: string): void {
    const limpio = titulo.trim();
    if (limpio && limpio !== e.titulo) this.store.editarEscena(e.id, { titulo: limpio });
  }

  protected cambiarIntensidad(e: Escena, valor: IntensidadEscena): void {
    this.store.editarEscena(e.id, { intensidad: valor });
    this.anuncio.set(valor === 'HIGH' ? 'Intensidad alta: escribe el aviso para el estudiante.' : `Intensidad ${NOMBRE_INTENSIDAD[valor].toLowerCase()}.`);
    if (valor === 'HIGH') this.enfocar('aviso-escena');
  }

  /** Un recurso por línea; las líneas vacías no cuentan. */
  protected cambiarRecursos(e: Escena, campo: HTMLTextAreaElement): void {
    const recursos = campo.value.split('\n').map((r) => r.trim()).filter(Boolean);
    campo.value = recursos.join('\n');
    this.store.editarEscena(e.id, { recursosApoyo: recursos });
    this.anuncio.set(recursos.length ? 'Recursos de apoyo guardados.' : 'Sin recursos de apoyo en esta escena.');
  }

  protected abrirPlegado(cual: 'antes' | 'comentarios', ancla: string): void {
    (cual === 'antes' ? this.antesAbierto : this.comentariosAbiertos).set(true);
    afterNextRender(() => {
      const el = document.getElementById(ancla);
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus();
    }, { injector: this.injector });
  }

  protected probar(evento: MouseEvent, nodo: number): void {
    void alPulsarProbar(evento, this.store, nodo);
  }

  /** Acepta de una vez lo sugerido en la escena; solo si de verdad quedó todo aceptado se anuncia (si no, habla el aviso de lo que faltó). */
  protected async aceptarEscena(e: Escena): Promise<void> {
    this.store.aceptarEscenaIa(e.id);
    this.enfocarPrimero('#en');
    await this.store.sincronizado();
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (this.store.partesIaDeEscena(e.id) === 0) this.anuncio.set('Aceptaste todo lo sugerido en esta escena.');
  }

  protected async alElegirEnEscena(valor: string | undefined, e: Escena, origen: HTMLElement): Promise<void> {
    if (valor !== 'borrar') return;
    const caso = this.store.caso();
    if (!caso) return;
    const dependencias = dependenciasDeEscena(caso, e);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    const respuesta = await this.dialogo.consequence({
      title: `¿Borrar la escena «${e.titulo}»?`,
      consequence: [...dependencias, 'No se puede deshacer.'].join(' '),
      continueLabel: 'Conservarla',
      proceedLabel: 'Borrar la escena',
      origen,
    });
    if (respuesta !== 'proceed') return;
    const volverA = this.anterior() ?? this.siguiente();
    this.store.borrarEscena(e.id);
    this.anuncio.set('Escena borrada.');
    void this.router.navigateByUrl(volverA ? this.rutas.a('/editor/escena', volverA.id) : this.rutas.a('/editor'));
  }

  // ─── Las líneas ───────────────────────────────────────────────────────────────────────────────

  protected agregarLinea(e: Escena): void {
    const id = this.store.agregarLinea(e.id);
    this.lineaVista.set(id);
    this.enfocar(`lt${this.escena()!.lineas.length - 1}`);
  }

  /** Ctrl+Enter en una línea: la siguiente nace debajo, con el mismo personaje y su cara, lista para escribir. */
  protected lineaSiguiente(e: Escena, l: Linea, i: number): void {
    const id = this.store.agregarLinea(e.id);
    this.store.editarLinea(e.id, id, { personajeId: l.personajeId, expresion: l.expresion });
    const lugar = () => this.escena()?.lineas.findIndex((x) => x.id === id) ?? -1;
    for (let actual = lugar(); actual > i + 1; actual = lugar()) {
      this.store.moverLinea(e.id, id, -1);
      if (lugar() === actual) break; // no se movió: no insistir
    }
    this.lineaVista.set(id);
    this.enfocar(`lt${i + 1}`);
  }

  protected editarLinea(e: Escena, l: Linea, cambios: Partial<Omit<Linea, 'id'>>): void {
    this.store.editarLinea(e.id, l.id, cambios);
  }

  protected moverLinea(e: Escena, l: Linea, i: number, delta: -1 | 1): void {
    this.store.moverLinea(e.id, l.id, delta);
    this.anuncio.set(`Línea ${i + 1}, ahora en la posición ${i + 1 + delta} de ${e.lineas.length}.`);
    this.enfocar(`lt${i + delta}`);
  }

  protected duplicarLinea(e: Escena, l: Linea, i: number): void {
    this.store.duplicarLinea(e.id, l.id);
    this.anuncio.set(`Línea ${i + 1} duplicada: la copia es la línea ${i + 2}.`);
    this.enfocarPrimero(`#lt${i + 1}`);
  }

  protected aceptarLinea(e: Escena, l: Linea, i: number): void {
    this.store.aceptarIa({ escenaId: e.id, lineaId: l.id });
    this.anuncio.set(`Línea ${i + 1} aceptada.`);
    this.enfocarPrimero(`#lt${i}`);
  }

  /** Nada del caso apunta a una línea: se borra al instante y el marco ofrece «Deshacer» durante 8 s (§4.6). */
  protected borrarLinea(e: Escena, l: Linea, i: number, como: 'borrada' | 'descartada' = 'borrada'): void {
    this.deshacer.linea(e.id, l.id);
    this.anuncio.set(`Línea ${i + 1} ${como}.`);
    this.enfocarPrimero(`#lt${i}`, `#lt${i - 1}`, '[data-accion="agregar-linea"]');
  }

  // ─── Las respuestas ───────────────────────────────────────────────────────────────────────────

  protected agregarRespuesta(e: Escena): void {
    if (this.enElTopeDeRespuestas(e)) return;
    this.store.agregarRespuesta(e.id);
    this.enfocar(`rt${this.escena()!.respuestas.length - 1}`);
  }

  /** La respuesta como está ahora en el caso: dos cambios seguidos (antes de que la pantalla se redibuje) no pisan el primero. */
  private vigente(e: Escena, r: Respuesta): Respuesta {
    return this.store.caso()?.escenas.find((x) => x.id === e.id)?.respuestas.find((x) => x.id === r.id) ?? r;
  }

  protected editarRespuesta(e: Escena, r: Respuesta, cambios: Partial<Omit<Respuesta, 'id'>>): void {
    this.store.editarRespuesta(e.id, r.id, cambios);
    if (cambios.clase) this.anuncio.set(`Respuesta ${e.respuestas.indexOf(r) + 1}: ${cambios.clase === 'CONTRAINDICATED' ? 'contraindicada, escribe por qué' : 'clase elegida'}.`);
  }

  protected cambiarEfectos(e: Escena, r: Respuesta, cambio: (ef: EfectosRespuesta) => EfectosRespuesta): void {
    this.store.editarRespuesta(e.id, r.id, { efectos: cambio(this.vigente(e, r).efectos) });
  }

  protected cambiarReaccion(e: Escena, r: Respuesta, reaccion: Reaccion): void {
    this.store.editarReaccion(e.id, r.id, reaccion);
  }

  protected elegirDestino(r: Respuesta, valor: string): void {
    this.creada.set(null);
    if (valor === 'nueva') {
      this.pendiente.set(r.id);
      return;
    }
    this.pendiente.set(null);
    this.store.conectar(r.id, valor || null);
  }

  protected crearEscenaNueva(e: Escena, r: Respuesta, i: number): void {
    const id = this.store.respuestaAEscenaNueva(e.id, r.id);
    const nueva = this.store.caso()!.escenas.find((x) => x.id === id)!;
    this.pendiente.set(null);
    this.creada.set({ respuestaId: r.id, escenaId: id, titulo: `${this.numero(nueva)} · ${nueva.titulo}` });
    this.anuncio.set(`Se creó «${nueva.titulo}», conectada a la respuesta ${i + 1}.`);
  }

  protected aceptarRespuesta(e: Escena, r: Respuesta, i: number): void {
    this.store.aceptarIa({ escenaId: e.id, respuestaId: r.id });
    this.anuncio.set(`Respuesta ${i + 1} aceptada.`);
    this.enfocarPrimero(`#rt${i}`);
  }

  /** Copia la respuesta debajo de las demás (el juego muestra hasta 4): texto, clase, efectos, destino, requisito y reacción. */
  protected duplicarRespuesta(e: Escena, r: Respuesta, i: number): void {
    if (this.enElTopeDeRespuestas(e)) return;
    const id = this.store.agregarRespuesta(e.id);
    const { id: _id, marcaIa: _ia, requiere, reaccion, ...campos } = structuredClone(this.vigente(e, r));
    this.store.editarRespuesta(e.id, id, campos);
    if (requiere && Object.keys(requiere).length) this.store.editarRequisito(e.id, id, requiere);
    if (reaccion && Object.keys(reaccion).length) this.store.editarReaccion(e.id, id, reaccion);
    const n = this.escena()!.respuestas.length;
    this.anuncio.set(`Respuesta ${i + 1} duplicada: la copia es la respuesta ${n}.`);
    this.enfocar(`rt${n - 1}`);
  }

  /**
   * La referencian los objetos de la sala que la ofrecen y las escenas a las que lleva: se borra con una confirmación que
   * nombra lo que depende de ella, sin «Deshacer» (§4.6). Una respuesta en blanco se borra sin preguntar: no hay nada que perder.
   */
  protected async borrarRespuesta(e: Escena, r: Respuesta, i: number, como: 'borrada' | 'descartada' = 'borrada', origen?: Element | null): Promise<void> {
    const caso = this.store.caso();
    if (!caso) return;
    if (!respuestaEnBlanco(caso, r)) {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      const decision = await this.dialogo.consequence({
        title: `¿Borrar la respuesta ${i + 1}?`,
        consequence: [`«${resumir(r.texto) || 'Respuesta sin escribir'}».`, ...dependenciasDeRespuesta(caso, r), 'No se puede deshacer.'].join(' '),
        continueLabel: 'Conservarla',
        proceedLabel: como === 'descartada' ? `Descartar la respuesta ${i + 1}` : `Borrar la respuesta ${i + 1}`,
        origen: origen ?? document.getElementById(`respuesta-${r.id}`),
      });
      if (decision !== 'proceed') return;
    }
    this.store.borrarRespuesta(e.id, r.id);
    this.anuncio.set(`Respuesta ${i + 1} ${como}.`);
    this.enfocarPrimero(`#rt${i}`, `#rt${i - 1}`, '[data-accion="agregar-respuesta"]');
  }

  // ─── Teclado (§4.6) ───────────────────────────────────────────────────────────────────────────

  /**
   * Atajos del guion, todos con modificador (WCAG 2.1.4): Ctrl+Mayús+Enter agrega una respuesta, Alt+P prueba desde esta
   * escena, Alt+↑ y Alt+↓ van a la escena anterior o siguiente. Ninguno actúa dentro de una lista desplegable, donde Alt+↓
   * la abre. Esc con todo abierto lo vuelve a cerrar.
   */
  protected alTeclear(evento: KeyboardEvent): void {
    const e = this.escena();
    if (!e || evento.defaultPrevented || (evento.target as HTMLElement).tagName === 'SELECT') return;
    if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey) && evento.shiftKey) {
      evento.preventDefault();
      this.agregarRespuesta(e);
    } else if (evento.altKey && !evento.ctrlKey && (evento.key === 'p' || evento.key === 'P')) {
      const nodo = this.nodoParaProbar();
      if (nodo === null) return;
      evento.preventDefault();
      void alPulsarProbar(new MouseEvent('click', { button: 0 }), this.store, nodo);
    } else if (evento.altKey && !evento.ctrlKey && (evento.key === 'ArrowUp' || evento.key === 'ArrowDown')) {
      const destino = evento.key === 'ArrowUp' ? this.anterior() : this.siguiente();
      if (!destino) return;
      evento.preventDefault();
      void this.router.navigateByUrl(this.rutas.a('/editor/escena', destino.id));
    } else if (evento.key === 'Escape' && this.verTodo()) {
      this.verTodo.set(false);
    }
  }

  // ─── Foco ─────────────────────────────────────────────────────────────────────────────────────

  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  /**
   * Lo pulsado desaparece al borrar o aceptar: el foco va al primer selector que exista, para que quien usa el teclado no
   * vuelva al principio de la página.
   */
  private enfocarPrimero(...selectores: string[]): void {
    setTimeout(() => {
      for (const s of selectores) {
        const el = document.querySelector<HTMLElement>(s);
        if (el) {
          el.focus();
          return;
        }
      }
    });
  }
}

/** Las primeras palabras de un texto largo, para nombrarlo en una confirmación sin copiarlo entero. */
function resumir(texto: string, tope = 80): string {
  const limpio = texto.trim().replace(/\s+/g, ' ');
  return limpio.length <= tope ? limpio : `${limpio.slice(0, tope).replace(/\s\S*$/, '')}…`;
}
