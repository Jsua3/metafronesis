import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

import type { FichaDePieza } from '../../../simulator/sala/catalogo';
import type { PlanDeSala } from '../../../simulator/sala/composicion';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import { cajaDePieza, pasoDeTeclado, proyectarAlMuro, proyectarAlSuelo, zonasDeToque } from '../../modelo/arrastre-en-muro';
import type { Caja, LugarEnMuro, LugarEnSuelo } from '../../modelo/arrastre-en-muro';
import type { SalaCaso } from '../../modelo/caso';
import { MUROS, ancla, zonaCaminable } from '../../modelo/geometria';
import type { Muro } from '../../modelo/geometria';
import { anclaDeElemento } from '../../modelo/salas-a-documento';
import type { FaltaDeSala } from '../../modelo/salas-a-documento';

type Lugar = LugarEnMuro | LugarEnSuelo;
interface Pieza {
  id: string;
  tipo: 'pieza' | 'puerta';
  nombre: string;
  lugar: Lugar;
  ficha: Pick<FichaDePieza, 'ocupa' | 'franja' | 'muros'>;
}

@Component({
  selector: 'app-piezas-del-muro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { tabindex: '-1', '(keydown)': 'teclaGeneral($event)', '[class.solo-mirar]': 'soloMirar()' },
  template: `
    @for (p of piezas(); track p.tipo + ':' + p.id) {
      @let limites = zona(p);
      <button type="button" class="pieza-muro" [id]="idHtml(p)" [attr.data-pieza]="p.id"
        [attr.data-muro]="muro(p)" [attr.data-pos]="pos(p)" [attr.data-incumple]="reglas(p) || null"
        [attr.aria-label]="etiqueta(p)" [attr.aria-describedby]="descripcion(p) || null"
        [class.elegida]="seleccion() === idHtml(p)" [class.incumple]="faltasDe(p).length > 0"
        [style.left.px]="limites.x" [style.top.px]="limites.y" [style.width.px]="limites.ancho"
        [style.height.px]="limites.alto" (click)="elegir(p, $event)" (keydown)="tecla($event, p)"
        (pointerdown)="iniciar($event, p)" (pointermove)="mover($event)"
        (pointerup)="terminar($event)" (pointercancel)="cancelar($event)">
        @if (faltasDe(p).length) { <span aria-hidden="true">!</span> }
      </button>
    }
    <span role="status" class="solo-lector">{{ anuncio() }}</span>
  `,
  styles: [`
    :host { position: absolute; inset: 0; pointer-events: none; z-index: var(--autoria-capa-5); }
    .pieza-muro { position: absolute; box-sizing: border-box; min-width: calc(25px / var(--escala, 1)); min-height: calc(25px / var(--escala, 1)); padding: 0;
      border: 2px solid transparent; border-radius: calc(4px / var(--escala, 1)); background: transparent; touch-action: none; pointer-events: auto; cursor: grab; }
    .pieza-muro::before { content: ""; position: absolute; left: 50%; top: 50%; width: calc(25px / var(--escala, 1)); height: calc(25px / var(--escala, 1));
      transform: translate(-50%, -50%); }
    .pieza-muro:active { cursor: grabbing; }
    /* Solo mirar (pantallas angostas): se elige, no se arrastra. */
    :host(.solo-mirar) .pieza-muro { cursor: pointer; touch-action: auto; }
    /* Lo elegido se ve sobre cualquier arte: trazo del color de foco con un halo claro (forma, no solo color). */
    .pieza-muro.elegida, .pieza-muro:focus-visible { outline: 3px solid var(--ds-focus); outline-offset: 2px; box-shadow: 0 0 0 5px var(--ds-focus-halo); }
    .pieza-muro.incumple { border: 3px dashed var(--ds-danger); }
    .pieza-muro span { position: absolute; top: 0; right: 0; color: var(--sobre-primario); background: var(--ds-danger);
      font-weight: bold; padding: 1px 5px; line-height: 1.2; border-radius: 0 0 0 4px; }
    .solo-lector { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    @media (forced-colors: active) {
      .pieza-muro.elegida, .pieza-muro:focus-visible { outline-color: Highlight; box-shadow: none; }
      .pieza-muro.incumple { border-color: Mark; }
    }
  `],
})
export class PiezasDelMuroComponent {
  readonly sala = input.required<SalaCaso>();
  readonly plan = input.required<PlanDeSala | null>();
  readonly faltas = input.required<FaltaDeSala[]>();
  readonly escala = input.required<number>();
  readonly elegida = output<string | null>();
  /** Por debajo de 1024 px la sala es de solo mirar (EDITOR.md §4.5): se elige una pieza, pero no se mueve ni se quita. */
  readonly soloMirar = input(false);
  protected readonly seleccion = signal<string | null>(null);
  protected readonly anuncio = signal('');
  private readonly store = inject(CasoStore);
  private readonly catalogo = inject(CatalogoDePiezas);
  private readonly raiz = inject(ElementRef<HTMLElement>);
  private readonly arrastre = signal<{ pieza: Pieza; lugar: Lugar; puntero: number; x: number; y: number; movio: boolean } | null>(null);

