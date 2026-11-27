import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, NgZone, afterNextRender, computed, inject, input, output,
  signal, viewChild,
} from '@angular/core';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { reducedMotionQuery } from '../../../core/a11y/reduced-motion';
import { conNombre } from '../caso/plantilla-nombre';
import { isScrollRegionTarget } from '../keyboard-focus.util';
import { SafeExitButtonComponent } from '../safe-exit-button.component';
import { cuadroDelPlano, fundidoHacia } from './escenas';
import type { CuadroDeCinematica } from './escenas';
import { duracionConNombre, programarBurbujas } from './lectura';
import type { CinematicaLeida, PlanoLeido } from './lectura';
import { LienzoDeCinematica, medirVista } from './lienzo';
import { RelojDeCinematica } from './reproductor';

/** Cómo terminó: vista entera o saltada. */
export type FinDeCinematica = 'fin' | 'saltada';

/** Lo que se espera a que el arte esté compuesto antes de empezar (pasado esto, empieza con lo que haya). */
const ESPERA_DEL_ARTE_MS = 2500;
/** Fundido al saltar de plano con Enter o con las flechas: más corto que el del ritmo normal. */
const FUNDIDO_A_MANO_MS = 320;
/** El fundido a negro del final, antes de dar paso al tutor. */
const FUNDIDO_FINAL_MS = 700;
/** Cuándo empieza a aparecer el subtítulo y cuánto tarda, como mucho, en verse entero. */
const SUBTITULO_DESDE_MS = 280;
const SUBTITULO_APARECE_MS = 1100;

const VOCES: Readonly<Record<string, string>> = {
  hombre: 'El hombre', mujer: 'La mujer', 'mujer-telefono': 'La mujer', nina: 'La niña', telefono: 'Voz al teléfono',
  vecina: 'La vecina', 'abuela-familia': 'La abuela', 'hermano-mayor': 'El hermano mayor',
  'hermano-adolescente': 'El hermano adolescente',
};
/**
 * La cinemática del caso (contrato del caso insignia, §1): una capa a pantalla completa sobre el mundo, con franjas de cine,
 * los planos que manda el caso pintados con el arte del juego (`lienzo.ts`) y sus subtítulos abajo, grandes y legibles.
 *
 * - La narración y los parlamentos salen de `cinematica` (y `{nombre}` se pone aquí, al pintar).
 * - Se maneja con el teclado: Enter o → pasan al plano siguiente, ← vuelve al anterior, Espacio pausa o sigue. Esc NO pausa el
 *   caso de una vez: la primera pulsación detiene la cinemática (y deja a la vista «Salida segura»); la segunda, con la
 *   cinemática ya detenida, es la salida segura. Así Esc nunca saca a nadie sin querer, y la salida queda a dos pulsaciones.
 * - «Saltar» la termina y «Salida segura» (REGLA-004) está siempre a la vista.
 * - Con «movimiento reducido» (del sistema o del juego): placas fijas con fundido y el subtítulo entero de una vez.
 * - Los subtítulos se anuncian por las regiones vivas de la app; el lienzo es decorativo (aria-hidden).
 */
