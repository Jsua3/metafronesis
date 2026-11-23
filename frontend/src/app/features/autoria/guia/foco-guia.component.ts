import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';

import { GuiaService, reducirMovimiento } from './guia.service';

interface Caja {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HOLGURA = 8;

/**
 * Lo que se ve de la guía: el anillo DISCONTINUO con la palabra «Guía», el velo oscuro (modo foco) con un hueco sobre el
 * elemento, y la burbuja con el texto, los pasos y «Cerrar guía». Su color es `--guia` (= `--ds-info`), ya no el violeta:
 * el violeta es el color de acción del portal (DP-03) y la guía se distingue por FORMA y PALABRA (EDITOR.md §4.7).
 */
@Component({
  selector: 'app-foco-guia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (guia.activa(); as g) {
      <div class="guia" [class.sin-movimiento]="reducir" [class.con-movimiento]="!reducir" [attr.data-modo]="g.modo">
        @if (g.modo === 'foco' && caja(); as c) {
          <div class="velo" (click)="guia.cerrar()" [style.top.px]="0" [style.left.px]="0" [style.right.px]="0" [style.height.px]="c.top - holgura"></div>
          <div class="velo" (click)="guia.cerrar()" [style.top.px]="c.top + c.height + holgura" [style.left.px]="0" [style.right.px]="0" [style.bottom.px]="0"></div>
          <div class="velo" (click)="guia.cerrar()" [style.top.px]="c.top - holgura" [style.left.px]="0" [style.width.px]="c.left - holgura" [style.height.px]="c.height + 2 * holgura"></div>
          <div class="velo" (click)="guia.cerrar()" [style.top.px]="c.top - holgura" [style.left.px]="c.left + c.width + holgura" [style.right.px]="0" [style.height.px]="c.height + 2 * holgura"></div>
        }
        @if (caja(); as c) {
          <div class="anillo" aria-hidden="true" [class.etiqueta-abajo]="c.top - holgura < 40" [style.top.px]="c.top - holgura" [style.left.px]="c.left - holgura"
               [style.width.px]="c.width + 2 * holgura" [style.height.px]="c.height + 2 * holgura">
            <span class="aqui">Guía</span>
          </div>
        }
        <div class="burbuja" role="group" [attr.aria-label]="g.modo === 'recorrido' ? 'Guía paso a paso' : 'Guía'"
             [style.top.px]="burbuja().top" [style.left.px]="burbuja().left">
          <p class="titulo">{{ g.nombre }}</p>
          <div aria-live="polite">
            @if (g.modo === 'recorrido') {
              <p class="paso">Paso {{ g.paso + 1 }} de {{ g.pasos.length }}</p>
              <p>{{ g.pasos[g.paso] }}</p>
            } @else {
              <p>{{ g.mensaje }}</p>
            }
          </div>
          <div class="acciones">
            @if (g.modo === 'recorrido') {
              <button type="button" class="boton" [attr.aria-disabled]="g.paso === 0" (click)="guia.anterior()">Anterior</button>
              <button type="button" class="boton boton-guia" (click)="guia.siguiente()">{{ g.paso >= g.pasos.length - 1 ? 'Terminar' : 'Siguiente' }}</button>
              <button type="button" class="boton boton-texto" (click)="guia.cerrar()">Salir de la guía</button>
            } @else {
              <button type="button" class="boton boton-guia" (click)="guia.cerrar()">Cerrar guía</button>
            }
          </div>
          <p class="texto-secundario nota">
            @if (g.modo === 'recorrido') { <kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd> cambian de paso. }
            <kbd>Esc</kbd> cierra la guía.
          </p>
        </div>
      </div>
    }
  `,
  styles: `
    .guia { position: fixed; inset: 0; z-index: var(--autoria-capa-50); pointer-events: none; }
    .velo { position: fixed; background: var(--velo); pointer-events: auto; }
    .anillo {
      position: fixed; border: 4px dashed var(--guia); border-radius: 12px; background: transparent;
      box-shadow: 0 0 0 4px var(--sobre-primario); outline: 2px solid transparent; /* con colores forzados se ve el contorno */
    }
    .aqui {
      position: absolute; top: -32px; left: -4px; padding: 2px 10px; border-radius: 999px; background: var(--guia); color: var(--sobre-primario);
      font-size: var(--autoria-texto-16); font-weight: 700;
    }
    /* Pegado al borde de arriba (la barra), la palabra «Guía» se saldría de la ventana: va debajo del anillo. */
    .etiqueta-abajo .aqui { top: auto; bottom: -36px; }
    .burbuja {
      position: fixed; width: min(360px, calc(100vw - 32px)); box-sizing: border-box; padding: 16px; pointer-events: auto;
      background: var(--superficie); border: 2px dashed var(--guia); border-radius: var(--radio-tarjeta); box-shadow: var(--sombra-foco);
      color: var(--tinta);
      display: flex; flex-direction: column; gap: 8px;
    }
    .burbuja p { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .titulo { font-weight: 700; color: var(--guia); }
    .paso { font-weight: 700; }
    .boton-guia { background: var(--guia); border-color: var(--guia); color: var(--sobre-primario); }
    .nota { font-size: var(--autoria-texto-16); }
    .con-movimiento .anillo, .con-movimiento .burbuja, .con-movimiento .velo { animation: aparecer 160ms ease-out; }
    @keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }
    @media (forced-colors: active) { .anillo { outline: 4px solid Highlight; } }
  `,
})
export class FocoGuiaComponent {
  protected readonly guia = inject(GuiaService);
  protected readonly holgura = HOLGURA;
  protected readonly reducir = reducirMovimiento();
  private readonly marco = signal(0);

  protected readonly caja = computed<Caja | null>(() => {
    this.marco();
    const el = this.guia.elemento();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  });

  protected readonly burbuja = computed(() => {
    const c = this.caja();
    const alto = typeof innerHeight === 'number' ? innerHeight : 768;
    const ancho = typeof innerWidth === 'number' ? innerWidth : 1366;
    if (!c) return { top: 96, left: Math.max(16, ancho - 392) };
    // Si la palabra «Guía» va debajo del anillo (elemento pegado arriba), la burbuja baja lo que ella ocupa.
    const abajo = c.top + c.height + HOLGURA + 16 + (c.top - HOLGURA < 40 ? 32 : 0);
    const top = abajo + 220 < alto ? abajo : Math.max(16, c.top - HOLGURA - 236);
    return { top, left: Math.min(Math.max(16, c.left), Math.max(16, ancho - 376)) };
  });

  constructor() {

    const medir = () => this.marco.update((n) => n + 1);
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', medir, true);
      window.addEventListener('resize', medir);
      inject(DestroyRef).onDestroy(() => {
        window.removeEventListener('scroll', medir, true);
        window.removeEventListener('resize', medir);
      });
    }
    // Al cambiar de elemento, se vuelve a medir cuando el navegador ya lo dibujó.
    effect(() => {
      if (this.guia.elemento() && typeof requestAnimationFrame === 'function') requestAnimationFrame(medir);
    });
  }
}
