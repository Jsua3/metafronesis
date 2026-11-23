import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, TemplateRef, afterNextRender, computed, effect, inject, input,
  output, signal, viewChild,
} from '@angular/core';

import { esCampoDeTexto } from '../../marco/estudio/atajos';
import { EstudioHerramientaComponent } from '../../marco/estudio/estudio-herramienta.component';
import { EstudioRanuraDirective, injectComandos } from '../../marco/estudio/estudio.service';
import { rutaArte } from '../../modelo/biblioteca.service';
import { NOMBRE_AVISO, type Aviso } from '../../modelo/caminos';
import type { CasoBorrador, Escena } from '../../modelo/caso';
import { escenasEnOrden } from '../../modelo/progreso';
import { NOMBRE_INTENSIDAD, plural } from '../../modelo/textos';
import { ALTO_ESCENA, ANCHO_ESCENA } from '../../modelo/trazado';
import { type Camara, type Punto, centrarEn, encuadrar, encuadrarLegible, seVe, ventana, zoomEn } from './camara';
import { caminoIluminado } from './iluminar';
import { MinimapaComponent, type NodoMini } from './minimapa.component';
import { type Flecha, trazo } from './trazo-flecha';

export type AccionEscena =
  | { tipo: 'duplicar' | 'conectar' | 'borrar'; escenaId: string }
  | { tipo: 'final'; escenaId: string; esFinal: boolean }
  | { tipo: 'mover'; escenaId: string; x: number; y: number };

const MARGEN = 32;
const PASO_MOVER = 24;
/** Por debajo de este zoom la tarjeta pasa a su forma compacta (a 75 % el texto de 16 px queda en 12: el mínimo legible, D-38). */
const UMBRAL_COMPACTO = 0.75;
/**
 * Al abrir, el mapa nunca baja de aquí: con 8 escenas en un lienzo entre dos paneles, «ver todo» quedaba en 48 % y los
 * títulos en 7 px (QA del líder). Si el caso no cabe, se ve el comienzo y el minimapa lleva al resto.
 */
const ZOOM_AL_ABRIR = 0.75;
/** Mantiene legibles los títulos; el minimapa permite llegar al resto. */
const ZOOM_VER_TODO = 0.75;
const ALTO_MINIMO = 320;
/** Lo que dura la cámara animada (igual que `--ds-dur-slow`). */
const DURACION_CAMARA = 420;
const PASOS_ZOOM = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5, 2];

/**
 * Lienzo de Caminos (EDITOR-PRO.md, punto 3): cada escena es una tarjeta con la miniatura real de su sala; cada respuesta,
 * una flecha curva que sale de un puerto lleno y entra en un aro.
 *
 * Patrón: componente de presentación (Composite del editor). Recibe el caso y los avisos y cuenta lo que pasa por sus
 * salidas; no conoce el store. Su cámara (`camara.ts`) es un valor inmutable en una señal.
 *
 * - Cámara: Ctrl+rueda (o pellizco) acerca en el cursor; la rueda mueve; arrastrar el fondo, Espacio+arrastrar o el botón
 *   central mueven; «Ver todo» (F) encuadra con una cámara suave. Al abrirse, se centra el inicio con escala legible.
 * - Al pasar por una escena se ilumina el camino desde el inicio hasta ella y lo que sale de ella; lo demás se aparta.
 * - Minimapa en la esquina con la ventana visible; pulsarlo lleva la cámara ahí.
 * - Sus herramientas van a la barra del estudio (ranura `herramientas`); sin estudio, se pintan aquí.
 * - Por debajo del 75 % las tarjetas pasan a su forma compacta; el título completo, en el globo y el nombre accesible.
 */
@Component({
  selector: 'app-mapa-escenas',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, EstudioRanuraDirective, EstudioHerramientaComponent, MinimapaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'teclaGlobal($event)', '(document:keyup)': 'soltarTecla($event)' },
  templateUrl: './mapa-escenas.component.html',
  styleUrl: './mapa-escenas.component.scss',
})
export class MapaEscenasComponent {
  readonly caso = input.required<CasoBorrador>();
  /** El caso ya no es un borrador: el editor deshabilita las escenas y el mapa tiene que poder moverse con el teclado. */
  readonly soloLectura = input(false);
  readonly avisos = input<Aviso[]>([]);
  /** Escena elegida desde fuera (por ejemplo, «Llévame ahí»). */
  readonly elegidaInicial = input<string | null>(null);
  /** La imagen de cada sala (fondo dibujado o cuarto compuesto por piezas), por id de sala; la da el contenedor. */
  readonly miniaturas = input<ReadonlyMap<string, string | null>>(new Map());

