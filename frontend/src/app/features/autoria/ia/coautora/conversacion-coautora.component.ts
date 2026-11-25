import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, effect, inject, input, output, signal,
  untracked, viewChild,
} from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import {
  type Acuerdo, CoautoriaApi, type DestinoCoautora, type Eleccion, type FichaAcordada,
} from '../../../../core/api/coautoria.api';
import { ResumenAcordadoComponent } from './resumen-acordado.component';
import { type PreguntaVisible, TarjetaPreguntaComponent } from './tarjeta-pregunta.component';

export const MINIMO_IDEA = 10;
export const MAXIMO_IDEA = 2000;

type Trabajo = 'empezar' | 'preguntar' | 'responder' | 'saltar' | 'resumir' | 'cambiar' | 'corregir' | 'aceptar' | 'cancelar';

// BORRADOR: textos nuevos, pendientes de la aprobación de Psicología (VD-23).
const PENSANDO: Record<Trabajo, string> = {
  empezar: 'La IA está leyendo tu idea…',
  preguntar: 'La IA está pensando la siguiente pregunta…',
  responder: 'La IA está pensando la siguiente pregunta…',
  saltar: 'Pasando al resumen…',
  resumir: 'La IA está escribiendo lo que acordamos…',
  cambiar: 'La IA está aplicando tu cambio…',
  corregir: 'Guardando tu corrección…',
  aceptar: 'Guardando lo que acordamos…',
  cancelar: 'Cerrando la conversación…',
};
const MENSAJE_APAGADA = 'La IA no está disponible por ahora. Puedes seguir a mano.';
const MENSAJE_FALLO = 'No pudimos hablar con la IA. Vuelve a intentarlo en un momento.';

interface ErrorVisible {
  mensaje: string;
  /** Lo que hace «Volver a intentarlo»; sin él, no se ofrece. */
  reintentar?: () => void;
}

/**
 * La conversación con la IA coautora (SIEP-269, diseño §4 ①–③): la idea, la ronda de preguntas y «Lo que acordamos».
 * La usan «Describe tu caso» (caso nuevo: al aceptar, la generación arranca en el servidor) y el panel de la IA del
 * editor (caso abierto). Todo lo decide el servidor; aquí solo se muestra y se manda lo que elige el docente.
 */