@Component({
  selector: 'app-cinematica-caso',
  standalone: true,
  imports: [A11yModule, SafeExitButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.cine--reducida]': 'reducida()', '[class.cine--pausada]': 'pausada()', '[class.cine--titulo]': 'esTitulo()' },
  template: `
    <!-- La trampa de foco envuelve la sección: así el foco inicial cae en la sección (Enter = plano siguiente) y no en «Pausa». -->
    <div class="cine-trampa" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
    <section #dialogo class="cine" role="dialog" aria-modal="true" aria-label="Cinemática del caso" aria-describedby="cine-texto"
      tabindex="-1" cdkFocusInitial>
      <div class="cine__arriba">
        <div class="cine__guia">
        <ol class="cine__planos" aria-hidden="true">
          @for (plano of planos(); track $index) {
            <li class="cine__plano" [class.cine__plano--visto]="$index < indice()" [class.cine__plano--actual]="$index === indice()">
              @if ($index === indice()) {
                @for (v of [vuelta()]; track v) {
                  <span class="cine__plano-lleno" [style.animation-duration.ms]="plano.duracionMs"></span>
                }
              }
            </li>
          }
        </ol>
        <p class="cine__teclas" aria-hidden="true">
          <kbd>Enter</kbd> siguiente · <kbd>Espacio</kbd> pausa · <kbd>Esc</kbd> pausa; otra vez, salida segura
        </p>
        </div>
        <div class="cine__controles">
          <button type="button" class="cine__boton u-ficha u-ficha--primaria" [attr.aria-pressed]="pausada()" (click)="alternarPausa()">
            {{ pausada() ? 'Seguir' : 'Pausa' }}
          </button>
          <button type="button" class="cine__boton u-ficha" (click)="saltar()">Saltar</button>
          <app-safe-exit-button variante="placa" data-hide-key [pausing]="pausing()" (pause)="salidaSegura.emit()" />
        </div>
      </div>

      <div class="cine__banda" #banda (click)="clicEnBanda($event)">
        <canvas #lienzo class="cine__lienzo" aria-hidden="true"></canvas>
        <canvas #burbujas class="cine__burbujas" aria-hidden="true"></canvas>
        @if (esTitulo() && visible()) {
          <div class="cine__titulo cine__lectura" role="region" aria-label="Título del plano" tabindex="0">
            <span class="cine__titulo-texto" aria-hidden="true">
              @for (palabra of palabras(); track $index) {
                <span class="cine__palabra" [style.animation-delay.ms]="retrasoDe($index)">{{ palabra }} </span>
              }
            </span>
          </div>
        }
        @if (pausada()) {
          <p class="cine__en-pausa u-placa u-sombra" aria-hidden="true">En pausa</p>
        }
        <div class="cine__velo" [class.cine__velo--cerrado]="cerrando()" aria-hidden="true"></div>
      </div>

      <div class="cine__pie">
        @if (!esTitulo() && visible() && palabras().length) {
          <div class="cine__marco u-placa">
            <div class="cine__abajo" #lectura role="region" aria-label="Subtítulo del plano" tabindex="0">
              <p class="cine__subtitulo" aria-hidden="true">
                @for (palabra of palabras(); track $index) {
                  <span class="cine__palabra" [style.animation-delay.ms]="retrasoDe($index)">{{ palabra }} </span>
                }
              </p>
            </div>
          </div>
        }
      </div>
      <p id="cine-texto" class="ds-sr-only">
        Enter o flecha derecha para avanzar. Flecha izquierda para volver al plano anterior. Espacio para pausar o seguir.
        Esc para pausar y, con la cinemática en pausa, pedir la salida segura.
      </p>
    </section>
    </div>
  `,
  styles: [`
    :host {
      --barra: clamp(56px, 12vh, 180px);
      /* Abajo cabe un subtítulo de tres líneas sin tocar el borde: la franja de imagen se ajusta a lo que sobra. */
      --barra-abajo: clamp(104px, 19vh, 230px);
      position: fixed; inset: 0;
      /* Sobre el umbral y la tarjeta de entrada; bajo el aviso de contenido y «Reanudar». Con tokens (ui:lint). */
      z-index: calc(var(--ds-z-modal) * 3 + var(--ds-z-cubierta) * 1.1);
      display: block;
      color: var(--pixel-tinta);
      background: var(--pixel-cine);
    }
    .cine-trampa { position: absolute; inset: 0; }
    .cine {
      position: absolute; inset: 0;
      display: grid;
      grid-template-rows: minmax(min-content, 1fr) minmax(0, auto) minmax(min(var(--barra-abajo), 26dvh), 1fr);
      outline: none;
      animation: cine-entra var(--ds-dur-slow) var(--ds-ease-out) both;
    }
    .cine__arriba {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      padding: clamp(8px, 2vh, 20px) clamp(10px, 3vw, 32px) 8px;
      opacity: .78; transition: opacity var(--ds-dur-fade) var(--ds-ease-out);
    }
    .cine__arriba:focus-within, :host(.cine--pausada) .cine__arriba { opacity: 1; }
    @media (hover: hover) and (pointer: fine) {
      .cine__arriba:hover { opacity: 1; }
    }
    .cine__guia { display: grid; gap: 10px; min-width: 0; }
    .cine__planos { display: flex; gap: clamp(2px, 1vw, 6px); margin: 0; padding: 14px 0 0; list-style: none; overflow: hidden; }
    .cine__plano { position: relative; width: clamp(14px, 2.4vw, 28px); height: 3px; overflow: hidden; background: var(--pixel-separador); }
    .cine__plano--visto { background: var(--pixel-tinta-suave); }
    .cine__plano-lleno {
      position: absolute; inset: 0; transform-origin: left; background: var(--luz);
      animation-name: cine-llena; animation-timing-function: linear; animation-fill-mode: both;
    }
    :host(.cine--pausada) .cine__plano-lleno { animation-play-state: paused; }
    :host(.cine--reducida) .cine__plano-lleno { animation: none; }
    .cine__controles { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
    .cine__boton {
      min-height: 44px; padding: 0 calc(5 * var(--pixel-px)); white-space: nowrap;
      font-family: var(--pixel-f-texto); font-size: max(var(--pixel-letra-minima), calc(var(--pixel-tam) * 0.95));
    }

    .cine__banda {
      position: relative; place-self: center; overflow: hidden;
      width: min(100vw, calc((100dvh - var(--barra) - var(--barra-abajo)) * 2.39));
      aspect-ratio: 2.39 / 1;
      max-height: 100%;
      background: var(--pixel-cine);
      cursor: pointer;
    }
    /* Pantalla vertical: la franja de 2,39 sería una tira; se abre hasta casi cuadrada. */
    @media (max-aspect-ratio: 1 / 1) {
      .cine__banda { width: 100vw; aspect-ratio: 1.2 / 1; }
    }
    .cine__lienzo {
      position: absolute; left: 0; top: 0;
      image-rendering: pixelated; image-rendering: crisp-edges;
      transform-origin: 0 0;
    }
    .cine__burbujas { position: absolute; inset: 0; pointer-events: none; image-rendering: pixelated; }
    .cine__velo {
      position: absolute; inset: 0; pointer-events: none; background: var(--pixel-cine);
      opacity: 0; transition: opacity 700ms var(--ds-ease-out);
    }
    .cine__velo--cerrado { opacity: 1; }
    .cine__en-pausa {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0;
      padding: calc(3 * var(--pixel-px)) calc(8 * var(--pixel-px));
      font-family: var(--pixel-f-nombre); font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      pointer-events: none;
    }

    .cine__pie {
      display: grid; place-items: center; min-height: 0;
      padding: clamp(4px, 1vh, 10px) clamp(10px, 4vw, 48px);
    }
    .cine__marco {
      display: flex; flex-direction: column;
      width: min(100%, 880px); max-height: 100%; min-height: 0;
    }
    .cine__abajo {
      min-height: 0; padding: clamp(4px, 1.15vh, 14px) clamp(8px, 2vw, 26px);
      overflow: auto;
      overscroll-behavior: contain;
    }
    .cine__subtitulo, .cine__titulo {
      margin: 0; text-align: center; text-wrap: balance; overflow-wrap: anywhere;
      font-family: var(--pixel-f-texto); font-weight: 600; letter-spacing: .01em;
      color: var(--pixel-tinta);
    }
    .cine__subtitulo {
      max-width: 66ch; margin-inline: auto;
      font-size: clamp(calc(var(--pixel-letra-minima) * 1.34), 1.45vw, calc(var(--pixel-tam) * 1.56));
      line-height: 1.45;
    }
    .cine__titulo {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      padding: 8px clamp(16px, 8vw, 120px);
      overflow: auto;
      overscroll-behavior: contain;
      font-size: max(22px, calc(var(--pixel-tam) * 2.3));
      line-height: 1.35;
    }
    .cine__titulo-texto { display: block; max-width: min(100%, 24ch); margin: auto; text-wrap: balance; }
    .cine__titulo-texto::before {
      content: ''; display: block; width: min(100%, 48px); height: 3px; margin: 0 auto 18px; background: var(--luz);
    }
    .cine__palabra {
      display: inline; opacity: 0;
      animation: cine-palabra 420ms var(--ds-ease-out) forwards;
    }
    :host(.cine--reducida) .cine__palabra { animation: cine-palabra-funde var(--ds-dur-fade) linear forwards; }
    .cine__teclas {
      margin: 0; font-family: var(--pixel-f-texto);
      font-size: var(--pixel-letra-minima); color: var(--pixel-tinta-suave);
    }
    .cine__teclas kbd { font-family: var(--pixel-f-nombre); color: var(--pixel-tinta); }
    @media (max-height: 520px) {
      .cine__teclas { display: none; }
      .cine__subtitulo { font-size: max(16px, calc(var(--pixel-tam) * 1.25)); }
    }

    @keyframes cine-entra { from { opacity: 0; } }
    @keyframes cine-llena { from { transform: scaleX(.001); } to { transform: scaleX(1); } }
    @keyframes cine-palabra { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @keyframes cine-palabra-funde { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .cine { animation-duration: 1ms; }
      .cine__palabra { animation: cine-palabra-funde var(--ds-dur-fade) linear forwards; }
    }
  `],
})
export class CinematicaCasoComponent {
  readonly cinematica = input.required<CinematicaLeida>();
  /** El nombre de quien juega (o '' sin nombre): reemplaza `{nombre}` en los subtítulos. */
  readonly nombre = input('');
  /** «Movimiento reducido» del juego (se suma al del sistema). */
  readonly reduceMotion = input(false);
  /** «Texto instantáneo»: el subtítulo aparece entero, sin palabra a palabra. */
  readonly textoInstantaneo = input(false);
  readonly pausing = input(false);

