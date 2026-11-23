import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, TemplateRef, afterNextRender, computed, inject, input } from '@angular/core';

import { type GrupoAtajos, esCampoDeTexto } from './atajos';
import { EstudioAtajosComponent } from './estudio-atajos.component';
import { EstudioBarraEstadoComponent } from './estudio-barra-estado.component';
import { EstudioDivisorComponent } from './estudio-divisor.component';
import { EstudioHerramientaComponent } from './estudio-herramienta.component';
import { EstudioPaletaComponent } from './estudio-paleta.component';
import { EstudioPanelComponent } from './estudio-panel.component';
import { ANCHO_PANEL, EstudioService, type Panel } from './estudio.service';

/** Los atajos de todo el editor (la hoja «?» suma después los de la pantalla abierta, sacados de sus comandos). */
const ATAJOS_GENERALES: GrupoAtajos[] = [
  { titulo: 'En todo el editor', atajos: [
    { teclas: ['Ctrl', 'K'], hace: 'Paleta de comandos: ir a una escena, una etapa o una acción' },
    { teclas: ['?'], hace: 'Esta hoja de atajos' },
    { teclas: ['\\'], hace: 'Ocultar o mostrar los paneles (solo el lienzo)' },
    { teclas: ['Esc'], hace: 'Cerrar el globo, el menú o la hoja abierta' },
  ] },
  { titulo: 'Historia', atajos: [
    { teclas: ['Alt', 'M'], hace: 'Cambiar entre Guion y Caminos' },
    { teclas: ['Alt', '↓'], hace: 'Escena siguiente de la historia' },
    { teclas: ['Alt', '↑'], hace: 'Escena anterior de la historia' },
  ] },
];

/**
 * El espacio de trabajo del editor (EDITOR-PRO.md, punto 1): Explorador · lienzo · Inspector, barra de herramientas sobre
 * el lienzo y barra de estado al pie, a pantalla completa bajo la barra de vidrio. Sin desplazamiento de página: se
 * desplaza cada panel.
 *
 * Patrón: Composite + Mediator. Arma la disposición con las primitivas y lee de `EstudioService` lo que las pantallas
 * pusieron en sus ranuras; el contenido central (la pantalla de la ruta) llega proyectado.
 *
 * - El Explorador muestra lo que una pantalla puso en la ranura `explorador` o, si ninguna, `exploradorPorDefecto` (el
 *   marco del editor le pasa las escenas y la biblioteca en la etapa Historia). Sin ninguno de los dos, no ocupa lugar.
 * - El Inspector existe solo si la pantalla abierta llenó la ranura `inspector`.
 * - Teclas: Ctrl+K (paleta), «?» (atajos) y «\» (solo el lienzo). Las de una tecla no actúan dentro de un campo.
 * - Por debajo de 64rem todo va en una columna (los paneles, bajo el contenido) y la página se desplaza (WCAG 1.4.10).
 */
