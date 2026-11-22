import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { UiDialog, UiDialogFrame } from '../ui/dialog/ui-dialog';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';
import { textoInsignia, textoInsigniaAccesible } from './nav-badges.service';

/** Un destino de la barra inferior: ruta de la app (`route`) o ancla de la página (`href`). */
export interface BottomTab {
  id: string;
  label: string;
  icon: string;
  route?: string;
  href?: string;
  /** Rótulo de la pestaña si `label` no cabe a 390 px (DISENO §3.3: «Mi personaje» → «Personaje»). */
  etiquetaCorta?: string;
  /** Pendientes del destino (NavBadgesService); 0 o ausente: sin insignia. */
  cuenta?: number;
}

/** Como mucho cinco pestañas (references/movil.md §3): con más destinos, la quinta es «Más». */
const MAX_TABS = 5;

const pathOf = (url: string) => url.split(/[?#;]/, 1)[0];

/**
 * Hoja «Más» del móvil (plan visual F3-5): los destinos que no caben en la barra inferior, en una hoja que sube
 * (UiDialog.sheet: trampa de foco, Esc y retorno del foco a «Más»). Elegir un destino navega y cierra la hoja.
 */
@Component({
  selector: 'app-more-sheet',
  imports: [MatIconModule, RouterLink, RouterLinkActive, UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Más destinos">
      <ul class="hoja-mas">
        @for (tab of tabs; track tab.id) {
          <li>
            @if (tab.route) {
              <a class="hoja-mas__enlace" [routerLink]="tab.route" routerLinkActive="hoja-mas__enlace--activa"
                ariaCurrentWhenActive="page" (click)="ref.close()">
                <mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon><span>{{ tab.label }}</span>
                @if (tab.cuenta) {
                  <span class="hoja-mas__cuenta" aria-hidden="true">{{ insignia(tab.cuenta) }}</span>
                  <span class="ds-sr-only">{{ insigniaAccesible(tab.cuenta) }}</span>
                }
                <span class="hoja-mas__ir" aria-hidden="true"></span>
              </a>
            } @else {
              <a class="hoja-mas__enlace" [href]="tab.href" (click)="ref.close()">
                <mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon><span>{{ tab.label }}</span>
                <span class="hoja-mas__ir" aria-hidden="true"></span>
              </a>
            }
          </li>
        }
      </ul>
    </ui-dialog-frame>
  `,
  styles: [`
    /* Lista agrupada de iOS (ajustes): una sola tarjeta hundida con filas separadas por un filo que empieza después
       del icono, y un chevrón al final que dice «lleva a otra página». Antes eran filas sueltas sobre el vidrio, sin
       estado al pasar el cursor: no se distinguían de un texto. */
    .hoja-mas {
      display: grid;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border-radius: var(--l-radio-control, var(--ds-radius-md));
      background: var(--l-relleno, var(--ds-surface-2));
      box-shadow: inset 0 0 0 1px var(--l-filo, var(--ds-border));
      list-style: none;
    }
    .hoja-mas li + li .hoja-mas__enlace::before {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-inline: calc(var(--ds-space-3) * 2 + 1.5rem) 0;
      border-block-start: 1px solid var(--l-filo, var(--ds-border));
    }
    .hoja-mas__enlace {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--ds-space-3);
      min-block-size: calc(var(--ds-target-min) + var(--ds-space-2));
      padding-inline: var(--ds-space-3);
      color: var(--ds-text-1);
      font-size: var(--ds-type-body-size);
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
      transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
    }
    .hoja-mas__enlace > mat-icon:first-child { flex: none; color: var(--ds-text-2); }
    .hoja-mas__enlace:focus-visible { outline-offset: -3px; }
    @media (hover: hover) and (pointer: fine) {
      .hoja-mas__enlace:hover { background-color: var(--l-fila-encima, var(--ds-surface-2)); }
    }
    .hoja-mas__enlace:active { background-color: var(--l-fila-elegida, var(--ds-primary-subtle)); }
    /* La insignia y el chevrón al final de la fila, como en los ajustes de iOS. */
    .hoja-mas__cuenta {
      margin-inline-start: auto;
      min-inline-size: 1.5rem;
      padding: 0.125rem 0.5rem;
      border-radius: var(--ds-radius-pill);
      background-color: var(--ds-primary);
      color: var(--ds-on-primary);
      font-size: var(--ds-type-caption-size);
      font-weight: 600;
      line-height: 1.4;
      text-align: center;
    }
    /* Chevrón dibujado (la fuente de iconos va recortada y no trae «chevron_right»): dos filos de 2 px girados. */
    .hoja-mas__ir {
      flex: none;
      inline-size: 0.5rem;
      block-size: 0.5rem;
      margin-inline: auto var(--ds-space-1);
      border-block-start: 2px solid var(--ds-text-3, var(--ds-text-2));
      border-inline-end: 2px solid var(--ds-text-3, var(--ds-text-2));
      rotate: 45deg;
    }
    :host-context([dir='rtl']) .hoja-mas__ir { rotate: -135deg; }
    .hoja-mas__cuenta + .hoja-mas__ir, .hoja-mas__cuenta + .ds-sr-only + .hoja-mas__ir { margin-inline-start: 0; }
    .hoja-mas__enlace[aria-current='page'] { color: var(--ds-primary); font-weight: 600; }
    .hoja-mas__enlace[aria-current='page'] > mat-icon:first-child { color: var(--ds-primary); }
    @media (forced-colors: active) {
      .hoja-mas { border: 1px solid CanvasText; }
      .hoja-mas__enlace[aria-current='page'] { text-decoration-line: underline; text-decoration-thickness: 2px; }
      .hoja-mas__cuenta { border: 1px solid CanvasText; }
    }
  `],
})
export class MoreSheetComponent {
  protected readonly ref = inject(DialogRef);
  protected readonly tabs = inject<BottomTab[]>(DIALOG_DATA);
  protected readonly insignia = textoInsignia;
  protected readonly insigniaAccesible = textoInsigniaAccesible;
}

/**
 * Barra inferior de pestañas del móvil (plan visual F3-5, decisión D11; /barra-de-vidrio-modular, references/movil.md
 * §3.3). Es la NAVEGACIÓN PRINCIPAL por debajo de 64rem; en escritorio no se muestra. Se usa como hijo directo del
 * `<header ui-glass-bar>` (los `fixed` de la barra cuelgan del header, nunca de la píldora): el anfitrión ES el
 * `<nav>`. Estilos globales en src/styles/components/_glass-bar.scss.
 */
@Component({
  selector: 'nav[app-bottom-tabs]',
  imports: [MatIconModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // En escritorio no existe para nadie (hidden), no solo para la vista: así nunca hay dos «Navegación principal».
  host: { class: 'modulo-inferior ds-motion', '[attr.aria-label]': 'label()', '[attr.hidden]': "bar?.desktop() ? '' : null" },
  template: `
    <div class="pestanas ds-motion">
      @for (tab of visible(); track tab.id) {
        @if (tab.route) {
          <a class="pestana ds-motion" [routerLink]="tab.route" routerLinkActive="pestana--activa" ariaCurrentWhenActive="page">
            <span class="pestana__icono"><mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon>@if (tab.cuenta) {<span class="pestana__cuenta" aria-hidden="true">{{ insignia(tab.cuenta) }}</span>}</span>
            <span class="pestana__rotulo ds-motion"><span>{{ tab.etiquetaCorta ?? tab.label }}</span></span>
            @if (tab.cuenta) {<span class="ds-sr-only">{{ insigniaAccesible(tab.cuenta) }}</span>}
          </a>
        } @else {
          <a class="pestana ds-motion" [href]="tab.href">
            <span class="pestana__icono"><mat-icon aria-hidden="true">{{ tab.icon }}</mat-icon>@if (tab.cuenta) {<span class="pestana__cuenta" aria-hidden="true">{{ insignia(tab.cuenta) }}</span>}</span>
            <span class="pestana__rotulo ds-motion"><span>{{ tab.etiquetaCorta ?? tab.label }}</span></span>
            @if (tab.cuenta) {<span class="ds-sr-only">{{ insigniaAccesible(tab.cuenta) }}</span>}
          </a>
        }
      }
      @if (overflow().length) {
        <!-- Si la página actual está en la hoja, «Más» lo dice: aria-current="true" (actual dentro del conjunto). -->
        <button class="pestana ds-motion" type="button" aria-haspopup="dialog" [attr.aria-current]="moreIsCurrent() ? 'true' : null"
          (click)="openMore()">
          <span class="pestana__icono"><mat-icon aria-hidden="true">menu</mat-icon>@if (morePending()) {<span class="pestana__cuenta pestana__cuenta--punto" aria-hidden="true"></span>}</span>
          <span class="pestana__rotulo ds-motion"><span>Más</span></span>
          @if (morePending()) {<span class="ds-sr-only"> (hay pendientes)</span>}
        </button>
      }
    </div>
  `,
})
export class BottomTabsComponent {
  readonly tabs = input<readonly BottomTab[]>([]);
  /** Destinos secundarios (los que se pliegan en escritorio): van a «Más». */
  readonly more = input<readonly BottomTab[]>([]);
  readonly label = input('Navegación principal');

  private readonly dialog = inject(UiDialog);
  private readonly router = inject(Router);
  protected readonly bar = inject(UiGlassBar, { optional: true });

  private readonly fits = computed(() => this.tabs().length + (this.more().length ? 1 : 0) <= MAX_TABS);
  protected readonly visible = computed(() => (this.fits() ? this.tabs() : this.tabs().slice(0, MAX_TABS - 1)));
  protected readonly overflow = computed(() => (this.fits() ? this.more() : [...this.tabs().slice(MAX_TABS - 1), ...this.more()]));

  /** Ruta actual sin consulta, fragmento ni matriz. */
  private readonly path = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => pathOf(this.router.url))),
    { initialValue: pathOf(this.router.url) },
  );

  /** La página actual es uno de los destinos de «Más» (o una ruta hija suya). */
  protected readonly moreIsCurrent = computed(() => {
    const path = this.path();
    return this.overflow().some(tab => !!tab.route && (path === tab.route || path.startsWith(`${tab.route}/`)));
  });

  /** Algún destino de «Más» tiene pendientes: «Más» lleva un punto (el número exacto está dentro de la hoja). */
  protected readonly morePending = computed(() => this.overflow().some(tab => (tab.cuenta ?? 0) > 0));
  protected readonly insignia = textoInsignia;
  protected readonly insigniaAccesible = textoInsigniaAccesible;

  protected openMore(): void {
    this.dialog.sheet(MoreSheetComponent, { side: 'bottom', data: [...this.overflow()] });
  }
}