  readonly terminada = output<FinDeCinematica>();
  readonly salidaSegura = output<void>();
  /** true mientras un plano pide silencio (el corte a negro): quien la aloja baja la música. */
  readonly silencio = output<boolean>();

  private readonly announcer = inject(LiveRegionAnnouncer);
  private readonly zone = inject(NgZone);
  private readonly bandaRef = viewChild<ElementRef<HTMLElement>>('banda');
  private readonly lienzoRef = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly burbujasRef = viewChild<ElementRef<HTMLCanvasElement>>('burbujas');
  private readonly dialogoRef = viewChild<ElementRef<HTMLElement>>('dialogo');
  private readonly lecturaRef = viewChild<ElementRef<HTMLElement>>('lectura');

  private readonly consulta = reducedMotionQuery();
  private readonly delSistema = signal(this.consulta?.matches ?? false);
  readonly reducida = computed(() => this.reduceMotion() || this.delSistema());

  readonly planos = computed(() => this.cinematica().planos.map(p => ({ ...p, duracionMs: duracionConNombre(p, this.nombre()) })));
  readonly indice = signal(0);
  readonly pausada = signal(false);
  /** El subtítulo del plano ya puede verse (tras su entrada). */
  readonly visible = signal(false);
  readonly cerrando = signal(false);
  /** Sube cada vez que se entra a un plano (también al mismo, con ←): rehace la barra de progreso. */
  readonly vuelta = signal(0);
  private readonly plano = computed<PlanoLeido | null>(() => this.planos()[this.indice()] ?? null);
  private readonly intervenciones = computed(() => {
    const plano = this.plano();
    return plano ? programarBurbujas(plano, this.nombre()) : [];
  });
  readonly esTitulo = computed(() => this.plano()?.escena === 'titulo');
  readonly texto = computed(() => conNombre(this.plano()?.subtitulo ?? '', this.nombre()));
  readonly palabras = computed(() => this.texto().split(/\s+/).filter(Boolean));

