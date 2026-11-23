import {
  DestroyRef, Directive, Injectable, OnDestroy, OnInit, TemplateRef, ViewContainerRef, computed, inject, input, signal,
} from '@angular/core';

import { type Comando, acotar, guardar, leerGuardado } from './atajos';

/** Los huecos del estudio que una pantalla puede llenar. */
export type Ranura = 'explorador' | 'inspector' | 'herramientas' | 'estado';
export type Panel = 'explorador' | 'inspector';

/** Anchos por defecto y límites de los paneles (px). El lienzo nunca baja de 28rem: es el protagonista. */
export const ANCHO_PANEL: Record<Panel, { porDefecto: number; min: number; max: number }> = {
  explorador: { porDefecto: 272, min: 216, max: 400 },
  inspector: { porDefecto: 320, min: 264, max: 480 },
};

const CLAVE = 'siep.autoria.estudio.v1';

interface Guardado {
  explorador: number;
  inspector: number;
  verExplorador: boolean;
  verInspector: boolean;
}

/**
 * El contrato de la disposición de estudio (EDITOR-PRO.md, punto 1): Explorador · lienzo · Inspector, barra de
 * herramientas sobre el lienzo y barra de estado abajo.
 *
 * Patrón: Mediator. El marco (`autoria-shell`) dibuja los huecos; cada pantalla hija pone en ellos su contenido con
 * `<ng-template estudioRanura="inspector">` y registra sus comandos con `injectComandos()`. Ni el marco conoce las
 * pantallas ni las pantallas conocen el marco: solo este servicio, que el marco provee (`providers: [EstudioService]`).
 *
 * - Ranuras en pila: la última que se registra manda; al destruirse la pantalla, vuelve la anterior.
 * - Los anchos y si cada panel se ve se recuerdan en localStorage (con try/catch: sin almacenamiento vale en memoria).
 */
@Injectable()
export class EstudioService {
  private readonly guardado = signal<Guardado>(
    leerGuardado<Guardado>(CLAVE, {
      explorador: ANCHO_PANEL.explorador.porDefecto, inspector: ANCHO_PANEL.inspector.porDefecto, verExplorador: true, verInspector: true,
    }),
  );
  private readonly pilas = signal<Record<Ranura, { dueno: symbol; plantilla: TemplateRef<unknown> }[]>>({
    explorador: [], inspector: [], herramientas: [], estado: [],
  });
  private readonly fuentes = signal<{ dueno: symbol; fuente: () => Comando[] }[]>([]);

  readonly anchoExplorador = computed(() => this.guardado().explorador);
  readonly anchoInspector = computed(() => this.guardado().inspector);
  readonly verExplorador = computed(() => this.guardado().verExplorador);
  readonly verInspector = computed(() => this.guardado().verInspector);
  /** «Solo el lienzo» (Tab o \): los dos paneles ocultos. */
  readonly soloLienzo = computed(() => !this.verExplorador() && !this.verInspector());
  /** Todos los comandos registrados, en el orden en que llegaron sus pantallas. */
  readonly comandos = computed(() => this.fuentes().flatMap((f) => f.fuente()));
  readonly paletaAbierta = signal(false);
  readonly atajosAbiertos = signal(false);

  /** La plantilla que manda en una ranura, o `null` si ninguna pantalla la llenó. */
  ranura(r: Ranura): TemplateRef<unknown> | null {
    return this.pilas()[r].at(-1)?.plantilla ?? null;
  }

  /** Pone una plantilla en una ranura; devuelve con qué quitarla. */
  registrar(r: Ranura, plantilla: TemplateRef<unknown>): () => void {
    const dueno = Symbol(r);
    this.pilas.update((p) => ({ ...p, [r]: [...p[r], { dueno, plantilla }] }));
    return () => this.pilas.update((p) => ({ ...p, [r]: p[r].filter((x) => x.dueno !== dueno) }));
  }

  /** Registra una fuente de comandos (se vuelve a leer cada vez que cambia lo que lee); devuelve con qué quitarla. */
  registrarComandos(fuente: () => Comando[]): () => void {
    const dueno = Symbol('comandos');
    this.fuentes.update((f) => [...f, { dueno, fuente }]);
    return () => this.fuentes.update((f) => f.filter((x) => x.dueno !== dueno));
  }

  ver(panel: Panel): boolean {
    return panel === 'explorador' ? this.verExplorador() : this.verInspector();
  }

  alternar(panel: Panel, ver = !this.ver(panel)): void {
    this.cambiar(panel === 'explorador' ? { verExplorador: ver } : { verInspector: ver });
  }

  /** Tab o \: si se ve algún panel, se ocultan los dos; si no, vuelven los dos. */
  alternarPaneles(): void {
    const ver = this.soloLienzo();
    this.cambiar({ verExplorador: ver, verInspector: ver });
  }

  /** Ajusta el ancho de un panel dentro de sus límites y lo recuerda. */
  fijarAncho(panel: Panel, px: number): void {
    const { min, max } = ANCHO_PANEL[panel];
    this.cambiar({ [panel]: Math.round(acotar(px, min, max)) });
  }

  restablecerAncho(panel: Panel): void {
    this.fijarAncho(panel, ANCHO_PANEL[panel].porDefecto);
  }

  private cambiar(parte: Partial<Guardado>): void {
    this.guardado.update((g) => ({ ...g, ...parte }));
    guardar(CLAVE, this.guardado());
  }
}

/**
 * `<ng-template estudioRanura="inspector">…</ng-template>`: lleva ese contenido al hueco del estudio mientras la pantalla
 * viva. Sin estudio alrededor (una prueba de la pantalla sola, un teléfono sin marco) lo pinta en su sitio: la pantalla
 * funciona igual y sus pruebas encuentran sus controles.
 */
@Directive({ selector: 'ng-template[estudioRanura]' })
export class EstudioRanuraDirective implements OnInit, OnDestroy {
  readonly estudioRanura = input.required<Ranura>();
  private readonly plantilla = inject(TemplateRef);
  private readonly contenedor = inject(ViewContainerRef);
  private readonly estudio = inject(EstudioService, { optional: true });
  private quitar: (() => void) | null = null;

  ngOnInit(): void {
    if (this.estudio) this.quitar = this.estudio.registrar(this.estudioRanura(), this.plantilla);
    else this.contenedor.createEmbeddedView(this.plantilla);
  }

  ngOnDestroy(): void {
    this.quitar?.();
  }
}

/**
 * Registra los comandos de una pantalla en la paleta (Ctrl+K) mientras la pantalla viva. Llamar en el constructor o en un
 * inicializador de campo. Sin estudio alrededor no hace nada.
 */
export function injectComandos(fuente: () => Comando[]): void {
  const estudio = inject(EstudioService, { optional: true });
  if (!estudio) return;
  inject(DestroyRef).onDestroy(estudio.registrarComandos(fuente));
}