@Component({
  selector: 'app-estudio-marco',
  imports: [
    NgTemplateOutlet, EstudioPanelComponent, EstudioDivisorComponent, EstudioBarraEstadoComponent, EstudioHerramientaComponent,
    EstudioPaletaComponent, EstudioAtajosComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'tecla($event)',
    '[class.con-explorador]': 'hayExplorador()', '[class.con-inspector]': 'hayInspector()',
    '[style.--est-ancho-explorador.px]': 'estudio.anchoExplorador()', '[style.--est-ancho-inspector.px]': 'estudio.anchoInspector()',
  },
  template: `
    <!-- Oculto (\ o «Ocultar») el panel sigue vivo: las escenas conservan sus atajos (Alt+M, Alt+↓) y su desplazamiento. -->
    @if (exploradorDisponible()) {
      <app-estudio-panel class="panel panel--explorador" [titulo]="nombreExplorador()" lado="inicio" atajoOcultar="\\" [lleno]="true"
                         [hidden]="!estudio.verExplorador()" (ocultar)="alternarPanel('explorador', false)">
        <ng-container [ngTemplateOutlet]="explorador()" />
      </app-estudio-panel>
      <app-estudio-divisor class="divisor divisor--explorador" etiqueta="Ancho del explorador" [valor]="estudio.anchoExplorador()"
                           [min]="limites.explorador.min" [max]="limites.explorador.max" [hidden]="!estudio.verExplorador()"
                           (cambio)="estudio.fijarAncho('explorador', $event)" (restablecer)="estudio.restablecerAncho('explorador')" />
    }
    <nav class="paneles-movil" aria-label="Paneles del editor">
      @if (exploradorDisponible()) { <button type="button" data-panel-control="explorador" (click)="alternarPanel('explorador')" [attr.aria-pressed]="estudio.verExplorador()">Explorador</button> }
      @if (inspectorDisponible()) { <button type="button" data-panel-control="inspector" (click)="alternarPanel('inspector')" [attr.aria-pressed]="estudio.verInspector()">Inspector</button> }
    </nav>
    <div class="centro">
      @if (estudio.ranura('herramientas'); as herramientas) {
        <div class="herramientas" role="toolbar" aria-label="Herramientas de la vista"><ng-container [ngTemplateOutlet]="herramientas" /></div>
      }
      <div class="centro__contenido"><ng-content /></div>
    </div>
    @if (hayInspector()) {
      <app-estudio-divisor class="divisor divisor--inspector" etiqueta="Ancho del inspector" [valor]="estudio.anchoInspector()" [invertido]="true"
                           [min]="limites.inspector.min" [max]="limites.inspector.max"
                           (cambio)="estudio.fijarAncho('inspector', $event)" (restablecer)="estudio.restablecerAncho('inspector')" />
      <app-estudio-panel class="panel panel--inspector" titulo="Inspector" lado="fin" atajoOcultar="\\"
                         (ocultar)="alternarPanel('inspector', false)">
        <ng-container [ngTemplateOutlet]="estudio.ranura('inspector')" />
      </app-estudio-panel>
    }

    <app-estudio-barra-estado class="estado">
      <ng-container ngProjectAs="[estudioEstadoInicio]"><ng-content select="[estudioEstadoInicio]" /></ng-container>
      @if (estudio.ranura('estado'); as estado) { <ng-container [ngTemplateOutlet]="estado" /> }
      @if (exploradorDisponible()) {
        <button type="button" estudioHerramienta="Explorador" globo="arriba" [activa]="estudio.verExplorador()" data-panel-control="explorador" (click)="alternarPanel('explorador')">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M7.5 4v12" /></svg>
        </button>
      }
      @if (inspectorDisponible()) {
        <button type="button" estudioHerramienta="Inspector" globo="arriba" [activa]="estudio.verInspector()" data-panel-control="inspector" (click)="alternarPanel('inspector')">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M12.5 4v12" /></svg>
        </button>
      }
      <button type="button" class="est-dato-boton" data-accion="comandos" aria-keyshortcuts="Control+K" aria-haspopup="dialog"
              (click)="estudio.paletaAbierta.set(true)">Comandos <kbd>Ctrl K</kbd></button>
      <button type="button" estudioHerramienta="Atajos del teclado" atajo="?" globo="fin" aria-haspopup="dialog" (click)="estudio.atajosAbiertos.set(true)">
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="2" /><path d="M5.5 8.5h1M9.5 8.5h1M13.5 8.5h1M7 12h6" /></svg>
      </button>
    </app-estudio-barra-estado>

    @if (estudio.paletaAbierta()) {
      <app-estudio-paleta [comandos]="estudio.comandos()" (cerrar)="cerrarPaleta()" />
    }
    @if (estudio.atajosAbiertos()) {
      <app-estudio-atajos [grupos]="gruposAtajos()" (cerrar)="cerrarAtajos()" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-inline-size: 0; }
    .centro { display: flex; flex-direction: column; min-inline-size: 0; min-block-size: 0; }
    /* La pantalla de la ruta se desplaza sola dentro de esta caja (que no se desplaza): lo que flota encima, como el
       asistente de IA, se ancla aquí y no viaja con el contenido. */
    .centro__contenido { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); flex: 1; min-inline-size: 0; min-block-size: 0; }
    /* La barra no se encoge (flex: none): encogida a 44 px con botones de 44 más su relleno, el overflow-x: auto la volvía
       desplazable también en vertical (aparecía una barra ▲●▼, «Acciones» quedaba cortado y los globos de ayuda, recortados;
       lo vio el usuario el 2026-11-22). En escritorio nada se recorta; en pantallas estrechas se desplaza solo a lo ancho. */
    .herramientas {
      display: flex; flex: none; align-items: center; gap: 0.25rem; min-block-size: 2.75rem; padding: 0.25rem 0.5rem; overflow: visible;
      border-block-end: 1px solid var(--l-filo); background: var(--l-superficie);
    }
    @media (max-width: 63.999rem) {
      .herramientas { overflow-x: auto; overflow-y: hidden; }
    }
    .paneles-movil { display: flex; gap: 0.5rem; padding: 0.25rem; background: var(--l-superficie); }
    .paneles-movil button { min-block-size: 44px; padding-inline: 0.75rem; color: var(--ds-text-1); background: var(--l-superficie); border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-control); }
    .paneles-movil button:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 2px; }
    .divisor { display: none; }
    .estado { display: none; }
    .estado kbd {
      padding: 0 0.25rem; border-radius: 0.25rem; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte); background: transparent;
      font: inherit; font-size: var(--autoria-texto-14);
    }
    .panel--explorador { border-block-end: 1px solid var(--l-filo); }
    .panel--inspector { border-block-start: 1px solid var(--l-filo); }

    /* Escritorio: rejilla fija bajo la barra; la página no se desplaza (EDITOR.md §4.2, regla 1). */
    @media (min-width: 64rem) {
      :host {
        display: grid; flex: 1; min-block-size: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto;
        background: var(--l-superficie-hundida);
      }
      :host(.con-explorador) { grid-template-columns: var(--est-ancho-explorador) 0 minmax(28rem, 1fr); }
      :host(.con-inspector) { grid-template-columns: minmax(28rem, 1fr) 0 var(--est-ancho-inspector); }
      :host(.con-explorador.con-inspector) {
        grid-template-columns: var(--est-ancho-explorador) 0 minmax(28rem, 1fr) 0 var(--est-ancho-inspector);
      }
      .paneles-movil { display: none; }
      .panel, .centro, .divisor { grid-row: 1; min-block-size: 0; }
      .panel--explorador, .panel--inspector { border-block: 0; }
      .divisor:not([hidden]) { display: block; }
      .estado { display: flex; grid-row: 2; grid-column: 1 / -1; }
      /* Al volver a mostrarse, el panel entra deslizándose desde su borde (resorte suave). */
      .panel--explorador:not([hidden]) { animation: panel-entra var(--ds-dur-move) var(--ds-spring-soft); }
      .panel--inspector { animation: panel-entra-fin var(--ds-dur-move) var(--ds-spring-soft); }
    }
    @keyframes panel-entra { from { opacity: 0; translate: -0.75rem 0; } }
    @keyframes panel-entra-fin { from { opacity: 0; translate: 0.75rem 0; } }
    @media (prefers-reduced-motion: reduce) { .panel { animation-duration: 1ms; } }
  `,
})
export class EstudioMarcoComponent {
  protected readonly estudio = inject(EstudioService);
  /** Lo que el Explorador muestra si ninguna pantalla puso el suyo (en Historia: escenas y biblioteca). */
  readonly exploradorPorDefecto = input<TemplateRef<unknown> | null>(null);
  readonly nombreExplorador = input('Explorador');
  protected readonly limites = ANCHO_PANEL;

