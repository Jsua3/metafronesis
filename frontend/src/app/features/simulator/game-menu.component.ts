import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, ViewChild, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import Phaser from 'phaser';
import { SimulationService } from '../../core/api/simulation.service';
import { ShortcutSettings } from '../../core/a11y/shortcut-settings.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { toAvatarV2 } from '../character/kit/avatar-v2';
import { CharacterVisual, resolveCharacter } from '../character/kit/character-visual.resolver';
import { KIT_ORIGIN_X, KIT_ORIGIN_Y, ensureCharacterAnims, kitFrameIndex, kitSheetKey, playKitPose, queueCharacterSheets } from '../character/kit/kit-phaser';
import { KitService } from '../character/kit/kit.service';
import {
  LOBBY_BLEED, LOBBY_DOOR_RANGE, LOBBY_ROOM, lobbyDoorCursor, lobbyFacadeBand, lobbyMotion, lobbyPose, nearestLobbyDoor,
} from './lobby-avatar.util';
import { LOBBY_DOOR_Y, lobbyDoorLayout } from './lobby-door-layout.util';
import { attachScrollKeyGuard, isShortcutContext, isTextEntryTarget, resolveInteractPress } from './keyboard-focus.util';
import { cameraBounds, integerZoom } from './pixel-scale.util';
import { pixelScaleConfig, watchHostSize } from './pixel-canvas';
import { PixelRender } from './pixel-render';
import { GameHelpComponent } from './game-help.component';
import { HelpModality } from './game-help.content';
import { SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import { COARSE_POINTER_QUERY, matchesMedia } from './pointer-modality.util';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiSpinner } from '../../shared/ui/spinner/ui-spinner';
import { loadingPhase } from '../../shared/ui/skeleton/loading-phase';
import { errorKindFromStatus } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { lockReason } from './case-lock.util';

interface MenuCallbacks {
  /** Los «Atajos de una tecla» siguen activos (F6-10): con false A, D y E no hacen nada en el lobby. */
  shortcutsEnabled?: () => boolean;
  onEnter: (caseVersionId: number) => void;
  onFocus: (item: CatalogItem | null) => void;
  /** La sala ya está pintada: termina la única señal de carga (F5-3). */
  onReady: () => void;
}

/** Recordatorio de teclas que Phaser pinta en una esquina del lobby; sin teclado (puntero grueso) no se pinta. */
export function lobbyKeyboardHint(coarsePointer: boolean, shortcuts = true): string | null {
  if (coarsePointer) return null;
  return shortcuts ? '← → / A D  mover · E entrar' : '← →  mover · Enter entrar';
}

