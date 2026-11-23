import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escenario, LugarResumen } from '../../modelo/escenario';
import { nombreTema } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { BarraDePasosComponent } from './barra-de-pasos.component';
import { DetalleLugarComponent } from './detalle-lugar.component';
import { PintorDeVistas } from './pintor-de-vistas.service';

/**
 * Paso 1 de crear un caso: elegir el lugar, como el «Nuevo proyecto» de Unity Hub. Plantillas grandes con su arte real, un
 * panel de detalle de la elegida y la barra fija «Atrás · Paso 1 de 2 · Continuar».
 *
 * Patrón State (con señales): el contenedor guarda qué lugar está elegido, qué escenarios ya se leyeron y qué imágenes ya
 * están pintadas; las piezas que pintan (`app-detalle-lugar`, `app-barra-de-pasos`) solo reciben datos. Las imágenes salen
 * del adaptador `PintorDeVistas` (el Hospital, que es por piezas, se compone con el pintor del juego).
 *
 * Las plantillas son botones de radio nativos: las flechas recorren y eligen, Intro continúa, y el doble clic también. El
 * enlace de continuar se llama «Elegir este lugar: <nombre> y continuar» (contrato de nombres de las pruebas e2e).
 */
@Component({
  selector: 'app-lugar',
  imports: [RouterLink, BarraDePasosComponent, DetalleLugarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina crear">
      <header class="titulo">
        <p class="sobre">Nuevo caso</p>
        <h1>¿Dónde pasa tu caso?</h1>
        <p class="texto-secundario">Elige un lugar. El caso recibe una copia de sus salas, muebles y personajes: puedes cambiar todo y el lugar original no cambia.</p>
      </header>

      @if (temasPresentes().length > 1) {
        <!-- La fila se desliza si no cabe: el borde con más fichas se desvanece y lleva una flecha (solo para el ratón; con el
             teclado, Tab recorre las fichas y cada una se desliza a la vista sola). -->
        <div class="filtro-marco" [attr.data-mas-inicio]="masInicio() || null" [attr.data-mas-fin]="masFin() || null">
          <div class="filtro" role="group" aria-labelledby="ftema" #filtro (scroll)="medirFiltro()">
            <span id="ftema" class="etiqueta">Filtrar por tema</span>
            <button type="button" class="ficha" [attr.aria-pressed]="tema() === null" (click)="tema.set(null)">Todos los temas</button>
            @for (t of temasPresentes(); track t) {
              <button type="button" class="ficha" [attr.aria-pressed]="tema() === t" (click)="tema.set(t)">{{ nombreTema(t) }}</button>
            }
          </div>
          @if (masInicio()) {
            <button type="button" class="desliza desliza--inicio" tabindex="-1" aria-hidden="true" (click)="deslizar(-1)"><span>‹</span></button>
          }
          @if (masFin()) {
            <button type="button" class="desliza desliza--fin" tabindex="-1" aria-hidden="true" (click)="deslizar(1)"><span>›</span></button>
          }
        </div>
      }

      @if (fallo()) {
        <div class="tarjeta error" role="alert">
          <p>No pudimos cargar los lugares. Revisa tu conexión y vuelve a intentarlo.</p>
          <button type="button" class="boton boton-primario" (click)="cargar()">Volver a intentarlo</button>
        </div>
      } @else {
        <p role="status" class="solo-lector">{{ estado() }}</p>
      }

      <div class="estudio">
        <section aria-labelledby="plantillas" class="zona">
          <h2 id="plantillas" class="seccion">Plantillas <span class="cuantos">{{ estado() }}</span></h2>
          <div class="plantillas" role="radiogroup" aria-labelledby="plantillas" data-accion="elegir-lugar crear-caso">
            @for (l of filtrados(); track l.id) {
              <label class="plantilla" [class.elegida]="elegidoId() === l.id" [class.pronto]="!l.completo" (dblclick)="continuar(l)">
                <input class="solo-lector" type="radio" name="lugar" [value]="l.id" [checked]="elegidoId() === l.id"
                       [attr.aria-labelledby]="'pl-' + l.id" [attr.aria-describedby]="'pd-' + l.id"
                       (change)="elegir(l.id)" (keydown.enter)="continuar(l)" />
                <span class="arte">
                  @if (portadaDe(l); as src) {
                    <img class="pixel" [src]="src" alt="" width="960" height="528" decoding="async" />
                  } @else {
                    <span class="patron" aria-hidden="true"></span>
                  }
                  <span class="insignia" aria-hidden="true">{{ l.salas }} salas</span>
                  <span class="visto" aria-hidden="true"></span>
                </span>
                <span class="texto">
                  <span class="nombre" [id]="'pl-' + l.id">{{ l.nombre }}@if (!l.completo) { <span class="pildora">Pronto</span> }</span>
                  <span class="desc texto-secundario" [id]="'pd-' + l.id">{{ l.descripcion }}</span>
                </span>
              </label>
            } @empty {
              @if (cargando()) {
                @for (n of [1, 2, 3, 4]; track n) { <span class="plantilla esqueleto" aria-hidden="true"><span class="arte"></span><span class="raya"></span></span> }
              }
            }
          </div>
          @if (!cargando() && !fallo() && !filtrados().length) {
            <div class="tarjeta aviso-filtro"><p>{{ tema() ? 'No hay lugares para este tema.' : 'Aún no hay lugares disponibles.' }}</p>
              @if (tema()) { <button type="button" class="boton" (click)="tema.set(null)">Quitar el filtro</button> }
            </div>
          }
          @if (filtrados().length && !hayDisponibles()) {
            <div class="tarjeta aviso-filtro">
              <p>Con este tema solo hay lugares que llegan pronto. Por ahora puedes quitar el filtro y usar la universidad.</p>
              <button type="button" class="boton" (click)="tema.set(null)">Quitar el filtro</button>
            </div>
          }
        </section>

        @if (elegido(); as l) {
          <aside class="inspector" role="region" tabindex="0" aria-label="Detalle del lugar elegido">
            @if (erroresDetalle().has(l.id) && !escenarios()[l.id]) {
              <div class="tarjeta error" role="alert"><p>No pudimos cargar el detalle de este lugar.</p><button type="button" class="boton" (click)="elegir(l.id)">Reintentar</button></div>
            }
            <app-detalle-lugar [lugar]="l" [escenario]="escenarios()[l.id] ?? null" [fallo]="erroresDetalle().has(l.id)" [portada]="portadaDe(l)" [vistas]="vistas()[l.id] ?? {}" />
          </aside>
        }
      </div>

      <app-barra-de-pasos [paso]="1" rotulo="Elegir el lugar">
        <a atras class="boton boton-texto" [routerLink]="rutas.a('/')" aria-label="Atrás: volver a Mis casos"><span aria-hidden="true">‹</span> Atrás</a>
        <!-- Un solo nivel de @if con una raíz por rama: así cada rama se proyecta en su ranura de la barra. -->
        @if (listo(); as l) {
          <a accion class="boton boton-primario continuar" [routerLink]="rutas.a('/salas')" [queryParams]="{ lugar: l.id }"
             [attr.aria-label]="'Elegir este lugar: ' + l.nombre + ' y continuar'">Continuar <span aria-hidden="true">›</span></a>
        } @else if (elegido(); as l) {
          <span estado class="pronto-texto">{{ l.nombre }} llega pronto</span>
        }
      </app-barra-de-pasos>
    </div>
  `,
  styleUrl: './lugar.component.scss',
})
export class LugarComponent {
  protected readonly rutas = inject(RutasAutoria);
  private readonly biblioteca = inject(BibliotecaService);
  private readonly pintor = inject(PintorDeVistas);
  private readonly router = inject(Router);
  /** Al volver desde el paso 2 llega `?lugar=`: la plantilla que ya se había elegido sigue elegida. */
  private readonly pedido = inject(ActivatedRoute).snapshot.queryParamMap.get('lugar');
  protected readonly nombreTema = nombreTema;
  protected readonly lugares = signal<LugarResumen[]>([]);
  protected readonly tema = signal<string | null>(null);
  /** Los lugares no se pudieron leer. */
  protected readonly fallo = signal(false);
  protected readonly cargando = signal(true);
  protected readonly erroresDetalle = signal<ReadonlySet<string>>(new Set());
  protected readonly elegidoId = signal<string | null>(null);
  /** Escenarios ya leídos, por id de lugar: dan las salas, los personajes y las ideas del panel. */
  protected readonly escenarios = signal<Record<string, Escenario>>({});
  /** Portadas compuestas para los lugares que no traen una (el Hospital, por piezas). */
  private readonly portadas = signal<Record<string, string | null>>({});
  /** Imagen de cada sala, por lugar y por sala. */
  protected readonly vistas = signal<Record<string, Record<string, string | null>>>({});

  /** Solo los temas que algún lugar trae: un filtro que deja la rejilla vacía no ayuda a elegir. */
  protected readonly temasPresentes = computed(() => [...new Set(this.lugares().flatMap((l) => l.temas))]);
  protected readonly filtrados = computed(() => {
    const t = this.tema();
    return this.lugares().filter((l) => !t || l.temas.includes(t));
  });
  protected readonly elegido = computed(() => this.lugares().find((l) => l.id === this.elegidoId()) ?? null);
  /** El elegido, si ya se puede usar: es el que habilita «Continuar». */
  protected readonly listo = computed(() => (this.elegido()?.completo ? this.elegido() : null));
  protected readonly hayDisponibles = computed(() => this.filtrados().some((l) => l.completo));
  protected readonly estado = computed(() => {
    const total = this.filtrados().length;
    const listos = this.filtrados().filter((l) => l.completo).length;
    if (this.fallo()) return '';
    if (this.cargando()) return 'Cargando lugares…';
    return `${total} ${total === 1 ? 'lugar' : 'lugares'} · ${listos} ${listos === 1 ? 'disponible' : 'disponibles'} ahora`;
  });

  private readonly filtro = viewChild<ElementRef<HTMLElement>>('filtro');
  /** Hay fichas escondidas antes o después de lo visible: decide el desvanecido y las flechas de cada borde. */
  protected readonly masInicio = signal(false);
  protected readonly masFin = signal(false);

  constructor() {
    this.cargar();
    // La fila aparece cuando llegan los lugares y cambia de ancho con la ventana: se vuelve a medir en ambos casos.
    effect((limpiar) => {
      const el = this.filtro()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(() => this.medirFiltro());
      observador.observe(el);
      limpiar(() => observador.disconnect());
    });
  }

  protected medirFiltro(): void {
    const el = this.filtro()?.nativeElement;
    if (!el) return;
    this.masInicio.set(el.scrollLeft > 2);
    this.masFin.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  /** Desliza la fila casi un ancho visible (deja ver la última ficha de antes, para no perder el hilo). */
  protected deslizar(sentido: 1 | -1): void {
    const el = this.filtro()?.nativeElement;
    if (!el) return;
    const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: sentido * el.clientWidth * 0.7, behavior: quieto ? 'auto' : 'smooth' });
  }

  protected cargar(): void {
    this.fallo.set(false);
    this.cargando.set(true);
    this.biblioteca.lugares().then((l) => {
      this.lugares.set(l);
      const inicial = l.find((x) => x.id === this.pedido) ?? l.find((x) => x.completo) ?? l[0];
      if (inicial) this.elegir(inicial.id);
      for (const sin of l.filter((x) => !x.portada)) void this.componerPortada(sin.id);
    }).catch(() => this.fallo.set(true)).finally(() => this.cargando.set(false));
  }

  protected portadaDe(l: LugarResumen): string | null {
    return l.portada || this.portadas()[l.id] || null;
  }

  protected elegir(id: string): void {
    this.elegidoId.set(id);
    this.erroresDetalle.update((e) => { const siguiente = new Set(e); siguiente.delete(id); return siguiente; });
    void this.pintarSalas(id);
  }

  /** Intro o doble clic sobre una plantilla disponible: pasa al paso 2 con ese lugar. */
  protected continuar(l: LugarResumen): void {
    if (!l.completo) return;
    void this.router.navigate([this.rutas.a('/salas')], { queryParams: { lugar: l.id } });
  }

  private async leerEscenario(id: string): Promise<Escenario | null> {
    const ya = this.escenarios()[id];
    if (ya) return ya;
    try {
      const e = await this.biblioteca.escenario(id);
      this.escenarios.update((todos) => ({ ...todos, [id]: e }));
      return e;
    } catch {
      this.erroresDetalle.update((e) => new Set(e).add(id));
      return null;
    }
  }

  private async componerPortada(id: string): Promise<void> {
    const primera = (await this.leerEscenario(id))?.salas[0];
    if (!primera) return;
    const src = await this.pintor.vista(id, primera);
    this.portadas.update((p) => ({ ...p, [id]: src }));
  }

  /** Las miniaturas del panel, una por una (las por piezas se componen en el momento): cada una aparece al estar lista. */
  private async pintarSalas(id: string): Promise<void> {
    const e = await this.leerEscenario(id);
    for (const s of e?.salas ?? []) {
      if (this.vistas()[id]?.[s.id] !== undefined) continue;
      const src = await this.pintor.vista(id, s);
      this.vistas.update((v) => ({ ...v, [id]: { ...(v[id] ?? {}), [s.id]: src } }));
    }
  }
}