  protected readonly explorador = computed(() => this.estudio.ranura('explorador') ?? this.exploradorPorDefecto());
  protected readonly exploradorDisponible = computed(() => this.explorador() !== null);
  protected readonly inspectorDisponible = computed(() => this.estudio.ranura('inspector') !== null);
  protected readonly hayExplorador = computed(() => this.exploradorDisponible() && this.estudio.verExplorador());
  protected readonly hayInspector = computed(() => this.inspectorDisponible() && this.estudio.verInspector());

  /** Los generales y, debajo, los de la pantalla abierta (los comandos que traen atajo), por grupo. */
  protected readonly gruposAtajos = computed<GrupoAtajos[]>(() => {
    const propios = new Map<string, GrupoAtajos>();
    for (const c of this.estudio.comandos()) {
      if (!c.atajo) continue;
      const g = propios.get(c.grupo) ?? { titulo: c.grupo, atajos: [] };
      g.atajos.push({ teclas: c.atajo.split('+'), hace: c.titulo });
      propios.set(c.grupo, g);
    }
    return [...ATAJOS_GENERALES, ...propios.values()];
  });

  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private origen: HTMLElement | null = null;

  /** El control visible recupera el foco al cerrar; al abrir, entra en la cabecera del panel. */
  protected alternarPanel(panel: Panel, ver = !this.estudio.ver(panel)): void {
    this.estudio.alternar(panel, ver);
    if (!ver) {
      const escritorio = window.matchMedia?.('(min-width: 64rem)').matches ?? window.innerWidth >= 1024;
      const zona = escritorio ? '.estado' : '.paneles-movil';
      this.raiz.querySelector<HTMLButtonElement>(`${zona} [data-panel-control="${panel}"]`)?.focus();
      return;
    }
    afterNextRender(() => {
      if (this.estudio.ver(panel)) this.raiz.querySelector<HTMLButtonElement>(`.panel--${panel} .cab button`)?.focus();
    }, { injector: this.injector });
  }

  /**
   * Ctrl+K siempre (también desde un campo: es lo esperable en un editor). «?» y «\» solo fuera de los campos, sin
   * modificadores, y si nadie más atendió la tecla.
   */
  protected tecla(e: KeyboardEvent): void {
    if (e.defaultPrevented || this.estudio.paletaAbierta() || this.estudio.atajosAbiertos()) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.abrir(() => this.estudio.paletaAbierta.set(true));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || esCampoDeTexto(e.target)) return;
    if (this.estudio.paletaAbierta() || this.estudio.atajosAbiertos()) return;
    if (e.key === '?') {
      e.preventDefault();
      this.abrir(() => this.estudio.atajosAbiertos.set(true));
    } else if (e.key === '\\') {
      e.preventDefault();
      this.estudio.alternarPaneles();
    }
  }

  private abrir(accion: () => void): void {
    const activo = document.activeElement;
    this.origen = activo instanceof HTMLElement && activo !== document.body ? activo : null;
    accion();
  }

  /** Al cerrar sin elegir, el foco vuelve a donde estaba; si un comando lo movió, se queda allí. */
  protected cerrarPaleta(): void {
    this.estudio.paletaAbierta.set(false);
    this.devolverFoco();
  }

  protected cerrarAtajos(): void {
    this.estudio.atajosAbiertos.set(false);
    this.devolverFoco();
  }

  private devolverFoco(): void {
    const origen = this.origen;
    this.origen = null;
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) origen?.focus();
    });
  }
}
