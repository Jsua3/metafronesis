import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, scan } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import type { CanLeave } from '../../core/navigation/can-leave.guard';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiGlassBar } from '../../shared/ui/glass-bar/ui-glass-bar';
import { roleLabel } from '../../shared/ui/labels';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { TemaSelectorComponent } from '../../shared/ui/tema/tema-selector.component';

import { AvisosGuardadoComponent } from './avisos-guardado.component';
import { RUTA_ENSAYO, alPulsarProbar } from './ensayo';
import { CasoStore } from './estado/caso.store';
import { BuscadorComponent } from './guia/buscador.component';
import { FocoGuiaComponent } from './guia/foco-guia.component';
import { GuiaService } from './guia/guia.service';
import { IaService } from './ia/ia.service';
import { PanelIaComponent } from './ia/panel-ia.component';
import { DeshacerBorrado } from './marco/deshacer-borrado';
import { HiloDelCasoComponent } from './marco/hilo-del-caso.component';
import { injectLlevar } from './marco/llevar';
import { PanelPendientesComponent } from './marco/panel-pendientes.component';
import { ProgresoDelCaso } from './marco/progreso.service';
import { RielDeEscenasComponent } from './marco/riel-de-escenas.component';
import { injectComandosDelCaso } from './marco/estudio/comandos-del-caso';
import { EstudioMarcoComponent } from './marco/estudio/estudio-marco.component';
import { EstudioService } from './marco/estudio/estudio.service';
import { ExploradorBibliotecaComponent } from './marco/estudio/explorador-biblioteca.component';
import { RUTA_CASOS, RutasAutoria } from './rutas';

