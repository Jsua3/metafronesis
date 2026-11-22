import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TemaSelectorComponent } from '../ui/tema/tema-selector.component';
import { UiGlassBar } from '../ui/glass-bar/ui-glass-bar';
import { MarcaComponent } from '../ui/marca/marca.component';
import { BottomTab, BottomTabsComponent } from './bottom-tabs.component';

export interface PublicAnchor { id: string; label: string; icon: string; }

/** Secciones de la portada a las que lleva la barra pública (mismos ids que landing.component.html). */
export const PUBLIC_ANCHORS: readonly PublicAnchor[] = [
  { id: 'simulador', label: 'Simulador', icon: 'play_circle' },
  { id: 'casos', label: 'Casos', icon: 'folder_open' },
  { id: 'como-funciona', label: 'Cómo funciona', icon: 'help_outline' },
  { id: 'roles', label: 'Roles', icon: 'groups' },
  { id: 'etica', label: 'Ética', icon: 'verified_user' },
];

/**
 * Cabecera pública (plan visual F3-4): la misma barra de vidrio del portal en la portada y en el acceso (antes, una
 * cabecera oscura propia con su menú móvil). En la portada lleva anclas a sus secciones y «Ingresar»; en el
 * acceso, el regreso a la portada. Por debajo de 64rem las anclas bajan a las pestañas inferiores (F3-5).
 */
@Component({
  selector: 'app-public-bar',
  imports: [RouterLink, BottomTabsComponent, MarcaComponent, UiGlassBar, TemaSelectorComponent],
  // DESVÍO de la receta pedido por el usuario (2026-11-20): el logo NO cede al isotipo al hacer scroll; la marca completa
  // se queda siempre (más visible como botón de regreso al inicio).
  styles: `
    .barra-marca { --marca-alto: 1.75rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Receta de /barra-de-vidrio-modular: arriba una píldora (inicial); al bajar se quiebra en tres cápsulas (scroll); con
  // el cursor en la franja vuelve lo plegado (atención). El logo se queda completo en todos los estados. Roles y Ética son los
  // secundarios que se pliegan.
  // Rediseño del módulo de cuenta (pedido del usuario, 2026-11-20): en la portada el módulo ENTERO es «Ingresar» (una
  // cápsula violeta que es el enlace, sin ficha dentro); al acercar el cursor o llegar con Tab se amplía hacia la
  // izquierda y dice «Ingresar aquí». El texto completo está siempre en el DOM (lo de más solo se recorta a ancho 0), así
  // que el nombre accesible es estable y contiene lo visible (WCAG 2.5.3). El tema sale del módulo violeta: en la portada
  // va al final del módulo principal, tras un filete; en el acceso (sin navegación) se queda en la cuenta, junto a
  // «Volver al inicio», que no es violeta. Estilos: sección 10 de _glass-bar.scss, todo acotado a .barra-publica.
  template: `
    <header ui-glass-bar class="barra-publica" label="Navegación pública" [navSkip]="anchors().length > 0">
      <a class="modulo modulo-logo pulsable ds-motion" routerLink="/" aria-label="Metafrónesis: ir al inicio">
        <app-marca class="barra-marca" />
      </a>
      <div class="modulo modulo-principal ds-motion" [class.con-tema]="mode() === 'portada'">
        @for (anchor of anchors(); track anchor.id) {
          <a class="nav-enlace ds-motion" [class.control-plegable]="secundario(anchor)" [href]="'#' + anchor.id">{{ anchor.label }}</a>
        }
        @if (anchors().length) {
          <span class="indicador-mas ds-motion" aria-hidden="true">···</span>
        }
        @if (mode() === 'portada') {
          <span class="filete-tema" aria-hidden="true"></span>
          <app-tema-selector class="tema" />
        }
      </div>
      @if (mode() === 'portada') {
        <a class="modulo modulo-cuenta cta-modulo ds-motion" routerLink="/login">
          <span class="cta-modulo__alcance" aria-hidden="true"></span>
          <span class="cta-modulo__rotulo">Ingresar</span>
          <span class="cta-modulo__mas ds-motion"><span class="cta-modulo__mas-dentro">&nbsp;aquí<svg class="cta-modulo__flecha ds-motion" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h9.5M8.5 4l4 4-4 4" /></svg></span></span>
        </a>
      } @else {
        <div class="modulo modulo-cuenta ds-motion">
          <app-tema-selector class="tema" />
          <a class="nav-enlace ds-motion" routerLink="/">Volver al inicio</a>
        </div>
      }
      @if (tabs().length) {
        <nav app-bottom-tabs label="Navegación pública" [tabs]="tabs()"></nav>
      }
    </header>
  `,
})
export class PublicBarComponent {
  readonly anchors = input<readonly PublicAnchor[]>([]);
  readonly mode = input<'portada' | 'acceso'>('portada');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let vivo = true;
    inject(DestroyRef).onDestroy(() => { vivo = false; });
    // Cuánto crece el módulo «Ingresar» al ampliarse: el ancho natural de « aquí →» con la fuente real, escrito por CSSOM
    // en --cta-crece (el CSS anima con él el ancho de lo que aparece y, en sentido contrario, el margen del módulo, para
    // que crezca hacia la izquierda sin mover a los vecinos). Sin medida vale el respaldo en em del CSS. Solo en un
    // navegador de verdad: en jsdom (sin matchMedia ni requestAnimationFrame) la portada no lleva estilos en línea.
    afterNextRender(() => {
      if (typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return;
      const medir = () => {
        const modulo = host.querySelector<HTMLElement>('a.cta-modulo');
        const ancho = modulo?.querySelector<HTMLElement>('.cta-modulo__mas-dentro')?.offsetWidth ?? 0;
        if (modulo && ancho) modulo.style.setProperty('--cta-crece', `${ancho}px`);
      };
      medir();
      void document.fonts?.ready.then(() => { if (vivo) medir(); });
    });
  }

  protected readonly tabs = computed<BottomTab[]>(() =>
    this.anchors().map(({ id, label, icon }) => ({ id, label, icon, href: `#${id}` })));

  /** Secundarios que se pliegan en «scroll» (D3 de la receta): los dos últimos destinos de la portada. */
  protected secundario(anchor: PublicAnchor): boolean {
    return anchor.id === 'roles' || anchor.id === 'etica';
  }

}
