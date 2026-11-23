import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { ClinicalToolState } from '../../core/models/simulation.model';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { DRAFT_COPY } from './draft-copy';
import { PixelIconoComponent } from './pixel/pixel-icono.component';

/** Cómo se consigue una herramienta que aún no se tiene: igual para todas, no revela cuál sirve para qué decisión. */
const LOCKED_REASON = 'Se consigue explorando las salas del caso.';

/** Códigos de herramienta que tienen su tira de iconos de pixel (O1); el resto conserva el icono de Material. */
const ICONOS_DE_BARRA = new Set(['PAP', 'SPIKES', 'RISK_METER', 'SAFETY_ROUTE', 'REFLECTION_JOURNAL']);
const RUTA_ICONOS = 'assets/biblioteca/piezas/herramientas/iconos/';

/**
 * Dock horizontal inferior de herramientas clínicas (HUD redesign).
 * Cards compactas: icono + nombre corto, con el nombre completo en `title` y en el nombre accesible.
 * Las bloqueadas son `aria-disabled` y siguen siendo enfocables: así quien navega con teclado o lector
 * las encuentra y entiende por qué no se pueden usar. No hay insignias 1-5 porque no existe ese atajo.
 * La salida segura vive FUERA de este dock (bloque separado a la izquierda en la bottom-zone del gameplay).
 */
