import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, effect, inject, linkedSignal,
  signal, untracked, viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { Generation } from '../../../../core/models/generacion.model';
import { CasoStore } from '../../estado/caso.store';
import { GeneracionService } from '../../generacion/generacion.service';
import { rutaDelEditor } from '../../rutas';
import { anuncioDeLasPartes, esNegativa, parteConError, partesDeLaGeneracion } from './avance-partes';
import { ParteAvanceComponent, cuantoLleva } from './parte-avance.component';
import { abrirElCasoNuevo } from '../pasos-crear.component';
import { MaquetaDelCasoComponent } from './maqueta-del-caso.component';
import { VistasDelLugar } from './vistas-del-lugar';

/** Desde qué parte del tope de llamadas se le dice a la docente cuántos intentos con la IA lleva. */
const AVISO_DE_INTENTOS = 0.75;

type Modo = 'generando' | 'listo' | 'fallo' | 'fatal' | 'cancelada';

/**
 * La pantalla de avance de la generación (`casos/nuevo/generando/:generacionId`), donde empieza la demo: la docente ve qué
 * parte va, qué salió, qué falló y qué puede hacer. Llama a `continuar(id)` al entrar y `detener()` al salir.
 *
 * Arriba, cuántas partes van hechas (`role="progressbar"`) y qué se está haciendo ahora (`role="status"`: anuncia solo los
 * cambios de etapa). Debajo, la lista de partes (esqueleto, cada escena, cada ronda de corrección y la revisión de las reglas)
 * con su estado en símbolo y texto; la parte en curso dice cuánto lleva, y la que falló trae el mensaje del servidor y lo que se
 * puede hacer. Al llegar a «listo», «fallo», a una generación que no existe o a una cancelada, el foco va al título. No navega
 * sola: la docente abre su caso con el botón (P4).
 */