  protected readonly piezas = computed<Pieza[]>(() => {
    const sala = this.sala();
    const fichas = this.catalogo.manifiesto()?.piezas ?? {};
    const ficha = (clave: string) => fichas[clave] ?? { ocupa: 48, franja: [0, 48] as [number, number], muros: [...MUROS] };
    const piezas: Pieza[] = (sala.estructura?.piezas ?? []).flatMap(p => {
      if (!p.id) return [];
      const lugar = p.muro !== undefined && p.pos !== undefined ? { muro: p.muro, pos: p.pos }
        : p.x !== undefined && p.y !== undefined ? { x: p.x, y: p.y } : null;
      if (!lugar) return [];
      const f = ficha(`${p.tipo}/${p.modelo}`);
      return [{ id: p.id, tipo: 'pieza' as const, nombre: 'nombre' in f ? String(f.nombre) : `${p.tipo} ${p.modelo}`,
        ficha: f, lugar }];
    });
    for (const p of sala.puertas) {
      if (p.muro === undefined || p.pos === undefined) continue;
      const f = ficha(`puerta/${p.modelo ?? ''}`);
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      piezas.push({ id: p.id, tipo: 'puerta', nombre: p.etiqueta || 'Puerta', ficha: f, lugar: { muro: p.muro, pos: p.pos } });
    }
    return piezas.sort((a, b) => this.orden(a.lugar) - this.orden(b.lugar) || this.valor(a.lugar) - this.valor(b.lugar));
  });