@Component({
  selector: 'app-tool-inventory',
  standalone: true,
  imports: [CommonModule, MatIconModule, UiIconButton, PixelIconoComponent],
  template: `
    <div class="tool-dock-wrap">
      @if (tools().length > 0) {
        <!-- Pestaña de pixel montada sobre la fila de ranuras: el nombre de la ranura con foco o elegida va aquí porque las ranuras no lo muestran. -->
        <span class="tool-count u-rotulo u-rotulo--suave" aria-hidden="true">
          <span class="tool-count__label u-rotulo__texto">Herramientas ·</span>
          <strong class="tool-count__cuenta">{{ ownedCount() }} de {{ tools().length }}</strong>
          @if (nombreVisible(); as nombre) {
            <span class="u-rotulo__texto">· {{ nombre }}</span>
          }
        </span>
      }
      <!-- Barra de herramientas (patrón ARIA, tabindex itinerante): UNA parada de tabulación; flechas, Inicio y Fin
           recorren las ranuras. Las bloqueadas siguen enfocables (aria-disabled, nunca disabled) para explicar por qué. -->
      <div
        class="tool-dock"
        role="toolbar"
        aria-orientation="horizontal"
        [attr.aria-label]="'Herramientas ' + ownedCount() + ' de ' + tools().length + '. ' + inventoryLabel + '; desplázate horizontalmente para revisar todas las herramientas.'">
        @for (tool of tools(); track tool.code; let index = $index) {
          @let owned = ownedSet().has(tool.code);
          <button
            class="tool-card u-ranura u-sombra"
            type="button"
            [attr.tabindex]="index === tabStop() ? 0 : -1"
            [attr.aria-disabled]="owned ? null : 'true'"
            [class.tool-card--owned]="owned"
            [class.tool-card--locked]="!owned"
            [class.tool-card--selected]="selectedToolCode() === tool.code"
            [title]="owned ? tool.label + ' — ' + tool.description : tool.label + ' — ' + lockedReason"
            [attr.aria-label]="tool.label + ': ' + tool.description + '. ' + (owned ? 'Disponible.' : 'No disponible. ' + lockedReason)"
            (focus)="activeIndex.set(index); focoIndex.set(index)"
            (blur)="focoIndex.set(null)"
            (keydown)="onToolKeydown($event, index)"
            (click)="onSelect(tool, $event)">
            @if (!owned) {
              <app-pixel-icono class="tool-lock" nombre="candado" />
            }
            @if (iconoDe(tool.code); as ref) {
              <i class="tool-card__icono" aria-hidden="true" [style.background-image]="'url(' + rutaIconos + ref + '-20.png)'"></i>
            } @else {
              <mat-icon aria-hidden="true">{{ tool.icon }}</mat-icon>
            }
            <span class="tool-name" aria-hidden="true">{{ tool.label }}</span>
          </button>
        }
      </div>
      <!-- En táctil el title no se ve: tocar una bloqueada lo explica aquí. Es un aviso accionable (VD-29): permanece
           hasta cerrarlo («Cerrar aviso» o Esc, que consume solo esa pulsación) y se anuncia por las regiones vivas. -->
      @if (notice(); as message) {
        <div class="tool-notice u-placa u-sombra">
          <p class="tool-notice__text">{{ message }}</p>
          <button ui-icon-button class="tool-notice__close" icon="close" label="Cerrar aviso" (click)="dismissNotice()"></button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { position: relative; }
    /* La pestaña de la cuenta se monta sobre la fila de ranuras (el margen negativo es de .u-rotulo). */
    .tool-dock-wrap { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
    .tool-count { flex-shrink: 0; }
    .tool-count__cuenta { color: var(--luz); font-weight: 700; }
    .tool-dock {
      display: flex;
      align-items: stretch;
      gap: calc(3 * var(--pixel-px));
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      /* Aire para la sombra de tramado (.u-sombra) que cuelga bajo cada ranura: el dock recorta lo que sale. */
      padding-bottom: calc(7 * var(--pixel-px));
    }
    .tool-card { flex-shrink: 0; min-height: 44px; color: var(--pixel-tinta); }
    .tool-card mat-icon { font-size: calc(12 * var(--pixel-px)); width: calc(12 * var(--pixel-px)); height: calc(12 * var(--pixel-px)); }
    /* El nombre ya está en el nombre accesible, en el title y en la pestaña: aquí solo queda en el DOM. */
    .tool-name { display: none; }
    /* El cuaderno de O1: tira de 6 cuadros de 20 px; el cuadro 0 es «disponible». */
    .tool-card__icono {
      display: block;
      width: calc(20 * var(--pixel-px));
      height: calc(20 * var(--pixel-px));
      background-repeat: no-repeat;
      background-size: calc(120 * var(--pixel-px)) calc(20 * var(--pixel-px));
      background-position: 0 0;
      image-rendering: pixelated;
    }
    .tool-card--selected { --m: var(--marco-ficha-foco); --t: var(--trama-ficha-sobre); animation: tool-pop 170ms cubic-bezier(.2,.8,.2,1); }
    .tool-card--locked { cursor: default; }
    .tool-card--locked .tool-card__icono,
    .tool-card--locked mat-icon { filter: grayscale(1) contrast(.75) brightness(1.05); opacity: .5; }
    /* Candado de pixel abajo a la derecha, con contorno de un punto hacia los cuatro lados. */
    .tool-lock {
      position: absolute;
      right: calc(1 * var(--pixel-px));
      bottom: calc(1 * var(--pixel-px));
      color: var(--pixel-tinta-suave);
      filter:
        drop-shadow(var(--pixel-px) 0 0 var(--pixel-contorno))
        drop-shadow(calc(-1 * var(--pixel-px)) 0 0 var(--pixel-contorno))
        drop-shadow(0 var(--pixel-px) 0 var(--pixel-contorno))
        drop-shadow(0 calc(-1 * var(--pixel-px)) 0 var(--pixel-contorno));
    }
    /* El anillo es el de la piel del juego (--ds-focus); el dock recorta lo que sale de él (overflow), así que va hacia adentro. */
    .tool-card:focus-visible { outline-offset: -3px; }
    .tool-notice {
      position: absolute;
      left: 0;
      bottom: calc(100% + 6px);
      z-index: var(--ds-z-elevado);
      display: flex;
      align-items: center;
      gap: 4px;
      max-width: min(340px, 92vw);
      padding: 0 0 0 calc(3 * var(--pixel-px));
      font-size: var(--pixel-tam);
      line-height: 1.3;
    }
    .tool-notice__text { margin: 0; padding: 5px 0; color: var(--pixel-tinta); }
    @keyframes tool-pop {
      0%   { transform: scale(.94); }
      70%  { transform: scale(1.02); }
      100% { transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tool-card--selected { animation: none; }
    }
  `]
})
export class ToolInventoryComponent {
  readonly tools = input<ClinicalToolState[]>([]);
  readonly inventory = input<string[]>([]);
  readonly selectedToolCode = input<string | null>(null);
  readonly select = output<string>();

