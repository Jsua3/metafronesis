import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, signal, viewChild } from '@angular/core';

import { rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { CasoBorrador, Escena } from '../../modelo/caso';
import { SalaVistaComponent } from '../sala/sala-vista.component';

/** La cámara muestra la sala a la mitad de su tamaño (960 × 528 → 480 × 264): una escala exacta, el pixel art no se ensucia. */
const ESCALA = 0.5;

interface Actor { clave: string; nombre: string; x: number; y: number; fila: number; sprite: string; habla: boolean }

/**
 * La vista de cámara de la escena (EDITOR-PRO.md, punto 3): el cuarto tal como lo verá el estudiante, con su elenco en su
 * lugar, y un globo sobre quien dice la línea que se está escribiendo. Va arriba del libreto, como el visor de una cámara.
 *
 * Patrón: componente de presentación (Composite). Una sala con fondo dibujado la pinta `app-sala-vista` (fondo, muebles y
 * personajes); una sala por piezas, su imagen compuesta (`miniatura`, que ya trae los muebles) con el elenco encima.
 */
@Component({
  selector: 'app-camara-escena',
  imports: [SalaVistaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="camara" [attr.aria-label]="'Vista de la sala ' + (sala()?.nombre ?? '') + ' con ' + actores().length + ' personajes'">
      <div class="camara__visor">
        @if (sala(); as s) {
          <div #cuadro class="camara__cuadro" [style.--ancho-sala]="anchoSala()" [style.aspect-ratio]="anchoSala() + ' / 528'">
            <div class="camara__mundo" [style.transform]="transformacion()">
            @if (s.fondo) {
              <app-sala-vista class="camara__sala" [caso]="caso()" [salaId]="s.id" />
            } @else {
              @if (miniatura(); as src) {
                <img class="camara__fondo" [src]="src" alt="" width="480" height="264" draggable="false" />
              } @else {
                <span class="camara__vacia"></span>
              }
              @for (a of actores(); track a.clave) {
                <span class="actor" [style.left.%]="a.x / anchoMedio() * 100" [style.top.%]="a.y / 264 * 100">
                  <span class="actor__sprite" [style.background-image]="'url(' + a.sprite + ')'" [style.background-position-y.%]="a.fila / 7 * 100"></span>
                </span>
              }
            }
            @if (hablante(); as h) {
              <!-- Quien habla: un aro de píxeles a sus pies (se acerca con la sala). -->
              <span class="aro" [style.left.%]="h.x / anchoMedio() * 100" [style.top.%]="h.pies / 264 * 100" aria-hidden="true"></span>
            }
            </div>
            <!-- El globo va FUERA del mundo que se escala: conserva su tamaño de letra y se acota al cuadro (antes, con la
                 cámara a ×2, salía al doble y se cortaba en el borde; medido el 2026-11-22). -->
            @if (globo(); as g) {
              <span #burbuja class="globo" [class.globo--izquierda]="g.izquierda" [style.left.px]="posicionGlobo().x" [style.top.px]="posicionGlobo().y">
                <strong>{{ g.nombre }}</strong> {{ textoGlobo() }}
              </span>
            }
          </div>
        } @else {
          <p class="camara__sin">Esta escena no tiene sala: el estudiante la lee como texto, sin cuarto.</p>
        }
      </div>
      <figcaption class="camara__pie">
        <span class="rec" aria-hidden="true"></span>
        <span>Cámara · {{ sala()?.nombre ?? 'Sin sala' }}</span>
        @if (sala()) {
          <button type="button" class="camara__alternar" (click)="alternarSala()" [attr.aria-pressed]="salaEntera()">
            {{ salaEntera() ? 'Seguir a quien habla' : 'Ver la sala entera' }}
          </button>
        }
        <span class="camara__dato">{{ actores().length }} {{ actores().length === 1 ? 'personaje' : 'personajes' }}</span>
        @if (hablante(); as h) { <span class="camara__dato">Habla: {{ h.nombre }}</span> }
      </figcaption>
    </figure>
  `,
  styles: `
    :host { display: block; }
    .camara { margin: 0; overflow: hidden; border: 1px solid var(--l-filo); border-radius: var(--l-radio-tarjeta); background: var(--l-superficie); }
    /* Una franja oscura de lado a lado con el cuadro al centro: el visor de una cámara, no una foto suelta. */
    .camara__visor {
      display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; padding: 0.75rem; background: var(--l-superficie-hundida);
    }
    .camara__cuadro {
      position: relative; container-type: inline-size; inline-size: 480px; max-inline-size: 100%; aspect-ratio: 960 / 528; overflow: hidden; border-radius: 0.375rem;
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--ds-surface-1) 18%, transparent), var(--l-sombra-alta);
    }
    .camara__mundo { position: absolute; inset: 0; transform-origin: 0 0; transition: transform var(--ds-dur-move) var(--ds-ease-out); }
    .camara__alternar { min-block-size: 44px; padding: 0 0.5rem; border: 1px solid var(--l-filo); border-radius: var(--l-radio-chico); background: var(--l-superficie); color: var(--ds-text-1); font: inherit; cursor: pointer; }
    .camara__alternar:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 2px; }
    .camara__sala { inline-size: 100%; }
    .camara__fondo { display: block; inline-size: 100%; block-size: 100%; image-rendering: pixelated; }
    .camara__vacia {
      display: block; inline-size: 100%; block-size: 100%;
      background: linear-gradient(var(--l-superficie-hundida) 0 38%, transparent 38%),
        repeating-conic-gradient(var(--l-filo-fuerte) 0 25%, var(--l-superficie) 0 50%) 0 0 / 1rem 1rem;
    }
    .actor { position: absolute; translate: -50% -100%; line-height: 0; pointer-events: none; }
    /* La hoja del kit (192 × 576) tiene cuadros de 48 × 72; a la mitad, 24 × 36 (el mismo factor que el cuarto). */
    .actor__sprite {
      display: block; inline-size: calc(4800cqw / var(--ancho-sala, 960)); block-size: calc(7200cqw / var(--ancho-sala, 960)); background-repeat: no-repeat; background-size: 400% 800%;
      background-position-x: 0; image-rendering: pixelated;
    }
    .aro {
      position: absolute; inline-size: 1.75rem; block-size: 0.5rem; translate: -50% -50%; border-radius: 50%;
      box-shadow: 0 0 0 2px var(--ds-primary), 0 0 0 4px color-mix(in oklab, var(--ds-primary) 30%, transparent);
      animation: aro-entra var(--ds-dur-base) var(--ds-spring-soft);
    }
    .globo {
      position: absolute; z-index: var(--autoria-capa-3); max-inline-size: min(15rem, 100%); max-block-size: 100%; box-sizing: border-box; overflow: auto; overflow-wrap: anywhere; padding: 0.3125rem 0.5rem;
      border-radius: 0.5rem 0.5rem 0.5rem 0.125rem; background: var(--l-superficie); color: var(--ds-text-1);
      box-shadow: 0 0 0 1px var(--l-filo-fuerte), var(--l-sombra); font-size: var(--autoria-texto-14); line-height: 1.25rem;
    }
    .globo--izquierda { border-radius: 0.5rem 0.5rem 0.125rem 0.5rem; }
    .globo strong { color: var(--ds-primary); }
    .camara__sin { margin: 0; padding: 2rem 1rem; color: var(--ds-surface-1); font-size: var(--autoria-texto-14); text-align: center; }
    .camara__pie {
      display: flex; align-items: center; gap: 0.5rem; min-block-size: 2rem; padding: 0 0.75rem; border-block-start: 1px solid var(--l-filo);
      color: var(--ds-text-2); font-size: var(--autoria-texto-14);
    }
    .camara__dato { padding-inline-start: 0.5rem; border-inline-start: 1px solid var(--l-filo); }
    /* El piloto de la cámara: un cuadrito de 2 px de pixel, quieto (nada infinito). */
    .rec { inline-size: 0.5rem; block-size: 0.5rem; background: var(--ds-danger); box-shadow: 0 0 0 2px color-mix(in oklab, var(--ds-danger) 25%, transparent); }
    @keyframes aro-entra { from { opacity: 0; scale: 0.6; } }
    /* En el teléfono el pie dice solo qué cámara es: las cifras ya están en el Inspector. */
    @media (max-width: 29.999rem) { .camara__dato { display: none; } }
    @media (prefers-reduced-motion: reduce) { .aro, .globo { animation: none; } .camara__mundo { transition: none; } }
  `,
})
export class CamaraEscenaComponent {
  readonly caso = input.required<CasoBorrador>();
  readonly escena = input.required<Escena>();
  /** La imagen compuesta de la sala (para las salas por piezas). */
  readonly miniatura = input<string | null>(null);
  /** La línea que se está escribiendo: su personaje es quien habla. */
  readonly lineaEnfocada = input<string | null>(null);

  private readonly cuadro = viewChild<ElementRef<HTMLElement>>('cuadro');
  private readonly burbuja = viewChild<ElementRef<HTMLElement>>('burbuja');
  protected readonly posicionGlobo = signal({ x: 0, y: 0 });

  constructor() {
    afterRenderEffect((onCleanup) => {
      const cuadro = this.cuadro()?.nativeElement;
      const burbuja = this.burbuja()?.nativeElement;
      const globo = this.globo();
      this.textoGlobo();
      if (!cuadro || !burbuja || !globo) return;
      const medir = () => {
        const posicion = ubicarGlobo(cuadro.clientWidth, cuadro.clientHeight, burbuja.offsetWidth, burbuja.offsetHeight, globo);
        this.posicionGlobo.set(posicion);
      };
      medir();
      if (typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(medir);
      observador.observe(cuadro);
      observador.observe(burbuja);
      onCleanup(() => observador.disconnect());
    });
  }

  protected readonly salaEntera = signal(false);
  protected alternarSala(): void { this.salaEntera.update((valor) => !valor); }
  /**
   * Encuadre de la cámara en % del cuadro: a ×2, la esquina visible (ox, oy) se acerca a quien habla sin salir de la sala;
   * con la sala entera, ×1 desde el origen. Un punto en p % del mundo queda en pantalla en escala × (p − origen) %.
   */
  private readonly encuadre = computed(() => {
    const h = this.hablante();
    if (this.salaEntera() || !h) return { ox: 0, oy: 0, escala: 1 };
    const limitar = (n: number) => Math.max(0, Math.min(50, n));
    return { ox: limitar(h.x / this.anchoMedio() * 100 - 25), oy: limitar(h.pies / 264 * 100 - 25), escala: 2 };
  });
  protected readonly transformacion = computed(() => {
    const { ox, oy, escala } = this.encuadre();
    return `translate(${-ox * escala}%, ${-oy * escala}%) scale(${escala})`;
  });
  /** Dónde va el globo en pantalla: sobre la cabeza de quien habla, siempre dentro del cuadro. */
  protected readonly globo = computed(() => {
    const h = this.hablante();
    if (!h) return null;
    const { ox, oy, escala } = this.encuadre();
    const x = Math.max(6, Math.min(94, escala * (h.x / this.anchoMedio() * 100 - ox)));
    const cabeza = escala * ((h.cabeza - 4) / 264 * 100 - oy);
    const pies = escala * ((h.pies + 4) / 264 * 100 - oy);
    return { nombre: h.nombre, x, cabeza, pies, izquierda: x > 60 };
  });

  protected readonly anchoSala = computed(() => this.sala()?.estructura?.ancho ?? 960);
  protected readonly anchoMedio = computed(() => this.anchoSala() / 2);
  protected readonly sala = computed(() => this.caso().salas.find((s) => s.id === this.escena().salaId) ?? null);

  protected readonly actores = computed<Actor[]>(() => {
    const sala = this.sala();
    if (!sala) return [];
    const habla = this.lineaActual()?.personajeId;
    return sala.personajes.map((p, i) => {
      const c = this.caso().personajes.find((x) => x.id === p.ref);
      return {
        clave: `${p.ref}-${i}`, nombre: c?.nombre ?? p.ref, x: p.x * ESCALA, y: p.y * ESCALA,
        fila: p.mirando === 'izquierda' ? 1 : 2, sprite: rutaSpriteKit(c?.recipeId ?? p.ref), habla: p.ref === habla,
      };
    });
  });

  private readonly lineaActual = computed(() => {
    const lineas = this.escena().lineas;
    return lineas.find((l) => l.id === this.lineaEnfocada()) ?? lineas[0] ?? null;
  });

  /** Quien dice la línea actual, si está en la sala (su lugar en la cámara). */
  protected readonly hablante = computed(() => {
    const a = this.actores().find((x) => x.habla);
    if (!a) return null;
    return { nombre: a.nombre, x: a.x, pies: a.y, cabeza: a.y - 36 };
  });

  protected readonly textoGlobo = computed(() => {
    const t = this.lineaActual()?.texto.trim() ?? '';
    return t ? `«${t.length > 90 ? t.slice(0, 88) + '…' : t}»` : '(sin escribir)';
  });
}

/** Sitúa el globo arriba si cabe; si no, debajo, y limita ambos ejes al cuadro. */
export function ubicarGlobo(ancho: number, alto: number, anchoGlobo: number, altoGlobo: number,
  ancla: { x: number; cabeza: number; pies: number; izquierda: boolean }): { x: number; y: number } {
  const limitar = (n: number, maximo: number) => Math.max(0, Math.min(Math.max(0, maximo), n));
  const x = ancho * ancla.x / 100 + (ancla.izquierda ? 16 - anchoGlobo : -16);
  const arriba = alto * ancla.cabeza / 100 - altoGlobo;
  const y = arriba >= 0 ? arriba : alto * ancla.pies / 100;
  return { x: limitar(x, ancho - anchoGlobo), y: limitar(y, alto - altoGlobo) };
}