  private orden(lugar: Lugar): number { return 'muro' in lugar ? MUROS.indexOf(lugar.muro) : 4; }
  private valor(lugar: Lugar): number { return 'muro' in lugar ? lugar.pos : lugar.x; }
  protected idHtml(p: Pieza): string { return anclaDeElemento(this.sala().id, { tipo: p.tipo, id: p.id }); }
  protected faltasDe(p: Pieza): FaltaDeSala[] {
    return this.faltas().filter(f => f.elemento.tipo === p.tipo && f.elemento.id === p.id);
  }
  protected reglas(p: Pieza): string { return this.faltasDe(p).map(f => f.regla).join(' '); }
  protected descripcion(p: Pieza): string {
    return this.faltas().map((f, i) => ({ f, i })).filter(({ f }) => f.elemento.tipo === p.tipo && f.elemento.id === p.id)
      .map(({ i }) => `falta-${this.sala().id}-${i}`).join(' ');
  }
  protected muro(p: Pieza): string { const l = this.lugar(p); return 'muro' in l ? l.muro : 'suelo'; }
  protected pos(p: Pieza): number { return this.valor(this.lugar(p)); }
  protected etiqueta(p: Pieza): string {
    const l = this.lugar(p);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    const sitio = 'muro' in l ? `${{ fondo: 'muro del fondo', izquierda: 'muro izquierdo', derecha: 'muro derecho',
      camara: 'lado de la cámara' }[l.muro]}, a ${l.pos} px`
      : `suelo, a ${l.x}, ${l.y} px`;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    return `${p.nombre}, ${sitio}${this.faltasDe(p).map(f => `, no cumple: ${f.mensaje}`).join('')}`;
  }
  private lugar(p: Pieza): Lugar {
    const a = this.arrastre();
    return a && a.pieza.id === p.id && a.pieza.tipo === p.tipo ? a.lugar : p.lugar;
  }
  protected caja(p: Pieza) {
    const lugar = this.lugar(p);
    const sprite = this.plan()?.sprites.find(s => s.id === p.id);
    const vigente = lugar === p.lugar && (!('muro' in lugar) || (sprite?.muro === lugar.muro && sprite.pos === lugar.pos));
    return cajaDePieza(p.id, vigente ? this.plan() : null, lugar, p.ficha, this.sala().encuadre, this.ancho());
  }
  private ancho(): number { return this.sala().estructura?.ancho ?? 960; }
  /** Con el dedo (`pointer: coarse`) cada pieza se toca en una zona de 44 px en pantalla como mínimo (WCAG 2.5.8 táctil). */
  private readonly dedo = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  private readonly zonas = computed(() => this.dedo
    ? zonasDeToque(new Map(this.piezas().map(p => [this.idHtml(p), this.caja(p)])), 44 / (this.escala() || 1))
    : null);
  /** El botón transparente de la pieza: su caja con ratón; con el dedo, su zona de toque (el dibujo no cambia). */
  protected zona(p: Pieza): Caja { return this.zonas()?.get(this.idHtml(p)) ?? this.caja(p); }
  /** Suelta lo elegido sin avisar: la sala lo pide cuando se elige otra cosa (un mueble, una persona). */
  soltar(): void { this.seleccion.set(null); }
  seleccionar(id: string): void {
    this.seleccion.set(id); this.elegida.emit(id);
    setTimeout(() => this.raiz.nativeElement.ownerDocument.getElementById(id)?.focus());
  }
  protected elegir(p: Pieza, evento: Event): void {
    evento.stopPropagation(); this.seleccion.set(this.idHtml(p)); this.elegida.emit(this.idHtml(p));
  }
  private guardar(p: Pieza, lugar: Lugar): void {
    if (JSON.stringify(p.lugar) === JSON.stringify(lugar)) return;
    if (p.tipo === 'puerta' && 'muro' in lugar) this.store.moverPuerta(this.sala().id, p.id, lugar.muro, lugar.pos);
    else if (p.tipo === 'pieza') this.store.moverPiezaDeMuro(this.sala().id, p.id, lugar);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.anuncio.set(`${p.nombre}: ${'muro' in lugar ? `${lugar.muro}, ${lugar.pos} px` : `${lugar.x}, ${lugar.y} px`}.`);
    const boton = this.raiz.nativeElement.ownerDocument.getElementById(this.idHtml(p));
    if (boton === this.raiz.nativeElement.ownerDocument.activeElement) {
      setTimeout(() => this.raiz.nativeElement.ownerDocument.getElementById(this.idHtml(p))?.focus());
    }
  }
  protected teclaGeneral(evento: KeyboardEvent): void {
    if (this.soloMirar()) return;
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'z' && !evento.shiftKey) {
      evento.preventDefault(); evento.stopPropagation(); this.store.deshacer();
    }
  }
  protected tecla(evento: KeyboardEvent, p: Pieza): void {
    if (evento.ctrlKey || evento.metaKey) return;
    if (evento.key === 'Escape') {
      evento.preventDefault(); evento.stopPropagation(); this.seleccion.set(null); this.elegida.emit(null); return;
    }
    if (this.soloMirar()) return;
    if (evento.key === 'Delete' || evento.key === 'Backspace') {
      evento.preventDefault(); evento.stopPropagation();
      if (p.tipo === 'puerta') this.store.quitarPuerta(this.sala().id, p.id);
      else this.store.quitarPiezaDeMuro(this.sala().id, p.id);
      this.seleccion.set(null); this.elegida.emit(null); this.raiz.nativeElement.focus(); return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(evento.key)) return;
    evento.preventDefault(); evento.stopPropagation(); this.elegir(p, evento);
    const tecla = evento.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
    const lugar = p.lugar;
    if ('muro' in lugar) {
      this.guardar(p, pasoDeTeclado(lugar, tecla, p.ficha.muros.filter((m): m is Muro => MUROS.includes(m as Muro)),
        this.sala().encuadre, this.ancho()));
    } else {
      const dx = tecla === 'ArrowLeft' ? -8 : tecla === 'ArrowRight' ? 8 : 0;
      const dy = tecla === 'ArrowUp' ? -8 : tecla === 'ArrowDown' ? 8 : 0;
      this.guardar(p, proyectarAlSuelo({ x: lugar.x + dx, y: lugar.y + dy }, zonaCaminable(this.sala().encuadre, this.ancho())));
    }
  }
  protected iniciar(evento: PointerEvent, p: Pieza): void {
    if (evento.button !== 0) return;
    if (this.soloMirar()) { evento.stopPropagation(); this.elegir(p, evento); return; }
    evento.stopPropagation(); this.elegir(p, evento);
    (evento.currentTarget as HTMLElement).setPointerCapture?.(evento.pointerId);
    this.arrastre.set({ pieza: p, lugar: p.lugar, puntero: evento.pointerId, x: evento.clientX, y: evento.clientY, movio: false });
  }
  protected mover(evento: PointerEvent): void {
    const a = this.arrastre();
    if (!a || evento.pointerId !== a.puntero) return;
    evento.stopPropagation();
    const dx = (evento.clientX - a.x) / this.escala(), dy = (evento.clientY - a.y) / this.escala();
    const original = a.pieza.lugar;
    const punto = 'muro' in original ? ancla(original.muro, original.pos, this.sala().encuadre, this.ancho()) : original;
    const nuevo = { x: punto.x + dx, y: punto.y + dy };
    const lugar = 'muro' in original
      ? proyectarAlMuro(nuevo, original, a.pieza.ficha.muros.filter((m): m is Muro => MUROS.includes(m as Muro)),
        this.sala().encuadre, this.ancho())
      : proyectarAlSuelo(nuevo, zonaCaminable(this.sala().encuadre, this.ancho()));
    this.arrastre.set({ ...a, lugar, movio: dx !== 0 || dy !== 0 });
  }
  protected terminar(evento: PointerEvent): void {
    const a = this.arrastre();
    if (!a || evento.pointerId !== a.puntero) return;
    evento.stopPropagation(); this.arrastre.set(null);
    if (a.movio && JSON.stringify(a.lugar) !== JSON.stringify(a.pieza.lugar)) this.guardar(a.pieza, a.lugar);
  }
  protected cancelar(evento: PointerEvent): void {
    if (this.arrastre()?.puntero === evento.pointerId) { evento.stopPropagation(); this.arrastre.set(null); }
  }
}
