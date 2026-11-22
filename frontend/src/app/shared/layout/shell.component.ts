import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { AuthService } from '../../core/auth/auth.service';
import { DoodlesComponent } from '../ui/doodles/doodles.component';
import { TemaService } from '../../core/tema/tema.service';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';
import { roleLabel } from '../ui/labels';
import { MarcaComponent } from '../ui/marca/marca.component';
import { UiMenu, UiMenuItem } from '../ui/menu/ui-menu';
import { UiRouteProgress } from '../ui/route-progress/ui-route-progress';
import { TemaSelectorComponent } from '../ui/tema/tema-selector.component';
import { BottomTab, BottomTabsComponent } from './bottom-tabs.component';
import { NavBadgesService, textoInsignia, textoInsigniaAccesible } from './nav-badges.service';
import { NavItem, navItemsFor } from './nav-items';
import { readRouteChrome } from './route-chrome';

/** Adónde lleva «Cambiar contraseña» del menú de cuenta (DP-22: cambio voluntario dentro del portal). */
export const RUTA_CAMBIAR_CONTRASENA = '/portal/cuenta/contrasena';

/**
 * Shell del portal (plan visual F3-3): la barra de vidrio modular arriba (sin barra lateral, VD-1) y la página
 * desplazándose en `window`. Los destinos salen de NAV_ITEMS (la misma fuente que los guards) y se pliegan según el
 * rol (D3). Por debajo de 64rem la navegación principal baja a pestañas fijas (D11, F3-5): arriba quedan marca y
 * cuenta, y los destinos plegables van a la hoja «Más». En el juego —rutas con `data: { chrome: 'hidden' }`— no hay barra y el contenido ocupa la ventana.
 * En el editor de casos —`data: { chrome: 'propio' }`— tampoco hay barra del portal porque la pantalla trae la suya (una sola barra
 * en pantalla); la página se desplaza en `window` y el `<main>` del shell no es un segundo hito de contenido.
 *
 * El `<body>` no recibe clases por ruta (REGLA-010, F6-1): el cromo se oculta por dato de ruta y lo demás vive en
 * `.game-container` y en los componentes del juego.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, BottomTabsComponent, DoodlesComponent, MarcaComponent, TemaSelectorComponent,
    UiGlassBar, UiMenu, UiRouteProgress,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // DP-02: la piel del portal va en ESTE contenedor (`app-shell`), nunca en body ni en :root (REGLA-010). `.portal` trae
  // los materiales, el fondo y la tipografía (_portal.scss, B0).
  host: { class: 'portal', '[attr.data-skin]': 'pielDelShell()' },
  template: `
    @if (conBarra()) {
      <header ui-glass-bar class="barra-portal" label="Navegación principal" navSkip>
        <!-- DP-06: la marca completa de Metafrónesis (la misma de la barra pública); «SIEP» vive en títulos y textos. -->
        <a class="modulo modulo-logo pulsable ds-motion" routerLink="/portal/dashboard" aria-label="Metafrónesis · SIEP: ir al inicio">
          <app-marca class="barra-marca" />
        </a>
        <div class="modulo modulo-principal ds-motion">
          @for (item of navItems(); track item.id) {
            <a class="nav-enlace ds-motion" [class.control-plegable]="folds(item)" [routerLink]="item.route"
              routerLinkActive="nav-enlace--activo" ariaCurrentWhenActive="page">{{ item.label }}@if (cuenta(item.id); as n) {<span
                class="nav-enlace__cuenta" aria-hidden="true">{{ insignia(n) }}</span><span class="ds-sr-only">{{ insigniaAccesible(n) }}</span>}</a>
          }
          <span class="indicador-mas ds-motion" aria-hidden="true">···</span>
        </div>
        <div class="modulo modulo-cuenta ds-motion">
          <!-- La cápsula Claro · Oscuro · Automático que se abre al pasar el cursor (pedido del usuario): cambia la piel
               de todo el portal. En el teléfono queda en la banda de arriba, entre la marca y la cuenta. -->
          <app-tema-selector class="tema" />
          <span class="cuenta-chip">
            <span class="cuenta-chip__nombre">{{ userName() }}</span>
            <span class="cuenta-chip__rol">{{ userRole() }}</span>
          </span>
          <ui-menu label="Cuenta" icon="account_circle" iconOnly [items]="accountMenu()" (itemSelected)="onAccount($event)" />
        </div>
        <nav app-bottom-tabs [tabs]="tabs()" [more]="moreTabs()"></nav>
        <ui-route-progress />
      </header>
    }

    <!-- Los doodles de la portada en el blanco que deja cada pantalla (a los lados y debajo del contenido), nunca detrás
         de él; ni en el juego ni en el editor, que llenan la vista. Decorativo: aria-hidden. -->
    @if (!inGame() && !propio()) {
      <app-doodles modo="margenes" columna="main.portal-main" intensidad="suave" [interactivo]="false" />
    }

    <!-- Destino de «Saltar al contenido principal». En el juego lo es su contenedor (simulation-play): un solo id. -->
    <main class="portal-main" [class.portal-main--juego]="inGame()" [class.portal-main--propio]="propio()"
      [attr.role]="propio() ? 'none' : null" [attr.id]="conBarra() ? 'main-content' : null" [attr.tabindex]="conBarra() ? -1 : null">
      <router-outlet />
    </main>
  `,
  styles: [`
    /* La barra es fija: el contenido arranca bajo ella. --l-alto-barra (_materiales.scss) es la píldora más su caída
       de 6 px en escritorio y, en móvil, la banda de arriba (_portal.scss la redefine). El canal lateral es el de la
       portada: 16 px en el teléfono. */
    .portal-main {
      display: block;
      padding: var(--l-alto-barra) var(--l-canal) 44px;
    }
    .portal-main--juego {
      height: 100vh;
      padding: 0;
      overflow: hidden;
    }
    /* El editor de casos pone su propia barra y su propio relleno: el shell solo le deja la página. */
    .portal-main--propio { padding: 0; }
    /* Móvil (F3-5): abajo están las pestañas fijas; el contenido reserva su alto y la zona segura. */
    @media (max-width: 63.999rem) {
      .portal-main:not(.portal-main--juego, .portal-main--propio) {
        padding-bottom: calc(var(--asb-alto-modulo-inferior) + env(safe-area-inset-bottom, 0px) + 1.5rem);
      }
    }
  `],
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tema = inject(TemaService);
  private readonly insignias = inject(NavBadgesService);

  private readonly chrome = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => readRouteChrome(this.router))),
    { initialValue: readRouteChrome(this.router) },
  );

  readonly inGame = computed(() => this.chrome() === 'hidden');
  /** La pantalla trae su propia barra (el editor de casos): el shell no pone la suya ni su relleno. */
  readonly propio = computed(() => this.chrome() === 'propio');
  readonly conBarra = computed(() => this.chrome() === 'full');
  /**
   * Piel del portal (DP-02): la que eligió la persona en la cápsula (claro = portal, oscuro = game). En el juego manda
   * `.game-container[data-skin="game"]` por dentro. El editor de casos (chrome «propio») también sigue el tema (EDITOR.md
   * §4.7, E0): pasar del portal oscuro a un editor claro y de ahí al juego oscuro eran dos saltos de luz.
   */
  readonly pielDelShell = computed<'game' | 'portal'>(() => this.tema.piel());
  readonly navItems = computed(() => navItemsFor(this.auth.currentUser()?.role));
  /** Móvil (D11): lo que no se pliega en escritorio es pestaña; lo que se pliega va a «Más». */
  protected readonly tabs = computed(() => this.navItems().filter(item => !this.folds(item)).map(item => this.toTab(item)));
  protected readonly moreTabs = computed(() => this.navItems().filter(item => this.folds(item)).map(item => this.toTab(item)));
  readonly userName = computed(() => {
    const user = this.auth.currentUser();
    const name = `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim();
    return name || 'Cuenta institucional';
  });
  readonly userRole = computed(() => roleLabel(this.auth.currentUser()?.role));
  /**
   * Menú de cuenta (DP-22). Arriba, quién soy («Nombre · Rol») como fila no interactiva: en el teléfono la ficha no
   * cabe y el rol solo se leía ahí. `ui-menu` no tiene encabezados ni separadores: la fila va deshabilitada (se anuncia
   * como tal y no hace nada) y «Cerrar sesión» se distingue por su tono (D-22). Sin «Mi perfil»: no hay pantalla de
   * perfil y un enlace vacío miente.
   */
  protected readonly accountMenu = computed<UiMenuItem[]>(() => [
    { value: 'identidad', label: `${this.userName()} · ${this.userRole()}`, icon: 'badge', disabled: true },
    { value: 'contrasena', label: 'Cambiar contraseña', icon: 'key' },
    { value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' },
  ]);
  protected readonly insignia = textoInsignia;
  protected readonly insigniaAccesible = textoInsigniaAccesible;

  /** Pendientes del destino (0 = sin insignia). */
  protected cuenta(id: string): number {
    return this.insignias.cuentas()[id] ?? 0;
  }

  private toTab({ id, label, etiquetaCorta, icon, route }: NavItem): BottomTab {
    const cuenta = this.cuenta(id);
    return { id, label, icon, route, ...(etiquetaCorta ? { etiquetaCorta } : {}), ...(cuenta ? { cuenta } : {}) };
  }

  /** El destino es secundario para el rol actual: se pliega al desplazarse (D3). */
  folds(item: NavItem): boolean {
    const role = this.auth.currentUser()?.role;
    return !!role && item.fold.includes(role);
  }

  onAccount(value: string | undefined): void {
    if (value === 'salir') this.auth.logout();
    else if (value === 'contrasena') void this.router.navigateByUrl(RUTA_CAMBIAR_CONTRASENA);
  }
}