  private reloj: RelojDeCinematica | null = null;
  private lienzo: LienzoDeCinematica | null = null;
  private cuadroRaf = 0;
  private medidaRaf = 0;
  private ultimo = 0;
  private empezada = false;
  private acabada = false;
  private fundido: { desde: PlanoLeido | null; msDesde: number; dura: number } | null = null;
  private temporizadorSubtitulo: number | null = null;
  private temporizadores: number[] = [];
  private observador: ResizeObserver | null = null;
  private enSilencio = false;

  constructor() {
    const cambio = () => this.delSistema.set(this.consulta?.matches ?? false);
    this.consulta?.addEventListener('change', cambio);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      // Primero: una preparación del arte que termine después no debe arrancar el reloj ni pedir cuadros.
      this.acabada = true;
      this.consulta?.removeEventListener('change', cambio);
      this.detener();
      if (this.medidaRaf) cancelAnimationFrame(this.medidaRaf);
      this.cancelarSubtitulo();
      this.temporizadores.forEach(t => window.clearTimeout(t));
      this.observador?.disconnect();
      this.lienzo?.destruir();
      if (this.enSilencio) this.silencio.emit(false);
    });
    afterNextRender(() => this.montar());
  }

  /** Retraso de la palabra `i`: aparecen en orden y el subtítulo entero se ve en poco más de un segundo. */
  retrasoDe(i: number): number {
    if (this.reducida() || this.textoInstantaneo() || this.pausada()) return 0;
    const n = Math.max(1, this.palabras().length);
    return Math.round(i * Math.min(70, SUBTITULO_APARECE_MS / n));
  }

  private montar(): void {
    const canvas = this.lienzoRef()?.nativeElement;
    const banda = this.bandaRef()?.nativeElement;
    const planos = this.planos();
    this.reloj = new RelojDeCinematica(planos.map(p => p.duracionMs));
    if (canvas) this.lienzo = new LienzoDeCinematica(canvas, '', this.burbujasRef()?.nativeElement);
    if (banda && typeof ResizeObserver !== 'undefined') {
      this.observador = new ResizeObserver(() => {
        if (this.medidaRaf) return;
        this.medidaRaf = requestAnimationFrame(() => {
          this.medidaRaf = 0;
          this.medir();
        });
      });
      this.observador.observe(banda);
    }
    this.medir();
    // Empieza cuando el arte está compuesto o, a más tardar, a los 2,5 s (con el respaldo de lo que falte).
    let listo = false;
    const empezar = () => {
      if (listo) return;
      listo = true;
      this.empezar();
    };
    this.temporizadores.push(window.setTimeout(empezar, ESPERA_DEL_ARTE_MS));
    (this.lienzo?.disponible ? this.lienzo.preparar(planos) : Promise.resolve()).then(empezar, empezar);
  }

  private medir(): void {
    const banda = this.bandaRef()?.nativeElement, canvas = this.lienzoRef()?.nativeElement;
    if (!banda || !canvas || !this.lienzo) return;
    const caja = banda.getBoundingClientRect();
    const medida = medirVista(caja.width, caja.height, window.devicePixelRatio || 1);
    this.lienzo.ajustar(medida, Math.round(caja.width * medida.dpr), Math.round(caja.height * medida.dpr));
    const s = medida.k / medida.dpr;
    canvas.style.width = `${(medida.ancho + 2) * s}px`;
    canvas.style.height = `${(medida.alto + 2) * s}px`;
    this.k = medida.k;
    this.dpr = medida.dpr;
    if (this.empezada && !this.cuadroRaf) this.pintar();
  }

  private k = 1;
  private dpr = 1;

  private empezar(): void {
    if (this.empezada || this.acabada) return;
    this.empezada = true;
    this.entrarAlPlano(null, fundidoHacia(this.planos()[0]));
    this.pintar();
    if (!this.reloj?.pausada) this.correr();
  }

  // ── El reloj ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private correr(): void {
    if (this.cuadroRaf || this.acabada) return;
    this.ultimo = performance.now();
    this.zone.runOutsideAngular(() => {
      const paso = (ahora: number) => {
        this.cuadroRaf = 0;
        if (this.acabada) return;
        const dt = ahora - this.ultimo;
        this.ultimo = ahora;
        const reloj = this.reloj!;
        const antes = this.plano();
        const resultado = reloj.avanzar(dt);
        if (resultado === 'fin') {
          this.zone.run(() => this.cerrar('fin'));
          return;
        }
        if (resultado === 'cambio') {
          const msDesde = antes?.duracionMs ?? 0;
          this.zone.run(() => this.entrarAlPlano(antes, fundidoHacia(this.planos()[reloj.indice]), msDesde));
        }
        this.pintar();
        if (!reloj.pausada) this.cuadroRaf = requestAnimationFrame(paso);
      };
      this.cuadroRaf = requestAnimationFrame(paso);
    });
  }

  private detener(): void {
    if (this.cuadroRaf) cancelAnimationFrame(this.cuadroRaf);
    this.cuadroRaf = 0;
  }

  /** Lo que pasa al entrar a un plano: el fundido desde el anterior, el subtítulo, el anuncio y el silencio del negro. */
  private entrarAlPlano(desde: PlanoLeido | null, dura: number, msDesde = 0): void {
    const reloj = this.reloj!;
    this.recuperarFocoDelTexto();
    const lectura = this.lecturaRef()?.nativeElement;
    if (lectura) lectura.scrollTop = 0;
    this.indice.set(reloj.indice);
    this.vuelta.update(v => v + 1);
    this.fundido = reloj.pausada ? null : { desde, msDesde, dura: this.reducida() ? Math.max(dura, 400) : dura };
    const plano = this.plano();
    this.cancelarSubtitulo();
    this.visible.set(reloj.pausada);
    if (!reloj.pausada) {
      const espera = this.reducida() || this.textoInstantaneo() ? 120 : SUBTITULO_DESDE_MS;
      this.temporizadorSubtitulo = window.setTimeout(() => {
        this.temporizadorSubtitulo = null;
        this.visible.set(true);
      }, espera);
    }
    const voces = this.intervenciones().map(({ quien, texto, grito, nombre }) => {
      const papel = Object.hasOwn(VOCES, quien) ? VOCES[quien] : quien.replace(/-/g, ' ');
      const voz = conNombre(nombre, this.nombre()) || papel;
      return `${voz}${grito ? ' grita' : ''}: ${texto}`;
    });
    this.announcer.announce([`Plano ${reloj.indice + 1} de ${reloj.total}.`, this.texto(), ...voces].filter(Boolean).join(' '));
    const silencio = plano?.escena === 'negro';
    if (silencio !== this.enSilencio) {
      this.enSilencio = silencio;
      this.silencio.emit(silencio);
    }
  }

  private cancelarSubtitulo(): void {
    if (this.temporizadorSubtitulo !== null) window.clearTimeout(this.temporizadorSubtitulo);
    this.temporizadorSubtitulo = null;
  }

  private recuperarFocoDelTexto(): void {
    const dialogo = this.dialogoRef()?.nativeElement;
    const activo = dialogo?.ownerDocument.activeElement;
    if (activo?.matches('.cine__lectura, .cine__abajo') && dialogo?.contains(activo)) {
      dialogo.focus({ preventScroll: true });
    }
  }

  private pintar(): void {
    const plano = this.plano(), reloj = this.reloj, lienzo = this.lienzo;
    if (!plano || !reloj || !lienzo?.disponible) return;
    const vista = lienzo.vista, reducido = this.reducida();
    const ms = reloj.transcurrido;
    const burbuja = this.intervenciones().find(b => ms >= b.desde && ms < b.hasta);
    const actual = cuadroDelPlano(plano, ms, vista, reducido, burbuja);
    let anterior: CuadroDeCinematica | null = null, mezcla = 1;
    const f = this.fundido;
    if (f && f.dura > 0) {
      const pasado = reloj.transcurrido;
      mezcla = Math.min(1, pasado / f.dura);
      // Al empezar (sin plano anterior) se funde desde negro.
      anterior = f.desde
        ? cuadroDelPlano(f.desde, f.msDesde + pasado, vista, reducido)
        : cuadroDelPlano({ ...plano, escena: 'negro' }, 0, vista, reducido);
      if (mezcla >= 1) this.fundido = null;
    }
    const { dx, dy } = lienzo.pintar(actual, mezcla < 1 ? anterior : null, mezcla);
    const canvas = this.lienzoRef()?.nativeElement;
    if (canvas) {
      // La fracción de la cámara, en píxeles físicos enteros: el paneo es suave y la rejilla del arte no se rompe.
      const tx = -Math.round((1 + dx) * this.k) / this.dpr, ty = -Math.round((1 + dy) * this.k) / this.dpr;
      canvas.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }
  }

  // ── Lo que hace la persona ─────────────────────────────────────────────────────────────────────────────────────────

  clicEnBanda(event: MouseEvent): void {
    const region = (event.target as HTMLElement | null)?.closest('.cine__lectura') ?? null;
    if (!isScrollRegionTarget(region)) this.alternarPausa();
  }

  alternarPausa(): void {
    const reloj = this.reloj;
    if (!reloj || this.acabada) return;
    const pausada = reloj.alternarPausa();
    this.pausada.set(pausada);
    this.announcer.announce(pausada ? 'Cinemática en pausa.' : 'La cinemática sigue.');
    if (pausada) this.detener();
    else if (this.empezada) this.correr();
  }

  siguiente(): void {
    this.saltarA(() => this.reloj!.siguiente());
  }

  anterior(): void {
    this.saltarA(() => this.reloj!.anterior());
  }

  private saltarA(mover: () => 'sigue' | 'cambio' | 'fin'): void {
    const reloj = this.reloj;
    if (!reloj || this.acabada || !this.empezada) return;
    const antes = this.plano(), msDesde = reloj.transcurrido;
    const resultado = mover();
    if (resultado === 'fin') { this.cerrar('fin'); return; }
    if (resultado !== 'cambio') return;
    const dura = fundidoHacia(this.planos()[reloj.indice]) === 0 ? 0 : FUNDIDO_A_MANO_MS;
    this.ultimo = performance.now();
    this.entrarAlPlano(antes, dura, msDesde);
    this.pintar();
  }

  saltar(): void {
    if (this.acabada) return;
    this.acabada = true;
    this.detener();
    this.cancelarSubtitulo();
    this.terminada.emit('saltada');
  }

  /** Fin natural: fundido a negro y, al cerrarse, el aviso. */
  private cerrar(como: FinDeCinematica): void {
    if (this.acabada) return;
    this.acabada = true;
    this.detener();
    this.cancelarSubtitulo();
    this.cerrando.set(true);
    this.recuperarFocoDelTexto();
    this.visible.set(false);
    const espera = this.reducida() ? 200 : FUNDIDO_FINAL_MS;
    this.temporizadores.push(window.setTimeout(() => this.terminada.emit(como), espera));
  }

  @HostListener('document:keydown', ['$event'])
  tecla(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.acabada) return;
    const destino = event.target instanceof Element ? event.target : null;
    const enBoton = !!destino?.closest?.('button, a, [role="button"]');
    if ([' ', 'Spacebar', 'PageDown', 'PageUp'].includes(event.key) && isScrollRegionTarget(destino)) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        if (event.repeat) return;
        // Primera Esc: se detiene la cinemática (y «Salida segura» queda a la vista). Con ella detenida: salida segura.
        if (this.pausada()) this.salidaSegura.emit();
        else this.alternarPausa();
        return;
      case 'Enter':
        if (enBoton) return;
        event.preventDefault();
        if (!event.repeat) this.siguiente();
        return;
      case ' ':
      case 'Spacebar':
        if (enBoton) return;
        event.preventDefault();
        if (!event.repeat) this.alternarPausa();
        return;
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        this.siguiente();
        return;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        this.anterior();
        return;
      default:
        // Las demás teclas no hacen nada aquí; el juego de debajo tampoco las atiende mientras se ve la cinemática.
        return;
    }
  }
}
