import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';

import { CasoStore } from '../estado/caso.store';
import { reducirMovimiento } from '../guia/guia.service';
import { rutaRetrato } from '../modelo/biblioteca.service';
import { CAPITULOS, MENTOR } from './capitulos';
import { TutorialService } from './tutorial.service';
import { VozMentor } from './voz-mentor';

interface Caja { top: number; left: number; width: number; height: number }
const HOLGURA = 8;
const ANCHO_BURBUJA = 400;
/** Lo más estrecha que se deja la burbuja para no tapar lo señalado. */
const ANCHO_MINIMO = 280;

/**
 * Lo que se ve del tutorial: el velo con un hueco sobre la parte señalada y el anillo discontinuo. También la burbuja con
 * el mentor pixel, el capítulo y el progreso, la consigna de los pasos prácticos, la insignia de cada capítulo, la pantalla
 * final y la píldora de pausa. Misma forma que la guía (`foco-guia.component.ts`), con la palabra «Tutorial».
 */
@Component({
  selector: 'app-tutorial-capa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: VozMentor, useFactory: () => new VozMentor(MENTOR.voz) }],
  template: `
    @if (t.activo()) {
      @if (t.pausado()) {
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <button type="button" class="tut-pausa" (click)="t.volverAlCaso()">Tutorial en pausa · Volver al caso de práctica</button>
      } @else {
        <div class="tut" [class.con-movimiento]="!reducir">
          @if (caja(); as c) {
            <div class="velo" [style.top.px]="0" [style.left.px]="0" [style.right.px]="0" [style.height.px]="c.top - holgura"></div>
            <div class="velo" [style.top.px]="c.top + c.height + holgura" [style.left.px]="0" [style.right.px]="0" [style.bottom.px]="0"></div>
            <div class="velo" [style.top.px]="c.top - holgura" [style.left.px]="0" [style.width.px]="c.left - holgura" [style.height.px]="c.height + 2 * holgura"></div>
            <div class="velo" [style.top.px]="c.top - holgura" [style.left.px]="c.left + c.width + holgura" [style.right.px]="0" [style.height.px]="c.height + 2 * holgura"></div>
            <div class="anillo" aria-hidden="true" [class.etiqueta-abajo]="c.top - holgura < 40" [style.top.px]="c.top - holgura" [style.left.px]="c.left - holgura"
                 [style.width.px]="c.width + 2 * holgura" [style.height.px]="c.height + 2 * holgura"><span class="aqui">Tutorial</span></div>
          } @else {
            <div class="velo velo--todo"></div>
          }

          <section #burbuja class="tut-burbuja" role="dialog" aria-modal="false" aria-labelledby="tut-titulo" tabindex="-1"
                   [class.tut-burbuja--centro]="!caja()" [style.top.px]="pos().top" [style.left.px]="pos().left" [style.width.px]="pos().width">
            <div class="tut-cabeza">
              <img class="tut-mentor" [src]="retrato()" [alt]="mentor.nombre" width="72" height="72" />
              <div>
                <p class="tut-quien">{{ mentor.nombre }}</p>
                <p class="tut-capitulo">Capítulo {{ t.estado().capitulo + 1 }} de {{ total }} · {{ t.capitulo().nombre }}</p>
              </div>
            </div>
            <progress class="tut-progreso" [value]="t.pasoGlobal()" [max]="t.totalPasos" aria-label="Avance del tutorial"></progress>

            @if (t.final()) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <h2 id="tut-titulo" class="tut-titulo">¡Tutorial completado!</h2>
              <ul class="tut-insignias" aria-label="Insignias ganadas">
                @for (c of capitulos; track c.id) { <li class="tut-insignia"><span aria-hidden="true">★</span> {{ c.logro }}</li> }
              </ul>
              <p aria-live="polite">Hiciste {{ t.estado().practicos.length }} de {{ totalPracticos }} pasos prácticos. Ya conoces todas las partes del editor.</p>
              <div class="tut-acciones">
                <button type="button" class="boton boton-guia" (click)="irACasos()">Ir a mis casos</button>
                <button type="button" class="boton" (click)="repetir()">Repetir</button>
              </div>
            } @else if (t.logro(); as l) {
              <div class="tut-logro" aria-live="polite">
                <p class="tut-medalla" aria-hidden="true">★</p>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <h2 id="tut-titulo" class="tut-titulo">Insignia: {{ l.logro }}</h2>
                <p>Terminaste «{{ l.nombre }}».</p>
              </div>
              <div class="tut-acciones">
                <button type="button" class="boton boton-guia tut-continuar" (click)="t.continuar()">Continuar</button>
                <button type="button" class="boton boton-texto tut-salir" (click)="t.salir()">Salir</button>
              </div>
            } @else {
              @let p = t.paso();
              <p class="tut-paso">Paso {{ t.estado().paso + 1 }} de {{ t.capitulo().pasos.length }}</p>
              <h2 id="tut-titulo" class="tut-titulo">{{ p.titulo }}</h2>
              <div aria-live="polite">
                <!-- El mentor «habla»: el texto se escribe con sus blips. Un clic lo muestra entero. El lector de pantalla lee
                     el texto completo de una vez (solo-lector); lo que se escribe y el molde que reserva el alto no se leen. -->
                <p class="tut-voz" (click)="voz.completar()">
                  <span class="tut-voz__molde" aria-hidden="true">{{ p.texto }}</span>
                  <span class="tut-voz__escrito" aria-hidden="true">{{ voz.escrito() }}</span>
                  <span class="solo-lector">{{ p.texto }}</span>
                </p>
                @if (p.practico) {
                  @if (soloLectura() && !t.cumplido()) {
                    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                    <p class="tut-consigna">Este caso ya no es un borrador: este paso no se puede hacer aquí. Sáltalo para seguir.</p>
                  } @else {
                    <p class="tut-consigna" [class.hecho]="t.cumplido()">
                      <span aria-hidden="true">{{ t.cumplido() ? '✓' : '✋' }}</span>
                      {{ t.cumplido() ? '¡Hecho!' : t.consigna() }}
                    </p>
                  }
                }
              </div>
              <div class="tut-acciones">
                <button type="button" class="boton" [disabled]="t.estado().capitulo === 0 && t.estado().paso === 0" (click)="t.anterior()">Anterior</button>
                <button type="button" class="boton boton-guia tut-siguiente" [disabled]="!!p.practico && !t.cumplido()" (click)="t.siguiente()">
                  {{ t.estado().paso === t.capitulo().pasos.length - 1 ? 'Terminar capítulo' : 'Siguiente' }}
                </button>
                @if (p.practico && !t.cumplido()) {
                  <button type="button" class="boton boton-texto tut-saltar" (click)="t.saltarPractico()">Saltar este paso</button>
                }
              </div>
              <div class="tut-acciones tut-acciones--menores">
                <button type="button" class="boton boton-texto tut-volver" (click)="t.volverAlPaso()">Volver al paso</button>
                <button type="button" class="boton boton-texto tut-salir" (click)="t.salir()">Salir</button>
              </div>
              <p class="tut-nota"><kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd> cambian de paso · <kbd>Alt</kbd> + <kbd>B</kbd> vuelve aquí · <kbd>Esc</kbd> sale.</p>
            }
          </section>
        </div>
      }
    }
  `,
  styles: `
    .tut { position: fixed; inset: 0; z-index: var(--autoria-capa-50); pointer-events: none; }
    .velo { position: fixed; background: var(--velo); }
    .velo--todo { inset: 0; }
    .anillo { position: fixed; border: 4px dashed var(--guia); border-radius: 12px; box-shadow: 0 0 0 4px var(--sobre-primario); }
    .aqui {
      position: absolute; top: -32px; left: -4px; padding: 2px 10px; border-radius: 999px; background: var(--guia);
      color: var(--sobre-primario); font-size: var(--autoria-texto-16); font-weight: 700;
    }
    /* Pegado al borde de arriba (la barra), la palabra «Tutorial» se saldría de la ventana: va debajo del anillo. */
    .etiqueta-abajo .aqui { top: auto; bottom: -36px; }
    .tut-burbuja {
      position: fixed; inline-size: min(400px, calc(100vw - 32px)); box-sizing: border-box; padding: 16px;
      pointer-events: auto; display: flex; flex-direction: column; gap: 8px;
      background: var(--superficie); color: var(--tinta); border: 2px dashed var(--guia); border-radius: var(--radio-tarjeta);
      box-shadow: var(--sombra-foco);
    }
    .tut-burbuja:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    .tut-burbuja p { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .tut-cabeza { display: flex; align-items: center; gap: 12px; }
    .tut-mentor { flex: none; border-radius: 8px; background: var(--juego-fondo); image-rendering: pixelated; }
    .tut-quien { font-weight: 800; color: var(--guia); }
    .tut-burbuja .tut-capitulo, .tut-burbuja .tut-paso, .tut-burbuja .tut-nota { color: var(--texto-secundario); font-size: var(--autoria-texto-14); }
    .tut-progreso { inline-size: 100%; block-size: 8px; accent-color: var(--guia); }
    .tut-voz { display: grid; cursor: default; }
    .tut-voz__molde, .tut-voz__escrito { grid-area: 1 / 1; }
    .tut-voz__molde { visibility: hidden; }
    .solo-lector { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .tut-titulo { margin: 0; font-size: var(--autoria-texto-18); line-height: 1.3; }
    .tut-burbuja .tut-consigna { margin-block-start: 8px; padding: 8px 10px; border-radius: var(--radio-control); background: var(--fondo-hundido); font-weight: 700; }
    .tut-burbuja .tut-consigna.hecho { color: var(--adecuada); background: var(--adecuada-tinte); }
    .tut-acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .tut-acciones--menores { margin-block-start: -4px; }
    .boton-guia { background: var(--guia); border-color: var(--guia); color: var(--sobre-primario); }
    .tut-logro { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
    .tut-burbuja .tut-medalla { font-size: 48px; line-height: 1; color: var(--guia); }
    .tut-insignias { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .tut-insignia { padding: 2px 10px; border-radius: 999px; background: var(--fondo-hundido); font-weight: 700; font-size: var(--autoria-texto-14); }
    .tut-pausa {
      position: fixed; z-index: var(--autoria-capa-50); inset-block-end: 16px; inset-inline-end: 16px; min-block-size: 44px;
      padding: 0 16px; border: 2px dashed var(--guia); border-radius: 999px; background: var(--superficie); color: var(--tinta);
      font: inherit; font-weight: 700; cursor: pointer;
    }
    /* En una ventana estrecha la burbuja se ancla abajo, a todo el ancho; el anillo sigue en su sitio. */
    @media (max-width: 64rem) {
      .tut-burbuja { inset-inline: 16px; inset-block-start: auto !important; inset-block-end: 16px; inline-size: auto !important; left: 16px !important; }
    }
    .con-movimiento .anillo, .con-movimiento .tut-burbuja { animation: aparecer 160ms ease-out; }
    @keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }
    @media (forced-colors: active) { .anillo { outline: 4px solid Highlight; } }
  `,
})
export class TutorialCapaComponent {
  protected readonly t = inject(TutorialService);
  private readonly store = inject(CasoStore);
  protected readonly mentor = MENTOR;
  protected readonly capitulos = CAPITULOS;
  protected readonly total = CAPITULOS.length;
  protected readonly totalPracticos = CAPITULOS.flatMap((c) => c.pasos).filter((p) => p.practico).length;
  protected readonly soloLectura = computed(() => this.store.soloLectura());
  protected readonly holgura = HOLGURA;
  protected readonly reducir = reducirMovimiento();
  protected readonly voz = inject(VozMentor);
  private readonly burbuja = viewChild<ElementRef<HTMLElement>>('burbuja');
  private readonly marco = signal(0);

