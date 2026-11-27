import { APP_BRAND } from '../../core/config/brand.config';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { encabezadoPrincipal, enfocarPorPrograma } from '../../core/a11y/foco.util';
import { AuthService } from '../../core/auth/auth.service';
import { CuentasRecordadasDialogoComponent } from '../../core/auth/cuentas-recordadas-dialogo.component';
import { CuentasRecordadasService } from '../../core/auth/cuentas-recordadas.service';
import { UiDialog } from '../ui/dialog/ui-dialog';
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

/** Inicio: adónde lleva el logo de la barra. */
const RUTA_INICIO = '/portal/dashboard';

/** Sección del menú de cuenta con las cuentas recordadas en este navegador (SIEP-281). */
// BORRADOR: texto pendiente de Psicología
const GRUPO_CUENTAS = 'Cambiar de cuenta';
const PREFIJO_CUENTA = 'cuenta:';

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
        <a class="modulo modulo-logo pulsable ds-motion" routerLink="/portal/dashboard" [attr.aria-label]="brand.shortName + ': ir al inicio'" (click)="alLogo()">
          <app-marca class="barra-marca" />
        </a>
        <!-- Cada módulo es un grupo con nombre (UA-E18): sin nodos con nombre entre el logo y los enlaces, un lector de
             pantalla los lee como hijos del logo, como si el logo fuera un menú desplegable. -->
        <div class="modulo modulo-principal ds-motion" role="group" aria-label="Secciones del portal">
          @for (item of navItems(); track item.id) {
            <!-- Descripción del destino (solo docentes): un bocadillo hermano del enlace, anclado a él (los plegables
                 recortan lo que llevan dentro) y descrito con aria-describedby, sin «title» (el nativo salía encima).
                 Escape lo cierra sin mover el puntero (WCAG 1.4.13). -->
            <a class="nav-enlace ds-motion" [class.control-plegable]="folds(item)" [routerLink]="item.route"
              [style.--ancla-nav]="ayuda(item) ? anclaAyuda(item) : null" [attr.aria-describedby]="ayuda(item) ? idAyuda(item) : null"
              (keydown.escape)="ocultarAyuda($event)" (mouseleave)="mostrarAyuda($event)" (blur)="mostrarAyuda($event)"
              routerLinkActive="nav-enlace--activo" ariaCurrentWhenActive="page">{{ item.label }}@if (cuenta(item.id); as n) {<span
                class="nav-enlace__cuenta" aria-hidden="true">{{ insignia(n) }}</span><span class="ds-sr-only">{{ insigniaAccesible(n) }}</span>}</a>
            @if (ayuda(item); as texto) {
              <span class="nav-ayuda" [id]="idAyuda(item)" [style.--ancla-nav]="anclaAyuda(item)" aria-hidden="true">{{ texto }}</span>
            }
          }
          <span class="indicador-mas ds-motion" aria-hidden="true">···</span>
        </div>
        <div class="modulo modulo-cuenta ds-motion" role="group" aria-label="Tema y cuenta">
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
    /* BORRADOR: textos pendientes de Psicología. Descripción de cada destino al posarse o enfocarlo. Es un elemento
       propio y no el ::after del enlace, que ya es el subrayado del destino actual (_glass-bar.scss §8). Va centrada
       bajo el enlace, con flecha, y aparece tras una pausa al posarse (al enfocar con teclado, enseguida). */
    .nav-enlace { anchor-name: var(--ancla-nav); }
    .nav-ayuda {
      position: absolute;
      /* Sin anchor(): centrada bajo el módulo. Con él: centrada bajo su enlace. */
      inset-block-start: calc(100% + var(--ds-space-2));
      inset-inline-start: 50%;
      inset-block-start: calc(anchor(bottom) + var(--ds-space-2));
      inset-inline-start: anchor(center);
      position-anchor: var(--ancla-nav);
      z-index: var(--ds-z-desplegable);
      inline-size: max-content;
      max-inline-size: min(17rem, calc(100vw - 2rem));
      padding: var(--ds-space-2) var(--ds-space-3);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
      background: var(--ds-surface-1);
      box-shadow: var(--ds-shadow-e2);
      color: var(--ds-text-1);
      font-size: var(--ds-type-body-s-size);
      font-weight: 400;
      line-height: var(--ds-type-body-s-line);
      letter-spacing: normal;
      text-align: start;
      white-space: normal;
      opacity: 0;
      visibility: hidden;
      translate: -50% calc(-1 * var(--ds-space-1));
      transition: opacity var(--ds-dur-fast) var(--ds-ease-out), translate var(--ds-dur-fast) var(--ds-ease-out),
        visibility 0s linear var(--ds-dur-fast);
    }
    /* La flecha hacia el enlace y, bajo ella, un puente invisible para llevar el puntero al bocadillo sin que se cierre. */
    .nav-ayuda::before {
      content: '';
      position: absolute;
      inset-block-end: 100%;
      inset-inline-start: 50%;
      inline-size: var(--ds-space-2);
      block-size: var(--ds-space-2);
      translate: -50% 50%;
      rotate: 45deg;
      background: var(--ds-surface-1);
      border-block-start: 1px solid var(--ds-border);
      border-inline-start: 1px solid var(--ds-border);
    }
    .nav-ayuda::after {
      content: '';
      position: absolute;
      inset-inline: 0;
      inset-block-end: 100%;
      block-size: calc(var(--ds-space-2) + 1px);
    }
    .nav-enlace:focus-visible + .nav-ayuda {
      opacity: 1;
      visibility: visible;
      translate: -50% 0;
      transition-delay: 0s;
    }
    @media (hover: hover) and (pointer: fine) {
      .nav-enlace:hover + .nav-ayuda, .nav-ayuda:hover {
        opacity: 1;
        visibility: visible;
        translate: -50% 0;
        transition-delay: var(--ds-dur-slow);
      }
    }
    .nav-enlace.nav-enlace--sin-ayuda + .nav-ayuda {
      opacity: 0;
      visibility: hidden;
      transition-delay: 0s;
    }
    @media (forced-colors: active) {
      .nav-ayuda, .nav-ayuda::before { border-color: CanvasText; }
    }
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
  readonly brand = APP_BRAND;
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cuentasRecordadas = inject(CuentasRecordadasService);
  private readonly dialog = inject(UiDialog);
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
  protected readonly accountMenu = computed<UiMenuItem[]>(() => {
    const actual = this.auth.currentUser();
    const guardadas = this.cuentasRecordadas.cuentas();
    const grupo = GRUPO_CUENTAS;
    return [
      { value: 'identidad', label: `${this.userName()} · ${this.userRole()}`, icon: 'badge', disabled: true },
      // SIEP-281: las demás cuentas de ESTE navegador (la actual ya es la identidad de arriba).
      ...guardadas.filter(c => c.id !== actual?.id).map(c => ({
        value: `${PREFIJO_CUENTA}${c.id}`, label: `${c.nombre} ${c.apellido}`.trim() || c.email, detalle: `${roleLabel(c.rol)} · ${c.email}`,
        icon: 'account_circle', grupo,
      })),
      // BORRADOR: texto pendiente de Psicología
      { value: 'agregar', label: 'Agregar cuenta', icon: 'person_add', grupo },
      // BORRADOR: texto pendiente de Psicología
      ...(guardadas.length ? [{ value: 'quitar', label: 'Quitar cuentas de esta lista…', icon: 'person_remove', grupo }] : []),
      { value: 'contrasena', label: 'Cambiar contraseña', icon: 'key' },
      { value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' as const },
      // BORRADOR: texto pendiente de Psicología
      ...(guardadas.length ? [{ value: 'olvidar', label: 'Cerrar sesión y olvidar las cuentas', icon: 'logout', tone: 'danger' as const }] : []),
    ];
  });
  protected readonly insignia = textoInsignia;
  protected readonly insigniaAccesible = textoInsigniaAccesible;

  /** Pendientes del destino (0 = sin insignia). */
  protected cuenta(id: string): number {
    return this.insignias.cuentas()[id] ?? 0;
  }

  /** Descripción del destino en la barra: solo la ve el docente (BORRADOR: textos pendientes de Psicología). */
  protected ayuda(item: NavItem): string | null {
    return this.auth.currentUser()?.role === 'PROFESOR' ? item.descripcion ?? null : null;
  }

  protected idAyuda(item: NavItem): string {
    return `ayuda-nav-${item.id}`;
  }

  protected anclaAyuda(item: NavItem): string {
    return `--ancla-nav-${item.id}`;
  }

  /** Escape cierra la descripción sin mover el puntero ni el foco; vuelve a salir al dejar el enlace (WCAG 1.4.13). */
  protected ocultarAyuda(evento: Event): void {
    (evento.currentTarget as HTMLElement).classList.add('nav-enlace--sin-ayuda');
  }

  protected mostrarAyuda(evento: Event): void {
    (evento.currentTarget as HTMLElement).classList.remove('nav-enlace--sin-ayuda');
  }

  private toTab({ id, label, etiquetaCorta, icon, route, descripcion }: NavItem): BottomTab {
    const cuenta = this.cuenta(id);
    return { id, label, icon, route, ...(this.auth.currentUser()?.role === 'PROFESOR' && descripcion ? { descripcion } : {}), ...(etiquetaCorta ? { etiquetaCorta } : {}), ...(cuenta ? { cuenta } : {}) };
  }

  /** El destino es secundario para el rol actual: se pliega al desplazarse (D3). */
  folds(item: NavItem): boolean {
    const role = this.auth.currentUser()?.role;
    return !!role && item.fold.includes(role);
  }

  /**
   * El logo es un enlace a Inicio. Estando ya en Inicio, el enlace no navega y no pasaba nada (quien usa teclado o lector
   * de pantalla no recibía respuesta alguna, UA-E18): el foco pasa al encabezado de la pantalla, como al llegar a ella.
   * En cualquier otra pantalla solo navega; el foco lo lleva el servicio de rutas.
   */
  protected alLogo(): void {
    if (this.router.url.split(/[?#]/)[0] !== RUTA_INICIO) return;
    enfocarPorPrograma(encabezadoPrincipal(document));
  }

  onAccount(value: string | undefined): void {
    const salir = () => this.auth.logout();
    if (value === 'salir') this.auth.logout();
    else if (value === 'contrasena') void this.router.navigateByUrl(RUTA_CAMBIAR_CONTRASENA);
    else if (value === 'agregar') this.cuentasRecordadas.agregarCuenta(this.auth.currentUser(), salir);
    else if (value === 'olvidar') this.cuentasRecordadas.cerrarYOlvidar(salir);
    else if (value === 'quitar') this.dialog.open(CuentasRecordadasDialogoComponent, { size: 'md' });
    else if (value?.startsWith(PREFIJO_CUENTA)) {
      const id = Number(value.slice(PREFIJO_CUENTA.length));
      const cuenta = this.cuentasRecordadas.cuentas().find(c => c.id === id);
      if (cuenta) this.cuentasRecordadas.cambiarA(cuenta, salir);
    }
  }
}
