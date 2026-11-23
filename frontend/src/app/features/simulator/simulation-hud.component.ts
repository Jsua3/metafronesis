import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, Renderer2, computed, effect, inject, input, output, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { CharacterVisual } from '../character/kit/character-visual.resolver';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import type { PortraitState } from '../character/kit/kit-engine';
import { DRAFT_COPY } from './draft-copy';
import { PixelIconoComponent } from './pixel/pixel-icono.component';
import { CONSULTA_COMPACTO } from './pixel/tramos';
import { COARSE_POINTER_QUERY, matchesMedia, watchMedia } from './pointer-modality.util';
import { portraitStateForPersona } from './persona-portrait.util';

/** Marca de «ayuda vista» (la escribe la tarjeta de primera vez; aquí solo se borra desde Ajustes). */
const HELP_MEMORY_KEY = 'siep.ayuda.v1';

@Component({
  selector: 'app-simulation-hud',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, KitFigureComponent, PixelIconoComponent],
  template: `
    @if (attempt(); as game) {
      <div class="hud-shell"
        role="complementary"
        aria-label="Indicadores del simulador"
        [class.hud--tense]="game.persona.activation === 'TENSE'"
        [class.hud--crisis]="game.persona.activation === 'CRISIS'">

        <!-- Bloque U1, variante B (placas en las esquinas): el grupo de la derecha es la pestaña con el caso sobre una placa con
             la persona y las teclas. La etapa va en la pestaña de la ficha del objetivo y el lugar en la del plano. -->
        <p class="hud-case u-rotulo u-rotulo--suave" [title]="game.caseTitle"><span class="u-rotulo__texto">SIEP · {{ tituloCorto(game.caseTitle) }}</span></p>
        <div class="hud-strip u-placa u-sombra">
          <div class="hud-zone hud-zone--right">
            <!-- La persona en palabras (sin cifras): su cara según el vínculo y la activación, su pulso y la frase del servidor. -->
            <!-- En el tramo compacto la frase sale de la barra pero no se pierde: aparece al pasar el cursor y al enfocar el
                 grupo con teclado (solo ahí entra en el orden de tabulación), y sigue en su nombre accesible. -->
            <div class="hud-persona" [class.hud-persona--text-only]="!patientVisual()" role="group" [attr.aria-label]="game.persona.label"
              [attr.tabindex]="compacto() ? 0 : null">
              @if (patientVisual(); as visual) {
                <span class="hud-persona-ventanilla" aria-hidden="true">
                  <app-kit-figure class="hud-persona-face" [visual]="visual" [portrait]="portraitState()" [scale]="2" />
                </span>
              }
              <span class="hud-persona-copy">
                <!-- Un elemento por estado: al cambiar el estado el pulso nace de nuevo y vuelve a latir (unos 4 s). -->
                @for (activacion of [game.persona.activation]; track activacion) {
                  <i class="hud-persona-pulso" [attr.data-activation]="activacion" aria-hidden="true"></i>
                }
                <span class="hud-persona-label" [title]="game.persona.label">{{ game.persona.label }}</span>
              </span>
            </div>

            @switch (scoreMarker()) {
              @case ('progress') {
                <!-- Sin cifras de métrica: solo el avance que quien integra el HUD declara en progressLabel. -->
                @if (progressLabel(); as progress) {
                  <div class="hud-score hud-score--progress">
                    <mat-icon aria-hidden="true">fact_check</mat-icon>
                    <span>{{ progress }}</span>
                  </div>
                }
              }
            }

            <div class="hud-actions">
              <button type="button" class="hud-action u-tecla u-tecla--icono" data-hud-places (click)="openPlaces.emit()"
                [attr.aria-label]="placesLabel" [attr.title]="placesTitle">
                <app-pixel-icono nombre="ir-a" />
              </button>
              <button type="button" class="hud-action u-tecla u-tecla--icono" (click)="openHelp.emit()"
                aria-label="Abrir cómo se juega" title="Cómo se juega">
                <app-pixel-icono nombre="ayuda" />
              </button>
              <button type="button" class="hud-action u-tecla u-tecla--icono" [class.hud-action--active]="journalOpen()"
                (click)="toggleJournal.emit()"
                [attr.aria-label]="journalKey() ? 'Abrir bitácora reflexiva (J)' : 'Abrir bitácora reflexiva'"
                [title]="journalKey() ? 'Bitácora (J)' : 'Bitácora'">
                <app-pixel-icono nombre="bitacora" />
              </button>
              <button #settingsTrigger type="button" class="hud-action u-tecla u-tecla--icono" [class.hud-action--active]="settingsOpen()"
                (click)="settingsOpen.set(!settingsOpen())"
                aria-label="Abrir ajustes del juego" title="Ajustes"
                [attr.aria-expanded]="settingsOpen()"
                [attr.aria-controls]="settingsOpen() ? 'game-settings-menu' : null">
                <app-pixel-icono nombre="ajustes" />
              </button>
              @if (settingsOpen()) {
                <div #settingsMenu id="game-settings-menu" class="settings-menu" popover="manual"
                  [style.--hud-menu-top]="menuTop() + 'px'"
                  role="dialog" aria-modal="false" aria-labelledby="game-settings-title">
                  <div class="settings-menu__header">
                    <strong id="game-settings-title">Ajustes</strong>
                    <button type="button" aria-label="Cerrar ajustes" (click)="closeSettings()">
                      <mat-icon aria-hidden="true">close</mat-icon>
                    </button>
                  </div>
                  <button type="button" [attr.aria-pressed]="!musicMuted()" (click)="toggleMusic.emit()">
                    <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                    <span>Música ambiental</span>
                    <strong aria-hidden="true">{{ musicMuted() ? 'No' : 'Sí' }}</strong>
                  </button>
                  <button type="button" [attr.aria-pressed]="!sfxMuted()" (click)="toggleSfx.emit()">
                    <mat-icon aria-hidden="true">{{ sfxMuted() ? 'volume_off' : 'graphic_eq' }}</mat-icon>
                    <span>Sonidos de acciones</span>
                    <strong aria-hidden="true">{{ sfxMuted() ? 'No' : 'Sí' }}</strong>
                  </button>
                  <button type="button" [attr.aria-pressed]="reduceMotion()" (click)="toggleReduceMotion.emit()">
                    <mat-icon aria-hidden="true">motion_photos_pause</mat-icon>
                    <span>Movimiento reducido</span>
                    <strong aria-hidden="true">{{ reduceMotion() ? 'Sí' : 'No' }}</strong>
                  </button>
                  <!-- WCAG 2.1.4 (F6-10): las teclas de una letra o un número se pueden apagar. -->
                  <button type="button" [attr.aria-pressed]="shortcuts()" (click)="toggleShortcuts.emit()">
                    <mat-icon aria-hidden="true">accessibility</mat-icon>
                    <span>{{ shortcutsLabel }}</span>
                    <strong aria-hidden="true">{{ shortcuts() ? 'Sí' : 'No' }}</strong>
                  </button>
                  <button type="button" (click)="toggleJournal.emit(); settingsOpen.set(false)">
                    <mat-icon aria-hidden="true">menu_book</mat-icon>
                    <span>Bitácora</span>
                    <strong>{{ journalKey() ? 'J' : '' }}</strong>
                  </button>
                  <button type="button" (click)="showHelp()">
                    <mat-icon aria-hidden="true">help_outline</mat-icon>
                    <span>Cómo se juega</span>
                    <strong></strong>
                  </button>
                  <button type="button" (click)="resetHelpMemory()">
                    <mat-icon aria-hidden="true">replay</mat-icon>
                    <span>Ver la ayuda otra vez</span>
                    <strong>{{ helpResetDone() ? 'Lista' : '' }}</strong>
                  </button>
                  <span class="settings-menu__status" role="status">{{ helpResetDone() ? 'La ayuda de primera vez volverá a mostrarse.' : '' }}</span>
                  <a routerLink="/portal/simulador">
                    <mat-icon aria-hidden="true">home</mat-icon>
                    <span>Catálogo</span>
                    <strong></strong>
                  </a>
                </div>
              }
              <a class="hud-action hud-action--home u-tecla u-tecla--icono" routerLink="/portal/simulador"
                aria-label="Volver al catálogo de simulaciones" title="Volver al catálogo">
                <app-pixel-icono nombre="inicio" />
              </a>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    /* Bloque U1, variante B: el grupo de la derecha de la pantalla del juego, en las piezas del cuadro de diálogo (hoja común
       src/styles/components/_pixel.scss): pestaña con el caso, placa con la persona y las teclas. Sin vidrio ni desenfoque. */
    :host { display: block; }
    .hud-shell {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      color: var(--pixel-tinta);
      font-family: var(--pixel-f-texto);
      font-size: var(--pixel-tam);
      line-height: 1.3;
    }
    .hud-case { margin: 0 calc(6 * var(--pixel-px)) calc(-1 * var(--pixel-px)) 0; max-width: min(36em, 100%); }

    .hud-strip { display: flex; align-items: center; gap: calc(4 * var(--pixel-px)); padding: calc(2 * var(--pixel-px)) calc(2 * var(--pixel-px)) calc(2 * var(--pixel-px)) calc(3 * var(--pixel-px)); }
    .hud-zone { display: flex; align-items: center; }
    .hud-zone--right { gap: calc(4 * var(--pixel-px)); min-width: 0; }

    .hud-persona { display: flex; align-items: center; gap: calc(4 * var(--pixel-px)); flex: 0 1 auto; min-width: 0; }
    /* La cara del kit a ×2 (el punto de mundo), recortada a la cabeza en una ventanilla del tono del retrato del cuadro. */
    .hud-persona-ventanilla {
      position: relative; flex: none; overflow: hidden;
      width: calc(24 * var(--pixel-px)); height: calc(21 * var(--pixel-px));
      background: var(--pixel-ventanilla); box-shadow: 0 0 0 var(--pixel-px) var(--pixel-contorno);
    }
    .hud-persona-face { position: absolute; left: calc(-4 * var(--pixel-px)); top: calc(-5 * var(--pixel-px)); }
    .hud-persona-copy { display: flex; align-items: center; gap: calc(3 * var(--pixel-px)); min-width: 0; }
    /* El pulso de la persona del cuadro (pulso-*.png de I1): tenso por defecto, calmo lento y en crisis rápido. Late unos
       4 s al aparecer o al cambiar el estado y descansa en su primer cuadro: nada se mueve sin fin (F9-1) y las esperas de
       animaciones asentadas (Axe) terminan. */
    .hud-persona-pulso {
      flex: none; width: calc(16 * var(--pixel-px)); height: calc(8 * var(--pixel-px));
      background: var(--pulso-TENSE) 0 0 / calc(64 * var(--pixel-px)) calc(8 * var(--pixel-px)) no-repeat;
      image-rendering: pixelated; animation: hud-pulso 1s steps(4) 4;
    }
    .hud-persona-pulso[data-activation='CALM'] { background-image: var(--pulso-CALM); animation-duration: 2s; animation-iteration-count: 2; }
    .hud-persona-pulso[data-activation='CRISIS'] { background-image: var(--pulso-CRISIS); animation-duration: .5s; animation-iteration-count: 8; }
    @keyframes hud-pulso { to { background-position: calc(-64 * var(--pixel-px)) 0; } }
    .hud-persona-label { min-width: 0; max-width: 16em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--pixel-tinta); }

    .hud-score { display: flex; align-items: center; gap: calc(2 * var(--pixel-px)); flex-shrink: 0; font-family: var(--pixel-f-nombre); }
    .hud-score mat-icon { display: none; }
    .hud-score--progress span { font-size: var(--pixel-letra-chica); font-weight: 700; white-space: nowrap; color: var(--luz); }

    .hud-actions { position: relative; display: flex; align-items: center; gap: calc(2 * var(--pixel-px)); padding-left: calc(3 * var(--pixel-px)); border-left: var(--pixel-px) solid var(--pixel-separador); }
    /* La tecla de la hoja común sigue la escala única (U1, V7): tres veces la letra, entre 44 y 48 px con cualquier
       puntero (--tecla-hud en las fichas; la guarda de 44 px de RNF-04 y BLOQUE-H no se afloja). */
    .hud-action { width: var(--tecla-hud, 44px); height: var(--tecla-hud, 44px); text-decoration: none; }
    /* Bitácora abierta y Ajustes abiertos: la tecla queda encendida, como al enfocarla. */
    .hud-action--active { --m: var(--marco-tecla-encendida); background-color: var(--luz); color: var(--pixel-tinta-oscura); }

    /* popover="manual": el menú vive en la capa superior del navegador, por encima de los controles táctiles del mundo.
       Es una placa con filas de placa-botón. */
    .settings-menu {
      position: fixed;
      inset: auto 8px auto auto;
      top: var(--hud-menu-top, 53px);
      margin: 0;
      z-index: var(--ds-z-cubierta);
      width: min(300px, calc(100vw - 24px));
      max-height: calc(100vh - var(--hud-menu-top, 53px) - 12px);
      max-height: calc(100dvh - var(--hud-menu-top, 53px) - 12px);
      overflow-y: auto;
      overscroll-behavior: contain;
      display: grid;
      gap: calc(2 * var(--pixel-px));
      padding: calc(3 * var(--pixel-px));
      border-style: solid;
      border-width: calc(4 * var(--pixel-px));
      border-image: var(--marco-placa) 4 / calc(4 * var(--pixel-px)) stretch;
      background: var(--pixel-penumbra) var(--trama-placa) 0 0 / calc(8 * var(--pixel-px)) padding-box;
      image-rendering: pixelated;
      color: var(--pixel-tinta);
      font-family: var(--pixel-f-texto);
      font-size: var(--pixel-tam);
    }
    /* Fija arriba: en un móvil horizontal el menú se desplaza y el «x» no debe perderse de vista. */
    .settings-menu__header {
      position: sticky;
      top: calc(-3 * var(--pixel-px));
      z-index: var(--ds-z-elevado);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0 0 calc(2 * var(--pixel-px));
      background: var(--pixel-penumbra);
      color: var(--luz);
      font-family: var(--pixel-f-nombre);
      font-size: var(--pixel-letra-media);
      letter-spacing: .04em;
    }
    .settings-menu__header button, .settings-menu button, .settings-menu a { color: inherit; font: inherit; }
    .settings-menu__header button {
      display: grid; place-items: center; width: 44px; height: 44px; padding: 0; cursor: pointer;
      border-style: solid; border-width: calc(4 * var(--pixel-px)); border-image: var(--marco-tecla) 4 / calc(4 * var(--pixel-px)) stretch;
      background: var(--pixel-tecla) padding-box; image-rendering: pixelated; color: var(--pixel-tinta);
    }
    .settings-menu__header button:active { border-image-source: var(--marco-tecla-hundida); transform: translateY(var(--pixel-px)); }
    @media (hover: hover) and (pointer: fine) {
      .settings-menu__header button:hover { border-image-source: var(--marco-tecla-encendida); background-color: var(--luz); color: var(--pixel-tinta-oscura); }
    }
    .settings-menu > button,
    .settings-menu > a {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) 34px;
      align-items: center;
      gap: calc(4 * var(--pixel-px));
      min-height: 44px;
      padding: 0 calc(4 * var(--pixel-px));
      border-style: solid;
      border-width: calc(4 * var(--pixel-px));
      border-image: var(--marco-placa) 4 / calc(4 * var(--pixel-px)) stretch;
      background: var(--pixel-penumbra) var(--trama-placa) 0 0 / calc(8 * var(--pixel-px)) padding-box;
      image-rendering: pixelated;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }
    .settings-menu > button:focus-visible, .settings-menu > a:focus-visible { border-image-source: var(--marco-placa-foco); background-color: var(--pixel-penumbra-alzada); }
    .settings-menu > button:active, .settings-menu > a:active { border-image-source: var(--marco-placa-pulsada); background-color: var(--pixel-penumbra-hundida); transform: translateY(var(--pixel-px)); }
    @media (hover: hover) and (pointer: fine) {
      .settings-menu > button:hover, .settings-menu > a:hover { border-image-source: var(--marco-placa-sobre); background-color: var(--pixel-penumbra-alzada); }
    }
    .settings-menu mat-icon { color: var(--luz); font-size: 18px; width: 18px; height: 18px; }
    .settings-menu span { min-width: 0; color: var(--pixel-tinta); font-size: var(--pixel-letra-media); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .settings-menu button strong, .settings-menu a strong { color: var(--luz); font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica); text-align: right; }
    /* Región viva del menú: anuncia el reinicio de la ayuda sin ocupar sitio. */
    .settings-menu .settings-menu__status { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

    /* Sin ancho de sobra primero se va el nombre del caso y después la frase de la persona (queda su cara y su pulso). */
    @media (max-width: 1359px) {
      .hud-case { display: none; }
    }
    /* Tramo compacto (U1, V7): la frase sale de la barra y queda la cara con su pulso; al pasar el cursor o al enfocar
       el grupo con teclado, la frase aparece en una placa debajo. Sigue en el nombre accesible del grupo. */
    @media (max-height: 700px), (max-width: 1100px) {
      .hud-persona { position: relative; }
      .hud-persona:focus-visible { outline: var(--pixel-px) solid var(--luz); outline-offset: calc(2 * var(--pixel-px)); }
      .hud-persona-label {
        position: absolute; top: calc(100% + 5 * var(--pixel-px)); left: 0; z-index: var(--ds-z-elevado); max-width: none;
        padding: var(--pixel-px) calc(4 * var(--pixel-px)) calc(2 * var(--pixel-px)); background: var(--pixel-penumbra);
        box-shadow: 0 0 0 var(--pixel-px) var(--pixel-contorno); visibility: hidden;
      }
      .hud-persona:hover .hud-persona-label, .hud-persona:focus-visible .hud-persona-label { visibility: visible; }
    }
    /* Teléfono en vertical: el catálogo sigue a un toque en Ajustes («Catálogo»). */
    @media (max-width: 480px) {
      .hud-action--home { display: none; }
    }
    @media (max-width: 380px) {
      .hud-score { display: none; }
    }
    /* Modo compacto: Ajustes en dos columnas (las siete filas caben en 390 px de alto sin desplazarse). */
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      /* Compacto: el grupo de la esquina mide lo que sus teclas de 44 px y su marco; el caso se va. */
      .hud-strip { padding: 0; }
      .hud-case { display: none; }
      .settings-menu { grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(560px, calc(100vw - 16px)); }
      .settings-menu__header { grid-column: 1 / -1; }
    }
    /* Poco alto (V6): con 620 px o menos, Ajustes ya va en dos columnas (a 1229 × 584, en una sola, pedía 3 px de barra). */
    @media (max-height: 620px) {
      .settings-menu { grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(560px, calc(100vw - 16px)); }
      .settings-menu__header { grid-column: 1 / -1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .hud-persona-pulso { animation: none; }
      .settings-menu > button:active, .settings-menu > a:active, .settings-menu__header button:active { transform: none; }
    }
  `]
})
export class SimulationHudComponent {
  /** La pestaña lleva el título sin su subtítulo («… — tres capítulos»): entero no cabía y salía cortado (B, V4). */
  protected readonly tituloCorto = (titulo: string): string => titulo.split(' — ')[0];
  readonly attempt = input<SimulationAttemptState | null>(null);
  /** Retrato de la persona consultante en el kit (lo da el mundo al cargar); sin él, la persona se dice solo con palabras. */
  readonly patientVisual = input<CharacterVisual | null>(null);
  /** Contador único del chip central («Decisión k de 6»); lo calcula quien integra el HUD. Sin valor, no hay chip. */
  readonly stageLabel = input<string | null>(null);
  readonly progressLabel = input('');
  /**
   * Qué marca el HUD del avance formativo: `progress` dice el avance con `progressLabel` (y no pinta nada si va vacío);
   * `hidden` no pinta nada y no deja hueco. Nunca hay puntos: el estudiante no ve cifras de métrica.
   */
  readonly scoreMarker = input<'progress' | 'hidden'>('progress');
  /** Sala física actual (world.map.title); con puertas puede diferir del nodo DAG. */
  readonly locationLabel = input('');
  readonly journalOpen = input(false);
  readonly musicMuted = input(false);
  readonly sfxMuted = input(false);
  readonly reduceMotion = input(false);
  /** Textos nuevos de F6 que viven en el registro de borradores (una sola fuente para Psicología). */
  protected readonly placesLabel = DRAFT_COPY.placesButtonLabel.text;
  protected readonly placesTitle = DRAFT_COPY.placesDialog.title;
  protected readonly shortcutsLabel = DRAFT_COPY.shortcutsSettingLabel.text;
  /** «Atajos de una tecla» activos (F6-10, WCAG 2.1.4): con ellos apagados ningún texto promete la J. */
  readonly shortcuts = input(true);
  /** La bitácora se anuncia con su tecla solo donde hay teclado y los atajos están activos. */
  readonly journalKey = computed(() => !this.coarsePointer() && this.shortcuts());
  readonly settingsOpen = signal(false);
  /** Sin teclado de por medio: los nombres accesibles y textos de este HUD no prometen atajos (J). */
  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));
  /** Tramo compacto (`pixel/tramos.ts`): la frase de la persona sale de la barra y el grupo se puede enfocar para leerla. */
  protected readonly compacto = signal(matchesMedia(CONSULTA_COMPACTO));
  /** Tras «Ver la ayuda otra vez»: lo confirma la fila y una región viva (sin temporizadores). */
  readonly helpResetDone = signal(false);
  readonly toggleJournal = output<void>();
  /** Botón «Ir a…» de la cabecera (F6-11): pide la lista de personas y puertas de la sala. */
  readonly openPlaces = output<void>();
  /** Botón «?» de la cabecera y fila «Cómo se juega» de Ajustes: piden abrir la pantalla de ayuda. */
  readonly openHelp = output<void>();
  /** «Ver la ayuda otra vez» ya borró la marca de ayuda vista: quien integra puede volver a mostrar la tarjeta de primera vez. */
  readonly helpReset = output<void>();
  readonly toggleMusic = output<void>();
  readonly toggleSfx = output<void>();
  readonly toggleReduceMotion = output<void>();
  readonly toggleShortcuts = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly settingsTrigger = viewChild<ElementRef<HTMLButtonElement>>('settingsTrigger');
  private readonly settingsMenu = viewChild<ElementRef<HTMLElement>>('settingsMenu');
  /** Borde superior del menú (px): justo bajo la cabecera, medido al abrirlo porque su alto cambia en compacto. */
  readonly menuTop = signal(53);
  private stopPointerListener: (() => void) | null = null;

  constructor() {
    // El oyente de clic fuera existe solo mientras Ajustes está abierto: uno global y
    // permanente hace entrar en la zona de Angular cada toque de toda la pantalla de juego.
    effect(() => {
      if (this.settingsOpen()) this.listenOutsidePointer();
      else this.unlistenOutsidePointer();
    });
    // El menú se abre en la capa superior (popover) cuando el navegador la ofrece.
    effect(() => {
      const menu = this.settingsMenu()?.nativeElement;
      if (!menu) return;
      this.menuTop.set(Math.round(this.host.nativeElement.getBoundingClientRect().bottom) + 9);
      try {
        menu.showPopover?.();
      } catch {
        // Ya estaba abierto o el navegador no admite popover: se queda como menú fijo normal.
      }
    });
    // Un híbrido puede cambiar de puntero principal; la consulta avisa sin escuchar nada de `document`.
    const stopWatchingPointer = watchMedia(COARSE_POINTER_QUERY, coarse => this.coarsePointer.set(coarse));
    const stopWatchingTramo = watchMedia(CONSULTA_COMPACTO, compacto => this.compacto.set(compacto));
    inject(DestroyRef).onDestroy(() => {
      this.unlistenOutsidePointer();
      stopWatchingPointer();
      stopWatchingTramo();
    });
  }

  /** Cierra Ajustes; por defecto devuelve el foco al engranaje (el botón «x» desaparece). */
  closeSettings(restoreFocus = true): void {
    if (!this.settingsOpen()) return;
    this.settingsOpen.set(false);
    this.helpResetDone.set(false);
    if (restoreFocus) this.settingsTrigger()?.nativeElement.focus();
  }

  /** Fila «Cómo se juega»: cierra Ajustes sin devolver el foco al engranaje (lo toma la ayuda) y pide abrirla. */
  showHelp(): void {
    this.closeSettings(false);
    this.openHelp.emit();
  }

  /** Fila «Ver la ayuda otra vez»: olvida que la ayuda de primera vez ya se vio. Solo borra una marca del navegador. */
  resetHelpMemory(): void {
    try {
      localStorage.removeItem(HELP_MEMORY_KEY);
    } catch {
      // Almacenamiento bloqueado (modo privado): entonces la marca no se guardaba y no hay nada que borrar.
    }
    this.helpResetDone.set(true);
    this.helpReset.emit();
  }

  /** `document` recibe la tecla antes que el `window:keydown` de la partida. Consumirla
   *  evita que ese manejador la tome como «salida segura» y pause el intento. Con el filtro
   *  `.escape` el plugin de teclas de Angular escucha fuera de la zona y solo entra en ella
   *  cuando la tecla coincide (caminando llegan ~30 keydown por segundo). */
  @HostListener('document:keydown.escape', ['$event'])
  onDocumentKeydown(event: Event): void {
    if (event.defaultPrevented || !this.settingsOpen()) return;
    event.preventDefault();
    this.closeSettings();
  }

  /** Un toque o clic fuera del HUD cierra el menú sin robar el foco. */
  private onDocumentPointerDown(event: Event): void {
    if (!this.settingsOpen()) return;
    if (this.host.nativeElement.contains(event.target as Node | null)) return;
    this.closeSettings(false);
  }

  private listenOutsidePointer(): void {
    this.stopPointerListener ??= this.renderer.listen('document', 'pointerdown',
      (event: Event) => this.onDocumentPointerDown(event));
  }

  private unlistenOutsidePointer(): void {
    this.stopPointerListener?.();
    this.stopPointerListener = null;
  }

  /**
   * Expresión del retrato según la persona (R-12): entre los estados que trae la receta, el definitivo o su cara
   * cercana. El kit de esta rama trae cuatro; los de seis estados llegan con P6 sin tocar esto.
   */
  readonly portraitState = computed<PortraitState>(() => {
    const persona = this.attempt()?.persona;
    const visual = this.patientVisual();
    if (!persona || !visual) return 'neutral';
    return portraitStateForPersona(persona, Object.keys(visual.portraits)) as PortraitState;
  });
}