@Component({
  selector: 'app-conversacion-coautora',
  imports: [TarjetaPreguntaComponent, ResumenAcordadoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="conversacion-coautora">
      <p class="sr-only" role="status" aria-live="polite">{{ anuncio() }}</p>

      @if (!acuerdo()) {
        <form class="idea" novalidate (submit)="$event.preventDefault(); empezar()">
          <label [for]="idIdea" class="etiqueta">{{ etiquetaIdea() }}</label>
          <p [id]="idIdea + '-ayuda'" class="ayuda">
            Con poco o mucho detalle. La IA te hará algunas preguntas antes de construir, para que el caso quede como lo imaginas.
          </p>
          <textarea #campoIdea class="campo" [id]="idIdea" rows="5" [attr.maxlength]="maximo" [value]="idea()"
                    [attr.aria-describedby]="idIdea + '-ayuda' + (errorIdea() ? ' ' + idIdea + '-error' : '')"
                    [attr.aria-invalid]="errorIdea() ? 'true' : null"
                    (input)="escribirIdea($event)" (keydown.control.enter)="empezar()"></textarea>
          @if (errorIdea()) {
            <p [id]="idIdea + '-error'" class="error-campo" role="alert">{{ errorIdea() }}</p>
          }
          @if (error(); as e) {
            <div class="aviso-error" role="alert">
              <p>{{ e.mensaje }}</p>
              @if (e.reintentar) {
                <button type="button" class="boton" (click)="e.reintentar()">Volver a intentarlo</button>
              }
            </div>
          }
          <div class="acciones">
            <button type="submit" class="boton boton-primario" [attr.aria-disabled]="!puedeEmpezar()">
              {{ trabajando() === 'empezar' ? 'Empezando…' : 'Conversar con la IA' }}
            </button>
            @if (!ideaSuficiente()) {
              <span class="ayuda">Escribe al menos {{ minimo }} caracteres.</span>
            }
          </div>
        </form>
      } @else {
        @let a = acuerdo()!;
        <ol class="hilo" aria-label="Lo que ya conversaron">
          <li class="burbuja tu"><span class="quien">Tu idea</span>{{ a.idea }}</li>
          @for (r of a.respuestas; track r.numero) {
            <li class="burbuja ia"><span class="quien">IA · Pregunta {{ r.numero }}</span>{{ r.pregunta }}</li>
            <li class="burbuja tu">
              <span class="quien">Tú</span>{{ r.respuesta }}
              @if (puedeCambiarRespuestas()) {
                <button type="button" class="boton boton-texto cambiar" (click)="reabrir(r.numero)"
                        [attr.aria-label]="'Cambiar la respuesta a la pregunta ' + r.numero">Cambiar</button>
              }
            </li>
          }
        </ol>

        @if (trabajando(); as t) {
          <p class="pensando" role="status"><span class="punto" aria-hidden="true"></span>{{ textoPensando()[t] }}</p>
        }

        @if (error(); as e) {
          <div class="aviso-error" role="alert">
            <p>{{ e.mensaje }}</p>
            @if (e.reintentar) {
              <button type="button" class="boton" (click)="e.reintentar()">Volver a intentarlo</button>
            }
          </div>
        }

        <!-- Una tarjeta por pregunta (la clave es su número): cada pregunta nueva entra con su resorte. -->
        @for (p of preguntaEnLista(); track p.numero + (p.previa ? '-cambio' : '')) {
          <app-tarjeta-pregunta [pregunta]="p" [tope]="a.topePreguntas" [ocupado]="!!trabajando()"
                                (responder)="responder($event)" (saltar)="saltar()" (cancelar)="reabierta.set(null)" />
        }
        @if (!preguntaVisible() && a.status === 'summarized' && a.ficha) {
          <app-resumen-acordado [ficha]="a.ficha" [ocupado]="!!trabajando()"
                                (aceptar)="aceptar()" (cambiar)="cambiar($event)" (corregir)="corregir($event)" />
        } @else if (a.status === 'accepted') {
          <div class="acordado" role="status">
            <p class="destacado">¡Acordado!</p>
            <p>{{ a.generationId ? 'La IA empieza a construir el caso con lo que acordaron.' : textoAcordadoEnEditor }}</p>
          </div>
        }

        @if (a.status !== 'accepted') {
          <div class="pie">
            <button type="button" class="boton boton-texto" [attr.aria-disabled]="!!trabajando()" (click)="empezarDeNuevo()">
              Empezar de nuevo
            </button>
          </div>
        } @else if (!a.generationId) {
          <div class="pie">
            <button type="button" class="boton" (click)="reiniciar()">Conversar sobre otra idea</button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    /* Resortes (los mismos de resortes.ts); dentro del panel de la IA ya vienen heredados. */
    :host {
      display: block;
      --resorte-vivo: linear(0, 0.0181, 0.0958, 0.2108, 0.3444, 0.4825, 0.6145, 0.7336, 0.8356, 0.9187, 0.9829, 1.0296, 1.0607, 1.0787, 1.0862, 1.0859, 1.0799, 1.0704, 1.0591, 1.0471, 1.0355, 1.03, 1.0202, 1.0118, 1.0051, 1.0001, 0.9965, 0.9941, 0.9929, 0.9925, 0.9927, 0.9933, 0.9942, 0.9952, 0.9962, 0.9972, 0.9981, 0.9989, 0.9995, 0.9999, 1);
      --resorte-firme: linear(0, 0.0278, 0.0747, 0.134, 0.2006, 0.2705, 0.3409, 0.4096, 0.4753, 0.5369, 0.5939, 0.6461, 0.6933, 0.7357, 0.7734, 0.8067, 0.8359, 0.8614, 0.8836, 0.9027, 0.919, 0.933, 0.9449, 0.955, 0.9634, 0.9705, 0.9764, 0.9813, 0.9853, 0.9886, 0.9912, 0.9934, 0.9951, 0.9965, 0.9976, 0.9984, 0.9991, 0.9996, 0.9999, 1);
    }
    .conversacion-coautora { display: flex; flex-direction: column; gap: 12px; }
    .idea { display: flex; flex-direction: column; gap: 6px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .ayuda { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5; }
    .campo {
      min-block-size: 7rem; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); line-height: 1.5;
      border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); resize: vertical;
    }
    .campo[aria-invalid='true'] { border-color: var(--peligro); }
    .error-campo { margin: 0; color: var(--peligro); font-weight: 700; }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
    .hilo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .burbuja {
      max-inline-size: 92%; padding: 8px 12px; border-radius: 12px; font-size: var(--autoria-texto-16); line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .burbuja.ia {
      align-self: flex-start; border: 1px solid var(--linea); border-end-start-radius: 4px;
      background: color-mix(in srgb, var(--primario) 6%, var(--superficie));
    }
    .burbuja { animation: burbuja-entra 650ms var(--resorte-vivo) both; }
    .burbuja.ia { transform-origin: left bottom; }
    .burbuja.tu { transform-origin: right bottom; }
    @keyframes burbuja-entra { from { opacity: 0; scale: 0.85; translate: 0 8px; } }
    .burbuja.tu { align-self: flex-end; border-end-end-radius: 4px; background: color-mix(in srgb, var(--primario) 22%, var(--superficie)); }
    .quien { display: block; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.02em; opacity: 0.8; }
    .cambiar { display: block; margin-block-start: 2px; padding: 0; min-block-size: 0; }
    .pensando { margin: 0; display: flex; align-items: center; gap: 8px; font-size: var(--autoria-texto-16); }
    .punto {
      inline-size: 10px; block-size: 10px; border-radius: 50%; background: var(--primario);
      animation: latido 1.1s ease-in-out infinite;
    }
    @keyframes latido { 0%, 100% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }
    .aviso-error {
      display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding: 10px 12px;
      border: 1px solid var(--peligro); border-radius: var(--radio-control); background: var(--peligro-tinte);
    }
    .aviso-error p { margin: 0; font-size: var(--autoria-texto-16); }
    .acordado { animation: burbuja-entra 650ms var(--resorte-vivo) both; }
    .aviso-error { animation: sacudir 420ms var(--resorte-firme); }
    @keyframes sacudir { 0% { translate: 0; } 25% { translate: -6px; } 50% { translate: 5px; } 75% { translate: -3px; } 100% { translate: 0; } }
    .acordado { padding: 12px 14px; border-radius: var(--radio-control); background: color-mix(in srgb, var(--primario) 18%, var(--superficie)); }
    .acordado p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5; }
    .destacado { font-weight: 700; }
    .pie { display: flex; justify-content: flex-end; }
    .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { .punto, .burbuja, .acordado, .aviso-error { animation: none; } }
  `,
})
export class ConversacionCoautoraComponent implements OnInit {
  readonly destino = input.required<DestinoCoautora>();
  readonly ideaInicial = input('');
  /** Empieza sola con `ideaInicial` (desde «Describe tu caso», donde la idea ya se escribió). */
  readonly autoEmpezar = input(false);
  readonly etiquetaIdea = input('Cuéntale a la IA el caso que quieres construir');
  readonly aceptado = output<Acuerdo>();
  readonly ideaCambiada = output<string>();

  private readonly api = inject(CoautoriaApi);
  private readonly campoIdea = viewChild<ElementRef<HTMLTextAreaElement>>('campoIdea');
  private readonly injector = inject(Injector);

  protected readonly minimo = MINIMO_IDEA;
  protected readonly maximo = MAXIMO_IDEA;
  protected readonly idIdea = `idea-${Math.random().toString(36).slice(2, 9)}`;
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (VD-23).
  protected readonly textoAcordadoEnEditor =
    'La ficha quedó guardada con el caso. Puedes seguir editando a mano o pedirle cambios a la IA en «Pedir un cambio».';
  protected readonly textoPensando = signal(PENSANDO);

  protected readonly idea = signal('');
  protected readonly acuerdo = signal<Acuerdo | null>(null);
  protected readonly trabajando = signal<Trabajo | null>(null);
  protected readonly error = signal<ErrorVisible | null>(null);
  protected readonly errorIdea = signal<string | null>(null);
  protected readonly anuncio = signal('');
  /** La pregunta ya respondida que el docente volvió a abrir para cambiarla. */
  protected readonly reabierta = signal<number | null>(null);

  protected readonly ideaSuficiente = computed(() => this.idea().trim().length >= MINIMO_IDEA);
  protected readonly puedeEmpezar = computed(() => this.ideaSuficiente() && !this.trabajando());
  protected readonly puedeCambiarRespuestas = computed(() => {
    const a = this.acuerdo();
    return !!a && !this.trabajando() && ['clarifying', 'ready', 'summarized'].includes(a.status) && this.reabierta() === null;
  });
  protected readonly preguntaEnLista = computed(() => {
    const p = this.preguntaVisible();
    return p ? [p] : [];
  });
  protected readonly preguntaVisible = computed<PreguntaVisible | null>(() => {
    const a = this.acuerdo();
    if (!a) return null;
    const n = this.reabierta();
    if (n !== null) {
      const r = a.respuestas.find((x) => x.numero === n);
      return r ? { ...r, texto: r.pregunta, previa: r.eleccion } : null;
    }
    return a.status === 'clarifying' && a.pregunta ? a.pregunta : null;
  });

  constructor() {
    // Sin más preguntas, el resumen se pide solo (una vez por llegada a `ready`, y no si la última petición falló).
    effect(() => {
      const a = this.acuerdo();
      if (a?.status !== 'ready') return;
      untracked(() => {
        if (!this.trabajando() && !this.error()) void this.resumir();
      });
    });
  }

  ngOnInit(): void {
    this.idea.set(this.ideaInicial());
    if (this.autoEmpezar() && this.ideaSuficiente()) void this.empezar();
  }

  protected escribirIdea(evento: Event): void {
    this.idea.set((evento.target as HTMLTextAreaElement).value);
    this.errorIdea.set(null);
    this.ideaCambiada.emit(this.idea());
  }

  protected async empezar(): Promise<void> {
    if (!this.puedeEmpezar()) return;
    this.errorIdea.set(null);
    const acuerdo = await this.ejecutar('empezar', this.api.iniciar(this.idea().trim(), this.destino()), () => this.empezar());
    if (!acuerdo) return;
    if (acuerdo.error) {
      this.error.set({ mensaje: acuerdo.error.message, reintentar: () => this.pedirPregunta() });
    }
  }

  protected pedirPregunta(): Promise<Acuerdo | null> {
    const a = this.acuerdo();
    if (!a) return Promise.resolve(null);
    return this.ejecutar('preguntar', this.api.pedirPregunta(a.id), () => this.pedirPregunta());
  }

  protected async responder(eleccion: Eleccion): Promise<void> {
    const a = this.acuerdo();
    const numero = this.reabierta() ?? a?.pregunta?.numero;
    if (!a || !numero) return;
    this.reabierta.set(null);
    await this.ejecutar('responder', this.api.responder(a.id, numero, eleccion), () => this.pedirPregunta());
  }

  protected async saltar(): Promise<void> {
    const a = this.acuerdo();
    if (a) await this.ejecutar('saltar', this.api.saltar(a.id), () => this.saltar());
  }

  protected async resumir(): Promise<void> {
    const a = this.acuerdo();
    if (a) await this.ejecutar('resumir', this.api.resumir(a.id), () => this.resumir());
  }

  protected async cambiar(texto: string): Promise<void> {
    const a = this.acuerdo();
    if (a) await this.ejecutar('cambiar', this.api.resumir(a.id, texto), () => this.cambiar(texto));
  }

  protected async corregir(ficha: FichaAcordada): Promise<void> {
    const a = this.acuerdo();
    if (a) await this.ejecutar('corregir', this.api.corregir(a.id, ficha), () => this.corregir(ficha));
  }

  protected async aceptar(): Promise<void> {
    const a = this.acuerdo();
    if (!a) return;
    const aceptado = await this.ejecutar('aceptar', this.api.aceptar(a.id), () => this.aceptar());
    if (aceptado?.status === 'accepted') this.aceptado.emit(aceptado);
  }

  protected reabrir(numero: number): void {
    this.error.set(null);
    this.reabierta.set(numero);
  }

  /** Cancela la conversación abierta (sin esperar a que la IA termine lo que pensaba) y vuelve a la idea. */
  protected async empezarDeNuevo(): Promise<void> {
    const a = this.acuerdo();
    if (!a || this.trabajando()) return;
    await this.ejecutar('cancelar', this.api.cancelar(a.id), () => this.empezarDeNuevo());
    this.reiniciar();
  }

  protected reiniciar(): void {
    this.acuerdo.set(null);
    this.error.set(null);
    this.reabierta.set(null);
    afterNextRender(() => this.campoIdea()?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Corre una petición: marca el trabajo, guarda el acuerdo que vuelve y anuncia lo nuevo. Ante un error lo explica con un
   * mensaje fijo y, si tiene sentido, ofrece «Volver a intentarlo» (que repite lo que corresponde al estado ya releído).
   */
  private async ejecutar(trabajo: Trabajo, peticion: Observable<Acuerdo>, reintentar: () => unknown): Promise<Acuerdo | null> {
    this.trabajando.set(trabajo);
    this.error.set(null);
    this.anuncio.set(PENSANDO[trabajo]);
    try {
      const acuerdo = await firstValueFrom(peticion);
      this.acuerdo.set(acuerdo);
      this.anunciar(acuerdo);
      return acuerdo;
    } catch (e) {
      await this.mostrarError(e, trabajo, reintentar);
      return null;
    } finally {
      this.trabajando.set(null);
    }
  }

  private anunciar(a: Acuerdo): void {
    if (a.status === 'clarifying' && a.pregunta) this.anuncio.set(`Pregunta ${a.pregunta.numero} de ${a.topePreguntas}: ${a.pregunta.texto}`);
    else if (a.status === 'summarized') this.anuncio.set('Listo el resumen: lo que acordamos.');
    else if (a.status === 'accepted') this.anuncio.set('Acordado.');
    else this.anuncio.set('');
  }

  private async mostrarError(e: unknown, trabajo: Trabajo, reintentar: () => unknown): Promise<void> {
    const estado = e instanceof HttpErrorResponse ? e.status : 0;
    const cuerpo = e instanceof HttpErrorResponse ? (e.error as { code?: string; message?: string; field?: string } | null) : null;
    const mensaje = cuerpo?.message || MENSAJE_FALLO;
    this.anuncio.set('');
    if (trabajo === 'empezar' && estado === 400 && cuerpo?.field === 'idea') {
      this.errorIdea.set(mensaje);
      afterNextRender(() => this.campoIdea()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    if (estado === 404) {
      this.error.set({ mensaje: trabajo === 'empezar' ? MENSAJE_APAGADA : mensaje });
      return;
    }
    if (estado === 429 || cuerpo?.code === 'COAUTHOR_EXHAUSTED' || cuerpo?.code === 'GENERATION_IN_PROGRESS') {
      this.error.set({ mensaje });
      return;
    }
    // El estado del servidor pudo cambiar (por ejemplo, la respuesta quedó guardada y falló la pregunta siguiente): se
    // relee para mostrar lo que hay y reintentar lo que toca.
    const a = this.acuerdo();
    if (a && trabajo !== 'empezar') {
      try {
        const releido = await firstValueFrom(this.api.leer(a.id));
        this.acuerdo.set(releido);
        if (releido.status === 'clarifying' && !releido.pregunta) reintentar = () => this.pedirPregunta();
        else if (releido.status === 'ready') reintentar = () => this.resumir();
      } catch {
        // sin releer, se ofrece repetir lo mismo
      }
    }
    this.error.set({ mensaje, reintentar: () => void reintentar() });
  }
}