@Component({
  selector: 'app-avance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, ParteAvanceComponent, MaquetaDelCasoComponent],
  providers: [VistasDelLugar],
  template: `
    <div class="pagina avance">
      <div class="encabezado">
        <h1 #titulo tabindex="-1">{{ tituloPagina() }}</h1>
        @switch (modo()) {
          @case ('generando') {
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <p class="entrada">La IA escribe tu borrador parte por parte. Cada parte puede tardar un par de minutos.</p>
          }
          @case ('listo') {
            <p class="entrada">Lo marcado «Sugerido por la IA» espera tu revisión.</p>
            <p class="entrada destacada">{{ textoPorResolver() }}</p>
            <div class="acciones">
              <button type="button" class="boton boton-primario" (click)="abrirMiCaso()">Abrir mi caso</button>
            </div>
          }
          @case ('fallo') {
            <p class="entrada">La IA dejó partes que no cumplen las reglas del documento. Prueba a describir el caso de otra forma.</p>
            <div class="acciones">
              <button type="button" class="boton boton-primario" [attr.aria-disabled]="cancelando()" (click)="empezarDeNuevo()">
                Empezar de nuevo
              </button>
            </div>
            @if (errorAlCancelar()) {
              <p class="aviso-error tarjeta" role="alert">{{ errorAlCancelar() }}</p>
            }
          }
          @case ('fatal') {
            <div class="tarjeta aviso-error" role="alert">
              <p>{{ error()?.mensaje }}</p>
            </div>
            <div class="acciones">
              <a class="boton boton-primario" [routerLink]="rutaVolver" [queryParams]="consultaVolver()">Volver a crear un caso</a>
            </div>
          }
          @case ('cancelada') {
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <p class="entrada">Se canceló en otra pestaña o en una visita anterior. Puedes empezar uno nuevo.</p>
            <div class="acciones">
              <a class="boton boton-primario" [routerLink]="rutaVolver">Volver a crear un caso</a>
            </div>
          }
        }
      </div>

      @if (modo() === 'generando' || modo() === 'listo' || modo() === 'fallo') {
        <section class="panel tarjeta" aria-label="Avance de tu caso">
          <p class="caso">
            <span class="rotulo">Tu caso</span>
            @if (tituloCaso(); as t) {
              <span class="titulo-caso">«{{ t }}»</span>
            } @else {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <span class="titulo-caso por-saber">El título llega con el esqueleto.</span>
            }
          </p>

          @if (modo() === 'generando') {
            <div class="medidor">
              <div class="cuenta-fila">
                <p class="cuenta" [class.por-saber]="!cuenta()">{{ textoCuenta() }}</p>
                @if (textoIntentos(); as intentos) {
                  <p class="intentos">{{ intentos }}</p>
                }
              </div>
              <div class="barra" role="progressbar" aria-label="Partes hechas de tu caso" aria-valuemin="0"
                   [attr.aria-valuemax]="cuenta()?.total ?? null" [attr.aria-valuenow]="cuenta()?.hechas ?? null"
                   [attr.aria-valuetext]="textoValor()">
                <span class="relleno" [style.--avance]="fraccion()"></span>
              </div>
              <p class="ahora">
                @if (anuncio()) {
                  <span class="rotulo" aria-hidden="true">Ahora</span>
                } @else if (detenidoEn(); as donde) {
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <span class="detenido"><span aria-hidden="true">! </span>Se detuvo en «{{ donde }}».</span>
                }
                <span role="status">{{ anuncio() }}</span>
                <!-- Cuánto lleva lo de ahora: se ve sin bajar, pero fuera de la región viva (no se anuncia cada segundo). -->
                @if (anuncio() && llevaAhora(); as lleva) {
                  <span class="lleva" aria-hidden="true">· {{ lleva }}</span>
                }
              </p>
              @if (error() && !errorEn()) {
                <ng-container *ngTemplateOutlet="problema" />
              }
            </div>
          }

          <app-maqueta-del-caso [generacion]="g()" [partes]="partes()" [escenario]="lugar.escenario()" [vistas]="lugar.vistas()" />

          <ol class="partes" aria-label="Las partes de tu caso">
            @for (p of partes(); track p.clave) {
              <li appParteAvance [parte]="p" [segundos]="segundos(p.clave)">
                @if (p.clave === errorEn()) {
                  <ng-container *ngTemplateOutlet="problema" />
                }
              </li>
            }
          </ol>
        </section>
      }

      @if (modo() === 'generando') {
        <div class="pie">
          <p class="texto-secundario">Puedes cerrar esta página: el avance se guarda y podrás retomarlo.</p>
          @if (!sinIntentos()) {
            <div class="acciones">
              <button type="button" class="boton" [attr.aria-disabled]="cancelando()" (click)="empezarDeNuevo()">
                Cancelar y empezar de nuevo
              </button>
            </div>
          }
          @if (errorAlCancelar()) {
            <p class="aviso-error tarjeta" role="alert">{{ errorAlCancelar() }}</p>
          }
        </div>
      }
    </div>

    <ng-template #problema>
      @if (error(); as e) {
        <div class="problema">
          <div role="alert">
            <p class="mensaje">{{ e.mensaje }}</p>
            @if (negativa()) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <p class="pista">
                Si vuelve a negarse, usa «Cancelar y empezar de nuevo»: vuelves a la descripción con el mismo lugar y puedes contarla con
                otras palabras.
              </p>
            }
          </div>
          <div class="acciones">
            @if (e.reintentable) {
              <button type="button" class="boton boton-primario" (click)="reintentar()">Reintentar esta parte</button>
            } @else if (sinIntentos()) {
              <!-- BORRADOR: texto del brief de la Tarea 11c, pendiente de la aprobación de Psicología -->
              <button type="button" class="boton boton-primario" [attr.aria-disabled]="cancelando()" (click)="empezarDeNuevo()">
                Empezar un caso nuevo
              </button>
            }
          </div>
        </div>
      }
    </ng-template>
  `,
  styles: `
    .avance { gap: 1.5rem; max-inline-size: 60rem; }
    .encabezado { display: flex; flex-direction: column; gap: 0.75rem; }
    .encabezado h1:focus { outline: 3px solid var(--foco); outline-offset: 4px; }
    .encabezado p { margin: 0; }
    .entrada { font-size: var(--autoria-texto-18); line-height: 1.75rem; color: var(--texto-secundario); }
    .entrada.destacada { color: var(--tinta); font-weight: 600; }
    .acciones { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }
    .aviso-error { display: flex; flex-direction: column; gap: 0.75rem; margin: 0; border: 2px solid var(--peligro); background: var(--peligro-tinte); }
    .aviso-error p { margin: 0; }

    .panel { display: flex; flex-direction: column; gap: 1.25rem; padding: 1.5rem; }
    .panel p { margin: 0; }
    .rotulo {
      display: block;
      color: var(--texto-secundario);
      font-size: var(--autoria-texto-14);
      font-weight: 700;
      line-height: 1.25rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .caso { display: flex; flex-direction: column; gap: 0.125rem; }
    .titulo-caso { font-size: var(--autoria-texto-24); font-weight: 700; line-height: 2rem; overflow-wrap: anywhere; }
    .titulo-caso.por-saber { color: var(--texto-secundario); font-size: var(--autoria-texto-18); font-weight: 600; line-height: 2rem; }

    .medidor {
      display: flex; flex-direction: column; gap: 0.625rem;
      padding-block-end: 1.25rem; border-block-end: 1px solid var(--linea);
    }
    .cuenta-fila { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 1rem; }
    .cuenta { font-size: var(--autoria-texto-20); font-weight: 700; line-height: 1.75rem; font-variant-numeric: tabular-nums; }
    .cuenta.por-saber { color: var(--texto-secundario); font-size: var(--autoria-texto-16); font-weight: 600; line-height: 1.5rem; }
    .intentos { color: var(--aviso-texto); font-size: var(--autoria-texto-16); font-weight: 700; }
    .barra {
      position: relative;
      block-size: 0.75rem;
      overflow: hidden;
      border: 1px solid var(--borde-control);
      border-radius: 999px;
      background: var(--fondo-hundido);
    }
    .relleno {
      position: absolute;
      inset: 0;
      background: var(--primario);
      transform: scaleX(var(--avance, 0));
      transform-origin: left center;
      transition: transform var(--ds-dur-base) var(--ds-ease-out);
    }
    .ahora {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem;
      min-block-size: 1.75rem; font-size: var(--autoria-texto-16); line-height: 1.5rem;
    }
    .ahora .rotulo { display: inline; }
    .lleva { color: var(--primario-oscuro); font-weight: 600; font-variant-numeric: tabular-nums; }
    .detenido { color: var(--peligro); font-weight: 700; }

    .partes { --hueco: 0.25rem; display: flex; flex-direction: column; gap: var(--hueco); margin: 0; padding: 0; list-style: none; }

    .problema { display: flex; flex-direction: column; gap: 0.75rem; margin-block-start: 0.5rem; }
    .problema .mensaje { color: var(--peligro); font-size: var(--autoria-texto-16); font-weight: 700; line-height: 1.5rem; }
    .problema .pista { margin-block-start: 0.25rem; font-size: var(--autoria-texto-16); line-height: 1.5rem; }

    .pie { display: flex; flex-direction: column; gap: 0.75rem; }
    .pie p { margin: 0; font-size: var(--autoria-texto-16); }

    @media (max-width: 40rem) {
      .panel { padding: 1rem 0.75rem; }
      .partes { --sangria: 0.375rem; }
      .acciones .boton { flex: 1 1 100%; }
    }
  `,
})
export class AvanceComponent implements OnInit, OnDestroy {
  private readonly generacion = inject(GeneracionService);
  private readonly router = inject(Router);
  private readonly store = inject(CasoStore);
  private readonly injector = inject(Injector);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('generacionId') ?? '';
  private readonly titulo = viewChild.required<ElementRef<HTMLElement>>('titulo');
  /** El lugar de la generación, con la imagen de cada sala: alimenta la maqueta escena por escena. */
  protected readonly lugar = inject(VistasDelLugar);