export class ClinicMenuScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  /** Vértices al píxel (PHA-1) y resolución de los textos (PHA-2) con zoom de cámara. */
  private pixelRender?: PixelRender;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private doors: { item: CatalogItem; x: number }[] = [];
  private nearestId: number | null = null;
  private pointerTargetX: number | null = null;
  private view: 'left' | 'right' = 'right';
  private walking = false;
  private readonly worldW: number;
  private readonly spacing = 260;
  private readonly doorY = LOBBY_DOOR_Y;
  private readonly floorY = 380;
  /** Pulso de las puertas y sacudida ante una bloqueada: fuera con «reducir movimiento» (H-22, F5-3). */
  private readonly motion: ReturnType<typeof lobbyMotion>;

  constructor(
    private readonly items: CatalogItem[],
    private readonly visual: CharacterVisual | null,
    private readonly reduceMotion: boolean,
    private readonly cb: MenuCallbacks,
  ) {
    super('ClinicMenuScene');
    this.worldW = Math.max(960, 220 + items.length * this.spacing + 200);
    this.motion = lobbyMotion(reduceMotion);
  }

  preload() {
    // La hoja del kit del jugador: PNG publicado o avatar compuesto en el navegador.
    if (this.visual) queueCharacterSheets(this, this.visual);
  }

  create() {
    // Vértices al píxel también con zoom de cámara ≥ 2 (PHA-1, F0-7).
    this.pixelRender = new PixelRender(this).attach();
    const W = this.worldW, H = LOBBY_ROOM.height;
    // ── Layered clinic façade ────────────────────────────────────────────────
    // El cielo es el color de fondo del juego. Las franjas sangran más allá de la sala: con
    // zoom ×1 la vista es mayor que 960×540 y no debe verse el borde de la fachada.
    const band = lobbyFacadeBand(W);
    this.add.rectangle(band.x, 96, band.width, 168, 0x1c2a3a).setOrigin(0, 0);               // building band
    this.add.rectangle(band.x, 96, band.width, 6, 0x2f4763).setOrigin(0, 0);                 // cornice
    this.add.rectangle(band.x, this.floorY, band.width, H - this.floorY + LOBBY_BLEED, 0x1b2733).setOrigin(0, 0); // floor
    this.add.rectangle(band.x, this.floorY, band.width, 4, 0x2f4763).setOrigin(0, 0);        // floor edge
    // Entrance mat in front of the doors
    this.add.rectangle(band.x, this.doorY + 6, band.width, 26, 0x223247, 0.6).setOrigin(0, 0);

    this.doors = [];
    const door = lobbyDoorLayout(); // las puertas a la altura de los personajes (spec §13.1)
    this.items.forEach((item, i) => {
      const x = 220 + i * this.spacing;
      const open = item.unlocked;
      const fill = item.completed ? 0x2f7476 : open ? 0x33506f : 0x2a2e35;

      // Marco, hoja y manija
      this.add.rectangle(x, this.doorY, door.frame.width, door.frame.height, 0x12202f).setOrigin(0.5, 1)
        .setStrokeStyle(3, open ? 0x9dc0e8 : 0x555a63);
      const leafStroke = open ? 0x6f97c4 : 0x44484f;
      const leaf = this.add.rectangle(x, this.doorY - door.leaf.bottomInset, door.leaf.width, door.leaf.height, fill).setOrigin(0.5, 1)
        .setStrokeStyle(2, leafStroke);
      this.add.rectangle(x + door.handle.dx, this.doorY + door.handle.dy, door.handle.width, door.handle.height, 0xdfe8f2, open ? 0.9 : 0.4); // manija

      // Ratón (VD-5, F5-3): el cursor dice si se puede entrar y la hoja se realza al pasar; el clic sigue caminando
      // hasta ahí (oyente de la escena) y la entrada es la del botón visible o la tecla E.
      leaf.setInteractive({ cursor: lobbyDoorCursor(item) });
      leaf.on('pointerover', () => leaf.setStrokeStyle(3, open ? 0xe8f0f4 : 0x7a808a));
      leaf.on('pointerout', () => leaf.setStrokeStyle(2, leafStroke));

      // Available doors glow (sin «reducir movimiento»); locked doors show a lock icon
      if (open && !item.completed && this.motion.doorPulse) {
        this.tweens.add({
          targets: leaf, alpha: 0.78, duration: 1200,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
      if (!open) {
        this.add.text(x, this.doorY + door.lockDy, '🔒', { fontSize: '14px' }).setOrigin(0.5);
      }

      this.add.text(x, this.doorY + door.titleDy, item.title, {
        fontFamily: 'sans-serif', fontSize: '15px', color: open ? '#e8f0f4' : '#7a808a',
        align: 'center', wordWrap: { width: 180 },
      }).setOrigin(0.5, 1);
      const badge = item.completed ? '✓ Resuelto' : open ? '▶ Disponible' : '🔒 Bloqueado';
      this.add.text(x, this.doorY + door.badgeDy, badge, {
        fontFamily: 'monospace', fontSize: '12px',
        color: item.completed ? '#8cbfa6' : open ? '#9dc0e8' : '#7a808a',
      }).setOrigin(0.5, 1);
      this.doors.push({ item, x });
    });

    // La identidad del editor llega al lobby con las hojas del kit; el marcador
    // geométrico queda como último recurso si la hoja no cargó.
    const shadow = this.add.ellipse(0, 0, 24, 7, 0x000000, 0.25);
    const parts: Phaser.GameObjects.GameObject[] = [shadow];
    if (this.visual && ensureCharacterAnims(this, this.visual)) {
      this.playerSprite = this.add.sprite(0, 0, kitSheetKey(this.visual, 'idle'), kitFrameIndex('idle', 'right'))
        .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
      playKitPose(this.playerSprite, this.visual, 'right', false, this.reduceMotion);
      parts.push(this.playerSprite);
    } else {
      const body = this.add.rectangle(0, -17, 22, 34, 0x8a6cff).setStrokeStyle(2, 0xffffff);
      const coat = this.add.rectangle(0, -13, 22, 16, 0xb9a8ff, 0.9);   // bajo de la bata
      const head = this.add.circle(0, -41, 9, 0xf2c9a0).setStrokeStyle(2, 0xffffff, 0.85);
      parts.push(body, coat, head);
    }
    this.player = this.add.container(220, this.floorY + 2, parts);
    this.applyCamera();
    this.scale.on('resize', () => this.applyCamera());

    // Phaser solo LEE las teclas: sin captura el navegador conserva Enter/Espacio en el botón
    // «Entrar al caso». `createCursorKeys` captura flechas, Espacio y Shift por su cuenta (de ahí
    // el apagado global); `update()` ignora lo que corresponda según el elemento con foco.
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.disableGlobalCapture();
    this.keys = this.input.keyboard?.addKeys('A,D,E,SPACE,ENTER', false) as Record<string, Phaser.Input.Keyboard.Key>;

    // Touch/puntero: tocar el escenario camina hacia ese punto (paridad con
    // teclado); el botón visible del banner completa la entrada al caso.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerTargetX = pointer.worldX;
    });
    this.cb.onReady();
  }

  /** Zoom entero (spec §8.3) con la fachada de 960×540 como sala; sigue al jugador en horizontal. */
  private applyCamera(): void {
    const cam = this.cameras.main;
    const k = integerZoom(cam.width, cam.height, LOBBY_ROOM.width, LOBBY_ROOM.height);
    cam.setZoom(k);
    this.pixelRender?.refreshTexts(k);
    const bounds = cameraBounds(this.worldW, LOBBY_ROOM.height, cam.width / k, cam.height / k);
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.player) {
      cam.startFollow(this.player, true, 0.1, 0.1);
      cam.centerOn(this.player.x, this.player.y);
    }
  }

  override update(_t: number, dt: number) {
    if (!this.player || !this.keys) return;
    const speed = 0.3 * dt;
    // El foco se lee una vez por cuadro: escribiendo, el jugador no camina ni interactúa.
    const focus = document.activeElement;
    const typing = isTextEntryTarget(focus);
    // A, D y E son atajos de una tecla (F6-10): apagables y solo con el foco en la sala o en el cuerpo (WCAG 2.1.4).
    const letters = (this.cb.shortcutsEnabled?.() ?? true) && isShortcutContext(focus);
    let vx = 0;
    if (!typing && (this.cursors?.left?.isDown || (letters && this.keys['A']?.isDown))) vx -= speed;
    if (!typing && (this.cursors?.right?.isDown || (letters && this.keys['D']?.isDown))) vx += speed;
    if (vx !== 0) {
      this.pointerTargetX = null;  // el teclado manda sobre el destino táctil
    } else if (this.pointerTargetX !== null) {
      const delta = this.pointerTargetX - this.player.x;
      if (Math.abs(delta) <= Math.max(speed, 4)) {
        this.pointerTargetX = null;
      } else {
        vx = Math.sign(delta) * speed;
      }
    }
    this.player.setPosition(Phaser.Math.Clamp(this.player.x + vx, 40, this.worldW - 40), this.player.y);

    const pose = lobbyPose(vx);
    const view = pose.view ?? this.view;
    if (this.playerSprite && this.visual && (view !== this.view || pose.walking !== this.walking)) {
      playKitPose(this.playerSprite, this.visual, view, pose.walking, this.reduceMotion);
    }
    this.view = view;
    this.walking = pose.walking;

    const near = nearestLobbyDoor(this.doors, this.player.x, LOBBY_DOOR_RANGE);
    const nextId = near ? near.item.caseVersionId : null;
    if (nextId !== this.nearestId) {
      this.nearestId = nextId;
      this.cb.onFocus(near?.item ?? null);
    }

    // JustDown se lee SIEMPRE, los tres, aunque el resultado se descarte: `Key._justDown` sigue
    // en true hasta que alguien lo lee. Con foco en un botón, Espacio y Enter los activa el
    // navegador (una sola navegación); E sigue siendo del juego.
    const justE = Phaser.Input.Keyboard.JustDown(this.keys['E']); // se lee siempre y después se enmascara
    const pressed = resolveInteractPress(focus, {
      e: justE && letters,
      space: Phaser.Input.Keyboard.JustDown(this.keys['SPACE']),
      enter: Phaser.Input.Keyboard.JustDown(this.keys['ENTER']),
    });
    if (pressed && near) {
      if (near.item.unlocked) this.cb.onEnter(near.item.caseVersionId);
      else if (this.motion.lockedShake) this.cameras.main.shake(180, 0.004);
    }
  }
}

