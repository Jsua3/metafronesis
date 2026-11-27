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
            <div class="anillo" aria-hidden="true" [class.etiqueta-arriba]="etiquetaArriba()" [style.top.px]="c.top - holgura" [style.left.px]="c.left - holgura"
                 [style.width.px]="c.width + 2 * holgura" [style.height.px]="c.height + 2 * holgura"><span class="aqui">Tutorial</span></div>
          } @else {
            <div class="velo velo--todo"></div>
          }

          <section #burbuja class="tut-burbuja" role="dialog" aria-modal="false" aria-labelledby="tut-titulo" tabindex="-1"
                   [class.tut-burbuja--centro]="!caja()" [style.top.px]="pos().top" [style.left.px]="pos().left" [style.width.px]="pos().width">
            <!-- Cabecera: quién habla, en qué capítulo va y la salida (la X), siempre en el mismo sitio. -->
            <div class="tut-cabeza">
              <img class="tut-mentor" [src]="retrato()" alt="" width="56" height="56" />
              <div class="tut-cabeza__texto">
                <p class="tut-quien">{{ mentor.nombre }} <span class="tut-apodo">«{{ mentor.apodo }}»</span></p>
                <p class="tut-capitulo">Capítulo {{ t.estado().capitulo + 1 }} de {{ total }} · {{ t.capitulo().nombre }}</p>
              </div>
              <button type="button" class="tut-cerrar tut-salir" aria-label="Salir del tutorial" (click)="t.salir()">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <progress class="tut-progreso" [value]="t.pasoGlobal()" [max]="t.totalPasos" aria-label="Avance del tutorial"></progress>

            @if (t.final()) {
              <div class="tut-cuerpo tut-cuerpo--centro">
                <p class="tut-medalla" aria-hidden="true">★</p>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <h2 id="tut-titulo" class="tut-titulo">¡Tutorial completado!</h2>
                <p aria-live="polite">Hiciste {{ t.estado().practicos.length }} de {{ totalPracticos }} pasos prácticos. Ya conoces todas las partes del editor.</p>
                <ul class="tut-insignias" aria-label="Insignias ganadas">
                  @for (c of capitulos; track c.id) { <li class="tut-insignia"><span aria-hidden="true">★</span> {{ c.logro }}</li> }
                </ul>
              </div>
              <div class="tut-pie">
                <div class="tut-navegacion">
                  <button type="button" class="tut-boton" (click)="repetir()">Repetir</button>
                  <button type="button" class="tut-boton tut-boton--principal" (click)="irACasos()">Ir a mis casos</button>
                </div>
              </div>
            } @else if (t.logro(); as l) {
              <div class="tut-cuerpo tut-cuerpo--centro tut-logro" aria-live="polite">
                <p class="tut-medalla" aria-hidden="true">★</p>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <h2 id="tut-titulo" class="tut-titulo">Insignia: {{ l.logro }}</h2>
                <p>Terminaste «{{ l.nombre }}».</p>
              </div>
              <div class="tut-pie">
                <div class="tut-navegacion">
                  <button type="button" class="tut-boton tut-boton--principal tut-continuar" (click)="t.continuar()">Continuar</button>
                </div>
              </div>
            } @else {
              @let p = t.paso();
              <div class="tut-cuerpo">
                <p class="tut-paso">Paso {{ t.estado().paso + 1 }} de {{ t.capitulo().pasos.length }}</p>
                <h2 id="tut-titulo" class="tut-titulo">{{ p.titulo }}</h2>
                <div aria-live="polite" class="tut-habla">
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
                    } @else if (t.cumplido()) {
                      <p class="tut-consigna hecho">
                        <svg class="tut-consigna__icono" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" /></svg>
                        ¡Hecho!
                      </p>
                    } @else {
                      <!-- BORRADOR: texto nuevo («Tu turno»), pendiente de la aprobación de Psicología -->
                      <p class="tut-consigna"><span class="tut-consigna__rotulo">Tu turno</span>{{ t.consigna() }}</p>
                    }
                  }
                </div>
              </div>
              <div class="tut-pie">
                <div class="tut-navegacion">
                  <button type="button" class="tut-boton" [disabled]="t.estado().capitulo === 0 && t.estado().paso === 0" (click)="t.anterior()">Anterior</button>
                  <button type="button" class="tut-boton tut-boton--principal tut-siguiente" [disabled]="!!p.practico && !t.cumplido()" (click)="t.siguiente()">
                    {{ t.estado().paso === t.capitulo().pasos.length - 1 ? 'Terminar capítulo' : 'Siguiente' }}
                  </button>
                </div>
                <div class="tut-menores">
                  <button type="button" class="tut-enlace tut-volver" (click)="t.volverAlPaso()">Volver al paso</button>
                  @if (p.practico && !t.cumplido()) {
                    <button type="button" class="tut-enlace tut-saltar" (click)="t.saltarPractico()">Saltar este paso</button>
                  }
                </div>
                <p class="tut-nota">
                  <span class="tut-atajo"><kbd>Alt</kbd><kbd>←</kbd><kbd>→</kbd> cambiar de paso</span>
                  <span class="tut-atajo"><kbd>Alt</kbd><kbd>B</kbd> volver aquí</span>
                  <span class="tut-atajo"><kbd>Esc</kbd> salir</span>
                </p>
              </div>
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
    /* Lo señalado: un anillo discontinuo (la forma de la guía) y la palabra «Tutorial» sobre su filo de abajo, a la derecha,
       donde casi nunca hay nada (arriba a la izquierda tapaba el rótulo del campo). */
    .anillo { position: fixed; border: 3px dashed var(--guia); border-radius: 12px; box-shadow: 0 0 0 3px var(--sobre-primario); }
    .aqui {
      position: absolute; inset-block-end: 0; inset-inline-end: 12px; translate: 0 calc(50% + 1px); padding: 0 8px;
      border-radius: 999px; background: var(--guia); color: var(--sobre-primario); font-size: var(--autoria-texto-14);
      font-weight: 700; line-height: 20px;
    }
    /* Pegado al borde de abajo de la ventana, la palabra se saldría: va sobre el filo de arriba. */
    .etiqueta-arriba .aqui { inset-block: 0 auto; translate: 0 calc(-50% - 1px); }

    /* La burbuja: una tarjeta con cabecera (mentor, capítulo y salida), el avance como filo, el cuerpo y un pie con la
       navegación. El acento del tutorial va en el filo de arriba y en el botón principal; el resto es la superficie. */
    .tut-burbuja {
      position: fixed; inline-size: min(400px, calc(100vw - 32px)); box-sizing: border-box; overflow: hidden;
      pointer-events: auto; display: flex; flex-direction: column;
      background: var(--superficie); color: var(--tinta); border: 1px solid var(--borde-control); border-block-start: 3px solid var(--guia);
      border-radius: var(--radio-tarjeta); box-shadow: var(--sombra-foco);
    }
    .tut-burbuja:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    .tut-burbuja p { margin: 0; }

    .tut-cabeza { display: flex; align-items: center; gap: 12px; padding: 12px 8px 12px 16px; }
    .tut-mentor { flex: none; inline-size: 56px; block-size: 56px; border-radius: 12px; background: var(--fondo-hundido); image-rendering: pixelated; }
    .tut-cabeza__texto { flex: 1; min-inline-size: 0; display: grid; gap: 2px; }
    .tut-burbuja .tut-quien { font-size: var(--autoria-texto-16); font-weight: 800; line-height: 22px; color: var(--tinta); }
    .tut-apodo { font-weight: 600; color: var(--guia); white-space: nowrap; }
    .tut-burbuja .tut-capitulo { color: var(--texto-secundario); font-size: var(--autoria-texto-14); line-height: 20px; }
    .tut-burbuja .tut-cerrar {
      flex: none; align-self: flex-start; display: inline-grid; place-items: center; inline-size: 44px; min-block-size: 44px; block-size: 44px;
      padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--texto-secundario);
    }
    .tut-cerrar svg { inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    @media (hover: hover) and (pointer: fine) { .tut-burbuja .tut-cerrar:hover { background: var(--fondo-hundido); color: var(--tinta); } }
    .tut-cerrar:focus-visible { outline: 3px solid var(--foco); outline-offset: -3px; }

    /* El avance de todo el tutorial: un filo fino entre la cabecera y el cuerpo. */
    .tut-progreso { display: block; inline-size: 100%; block-size: 4px; border: 0; appearance: none; background: var(--fondo-hundido); }
    .tut-progreso::-webkit-progress-bar { background: var(--fondo-hundido); }
    .tut-progreso::-webkit-progress-value { background: var(--guia); }
    .tut-progreso::-moz-progress-bar { background: var(--guia); }

    .tut-cuerpo { display: flex; flex-direction: column; gap: 6px; padding: 16px 16px 4px; }
    .tut-cuerpo--centro { align-items: center; text-align: center; padding-block-end: 8px; }
    .tut-burbuja .tut-paso { color: var(--guia); font-size: var(--autoria-texto-14); font-weight: 700; line-height: 20px; }
    .tut-titulo { margin: 0; font-size: var(--autoria-texto-20); line-height: 1.3; font-weight: 800; }
    .tut-habla { display: flex; flex-direction: column; gap: 12px; }
    .tut-burbuja .tut-voz { display: grid; cursor: default; font-size: var(--autoria-texto-16); line-height: 24px; color: var(--tinta); }
    .tut-voz__molde, .tut-voz__escrito { grid-area: 1 / 1; }
    .tut-voz__molde { visibility: hidden; }
    .solo-lector { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    /* La consigna de un paso práctico: un recuadro con su rótulo «Tu turno» y el filo del acento a la izquierda. */
    .tut-burbuja .tut-consigna {
      display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: var(--radio-control);
      border-inline-start: 3px solid var(--guia); background: var(--fondo-hundido); font-size: var(--autoria-texto-16); line-height: 22px;
      font-weight: 600;
    }
    .tut-consigna__rotulo { color: var(--guia); font-size: var(--autoria-texto-14); font-weight: 800; line-height: 20px; }
    .tut-burbuja .tut-consigna.hecho {
      flex-direction: row; align-items: center; gap: 8px; color: var(--adecuada); background: var(--adecuada-tinte);
      border-inline-start-color: var(--adecuada); font-weight: 800;
    }
    .tut-consigna__icono { flex: none; inline-size: 20px; block-size: 20px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }

    /* El pie: la navegación (Anterior · Siguiente, a todo el ancho), las salidas menores y los atajos. */
    .tut-pie { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; }
    .tut-navegacion { display: flex; gap: 8px; }
    .tut-burbuja .tut-boton {
      flex: 1; min-block-size: 44px; padding: 0 16px; border: 1px solid var(--borde-control); border-radius: 999px;
      background: transparent; color: var(--tinta); font-size: var(--autoria-texto-16); font-weight: 700;
    }
    .tut-burbuja .tut-boton--principal { flex: 1.4; background: var(--guia); border-color: var(--guia); color: var(--sobre-primario); }
    .tut-burbuja .tut-boton:disabled { opacity: 0.5; cursor: not-allowed; }
    @media (hover: hover) and (pointer: fine) {
      .tut-burbuja .tut-boton:not(:disabled):hover { background: var(--fondo-hundido); }
      .tut-burbuja .tut-boton--principal:not(:disabled):hover { background: color-mix(in oklab, var(--guia) 88%, var(--tinta)); }
    }
    .tut-boton:focus-visible, .tut-enlace:focus-visible { outline: 3px solid var(--foco); outline-offset: 2px; }
    .tut-menores { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
    .tut-burbuja .tut-enlace {
      min-block-size: 36px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: var(--texto-secundario);
      font-size: var(--autoria-texto-14); font-weight: 700; text-decoration: underline; text-underline-offset: 3px;
      text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
    }
    @media (hover: hover) and (pointer: fine) { .tut-burbuja .tut-enlace:hover { color: var(--tinta); background: var(--fondo-hundido); } }
    .tut-burbuja .tut-nota {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; margin: 4px -16px -12px; padding: 8px 16px;
      border-block-start: 1px solid var(--borde-control); background: var(--fondo-hundido); color: var(--texto-secundario);
      font-size: var(--autoria-texto-14); line-height: 20px;
    }
    .tut-atajo { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
    .tut-nota kbd { min-inline-size: 20px; padding: 0 5px; border-radius: 5px; background: var(--superficie); font-size: var(--autoria-texto-14); line-height: 18px; text-align: center; }

    .tut-burbuja .tut-medalla { font-size: 48px; line-height: 1; color: var(--guia); }
    .tut-insignias { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
    .tut-insignia { padding: 2px 10px; border-radius: 999px; background: var(--fondo-hundido); font-weight: 700; font-size: var(--autoria-texto-14); }
    .tut-pausa {
      position: fixed; z-index: var(--autoria-capa-50); inset-block-end: 16px; inset-inline-end: 16px; min-block-size: 44px;
      padding: 0 16px; border: 1px solid var(--borde-control); border-inline-start: 3px solid var(--guia); border-radius: 999px;
      background: var(--superficie); color: var(--tinta); box-shadow: var(--sombra-foco); font: inherit; font-weight: 700; cursor: pointer;
    }
    /* En una ventana estrecha la burbuja se ancla abajo, a todo el ancho; el anillo sigue en su sitio. */
    @media (max-width: 64rem) {
      .tut-burbuja { inset-inline: 16px; inset-block-start: auto !important; inset-block-end: 16px; inline-size: auto !important; left: 16px !important; }
    }
    .con-movimiento .anillo, .con-movimiento .tut-burbuja { animation: aparecer 160ms ease-out; }
    @keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }
    @media (forced-colors: active) {
      .anillo { outline: 4px solid Highlight; }
      .tut-burbuja { border-color: CanvasText; }
      .tut-progreso { border: 1px solid CanvasText; }
    }
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

  /** Pegado al borde de abajo de la ventana, la palabra «Tutorial» va sobre el filo de arriba del anillo. */
  protected readonly etiquetaArriba = computed(() => {
    const c = this.caja();
    const alto = typeof innerHeight === 'number' ? innerHeight : 768;
    return !!c && c.top + c.height + HOLGURA + 16 > alto;
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
    // La palabra «Tutorial» cuelga 11 px del filo de abajo del anillo: el margen de 16 ya la deja libre.
    const abajo = c.top + c.height + HOLGURA + margen;
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