  protected readonly error = this.generacion.error;
  protected readonly cancelando = signal(false);
  protected readonly errorAlCancelar = signal<string | null>(null);
  /** La parte que la docente mandó reintentar: se ve en curso al instante, sin esperar la primera respuesta. */
  private readonly reintentando = signal<string | null>(null);

  /** La generación de esta pantalla: lo que el servicio guarda de otra generación (de una visita anterior) no cuenta. */
  protected readonly g = computed<Generation | null>(() => {
    const g = this.generacion.generacion();
    return g && g.id === this.id ? g : null;
  });
  private readonly etapa = computed(() => (this.g() ? this.generacion.etapa() : null));

  protected readonly modo = computed<Modo>(() => {
    if (this.error()?.fatal) return 'fatal';
    const g = this.g();
    if (g?.status === 'imported') return 'listo';
    if (g?.status === 'failed') return 'fallo';
    // Sin generación, sin error y sin nada en marcha, la corrida terminó en `cancelled` (el servicio la suelta).
    if (!g && !this.error() && !this.generacion.trabajando() && !this.cancelando()) return 'cancelada';
    return 'generando';
  });

  protected readonly rutaVolver = rutaDelEditor('/salas', null);
  protected readonly consultaVolver = computed(() => {
    const lugar = this.g()?.lugarId;
    return lugar ? { lugar } : null;
  });