  protected readonly retrato = computed(() =>
    rutaRetrato(MENTOR.receta, this.t.final() || this.t.logro() || this.t.cumplido() ? 'alegre' : this.t.paso().expresion));

  protected readonly caja = computed<Caja | null>(() => {
    this.marco();
    const el = this.t.elemento();
    if (!el || this.t.logro() || this.t.final()) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  });

  /** El alto real de la burbuja (cambia con el texto de cada paso); se mide después de dibujarla. */
  private readonly altoBurbuja = signal(320);

  /**
   * Nunca tapa lo señalado: debajo si cabe; si no, encima; si no, al lado (derecha o izquierda); y si nada cabe, en la
   * esquina de abajo. Sin elemento, centrada.
   */
  protected readonly pos = computed(() => {
    const p = this.posSinAjustar();
    const alto = typeof innerHeight === 'number' ? innerHeight : 768;
    const ancho = typeof innerWidth === 'number' ? innerWidth : 1366;
    // Siempre dentro de la ventana, aunque lo señalado todavía esté fuera (desplazándose hacia la vista).
    const ancha = p.width ?? Math.min(ANCHO_BURBUJA, ancho - 32);
    return {
      top: Math.min(Math.max(16, p.top), Math.max(16, alto - this.altoBurbuja() - 16)),
      left: Math.min(Math.max(16, p.left), Math.max(16, ancho - ancha - 16)),
      width: p.width ?? null,
    };
  });