@Component({
  selector: 'app-game-menu',
  standalone: true,
  imports: [CommonModule, MatIconModule, GameHelpComponent, UiButton, UiEmptyState, UiErrorState, UiSpinner],
  template: `
    <div class="menu-root" id="main-content" tabindex="-1" data-skin="game">
      <!-- Un h1 por pantalla (plan visual F3-6): la sala es un mundo a sangre, así que va visualmente oculto. -->
      <h1 class="sr-only">Sala de simulación</h1>
      <!-- La barra del portal está oculta en la sala: la salida al panel queda siempre a la vista (F5-3). -->
      <a ui-button variant="secondary" size="md" icon="arrow_back" class="menu-exit" href="/portal/dashboard"
         (click)="exitToPanel($event)">Volver al panel</a>
      <!-- UNA señal de carga (catálogo, kit y primer cuadro): la región de estado siempre presente. -->
      <p class="sr-only" role="status">{{ loadingVisible() ? 'Preparando la sala…' : '' }}</p>
      @if (loadingVisible()) {
        <div class="menu-loading" aria-hidden="true"><ui-spinner [size]="32" /><p>Preparando la sala…</p></div>
      }
      <!-- Sin casos asignados (F5-5): se dice, sin pasillo vacío; la salida sigue a mano. -->
      @if (phase() === 'ready' && !catalog().length) {
        <div class="menu-empty">
          <ui-empty-state kind="first-use" title="Aún no tienes casos asignados"
            description="Cuando tu docente te asigne un caso, aparecerá su puerta en esta sala." />
        </div>
      }
      @if (phase() === 'error') {
        <div class="menu-error">
          <ui-error-state blocking [kind]="errorKind()" [status]="errorStatus()" message="No pudimos cargar la sala." (retry)="retry()" />
        </div>
      }
      <!-- GAME-09: además de las teclas de Phaser, el host enfocable maneja
           E/Enter/Espacio a nivel DOM — ruta determinista para teclado y
           lectores; la guardia entering() garantiza UNA sola navegación. -->
      @if (keyboardHint(); as hint) { <p class="lobby-help" aria-hidden="true">{{ hint }}</p> }
      <div class="lobby-sign" aria-hidden="true">CLÍNICA · SIEP</div>
      <!-- Bajo la capa de error o de «sin casos» el lienzo no se enfoca (su foco quedaría tapado: WCAG 2.4.11). -->
      <div #host class="phaser-host" role="application" tabindex="0" (click)="focusCanvas()" [attr.inert]="covered() ? '' : null"
           (keydown.e)="enterFocused($event)" (keydown.enter)="enterFocused($event)"
           (keydown.space)="enterFocused($event)"
           [attr.aria-label]="hostLabel()"></div>

      <button #helpTrigger type="button" class="menu-help-btn" (click)="toggleHelp()"
              [attr.aria-expanded]="helpOpen()" [attr.aria-controls]="helpOpen() ? 'lobby-help' : null">
        <mat-icon aria-hidden="true">help_outline</mat-icon>
        <span>Cómo se juega</span>
      </button>

      <!-- La misma pantalla «Cómo se juega» del juego (una sola fuente del texto, F§5.8). Esc y «Cerrar ayuda» la cierran. -->
      @if (helpOpen()) {
        <div class="menu-help-layer" (keydown.escape)="closeHelp()" (click)="onHelpBackdrop($event)">
          <app-game-help view="screen" [modality]="helpModality()" [safeExitPromise]="safeExitPromise"
                         (closed)="closeHelp()" />
        </div>
      }

      @if (focused(); as f) {
        <div class="case-banner" [class.case-banner--locked]="!f.unlocked" aria-live="polite">
          <strong>{{ f.title }}</strong>
          <span>{{ bannerStatus(f) }}</span>
          <!-- Control VISIBLE y accesible (sin botones sr-only enfocables):
               misma navegación única que la tecla E. -->
          <button ui-button class="banner-enter" type="button" variant="primary"
            [disabledReason]="lockReasonOf(f)" [loading]="!!entering()" (click)="enter(f.caseVersionId)">
            {{ f.unlocked ? (keyboardHint() && shortcuts.enabled() ? 'Entrar al caso (E)' : 'Entrar al caso') : 'Bloqueado' }}
          </button>
        </div>
      }

      @if (entering(); as title) {
        <div class="enter-card" aria-hidden="true"><p class="enter-card__eyebrow">Entrando al caso</p><h2>{{ title }}</h2></div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  // Piel juego (data-skin="game" en la raíz): solo tokens --ds-*; la sala es un mundo a sangre, de ahí las capas.
  styles: [`
    :host { display: block; }
    .menu-root { position: fixed; inset: 0; overflow: hidden; background: var(--ds-surface-page); color: var(--ds-text-1); }
    .phaser-host { position: absolute; inset: 0; }
    .phaser-host:focus-visible { outline: 3px solid var(--ds-focus); outline-offset: -3px; }
    :host ::ng-deep .phaser-host canvas { display: block; }
    .menu-exit { position: absolute; top: var(--ds-space-3); left: var(--ds-space-3); z-index: var(--ds-z-desplegable); }
    /* Ayuda de teclas legible (F5-3): tamaño de la escala, contraste de la piel y separada del borde. */
    .lobby-help {
      position: absolute; top: calc(var(--ds-space-3) + var(--ds-target-min) + var(--ds-space-2)); left: var(--ds-space-3);
      z-index: var(--ds-z-elevado); margin: 0; padding: var(--ds-space-1) var(--ds-space-3);
      border-radius: var(--ds-radius-sm); background: var(--ds-surface-1); color: var(--ds-text-2);
      font-family: var(--ds-font-mono); font-size: var(--ds-type-caption-size); line-height: var(--ds-type-caption-line);
      pointer-events: none;
    }
    .lobby-sign {
      position: absolute; top: var(--ds-space-4); left: 50%; translate: -50% 0; z-index: var(--ds-z-elevado);
      padding: var(--ds-space-2) var(--ds-space-4); border: 2px solid var(--ds-border-strong); border-radius: var(--ds-radius-sm);
      background: var(--ds-surface-1); color: var(--ds-text-1); font-family: var(--ds-font-mono);
      font-size: var(--ds-type-lead-size); line-height: 1; pointer-events: none;
    }
    @media (max-width: 40rem) { .lobby-sign { display: none; } }
    /* Por debajo de «Volver al panel» y «Cómo se juega»: cargando o con error, la salida sigue a mano. */
    .menu-loading, .menu-error, .menu-empty {
      position: absolute; inset: 0; z-index: var(--ds-z-pegajoso); display: grid; place-content: center; justify-items: center;
      gap: var(--ds-space-3); padding: var(--ds-space-5); background: var(--ds-surface-page);
    }
    .menu-loading p { margin: 0; color: var(--ds-text-2); }
    .menu-error ui-error-state { max-width: 32rem; }
    .case-banner {
      position: absolute; bottom: var(--ds-space-5); left: 50%; translate: -50% 0; z-index: var(--ds-z-desplegable);
      display: grid; gap: var(--ds-space-1); min-width: min(18rem, calc(100vw - 2 * var(--ds-space-4)));
      padding: var(--ds-space-3) var(--ds-space-5); border: 1px solid var(--ds-border); border-radius: var(--ds-radius-lg);
      background: var(--ds-surface-1); color: var(--ds-text-1); text-align: center;
    }
    .case-banner strong { font-size: var(--ds-type-body-size); color: var(--ds-text-1); }
    .case-banner span { font-size: var(--ds-type-body-s-size); color: var(--ds-text-2); }
    .case-banner--locked { border-color: var(--ds-border-strong); }
    .banner-enter { margin-top: var(--ds-space-2); }
    .menu-help-btn {
      position: absolute; top: var(--ds-space-3); right: var(--ds-space-3); z-index: var(--ds-z-desplegable);
      display: inline-flex; align-items: center; gap: var(--ds-space-2); min-height: 44px; padding: 0 var(--ds-space-4);
      border: 1px solid var(--ds-border-strong); border-radius: var(--ds-radius-md);
      background: var(--ds-surface-1); color: var(--ds-text-1); font: inherit; font-size: var(--ds-type-body-s-size); font-weight: 600; cursor: pointer;
    }
    @media (hover: hover) and (pointer: fine) { .menu-help-btn:hover { background: var(--ds-surface-2); } }
    .menu-help-btn:active { scale: 0.97; }
    .menu-help-btn:focus-visible { outline: 3px solid var(--ds-focus); outline-offset: 2px; }
    .menu-help-btn mat-icon { font-size: 20px; width: 20px; height: 20px; color: var(--ds-primary); }
    /* Capa que cubre el lobby mientras la ayuda está abierta: el foco queda dentro (la pantalla lo atrapa) y el
       escenario de Phaser no recibe toques por debajo. */
    .menu-help-layer {
      position: absolute; inset: 0; z-index: var(--ds-z-cubierta); display: grid; place-items: center;
      padding: var(--ds-space-2) var(--ds-space-3); background: var(--ds-veil);
    }
    .menu-help-layer app-game-help { width: min(640px, 100%); }
    .enter-card {
      position: absolute; inset: 0; z-index: var(--ds-z-modal); display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: var(--ds-space-2); text-align: center;
      background: var(--ds-surface-page); color: var(--ds-text-1);
      animation: enter-open var(--ds-dur-slow) var(--ds-ease-out) both;
    }
    .enter-card__eyebrow {
      margin: 0; color: var(--ds-primary); font-size: var(--ds-type-caption-size); font-weight: 800;
      letter-spacing: .14em; text-transform: uppercase;
    }
    .enter-card h2 { margin: 0; font-size: var(--ds-type-h2-size); line-height: var(--ds-type-h2-line); }
    @keyframes enter-open { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .enter-card { animation: none; }
    }
  `]
})
export class GameMenuComponent implements OnDestroy {
  private readonly sim = inject(SimulationService);
  /** «Atajos de una tecla» (F6-10, WCAG 2.1.4): A, D y E del lobby; apagables. */
  protected readonly shortcuts = inject(ShortcutSettings);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly avatarStore = inject(AvatarStore);
  private readonly kit = inject(KitService);

  /** Carga de la sala (catálogo, kit y primer cuadro), lista o con error: una sola fuente para la única señal. */
  readonly phase = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly loadErrorStatus = signal<number | null>(null);
  private readonly loadingShown = loadingPhase(computed(() => this.phase() === 'loading'));
  /** El aviso de carga sale pasados 150 ms y dura al menos 300 ms (sin parpadeo en una carga rápida). */
  protected readonly loadingVisible = computed(() => this.loadingShown() === 'skeleton');
  protected readonly errorKind = computed(() => errorKindFromStatus(this.loadErrorStatus()));
  protected readonly errorStatus = this.loadErrorStatus.asReadonly();
  /** Una capa que se queda (error o sala sin casos) tapa el lienzo: el lienzo sale del orden de foco. */
  protected readonly covered = computed(() => this.phase() === 'error' || (this.phase() === 'ready' && !this.catalog().length));
  readonly catalog = signal<CatalogItem[]>([]);
  readonly focused = signal<CatalogItem | null>(null);
  readonly entering = signal<string>('');
  /** Sin teclado: se quitan los textos que prometen teclas (la lectura es puntual, el lobby no cambia de puntero). */
  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));
  readonly keyboardHint = computed(() => lobbyKeyboardHint(this.coarsePointer(), this.shortcuts.enabled()));
  readonly helpOpen = signal(false);
  readonly helpModality = computed<HelpModality>(() => this.coarsePointer() ? 'touch' : 'keyboard');
  /** Misma bandera que el juego: la promesa de «Salida segura» solo se escribe cuando es cierta en todos los estados. */
  protected readonly safeExitPromise = SAFE_EXIT_ALWAYS_REACHABLE;
  readonly hostLabel = computed(() => {
    if (this.coarsePointer()) {
      return 'Menú de casos. Toca el suelo para caminar hasta una puerta disponible y usa el botón «Entrar al caso».';
    }
    return this.shortcuts.enabled()
      ? 'Menú de casos. Flechas o A/D para moverte, toca el suelo para caminar, E para entrar a una puerta disponible.'
      : 'Menú de casos. Flechas para moverte, toca el suelo para caminar, Enter para entrar a una puerta disponible.';
  });

  private game?: Phaser.Game;
  /** Retira el bloqueo de desplazamiento por teclado (flechas y Espacio) de `window`. */
  private detachScrollKeyGuard?: () => void;
  private detachHostWatch?: () => void;
  private booting = false;
  private destroyed = false;
  private host?: ElementRef<HTMLDivElement>;
  private helpTrigger?: ElementRef<HTMLButtonElement>;

  @ViewChild('helpTrigger')
  set helpTriggerRef(value: ElementRef<HTMLButtonElement> | undefined) { this.helpTrigger = value; }

  @ViewChild('host')
  set hostRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.host = value;
    if (value) this.load();
  }

  private load() {
    this.phase.set('loading');
    this.sim.getCatalog().subscribe({
      next: items => {
        this.catalog.set(items);
        // Sin casos no hay puertas que mostrar: la sala dice que no hay casos, sin arrancar un pasillo vacío.
        if (!items.length) { this.phase.set('ready'); return; }
        this.boot(items);
      },
      error: (error: { status?: number } | null) => {
        this.loadErrorStatus.set(error?.status ?? null);
        this.phase.set('error');
      },
    });
  }

  /** «Reintentar» del error de carga: vuelve a pedir el catálogo y arranca la sala desde cero. */
  retry() {
    this.teardownGame();
    this.focused.set(null);
    this.load();
  }

  private boot(items: CatalogItem[]) {
    if (!this.host || this.game || this.booting) return;
    this.booting = true;
    // Identidad del jugador: mismo almacén que editor, mundo y resultado; el visual sale del kit.
    this.avatarStore.loadSaved();
    const avatar = toAvatarV2(this.avatarStore.avatar());
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    // Sin kit, o con uno que no se puede resolver, el lobby arranca igual con el marcador geométrico.
    this.kit.load()
      .then(bundle => resolveCharacter(bundle, { kind: 'jugador', avatar }))
      .catch(() => null)
      .then(visual => {
        this.booting = false;
        if (this.destroyed || !this.host || this.game) return;
        // Si Phaser no arranca (sin WebGL ni canvas utilizable), error con «Reintentar» y no «Preparando…» para siempre.
        try {
          this.zone.runOutsideAngular(() => this.startGame(items, visual, reduceMotion));
        } catch {
          this.teardownGame();
          this.loadErrorStatus.set(null);
          this.phase.set('error');
          return;
        }
        // Foco inicial explícito: los controles de teclado quedan activos sin un click previo (GAME-09).
        window.setTimeout(() => this.focusCanvas(), 0);
      });
  }

  /** Estado de la puerta enfocada; la bloqueada nombra el caso que hay que completar antes (F5-5). */
  bannerStatus(item: CatalogItem): string {
    if (item.completed) return 'Resuelto';
    if (item.unlocked) return 'Disponible';
    const reason = this.lockReasonOf(item);
    return reason ? `Bloqueado: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : 'Bloqueado';
  }

  lockReasonOf(item: CatalogItem): string | null {
    return item.unlocked ? null : lockReason(this.catalog(), item.caseVersionId) ?? 'Completa el caso anterior para abrirlo.';
  }

  /** Crea la escena y el juego fuera de Angular; lanza si Phaser no puede arrancar (lo recoge `boot`). */
  private startGame(items: CatalogItem[], visual: CharacterVisual | null, reduceMotion: boolean) {
    const scene = new ClinicMenuScene(items, visual, reduceMotion, {
      shortcutsEnabled: () => this.shortcuts.enabled(),
      onEnter: id => this.zone.run(() => this.enter(id)),
      onFocus: item => this.zone.run(() => this.focused.set(item)),
      onReady: () => this.zone.run(() => this.phase.set('ready')),
    });
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.host!.nativeElement,
      backgroundColor: '#0e141a',
      pixelArt: true,
      roundPixels: true, // con zoom ≥ 2 lo completa PixelRender en create() (F0-7)
      scale: pixelScaleConfig(this.host!.nativeElement),
      scene,
    });
    this.detachHostWatch = watchHostSize(this.game, this.host!.nativeElement);
    // Sin la captura de Phaser, flechas y Espacio desplazarían la página. Se arma DESPUÉS de
    // crear el juego: Phaser descarta los `keydown` ya cancelados.
    this.detachScrollKeyGuard = attachScrollKeyGuard(this.zone);
  }

  focusCanvas() {
    this.host?.nativeElement.focus({ preventScroll: true });
  }

  /** «Volver al panel»: un enlace de verdad (abre en otra pestaña con Ctrl o el botón central); el clic simple navega. */
  exitToPanel(event: MouseEvent) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void this.router.navigate(['/portal/dashboard']);
  }

  /** «Cómo se juega»: pantalla de ayuda sobre el lobby. Al abrir, el foco entra en ella; al cerrar, vuelve al botón. */
  toggleHelp() {
    if (this.helpOpen()) { this.closeHelp(); return; }
    this.helpOpen.set(true);
  }

  /** Un toque fuera de la pantalla de ayuda (sobre la capa) también la cierra. */
  onHelpBackdrop(event: Event) {
    if (event.target === event.currentTarget) this.closeHelp();
  }

  closeHelp() {
    if (!this.helpOpen()) return;
    this.helpOpen.set(false);
    this.helpTrigger?.nativeElement.focus();
  }

  /** Entrada por teclado a la puerta enfocada (E/Enter/Espacio sobre el host). */
  enterFocused(event: Event) {
    const f = this.focused();
    if (!f) return;
    event.preventDefault();
    if (!f.unlocked) return;
    this.enter(f.caseVersionId);
  }

  /**
   * Entra al caso YA (antes, 900 ms de espera ficticia): la tarjeta «Entrando al caso» cubre lo que tarde la
   * navegación. Una sola navegación (E y clic casi simultáneos); si no se pudo navegar, la sala vuelve a estar a mano.
   * Lleva primero a la ficha del caso (F10-1, RF-16), que no crea el intento; su «Comenzar» abre el juego.
   */
  enter(caseVersionId: number) {
    // Con la ayuda abierta, la E del juego (Phaser la sigue leyendo) no debe llevar al caso a quien está leyendo.
    if (this.entering() || this.helpOpen()) return;
    const item = this.catalog().find(c => c.caseVersionId === caseVersionId);
    if (item && !item.unlocked) return;
    this.entering.set(item?.title ?? 'Caso');
    Promise.resolve(this.router.navigate(['/portal/simulador', caseVersionId, 'ficha']))
      .then(navigated => { if (navigated === false) this.entering.set(''); })
      .catch(() => this.entering.set(''));
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.teardownGame();
  }

  /** Suelta el observador del contenedor ANTES de destruir Phaser (un resize posterior lanzaría sobre un lienzo destruido). */
  private teardownGame() {
    this.detachScrollKeyGuard?.();
    this.detachScrollKeyGuard = undefined;
    this.detachHostWatch?.();
    this.detachHostWatch = undefined;
    this.game?.destroy(true);
    this.game = undefined;
  }
}