  protected readonly tituloPagina = computed(() => {
    switch (this.modo()) {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      case 'fatal': return 'No pudimos seguir armando tu caso';
      // BORRADOR: textos del brief de la Tarea 9, pendientes de la aprobación de Psicología
      case 'listo': return 'Tu caso está listo como borrador';
      case 'fallo': return 'No pudimos armar un caso que se pueda abrir';
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      case 'cancelada': return 'Este caso se canceló';
      default: return 'Estamos armando tu caso';
    }
  });

  protected readonly tituloCaso = computed(() => this.g()?.skeleton?.titulo ?? null);

  /** Las rondas de corrección que esta pantalla vio, con sus escenas: al terminar la ronda el servidor ya no las trae. */
  private readonly rondasVistas = linkedSignal<Generation['repair'], Record<number, readonly string[]>>({
    source: () => this.g()?.repair ?? null,
    computation: (repair, previo) => (repair ? { ...previo?.value, [repair.round]: repair.scenes } : previo?.value ?? {}),
  });

  protected readonly partes = computed(() => partesDeLaGeneracion({
    g: this.g(),
    error: this.error(),
    etapa: this.etapa(),
    trabajando: this.generacion.trabajando(),
    reintentando: this.reintentando(),
    // Se lee siempre, no solo después de una ronda: así recuerda las escenas de cada ronda mientras el servidor las trae.
    rondasVistas: this.rondasVistas(),
  }));

  /** Dónde va la alerta de un error: junto a la parte que falló (o, si no se sabe cuál, en el resumen de arriba). */
  protected readonly errorEn = computed(() => parteConError(this.g(), this.error(), this.partes()));

  /** La IA se negó a escribir la parte que falló (`refusal`): se sugiere contar el caso con otras palabras. */
  protected readonly negativa = computed(() => esNegativa(this.g(), this.error()));

  /** Se acabaron los intentos con la IA (`GENERATION_CALLS_EXHAUSTED`): lo único que queda es empezar otro caso. */
  protected readonly sinIntentos = computed(() => {
    const e = this.error();
    return !!e && !e.reintentable && !e.fatal;
  });

  protected readonly cuenta = computed(() => {
    if (!this.g()?.scenes.length) return null; // sin esqueleto no se sabe cuántas partes habrá
    const contadas = this.partes().filter((p) => p.tipo !== 'escenas-por-saber');
    return { hechas: contadas.filter((p) => p.estado === 'hecha').length, total: contadas.length };
  });
  protected readonly fraccion = computed(() => {
    const c = this.cuenta();
    return c ? c.hechas / c.total : 0;
  });
  // BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
  protected readonly textoCuenta = computed(() => {
    const c = this.cuenta();
    if (c) return `${c.hechas} de ${c.total} partes hechas`;
    return this.g() || this.error() ? 'Aún no sabemos cuántas partes tendrá tu caso.' : 'Leyendo el avance de tu caso…';
  });
  protected readonly textoValor = computed(() => {
    const c = this.cuenta();
    return c ? `${c.hechas} de ${c.total} partes hechas` : 'Armando el esqueleto: todavía no sabemos cuántas partes tendrá el caso';
  });
  protected readonly textoIntentos = computed(() => {
    const g = this.g();
    if (!g || g.callsLimit <= 0 || g.callsUsed / g.callsLimit < AVISO_DE_INTENTOS) return null;
    // BORRADOR: texto del brief de la Tarea 11c, pendiente de la aprobación de Psicología
    return `Usaste ${g.callsUsed} de ${g.callsLimit} intentos con la IA.`;
  });
  protected readonly textoPorResolver = computed(() => {
    const n = this.g()?.issues.length ?? 0;
    // BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
    if (!n) return 'Sin faltas: no quedó nada por resolver.';
    return n === 1 ? 'Queda 1 cosa por resolver en el editor.' : `Quedan ${n} cosas por resolver en el editor.`;
  });

  /**
   * Lo que se está haciendo ahora, para la región viva: cambia solo cuando cambia la etapa (nunca con el contador). Con un error,
   * en «listo» o en «fallo» queda vacía: lo dicen la alerta y el foco en el título.
   */
  protected readonly anuncio = computed(() => {
    const g = this.g();
    return this.error() || this.modo() !== 'generando' || !g ? '' : anuncioDeLasPartes(g, this.partes());
  });

  protected readonly detenidoEn = computed(() => {
    const clave = this.errorEn();
    return clave ? this.partes().find((p) => p.clave === clave)?.nombre ?? null : null;
  });