  private readonly posSinAjustar = computed<{ top: number; left: number; width?: number }>(() => {
    const c = this.caja();
    const alto = typeof innerHeight === 'number' ? innerHeight : 768;
    const ancho = typeof innerWidth === 'number' ? innerWidth : 1366;
    const h = this.altoBurbuja();
    const w = Math.min(ANCHO_BURBUJA, ancho - 32);
    const margen = 16;
    if (!c) return { top: Math.max(margen, (alto - h) / 2), left: Math.max(margen, (ancho - w) / 2) };
    const enX = Math.min(Math.max(margen, c.left), Math.max(margen, ancho - w - margen));
    // Si la palabra «Tutorial» va debajo del anillo (elemento pegado arriba), la burbuja baja lo que ella ocupa.
    const abajo = c.top + c.height + HOLGURA + margen + (c.top - HOLGURA < 40 ? 32 : 0);
    if (abajo + h <= alto - margen) return { top: abajo, left: enX };
    const encima = c.top - HOLGURA - margen - h;
    if (encima >= margen) return { top: encima, left: enX };
    const enY = Math.min(Math.max(margen, c.top), Math.max(margen, alto - h - margen));
    const derecha = c.left + c.width + HOLGURA + margen;
    if (derecha + w <= ancho - margen) return { top: enY, left: derecha };
    const izquierda = c.left - HOLGURA - margen - w;
    if (izquierda >= margen) return { top: enY, left: izquierda };
    // Ancha no cabe a ningún lado: se estrecha (hasta ANCHO_MINIMO) para quedar junto a lo señalado sin taparlo.
    const libreDerecha = ancho - derecha - margen;
    const libreIzquierda = c.left - HOLGURA - 2 * margen;
    if (Math.max(libreDerecha, libreIzquierda) >= ANCHO_MINIMO) {
      return libreDerecha >= libreIzquierda
        ? { top: enY, left: derecha, width: libreDerecha }
        : { top: enY, left: margen, width: libreIzquierda };
    }
    return { top: Math.max(margen, alto - h - margen), left: Math.max(margen, ancho - w - margen) };
  });