  readonly abrirGuion = output<string>();
  readonly abrirSala = output<string>();
  readonly seleccion = output<string>();
  readonly accion = output<AccionEscena>();
  readonly agregar = output<void>();
  readonly ordenar = output<void>();

  protected readonly PASO = PASO_MOVER;
  protected readonly nombreIntensidad = NOMBRE_INTENSIDAD;
  /** La intensidad también se ve en la forma (no solo en el color): una, dos o tres barras. */
  protected readonly simboloIntensidad: Record<Escena['intensidad'], string> = { LOW: '▁', MEDIUM: '▃', HIGH: '▇' };
  protected readonly nombreAviso = NOMBRE_AVISO;
  protected readonly plural = plural;
  protected readonly tamNodo = { w: ANCHO_ESCENA, h: ALTO_ESCENA };
  protected readonly elegida = signal<string | null>(null);
  protected readonly pista = signal('');
  protected readonly vista = signal<string | null>(null);
  protected readonly flechaActiva = signal<string | null>(null);
  protected readonly tecladoAbierto = signal(false);
  protected readonly moviendo = signal<{ escenaId: string; x: number; y: number } | null>(null);
  protected readonly altoLienzo = signal<number | null>(null);
  protected readonly camara = signal<Camara>({ x: 0, y: 0, z: 1 });
  protected readonly animando = signal(false);
  protected readonly espacio = signal(false);
  protected readonly arrastre = signal<{ x: number; y: number; cam: Camara; id: number } | null>(null);
  private readonly tamMarco = signal({ w: 0, h: 0 });
  /** La docente movió o acercó a mano: un cambio de ventana ya no reencuadra. */
  private camaraManual = false;
  private finAnimacion: ReturnType<typeof setTimeout> | undefined;
  private limpiarMenuPendiente: (() => void) | undefined;
  private readonly trigger = viewChild.required<CdkMenuTrigger>('trigger');
  private readonly plantillaMenu = viewChild.required<TemplateRef<unknown>>('menu');
  private readonly marco = viewChild.required<ElementRef<HTMLElement>>('marco');
  private readonly lienzo = viewChild.required<ElementRef<HTMLElement>>('lienzo');
  private readonly injector = inject(Injector);
  private readonly raiz: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly porcentaje = computed(() => Math.round(this.camara().z * 100));
  protected readonly compacto = computed(() => this.camara().z < UMBRAL_COMPACTO);
  protected readonly transformacion = computed(() => {
    const c = this.camara();
    return `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
  });
  protected readonly elegidaEscena = computed(() => this.caso().escenas.find((e) => e.id === this.elegida()) ?? null);
  private readonly numeros = computed(() => new Map(escenasEnOrden(this.caso()).map((e, i) => [e.id, i + 1])));
  /** La escena que recibe el Tab: la elegida si todavía existe; si no, el inicio o la primera. */
  protected readonly tabParada = computed(() => {
    const ids = new Set(this.caso().escenas.map((e) => e.id));
    return [this.elegida(), this.caso().inicioId, this.caso().escenas[0]?.id].find((id) => !!id && ids.has(id)) ?? null;
  });

  /** El mapa se dibuja desde la primera escena, no desde el origen: «Ver todo» no desperdicia espacio. */
  private readonly origen = computed<Punto>(() => {
    const ps = this.caso().escenas.map((e) => this.base(e));
    return ps.length ? { x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)) } : { x: 0, y: 0 };
  });

  protected readonly limites = computed(() => {
    const es = this.caso().escenas.map((e) => this.pos(e));
    return {
      ancho: Math.max(ANCHO_ESCENA + 2 * MARGEN, ...es.map((p) => p.x + ANCHO_ESCENA + MARGEN)),
      alto: Math.max(ALTO_ESCENA + 2 * MARGEN, ...es.map((p) => p.y + ALTO_ESCENA + MARGEN)),
    };
  });

  protected readonly flechas = computed<Flecha[]>(() => {
    const caso = this.caso();
    const porId = new Map(caso.escenas.map((e) => [e.id, e]));
    const lista: Flecha[] = [];
    for (const e of caso.escenas) {
      for (const r of e.respuestas) {
        const destino = r.destinoId ? porId.get(r.destinoId) : undefined;
        if (!destino) continue;
        const t = trazo(this.pos(e), this.pos(destino), destino.id === e.id);
        const hacia = destino.id === e.id ? 'Vuelve a esta misma escena' : `Lleva a la escena ${this.numero(destino.id)} · ${destino.titulo}`;
        lista.push({ id: r.id, origen: e.id, destino: destino.id, texto: r.texto, hacia, ...t, deElegida: e.id === this.elegida() });
      }
    }
    return lista;
  });

  /** Las flechas que se iluminan: el camino hasta la escena bajo el cursor (o la flecha bajo el cursor). */
  protected readonly resaltadas = computed<Set<string>>(() => {
    const f = this.flechaActiva();
    if (f) return new Set([f]);
    const v = this.vista();
    return v ? caminoIluminado(this.caso(), v) : new Set();
  });
  /** Las escenas por las que pasa ese camino (su filo también se enciende). */
  protected readonly enCamino = computed(() => {
    const ids = new Set<string>();
    for (const f of this.flechas()) if (this.resaltadas().has(f.id)) ids.add(f.origen).add(f.destino);
    return ids;
  });

  protected readonly flechaElegida = computed(() => this.flechas().find((f) => f.id === this.flechaActiva()) ?? null);
  protected readonly nodosMini = computed<NodoMini[]>(() =>
    this.caso().escenas.map((e) => ({ id: e.id, ...this.pos(e), elegida: e.id === this.elegida(), aviso: this.avisosDe(e.id).length > 0 })));
  protected readonly ventanaMundo = computed(() => ventana(this.camara(), this.tamMarco()));
  /** El caso entero no se ve: solo entonces el minimapa ayuda a ubicarse (si todo cabe, sería ruido en una esquina). */
  protected readonly desborda = computed(() => {
    const { ancho, alto } = this.limites();
    return this.tamMarco().w > 0 && !seVe(this.camara(), { x: 0, y: 0, w: ancho, h: alto }, this.tamMarco(), 0);
  });

  /** El globo de una escena: su sala (con la miniatura solo si tiene fondo: nunca un `src` vacío) y dónde se dibuja. */
  protected readonly vistaEscena = computed(() => {
    const e = this.caso().escenas.find((x) => x.id === this.vista());
    if (!e || this.arrastre()) return null;
    const sala = this.caso().salas.find((s) => s.id === e.salaId);
    const c = this.camara();
    const p = this.aPantalla(this.pos(e));
    const abajo = p.y + ALTO_ESCENA * c.z + 8;
    const arriba = abajo + 300 > this.tamMarco().h && p.y > 300;
    return {
      escena: e,
      titulo: `${this.numero(e.id)} · ${e.titulo}`,
      fondo: sala?.fondo ? rutaArte(this.caso().lugarId, sala.fondo) || null : null,
      sala: sala?.nombre ?? 'Sin sala',
      resumen: sala ? `${plural(sala.personajes.length, 'personaje', 'personajes')} · ${plural(sala.muebles.length, 'mueble', 'muebles')}` : 'Esta escena no tiene sala.',
      arriba,
      x: Math.max(8, Math.min(p.x, this.tamMarco().w - 268)),
      y: arriba ? p.y - 8 : abajo,
    };
  });

  constructor() {
    injectComandos(() => [
      { id: 'mapa:todo', grupo: 'Caminos', titulo: 'Ver todo el mapa', atajo: 'F', ejecutar: () => this.verTodo() },
      { id: 'mapa:inicio', grupo: 'Caminos', titulo: 'Volver al inicio', ejecutar: () => this.volverAlInicio() },
    ]);
    // La primera escena elegida (el inicio, al entrar) solo se marca; las siguientes («Llévame ahí») llevan el foco.
    let primera = true;
    effect(() => {
      const id = this.elegidaInicial();
      if (!id) return;
      if (primera) this.elegir(id);
      else this.elegirYEnfocar(id);
      primera = false;
    });
    afterNextRender(() => this.observarTamano());
    inject(DestroyRef).onDestroy(() => { clearTimeout(this.finAnimacion); this.limpiarMenuPendiente?.(); });
  }

  // ── Datos de la tarjeta ───────────────────────────────────────────────────

  protected miniatura(e: Escena): string | null {
    if (!e.salaId) return null;
    const compuesta = this.miniaturas().get(e.salaId);
    if (compuesta) return compuesta;
    const fondo = this.caso().salas.find((s) => s.id === e.salaId)?.fondo;
    return fondo ? rutaArte(this.caso().lugarId, fondo) || null : null;
  }

  private base(e: Escena): Punto {
    const m = this.moviendo();
    return m && m.escenaId === e.id ? { x: m.x, y: m.y } : e.posicion;
  }

  protected pos(e: Escena): Punto {
    const b = this.base(e), o = this.origen();
    return { x: b.x - o.x + MARGEN, y: b.y - o.y + MARGEN };
  }

  protected aPantalla(m: Punto): Punto {
    const c = this.camara();
    return { x: m.x * c.z + c.x, y: m.y * c.z + c.y };
  }

  protected numero(id: string): number {
    return this.numeros().get(id) ?? 0;
  }

  protected avisosDe(id: string): Aviso[] {
    return this.avisos().filter((a) => a.escenaId === id);
  }

  protected nombreSala(id: string | null): string {
    return id === null ? 'Sin sala' : this.caso().salas.find((s) => s.id === id)?.nombre ?? '';
  }

  protected tituloDe(id: string): string {
    const e = this.caso().escenas.find((x) => x.id === id);
    return e ? `${this.numero(id)} · ${e.titulo}` : '';
  }

  /** Lo que el lector de pantalla oye después del texto visible de la tarjeta. */
  protected detalle(e: Escena): string {
    const partes = [`escena ${this.numero(e.id)} de ${this.caso().escenas.length}`];
    if (e.marcaIa) partes.push('sugerida por la IA, sin revisar');
    const avisos = this.avisosDe(e.id);
    if (avisos.length > 1) partes.push(`avisos: ${avisos.map((a) => NOMBRE_AVISO[a.tipo].toLowerCase()).join(', ')}`);
    return `, ${partes.join(', ')}`;
  }

  /** La piel del contenedor de quien abre el menú (`app-shell.portal[data-skin]`); `null` fuera del portal. */
  protected piel(): string | null {
    return this.raiz.closest('[data-skin]')?.getAttribute('data-skin') ?? null;
  }

  // ── Elegir, menú y teclado de las escenas ─────────────────────────────────

  protected elegir(id: string): void {
    this.elegida.set(id);
    this.pista.set('');
    this.seleccion.emit(id);
  }

  elegirYEnfocar(id: string): void {
    this.elegir(id);
    // Después de pintar: una escena recién creada todavía no está en la pantalla. Si queda fuera de la vista, la cámara va.
    afterNextRender(() => {
      this.mostrar(id);
      this.raiz.querySelector<HTMLElement>(`[data-escena="${id}"]`)?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /** Lleva el foco a la escena que recibe el Tab (por ejemplo, después de borrar la elegida). */
  enfocarParada(): void {
    afterNextRender(() => {
      const id = this.tabParada();
      if (id) this.raiz.querySelector<HTMLElement>(`[data-escena="${id}"]`)?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /** Esc pliega lo que la atención mostró (vista de la sala, detalle de una respuesta, teclas) sin soltar el foco (WCAG 1.4.13). */
  protected plegarAtencion(): void {
    this.vista.set(null);
    this.flechaActiva.set(null);
    this.tecladoAbierto.set(false);
  }

  protected menuContextual(evento: MouseEvent, id: string): void {
    evento.preventDefault();
    // Linux y macOS mandan `contextmenu` al PULSAR: abierto ahí, el clic de soltar lo cerraría. Se abre al soltar.
    if (evento.buttons !== 0) this.abrirAlSoltar(id);
    else this.abrirMenu(id);
  }

  private abrirAlSoltar(id: string): void {
    const vista = this.raiz.ownerDocument.defaultView;
    if (!vista) return this.abrirMenu(id);
    this.limpiarMenuPendiente?.();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const limpiar = () => {
      vista.removeEventListener('pointerup', soltar, true);
      vista.removeEventListener('pointercancel', cancelar, true);
      clearTimeout(temporizador);
      this.limpiarMenuPendiente = undefined;
    };
    const soltar = () => {
      vista.removeEventListener('pointerup', soltar, true);
      vista.removeEventListener('pointercancel', cancelar, true);
      temporizador = setTimeout(() => { this.limpiarMenuPendiente = undefined; this.abrirMenu(id); });
    };
    const cancelar = () => soltar();
    this.limpiarMenuPendiente = limpiar;
    vista.addEventListener('pointerup', soltar, true);
    vista.addEventListener('pointercancel', cancelar, true);
  }

  private abrirMenu(id: string): void {
    this.elegir(id);
    const trigger = this.trigger();
    trigger.menuTemplateRef = this.plantillaMenu();
    trigger.open();
    this.enfocarMenu(trigger, 0);
  }

  private enfocarMenu(trigger: CdkMenuTrigger, intento: number): void {
    const menu = trigger.getMenu();
    if (menu) menu.focusFirstItem('keyboard');
    else if (intento < 5) queueMicrotask(() => this.enfocarMenu(trigger, intento + 1));
  }

  protected tecla(evento: KeyboardEvent, e: Escena): void {
    if (this.moviendo()) return this.teclaMover(evento);
    if (evento.key === 'ContextMenu' || (evento.key === 'F10' && evento.shiftKey)) {
      evento.preventDefault();
      return this.abrirMenu(e.id);
    }
    if (evento.altKey) return; // con Alt las flechas son del riel
    const caso = this.caso();
    const orden = escenasEnOrden(caso);
    const i = orden.findIndex((x) => x.id === e.id);
    const destinos: Record<string, () => string | undefined> = {
      ArrowRight: () => e.respuestas.find((r) => r.destinoId && r.destinoId !== e.id)?.destinoId ?? undefined,
      ArrowLeft: () => caso.escenas.find((x) => x.id !== e.id && x.respuestas.some((r) => r.destinoId === e.id))?.id,
      ArrowDown: () => orden[i + 1]?.id,
      ArrowUp: () => orden[i - 1]?.id,
    };
    if (evento.key === 'Enter') {
      evento.preventDefault();
      this.abrirGuion.emit(e.id);
    } else if (evento.key === 'Delete') {
      evento.preventDefault();
      this.accion.emit({ tipo: 'borrar', escenaId: e.id });
    } else if (destinos[evento.key]) {
      evento.preventDefault();
      const destino = destinos[evento.key]();
      if (destino) this.elegirYEnfocar(destino);
    }
  }

  // ── Mover una escena con teclado o botones ────────────────────────────────

  protected empezarMover(): void {
    const e = this.elegidaEscena();
    if (!e) return;
    this.moviendo.set({ escenaId: e.id, x: e.posicion.x, y: e.posicion.y });
    queueMicrotask(() => this.raiz.querySelector<HTMLElement>(`[data-escena="${e.id}"]`)?.focus({ preventScroll: true }));
  }

  protected empujar(dx: number, dy: number): void {
    this.moviendo.update((m) => (m ? { ...m, x: Math.max(0, m.x + dx), y: Math.max(0, m.y + dy) } : m));
  }

  private teclaMover(evento: KeyboardEvent): void {
    const pasos: Record<string, [number, number]> = {
      ArrowLeft: [-PASO_MOVER, 0], ArrowRight: [PASO_MOVER, 0], ArrowUp: [0, -PASO_MOVER], ArrowDown: [0, PASO_MOVER],
    };
    if (pasos[evento.key]) {
      evento.preventDefault();
      this.empujar(...pasos[evento.key]);
    } else if (evento.key === 'Enter' || evento.key === 'Escape') {
      evento.preventDefault();
      this.terminarMover(evento.key === 'Enter');
    }
  }

  protected terminarMover(confirmar: boolean): void {
    const m = this.moviendo();
    this.moviendo.set(null);
    if (m && confirmar) this.accion.emit({ tipo: 'mover', escenaId: m.escenaId, x: m.x, y: m.y });
    if (m) this.elegirYEnfocar(m.escenaId);
  }

  // ── Cámara ────────────────────────────────────────────────────────────────

  /** Cambia la cámara; con `suave`, la transición dura `--ds-dur-slow` (con movimiento reducido, el CSS la anula). */
  private mover(c: Camara, suave = false): void {
    clearTimeout(this.finAnimacion);
    this.animando.set(suave);
    this.camara.set(c);
    if (suave) this.finAnimacion = setTimeout(() => this.animando.set(false), DURACION_CAMARA);
  }

  /** Un paso de zoom (+1 acerca, −1 aleja) centrado en la vista. */
  zoomar(sentido: 1 | -1): void {
    const z = this.camara().z;
    const siguiente = sentido > 0 ? PASOS_ZOOM.find((p) => p > z + 0.001) : [...PASOS_ZOOM].reverse().find((p) => p < z - 0.001);
    if (siguiente) this.zoomA(siguiente);
  }

  zoomA(z: number): void {
    this.camaraManual = true;
    const { w, h } = this.tamMarco();
    this.mover(zoomEn(this.camara(), { x: w / 2, y: h / 2 }, z), true);
  }

  /** «Ver todo el mapa» (F): el caso entero, sin pasar del 100 % ni bajar de la escala legible, con una cámara suave. */
  verTodo(): void {
    this.camaraManual = true;
    this.mover(encuadrar({ w: this.limites().ancho, h: this.limites().alto }, this.tamMarco()), true);
  }

  /** Recupera el encuadre legible del comienzo de la historia. */
  volverAlInicio(): void {
    this.camaraManual = false;
    this.mover(this.encuadreLegible(ZOOM_AL_ABRIR), true);
  }

  /** El encuadre con un mínimo de escala, anclado en la escena de inicio (o en la primera) si el caso no cabe. */
  private encuadreLegible(minimo: number): Camara {
    const caso = this.caso();
    const inicio = caso.escenas.find((e) => e.id === caso.inicioId) ?? caso.escenas[0];
    const p = inicio ? this.pos(inicio) : { x: 0, y: 0 };
    const ancla = { x: p.x + ANCHO_ESCENA / 2, y: p.y + ALTO_ESCENA / 2 };
    return encuadrarLegible({ w: this.limites().ancho, h: this.limites().alto }, this.tamMarco(), ancla, minimo);
  }

  /** Vuelve a encuadrar el caso entero (después de ordenar el mapa, por ejemplo). */
  encuadrar(): void {
    this.verTodo();
  }

  /** Si la escena no se ve entera, la cámara la centra. */
  private mostrar(id: string): void {
    const e = this.caso().escenas.find((x) => x.id === id);
    if (!e || !this.tamMarco().w) return;
    const p = this.pos(e);
    if (seVe(this.camara(), { ...p, w: ANCHO_ESCENA, h: ALTO_ESCENA }, this.tamMarco())) return;
    this.mover(centrarEn(this.camara(), { x: p.x + ANCHO_ESCENA / 2, y: p.y + ALTO_ESCENA / 2 }, this.tamMarco()), true);
  }

  protected irA(m: Punto): void {
    this.camaraManual = true;
    this.mover(centrarEn(this.camara(), m, this.tamMarco()));
  }

  protected rueda(e: WheelEvent): void {
    e.preventDefault();
    this.camaraManual = true;
    const c = this.camara();
    if (e.ctrlKey || e.metaKey) {
      const caja = this.marco().nativeElement.getBoundingClientRect();
      this.mover(zoomEn(c, { x: e.clientX - caja.left, y: e.clientY - caja.top }, c.z * Math.exp(-e.deltaY * 0.002)));
    } else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
      this.mover({ ...c, x: c.x - dx, y: c.y - dy });
    }
  }

  /** Arrastrar mueve el lienzo: el botón central, Espacio + arrastrar, o el fondo (no una escena ni una flecha). */
  protected empezarArrastre(e: PointerEvent): void {
    const sobreAlgo = e.target instanceof Element && !!e.target.closest('.escena, .flecha, .vista');
    if (!(e.button === 1 || (e.button === 0 && (this.espacio() || !sobreAlgo)))) return;
    e.preventDefault();
    this.marco().nativeElement.setPointerCapture?.(e.pointerId);
    this.arrastre.set({ x: e.clientX, y: e.clientY, cam: this.camara(), id: e.pointerId });
  }

  protected arrastrar(e: PointerEvent): void {
    const a = this.arrastre();
    if (!a || a.id !== e.pointerId) return;
    this.camaraManual = true;
    this.mover({ ...a.cam, x: a.cam.x + e.clientX - a.x, y: a.cam.y + e.clientY - a.y });
  }

  protected soltarArrastre(e: PointerEvent): void {
    if (this.arrastre()?.id !== e.pointerId) return;
    this.marco().nativeElement.releasePointerCapture?.(e.pointerId);
    this.arrastre.set(null);
  }

  /** El navegador desplaza un contenedor `overflow: hidden` al enfocar algo de dentro: eso lo hace la cámara, no él. */
  protected alEnfocar(e: FocusEvent): void {
    const marco = this.marco().nativeElement;
    marco.scrollTop = 0;
    marco.scrollLeft = 0;
    const id = e.target instanceof HTMLElement ? e.target.dataset['escena'] : undefined;
    if (id) this.mostrar(id);
  }

  /** En solo lectura el marco toma el foco: las flechas mueven el lienzo. */
  protected teclaMarco(e: KeyboardEvent): void {
    if (e.target !== this.marco().nativeElement) return;
    const d: Record<string, [number, number]> = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] };
    if (!d[e.key]) return;
    e.preventDefault();
    const c = this.camara();
    this.mover({ ...c, x: c.x + d[e.key][0], y: c.y + d[e.key][1] });
  }

  /** F, + y − en todo el mapa (nunca dentro de un campo ni con modificadores); Espacio sostenido = mano; Esc pliega globos. */
  protected teclaGlobal(e: KeyboardEvent): void {
    if (e.key === 'Escape') return this.plegarAtencion();
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || esCampoDeTexto(e.target)) return;
    if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"]')) return;
    const acciones: Record<string, () => void> = {
      f: () => this.verTodo(), F: () => this.verTodo(), '+': () => this.zoomar(1), '=': () => this.zoomar(1), '-': () => this.zoomar(-1),
    };
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
      e.preventDefault();
      this.espacio.set(true);
    } else if (acciones[e.key]) {
      e.preventDefault();
      acciones[e.key]();
    }
  }

  protected soltarTecla(e: KeyboardEvent): void {
    if (e.key === ' ') this.espacio.set(false);
  }

  // ── Medidas ───────────────────────────────────────────────────────────────

  /** El lienzo ocupa lo que queda de la zona que se desplaza (en el teléfono, el alto de la hoja de estilos). */
  private medirAlto(): void {
    const zona = this.zonaQueSeDesplaza();
    if (!zona) return this.altoLienzo.set(null);
    const lienzo = this.lienzo().nativeElement;
    const arriba = lienzo.getBoundingClientRect().top - zona.getBoundingClientRect().top + zona.scrollTop;
    const alto = Math.max(ALTO_MINIMO, Math.floor(zona.clientHeight - arriba - 12));
    if (this.altoLienzo() !== alto) this.altoLienzo.set(alto);
  }

  private zonaQueSeDesplaza(): HTMLElement | null {
    for (let el = this.raiz.parentElement; el && el !== document.body; el = el.parentElement) {
      const desborde = getComputedStyle(el).overflowY;
      if (desborde === 'auto' || desborde === 'scroll') return el;
    }
    return null;
  }

  private observarTamano(): void {
    const marco = this.marco().nativeElement;
    const ajustar = () => {
      this.tamMarco.set({ w: marco.clientWidth, h: marco.clientHeight });
      if (!this.camaraManual) this.mover(this.encuadreLegible(ZOOM_AL_ABRIR));
    };
    this.medirAlto();
    afterNextRender(ajustar, { injector: this.injector });
    if (typeof ResizeObserver === 'undefined') return;
    const zona = this.zonaQueSeDesplaza();
    const observador = new ResizeObserver(() => {
      this.medirAlto();
      afterNextRender(ajustar, { injector: this.injector });
    });
    observador.observe(marco);
    if (zona) observador.observe(zona);
    if (this.raiz.parentElement) observador.observe(this.raiz.parentElement);
    this.injector.get(DestroyRef).onDestroy(() => observador.disconnect());
  }
}