  protected readonly lockedReason = LOCKED_REASON;
  protected readonly rutaIconos = RUTA_ICONOS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly announcer = inject(LiveRegionAnnouncer);
  /** Ranura que lleva el foco de tabulación (tabindex itinerante): la barra entera es UNA parada de Tab (H-12). */
  protected readonly activeIndex = signal(0);
  protected readonly tabStop = computed(() => Math.min(this.activeIndex(), Math.max(0, this.tools().length - 1)));
  /** Ranura que tiene el foco ahora mismo (null al salir): su nombre se lee en la pestaña, porque las ranuras no lo muestran. */
  protected readonly focoIndex = signal<number | null>(null);
  /** Nombre que acompaña a la cuenta en la pestaña: el de la ranura con foco o, si no hay, el de la elegida. */
  protected readonly nombreVisible = computed(() => {
    const index = this.focoIndex();
    const tools = this.tools();
    const porFoco = index === null ? undefined : tools[index];
    const elegida = tools.find(tool => tool.code === this.selectedToolCode());
    return (porFoco ?? elegida)?.label ?? '';
  });
  /** La ranura que pidió el aviso: al cerrarlo con su botón, el foco vuelve a ella. */
  private lockedOrigin: HTMLElement | null = null;
  /** Vocabulario educativo en borrador (VD-24): sale del registro, no de la plantilla. */
  protected readonly inventoryLabel = DRAFT_COPY.inventoryLabel.text;

  protected readonly ownedSet = computed(() => new Set(this.inventory()));
  protected readonly ownedCount = computed(() => this.tools().filter(tool => this.ownedSet().has(tool.code)).length);

  /** Herramienta bloqueada sobre la que se pidió explicación; el aviso se apaga solo si deja de estar bloqueada. */
  private readonly lockedCode = signal<string | null>(null);
  protected readonly notice = computed(() => {
    const code = this.lockedCode();
    if (!code || this.ownedSet().has(code)) return '';
    const tool = this.tools().find(candidate => candidate.code === code);
    return tool ? `${tool.label}: ${LOCKED_REASON}` : '';
  });

  constructor() {
    // El aviso se anuncia una vez por las regiones vivas persistentes (H-09): la caja visible ya no es región viva.
    effect(() => {
      const message = this.notice();
      if (message) untracked(() => this.announcer.announce(message, 'polite'));
    });
  }

  /** `ref` de la tira de O1 de una herramienta (`RISK_METER` → `risk-meter`), o null si no tiene y queda el icono de Material. */
  protected iconoDe(code: string): string | null {
    return ICONOS_DE_BARRA.has(code) ? code.toLowerCase().replace(/_/g, '-') : null;
  }

  protected onSelect(tool: ClinicalToolState, event?: Event): void {
    if (!this.ownedSet().has(tool.code)) {
      this.lockedOrigin = (event?.currentTarget as HTMLElement | null) ?? null;
      this.lockedCode.set(tool.code);
      return;
    }
    this.lockedCode.set(null);
    this.select.emit(tool.code);
  }

  /**
   * Flechas, Inicio y Fin recorren las ranuras (también las bloqueadas) con vuelta al otro extremo. La pulsación se
   * consume: el mundo no la lee como un paso. Con modificadores no se toca (atajos del navegador).
   */
  protected onToolKeydown(event: KeyboardEvent, index: number): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const last = this.tools().length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = index >= last ? 0 : index + 1; break;
      case 'ArrowLeft': next = index <= 0 ? last : index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    event.preventDefault();
    this.activeIndex.set(next);
    this.host.nativeElement.querySelectorAll<HTMLElement>('.tool-card')[next]?.focus();
  }

  /** Cierra el aviso; con su botón el foco vuelve a la ranura que lo pidió (WCAG 2.4.3). */
  protected dismissNotice(): void {
    const origin = this.lockedOrigin;
    this.lockedCode.set(null);
    this.lockedOrigin = null;
    origin?.focus();
  }

  /**
   * Esc cierra SOLO el aviso y consume esa pulsación: el juego no la lee como pausa (cadena ayuda → bitácora → diálogo →
   * pausa). Sin aviso abierto no hace nada y la cadena sigue intacta. `document` recibe la tecla antes que el
   * `window:keydown` de la pantalla de juego. Con el dock fuera de alcance (otra capa abierta lo vuelve inerte u
   * oculto) el aviso no se ve ni se opera: el Esc le toca a esa capa y no se consume aquí.
   */
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    if (event.defaultPrevented || !this.notice()) return;
    if (this.host.nativeElement.closest('[inert], [aria-hidden="true"], [hidden]')) return;
    event.preventDefault();
    this.dismissNotice();
  }
}