  constructor() {
    const medir = () => {
      const alto = this.burbuja()?.nativeElement.offsetHeight;
      if (alto) this.altoBurbuja.set(alto);
      this.marco.update((n) => n + 1);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', medir, true);
      window.addEventListener('resize', medir);
      inject(DestroyRef).onDestroy(() => {
        window.removeEventListener('scroll', medir, true);
        window.removeEventListener('resize', medir);
      });
    }
    // Al cambiar de elemento, de paso o de estado de la consigna, se vuelve a medir cuando el navegador ya lo dibujó.
    effect(() => {
      this.t.elemento();
      this.t.paso();
      this.t.cumplido();
      if (this.t.activo() && typeof requestAnimationFrame === 'function') requestAnimationFrame(medir);
    });
    // Cada paso nuevo, el mentor lo dice desde el principio; al salir, al pausar o en el logro, se calla.
    effect(() => {
      const hablando = this.t.activo() && !this.t.pausado() && !this.t.logro() && !this.t.final();
      const texto = hablando ? this.t.paso().texto : '';
      untracked(() => (texto ? this.voz.decir(texto) : this.voz.callar()));
    });
    inject(DestroyRef).onDestroy(() => this.voz.callar());
    // Alt+B, el logro y la pantalla final llevan el foco a la burbuja.
    effect(() => {
      const pedido = this.t.focoBurbuja();
      const logro = this.t.logro();
      const final = this.t.final();
      if (pedido || logro || final) queueMicrotask(() => this.burbuja()?.nativeElement.focus());
    });
  }

  protected irACasos(): void {
    this.t.salir();
    void this.t.irACasos();
  }

  protected async repetir(): Promise<void> {
    const id = this.t.estado().casoId;
    if (id) await this.t.iniciar(id, true);
  }
}