const MENU_CUENTA: UiMenuItem[] = [{ value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' }];

/**
 * Marco del editor de casos (EDITOR.md §4): abre el caso que dice la dirección (`portal/casos/:caseVersionId/editor`) y lo
 * reparte en zonas de alto fijo bajo la barra de vidrio de la aplicación (`ui-glass-bar` con su `GlassBarMachine`):
 *
 * - La barra: la marca de Metafrónesis (DP-06), «‹ Casos», el nombre del caso y el hilo de cinco etapas en el módulo
 *   central; en el de la cuenta, el estado de guardado, «Probar», «Pendientes N», una sola «Ayuda» (Ctrl+K), el asistente
 *   (solo si está encendido), el tema y la cuenta. Nada se pliega al desplazarse (DG-6); lo que no cabe cede por ancho.
 * - El cuerpo (≥ 64rem): una rejilla que NO desplaza la página. El riel de escenas (solo en la etapa Historia) y el centro
 *   se desplazan cada uno por su cuenta; el asistente de IA flota sobre el borde final, como una hoja.
 * - Por debajo de 64rem (y con zoom al 200 %, WCAG 1.4.10): una sola columna con desplazamiento de página.
 *
 * El editor sigue el tema de la persona (claro u oscuro): vive dentro de `app-shell.portal[data-skin]` y su piel
 * (`styles/skins/_autoria.scss`) son alias de los tokens del portal. En `portal/casos/nuevo` (crear un caso) no hay caso
 * que abrir: el módulo central dice «‹ Casos» y «Editor de casos».
 */
@Component({
  selector: 'app-autoria-shell',
  imports: [
    RouterOutlet, RouterLink, PanelIaComponent, BuscadorComponent, FocoGuiaComponent, AvisosGuardadoComponent,
    UiGlassBar, UiMenu, TemaSelectorComponent, HiloDelCasoComponent, RielDeEscenasComponent,
    EstudioMarcoComponent, ExploradorBibliotecaComponent,
  ],
  providers: [EstudioService],
  host: { '(window:pagehide)': 'alCerrar()', '(window:beforeunload)': 'antesDeSalir($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="saltar" href="#main-content" (click)="saltar($event)">Saltar al contenido</a>
    <header ui-glass-bar label="Editor de casos" compactLabel="Editor de casos" [congelada]="ayudaAbierta()" #cabecera>
      <!-- En el editor la marca cede su sitio a «volver» (pedido del usuario, 2026-11-22). En el teléfono es un círculo «‹»
           dentro de la banda; en escritorio es una PIEZA DE VIDRIO APARTE de la barra (la de abajo, fuera de la píldora). -->
      <div class="modulo modulo-logo">
        <a class="volver volver--en-barra pulsable" [routerLink]="volver().ruta" data-accion="volver">
          <span class="volver__contenido">
            <svg class="volver__flecha" viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6" /></svg>
            <span class="volver__texto">{{ volver().texto }}</span>
          </span>
        </a>
      </div>
      <!-- El módulo central es el «dónde estoy» del editor: el caso y su hilo de etapas. Nada de él se pliega al desplazarse
           (DG-6); lo que no cabe cede por ancho, con su nombre completo para el lector. -->
      <div class="modulo modulo-principal ds-motion">
        @if (store.caso(); as caso) {
          <p class="caso-actual" [attr.title]="caso.titulo"><span class="solo-lector">Caso: </span>{{ caso.titulo }}</p>
          <app-hilo-del-caso />
        } @else {
          <span class="contexto-editor">Editor de casos</span>
        }
      </div>
      <div class="modulo modulo-cuenta ds-motion">
        <!-- Las herramientas del caso, juntas: en el teléfono bajan a su propia fila sin separarse. -->
        <div class="herramientas">
          @if (store.caso() && !store.soloLectura()) {
            <!-- La pasarela (pedido del usuario, 2026-11-22): todo lo que se puede agregar al caso, desde cualquier pantalla.
                 «Escena nueva» la crea después de la actual y abre su guion; lo demás lleva a su control con el foco puesto. -->
            <ui-menu class="menu-agregar" label="Agregar" icon="add" align="start" [items]="opcionesAgregar()" (itemSelected)="agregar($event)" />
          }
          @if (store.caso()) {
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <a class="boton-barra enlace-probar" [attr.href]="rutaEnsayo()" target="_blank" rel="noopener" data-accion="probar"
               aria-label="Probar el caso en el juego (con Ctrl o clic central se abre en otra pestaña)" (click)="probar($event)">Probar <span aria-hidden="true">↗</span></a>
            <button type="button" class="boton-barra boton-pendientes" data-accion="ver-pendientes" aria-haspopup="dialog"
                    [attr.title]="textoPendientes()" (click)="abrirPendientes($event)">
              <!-- El nombre es el texto para lectores («Pendientes: …», empieza por la palabra visible), no un aria-label:
                   Axe pegaba la palabra con la cifra de la insignia y lo daba por distinto. -->
              <span class="solo-lector">{{ textoPendientes() }}</span>
              <span aria-hidden="true">Pendientes</span>
              <span class="insignia" [class.insignia--cero]="!progreso.porCorregir().length" aria-hidden="true">{{ progreso.porCorregir().length }}</span>
            </button>
          }
          <div role="group" aria-label="Ayuda" class="barra-ayuda">
            <!-- «Buscar» y «Guía» se funden en una sola «Ayuda» (§4.1): abrían casi el mismo diálogo con las mismas acciones. Se
                 conservan las dos entradas de la guía (data-accion «buscar» y «guia») sobre este botón. -->
            <button type="button" class="boton-barra" data-accion="buscar guia" title="Busca una acción o pregúntale a la guía"
                    aria-haspopup="dialog" (click)="abrirBuscador('buscar', $event)">Ayuda</button>
            @if (store.caso() && iaDisponible()) {
              <button type="button" class="boton-barra" data-accion="pedir-a-la-ia aceptar-ia" title="Escribe o cambia el caso por ti; tú apruebas"
                      [attr.aria-expanded]="iaAbierta() && !store.soloLectura()" aria-controls="panel-ia" [disabled]="store.soloLectura()"
                      [attr.aria-describedby]="store.soloLectura() ? 'aviso-ia' : null" (click)="alternarIa()" #botonIa>
                Asistente<span class="solo-lector"> de IA</span>
              </button>
            }
          </div>
        </div>
        <app-tema-selector class="tema" />
        <span class="cuenta-chip">
          <span class="cuenta-chip__nombre">{{ nombreCuenta() }}</span>
          <span class="cuenta-chip__rol">{{ rolCuenta() }}</span>
        </span>
        <ui-menu label="Cuenta" icon="account_circle" iconOnly [items]="menuCuenta" (itemSelected)="alElegirCuenta($event)" />
        @if (store.soloLectura()) {
          <span id="aviso-ia" class="solo-lector">{{ textoAsistenteBloqueado() }}</span>
        }
      </div>
      <!-- «Volver» en escritorio: una pieza de vidrio separada de la masa de la barra, a su izquierda, con su propio vidrio
           (no cuelga de la píldora: nunca vidrio sobre vidrio). Al pasar el cursor o con el foco crece con el resorte de la
           barra y dice a dónde vuelve (Casos; o Caminos, el Plano o el guion según de dónde se vino); la masa le cede sitio. -->
      <a class="volver volver--pieza pulsable" [routerLink]="volver().ruta" data-accion="volver">
        <span class="volver__contenido">
          <svg class="volver__flecha" viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6" /></svg>
          <span class="volver__texto">{{ volver().texto }}</span>
        </span>
      </a>
    </header>

    @if (buscador(); as modo) {
      <app-buscador [modo]="modo" (cerrar)="cerrarBuscador()" />
    }
    <app-foco-guia />

    <!-- El espacio de trabajo (EDITOR-PRO.md §1): Explorador · lienzo · Inspector y barra de estado. La pantalla de la ruta
         va en el centro; lo que pone en el Inspector o en la barra de herramientas llega por las ranuras del estudio. -->
    <app-estudio-marco class="cuerpo" [exploradorPorDefecto]="esHistoria() ? exploradorHistoria : null">
      <main id="main-content" tabindex="-1" class="zona zona-centro">
        @if (store.caso()) { <app-avisos-guardado parte="avisos" /> }
        @if (abriendo()) {
          <p class="pagina" role="status">Abriendo tu caso…</p>
        } @else if (fallo(); as mensaje) {
          <div class="pagina">
            <div class="tarjeta" role="alert">
              <h1>No pudimos abrir el caso</h1>
              <p>{{ mensaje }}</p>
              <div class="acciones">
                <button type="button" class="boton boton-primario" (click)="reintentar()">Volver a intentarlo</button>
                <a class="boton" [routerLink]="rutas.a('/')">Volver a Casos</a>
              </div>
            </div>
          </div>
        } @else {
          @if (store.soloLectura()) {
            <p class="solo-lectura" role="note">{{ textoSoloLectura() }}</p>
          }
          <!-- En un caso que ya no es un borrador, los campos de las pantallas se bloquean (la prueba como estudiante no cambia nada y sigue viva). -->
          <fieldset class="marco-pantalla" [disabled]="bloqueado()">
            <router-outlet />
          </fieldset>
        }
      </main>
      <!-- Flota sobre el borde final del lienzo, como una hoja. Se oculta en vez de quitarse, para no perder la conversación ni la propuesta. -->
      <app-panel-ia id="panel-ia" class="columna-ia" [hidden]="!iaAbierta() || store.soloLectura()" (cerrar)="cerrarIa()" />

      <span estudioEstadoInicio class="est-dato estado-donde">{{ dondeEstoy() }}</span>
      <!-- El guardado informa, no se usa: va con «Pendientes» en la barra de estado (pedido del usuario, 2026-11-22). Cada
           @if lleva UNA raíz: con dos, Angular proyecta el bloque al hueco por defecto y no a la barra de estado. -->
      @if (store.caso()) {
        <app-avisos-guardado estudioEstadoInicio class="est-dato guardado-estado" parte="estado" />
      }
      @if (store.caso()) {
        <button estudioEstadoInicio type="button" class="est-dato-boton" [class.estado-pendientes]="progreso.porCorregir().length"
                aria-haspopup="dialog" (click)="abrirPendientes($event)">
          <span class="marca-estado" aria-hidden="true" [attr.data-estado]="progreso.porCorregir().length ? 'con-pendientes' : 'lista'"></span>
          {{ textoPendientes() }}
        </button>
      }
      <!-- La pasarela: el siguiente paso, a la vista en todas las pantallas (antes solo en el Explorador de Historia). -->
      @if (store.caso() && progreso.siguiente(); as paso) {
        <button estudioEstadoInicio type="button" class="est-dato-boton est-siguiente" (click)="llevar(paso)">
          <span class="est-siguiente__rotulo">Siguiente:</span><span class="est-siguiente__texto">{{ paso.texto }}</span><span aria-hidden="true">→</span>
        </button>
      }
    </app-estudio-marco>

    <!-- El Explorador de la etapa Historia: las escenas en jerarquía y la biblioteca del caso, en dos pestañas. -->
    <ng-template #exploradorHistoria>
      <div class="explorador">
        <div class="explorador__pestanas" role="tablist" aria-label="Qué ver en el explorador">
          <button type="button" role="tab" id="exp-tab-escenas" aria-controls="exp-escenas" [attr.aria-selected]="pestana() === 'escenas'"
                  [attr.tabindex]="pestana() === 'escenas' ? 0 : -1" (click)="pestana.set('escenas')" (keydown)="teclaPestana($event)">Escenas</button>
          <button type="button" role="tab" id="exp-tab-biblioteca" aria-controls="exp-biblioteca" [attr.aria-selected]="pestana() === 'biblioteca'"
                  [attr.tabindex]="pestana() === 'biblioteca' ? 0 : -1" (click)="pestana.set('biblioteca')" (keydown)="teclaPestana($event)">Biblioteca</button>
          <span class="explorador__indicador" aria-hidden="true" [attr.data-pestana]="pestana()"></span>
        </div>
        <app-riel-de-escenas id="exp-escenas" role="tabpanel" aria-labelledby="exp-tab-escenas" class="zona zona-riel" [hidden]="pestana() !== 'escenas'" />
        @if (pestana() === 'biblioteca' && store.caso(); as caso) {
          <app-explorador-biblioteca id="exp-biblioteca" role="tabpanel" aria-labelledby="exp-tab-biblioteca" class="zona" [caso]="caso" />
        }
      </div>
    </ng-template>

    <!-- «Deshacer» de los borrados del guion (EDITOR.md §4.6). El contenedor está siempre para que el lector anuncie el aviso. -->
    <div class="deshacer-zona" role="status">
      @if (deshacer.aviso(); as aviso) {
        <div class="deshacer">
          <span class="deshacer__texto">{{ aviso.texto }}</span>
          @if (aviso.deshacible) {
            <button type="button" class="deshacer__accion" (click)="deshacer.deshacer()">Deshacer</button>
          }
          <button type="button" class="deshacer__cerrar" aria-label="Cerrar el aviso" (click)="deshacer.descartar()"><span aria-hidden="true">×</span></button>
        </div>
      }
    </div>
  `,
  styles: `
    /*
     * Orden de cesión por ANCHO (EDITOR.md §4.1; nada se pliega al desplazarse): el chip de la cuenta (< 120rem, en
     * _autoria.scss); los nombres de las etapas quedan en su número con el estado (< 120rem, en el hilo); el atajo
     * Ctrl+K (< 120rem); la palabra del logo (< 100rem: queda el isotipo con su «‹», que sigue volviendo a Casos); el nombre del caso (< 80rem: queda en el
     * título de la pestaña). Por debajo de 64rem la barra es una banda de varias filas y el hilo, un menú.
     */
    /* El nombre del caso y el hilo se separan con un filo: son «qué caso» y «en qué parte», dos cosas distintas. */
    .caso-actual {
      margin: 0; padding: 0 0.625rem 0 0.25rem; max-inline-size: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      border-inline-end: 1px solid var(--l-filo-fuerte); font-weight: 700; color: var(--asb-cromo-tinta);
      /* Un nombre largo cede con puntos suspensivos antes de que el hilo se monte sobre las herramientas. */
      flex: 0 1 auto; min-inline-size: 3rem;
    }
    @media (min-width: 64rem) { app-hilo-del-caso { flex: none; } }
    .contexto-editor { padding: 0 0.75rem; font-weight: 700; color: var(--asb-cromo-tinta); white-space: nowrap; }
    /* A 390 px el rótulo no cabe junto a «‹ Casos» y la cuenta (se pisaba con el menú): el título de la página ya lo dice. */
    @media (max-width: 29.999rem) { .contexto-editor { display: none; } }
    .barra-ayuda { display: flex; flex-wrap: nowrap; gap: 0.125rem; }
    @media (max-width: 79.999rem) and (min-width: 64rem) { .caso-actual { display: none; } }

    /* «Probar» es la acción de la barra: lleva el tinte de marca sobre el vidrio (sin filo), como la acción de una barra
       de iOS; el botón sólido de cada pantalla sigue siendo uno solo. */
    .enlace-probar { background: color-mix(in oklab, var(--asb-acento) 16%, transparent); color: var(--ds-primary); }
    @media (hover: hover) and (pointer: fine) {
      .enlace-probar:hover { background: color-mix(in oklab, var(--asb-acento) 24%, transparent); color: var(--ds-primary); }
    }
    /* El siguiente paso, en la barra de estado: una cápsula con el acento, siempre a la vista (pasarela, 2026-11-22). */
    /* Doble clase: le gana a la regla base de la barra de estado (.est-dato-boton), que se carga después. */
    .est-dato-boton.est-siguiente {
      margin-inline-start: 0.25rem; border-radius: 999px; background: color-mix(in oklab, var(--ds-primary) 12%, transparent);
      color: var(--ds-primary); font-weight: 700;
    }
    .est-siguiente__rotulo { font-weight: 600; }
    .est-siguiente__texto { min-inline-size: 0; max-inline-size: 28rem; overflow: hidden; text-overflow: ellipsis; }
    @media (hover: hover) and (pointer: fine) {
      .est-dato-boton.est-siguiente:hover { background: color-mix(in oklab, var(--ds-primary) 20%, transparent); color: var(--ds-primary); }
    }
    /* El guardado, en la barra de estado: el punto y su palabra, sin el relleno de la barra de arriba. */
    .guardado-estado { padding-inline: 0.5rem; }
    .insignia {
      display: inline-grid; place-items: center; min-inline-size: 1.375rem; block-size: 1.375rem; padding-inline: 0.375rem;
      border-radius: 999px; background: var(--ds-warning-text); color: var(--ds-surface-1); font-size: var(--autoria-texto-14);
      font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1;
    }
    .insignia--cero { background: transparent; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte); color: var(--asb-cromo-tinta-tenue); }

    .zona-centro { inline-size: 100%; min-inline-size: 0; outline: none; }
    .marco-pantalla { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
    /* La sala encaja su lienzo en el alto que queda: necesita un alto definido en toda la cadena (sin esto el lienzo
       medía 89 px dentro del estudio, medido el 2026-11-22). Las demás pantallas crecen con su contenido y desplazan. */
    .marco-pantalla:has(> app-sala) { block-size: 100%; }
    /* Aviso de solo lectura: un aviso de verdad (filo, icono de candado en píxeles y texto), igual en claro y en oscuro. */
    .solo-lectura {
      display: flex; align-items: center; gap: 0.625rem; margin: 0.75rem 1rem 0; padding: 0.5rem 0.875rem;
      border: 1px solid var(--l-tinte-filo); border-radius: var(--l-radio-control); background: var(--l-tinte); color: var(--ds-text-1);
      font-size: var(--autoria-texto-14); font-weight: 700;
    }
    .solo-lectura::before {
      content: ''; flex: none; inline-size: 0.875rem; block-size: 0.75rem; margin-block-start: 0.25rem; border-radius: 0.125rem;
      background: var(--ds-primary); box-shadow: 0 -0.375rem 0 -0.125rem var(--l-tinte), 0 -0.375rem 0 0 var(--ds-primary);
    }

    /* Explorador de Historia: dos pestañas con un indicador que viaja de una a otra (no salta). */
    .explorador { display: grid; grid-template-rows: auto minmax(0, 1fr); min-block-size: 0; }
    .explorador__pestanas {
      position: relative; display: grid; grid-template-columns: 1fr 1fr; padding-inline: 0.5rem; border-block-end: 1px solid var(--l-filo);
    }
    .explorador__pestanas [role='tab'] {
      min-block-size: 2.75rem; border: 0; background: transparent; color: var(--ds-text-2); font: inherit; font-size: var(--autoria-texto-14);
      font-weight: 700; cursor: pointer; transition: color var(--ds-dur-fast) var(--ds-ease-out);
    }
    .explorador__pestanas [role='tab'][aria-selected='true'] { color: var(--ds-text-1); }
    @media (hover: hover) and (pointer: fine) { .explorador__pestanas [role='tab']:hover { color: var(--ds-text-1); } }
    .explorador__indicador {
      position: absolute; inset-block-end: -1px; inset-inline-start: 0.5rem; inline-size: calc(50% - 0.5rem); block-size: 2px;
      background: var(--ds-primary); transition: translate var(--ds-dur-move) var(--ds-spring-soft);
    }
    .explorador__indicador[data-pestana='biblioteca'] { translate: 100% 0; }
    .explorador > .zona { min-block-size: 0; overflow: auto; overscroll-behavior: contain; }
    .explorador > [hidden] { display: none; }

    /* Barra de estado: dónde estoy y lo que falta. */
    .estado-donde { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
    .estado-pendientes { color: var(--ds-warning-text); font-weight: 700; }

    /* Escritorio: la página no se desplaza; cada zona, sí (§4.2, regla 1). La rejilla la arma el estudio. */
    @media (min-width: 64rem) {
      .cuerpo { flex: 1; min-block-size: 0; }
      .zona-centro { --alto-cabecera: 0px; min-block-size: 0; overflow: auto; overscroll-behavior: contain; scroll-padding-block-start: 1rem; }
      .columna-ia {
        position: absolute; z-index: var(--autoria-capa-5); inset-block: 0.75rem; inset-inline-end: 0.75rem;
        inline-size: min(25rem, calc(100% - 1.5rem)); overflow: auto; overscroll-behavior: contain;
        border: 1px solid var(--l-filo); border-radius: var(--l-radio-tarjeta); background: var(--l-superficie); box-shadow: var(--l-sombra-trabajo);
      }
    }
    @media (prefers-reduced-motion: reduce) { .explorador__indicador { transition: none; } }

    /* «Deshacer»: flota abajo, centrado; es vidrio porque flota (§4.7). */
    .deshacer-zona {
      position: fixed; z-index: var(--autoria-capa-10); inset-inline: 0; inset-block-end: 1.25rem; display: flex; justify-content: center;
      pointer-events: none;
    }
    .deshacer {
      display: inline-flex; align-items: center; gap: 0.25rem; max-inline-size: min(36rem, calc(100vw - 2rem)); padding: 0.25rem 0.25rem 0.25rem 1rem;
      border: 1px solid var(--l-filo-fuerte); border-radius: 999px; background: color-mix(in oklab, var(--l-superficie) 88%, transparent);
      box-shadow: var(--l-sombra-trabajo); color: var(--ds-text-1); font-size: var(--autoria-texto-16); pointer-events: auto;
      animation: deshacer-entra var(--ds-dur-fade) var(--ds-ease-out);
    }
    .deshacer__texto { min-inline-size: 0; overflow-wrap: anywhere; }
    .deshacer__accion, .deshacer__cerrar {
      min-block-size: 2.75rem; min-inline-size: 2.75rem; padding-inline: 0.875rem; border: 0; border-radius: 999px; background: transparent;
      color: var(--ds-primary); font: inherit; font-weight: 800; cursor: pointer;
    }
    .deshacer__cerrar { color: var(--ds-text-2); padding-inline: 0; }
    .deshacer__accion:active, .deshacer__cerrar:active { scale: 0.96; }
    @keyframes deshacer-entra { from { opacity: 0; translate: 0 0.5rem; } }
    @media (prefers-reduced-motion: reduce) { .deshacer { animation: none; } }
  `,
})
export class AutoriaShellComponent implements CanLeave {
  protected readonly store = inject(CasoStore);
  private readonly dialogo = inject(UiDialog);
  protected readonly rutas = inject(RutasAutoria);
  private readonly ruta = inject(ActivatedRoute);
  /** El caso que pide la dirección; `null` en crear un caso (no hay caso que abrir). */
  private readonly casoPedido = toSignal(this.ruta.paramMap.pipe(map((p) => p.get('caseVersionId'))), { initialValue: this.ruta.snapshot.paramMap.get('caseVersionId') });
  /** Se está abriendo el caso pedido (aún no es el que tiene el store). */
  protected readonly abriendo = computed(() => {
    const pedido = this.casoPedido();
    return pedido !== null && this.store.caso()?.id !== pedido && this.store.errorDeCarga() === null;
  });
  protected readonly fallo = computed(() => (this.casoPedido() !== null && this.store.caso()?.id !== this.casoPedido() ? this.store.errorDeCarga() : null));
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guia = inject(GuiaService);
  private readonly direccion = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url },
  );
  /** La dirección actual y la anterior: «volver» lleva al menú del que se vino, no solo al padre. */
  private readonly trayecto = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      scan((antes: { actual: string; previa: string | null }, url: string) => ({ actual: url, previa: antes.actual }), { actual: this.router.url, previa: null }),
    ),
    { initialValue: { actual: this.router.url, previa: null } },
  );
  /**
   * A dónde lleva el módulo «‹» de la barra. Desde el guion de una escena, a Caminos; desde una sala, al Plano o al guion si
   * de ahí se vino (si no, a Caminos); desde cualquier pantalla principal del editor (y al crear un caso), a Casos.
   */
  protected readonly volver = computed<{ ruta: string; texto: string }>(() => {
    const { actual, previa } = this.trayecto();
    const limpia = (url: string | null): string => (url ?? '').split(/[?#]/)[0];
    const aqui = limpia(actual);
    const antes = limpia(previa);
    const caminos = { ruta: this.rutas.a('/editor'), texto: 'Volver a Caminos' };
    if (this.store.caso() && /\/editor\/escena\/[^/]+$/.test(aqui)) return caminos;
    if (this.store.caso() && /\/editor\/sala\/[^/]+$/.test(aqui)) {
      if (/\/editor\/plano$/.test(antes)) return { ruta: this.rutas.a('/editor/plano'), texto: 'Volver al Plano' };
      if (/\/editor\/escena\/[^/]+$/.test(antes)) return { ruta: antes, texto: 'Volver al guion' };
      return caminos;
    }
    return { ruta: RUTA_CASOS, texto: 'Volver a casos' };
  });
  protected readonly progreso = inject(ProgresoDelCaso);
  protected readonly deshacer = inject(DeshacerBorrado);
  private readonly ia = inject(IaService);
  /** El riel de escenas solo se pinta en la etapa Historia; en las demás el contenido ocupa todo el ancho. */
  protected readonly esHistoria = computed(() => !!this.store.caso() && this.progreso.etapaActual() === 'historia');
  /** Con el asistente apagado (o sin clave) su botón no se pinta: no se ofrece lo que no hay. */
  protected readonly iaDisponible = computed(() => this.ia.estado() !== 'apagado');
  /** «Pendientes: 2 por corregir», lo que oye el lector y dice el globo del botón. */
  protected readonly textoPendientes = computed(() => {
    const n = this.progreso.porCorregir().length;
    return n === 0 ? 'Pendientes: nada por corregir' : n === 1 ? 'Pendientes: 1 por corregir' : `Pendientes: ${n} por corregir`;
  });
  /**
   * Las pantallas no se pueden cambiar si el caso ya no es un borrador. Siguen vivos los
   * datos del caso (sus campos son de solo lectura, para poder leerlos con el teclado) y la revisión: en un caso que ya no es un borrador es donde se decide (aprobar, devolver, archivar) y se crea la versión nueva.
   */
  protected readonly bloqueado = computed(() => this.store.soloLectura() && !/\/(revision|datos)$/.test(this.direccion().split('?')[0]));
  /** «Probar» lleva el borrador al juego real, en esta pestaña (con Ctrl o clic central, en otra), desde la escena de inicio. */
  protected readonly rutaEnsayo = computed(() => RUTA_ENSAYO(this.store.caso()?.id ?? ''));
  protected probar(evento: MouseEvent): void {
    void alPulsarProbar(evento, this.store);
  }
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Lleva al siguiente paso (la misma acción que la tarjeta del Explorador). */
  protected readonly llevar = injectLlevar();
  /** Lo que se puede agregar desde cualquier pantalla (pasarela del docente, 2026-11-22). */
  protected readonly opcionesAgregar = computed<UiMenuItem[]>(() => {
    const enEscena = !!this.progreso.escenaActual();
    return [
      { value: 'escena', label: enEscena ? 'Escena nueva, después de esta' : 'Escena nueva', icon: 'add' },
      { value: 'linea', label: enEscena ? 'Línea de diálogo en esta escena' : 'Línea de diálogo', icon: 'chat' },
      { value: 'respuesta', label: enEscena ? 'Respuesta del estudiante en esta escena' : 'Respuesta del estudiante', icon: 'forum' },
      { value: 'mueble', label: 'Mueble, objeto o personaje en la sala', icon: 'chair' },
      { value: 'paso', label: 'Paso profesional', icon: 'task_alt' },
      { value: 'final', label: 'Final del caso', icon: 'flag' },
      { value: 'objetivo', label: 'Objetivo de aprendizaje', icon: 'school' },
    ];
  });
  /**
   * Agrega sin volver a otro menú: la escena se crea (después de la actual, en su misma sala) y se abre su guion; el paso
   * profesional abre su formulario en Evaluación; lo demás lo localiza la guía y deja el foco en su control.
   */
  protected async agregar(valor: string | undefined): Promise<void> {
    const caso = this.store.caso();
    if (!caso || this.store.soloLectura()) return;
    const guiaPara: Record<string, string> = {
      linea: 'agregar-linea', respuesta: 'agregar-respuesta', mueble: 'agregar-mueble', final: 'definir-finales', objetivo: 'datos-del-caso',
    };
    if (valor === 'escena') {
      const actual = this.progreso.escenaActual();
      const sala = caso.escenas.find((e) => e.id === actual)?.salaId ?? caso.salas[0]?.id ?? null;
      const id = this.store.agregarEscena(sala, actual ?? undefined);
      await this.router.navigateByUrl(this.rutas.a('/editor/escena', id));
      return;
    }
    if (valor === 'paso') {
      await this.router.navigateByUrl(this.rutas.a('/editor/evaluacion'));
      this.pulsarCuandoAparezca('#agregar-paso');
      return;
    }
    if (valor && guiaPara[valor]) await this.guia.mostrar(guiaPara[valor], 'foco');
  }

  /** Pulsa un control de la pantalla recién abierta en cuanto está pintado (la ruta puede tardar unos cuadros). */
  private pulsarCuandoAparezca(selector: string, intentos = 30): void {
    const boton = this.anfitrion.nativeElement.querySelector<HTMLButtonElement>(selector);
    if (boton) { boton.click(); return; }
    if (intentos > 0) requestAnimationFrame(() => this.pulsarCuandoAparezca(selector, intentos - 1));
  }
  protected readonly iaAbierta = signal(false);
  /** La pestaña del Explorador de Historia. */
  protected readonly pestana = signal<'escenas' | 'biblioteca'>('escenas');
  /** «Escena 3 de 8 · Recepción» o el nombre de la etapa: la primera cosa de la barra de estado. */
  protected readonly dondeEstoy = computed(() => {
    const escenas = this.progreso.escenas();
    const i = escenas.findIndex((e) => e.id === this.progreso.escenaActual());
    if (i >= 0) return `Escena ${i + 1} de ${escenas.length} · ${escenas[i].titulo}`;
    if (this.esHistoria()) return `Caminos · ${escenas.length} ${escenas.length === 1 ? 'escena' : 'escenas'}`;
    return this.progreso.avance().find((a) => a.etapa === this.progreso.etapaActual())?.nombre ?? 'Editor de casos';
  });
  protected readonly buscador = signal<'buscar' | 'preguntar' | null>(null);
  /** Con el buscador o la guía abiertos la barra se congela (DG-9): lo que la guía señala no salta 6 px al desplazarse. */
  protected readonly ayudaAbierta = computed(() => this.buscador() !== null || this.guia.activa() !== null);
  protected readonly menuCuenta = MENU_CUENTA;
  protected readonly nombreCuenta = computed(() => {
    const usuario = this.auth.currentUser();
    return `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim() || 'Cuenta institucional';
  });
  protected readonly rolCuenta = computed(() => roleLabel(this.auth.currentUser()?.role));
  private origenBuscador: HTMLElement | null = null;
  private readonly botonIa = viewChild<ElementRef<HTMLButtonElement>>('botonIa');
  private readonly cabecera = viewChild<unknown, ElementRef<HTMLElement>>('cabecera', { read: ElementRef });
  private readonly injector = inject(Injector);

  constructor() {
    injectComandosDelCaso({
      buscarEnLaAyuda: () => this.abrirBuscador('buscar'),
      preguntarALaGuia: () => this.abrirBuscador('preguntar'),
      verPendientes: () => this.dialogo.sheet(PanelPendientesComponent, { side: 'end', origen: null }),
      probar: () => void this.router.navigateByUrl(this.rutaEnsayo()),
    });
    effect(() => {
      const pedido = this.casoPedido();
      if (pedido === null) return;
      untracked(() => void this.store.cargar(Number(pedido)));
    });
    const destruir = inject(DestroyRef);
    destruir.onDestroy(() => void this.store.liberar());
    // La barra es fija y su alto cambia con el ancho (en un teléfono la ayuda y las secciones bajan a otras filas). Lo que se pega
    // bajo ella (panel de IA, vistas previas), el relleno de arriba y el desplazamiento al enfocar usan su alto real:
    // `--alto-barra` y `--alto-cabecera` (todo lo que queda fijo arriba, que hoy es solo la barra).
    afterNextRender(() => {
      const barra = this.cabecera()?.nativeElement;
      if (!barra) return;
      const raiz = document.documentElement.style;
      const medir = () => {
        const alto = getComputedStyle(barra).position === 'fixed' ? Math.ceil(barra.getBoundingClientRect().height) : 0;
        raiz.setProperty('--alto-barra', `${alto}px`);
        raiz.setProperty('--alto-cabecera', `${alto}px`);
      };
      medir();
      destruir.onDestroy(() => {
        raiz.removeProperty('--alto-barra');
        raiz.removeProperty('--alto-cabecera');
      });
      if (typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(medir);
      observador.observe(barra);
      destruir.onDestroy(() => observador.disconnect());
    });
  }

  /** Explorador de Historia: ← y → pasan de una pestaña a la otra (patrón de pestañas de las APG). */
  protected teclaPestana(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const otra = this.pestana() === 'escenas' ? 'biblioteca' : 'escenas';
    this.pestana.set(otra);
    afterNextRender(() => document.getElementById(`exp-tab-${otra}`)?.focus(), { injector: this.injector });
  }

  /**
   * Suelta el foco: los campos guardan al perder el foco, así que lo que se está escribiendo entra a la cola antes de mirar si hay
   * algo sin guardar (cerrar o salir con el cursor aún dentro de un campo no lo pierde).
   */
  private soltarFoco(): void {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && activo !== document.body) activo.blur();
  }

  /** Hay algo que se perdería al salir: lo que no está a salvo y también un cambio que el sistema rechazó (ya está deshecho). */
  private haySinGuardar(): boolean {
    return this.store.haySinGuardar() || this.store.error() !== null || this.store.descartado().length > 0;
  }

  /** Al recargar o cerrar: lo que se está escribiendo se confirma (el campo suelta su cambio). */
  protected alCerrar(): void {
    this.soltarFoco();
  }

  /** Si hay algo que no está a salvo (cambios viajando, un conflicto, respuestas a medias o un cambio rechazado), el navegador pregunta antes de cerrar la pestaña. */
  protected antesDeSalir(e: BeforeUnloadEvent): void {
    this.soltarFoco();
    if (this.haySinGuardar()) e.preventDefault();
  }

  /**
   * Salir del editor (guardia de la ruta): primero se suelta el foco y se espera a que lo pendiente llegue; si aun así queda algo
   * que no está a salvo, se pregunta nombrando lo que se pierde, con «Seguir editando» como acción segura.
   */
  async canLeave(): Promise<boolean> {
    this.soltarFoco();
    await this.store.sincronizado();
    if (!this.haySinGuardar()) return true;
    const motivos: string[] = [];
    if (this.store.conflicto()) motivos.push('otra persona cambió el caso y tus últimos cambios no se guardaron');
    const n = this.store.sinGuardar().length;
    if (n > 0) motivos.push(n === 1 ? 'hay 1 respuesta sin completar que solo está en esta pantalla' : `hay ${n} respuestas sin completar que solo están en esta pantalla`);
    if (this.store.error() !== null || this.store.descartado().length > 0) motivos.push('un cambio no se guardó y se deshizo (el aviso sigue arriba)');
    const respuesta = await this.dialogo.consequence({
      title: 'Tienes cambios sin guardar',
      consequence: `Si sales ahora se pierde lo que no está guardado: ${motivos.join(' y ')}.`,
      continueLabel: 'Seguir editando',
      proceedLabel: 'Salir sin guardar',
    });
    return respuesta === 'proceed';
  }

  /** Qué se le dice al docente cuando el caso ya no se puede editar. */
  protected textoSoloLectura(): string {
    const estado = this.store.caso()?.estado;
    const donde = estado === 'PUBLISHED' ? 'está publicado' : estado === 'ARCHIVED' ? 'está archivado' : 'está en revisión de Psicología';
    return `El caso ${donde}. Se puede ver, pero no editar.`;
  }

  /** Por qué no se puede usar el asistente cuando el caso ya no es un borrador. */
  protected textoAsistenteBloqueado(): string {
    const estado = this.store.caso()?.estado;
    const donde = estado === 'PUBLISHED' ? 'está publicado' : estado === 'ARCHIVED' ? 'está archivado' : 'está en revisión';
    return `El caso ${donde}: no se puede cambiar. El asistente de IA no está disponible.`;
  }

  reintentar(): void {
    const pedido = this.casoPedido();
    if (pedido !== null) void this.store.cargar(Number(pedido), true);
  }

  /** El enlace normal no sirve con `<base href="/">`: recargaría la página en «Casos». */
  protected saltar(e: Event): void {
    e.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  protected alternarIa(): void {
    if (this.store.soloLectura()) return;
    if (this.iaAbierta()) {
      this.cerrarIa();
      return;
    }
    this.iaAbierta.set(true);
    afterNextRender(() => document.getElementById('iat')?.focus(), { injector: this.injector });
  }

  protected abrirBuscador(modo: 'buscar' | 'preguntar', evento?: Event): void {
    const activo = (evento?.currentTarget as HTMLElement | undefined) ?? (document.activeElement as HTMLElement | null);
    this.origenBuscador = activo && activo !== document.body ? activo : null;
    this.buscador.set(modo);
  }

  /** «Pendientes»: la hoja lateral con todo lo que falta, agrupado por etapa (la única lista de pendientes del editor). */
  protected abrirPendientes(evento: Event): void {
    this.dialogo.sheet(PanelPendientesComponent, { side: 'end', origen: evento.currentTarget as Element | null });
  }

  protected cerrarBuscador(): void {
    this.buscador.set(null);
    // Si se eligió una acción, la guía ya movió el foco; si no, vuelve a donde estaba.
    queueMicrotask(() => {
      if (document.activeElement === document.body || !document.activeElement) this.origenBuscador?.focus();
    });
  }

  protected alElegirCuenta(valor: string | undefined): void {
    if (valor === 'salir') this.auth.logout();
  }

  protected cerrarIa(): void {
    this.iaAbierta.set(false);
    this.botonIa()?.nativeElement.focus();
  }
}