  /** Las partes en curso. Solo cambia cuando cambia cuáles son (no cada vez que se relee la generación). */
  private readonly enCurso = computed(() => this.partes().filter((p) => p.estado === 'en-curso').map((p) => p.clave), {
    equal: (a, b) => a.length === b.length && a.every((clave, i) => clave === b[i]),
  });
  /** Desde cuándo (reloj del navegador) ve esta pantalla en curso cada parte: de ahí sale «lleva 40 s». */
  private readonly inicios = linkedSignal<string[], Record<string, number>>({
    source: this.enCurso,
    computation: (claves, previo) => {
      const ahora = Date.now();
      return Object.fromEntries(claves.map((clave) => [clave, previo?.value[clave] ?? ahora]));
    },
  });
  /** El reloj del contador: avanza cada segundo mientras hay algo en curso. */
  private readonly ahora = signal(Date.now());

  constructor() {
    // En cuanto la generación dice su lugar, se leen sus salas para la maqueta (una vez; las imágenes llegan solas).
    effect(() => {
      const lugarId = this.g()?.lugarId;
      if (lugarId) untracked(() => void this.lugar.cargar(lugarId));
    });
    // Al llegar a «listo», «fallo», a una generación que no existe o a una cancelada, el foco va al título con su texto nuevo.
    effect(() => {
      if (this.modo() !== 'generando') afterNextRender(() => this.titulo().nativeElement.focus(), { injector: this.injector });
    });
    effect((alLimpiar) => {
      if (!this.enCurso().length) return;
      const reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
      alLimpiar(() => clearInterval(reloj));
    });
    // Lo que pidió «Reintentar» vale hasta que la corrida publica su etapa: desde ahí la etapa dice qué está en curso.
    effect(() => {
      this.generacion.etapa();
      untracked(() => this.reintentando.set(null));
    });
  }

  ngOnInit(): void {
    void this.generacion.continuar(this.id);
  }

  ngOnDestroy(): void {
    this.generacion.detener();
  }

  /** «lleva 40 s» de la primera parte en curso, para la línea «Ahora». */
  protected readonly llevaAhora = computed(() => {
    const clave = this.enCurso()[0];
    const s = clave ? this.segundos(clave) : null;
    return s === null ? null : cuantoLleva(s);
  });

  protected segundos(clave: string): number | null {
    const inicio = this.inicios()[clave];
    return inicio === undefined ? null : Math.max(0, (this.ahora() - inicio) / 1000);
  }

  /** Reintenta la parte que falló y deja el foco en ella (el botón desaparece al reintentar). */
  protected reintentar(): void {
    const clave = this.errorEn();
    this.reintentando.set(clave);
    void this.generacion.reintentar();
    if (!clave) return;
    afterNextRender(() => {
      const fila = [...this.anfitrion.nativeElement.querySelectorAll<HTMLElement>('li.parte')].find((li) => li.dataset['parte'] === clave);
      fila?.focus();
    }, { injector: this.injector });
  }

  protected abrirMiCaso(): void {
    const id = this.g()?.caseVersionId;
    // Lo primero que hay por revisar es el guion de la primera escena: se abre ahí y no en la pantalla del caso.
    if (id) void abrirElCasoNuevo(this.store, this.router, id);
  }

  /**
   * Cancela esta generación (si ya terminó, el servicio lo da por hecho) y vuelve al paso 2 con el mismo lugar. Si cancelar
   * falla, lo dice y, si no había un error a la vista, la generación sigue: la pantalla no se queda quieta.
   */
  protected async empezarDeNuevo(): Promise<void> {
    if (this.cancelando()) return;
    const lugarId = this.g()?.lugarId;
    const habiaError = !!this.error();
    this.cancelando.set(true);
    this.errorAlCancelar.set(null);
    try {
      await this.generacion.cancelar(this.id);
    } catch {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      this.errorAlCancelar.set('No pudimos cancelar el caso. Vuelve a intentarlo.');
      this.cancelando.set(false);
      if (!habiaError && this.modo() === 'generando') void this.generacion.continuar(this.id);
      return;
    }
    // `cancelando` sigue encendido hasta que la página cambia: así no se ve «Este caso se canceló» por un instante.
    const destino = lugarId ? `/salas?lugar=${encodeURIComponent(lugarId)}` : '/salas';
    await this.router.navigateByUrl(rutaDelEditor(destino, null));
  }
}
