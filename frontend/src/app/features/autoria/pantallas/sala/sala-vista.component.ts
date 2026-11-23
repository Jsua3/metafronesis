import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';

import { rutaArte, rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { CasoBorrador } from '../../modelo/caso';

const ANCHO_SALA = 960;

interface PiezaVista {
  clave: string;
  nombre: string;
  x: number;
  y: number;
  arte: string;
  espejo: boolean;
  sprite?: { url: string; fila: number };
}

/**
 * La sala tal como quedó editada, solo para mirar: fondo, muebles, objetos y personajes en su
 * lugar. Se usa en la vista previa del guion.
 */
@Component({
  selector: 'app-sala-vista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sala(); as s) {
      <div class="sala-vista" role="img" [attr.aria-label]="descripcion()" [style.--escala]="escala()">
        <img class="pixel fondo" [src]="fondo()" alt="" width="960" height="528" draggable="false" />
        <div class="lienzo">
          @for (p of piezas(); track p.clave) {
            <div class="pieza" [attr.data-pieza]="p.clave" [style.left.px]="p.x" [style.top.px]="p.y" [style.z-index]="p.y">
              @if (p.sprite) {
                <span class="personaje" [style.background-image]="'url(' + p.sprite.url + ')'" [style.background-position]="'0 ' + (-72 * p.sprite.fila) + 'px'"></span>
              } @else {
                <img class="pixel" [src]="p.arte" alt="" draggable="false" [class.espejo]="p.espejo" />
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .sala-vista { position: relative; width: 100%; aspect-ratio: 960 / 528; overflow: hidden; border-radius: 10px; background: var(--juego-escenario); }
    .fondo { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
    .lienzo { position: absolute; left: 0; top: 0; width: 960px; height: 528px; transform: scale(var(--escala, 1)); transform-origin: 0 0; }
    .pieza { position: absolute; transform: translate(-50%, -100%); line-height: 0; display: flex; align-items: flex-end; justify-content: center; pointer-events: none; }
    .pieza img { image-rendering: pixelated; }
    .pieza img.espejo { transform: scaleX(-1); }
    .personaje { display: block; width: 48px; height: 72px; background-repeat: no-repeat; image-rendering: pixelated; }
  `,
})
export class SalaVistaComponent {
  readonly caso = input.required<CasoBorrador>();
  readonly salaId = input.required<string>();

  private readonly raiz: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly escala = signal(1);

  protected readonly sala = computed(() => this.caso().salas.find((s) => s.id === this.salaId()) ?? null);
  protected readonly fondo = computed(() => rutaArte(this.caso().lugarId, this.sala()?.fondo ?? ''));

  protected readonly piezas = computed<PiezaVista[]>(() => {
    const caso = this.caso();
    const s = this.sala();
    if (!s) return [];
    return [
      ...s.muebles.map((m, i) => {
        const c = caso.catalogo.muebles.find((x) => x.id === m.ref);
        return { clave: `mueble-${i}`, nombre: c?.nombre ?? m.ref, x: m.x, y: m.y, arte: rutaArte(caso.lugarId, c?.arte ?? ''), espejo: !!m.espejo };
      }),
      ...s.objetos.map((o, i) => {
        const c = caso.catalogo.objetos.find((x) => x.id === o.ref);
        return { clave: `objeto-${i}`, nombre: c?.nombre ?? o.ref, x: o.x, y: o.y, arte: rutaArte(caso.lugarId, c?.arte ?? ''), espejo: false };
      }),
      ...s.personajes.map((p, i) => {
        const c = caso.personajes.find((x) => x.id === p.ref);
        return {
          clave: `personaje-${i}`, nombre: c?.nombre ?? p.ref, x: p.x, y: p.y, arte: '', espejo: false,
          sprite: { url: rutaSpriteKit(c?.recipeId ?? p.ref), fila: p.mirando === 'izquierda' ? 1 : 2 },
        };
      }),
    ].sort((a, b) => a.y - b.y);
  });

  protected readonly descripcion = computed(() => {
    const s = this.sala();
    if (!s) return '';
    const caso = this.caso();
    const personas = s.personajes.map((p) => caso.personajes.find((x) => x.id === p.ref)?.nombre).filter(Boolean);
    return `${s.nombre}${personas.length ? `: ${personas.join(', ')}` : ''}.`;
  });

  constructor() {
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const medir = () => this.escala.set(this.raiz.clientWidth / ANCHO_SALA || 1);
      medir();
      new ResizeObserver(medir).observe(this.raiz);
    });
  }
}
