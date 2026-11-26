import { A11yModule } from '@angular/cdk/a11y';
import { perfCancel, perfEnd, perfEndNextPaint, perfStart } from '../../core/perf/perf-marks';
import { CommonModule, Location } from '@angular/common';
import { Component, ElementRef, HostListener, Injector, OnDestroy, OnInit, ViewChild, afterNextRender, afterRenderEffect, viewChild, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, defaultIfEmpty, of, retry, switchMap, tap, throwError, timeout } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { InstantTextSettings } from '../../core/a11y/instant-text-settings.service';
import { ShortcutSettings } from '../../core/a11y/shortcut-settings.service';
import { AnnouncePoliteness, LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { apiErrorMessage, isConsentRequiredError } from '../../core/api/api-error.util';
import { RehearsalApi } from '../../core/api/rehearsal.api';
import { SimulationService } from '../../core/api/simulation.service';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  DialogueState, InteractionResult, MapObjectState, NpcConfig, Persona,
  ProgressMapState, RehearsalBlock, SimulationAttemptState, ScenarioConfig, SimulationDecisionResult,
  SimulationNodeState, SimulationWorldState, ToolUseResult
} from '../../core/models/simulation.model';
import type { CharacterVisual } from '../character/kit/character-visual.resolver';
import { personaChangeAnnouncement } from './persona-change.util';
import { collectViewedNpcKeys } from './evidence-gating.config';
import { decorateDialogueState, otherStageDecisionKeys } from './dialogue-decoration.util';
import { type CopyContext } from './evidence-copy.util';
import { type DoorStatus, type DoorStatusContext, doorStateMap, doorStatus } from './door-status.util';
import { type InteractionVerb, interactionVerb, readsLocally } from './interaction-verb.util';
import { ORIENTATION_COPY, SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import { GameHelpComponent } from './game-help.component';
import { HELP_FIRST_CARD, markHelpSeen, readHelpSeen, resetHelpSeen } from './help-memory.util';
import { doorRearmMessage } from './door-rearm.util';
import { SceneGoalCardComponent } from './scene-goal-card.component';
import { partirNotaDeTransicion } from './nota-transicion';
import { SensitiveNoticeComponent } from './sensitive-notice.component';
import { debeConfirmarEnsayo, escenaDesde, reintentarSinDesde, veredictoDeLectura } from './caso/ensayo';
import { debeConfirmarIntento, intentoPerdido } from './caso/intento-reemplazado';
import { escenaRetenida, fichaDeLaSala } from './caso/escena-visible';
import {
  type AlmacenSimple, type IntencionDeDecision, OrdenDeRespuestas, PLAZO_ACCION_MS, borrarIntencion, borrarLectura, claveDeNpc, esPlazoVencido, guardarIntencion,
  guardarLectura, leerIntencion, leerLectura, objetoDeLectura, pasoTrasFalloDeGuardado, respuestaVigente, veredictoDeEnvio, veredictoDeIntencion,
} from './caso/robustez';
import {
  PausaPendiente, ReintentoAlVolver, borrarMarcaDePausa, esperaDeSincronizacion, guardarMarcaDePausa, hayMarcaDePausa, puedeReenviarEleccion,
  veredictoDeFalloDePausa,
} from './caso/pausa-local';
import { npcsDeLaSala } from './caso/npcs-de-sala';
import { memoriaDeComentarios } from './caso/comentarios';
import { BurbujaVisible, MundoCercania, ProximityReactions, RELOJ_DE_VENTANA, acotarAncla } from './proximity-reactions';
import { CommentBubbleComponent } from './comment-bubble.component';
import { RehearsalGoneComponent } from './rehearsal-gone.component';
import { RehearsalPanelComponent } from './rehearsal-panel.component';
import { type GuiaEscena, GUIA_VACIA, armarGuia, avisarOpcionNueva, leerGuiaAutorada } from './caso/guia';
import { identidadDelTutor } from './portrait-resolver.util';
import { leerAcompanantes } from './caso/acompanantes';
import { DialoguePanelComponent } from './dialogue-panel.component';
import { CameraMoment, GameWorldComponent, NPC_KEY_PREFIX, PlacaDeInterfaz } from './game-world.component';
import { CameraSettings } from './camara/camera-settings.service';
import { altoTapado } from './camara/cubierta';
import { type EscenarioReaccion, type FinReaccion, ReactionDirectorComponent } from './reaction-director.component';
import { JournalPanelComponent, JournalSaveState } from './journal-panel.component';
import { isActivatableTarget, isScrollRegionTarget, isShortcutContext, isTextEntryTarget } from './keyboard-focus.util';
import { salaDelMundo } from './sala/mundo-a-sala';
import { SafeExitButtonComponent } from './safe-exit-button.component';
import { WorldPlacesListComponent } from './world-places-list.component';
import { MinimapaComponent, PlanoCompletoComponent } from './plano/minimapa.component';
import { destinoDelPlano, normalizarLayout } from './plano/plano';
import { PlaceCandidate, selectPlacesWithNext, walkingText } from './world-places.util';
import { keyPersonAccessibleName, resolveKeyPerson } from './key-person.util';
import { SimulationHudComponent } from './simulation-hud.component';
import { ToolInventoryComponent } from './tool-inventory.component';
import { AudioDirectorService } from './audio-director.service';
import {
  PROTOCOL_INFO_MESSAGE,
} from './hospital-map.config';
import { COMISARIA_AMBIENT_INFO } from './comisaria-map.config';
import {
  getRiskyInteractionDef,
  isRiskyInteraction,
} from './risky-interaction.config';
import {
  getSceneDisplayLabel,
  getSceneInteractionDescription,
  isSceneAmbientInteraction,
} from './scene-map-display.util';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { leerRevision } from './caso/revision';
import { accessErrorMessage } from './case-access.util';
import { CaseAccessCache } from '../../core/api/case-access.cache';
import { AuthService } from '../../core/auth/auth.service';
import { resolveViewMode, SimulationViewMode } from './simulation-view-mode.util';
import { IntroGateStep, introCardLines, resolveIntroStep } from './intro-gate.util';
import { COARSE_POINTER_QUERY, matchesMedia, watchMedia } from './pointer-modality.util';
import { loadingPhase } from '../../shared/ui/skeleton/loading-phase';
import { UiErrorKind } from '../../shared/ui/state/state-copy';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import { CONSENT_RECORDER, ConsentNoticeStaleError, consentStorageKey } from './consent-recorder';
import { CONTENT_NOTICE_TEXT, DRAFT_COPY } from './draft-copy';
import { variablesDeArte } from './dialogo-arte';
import { PixelIconoComponent } from './pixel/pixel-icono.component';
import { FaseUmbral, UmbralCasoComponent } from './umbral/umbral-caso.component';
import { NotaTransicionComponent } from './nota-transicion.component';
import { ErrorConsentimientoComponent } from './error-consentimiento.component';
import { CinematicaCasoComponent } from './cinematica/cinematica-caso.component';
import { TutorCasoComponent } from './cinematica/tutor-caso.component';
import {
  type CinematicaLeida, type TutorLeido, VistosDelIntento, leerCinematica, leerTutor, marcaDeCapitulo, marcaDeCinematica, marcaDeTutor,
} from './cinematica/lectura';
import { comentarioConNombre, conNombre, dialogoConNombre, nombreDePila } from './caso/plantilla-nombre';

/**
 * Plazo máximo de la precarga del consentimiento (S3-2b): antes de decidir si se pide el aviso se pregunta al servidor si la
 * persona ya lo aceptó. Si no contesta a tiempo se sigue como si no lo hubiera aceptado (se pide el aviso): nunca se queda
 * esperando ni se muestra un error por esto.
 */
const CONSENT_PRIME_TIMEOUT_MS = 3000;
/** Duración de la transición CSS de `.scene-fade`; los efectos de cámara esperan a que termine. */
const SCENE_FADE_MS = 320;
/** Un aviso no esencial se apaga solo: lo que dice ya está en la pantalla o en la ficha del objetivo. */
const NOTICE_MS = 4200;
/**
 * Espera tras activar el fundido de escena antes de seguir con la decisión o la puerta. Supera en 20 ms a la
 * transición CSS (`SCENE_FADE_MS`): son dos cosas distintas, y una no se reutiliza por la otra.
 */
const FADE_OUT_MS = 340;
/** Tras aplicar un mundo nuevo, espera antes de retirar el fundido de escena; luego corren los efectos de cámara. */
const WORLD_REVEAL_DELAY_MS = 80;
/** Rótulo del diálogo que muestra la consecuencia narrativa justo tras decidir (RN-08; decisión del usuario 2026-10-18). */
const CONSEQUENCE_SPEAKER = 'Consecuencia';

/**
 * V7: dos escenas pueden compartir sala con claves de mapa distintas. Se comparan los nombres del lugar si ambos
 * existen y, en su defecto, las claves.
 */
export function mismoLugar(antes: { key: string; title?: string | null }, despues: { key: string; title?: string | null }): boolean {
  const a = antes.title?.trim() ?? '', b = despues.title?.trim() ?? '';
  return a && b ? a === b : antes.key === despues.key;
}
/** Aviso de reintento al decidir: neutro, sin clasificación. El servidor puede mandar un mensaje evaluativo (forma heredada). */
const RETRY_NOTICE = DRAFT_COPY.retryNotice.text;
/** Sin movimientos nuevos durante este tiempo, la posición del jugador se guarda en el servidor. */
const POSITION_SAVE_DEBOUNCE_MS = 550;
/** Línea «no hay nada cerca» tras pedir interactuar sin nada al alcance (la frase es larga: tiempo para leerla sin prisa). */
const NOTHING_NEARBY_MS = 4500;
/** Nombre de la sala al cambiar de sala. */
const ROOM_BANNER_MS = 2200;
/** Banner «Nueva etapa: …». */
const STAGE_BANNER_MS = 3000;
/** Nota de transición autorada en el mapa (salto temporal). Hoy dura lo mismo que `NOTICE_MS`, pero es otro aviso. */
const TRANSITION_NOTE_MS = 4200;
const OVERLAY_KEYS = new Set(['Enter', ' ', 'Escape', '?', 'e', 'E']);
/**
 * Las placas de la interfaz que quedan sobre el mundo al explorar (variante B, U1): la ficha del objetivo, el carril,
 * el grupo de la derecha (HUD y plano), el pie y los paneles de diálogo. Las franjas de cine se reservan aparte.
 */
const PLACAS_SOBRE_EL_MUNDO = [
  '.objective-card', '.carril .sensitive-strip', '.carril .soft-notice', '.carril .room-banner',
  'app-simulation-hud .hud-case', 'app-simulation-hud .hud-strip',
  'app-minimapa .minimapa__lugar', 'app-minimapa .minimapa__abrir', 'app-minimapa .minimapa__alternar',
  '.bottom-zone', '.bottom-zone .tool-dock-wrap', '.bottom-zone .tool-notice', '.right-panel',
  'ui-toast-host [role="alert"]', '.settings-menu', 'app-comment-bubble .bubble',
  '.dialogue-cinematic .placa', '.dialogue-cinematic .panel-head', '.dialogue-cinematic .strip-body',
  'app-reaction-director .reaction-strip', 'app-game-world .touch-dpad', 'app-game-world .touch-interact',
].join(', ');
/** Modo compacto (F§7.9): la misma condición que el CSS compacto y que el HUD. */
const COMPACT_QUERY = '(max-height: 520px), (pointer: coarse) and (orientation: landscape)';
/** Pantalla estrecha (móvil vertical): la tarjeta también arranca plegada, el mundo ocupa el ancho (F§4.6). */
const NARROW_QUERY = '(max-width: 760px)';
/** Pasado esto sin terminar de cargar, el umbral ofrece volver (Nielsen: 10 s es el límite de la atención). */
export const UMBRAL_LENTO_MS = 10_000;
/** Lo que dura la clase `revelando`: el velo (300 ms) y la entrada escalonada del HUD (200 ms + 2 × 40 ms), con holgura. */
const REVELAR_MS = 600;

/** El servidor rechazó empezar de nuevo porque el intento abierto no es el esperado o ya está abierto (409). */
function esConflictoDeIntento(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) return false;
  const code = (error.error as { code?: unknown } | null)?.code;
  return code === 'ATTEMPT_CHANGED' || code === 'ATTEMPT_ALREADY_OPEN';
}

/** El estado de la navegación que trajo hasta aquí (`history.state`), o `null` si no hay o no se puede leer. */
function estadoDeNavegacion(): Record<string, unknown> | null {
  try {
    const estado = window.history?.state as unknown;
    return estado && typeof estado === 'object' ? estado as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** `{ titulo, portada }` del umbral, si la navegación los trajo y tienen la forma esperada; si no, vacíos. */
function umbralDelEstado(estado: Record<string, unknown> | null): { titulo: string | null; portada: string | null } {
  const umbral = estado?.['umbral'] as { titulo?: unknown; portada?: unknown } | undefined;
  const texto = (valor: unknown) => (typeof valor === 'string' && valor.trim() ? valor : null);
  return { titulo: texto(umbral?.titulo), portada: texto(umbral?.portada) };
}
@Component({
  selector: 'app-simulation-play',
  // El umbral y la revelación marcan el anfitrión (no el contenedor del juego, cuya etiqueta fijan los contratos): con el
  // umbral, las tarjetas de entrada se posan sobre su mitad de abajo; al revelar, el HUD entra (DISENO §4.4).
  host: { '[class.juego--umbral]': 'umbralVisible()', '[class.revelando]': 'revelando()' },
  standalone: true,
  imports: [
    A11yModule, CommonModule, RouterLink, MatIconModule,
    SimulationHudComponent, GameWorldComponent, DialoguePanelComponent,
    ToolInventoryComponent, JournalPanelComponent, AttemptOutcomeComponent,
    SafeExitButtonComponent, PixelIconoComponent, SceneGoalCardComponent, GameHelpComponent, WorldPlacesListComponent,
    MinimapaComponent, PlanoCompletoComponent,
    ReactionDirectorComponent, CommentBubbleComponent, RehearsalGoneComponent, RehearsalPanelComponent, SensitiveNoticeComponent, UiButton, UiErrorState, UiScopeNotice, UmbralCasoComponent, NotaTransicionComponent, ErrorConsentimientoComponent,
    CinematicaCasoComponent, TutorCasoComponent
  ],
  template: `
    <div class="game-container pixel-juego" data-skin="game" id="main-content" tabindex="-1" [attr.data-mode]="viewMode()" [style]="arteJuego"
      [class.game-container--reduce-motion]="reduceMotion()" [class.game-container--cine]="cinemaBars()"
      [style.--alto-hud]="altoHud() + 'px'" [style.--alto-objetivo]="altoObjetivo() + 'px'" [style.--alto-pie]="altoPie() + 'px'"
      [attr.data-rehearsal]="mode() === 'rehearsal' ? 'true' : null">
      <!-- Sin región viva propia (F6-12): todo anuncio sale por las dos regiones persistentes de la app
           (LiveRegionAnnouncer), que ya existen antes de que cambie su texto. -->
      <!-- Un h1 por pantalla (plan visual F3-6): el nombre del caso, visualmente oculto (el juego es a sangre). -->
      <h1 class="sr-only">{{ attempt()?.caseTitle || 'Simulación' }}</h1>

      <!-- UN solo indicador de arranque (F6-1), del intento al primer cuadro del mundo: la región de estado siempre
           está presente y el indicador aparece a los 150 ms (loadingPhase). Cubre solo la zona del mundo: con el intento
           ya cargado, la cabecera y «Salida segura» siguen a la vista (REGLA-004). -->
      <p class="sr-only" role="status">{{ bootLoading() ? bootLabel() + (umbralFase() === 'escena' && worldLoadPercent() !== null ? ' ' + worldLoadPercent() + ' %' : '') : '' }}</p>
      <!-- El umbral (DISENO §4.4, DP-09): la ÚNICA pantalla entre la ficha y el mundo. Reemplaza el indicador de arranque y
           queda como velo opaco hasta que el mundo está dibujado y la persona pulsa Continuar; las tarjetas de entrada se
           posan sobre su mitad de abajo. Mientras se ve, la barra, el mundo y el pie quedan inertes (.capas-del-mundo). -->
      @if (umbralVisible() || revelando()) {
        <app-umbral-caso [titulo]="umbralTitulo()" [portada]="umbralDatos().portada" [fase]="umbralFase()"
          [lento]="umbralLento()" [conTarjeta]="umbralConTarjeta()" [salida]="umbralSalida()" [pausando]="pausing()"
          [arrancando]="bootVisible()" [porcentaje]="worldLoadPercent()" [modo]="mode()" [saliendo]="!umbralVisible()"
          (volver)="volverDesdeUmbral()" (salidaSegura)="pauseFromOverlay()" />
      }
      @if (rehearsalGone()) {
        <app-rehearsal-gone class="game-failure" [motivo]="rehearsalWhy()" [caseVersionId]="attempt()?.caseVersionId ?? 0" (restart)="restartRehearsalHere()" />
      }
      @if (error()) {
        <!-- Un fallo nunca se traga: mensaje, reintento (vuelve a pedir lo que falló) y una salida. Con un intento en
             curso la salida es el «Salida segura» del pie, que queda fuera de esta capa. -->
        <div class="game-failure">
          <ui-error-state botonesDeJuego blocking autofocus [kind]="errorKind()" [message]="error()" [status]="errorStatus()"
            (retry)="retryFromError()" />
          @if (!footerExit()) {
            <a class="u-boton" routerLink="/portal/simulador">Volver al simulador</a>
          }
        </div>
      }
      <!-- Los avisos ACCIONABLES (la puerta bloqueada y el error de una acción, VD-29) ya no se pintan aquí: son avisos
           del sistema (ui-toast-host, colocación del juego: arriba a la izquierda). Permanecen hasta cerrarse con
           «Cerrar», no mueven el foco y los anuncia ese anfitrión una vez (assertive solo el error). -->
      <!-- Con un diálogo sobre el mundo el aviso no flota encima del cuadro: el cuadro lo muestra en su sitio (avisoBreve). -->
      @if (pausing() && attempt()?.status === 'IN_PROGRESS') {
        <!-- Acuse visible de la salida segura pedida: con una superposición abierta el pie queda oculto.
             Los lectores de pantalla ya reciben el aviso por la región viva. -->
        <div class="pausing-notice u-placa u-sombra" aria-hidden="true">
          <app-pixel-icono nombre="pausa" />
          <span>Pausando el caso…</span>
        </div>
      }
      @if (transitionNote()) {
        <!-- Bloque U1: la pestaña del capítulo sobre la placa del texto (como el nombre de quien habla sobre su placa). -->
        <app-nota-transicion class="transition-note" [capitulo]="transitionParts().capitulo" [texto]="transitionParts().texto" />
      }

      @if (showResumePrompt() && pendingActiveAttempt(); as active) {
        <!-- Reanudar comparte estructura, movimiento y comportamiento modal con las otras tres entradas (F6-2). -->
        <section class="case-intro-overlay case-intro-overlay--resume" role="dialog" aria-modal="true"
          aria-labelledby="resume-title" aria-describedby="resume-body">
          <article class="case-intro-card case-intro-card--entry" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
            <header class="case-intro-card__header">
              <p class="psy-eyebrow">Intento en progreso</p>
              <h2 id="resume-title">Continuar simulación formativa</h2>
            </header>

            <div class="case-intro-card__body" id="resume-body">
              <p>
                Ya tienes un intento activo en <strong>{{ active.caseTitle }}</strong>.
                Puedes retomarlo desde <strong>{{ active.currentNode.title }}</strong> o iniciar uno nuevo.
              </p>
            </div>

            <footer class="case-intro-card__actions">
              <a class="u-boton" routerLink="/portal/simulador">Volver al catálogo</a>
              <div class="case-intro-card__buttons">
                <!-- RN-07: empezar de nuevo nombra lo que se pierde y «Continuar» (conservar el intento) es lo seguro. -->
                <button class="u-boton" type="button" (click)="requestNewAttempt()">Iniciar nuevo intento</button>
                <button cdkFocusInitial class="u-boton u-boton--principal" type="button" (click)="resumeAttempt()">
                  {{ active.status === 'PAUSED' ? 'Reanudar intento en pausa' : 'Continuar intento en progreso' }}
                </button>
              </div>
            </footer>
          </article>
        </section>
      }

      @if (attempt(); as game) {
        @if (showContentWarning()) {
          <section class="case-intro-overlay content-warning-overlay" role="dialog" aria-modal="true"
            aria-labelledby="content-warning-title" aria-describedby="content-warning-body">
            <article class="case-intro-card content-warning-card" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Aviso de contenido</p>
                <h2 id="content-warning-title">Antes de entrar al caso</h2>
                <span class="case-intro-card__chip">Simulación formativa con datos ficticios</span>
              </header>

              <!-- En pantallas bajas el aviso se desplaza: el bloque es enfocable para leerlo con el teclado (como el de la tarjeta). -->
              <div class="case-intro-card__body" tabindex="0" role="region" aria-label="Texto del aviso de contenido">
                <!-- Solo el texto validado: aria-describedby lo lee tal cual; el aviso de alcance y el estado del
                     registro van fuera de este bloque. -->
                <div id="content-warning-body">
                  <p>{{ contentNoticeText.contenido }}</p>
                  <p>{{ contentNoticeText.salida }}</p>
                </div>
                <!-- Aviso de alcance (RN-01, borrador de Psicología): fuera del texto validado. -->
                <ui-scope-notice />
                @if (consentState() === 'error') {
                  <!-- ETH-01: un almacenamiento que falla NUNCA da el consentimiento por registrado. No se arranca
                       nada y se puede reintentar; «Volver al catálogo» sigue operable. Se anuncia por la región. -->
                  <app-error-consentimiento [texto]="consentErrorText()" (reintentar)="acceptContentWarning()" />
                }
              </div>

              <footer class="case-intro-card__actions">
                <button type="button" class="u-boton" (click)="declineContentWarning()">
                  Volver al catálogo
                </button>
                <button ui-button type="button" class="u-boton u-boton--principal" cdkFocusInitial
                  [loading]="consentState() === 'saving'" (click)="acceptContentWarning()">
                  Continuar
                </button>
              </footer>
            </article>
          </section>
        }

        @if (worldStarted()) {
        @if (cambioDeLugar(); as cambio) {
          <!-- V7: la historia nunca cambia de sala sin aviso (fuera del mundo, que queda inerte bajo una capa). La sala nueva se carga solo al pulsar «Ir a <lugar>». -->
          <section class="case-intro-overlay cambio-de-lugar" role="dialog" aria-modal="true" aria-labelledby="cambio-de-lugar-titulo">
            <article class="case-intro-card" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Cambio de lugar</p>
                <h2 id="cambio-de-lugar-titulo">La historia continúa en {{ cambio.lugar }}</h2>
              </header>
              <footer class="case-intro-card__actions">
                <div class="case-intro-card__buttons">
                  <app-safe-exit-button variante="placa" [pausing]="pausing()" (pause)="pauseFromOverlay()" />
                  <button cdkFocusInitial class="u-boton u-boton--principal cambio-de-lugar__ir" type="button" (click)="irAlLugar()">
                    Ir a {{ cambio.lugar }}
                  </button>
                </div>
              </footer>
            </article>
          </section>
        }

        @if (cinematica(); as cine) {
          <!-- La cinemática del caso (después del consentimiento): su texto viene del caso (ambient.cinematica); trae su
               «Salida segura» y atiende sus teclas (Esc detiene; con la cinemática detenida, Esc es la salida segura). -->
          <app-cinematica-caso [cinematica]="cine" [nombre]="nombreDeQuienJuega()" [reduceMotion]="reduceMotion()"
            [textoInstantaneo]="instantText.enabled()" [pausing]="pausing()"
            (terminada)="alTerminarCinematica()" (silencio)="silenciarIntro($event)" (salidaSegura)="pauseFromOverlay()" />
        }
        @if (tutor(); as profe) {
          <!-- El tutor fuera de la historia (ambient.tutor): una vez por intento y por sala; Esc es la salida segura. -->
          <app-tutor-caso [tutor]="profe" [nombre]="nombreDeQuienJuega()" [reduceMotion]="reduceMotion()" [pausing]="pausing()"
            (cerrado)="alCerrarTutor()" (salidaSegura)="pauseFromOverlay()" />
        }

        @if (showCaseIntro()) {
          <section class="case-intro-overlay" role="dialog" aria-modal="true" aria-labelledby="case-intro-title">
            <article class="case-intro-card" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Primera escena</p>
                <h2 id="case-intro-title">Antes de comenzar</h2>
                <button type="button" class="intro-music-toggle u-boton" [attr.aria-pressed]="musicMuted()" (click)="toggleMusicMute()">
                  <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                  <span>Silenciar música</span>
                </button>
              </header>

              <div class="case-intro-card__body" tabindex="0" role="region" aria-label="Datos de la primera escena">
                @for (line of introCardLines(game.caseTitle, game.currentNode.title, world()?.map?.title ?? ''); track line) {
                  <p>{{ line }}</p>
                }
              </div>

              <footer class="case-intro-card__actions">
                <div class="case-intro-card__buttons">
                  <app-safe-exit-button variante="placa" [pausing]="pausing()" (pause)="pauseFromOverlay()" />
                  <button cdkFocusInitial class="u-boton u-boton--principal" type="button" (click)="continueFromCaseIntro()">
                    Continuar
                  </button>
                </div>
              </footer>
            </article>
          </section>
        }


        <!-- Envoltorio sin caja (display: contents): con el umbral a la vista, la barra, el mundo y el pie quedan inertes y
             ocultos a la tecnología asistiva de una vez, sin tocar los enlaces de inert propios de cada capa. -->
        <div class="capas-del-mundo" [attr.inert]="umbralVisible() ? '' : null" [attr.aria-hidden]="umbralVisible() ? 'true' : null">
        <header class="top-bar" [attr.inert]="inputBlocked() || transitionNote() ? '' : null" [attr.aria-hidden]="inputBlocked() || transitionNote() ? 'true' : null">
          @if (mode() === 'rehearsal') { <p class="rehearsal-banner" role="note">{{ draft.rehearsalBanner.text }}</p> }
          <!-- Bloque U1, variante B: una fila sobre el mundo. A la izquierda, el hueco de la ficha del objetivo (que vive en el
               lienzo); en medio, el carril de avisos; a la derecha, el grupo del caso, la persona y las teclas. -->
          <div class="top-bar__fila">
            <span class="top-bar__hueco" aria-hidden="true"></span>
            <div class="carril">
            <!-- Recordatorio ético del nodo sensible (ETH-01): franja bajo la cabecera, completa al entrar y plegada a un chip a los 8 s;
                 siempre a la vista en todos los dispositivos. Ocupa su propio sitio: no tapa al personaje ni los controles. -->
            <app-sensitive-notice [text]="sensitiveNotice()" [sceneKey]="visibleNode()?.key ?? null" [reduceMotion]="reduceMotion()" />
              @if (softNotice() && !reacting() && viewMode() !== 'dialogue-cinematic') {
                <!-- Aviso breve (4,2 s): lo que dice ya se anunció; nunca es la única
                     fuente. Sin role: una región que nace con su texto no se anuncia de forma fiable. -->
                @for (texto of [softNotice()]; track texto) {
                  <div class="soft-notice u-placa u-sombra" data-placa-flotante><app-pixel-icono nombre="hecho" /><span>{{ texto }}</span></div>
                }
              }
              @if (stepsNotice() && viewMode() !== 'dialogue-cinematic') {
                <!-- «Da unos pasos…» (P8): aviso NO modal. Dice cuánto falta y hacia dónde, se actualiza al caminar y se va solo
                     cuando la puerta ya puede cruzarse. Se anuncia por las regiones vivas de la app (no tiene región propia). -->
                <div class="soft-notice steps-notice u-placa u-sombra" data-steps-notice><app-pixel-icono nombre="ir-a" /><span>{{ stepsNotice() }}</span></div>
              }
              <!-- El título de una escena nueva ya está en la pestaña de la ficha del objetivo: el aviso del carril no lo
                   repite (B, V4); se anuncia igual por la región. -->
              @if (roomBanner() && !fadeActive() && !(bannerDeEtapa() && roomBanner() === stageLabel())) {
                <div class="room-banner u-placa u-sombra">{{ roomBanner() }}</div>
              }
            </div>
            <!-- Bloque U1: el HUD y, debajo de él, el minimapa (antes en la esquina del lienzo). Un solo grupo a la derecha. -->
            <div class="top-bar__derecha" #derecha>
            <app-simulation-hud
              [attempt]="game"
              [patientVisual]="patientVisual()"
              [stageLabel]="stageLabel()"
              [locationLabel]="world()?.map?.title ?? ''"
              [journalOpen]="journalOpen()"
              [musicMuted]="musicMuted()"
              [sfxMuted]="sfxMuted()"
              [reduceMotion]="reduceMotion()"
              (toggleJournal)="journalOpen.set(!journalOpen())" (openPlaces)="openPlaces()"
              [shortcuts]="shortcuts.enabled()" (toggleShortcuts)="shortcuts.toggle()"
              (toggleMusic)="toggleMusicMute()"
              (toggleSfx)="toggleSfxMute()"
              (toggleReduceMotion)="toggleReduceMotion()"
              [instantText]="instantText.enabled()" (toggleInstantText)="toggleInstantText()"
              (openControls)="openControls()" (openHelp)="openHelp()" (helpReset)="resetHelpCard()"
              [fichaDisponible]="mode() !== 'rehearsal' && !busy() && !fadeActive()" (openCaseBrief)="verFichaDelCaso()" />
            @if (world() && !cinemaBars()) {
              <!-- Minimapa (bloque M1, §5.3): abre el plano completo (también con M). Con las franjas de cine se va. -->
              <app-minimapa [plano]="placePlan()" [actual]="placeRoom()" [destino]="placeTarget()" [cercana]="cameraSettings.cercana()"
                [lugar]="world()?.map?.title ?? ''"
                (abrir)="openPlan()" (alternarCercana)="cameraSettings.toggleCercana()" />
            }
            </div>
          </div>
        </header>

        <div class="main-zone">
          <section #canvasZone class="canvas-zone" aria-label="Escena de la simulación"
            [attr.inert]="inputBlocked() || transitionNote() || rehearsalGone() ? '' : null"
            [attr.aria-hidden]="inputBlocked() || transitionNote() || rehearsalGone() ? 'true' : null">
            @if (world()) {
              <!-- Sin role="status": la ficha no trae región viva (los avisos salen por el anunciador de la app). -->
              <div class="objective-card">
                <!-- La ficha abierta se desplaza por dentro con tope de alto (no baja hasta las personas y objetos del suelo). -->
                @if (stageLabel(); as etapa) {
                  <!-- La etapa es la pestaña de la ficha, como el nombre de quien habla sobre su placa (U1). -->
                  <p class="objective-card__etapa u-rotulo"><span class="u-rotulo__texto">{{ etapa }}</span></p>
                }
                <div class="objective-card__scroll">
                  <app-scene-goal-card [guia]="guide()" [doorMessages]="doorMessages()" [walkingKey]="pendingWalkInteraction()?.key ?? null" [hintAttempt]="hintAttempt()" [compact]="cardFolded()" [reduceMotion]="reduceMotion()"
                    (opened)="refreshGuide()" (goToStep)="goToStep($event)" (consentRequired)="requireConsentAgain()" />
                </div>
              </div>
            }

            @if (world(); as w) {
              <app-game-world #gameWorld id="game-area" class="game-surface" [world]="w"
                [scenarioConfig]="scenarioConfig()"
                [viewedNpcKeys]="viewedNpcKeys()" [shortcuts]="shortcuts.enabled()"
                [nearbyInteraction]="nearbyInteraction()" [selectedInteractionKey]="selectedInteraction()?.key ?? null"
                [motionPaused]="worldMotionPaused()" [nombreDeQuienJuega]="nombreDeQuienJuega()"
                [sfxMuted]="sfxMuted()"
                [reduceMotion]="reduceMotion()"
                [activation]="attempt()?.persona?.activation ?? 'CALM'"
                [intensity]="visibleNode()?.intensity ?? 'MEDIUM'"
                [nextTargetKey]="pendingWalkInteraction()?.key ?? guide().siguienteLugar?.key ?? null"
                [doorStates]="doorStates()" [doorMessages]="doorMessages()"
                [dimmedKeys]="dimmedKeys()" [compact]="compactMode()"
                [showLoader]="false" (loadProgress)="worldLoadPercent.set($event)" (worldReady)="onWorldReady()" (patientVisual)="patientVisual.set($event)"
                (proximity)="nearbyInteraction.set($event); reactions?.onProximity($event?.key ?? null)" (proximityAlso)="nearbyAlso.set($event)"
                (nothingNearby)="showNothingNearby()" (interact)="openInteraction($event)"
                (npcInteract)="openNpcDialogue($event)" (walkEnded)="onWalkEnded($event)" (walkCancelled)="cancelPendingInteraction()"
                (bootFailed)="onWorldBootFailed()"
                (roomExit)="onRoomExit($event)"
                (enterRoom)="onDoorTrigger($event)"
                (salaIncompleta)="onSalaIncompleta()"
                (positionChange)="rememberPosition($event.x, $event.y)" />
              <!-- Franjas de cine (bloque M1, regla 7): entran en la decisión y en la reacción; la de abajo aloja el cuadro de diálogo. -->
              <div class="cine cine--arriba" aria-hidden="true" [class.cine--dentro]="cinemaBars()">
                @if (confirmacionEnReaccion(); as texto) {
                  <div class="confirmacion-reaccion"><app-pixel-icono nombre="hecho" />{{ texto }}</div>
                }
              </div>
              <div class="cine cine--abajo" aria-hidden="true" [class.cine--dentro]="cinemaBars() && !dialoguePanel()?.encuadrando()"
                [style.height.px]="cinemaBottomPx()"></div>
            } @else {
              <!-- Solo el fondo: el indicador de carga es .game-boot (un solo estado). #game-area existe siempre. -->
              <div id="game-area" class="world-skeleton" aria-hidden="true"></div>
            }

            <!-- La reacción del personaje tras elegir: franja sobre el mundo, en la sala donde ocurrió (4.3.3). -->
            <app-reaction-director #reaction [escenario]="reactionStage()" [reduceMotion]="reduceMotion()"
              [pausing]="pausing()" (finished)="afterReaction($event)" (safeExit)="pauseFromOverlay()" />

            <!-- Lo que dice un personaje al acercarse (4.6): sobre su cabeza, sin foco ni teclas; se anuncia por el anunciador de la app. -->
            <app-comment-bubble [comment]="comentarioConNombre()" [speaker]="bubbleSpeaker()" [anchor]="bubbleAnchor()"
              [persona]="attempt()?.persona ?? null" [reduceMotion]="reduceMotion()" />

          </section>

          @if (viewMode() === 'dialogue-right') {
            <aside class="right-panel" aria-label="Decisión formativa en curso" (animationend)="refreshWorldScale()">
              <header class="right-panel__scene">
                <h2>{{ visibleNode()?.title }}</h2>
                @if (visibleNode()?.narrative; as narrativa) {
                  <p class="right-panel__narrative" tabindex="0" role="region"
                    aria-label="Contexto narrativo de la etapa">{{ narrativa }}</p>
                }
              </header>
              <app-dialogue-panel class="dialogue-side" mode="side" [reduceMotion]="reduceMotion()"
                [dialogue]="dialogoConNombre()" [world]="world()" [interaction]="selectedInteraction()" [speakerVisual]="speakerVisual()" [nextStep]="guide().siguiente" [finalActionLabel]="dialogueFinalAction()"
                [releaseToken]="dialogueReleaseToken()" [pausing]="pausing()" [hintAttempt]="hintAttempt()" [startAt]="dialogueStart()"
                (close)="closeDialogue()" (safeExit)="pauseFromOverlay()"
                (execute)="executeDecision($event)" (useTool)="useTool($event)"
                (frontendChoice)="handleFrontendChoice($event)" (consentRequired)="requireConsentAgain()" />
            </aside>
          }
          @if (mode() === 'rehearsal' && !rehearsalGone() && rehearsal(); as block) {
            <app-rehearsal-panel [caseVersionId]="game.caseVersionId" [attemptId]="game.attemptId"
              [block]="block" [world]="world()" (adjusted)="reloadRehearsal($event)" (gone)="showRehearsalGone($event)" />
          }
        </div>

        <!-- REGLA-004: mientras el fundido de escena (o la nota de transición) espera al servidor, el pie queda por encima y «Salida segura» se ve y se toca. -->
        <!-- Con el cuadro de diálogo sobre el mundo, el pie se oculta y queda inerte: la franja de abajo es del cuadro. -->
        <footer class="bottom-zone" [class.bottom-zone--above-veils]="footerAboveVeils()"
          [attr.inert]="inputBlocked() || viewMode() === 'dialogue-cinematic' ? '' : null"
          [attr.aria-hidden]="inputBlocked() || viewMode() === 'dialogue-cinematic' ? 'true' : null"
          [class.bottom-zone--bajo-dialogo]="viewMode() === 'dialogue-cinematic'"
          [class.bottom-zone--bajo-reaccion]="reacting()">
          @if (game.status === 'IN_PROGRESS' || reactingToLast()) {
            <!-- La misma implementación que las superposiciones (F6-6, REGLA-004). Sin [disabled]: con una petición
                 en curso el toque se acepta y la pausa sale en el acto (REGLA-004), y el rótulo pasa a «Pausando…»
                 (aria-busy). Sin aria-label: el nombre accesible sale del texto visible (WCAG 2.5.3, axe
                 label-content-name-mismatch); la tecla Esc es aria-hidden. -->
            <app-safe-exit-button variante="placa" [compact]="compactMode()" [pausing]="pausing()" (pause)="pauseFromOverlay()" />
          }
          <!-- Teléfono (≤ 560 px, bloque U1): el chip de contenido sensible baja junto a «Salida segura» y deja más sala a la vista.
               Con ≤ 560 px se oculta el del carril y con más se oculta este (display: none lo saca del árbol de accesibilidad:
               queda uno solo, visible y legible a la vez). -->
          <app-sensitive-notice class="notice-pie" [text]="sensitiveNotice()" [sceneKey]="visibleNode()?.key ?? null" [reduceMotion]="reduceMotion()" />

          <app-tool-inventory class="tool-dock" [tools]="world()?.tools ?? []"
            [attr.inert]="transitionNote() ? '' : null"
            [inventory]="world()?.inventory ?? []"
            [selectedToolCode]="selectedToolCode()"
            (select)="selectTool($event)" />

          <!-- Sin aria-live (H-10): la barra ya no relee la línea de reposo ni la pista de teclas. La interacción
               cercana la anuncia el servicio de regiones vivas (efecto sobre contextLabel). -->
          <div class="context-bar" [attr.inert]="transitionNote() ? '' : null">
            @if (contextAction(); as action) {
              <!-- Un solo botón principal, una línea y altura fija: el mundo no cambia de tamaño al acercarte a algo. -->
              <button type="button" class="context-bar__interaction u-ficha u-sombra"
                [class.context-bar__interaction--exit]="action.obj.type === 'EXIT'"
                [class.context-bar__interaction--locked]="action.verb.locked"
                [attr.data-mundo-foco]="action.obj.key" [attr.aria-disabled]="action.verb.locked ? 'true' : null" [attr.aria-describedby]="action.verb.locked && action.verb.reason ? 'context-door-reason' : null"
                (click)="requestInteraction(action.obj)" [attr.title]="action.title">
                <!-- Sin aria-label: el nombre sale del contenido y empieza por lo que se lee en pantalla (WCAG 2.5.3); «Interactuar:»
                     y «bloqueada:» van solo para lectores, así se oye lo mismo que anuncia la región viva (action.ariaLabel). -->
                @if (!compactMode()) { <kbd class="u-tecla u-tecla--letra" aria-hidden="true">{{ shortcuts.enabled() ? 'E' : 'Enter' }}</kbd> }
                @if (action.verb.locked) { <app-pixel-icono class="context-bar__lock" nombre="candado" /> }
                <span class="context-bar__copy">
                  <span class="ds-sr-only">Interactuar: </span><strong>{{ walkingLabel(action.obj) ?? action.verb.text }}</strong>
                  <!-- BORRADOR: texto pendiente de Psicología. -->
                  <span class="context-bar__step">{{ actionStepLabel(action.obj.key) }}</span>
                  @if (action.verb.locked && action.verb.reason) {
                    <span class="ds-sr-only">, bloqueada: </span><span class="context-bar__reason" id="context-door-reason">{{ action.verb.reason }}</span>
                  }
                </span>
              </button>
              @if (contextAlso(); as also) {
                <button type="button" class="context-bar__interaction context-bar__interaction--secondary u-ficha u-sombra"
                  [class.context-bar__interaction--locked]="also.verb.locked"
                  [attr.data-mundo-foco]="also.obj.key" [attr.aria-disabled]="also.verb.locked ? 'true' : null" [attr.aria-describedby]="also.verb.locked && also.verb.reason ? 'context-door-reason-secondary' : null"
                  (click)="requestInteraction(also.obj)" [attr.title]="also.title" [attr.aria-label]="'También: ' + (walkingLabel(also.obj) ?? also.verb.text) + (actionStepLabel(also.obj.key) ? '. ' + actionStepLabel(also.obj.key) : '')">
                  @if (also.verb.locked) { <app-pixel-icono class="context-bar__lock" nombre="candado" /> }
                  <span class="context-bar__also">También:</span>
                  <strong>{{ walkingLabel(also.obj) ?? also.verb.text }}</strong><span class="context-bar__step">{{ actionStepLabel(also.obj.key) }}</span>@if (also.verb.locked && also.verb.reason) { <span class="context-bar__reason" id="context-door-reason-secondary">{{ also.verb.reason }}</span> }
                </button>
              }
            } @else {
              <div class="context-bar__idle">
                @if (nothingNearbyNote(); as note) {
                  <p class="context-bar__now u-placa">{{ note }}</p>
                }
              </div>
            }
          </div>
        </footer>
        </div>

        @if (viewMode() === 'dialogue-cinematic') {
          <app-dialogue-panel class="dialogue-cinematic" [reduceMotion]="reduceMotion()" [dialogue]="dialogoConNombre()" [world]="world()" [avisoBreve]="softNotice() + (decisionSelection() ? ' ' + decisionSelection() : '')" [interaction]="selectedInteraction()" [speakerVisual]="speakerVisual()" [nextStep]="guide().siguiente" [finalActionLabel]="dialogueFinalAction()"
            [esperarEncuadre]="esperarEncuadre()" [encuadreListo]="gameWorldRef()?.encuadreListo() ?? null"
            [releaseToken]="dialogueReleaseToken()" [pausing]="pausing()" [hintAttempt]="hintAttempt()" [startAt]="dialogueStart()"
            (close)="closeDialogue()" (safeExit)="pauseFromOverlay()"
            (execute)="executeDecision($event)" (useTool)="useTool($event)"
            (frontendChoice)="handleFrontendChoice($event)" (consentRequired)="requireConsentAgain()" />
        }

        @if (controlsVisible()) {
          <!-- Controles (P8): al entrar al caso por primera vez y cuando se pide con «Controles» o «?». Modal (foco atrapado), Esc
               la cierra sin pausar el caso, y deja libres la cabecera y el pie («Salida segura» sigue operable, REGLA-004). -->
          <div class="help-layer help-layer--controles">
            <app-game-help view="welcome" [modality]="helpModality()" [safeExitPromise]="safeExitPromise"
              [shortcuts]="shortcuts.enabled()" (dismissed)="closeControls()" (openFull)="openHelpFromControls()" />
          </div>
        }

        @if (helpOpen()) {
          <!-- Pantalla «Cómo se juega»: encima del mundo pero sin cubrir la cabecera ni el pie, que siguen operables. -->
          <div class="help-layer">
            <app-game-help view="screen" [modality]="helpModality()" [safeExitPromise]="safeExitPromise" [shortcuts]="shortcuts.enabled()"
              (closed)="helpOpen.set(false)" />
          </div>
        }

        @if (journalOpen()) {
          <div class="overlay-backdrop" aria-hidden="true" (click)="journalOpen.set(false)"></div>
        }
        @if (placesOpen()) {
          <!-- «Ir a…» (F6-11): modal, con SU «Salida segura»; la cabecera, el mundo y el pie quedan inertes. -->
          <div class="overlay-backdrop" aria-hidden="true" (click)="closePlaces()"></div>
          <app-world-places-list [places]="placeOptions()" [doorMessages]="doorMessages()" [walkingKey]="pendingWalkInteraction()?.key ?? null" [pausing]="pausing()"
            (choose)="choosePlace($event)" (closed)="closePlaces()" (safeExit)="pauseFromOverlay()" />
        }
        @if (planOpen() && placePlan(); as plano) {
          <!-- Plano del lugar (bloque M1): modal como «Ir a…»; el mundo queda en pausa y la cámara quieta. -->
          <div class="overlay-backdrop" aria-hidden="true" (click)="closePlan()"></div>
          <app-plano-completo [plano]="plano" [actual]="placeRoom()" [destino]="placeTarget()" [pausing]="pausing()"
            (closed)="closePlan()" (safeExit)="pauseFromOverlay()" />
        }
        <app-journal-panel #journalPanel class="journal-layer" [open]="journalOpen()"
          [disabled]="game.status !== 'IN_PROGRESS' || busy()" [message]="journalMessage()"
          [saveState]="journalSaveState()"
          [timeline]="visitedStageLabels()"
          [resources]="supportResources()" [pausing]="pausing()"
          (save)="saveReflection($event)" (closeSheet)="journalOpen.set(false)"
          (safeExit)="pauseFromOverlay()" />

        <!-- Screen-reader narrative route -->
        <section class="sr-narrative-route" aria-label="Ruta narrativa accesible">
          <h2 class="sr-only">Escena: {{ game.currentNode.title }}</h2>
          <p class="sr-only">{{ game.currentNode.narrative }}</p>
          @if (game.currentNode.warningMessage) {
            <p class="sr-only" role="alert">Advertencia: {{ game.currentNode.warningMessage }}</p>
          }
          @if (game.currentNode.sensitiveContent) {
            <p class="sr-only" role="note">Contenido sensible. Puedes pausar el caso con el botón «Salida segura» o con la tecla Escape.</p>
          }
          <div class="sr-only">Estado: {{ statusLabelA11y(game.status) }}. La persona usuaria {{ game.persona.label }}.</div>
        </section>

        @if (!holdingOutcome() && !reactingToLast()) {
          <app-attempt-outcome [report]="game.completionReport" [status]="game.status"
            [revision]="revisionDelCierre()" [nombre]="nombreDeQuienJuega()"
            [supportResources]="supportResources()" [pauseNote]="pauseNote()" [positionNote]="pausePositionNote()"
            [mode]="mode()" [caseVersionId]="game.caseVersionId"
            [reviewAttemptId]="game.status === 'COMPLETED' && mode() !== 'rehearsal' ? game.attemptId : null"
            (retry)="startNewAttempt()" (resume)="resumeCurrentAttempt()" />
        }

        <div class="scene-fade" [class.scene-fade--active]="fadeActive()" aria-hidden="true"></div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: block; }
    .game-container {
      --sim-purple: #7C4DFF; /* legado sin token (como --sim-blue, superficies, borde y brillo): lo retira F6-1 */
      --sim-lavender: var(--ds-primary);
      --sim-blue: #6CC0C7;
      --sim-green: var(--ds-success);
      --sim-orange: var(--ds-warning-text);
      --sim-red: var(--ds-danger);
      --sim-ink: var(--ds-text-1);
      --sim-ink-soft: rgba(244,247,251,.74);
      --sim-ink-mute: rgba(244,247,251,.5);
      --sim-surface: rgba(27,33,51,.72);
      --sim-surface-2: rgba(18,24,42,.6);
      --sim-border: rgba(182,156,255,.22);
      --sim-glow: 0 18px 48px -28px rgba(124,77,255,.6);
      position: fixed;
      inset: 0;
      display: grid;
      /* Bloque U1, variante B: el mundo a sangre; la cabecera y el pie son capas sobre él (misma celda de la rejilla). */
      grid-template-rows: minmax(0, 1fr);
      /* La columna explícita clampa el track al viewport: sin ella, el
         min-content de la bottom-zone (dock + salida segura) ensancha el track
         implícito y desborda canvas + objective-card en mobile. */
      grid-template-columns: minmax(0, 1fr);
      overflow: hidden;
      color: var(--sim-ink);
      background:
        linear-gradient(90deg, rgba(124,77,255,.05) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(rgba(124,77,255,.05) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(180deg, #111827 0%, #0e1322 100%);
    }

    /* Eyebrow sobre las tarjetas oscuras del juego: el primario de la piel (#B69CFF = 7,7:1 sobre #12182A). */
    .game-container .psy-eyebrow { color: var(--ds-primary); }

    /* ── Top bar ─────────────────────────────────────────────────────────── */
    .top-bar, .main-zone, .bottom-zone { grid-row: 1; grid-column: 1; }
    .top-bar { z-index: var(--ds-z-cabecera); align-self: start; pointer-events: none; }
    .top-bar > .rehearsal-banner { pointer-events: auto; }
    .top-bar__fila { display: flex; align-items: flex-start; gap: var(--pixel-borde); padding: var(--pixel-borde); }
    /* El grupo de la derecha: el HUD y, debajo, el minimapa. La capa deja pasar el puntero; solo sus hijos lo reciben. */
    /* Puede encogerse (y la pestaña del caso se corta con puntos suspensivos): con un título largo, su ancho de contenido
       (el título entero) empujaba el grupo fuera de la cabecera; en el ensayo caía sobre el panel de autora (crítica r2). */
    .top-bar__derecha { flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; gap: calc(2 * var(--pixel-px)); pointer-events: none; }
    .top-bar__derecha > * { pointer-events: auto; max-width: 100%; }
    /* El chip de contenido sensible del pie solo existe en teléfono (≤ 560 px): en el resto, el del carril. */
    .notice-pie { display: none; }
    /* El hueco mide lo que la ficha del objetivo: el carril nunca cae sobre ella (antes el aviso de puerta la tapaba). */
    .top-bar__hueco { flex: none; width: min(440px, 33%); }
    .carril { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(3 * var(--pixel-px)); pointer-events: none; }
    .carril > * { pointer-events: auto; max-width: 100%; }
    /* Cabecera y pie bajo una capa o un diálogo lateral (inert): se ven apagados, no «vivos pero muertos» (F6-1).
       El mundo no se atenúa con un diálogo lateral abierto: sigue siendo el contexto de lo que se decide. */
    .top-bar[inert], .bottom-zone[inert] {
      /* Apagadas pero opacas: con opacidad, el plano y las placas dejaban ver a través las personas y los rótulos del
         mundo (B, V4: «el plano translúcido»). */
      filter: saturate(.6) brightness(.6);
      transition: filter var(--ds-dur-fade) var(--ds-ease-out);
    }

    /* ── Main zone: canvas + optional right panel ────────────────────────── */
    .main-zone {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      min-height: 0;
      padding: 0;
    }
    .game-container[data-mode='dialogue-right'] .main-zone {
      grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 480px);
    }
    /* Ensayo: el panel de autora es la última columna (fila 1); sin ella la rejilla lo pone primero y manda el mundo a una fila sin alto. */
    .game-container[data-rehearsal] .main-zone {
      grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 340px);
    }
    .game-container[data-rehearsal][data-mode='dialogue-right'] .main-zone {
      grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 480px) clamp(280px, 24vw, 340px);
    }
    /* Ensayo: el HUD, el plano y el pie flotan sobre el mundo, no sobre el panel de autora (antes, a 1366, el grupo de la
       derecha y la barra de acción tapaban «Lo explorado» y sus casillas). Dejan libre la columna del panel y su hueco. */
    .game-container[data-rehearsal] .top-bar,
    .game-container[data-rehearsal] .bottom-zone { margin-right: calc(clamp(280px, 24vw, 340px) + 10px); }
    @media (max-width: 760px) {
      .game-container[data-rehearsal] .main-zone,
      .game-container[data-rehearsal][data-mode='dialogue-right'] .main-zone { grid-template-columns: minmax(0, 1fr); }
      .game-container[data-rehearsal] .top-bar,
      .game-container[data-rehearsal] .bottom-zone { margin-right: 0; }
    }
    /* Ensayo en pantalla ancha: la cabecera termina antes del panel de autora y no le cabe el carril entre la ficha y el
       grupo de la derecha; el carril (aviso sensible, aviso breve, rótulo) baja a su propia fila, centrado. */
    @media (min-width: 761px) {
      .game-container[data-rehearsal] .top-bar__fila { flex-wrap: wrap; }
      .game-container[data-rehearsal] .carril { order: 3; flex: 1 1 100%; }
      /* En su fila el aviso desplegado no se tiende de lado a lado sobre el mundo: el ancho del carril de siempre. */
      .game-container[data-rehearsal] .carril > * { max-width: min(520px, 100%); }
      .game-container[data-rehearsal] .top-bar__derecha {
        margin-left: auto; max-width: calc(100% - min(440px, 33%) - var(--pixel-borde));
      }
    }
    .canvas-zone {
      position: relative;
      min-height: 0;
      overflow: hidden;
      background: var(--pixel-cine);
    }
    .game-surface { position: absolute; inset: 0; }
    /* Franjas de cine (bloque M1): se deslizan desde los bordes; no reciben el puntero ni escalan con la cámara. */
    .cine {
      position: absolute; left: 0; right: 0; z-index: var(--ds-z-elevado); pointer-events: none;
      background: var(--ds-surface-page);
      transition: transform 560ms cubic-bezier(.22, 1, .36, 1);
    }
    .cine--arriba { top: 0; height: clamp(28px, 8%, 72px); transform: translateY(-101%); }
    .confirmacion-reaccion {
      height: 100%; padding-inline: var(--pixel-borde); display: flex; align-items: center;
      gap: calc(3 * var(--pixel-px)); color: var(--pixel-tinta); font-size: var(--pixel-tam); font-weight: 600;
    }
    @media (max-width: 760px) { .confirmacion-reaccion { display: none; } }
    .cine--abajo { bottom: 0; min-height: clamp(28px, 8%, 72px); transform: translateY(101%); }
    .cine--dentro { transform: none; }
    .cine:not(.cine--dentro) { transition-duration: 440ms; }
    .game-container--reduce-motion .cine { transition: none; }
    @media (prefers-reduced-motion: reduce) { .cine { transition: none; } }
    .world-skeleton { position: absolute; inset: 0; background: #0e1322; }

    /* Envoltorio de la ficha del objetivo (U1): solo posición y tope de alto; la pestaña de la etapa y la placa la pintan
       las piezas de la hoja común. Arriba a la izquierda, del ancho del hueco de la cabecera. */
    .objective-card {
      position: absolute;
      top: var(--pixel-borde);
      left: var(--pixel-borde);
      z-index: var(--ds-z-pegajoso);
      width: min(440px, 33%);
      /* Tope de alto: sin él la lista desplegada bajaba sobre el kit y la Familia en crisis, que nacen en el tercio inferior. */
      max-height: min(calc(100% - 24px), 66%);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow: hidden;
    }
    .objective-card__etapa { flex: none; }
    /* Ensayo: la franja «Ensayo del borrador» ocupa la cima de la cabecera; la ficha baja lo mismo y su pestaña no queda
       debajo de la franja (crítica r2). */
    @media (min-width: 761px) {
      .game-container[data-rehearsal] .objective-card { top: calc(var(--pixel-borde) + var(--alto-franja-ensayo)); }
    }
    /* Decisión con franjas de cine: la franja de arriba queda limpia (el HUD sigue). */
    .game-container--cine .objective-card { visibility: hidden; }
    /* Con franjas, la fila de arriba se pega al borde y el grupo de la derecha deja la pestaña del caso: cabe en la franja
       negra (8 % del alto) sin bajar sobre la sala. Las teclas siguen, con la misma conducta. */
    .game-container--cine .top-bar__fila { padding-top: 0; }
    .game-container--cine .top-bar__derecha ::ng-deep .hud-case { display: none; }
    .objective-card__scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }

    /* Ayuda: capa que deja libres la tira del HUD y el pie (--alto-pie); la fila mide la capa (sin ella crecía con la hoja
       y la hoja salía por abajo), la hoja se encoge a ella y, si no le cabe, va en páginas (V6). */
    .help-layer {
      position: absolute; left: 0; right: 0; top: clamp(64px, 12vh, 120px); bottom: calc(var(--alto-pie, 88px) + 8px);
      z-index: 90; display: grid; grid-template-rows: minmax(0, 1fr); place-items: center; padding: 8px 12px; pointer-events: none;
    }
    .help-layer app-game-help { display: flex; flex-direction: column; width: min(640px, 100%); max-height: 100%; pointer-events: auto; }
    .help-layer ::ng-deep .help-screen { max-height: 760px; min-height: 0; }

    /* ── Right panel (solo en dialogue-right) ────────────────────────────── */
    .right-panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
      border: 1px solid var(--sim-border);
      border-radius: 16px;
      overflow: hidden;
      background: var(--sim-surface);
      backdrop-filter: blur(18px) saturate(120%);
      box-shadow: var(--sim-glow);
      animation: panel-in 180ms cubic-bezier(.2,.8,.2,1) both;
    }
    .right-panel__scene {
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--sim-border);
      background: rgba(124,77,255,.08);
    }
    .right-panel__scene h2 { margin: 0; font-size: 1.02rem; line-height: 1.2; color: var(--sim-ink); }
    .right-panel__narrative {
      margin: 8px 0 0;
      max-height: 88px;
      overflow-y: auto;
      color: var(--sim-ink-soft);
      font-size: .78rem;
      line-height: 1.5;
    }
    .dialogue-side { display: block; min-height: 0; overflow: hidden; }

    /* ── Bottom zone: salida segura + dock + contexto ────────────────────── */
    /* Altura FIJA: acercarte a algo cambia el texto del pie, nunca su tamaño (el mundo no salta; TOUCH-04). */
    /* El pie es una capa sobre el mundo (U1): «Salida segura» y las herramientas a la izquierda, la acción cercana a la
       derecha; en medio se ve la sala y el puntero pasa al mundo. */
    .bottom-zone {
      align-self: end;
      display: flex;
      align-items: flex-end;
      gap: calc(4 * var(--pixel-px));
      box-sizing: border-box;
      padding: var(--pixel-borde);
      z-index: var(--ds-z-cabecera);
      pointer-events: none;
      --alto-boton: calc(28 * var(--pixel-px));
    }
    .bottom-zone > * { pointer-events: auto; }
    /* Con el fundido de escena (z 200) o la nota de transición (z 340) a pantalla completa, el pie sube por encima:
       «Salida segura» nunca queda tapada mientras una puerta o una decisión esperan al servidor (REGLA-004). */
    .bottom-zone--above-veils { z-index: 350; }
    /* Con el cuadro de diálogo sobre el mundo, la franja de abajo es del cuadro, que trae su «Salida segura» y sus fichas
       (con el diálogo abierto el pie ya era inerte y el dock no hace nada): el pie se oculta en vez de quedar debajo, sin
       dejar hueco (visibility, no display: el lienzo no cambia de tamaño al abrir y cerrar). */
    .bottom-zone--bajo-dialogo { visibility: hidden; }
    /* Lo mismo durante la reacción: la franja ocupa la banda de abajo y trae su «Salida segura» (antes la tapaba y solo
       asomaba un filo); un solo botón a la vista y en el árbol de accesibilidad. */
    .bottom-zone--bajo-reaccion { visibility: hidden; }
    /* «Salida segura» del pie es app-safe-exit-button (F6-6): su forma vive en el componente; aquí solo su sitio. */
    .bottom-zone > app-safe-exit-button { flex-shrink: 0; }
    .tool-dock { display: block; min-width: 0; flex: 0 1 auto; }
    /* La acción cercana (U1): fichas del cuadro de diálogo, una principal y, más baja, la secundaria. La barra deja pasar el
       puntero al mundo; solo sus fichas lo reciben. */
    .context-bar {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: calc(4 * var(--pixel-px));
      min-width: 0;
      min-height: 0;
      font-family: var(--pixel-f-texto);
      font-size: var(--pixel-tam);
      pointer-events: none;
    }
    .context-bar > * { pointer-events: auto; }
    /* Sin overflow: la sombra de tramado de la ficha cuelga por debajo; el recorte con elipsis lo hace cada texto. */
    .context-bar__interaction {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: calc(4 * var(--pixel-px));
      min-width: 0;
      max-width: 100%;
      max-height: 100%;
      min-height: 44px;
      padding: calc(2 * var(--pixel-px)) calc(6 * var(--pixel-px)) calc(3 * var(--pixel-px)) calc(4 * var(--pixel-px));
      text-align: left;
    }
    /* La puerta bloqueada se dice con el candado y el motivo (forma y texto, no solo color); la de salida, con su verbo. */
    .context-bar__interaction--exit, .context-bar__interaction--locked { font-weight: 700; }
    /* La tecla E solo se rotula con teclado y puntero fino: en táctil el botón basta. */
    @media not all and (hover: hover) and (pointer: fine) {
      .context-bar__interaction kbd { display: none; }
    }
    .context-bar__lock { flex: none; color: var(--pixel-ambar); }
    .context-bar__copy { display: grid; gap: var(--pixel-px); justify-items: start; min-width: 0; }
    .context-bar__step { font-size: 12px; line-height: 1.25; color: var(--pixel-tinta); white-space: normal; }
    .context-bar__copy strong {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      line-height: 1.25;
    }
    /* El motivo de la puerta bloqueada: ámbar sobre su fondo, como el aviso de ficha «Aún no tienes esta herramienta». */
    .context-bar__reason {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: var(--pixel-px) calc(2 * var(--pixel-px));
      background: var(--pixel-ambar-fondo);
      color: var(--pixel-ambar);
      font-size: var(--pixel-letra-chica);
      font-weight: 700;
      line-height: 1.3;
    }
    /* Segundo candidato en rango: una ficha más baja; la tecla E siempre actúa sobre el principal. */
    .context-bar__interaction--secondary {
      flex: 0 1 40%; min-width: 96px; gap: calc(3 * var(--pixel-px));
      padding: var(--pixel-px) calc(4 * var(--pixel-px)) calc(2 * var(--pixel-px));
      flex-wrap: wrap;
    }
    .context-bar__interaction--secondary strong {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--pixel-letra-chica); font-weight: 600;
    }
    .context-bar__also { flex: none; font-size: var(--pixel-letra-chica); font-weight: 700; color: var(--pixel-tinta-suave); }
    /* Sin nada cerca la barra queda en blanco; solo dice «No hay nada a tu alcance» mientras dure la nota (una placa que no se toca). */
    .context-bar__idle { flex: 1; min-width: 0; display: grid; gap: 2px; justify-items: start; align-content: center; text-align: left; pointer-events: none; }
    .context-bar__now {
      min-width: 0;
      margin: 0;
      padding: calc(2 * var(--pixel-px)) calc(5 * var(--pixel-px)) calc(3 * var(--pixel-px));
      overflow: hidden;
      font-weight: 700;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      pointer-events: none;
    }

    /* Advertencia de contenido (ETH-01): variante del card de intro. */
    .case-intro-overlay.content-warning-overlay { z-index: 395; }
    .case-intro-card.content-warning-card { width: min(640px, 100%); }

    .case-intro-overlay {
      position: absolute;
      inset: 0;
      z-index: 380;
      display: grid;
      place-items: center;
      padding: clamp(14px, 4vw, 32px);
      background:
        radial-gradient(circle at 50% 20%, rgba(124,77,255,.16), transparent 40%),
        rgba(5,8,14,.9);
      animation: case-intro-fade var(--ds-dur-fade) var(--ds-ease-out) both;
    }
    .case-intro-card {
      animation: case-intro-rise var(--ds-dur-base) var(--ds-ease-out) both;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      width: min(760px, 100%);
      max-height: min(86vh, 720px);
      border: 1px solid rgba(182,156,255,.34);
      border-radius: 18px;
      overflow: hidden;
      color: var(--sim-ink);
      background: linear-gradient(180deg, rgba(18,24,42,.96), rgba(8,12,18,.98));
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.04),
        0 28px 80px -36px rgba(124,77,255,.75);
    }
    .case-intro-card__header {
      display: grid;
      gap: 8px;
      padding: clamp(18px, 4vw, 28px) clamp(18px, 4vw, 32px) 16px;
      border-bottom: 1px solid rgba(182,156,255,.18);
      background: rgba(124,77,255,.08);
    }
    .case-intro-card__header h2 {
      margin: 0;
      font-size: clamp(var(--ds-type-h3-size), 3.6vw, var(--ds-type-h2-size));
      line-height: 1.15;
      color: #fff;
    }
    /* Chip del aviso de consentimiento. Clase propia: un selector por etiqueta del encabezado
       también alcanzaría al texto del botón de silenciar. */
    .case-intro-card__chip {
      width: fit-content;
      padding: 5px 10px;
      border: 1px solid rgba(108,192,199,.32);
      border-radius: 999px;
      color: #bdeef2;
      background: rgba(108,192,199,.1);
      font-size: var(--ds-type-caption-size);
      font-weight: 800;
      letter-spacing: .04em;
    }
    .intro-music-toggle { width: fit-content; }
    .intro-music-toggle mat-icon { width: 18px; height: 18px; font-size: 18px; }
    @keyframes case-intro-fade { from { opacity: 0; } }
    @keyframes case-intro-rise { from { opacity: 0; transform: translateY(var(--ds-space-3)); } }
    /* Con movimiento reducido solo el fundido: nada se desplaza. */
    @media (prefers-reduced-motion: reduce) { .case-intro-card { animation-name: case-intro-fade; } }
    .case-intro-card__body {
      min-height: 0;
      overflow-y: auto;
      padding: 20px clamp(18px, 4vw, 34px);
      scrollbar-color: rgba(182,156,255,.45) rgba(255,255,255,.06);
    }
    .case-intro-card__body:focus-visible {
      outline: 2px solid rgba(108,192,199,.75);
      outline-offset: -4px;
    }
    .case-intro-card__body p {
      margin: 0 0 14px;
      color: rgba(244,247,251,.84);
      font-size: clamp(var(--ds-type-body-s-size), 2vw, var(--ds-type-body-size));
      line-height: 1.7;
    }
    .case-intro-card__body p:last-child { margin-bottom: 0; color: #f3dfb5; }
    .case-intro-card__actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px clamp(18px, 4vw, 32px);
      border-top: 1px solid rgba(182,156,255,.18);
      background: rgba(5,8,14,.62);
    }
    .case-intro-card__actions > span {
      color: rgba(244,247,251,.58);
      font-size: var(--ds-type-caption-size);
      line-height: 1.4;
    }
    .case-intro-card__actions .u-boton {
      flex-shrink: 0;
      min-width: 140px;
    }
    /* «Salida segura» a la izquierda de «Continuar»: nunca se queda atrás cuando el texto de apoyo crece. */
    .case-intro-card__buttons {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    /* ── Overlays ────────────────────────────────────────────────────────── */
    .dialogue-cinematic { position: absolute; bottom: 0; left: 0; right: 0; z-index: 60; }
    /* Ensayo: el cuadro sobre el mundo termina antes de la columna de autora (su ancho más el hueco y el margen de la rejilla). */
    .game-container[data-rehearsal] .dialogue-cinematic { right: calc(clamp(280px, 24vw, 340px) + 22px); }
    @media (max-width: 760px) { .game-container[data-rehearsal] .dialogue-cinematic { right: 0; } }
    .overlay-backdrop {
      position: absolute; inset: 0; z-index: 95;
      background: rgba(8,12,18,.62);
      backdrop-filter: blur(3px);
      animation: fade-in 180ms ease both;
    }
    .scene-fade {
      position: fixed; inset: 0; z-index: 200; background: #0a0f14; opacity: 0;
      pointer-events: none; transition: opacity 320ms ease;
    }
    .scene-fade--active { opacity: 1; pointer-events: auto; }
    /* Arranque y fallo (F6-1): ocupan SOLO la zona del mundo (fila 2 de la rejilla). La cabecera y el pie —con
       «Salida segura»— quedan a la vista y operables mientras carga o falla (REGLA-004). */
    .game-failure {
      grid-area: 2 / 1; z-index: 300;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: var(--ds-space-3); padding: var(--ds-space-5);
      background: var(--ds-surface-page); color: var(--ds-text-1); text-align: center;
    }
    .game-failure ui-error-state { max-inline-size: 28rem; }
    .game-container[data-rehearsal] { --alto-franja-ensayo: 30px; }
    .rehearsal-banner { box-sizing: border-box; height: var(--alto-franja-ensayo); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 21px; margin: 0; padding: 4px 12px; font-size: .85rem; text-align: center; background: var(--ds-surface-2, rgba(18,24,42,.9)); color: var(--ds-text-1); border-block-end: 1px solid var(--ds-border, rgba(182,156,255,.3)); }
    /* Aviso no esencial («Obtuviste: …»): quieto, sin animación, sobre el pie. */
    .soft-notice, .room-banner {
      display: flex; align-items: center; gap: calc(4 * var(--pixel-px)); min-height: 44px;
      padding: var(--pixel-px) calc(5 * var(--pixel-px)) calc(2 * var(--pixel-px));
      font-size: var(--pixel-tam); font-weight: 600; line-height: 1.35; pointer-events: none;
    }
    [data-placa-flotante] { position: relative; }
    [data-placa-flotante]:not([data-ubicada]) { visibility: hidden; }
    /* Acuse de la salida segura con una capa abierta: placa con la tinta de la brasa, arriba al centro (carril). */
    .pausing-notice {
      position: absolute; top: var(--pixel-borde); left: 50%; transform: translateX(-50%); z-index: var(--ds-z-maximo);
      display: flex; align-items: center; gap: calc(4 * var(--pixel-px));
      width: max-content; max-width: min(92vw, 520px); min-height: 44px;
      padding: var(--pixel-px) calc(5 * var(--pixel-px)) calc(2 * var(--pixel-px));
      color: var(--pixel-brasa-tinta); font-size: var(--pixel-tam); font-weight: 700; letter-spacing: .02em;
    }
    /* El rótulo de la sala al entrar, en el carril: la etapa en la letra de las pestañas, con la luz de la sala. */
    .room-banner { font-family: var(--pixel-f-nombre); font-weight: 700; color: var(--luz); animation: room-banner-in 260ms ease; }
    @keyframes room-banner-in { from { opacity: 0; transform: translateY(-8px); } }
    @keyframes room-banner-in-centered { from { opacity: 0; transform: translate(-50%, -8px); } }
    /* Tarjeta de capítulo (U1): su forma vive en app-nota-transicion (tope de 20 kB); aquí solo su sitio en la pila de
       capas. El pie sube por encima del velo (REGLA-004, .bottom-zone--above-veils). */
    .transition-note { position: fixed; inset: 0; z-index: 340; }
    /* «Reanudar» es la misma entrada que las otras tres (F6-2): por encima de ellas y sin el CSS propio que tenía. */
    .case-intro-overlay--resume { z-index: 400; }
    .case-intro-card--entry { width: min(560px, 100%); }

    /* Las entradas en placas de pixel (U1, crítica r2) viven en la hoja común, src/styles/components/_pixel.scss. */
    /* ETH-01: el error del registro del consentimiento vive en app-error-consentimiento (tope de 20 kB). */

    @keyframes panel-in {
      from { opacity: 0; transform: translateX(14px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ── Mobile: panel derecho como bottom sheet, dock scrolleable ───────── */
    @media (max-width: 760px) {
      /* Bloque U1 (variante B): la ficha del objetivo pasa a lo ancho y baja bajo el HUD (--alto-hud); la cabecera se
         apila (HUD y minimapa primero, el hueco igual de alto que la ficha, el carril centrado debajo) para que ni el
         carril ni el HUD caigan sobre ella. Las alturas las mide un ResizeObserver y las publica .game-container. */
      .main-zone { padding: 0; }
      .top-bar__fila { flex-direction: column; align-items: stretch; }
      .top-bar__derecha { order: -1; width: 100%; }
      .top-bar__hueco { width: 100%; height: var(--alto-objetivo, 0px); }
      .carril { flex: none; }
      .game-container[data-mode='dialogue-right'] .main-zone {
        grid-template-columns: minmax(0, 1fr);
      }
      .right-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        max-height: 62vh;
        z-index: 80;
        border-radius: 18px 18px 0 0;
        animation: sheet-up 200ms cubic-bezier(.2,.8,.2,1) both;
      }
      .objective-card {
        top: calc(2 * var(--pixel-borde) + var(--alto-hud, 0px));
        left: var(--pixel-borde);
        right: var(--pixel-borde);
        width: auto;
      }
      /* En vertical el pie tiene dos filas de altura fija (salida y herramientas; mensaje): tampoco crece. */
      .bottom-zone { flex-wrap: wrap; height: auto; padding: 6px 8px 8px; }
      /* El dock cede ancho (flex-basis 0) y scrollea por dentro: nunca debe
         empujar el ancho de la página. */
      .tool-dock { flex: 1 1 0; }
      .context-bar { justify-content: center; flex-basis: 100%; order: 3; height: 44px; }
      .context-bar__idle { text-align: center; }
      .case-intro-overlay { padding: 10px; }
      .case-intro-card { max-height: 90vh; border-radius: 14px; }
      .case-intro-card__actions {
        display: grid;
        justify-items: stretch;
      }
      .case-intro-card__actions .u-boton { width: 100%; }
      /* El principal arriba y «Salida segura» debajo, cada uno en su fila. */
      .case-intro-card__buttons { flex-direction: column-reverse; align-items: stretch; }
    }
    /* Teléfono (≤ 560 px, U1): más sala a la vista. El chip de contenido sensible baja al pie (junto a «Salida segura»);
       del minimapa quedan sus dos botones (sin la imagen ni la pestaña del lugar); la ficha del objetivo, sin kicker. */
    @media (max-width: 560px) {
      .carril > app-sensitive-notice { display: none; }
      .notice-pie { display: block; flex: 0 1 auto; min-width: 0; max-width: 100%; }
      /* El plano sigue a la vista y se abre con el dedo (en el teléfono no hay tecla M); solo se va la pestaña del lugar,
         como hoy el HUD no muestra el lugar bajo 960 px. */
      .top-bar__derecha ::ng-deep .minimapa__lugar { display: none; }
      .top-bar__derecha ::ng-deep .minimapa__abrir { width: 120px; }
      /* El plano y sus dos teclas en una fila (no apilados): «Ocultar plano» y «Vista cercana» quedan como teclas de icono
         de 44 px; su texto sale de la vista pero sigue en el nombre accesible. */
      .top-bar__derecha ::ng-deep app-minimapa { grid-auto-flow: column; align-items: start; }
      .top-bar__derecha ::ng-deep .minimapa__alternar {
        display: grid; place-items: center; min-width: 44px; min-height: 44px; padding: 0;
      }
      .top-bar__derecha ::ng-deep .minimapa__texto {
        position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
        clip: rect(0 0 0 0); white-space: nowrap; border: 0;
      }
      /* El pie en el orden del DOM: «Salida segura» y el chip (en la misma fila si caben), las cinco herramientas a lo ancho
         y la acción cercana debajo. Nada desborda: cada fila cabe en 360 px. */
      .bottom-zone { align-content: flex-end; row-gap: calc(3 * var(--pixel-px)); }
      .notice-pie { align-self: center; }
      .tool-dock { flex: 1 1 100%; }
    }
    @keyframes sheet-up {
      from { transform: translateY(40px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }

    /* ── Modo compacto (F§7.9): pantallas bajas o táctil horizontal ───────────
       Va después del bloque móvil: un móvil horizontal de 667x375 cumple los dos y manda este. */
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      /* Pie de altura fija de una sola fila: sin teclas ni leyenda, y el mundo no cambia de tamaño al acercarte a algo. */
      .bottom-zone { flex-wrap: nowrap; align-items: center; height: 56px; padding: 4px 12px; gap: 8px; }
      /* Las cinco herramientas conservan su sitio; la barra cede (elipsis) cuando el motivo de una puerta es largo. */
      .tool-dock { flex: 0 1 220px; min-width: 70px; overflow: hidden; }
      .top-bar__hueco { display: none; }
      .main-zone { margin-top: 64px; margin-bottom: 64px; }
      .context-bar { min-width: 0; flex: 1 1 0; order: 0; height: 100%; justify-content: flex-end; }
      .context-bar__interaction { min-height: 44px; padding: 3px 10px; }
      /* El secundario pierde el prefijo visible («También:») para que quepa el verbo; su nombre accesible lo conserva. */
      .context-bar__interaction--secondary { flex-basis: 30%; min-width: 110px; }
      .context-bar__also { display: none; }
      .context-bar__idle { text-align: left; }
      .context-bar__now { font-size: var(--pixel-letra-chica); line-height: 1.25; }
      /* Avisos por encima del pie más bajo, sin tapar la mitad del mundo. */

      /* Desplegada, la tarjeta deja libre la cruz de movimiento (abajo a la izquierda) y se sostiene a la derecha de ella.
         Plegada (chip) sigue en la esquina. */
      .objective-card:not(:has(app-scene-goal-card[data-collapsed='true'])) {
        left: 176px; right: auto; width: min(640px, calc(100% - 190px));
        flex-direction: row; align-items: flex-start; gap: 10px;
        /* Sin el tope del escritorio: la tarjeta ya es ancha y baja, y la lista cabe con su paso siguiente. */
        max-height: calc(100% - 20px);
      }
      .objective-card:not(:has(app-scene-goal-card[data-collapsed='true'])) .objective-card__scroll {
        flex: 1 1 0; min-width: 0;
      }

      /* Decisión: hoja inferior flotante. El mundo conserva su tamaño (una sola columna) y el resumen de la etapa
         se oculta: las opciones 1 a 3 tienen que verse y tocarse sin desplazar (TOUCH-01). */
      .game-container[data-mode='dialogue-right'] .main-zone { grid-template-columns: minmax(0, 1fr); }
      .right-panel {
        position: fixed; left: 0; right: 0; bottom: 0; top: auto;
        max-height: calc(100% - 52px);
        z-index: 80;
        grid-template-rows: minmax(0, 1fr);
        border-radius: 16px 16px 0 0;
        animation: sheet-up 200ms cubic-bezier(.2,.8,.2,1) both;
      }
      .game-container[data-mode='dialogue-right'] .right-panel__scene { display: none; }

      /* Introducción y contexto: cabecera en dos líneas, pie fijo con «Continuar» y «Salida segura»,
         y un degradado al pie del texto que avisa de que hay más debajo. */
      .case-intro-overlay { padding: 8px 12px; }
      .case-intro-card { max-height: 100%; border-radius: 14px; }
      .case-intro-card__header {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas: 'eyebrow extra' 'title extra';
        align-items: center;
        gap: 0 12px;
        padding: 8px 16px;
      }
      .case-intro-card__header .psy-eyebrow { grid-area: eyebrow; margin: 0; }
      .case-intro-card__header h2 { grid-area: title; font-size: var(--ds-type-lead-size); }
      .case-intro-card__header .case-intro-card__chip,
      .case-intro-card__header .intro-music-toggle { grid-area: extra; }
      .case-intro-card__header .case-intro-card__chip { padding: 3px 9px; }
      .case-intro-card__header .intro-music-toggle { min-height: 44px; }
      .case-intro-card__body { padding: 10px 16px 28px; }
      .case-intro-card__body p { margin-bottom: 8px; font-size: var(--ds-type-body-s-size); line-height: 1.5; }
      .case-intro-card__actions { position: relative; }
      .case-intro-card__actions::before {
        content: ''; position: absolute; left: 0; right: 0; top: -26px; height: 26px; pointer-events: none;
        background: linear-gradient(180deg, rgba(18,24,42,0), rgba(5,8,14,.94));
      }
      .case-intro-card__actions { padding: 8px 16px; gap: 10px; }
    }
    /* Interruptor «Movimiento reducido» del juego (Ajustes): apaga también las animaciones y transiciones CSS de la pantalla y
       de todos sus componentes (sheet-up, panel-in, choice-in, door-notice-in, tool-pop, fade-in…), igual que la regla global de
       prefers-reduced-motion (styles.scss). Antes solo valía el ajuste del sistema. */
    .game-container--reduce-motion,
    .game-container--reduce-motion ::ng-deep *,
    .game-container--reduce-motion ::ng-deep *::before,
    .game-container--reduce-motion ::ng-deep *::after {
      animation-delay: 0ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-delay: 0ms !important;
      transition-duration: 0.01ms !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .scene-fade { transition: none; }
      .right-panel, .overlay-backdrop { animation: none; }
      .room-banner { animation: none; }
    }

    /* ── El umbral (DISENO §4.4, B4b) ─────────────────────────────────────────────────────────────────────────────
       Las capas del mundo no tienen caja propia: el envoltorio solo sirve para volverlas inertes de una vez. */
    .capas-del-mundo { display: contents; }
    /* Con el umbral a la vista, las tarjetas de entrada se posan sobre su mitad de abajo, como una hoja y sin su velo
       propio (el umbral ya es el fondo): una sola pantalla, no una tarjeta sobre otra. */
    :host(.juego--umbral) .case-intro-overlay:not(.content-warning-overlay) { background: none; place-items: end center; padding-block-end: max(var(--ds-space-6), env(safe-area-inset-bottom, 0px)); }
    :host(.juego--umbral) .case-intro-overlay:not(.content-warning-overlay) .case-intro-card { max-height: min(56vh, 720px); }
    /* El aviso de respaldo (URL directa) es texto que hay que leer entero: conserva su sitio al centro y su velo propio. */
    /* Revelación: el HUD de arriba entra (8 px y opacidad, 200 ms, escalonado de 40 ms). El pie no se anima: «Salida
       segura» está a la vista desde el primer cuadro del velo (REGLA-004). Con movimiento reducido, solo opacidad. */
    :host(.revelando) .top-bar__fila > * { animation: hud-entra var(--ds-dur-base) var(--ds-ease-out) both; }
    :host(.revelando) .top-bar__fila > :nth-child(2) { animation-delay: calc(var(--ds-dur-fast) / 4); }
    :host(.revelando) .top-bar__fila > :nth-child(3) { animation-delay: calc(var(--ds-dur-fast) / 2); }
    @keyframes hud-entra { from { opacity: 0; translate: 0 -8px; } }
    @media (prefers-reduced-motion: reduce) {
      :host(.revelando) .top-bar__fila > * { animation-name: hud-funde; animation-duration: var(--ds-dur-fade); animation-delay: 0s; }
      @keyframes hud-funde { from { opacity: 0; } }
    }
  `]
})
export class SimulationPlayComponent implements OnInit, OnDestroy {
  protected readonly contentNoticeText = CONTENT_NOTICE_TEXT;
  private readonly simulationService = inject(SimulationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly audioDirector = inject(AudioDirectorService);
  /** Las dos regiones vivas persistentes de la app: el juego no trae una propia (F6-12). */
  private readonly liveAnnouncer = inject(LiveRegionAnnouncer);
  private readonly notifications = inject(NotificationService);
  private readonly consentRecorder = inject(CONSENT_RECORDER);
  private readonly dialog = inject(UiDialog);
  private readonly rehearsalApi = inject(RehearsalApi);

  @ViewChild('gameWorld')    private gameWorld?: GameWorldComponent;
  @ViewChild('journalPanel') private journalPanel?: JournalPanelComponent;
  @ViewChild('reaction')     private reaction?: ReactionDirectorComponent;

  readonly attempt    = signal<SimulationAttemptState | null>(null);
  /** El intento al que piden las pistas de la escena las opciones de una decisión (F10-2, C9). */
  readonly hintAttempt = computed(() => {
    const current = this.attempt();
    return current ? { attemptId: current.attemptId } : null;
  });
  readonly pendingActiveAttempt = signal<SimulationAttemptState | null>(null);
  readonly showResumePrompt = signal(false);
  readonly progressMap = signal<ProgressMapState | null>(null);
  readonly world      = signal<SimulationWorldState | null>(null);
  /** La última decisión vuelve a pedir el mundo, ya sincronizado con la escena terminal. */
  readonly revisionDelCierre = computed(() => {
    const intento = this.attempt();
    const mundo = this.world();
    if (intento?.status !== 'COMPLETED' || mundo?.status !== 'COMPLETED' || mundo.attemptId !== intento.attemptId) return null;
    return leerRevision(mundo.map.ambient);
  });
  readonly scenarioConfig = signal<ScenarioConfig | null>(null);
  readonly loading    = signal(true);
  readonly busy       = signal(false);
  readonly error      = signal('');
  readonly journalMessage      = signal('');
  readonly journalSaveState    = signal<JournalSaveState>('idle');
  readonly nearbyInteraction   = signal<MapObjectState | null>(null);
  private readonly pendingRestrictedInteraction = signal<MapObjectState | null>(null);
  readonly selectedInteraction = signal<MapObjectState | null>(null);
  readonly dialogue    = signal<DialogueState | null>(null);
  readonly journalOpen  = signal(false);
  /** «Ir a…» (F6-11): la lista de personas y puertas de la sala abierta y lo que ofrece. */
  readonly placesOpen   = signal(false);
  readonly placeOptions = signal<readonly PlaceCandidate[]>([]);
  private readonly injector = inject(Injector);
  private readonly location = inject(Location, { optional: true });
  // Opcional: las pruebas de instancia crean el componente sin vista (y sin ElementRef).
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  /** «Atajos de una tecla» (F6-10, WCAG 2.1.4): J, E, WASD, números del diálogo y A/D/E del lobby; apagables. */
  readonly shortcuts = inject(ShortcutSettings);
  /** «Texto instantáneo» (P8): lo guarda el navegador; el panel de diálogo lo lee por su cuenta. */
  readonly instantText = inject(InstantTextSettings);
  /** Vista cercana (Z) y acercamiento automático (bloque M1). */
  readonly cameraSettings = inject(CameraSettings);
  /**
   * Momento de la cámara (bloque M1): mientras el diálogo de una persona está abierto (hablar y decidir), la cámara
   * encuadra a los dos de cerca; con el de un objeto (lo que se encontró al revisar), se acerca al objeto. La reacción
   * a una respuesta la encuadra el director con `frameActors`.
   */
  /** Plano del lugar (bloque M1): el `layout` del mundo validado; null en casos sin él (no hay minimapa). */
  readonly placePlan = computed(() => normalizarLayout(this.world()?.layout));
  readonly placeRoom = computed(() => this.placePlan()?.actual ?? '');
  /** A dónde apunta el «Siguiente paso» en el plano (P9): la sala y, si es una puerta, la puerta. Lo mismo que el anillo del mundo y «Ir a…». */
  readonly placeTarget = computed(() => {
    const plano = this.placePlan();
    return plano ? destinoDelPlano(plano, this.placeRoom(), this.guide().siguienteLugar) : null;
  });
  readonly planOpen = signal(false);
  /** Franjas de cine (bloque M1, regla 7): en la decisión (diálogo con opciones) y durante la reacción. */
  readonly cinemaBars = computed(() => (this.dialogue()?.choices?.length ?? 0) > 0 || this.reacting());
  protected readonly confirmacionEnReaccion = computed(() => {
    const texto = ORIENTATION_COPY.notices.decisionRegistered;
    return this.reacting() && this.softNotice().includes(texto) ? texto : '';
  });
  /** Alto de la franja de abajo: la que aloja el cuadro de diálogo (lo que este tapa), o la de arriba si no hay cuadro. */
  readonly cinemaBottomPx = signal(0);

  readonly cameraMoment = computed<CameraMoment>(() => {
    const interaction = this.selectedInteraction();
    const dialogo = this.dialogue();
    // V6: la conversación con una persona del escenario (`showNpcDialogue`, clave «npc-…») no pasa por una interacción
    // del mapa; también es conversación, con los pies que el mundo conoce como «npc:…».
    if (dialogo && !interaction && dialogo.key.startsWith('npc-')) {
      return { tipo: 'conversacion', clave: `${NPC_KEY_PREFIX}${dialogo.key.slice('npc-'.length)}` };
    }
    if (!dialogo) return { tipo: 'explorar' };
    if (!interaction) return { tipo: 'explorar', dialogo: true };
    const persona = interaction.type === 'PERSON' || interaction.key.startsWith('npc:');
    return { tipo: persona ? 'conversacion' : 'objeto', clave: interaction.key };
  });
  protected readonly esperarEncuadre = computed(() => {
    const dialogo = this.dialogue();
    return !!this.gameWorldRef() && this.viewMode() === 'dialogue-cinematic' && !!dialogo
      && (dialogo.choices.length > 0 || dialogo.key.startsWith('tool-feedback-'));
  });
  readonly fadeActive   = signal(false);
  /** Avisos del sistema visibles (el anfitrión `ui-toast-host` los pinta y anuncia). */
  private readonly systemNotices = toSignal(this.notifications.messages$, { initialValue: [] });
  /** Ids de los avisos accionables que este juego emitió: son suyos, y los retira cuando dejan de valer (VD-29). */
  private readonly doorNoticeId = signal<number | null>(null);
  private readonly actionErrorId = signal<number | null>(null);
  /**
   * Puerta bloqueada (NO abre DialoguePanel). Es accionable —dice qué hacer—: aviso de advertencia del sistema que
   * permanece hasta cerrarse con «Cerrar» o hasta cambiar de sala, pausar o empezar un intento (VD-29, WCAG 2.2.1).
   * '' cuando no hay (o la persona ya lo cerró).
   */
  readonly doorNotice = computed(() => this.noticeText(this.doorNoticeId()));
  /**
   * Error de una acción: aviso de error del sistema que permanece hasta cerrarse, hasta que otro error lo reemplace
   * o hasta que salga una petición nueva (VD-29). El anfitrión lo anuncia en assertive.
   */
  readonly actionError = computed(() => this.noticeText(this.actionErrorId()));
  /** Aviso no esencial de 4,2 s («Obtuviste: …»). */
  readonly softNotice   = signal('');
  /** Nombre de la sala al entrar (1-2 s). */
  readonly roomBanner   = signal('');
  /** El aviso del carril es el título de una escena nueva (no el nombre de la sala): si la pestaña ya lo dice, no se repite. */
  protected readonly bannerDeEtapa = signal(false);
  /** Salto temporal / texto de transición autorado (map.ambient.transitionText). */
  readonly transitionNote = signal('');
  /** La nota partida en pestaña de capítulo y texto (bloque U1). */
  protected readonly transitionParts = computed(() => partirNotaDeTransicion(this.transitionNote()));
  /** Alto (px) del grupo de la derecha y de la ficha del objetivo: bajo 760 px la ficha baja bajo el HUD y su hueco la iguala. */
  protected readonly altoHud = signal(0);
  protected readonly altoObjetivo = signal(0);
  /** Alto del pie (V4): en el teléfono la ficha táctil «Hablar con…» tapaba la puerta de la barra de acción. */
  protected readonly altoPie = signal(0);
  /** Advertencia de contenido: ETH-01 — precede a la escena, la narrativa y el gameplay. */
  readonly showContentWarning = signal(false);
  /** `rehearsal`: la docente ensaya su borrador (ruta `casos/:id/ensayo`). */
  readonly mode = signal<'student' | 'rehearsal'>(this.route.snapshot.data?.['mode'] === 'rehearsal' ? 'rehearsal' : 'student');
  /** El bloque `rehearsal` del servidor, que lee el panel de autora; `rehearsalGone`: el servidor descartó o cerró el ensayo. */
  readonly rehearsal = signal<RehearsalBlock | null>(null);
  readonly rehearsalGone = signal(false);
  protected readonly draft = DRAFT_COPY;
  /** La escena con que se abrió (`?desde=`) y por qué ya no sigue: descartado (404) o cerrado (409). */
  private rehearsalFrom: number | null = null;
  protected readonly rehearsalWhy = signal<'gone' | 'closed'>('gone');
  /** Registro del consentimiento (ETH-01): `saving` mientras guarda; `error` si el almacenamiento falló. */
  readonly consentState = signal<'idle' | 'saving' | 'error'>('idle');
  /** Qué dice el recuadro de error del aviso: el de siempre, o «hay una versión nueva del aviso» (S3-2b). */
  readonly consentErrorText = signal<string>(DRAFT_COPY.consentStorageError.text);
  /** El mundo/HUD/audio solo existen tras el consentimiento (ETH-01). */
  readonly worldStarted = signal(false);
  /** Código HTTP del fallo que pinta el estado de error (null si no vino de una respuesta HTTP). */
  readonly errorStatus = signal<number | null>(null);
  /** Lo que «Reintentar» vuelve a pedir; null cuando no hay nada que reintentar (p. ej. un caso que no existe). */
  private readonly retryAction = signal<(() => void) | null>(null);
  readonly canRetry = computed(() => this.retryAction() !== null);
  readonly errorKind = computed<UiErrorKind>(() => {
    const status = this.errorStatus();
    if (status === 0) return 'network';
    if (status === 401 || status === 403) return 'forbidden';
    if (status === 404 || !this.canRetry()) return 'not-found';
    return 'server';
  });
  /** El mundo pintó su primer cuadro (`GameWorldComponent.worldReady`): hasta entonces hay UN indicador de carga. */
  readonly worldRendered = signal(false);
  readonly worldLoadPercent = signal<number | null>(null);
  /** El error que se muestra es el del arranque del lienzo (plazo vencido): un primer cuadro tardío lo retira. */
  private bootFailureShown = false;
  /** Hay arranque en curso: el intento o el mundo se piden, o el mundo pedido todavía no pintó su primer cuadro. */
  readonly bootLoading = computed(() => !this.error() && (this.loading() || (this.worldStarted() && !this.worldRendered())));
  /** Una sola etiqueta para las dos fases: el mismo indicador cambia de texto, no se apila otro. */
  readonly bootLabel = computed(() => (this.worldStarted() && this.attempt() ? 'Preparando la escena…' : 'Cargando el caso…'));
  private readonly bootPhase = loadingPhase(this.bootLoading);
  /** Visible a los 150 ms (una respuesta rápida no parpadea) y al menos 300 ms (una lenta no destella). */
  readonly bootVisible = computed(() => this.bootPhase() === 'skeleton');
  /** «Salida segura» del pie está a la vista: el error no repite la salida con un segundo botón. */
  readonly footerExit = computed(() => this.worldStarted() && (this.attempt()?.status === 'IN_PROGRESS' || this.reactingToLast()));
  readonly showCaseIntro = signal(false);

  // ── La entrada del caso: cinemática y tutor (contrato del caso insignia, §1 y §2) ──────────────────────────────────
  /** La cinemática a la vista (de `ambient.cinematica` de la sala inicial), o null. */
  readonly cinematica = signal<CinematicaLeida | null>(null);
  /** El tutor a la vista y la sala de la que es, o null. */
  private readonly tutorAbierto = signal<{ datos: TutorLeido; mapa: string } | null>(null);
  readonly tutor = computed(() => this.tutorAbierto()?.datos ?? null);
  /** La cinemática y el tutor de la sala inicial van en cadena: al cerrarse el último, termina la entrada del caso. */
  private entradaEnCurso = false;
  /** La nota de capítulo de la sala que espera a que se cierre su tutor (el tutor va primero). */
  private notaTrasTutor: SimulationWorldState | null = null;
  /**
   * El nombre de pila de quien juega, para `{nombre}` (contrato: «Plantilla común»). Se lee perezoso y a prueba de fallos:
   * las pruebas de instancia montan el juego sin la sesión.
   */
  readonly nombreDeQuienJuega = computed(() => {
    try {
      const sesion = this.injector.get(AuthService, null) as { currentUser?: () => { nombre?: string } | null } | null;
      return nombreDePila(typeof sesion?.currentUser === 'function' ? sesion.currentUser()?.nombre : '');
    } catch {
      return '';
    }
  });
  /** El diálogo y el comentario con `{nombre}` puesto al pintar (sin marcas, el mismo objeto). */
  protected readonly dialogoConNombre = computed(() => dialogoConNombre(this.dialogue(), this.nombreDeQuienJuega()));
  protected readonly comentarioConNombre = computed(() => comentarioConNombre(this.bubble()?.comment ?? null, this.nombreDeQuienJuega()));

  // ── El umbral (DISENO §4.4; DP-09, DP-26) ────────────────────────────────────────────────────────────────────
  /** Lo que la ficha, Inicio o Casos mandaron al navegar para pintar el umbral desde el primer cuadro (`history.state`). */
  readonly umbralDatos = signal<{ titulo: string | null; portada: string | null }>(umbralDelEstado(estadoDeNavegacion()));
  /** El título del caso: el del intento cuando llega; antes, el que trajo la navegación (sin estado, se espera). */
  readonly umbralTitulo = computed(() =>
    this.attempt()?.caseTitle || this.pendingActiveAttempt()?.caseTitle || this.umbralDatos().titulo || null);
  /**
   * El umbral está a la vista: desde el primer cuadro hasta que el mundo está dibujado y la persona pasó la tarjeta.
   * Nunca tapa un error (el error trae su salida), un ensayo perdido ni un intento que ya no está en curso (la pausa o el
   * resultado se ven sobre el mundo, como siempre).
   */
  readonly umbralVisible = computed(() => {
    if (this.error() || this.rehearsalGone()) return false;
    if ((this.attempt()?.status ?? 'IN_PROGRESS') !== 'IN_PROGRESS') return false;
    return !this.worldRendered() || this.showCaseIntro();
  });
  /** Una tarjeta de entrada (la tarjeta, reanudar o el aviso de respaldo) se posa sobre el umbral. */
  readonly umbralConTarjeta = computed(() => this.showCaseIntro() || this.showResumePrompt() || this.showContentWarning()
    || this.cinematica() !== null || this.tutor() !== null);
  /** La fase REAL del arranque: cada una enciende un píxel (el intento respondió, la sala llegó, el primer cuadro). */
  readonly umbralFase = computed<FaseUmbral>(() => {
    if (this.worldRendered()) return 'listo';
    if (this.worldStarted() && this.world()) return 'escena';
    if (this.attempt()) return 'sala';
    return 'intento';
  });
  /** Con un intento en curso y sin tarjeta, el umbral ofrece la salida segura (REGLA-004: nunca tapada). */
  readonly umbralSalida = computed(() =>
    this.worldStarted() && this.attempt()?.status === 'IN_PROGRESS' && !this.umbralConTarjeta());
  /** Se carga de verdad (no se espera a la persona): lo que puede volverse «lento». */
  private readonly umbralCargando = computed(() => this.umbralVisible() && !this.umbralConTarjeta() && this.umbralFase() !== 'listo');
  /** Pasaron 10 s cargando: se ofrece volver a la ficha (lo que está en curso sigue; nada se lanza dos veces). */
  readonly umbralLento = signal(false);
  private umbralLentoTimer: number | null = null;
  /** El velo del umbral se retira y el HUD entra (600 ms): clase `revelando` en el contenedor. */
  readonly revelando = signal(false);
  private revelandoTimer: number | null = null;
  /**
   * Cada arranque (pedir el intento abierto, empezarlo o reanudarlo, y sus reintentos) lleva su número: la respuesta de
   * un arranque que ya no es el vigente se ignora, así un reintento nunca se cruza con una respuesta lenta del anterior.
   */
  readonly arranque = signal(0);
  /** Pantalla «Cómo se juega»: no modal; Esc la cierra antes que cualquier otra cosa (F§7.8). */
  readonly helpOpen = signal(false);
  /** La tarjeta de primera vez ya se vio en este navegador (`siep.ayuda.v1`). La lectura no es reactiva: se actualiza a mano. */
  readonly helpCardSeen = signal(readHelpSeen().has(HELP_FIRST_CARD));
  /** Las ayudas prometen «Salida segura» (y Esc) solo mientras es verdad en todos los estados jugables. */
  readonly safeExitPromise = SAFE_EXIT_ALWAYS_REACHABLE;
  /**
   * Hay una salida segura pedida desde una superposición: ya en vuelo (no espera a ninguna otra petición).
   * El pie la muestra como «Pausando…»; impide que dos toques pausen dos veces (F§7.8).
   */
  readonly pausing = signal(false);
  /**
   * Cada incremento le dice al panel de diálogo que suelte la opción que tenía marcada como
   * elegida (DLG-01): tras un rechazo o un error sus opciones vuelven a poder activarse.
   */
  readonly dialogueReleaseToken = signal(0);
  /**
   * DLG-05 acotado a la última decisión (sin la decisión en dos tiempos, T9.12): al decidir por última vez el
   * intento ya figura como COMPLETED, pero la «Supervisión clínica» se lee primero sobre la escena y el
   * resultado se abre al cerrarla. Es solo la intención de retener; lo que manda es `holdingOutcome`.
   */
  private readonly supervisionHold = signal(false);
  /**
   * El resultado espera a que se cierre la supervisión de la última decisión. Solo mientras la supervisión esté
   * a la vista y el intento esté COMPLETED (nunca con una pausa, REGLA-004): si el diálogo desaparece por
   * cualquier camino, el resultado se abre igual.
   */
  readonly holdingOutcome = computed(() =>
    this.supervisionHold() && this.dialogue() !== null && this.attempt()?.status === 'COMPLETED');
  protected readonly introCardLines = introCardLines;
  readonly musicMuted = signal(false);
  readonly sfxMuted = signal(false);
  readonly reduceMotion = signal(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  private readonly seenTransitionMapKeys = new Set<string>();

  /** Estado reactivo de la paciente (Fase 8) — alimenta HUD y tint/shake del NPC. */
  /** Retrato de la persona consultante en el kit (lo da el mundo al cargarlo): el HUD le pone la expresión de la persona. */
  readonly patientVisual = signal<CharacterVisual | null>(null);
  /** Última persona vista de cada intento: el cambio es lo único que se anuncia (nunca el primer valor). */
  private lastPersona: { attemptId: string; persona: Pick<Persona, 'bond' | 'activation'> } | null = null;
  /** NPCs de ScenarioConfig hablados en esta sesión (evidencia frontend, Fase 9). */
  protected readonly viewedNpcKeys = signal<ReadonlySet<string>>(new Set<string>());

  /** Estado de vista del gameplay — gobierna el layout vía [attr.data-mode]. */
  /**
   * El arte de pixel de toda la pantalla (bloque U1): marcos, tramas, letras e iconos como variables CSS en la raíz, para
   * que el HUD, los avisos y las capas usen las piezas del cuadro de diálogo. De noche, como el cuadro mientras su
   * entrada `momento` no se enlace con el momento de la sala.
   */
  protected readonly arteJuego = variablesDeArte('noche');

  readonly viewMode = computed<SimulationViewMode>(() => resolveViewMode({
    status: this.reactingToLast() ? 'IN_PROGRESS' : (this.attempt()?.status ?? null),
    journalOpen: this.journalOpen(),
    dialogue: this.dialogue(),
    holdOutcome: this.holdingOutcome(),
  }));

  /** Modo compacto: pantallas bajas o táctil horizontal. Tarjeta plegada, pie sin teclas, panel flotante. */
  readonly compactMode = signal(matchesMedia(COMPACT_QUERY));
  readonly narrowScreen = signal(matchesMedia(NARROW_QUERY));
  /** La ficha del objetivo arranca plegada a su chip en compacto y en móvil vertical: no tapa el mundo. */
  readonly cardFolded = computed(() => this.compactMode() || this.narrowScreen());
  /**
   * Aviso ético de un nodo sensible («Este caso aborda…», `warningMessage` del nodo): franja fija bajo la cabecera,
   * visible en todos los dispositivos mientras dure el nodo, plegada o no la ficha del objetivo. No cambia su redacción.
   */
  readonly sensitiveNotice = computed<string | null>(() => {
    // La escena visible: durante la reacción (4.3.3) el aviso de la escena siguiente no se adelanta.
    const node = this.visibleNode();
    if (!node) return null;
    if (node.warningMessage) return node.warningMessage;
    return node.safeExitRequired
      ? 'Este momento permite salida segura: prioriza confidencialidad y rutas institucionales.'
      : null;
  });
  /** El HUD nombra la escena (sin contador de decisiones: el número de pasos lo decide la docente, no la pantalla). */
  readonly stageLabel = computed<string | null>(() => {
    const mapa = this.world()?.map;
    const guia = leerGuiaAutorada(mapa?.ambient, this.nombreDeQuienJuega());
    return fichaDeLaSala(this.visibleNode(), mapa, guia).titulo;
  });
  /**
   * La escena que la barra y la ficha del objetivo muestran. Tras decidir, conserva la anterior hasta aplicar el mundo nuevo.
   */
  readonly visibleNode = computed(() => this.heldNode() ?? this.attempt()?.currentNode ?? null);
  private readonly heldNode = signal<SimulationNodeState | null>(null);

  /** La guía de la escena: el objetivo del documento y lo que hay en la sala (la lista de lugares no es reactiva: se relee). */
  readonly guide = signal<GuiaEscena>(GUIA_VACIA);

  /**
   * Un velo a pantalla completa (fundido de escena, nota de transición) cubre el pie: mientras dure, el pie sube por
   * encima para que «Salida segura» siga a la vista (REGLA-004). Con una superposición abierta el pie queda inerte y
   * la superposición trae su propio botón, así que no sube.
   */
  readonly footerAboveVeils = computed(() =>
    (this.fadeActive() || this.transitionNote() !== '') && !this.inputBlocked());

  /** El mundo se congela con diálogo, journal u outcome abiertos (Fase 5/13). */
  readonly inputBlockedOutsidePlaces = computed(() =>
    this.showResumePrompt() || this.showContentWarning()
    || this.showCaseIntro() || this.dialogue() !== null || this.journalOpen() || this.planOpen()
    || this.cambioDeLugar() !== null || this.cinematica() !== null || this.tutor() !== null
    || (!this.reactingToLast() && (this.attempt()?.status ?? 'IN_PROGRESS') !== 'IN_PROGRESS'));

  readonly inputBlocked = computed(() => this.inputBlockedOutsidePlaces() || this.placesOpen());

  /** Con la pantalla de ayuda abierta el personaje no camina mientras se lee. */
  readonly worldMotionPaused = computed(() => this.inputBlockedOutsidePlaces() || (this.placesOpen() && !this.pendingWalkInteraction()) || this.transitionNote() !== ''
    || this.helpOpen() || this.controlsVisible() || this.reacting() || this.rehearsalGone());

  /**
   * Última decisión: el intento ya figura COMPLETED mientras el personaje reacciona, pero el resultado espera a la
   * supervisión (RN-08, DLG-05): hasta que acabe la reacción no se pinta ni cuenta como vista de resultado.
   */
  readonly reactingToLast = computed(() => this.reacting() && this.attempt()?.status === 'COMPLETED');

  /** La reacción del personaje tras elegir está en curso: el mundo se congela, pero el pie con «Salida segura» sigue operable. */
  readonly reacting = signal(false);
  /** La respuesta de la decisión, a la espera de que termine la reacción para abrir la supervisión y cargar la sala. */
  private pendingAfterReaction: SimulationDecisionResult | null = null;
  /** V7: la decisión cuya escena siguiente espera a que se cierre la consecuencia (y, si es otra sala, a la tarjeta). */
  private transicionPendiente: SimulationDecisionResult | null = null;
  /** V7: sube al cortar la transición (pausa, recarga): una respuesta del mundo que llegue tarde ya no hace nada. */
  private transicionToken = 0;
  /** V7: «La historia continúa en <lugar>». El mundo de la sala nueva ya está pedido; se aplica al pulsar «Ir a…». */
  readonly cambioDeLugar = signal<{ lugar: string; mundo: SimulationWorldState; intento: SimulationAttemptState } | null>(null);

  /** La escena que el director de la reacción maneja (el mundo del juego; `gameWorld` es privado para la plantilla). */
  protected reactionStage(): EscenarioReaccion | null { return this.gameWorldRef() ?? null; }
  /** Solo para el binding de `reactionStage`: una consulta de señal no choca con NG0100 cuando `world()` crea el mundo. */
  private readonly gameWorldRef = viewChild(GameWorldComponent);
  private readonly canvasZone = viewChild<ElementRef<HTMLElement>>('canvasZone');
  /**
   * Zona segura de la cámara (U1): cajas visibles sobre el mundo, en px CSS desde el contenedor del lienzo.
   * El contenedor conserva su tamaño cuando se escala el lienzo durante un viaje.
   */
  private readonly medirPlacas = (): PlacaDeInterfaz[] => {
    const zona = this.canvasZone()?.nativeElement;
    const raiz = zona?.closest('.game-container');
    const lienzo = zona?.querySelector<HTMLElement>('app-game-world .phaser-host') ?? zona;
    if (!raiz || !lienzo) return [];
    const base = lienzo.getBoundingClientRect();
    const cajas: PlacaDeInterfaz[] = [];
    raiz.querySelectorAll<HTMLElement>(PLACAS_SOBRE_EL_MUNDO).forEach(el => {
      const r = el.getBoundingClientRect();
      if (el.hasAttribute('data-placa-flotante') && r.width >= 1 && r.height >= 1) {
        // La posición de la rejilla es el ancla. Los desplazamientos visuales no cambian el hueco del carril.
        const x = r.left - base.left - (parseFloat(el.style.left) || 0);
        const y = r.top - base.top - (parseFloat(el.style.top) || 0);
        cajas.push({ x, y, ancho: r.width, alto: r.height, ubicar: posicion => {
          if (posicion) {
            el.style.left = `${posicion.x - x}px`;
            el.style.top = `${posicion.y - y}px`;
          }
          el.toggleAttribute('data-ubicada', posicion !== null);
        } });
        return;
      }
      const x = Math.max(r.left, base.left);
      const y = Math.max(r.top, base.top);
      const ancho = Math.min(r.right, base.right) - x;
      const alto = Math.min(r.bottom, base.bottom) - y;
      if (ancho >= 1 && alto >= 1 && (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })
        ?? getComputedStyle(el).visibility === 'visible')) {
        cajas.push({ x: x - base.left, y: y - base.top, ancho, alto });
      }
    });
    return cajas;
  };
  private readonly derecha = viewChild<ElementRef<HTMLElement>>('derecha');
  /**
   * Bloque U1 (variante B): mide el alto del grupo HUD + minimapa y el de la ficha del objetivo y los publica como
   * `--alto-hud` y `--alto-objetivo` en `.game-container`. Bajo 760 px la ficha baja bajo el HUD y el hueco de la cabecera
   * mide lo que ella, así el carril de avisos no cae encima. Se desconecta solo al destruir el componente o al rehacerse.
   */
  private readonly medirAltos = afterRenderEffect(onCleanup => {
    const hud = this.derecha()?.nativeElement;
    this.world(); // la ficha nace con el mundo: se vuelve a buscar cuando aparece
    const objetivo = this.canvasZone()?.nativeElement.querySelector<HTMLElement>('.objective-card');
    // El pie (salida, herramientas y la barra de acción): los controles táctiles del mundo se ponen encima de él.
    const pie = this.canvasZone()?.nativeElement.closest('.game-container')?.querySelector<HTMLElement>('.bottom-zone') ?? null;
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(entradas => {
      for (const entrada of entradas) {
        const alto = Math.round((entrada.target as HTMLElement).offsetHeight);
        const destino = entrada.target === hud ? this.altoHud : entrada.target === pie ? this.altoPie : this.altoObjetivo;
        if (destino() !== alto) destino.set(alto);
      }
    });
    if (hud) observador.observe(hud);
    if (objetivo) observador.observe(objetivo);
    if (pie) observador.observe(pie);
    onCleanup(() => observador.disconnect());
  });

  /** Reacciones al acercarse y al explorar (4.3.7): nacen con el mundo y el intento (`onWorldReady`). */
  protected reactions: ProximityReactions | null = null;
  private reactionsAttemptId: string | null = null;
  /** El comentario a la vista y dónde está la cabeza de quien lo dice, en px del lienzo (se refresca por cuadro solo mientras hay burbuja). */
  protected readonly bubble = signal<BurbujaVisible | null>(null);
  protected readonly bubbleAnchor = signal<{ x: number; y: number } | null>(null);
  /** El personaje con quien se habla, para la cara del panel de diálogo (la misma fuente que la burbuja y la reacción). */
  protected readonly speakerVisual = computed(() => {
    const dialogue = this.dialogue();
    if (!dialogue || dialogue.hidePortrait || !this.worldRendered()) return null;
    const key = dialogue.speakerObjectKey ?? this.world()?.objects.find(object =>
      object.dialogue?.key === dialogue.key || object.key === dialogue.key)?.key;
    return key ? (this.gameWorldRef() ?? this.gameWorld)?.characterVisualOf(key) ?? null : null;
  });
  protected readonly bubbleSpeaker = computed(() => {
    const key = this.bubble()?.objectKey;
    if (!key) return null;
    const nombre = key.startsWith('npc:') ? this.scenarioNpc(key)?.displayName ?? '' : this.reactionActor(key).nombre;
    return { nombre, visual: this.gameWorld?.characterVisualOf(key) ?? null };
  });
  private bubbleFrame = 0;

  readonly contextualInteraction = computed(() => {
    const game = this.attempt();
    const interaction = this.nearbyInteraction();
    return game?.status === 'IN_PROGRESS' && !this.inputBlocked() && !this.busy()
      ? interaction
      : null;
  });

  /** Estado de cada puerta de la sala (clave → abierta/bloqueada): el mundo la rotula con candado. Misma fuente que la barra y `tryOpenDoor`. */
  readonly doorStates = computed<Record<string, 'open' | 'locked'>>(() => {
    const context = this.doorContext();
    return context ? doorStateMap(context.world.objects ?? [], context) : {};
  });

  /**
   * Motivo de cada puerta bloqueada de la sala (clave → texto): el aviso de la puerta de pieza dice lo mismo que la barra
   * («Antes de pasar, …» o la salida que se abre más adelante), no un «todavía no» genérico. Misma fuente que `doorStates`.
   */
  readonly doorMessages = computed<Record<string, string>>(() => {
    const context = this.doorContext();
    const messages: Record<string, string> = {};
    for (const obj of context?.world.objects ?? []) {
      if (obj.type !== 'EXIT') continue;
      const message = doorStatus(obj, context!).message;
      if (message) messages[obj.key] = message;
    }
    return messages;
  });

  /** Candidato secundario en rango (otra persona u objeto): el botón secundario de la barra. */
  readonly nearbyAlso = signal<MapObjectState | null>(null);
  /** Puntero grueso (táctil): el texto de la barra no promete teclas. */
  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));
  /** «No hay nada a tu alcance…» durante 2,5 s tras pedir interactuar sin nada cerca; estático y sin sonido. */
  readonly nothingNearbyNote = signal('');

  /** Botón principal de la barra: verbo por tipo, candado y motivo en puertas bloqueadas (F§4.3). */
  readonly contextAction = computed(() => this.interactionAction(this.attempt()?.status === 'IN_PROGRESS' ? this.nearbyInteraction() : null));
  readonly contextAlso = computed(() => this.contextAction() ? this.interactionAction(this.nearbyAlso()) : null);
  // BORRADOR: texto pendiente de Psicología. Si no hay destino conocido, no se inventa un objetivo.
  protected actionStepLabel(key: string): string {
    const next = this.guide().siguienteLugar?.key;
    return !next ? '' : key === next ? 'Siguiente paso' : 'Opcional: puede servirte más adelante';
  }

  readonly decisionSelection = signal('');
  /** Lo único que la barra de contexto anuncia (H-10): la interacción cercana. Comparado por valor: no repite. */
  private readonly contextLabel = computed(() => this.contextAction()?.ariaLabel ?? null);

  readonly helpModality = computed<'keyboard' | 'touch'>(() => this.coarsePointer() ? 'touch' : 'keyboard');

  /**
   * Tarjeta de primera vez: tras el aviso de contenido, la introducción y el contexto; nunca con un
   * diálogo, la bitácora o la ayuda completa abiertos, ni con un intento que no está en curso.
   */
  /** Tarjeta de controles pedida con «Controles» o «?» (la de primera vez es `showHelpCard`). */
  readonly controlsOpen = signal(false);
  /** La tarjeta de controles está a la vista, sea la de primera vez o la pedida. Mientras dura, el personaje no camina. */
  readonly controlsVisible = computed(() => this.showHelpCard() || (this.controlsOpen() && this.ayudaDisponible()));
  /** «Da unos pasos…»: aviso no modal que dice cuánto falta para volver a cruzar la puerta; '' cuando no hay. */
  readonly stepsNotice = signal('');

  readonly showHelpCard = computed(() =>
    !this.helpCardSeen() && this.worldStarted() && this.world() !== null && !this.loading()
    && (this.attempt()?.status ?? null) === 'IN_PROGRESS'
    && this.ayudaDisponible() && !this.helpOpen());

  private readonly ayudaDisponible = computed(() =>
    !this.inputBlocked() && !this.transitionNote() && !this.reacting() && !this.rehearsalGone());

  /** Objetos de decisión de otras etapas: el mundo los atenúa (alfa .55, sin anillo). Nunca marca la opción adecuada. */
  readonly dimmedKeys = computed<ReadonlySet<string>>(() => {
    const dimmed = otherStageDecisionKeys(this.world(), this.visibleNode()?.options?.map(option => option.id) ?? null);
    const target = this.pendingWalkInteraction()?.key;
    if (!target || !dimmed.has(target)) return dimmed;
    const visible = new Set(dimmed);
    visible.delete(target);
    return visible;
  });

  readonly selectedToolCode = computed(() => {
    const sel = this.selectedInteraction();
    return sel?.type === 'TOOL' ? sel.toolCode : null;
  });

  private lastPosition: { x: number; y: number } | null = null;
  private lastSyncedPosition: { x: number; y: number } | null = null;
  /** La posición sin guardar al pulsar «Salida segura»: viaja con la pausa, antes de ella (REGLA-004 y V4). */
  readonly pausePositionNote = signal<string | null>(null);
  private positionForPause: { attemptId: string; mapKey: string; x: number; y: number } | null = null;
  private positionSaveHandle: number | null = null;
  /**
   * Histéresis también para la interacción contextual (clic/E). Al entrar o
   * recargar junto a una puerta de retorno, exige alejarse antes de permitir
   * volver a cruzarla; evita que un evento residual rebote a la sala anterior.
   */
  private doorInteractionArmed = false;
  /** Nodo de la última lectura de las opciones ofrecidas: el aviso de respuesta nueva no sale si el nodo cambió. */
  private optionsNodeId: number | null = null;

  private softNoticeTimer: number | null = null;
  private nothingNearbyTimer: number | null = null;
  private helpCardShown = false;
  private roomBannerTimer: number | null = null;
  private transitionNoteTimer: number | null = null;
  /** Plazo de la precarga del consentimiento (S3-2b): pasado, el arranque sigue sin esperar al servidor. */
  private consentPrimeTimer: number | null = null;
  /** La pantalla ya se destruyó: una respuesta tardía de la precarga no arranca audio ni mundo. */
  private destroyed = false;
  /** Retiro del fundido tras cargar el mundo: si el componente se destruye antes, no debe dispararse. */
  private worldRevealTimer: number | null = null;
  /** Hay una decisión enviada sin respuesta: la pausa pendiente espera a que termine para que el servidor la vea después (V3). */
  private decisionInFlight = false;
  /** La pausa local aún sin registrar en el servidor: reintenta con espera creciente y al volver la red (V3, REGLA-004). */
  private readonly pausa = new PausaPendiente<SimulationAttemptState>({
    // La posición pendiente sale antes, en la misma cadena: la pausa visible no la espera, pero el servidor la tiene (V4).
    enviar: () => this.positionBeforePause().pipe(
      switchMap(() => this.simulationService.safeExit(this.hintAttempt()!.attemptId, 'Salida segura solicitada').pipe(timeout(PLAZO_ACCION_MS))),
    ),
    consultar: () => this.simulationService.getAttempt(this.hintAttempt()!.attemptId).pipe(timeout(PLAZO_ACCION_MS)),
    decisionEnVuelo: () => this.decisionInFlight,
    alRegistrar: updated => this.onPauseRegistered(updated),
    alFallar: (cause, seguir) => this.orRehearsalGone(cause, seguir),
    alRendirse: () => { this.pausing.set(false); this.pauseState.set('failed'); },
    alQuedarPendiente: (_fallos, cause) => {
      this.pauseState.set('pending');
      if (this.resumeQueued && veredictoDeFalloDePausa(cause) === 'reintentar') this.showActionError(DRAFT_COPY.pauseResumeOffline.text);
    },
  });
  private readonly pauseState = signal<'none' | 'saving' | 'pending' | 'failed'>('none');
  /** La línea discreta de la pantalla de pausa mientras el servidor aún no la registró (o si lo rechazó de forma permanente). */
  readonly pauseNote = computed(() => ({ none: null, saving: 'Guardando la pausa…', pending: DRAFT_COPY.pauseNotRegistered.text, failed: DRAFT_COPY.pausePermanentFail.text })[this.pauseState()]);
  /** Al reanudar: la consecuencia de la decisión que la pausa cortó, el aviso de una elección perdida y una decisión ya aplicada cuya respuesta se perdió (se reenvía, mismo `requestId`). */
  private consequenceOnResume: SimulationDecisionResult | null = null;
  private replayIntent: IntencionDeDecision | null = null;
  /** Reintentos al volver la red: la elección sin enviar (mismo `requestId`) y la posición sin guardar (con espera creciente). */
  private readonly decisionOnline = new ReintentoAlVolver(() => this.resendDecisionOnline());
  private readonly positionRetry = new ReintentoAlVolver(() => this.persistPosition());
  private positionGiveUps = 0;
  /** Tras pausar se recarga el mundo (dos GET encadenados) y `busy()` sigue activo hasta que termina. */
  private worldReloadPending = false;
  /** «Reanudar» pulsado durante esa recarga: se ejecuta al terminar en vez de descartarse en silencio. */
  private resumeQueued = false;
  private stopCompactWatch: (() => void) | null = null;
  /** Cambio de etapa tras decidir: lo recoge `applyLoadedWorld` cuando ya está la sala nueva. */
  private pendingStage: string | null = null;

  constructor() {
    // Cámara (bloque M1): ajustes y momento a la escena. El alto que tapa el cuadro de diálogo se mide del DOM después
    // de pintarlo (el panel aparece en el mismo ciclo que cambia el momento).
    effect(onCleanup => {
      const moment = this.cameraMoment();
      const mode = this.viewMode();
      const options = { cercana: this.cameraSettings.cercana(), acercarAuto: this.cameraSettings.acercarAuto() };
      const frozen = this.planOpen();
      const bars = this.cinemaBars();
      const fase = this.esperarEncuadre() ? this.dialoguePanel()?.faseEncuadre() ?? null : null;
      // Al aparecer el mundo, los ajustes guardados (vista cercana, acercamiento) tienen que llegarle (hallazgo 5).
      this.world();
      untracked(() => {
        // Con franjas, la cámara encuadra entre la de arriba y la de abajo (que crece hasta alojar el cuadro). Se mide
        // al pintar y otra vez cuando el cuadro o la franja de la reacción ya entraron (llegan con su animación).
        const medir = () => {
          this.gameWorld?.setCameraOptions(options);
          this.gameWorld?.setCameraPlacas?.(this.medirPlacas);
          this.gameWorld?.setCameraFrozen(frozen);
          const top = bars ? this.cinemaTopPx() : 0;
          const bottom = Math.max(this.dialogueCoverCss(mode), top);
          this.cinemaBottomPx.set(bottom);
          this.gameWorld?.setCameraMoment(moment, bottom, top, fase);
        };
        const cuadro = requestAnimationFrame(medir);
        const despues = setTimeout(medir, 450);
        onCleanup(() => {
          cancelAnimationFrame(cuadro);
          clearTimeout(despues);
        });
        // Con un diálogo o una reacción en pantalla, en vivo: las opciones entran escalonadas y el aviso aparece después.
        if (moment.tipo !== 'explorar' || bars || fase) {
          const vivo = setInterval(medir, 250);
          onCleanup(() => clearInterval(vivo));
        }
      });
    });
    // El punto de lectura de la conversación abierta (cuál y en qué línea) se guarda para recuperarlo al recargar.
    effect(() => {
      const dialogo = this.dialogue();
      const seleccion = this.selectedInteraction();
      const line = this.dialoguePanel()?.lineIndex() ?? 0;
      untracked(() => {
        if (this.readingRestorePending) return;
        this.saveReadingPoint(seleccion, dialogo, line);
        if (!dialogo) this.dialogueStart.set(null);
      });
    });
    // Con una superposición, la secuencia de la reacción o una pausa nadie reacciona al acercarse y la burbuja se va (4.3.7).
    effect(() => {
      const blocked = this.inputBlocked() || this.reacting() || this.rehearsalGone();
      const activation = this.attempt()?.persona.activation;
      untracked(() => {
        this.reactions?.setBlocked(blocked);
        if (activation) this.reactions?.setActivation(activation);
      });
    });
    // La supervisión de la última decisión dejó de estar a la vista (se cerró, «Salida segura», Esc o cualquier
    // otro camino): el resultado ya se ve y es el momento de su sonido y su foco.
    effect(() => {
      if (!this.supervisionHold() || this.holdingOutcome()) return;
      untracked(() => this.releaseHeldOutcome());
    });
    // La guía sigue a la escena y a la sala: el objetivo y «En esta sala» se releen cuando cambian.
    effect(() => {
      this.visibleNode()?.key;
      this.visibleNode()?.goal;
      this.nombreDeQuienJuega();
      this.world()?.map.key;
      // Y lo hecho: al hablar, recoger o abrirse una puerta, la tarjeta pasa al siguiente paso en el acto (V7).
      this.viewedNpcKeys();
      this.world()?.inventory;
      this.world()?.inspectedObjectKeys;
      this.world()?.usedToolKeys;
      this.doorStates();
      this.dialogue();
      this.selectedInteraction();
      this.reacting();
      untracked(() => this.refreshGuide());
    });
    // El panel lateral encoge (o devuelve) el mundo: se vuelve a leer el contenedor cuando el diseño ya cambió.
    effect(() => {
      this.viewMode();
      untracked(() => { window.setTimeout(() => this.refreshWorldScale()); });
    });
    // La tarjeta de primera vez que ya estuvo a la vista y cede ante un diálogo o la bitácora se da por vista:
    // no vuelve a aparecer cada vez que se cierra una conversación.
    effect(() => {
      const visible = this.showHelpCard();
      const covered = this.dialogue() !== null || this.journalOpen();
      untracked(() => {
        if (visible) this.helpCardShown = true;
        else if (this.helpCardShown && covered) this.markHelpCardSeen();
      });
    });
    // La barra de contexto anuncia SOLO la interacción cercana (H-10): al volver al reposo no se lee la línea
    // «Ahora: …» ni la pista de teclas.
    effect(() => {
      const label = this.contextLabel();
      untracked(() => { if (label) this.announce(label); });
    });
    // La persona a atender (P6) se dibuja con un chevrón en el lienzo: quien no lo ve la oye al entrar a la sala.
    effect(() => {
      const world = this.world();
      untracked(() => this.announceKeyPerson(world));
    });
    // Sale una petición nueva: el error anterior ya no describe lo que está pasando (VD-29).
    effect(() => {
      if (this.busy()) untracked(() => this.dismissActionError());
    });
    // Interacción → respuesta (RNF-05): la respuesta es el diálogo que aparece, así que la medida termina en el pintado
    // que lo muestra, con la red incluida. Sin una interacción en curso no mide nada (otros diálogos no cuentan).
    effect(() => {
      if (this.dialogue()) untracked(() => perfEndNextPaint('interaction-to-response'));
    });
    // Umbral lento (> 10 s cargando): la marca se arma al empezar a cargar y se desarma al terminar o al pedir algo a la
    // persona (una tarjeta no es «lento»: espera a quien lee).
    effect(() => {
      const cargando = this.umbralCargando();
      untracked(() => {
        if (this.umbralLentoTimer !== null) window.clearTimeout(this.umbralLentoTimer);
        this.umbralLentoTimer = null;
        this.umbralLento.set(false);
        if (cargando) this.umbralLentoTimer = window.setTimeout(() => this.umbralLento.set(true), UMBRAL_LENTO_MS);
      });
    });
    // El umbral se retira: el velo pasa de 1 a 0, el HUD entra y el foco pasa al juego (Continuar, o el ensayo y una
    // introducción ya leída, que revelan directamente).
    let umbralAntes = false;
    effect(() => {
      const visible = this.umbralVisible();
      untracked(() => {
        if (umbralAntes && !visible) this.revelarMundo();
        if (visible) this.revelando.set(false);
        umbralAntes = visible;
      });
    });
    // La tarjeta «Antes de comenzar» con el mundo ya dibujado detrás: se dice una vez que todo está listo.
    effect(() => {
      if (this.showCaseIntro() && this.worldRendered()) untracked(() => this.announce(DRAFT_COPY.umbralReady.text));
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.captureOverlayKey, true);
    window.removeEventListener('keyup', this.releaseOverlayKey, true);
    const pendiente = this.pausa.activa ? this.attempt() : null;
    // Último intento de registrar la pausa, sin tocar señales: la marca de «pausa pendiente» cubre si tampoco llega.
    pendiente && this.simulationService.safeExit(pendiente.attemptId, 'Salida segura solicitada')
      .subscribe({ next: () => borrarMarcaDePausa(this.almacen, pendiente.attemptId), error: () => undefined });
    this.pausa.cerrar();
    this.decisionOnline.cerrar();
    this.positionRetry.cerrar();
    this.stopCompactWatch?.();
    this.reactions?.dispose();
    if (this.bubbleFrame) cancelAnimationFrame(this.bubbleFrame);
    // Los avisos accionables son del sistema y viven en un anfitrión global: no se quedan en el resto de la app.
    this.dismissDoorNotice();
    this.dismissActionError();
    for (const timer of [this.softNoticeTimer, this.roomBannerTimer, this.nothingNearbyTimer, this.transitionNoteTimer, this.worldRevealTimer, this.consentPrimeTimer, this.positionSaveHandle, this.umbralLentoTimer, this.revelandoTimer]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    this.audioDirector.stopIntroLament();
    this.audioDirector.dispose();
  }

  ngOnInit() {
    window.addEventListener('keydown', this.captureOverlayKey, true);
    window.addEventListener('keyup', this.releaseOverlayKey, true);
    const stopCompact = watchMedia(COMPACT_QUERY, matches => this.compactMode.set(matches));
    const stopCoarse = watchMedia(COARSE_POINTER_QUERY, matches => this.coarsePointer.set(matches));
    const stopNarrow = watchMedia(NARROW_QUERY, matches => this.narrowScreen.set(matches));
    this.stopCompactWatch = () => { stopCompact(); stopCoarse(); stopNarrow(); };
    const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    if (!id) { this.fail('Caso no encontrado.', null, null); return; }
    if (this.mode() === 'rehearsal') {
      this.beginRehearsal(id, this.rehearsalFrom = escenaDesde(this.route.snapshot.queryParamMap?.get('desde')));
      return;
    }

    // DP-26: el permiso de reemplazo viaja en el estado de la navegación y se BORRA en el acto, antes de usarlo: una
    // recarga, «atrás/adelante» o un marcador ya no lo traen. Solo vale para el intento exacto que la persona aceptó perder.
    const reemplazar = this.tomarPermisoDeReemplazo();
    // `?intento=continuar` (Inicio, Casos, la ficha): continuar no destruye nada, así que puede ir en la URL. Cualquier otro
    // valor, como el antiguo `?intento=nuevo`, ya no significa nada: se ofrece reanudar como siempre.
    const continuar = this.route.snapshot.queryParamMap?.get('intento') === 'continuar';
    const offer = (active: SimulationAttemptState) => {
      this.pendingActiveAttempt.set(active);
      this.showResumePrompt.set(true);
      this.loading.set(false);
    };
    const decidir = (active: SimulationAttemptState) => {
      if (reemplazar !== null && active.attemptId === reemplazar) {
        // El intento abierto es EXACTAMENTE el que la persona vio y aceptó perder en la ficha: se reemplaza una vez.
        this.pendingActiveAttempt.set(active);
        this.startNewAttempt();
        return;
      }
      if (continuar) {
        this.pendingActiveAttempt.set(active);
        this.resumeAttempt();
        return;
      }
      offer(active);
    };
    const numero = this.nuevoArranque();
    // Siempre una lectura FRESCA del intento abierto (nunca la caché de acceso): de ella depende reemplazar o no.
    this.simulationService.getActiveAttempt(id).subscribe({
      next: active => {
        if (!this.esArranqueVigente(numero)) return;
        if (active && (active.status === 'IN_PROGRESS' || active.status === 'PAUSED')) {
          // Una pausa que quedó sin registrar (salió sin red): se registra ANTES de la tarjeta, que así dice «Reanudar intento en pausa».
          if (active.status === 'IN_PROGRESS' && hayMarcaDePausa(this.almacen, active.attemptId)) {
            this.simulationService.safeExit(active.attemptId, 'Salida segura solicitada').pipe(timeout(PLAZO_ACCION_MS)).subscribe({
              next: paused => {
                if (!this.esArranqueVigente(numero)) return;
                borrarMarcaDePausa(this.almacen, active.attemptId);
                decidir(paused);
              },
              error: () => { if (this.esArranqueVigente(numero)) decidir(active); },
            });
            return;
          }
          decidir(active);
          return;
        }
        // Sin intento abierto no hay nada que reemplazar: se empieza uno con forceNew = false (DP-26, paso 4).
        this.beginAttempt(id, false);
      },
      error: () => { if (this.esArranqueVigente(numero)) this.beginAttempt(id, false); }
    });
  }

  /**
   * Lee y borra el permiso de reemplazo de `history.state` (DP-26). Devuelve el `attemptId` aceptado, o `null` si no hay
   * permiso o si no trae un `attemptId` (un permiso sin intento no reemplaza nada).
   */
  private tomarPermisoDeReemplazo(): string | null {
    const estado = estadoDeNavegacion();
    if (!estado || !('reemplazar' in estado)) return null;
    const permiso = estado['reemplazar'] as { attemptId?: unknown } | null | undefined;
    try {
      const [ruta, consulta = ''] = (this.location?.path() ?? '').split('?');
      if (this.location) this.location.replaceState(ruta, consulta, { ...estado, reemplazar: undefined });
      else window.history.replaceState({ ...estado, reemplazar: undefined }, '');
    } catch {
      // Sin historial que reescribir (pruebas, un navegador raro): el permiso igual se lee una sola vez por montaje.
    }
    return typeof permiso?.attemptId === 'string' && permiso.attemptId ? permiso.attemptId : null;
  }

  /** Un arranque nuevo: su número pasa a ser el vigente y las respuestas de los anteriores se ignoran. */
  private nuevoArranque(): number {
    const numero = this.arranque() + 1;
    this.arranque.set(numero);
    return numero;
  }

  private esArranqueVigente(numero: number): boolean {
    return !this.destroyed && numero === this.arranque();
  }

  /** Sincroniza también la posición más reciente antes de salir a leer la ficha. */
  verFichaDelCaso(): void {
    const intento = this.attempt();
    if (!intento || this.mode() === 'rehearsal' || this.busy() || this.fadeActive()) return;
    this.busy.set(true);
    this.withSyncedPosition(() => {
      void this.router.navigate(['/portal/simulador', intento.caseVersionId, 'ficha'])
        .catch(() => this.showActionError('No pudimos abrir la ficha del caso.'))
        .finally(() => this.busy.set(false));
    });
  }

  /** «Volver a la ficha» (o al editor, en ensayo) desde un umbral lento: lo que estaba en curso se descarta al salir. */
  volverDesdeUmbral(): void {
    const id = this.attempt()?.caseVersionId ?? Number(this.route.snapshot.paramMap.get('caseVersionId'));
    // Lo que llegue después ya no es de nadie: ni mundo ni audio (la bandera `destroyed` hace el resto al desmontar).
    this.nuevoArranque();
    void this.router.navigate(this.mode() === 'rehearsal' ? ['/portal/casos', id, 'editor'] : ['/portal/simulador', id, 'ficha']);
  }

  /** El velo se retira (300 ms) y el HUD entra escalonado (clase `revelando`); el foco pasa al juego si quedó suelto. */
  private revelarMundo(): void {
    this.revelando.set(true);
    if (this.revelandoTimer !== null) window.clearTimeout(this.revelandoTimer);
    this.revelandoTimer = window.setTimeout(() => { this.revelandoTimer = null; this.revelando.set(false); }, REVELAR_MS);
    afterNextRender(() => this.recuperarFocoDelMundo(), { injector: this.injector });
  }

  private recuperarFocoDelMundo(): void {
    const juego = this.host?.nativeElement.querySelector<HTMLElement>('.game-container');
    const documento = juego?.ownerDocument;
    const activo = documento?.activeElement;
    if (activo && activo !== documento?.body && activo.isConnected
      && !activo.closest('app-umbral-caso, [inert], [hidden], :disabled')) return;
    juego?.focus({ preventScroll: true });
  }

  /** Se ejecuta tras desmontar la trampa anterior y después de que aparezca la capa que toma el relevo. */
  private relevarFocoDeLaEntrada(): void {
    afterNextRender(() => {
      const siguiente = this.tutor() ? 'app-tutor-caso' : this.controlsVisible() ? '.help-layer--controles' : null;
      if (siguiente) {
        this.host?.nativeElement.querySelector<HTMLElement>(`${siguiente} [cdkFocusInitial]`)?.focus({ preventScroll: true });
      } else if (!this.inputBlocked() && !this.helpOpen()) {
        this.recuperarFocoDelMundo();
      }
    }, { injector: this.injector });
  }

  resumeAttempt() {
    const active = this.pendingActiveAttempt();
    if (!active) return;
    // La persona eligió seguir: una marca de pausa que no se pudo registrar ya no debe pedir otra al recargar (R-1).
    borrarMarcaDePausa(this.almacen, active.attemptId);
    this.showResumePrompt.set(false);
    this.loading.set(true);
    if (active.status === 'PAUSED') {
      // Pausa reanudable real (ETH-02 A): transición explícita en backend,
      // mismo attemptId; el consentimiento se vuelve a pedir en bootstrap.
      const numero = this.nuevoArranque();
      this.simulationService.resumeAttempt(active.attemptId).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
        next: attempt => { if (this.esArranqueVigente(numero)) this.bootstrapAttempt(attempt); },
        error: cause => { if (this.esArranqueVigente(numero)) this.fail('No pudimos reanudar el intento.', cause, () => this.resumeAttempt()); },
      });
      return;
    }
    this.bootstrapAttempt(active);
  }

  /**
   * Un fallo de arranque nunca se traga (F6-1): se pinta con su mensaje y código HTTP y, si hay algo que reintentar,
   * «Reintentar» vuelve a pedir LO QUE FALLÓ (el intento, la reanudación o el mundo), no la página entera.
   */
  private fail(message: string, cause: unknown, retry: (() => void) | null): void {
    this.errorStatus.set(cause instanceof HttpErrorResponse ? cause.status : null);
    this.retryAction.set(retry);
    this.error.set(message);
    this.loading.set(false);
  }

  retryFromError(): void {
    const retry = this.retryAction();
    if (!retry) return;
    this.error.set('');
    this.errorStatus.set(null);
    this.retryAction.set(null);
    this.loading.set(true);
    retry();
  }

  /** Primer cuadro del mundo pintado: el indicador de arranque se retira (no vuelve con cada cambio de sala). */
  onWorldReady(): void {
    perfEnd('decision-to-scene');
    this.worldRendered.set(true);
    this.refreshGuide();
    // El mundo pintó después de que el plazo venciera: el error de ese arranque ya no es verdad y taparía el juego.
    if (this.bootFailureShown && this.error()) {
      this.error.set('');
      this.errorStatus.set(null);
      this.retryAction.set(null);
    }
    this.bootFailureShown = false;
    this.ensureReactions();
  }

  /** Crea las reacciones al acercarse con el mundo y el intento (una vez por intento) y las pone al día. */
  private ensureReactions(): void {
    const attempt = this.attempt();
    if (!attempt || !this.gameWorld || this.reactionsAttemptId === attempt.attemptId) return;
    this.reactions?.dispose();
    this.reactionsAttemptId = attempt.attemptId;
    const mundo: MundoCercania = {
      faceTowards: (key, target) => this.gameWorld?.faceTowards(key, target),
      playGesture: (key, gesto, options) => this.gameWorld?.playGesture(key, gesto, options) ?? Promise.resolve(),
      peopleNear: (key, radius) => this.gameWorld?.peopleNear(key, radius) ?? [],
      isKeyPerson: key => this.gameWorld?.isKeyPerson(key) ?? false,
      isPerson: key => this.world()?.objects?.some(o => o.key === key && o.type === 'PERSON') ?? false,
    };
    this.reactions = new ProximityReactions(mundo, memoriaDeComentarios(attempt.attemptId), RELOJ_DE_VENTANA, b => this.showBubble(b));
    this.reactions.setComments(this.world()?.comments ?? []);
    this.reactions.setActivation(attempt.persona.activation);
    this.reactions.setBlocked(this.inputBlocked() || this.reacting());
  }

  private showBubble(b: BurbujaVisible | null): void {
    this.bubble.set(b);
    if (b) { if (!this.bubbleFrame) this.followBubble(); return; }
    if (this.bubbleFrame) cancelAnimationFrame(this.bubbleFrame);
    this.bubbleFrame = 0;
    this.bubbleAnchor.set(null);
  }

  /** Sigue la cabeza de quien habla por cuadro, acotada al lienzo; para sola cuando la burbuja se va. */
  private readonly followBubble = (): void => {
    const b = this.bubble();
    if (!b || this.destroyed) { this.bubbleFrame = 0; return; }
    const raw = this.gameWorld?.screenAnchorOf(b.objectKey) ?? null;
    const zone = this.canvasZone()?.nativeElement;
    const next = raw && zone ? acotarAncla(raw, { ancho: zone.clientWidth, alto: zone.clientHeight }) : raw;
    const prev = this.bubbleAnchor();
    if (next?.x !== prev?.x || next?.y !== prev?.y) this.bubbleAnchor.set(next);
    this.bubbleFrame = requestAnimationFrame(this.followBubble);
  };

  /** Reanudación desde el overlay de pausa (outcome), con el mundo ya cargado. */
  resumeCurrentAttempt(): void {
    const current = this.attempt();
    if (!current || current.status !== 'PAUSED') return;
    // La pausa local aún no llegó al servidor (su traza importa): se registra primero y la reanudación queda encolada.
    if (this.pausa.activa) { this.resumeQueued = true; this.pausa.intentar(); return; }
    if (this.busy()) {
      // La pausa recarga el mundo y la tarjeta «Reanudar» aparece antes de que termine: ese toque
      // no se pierde, queda encolado y se atiende al liberar `busy()` (ver `finishWorldReload`).
      if (this.worldReloadPending) this.resumeQueued = true;
      return;
    }
    this.busy.set(true);
    this.simulationService.resumeAttempt(current.attemptId).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: attempt => {
        this.busy.set(false);
        this.attempt.set(attempt);
        borrarMarcaDePausa(this.almacen, attempt.attemptId);   // R-1: ni la marca ni la nota de un rechazo sobreviven a reanudar
        this.pauseState.set('none');
        // Un diálogo que llegó tarde mientras el intento estaba en pausa (la supervisión se abre
        // al terminar la reacción a la decisión) no debe reaparecer al reanudar.
        this.dialogue.set(null);
        // La consecuencia de la decisión que la pausa cortó se lee ahora (A3); una elección que no se guardó, se dice.
        const consequence = this.consequenceOnResume ? this.buildConsequenceDialogue(this.consequenceOnResume) : null;
        this.consequenceOnResume = null;
        if (consequence) this.dialogue.set(consequence);
        this.restorePendingDecision(attempt, DRAFT_COPY.choiceNotSaved.text);
        this.replayAppliedDecision();
        this.positionGiveUps = 0;
        this.trackPersona(attempt);
        this.applyAudioScene(attempt);
        // Si se pausó desde la introducción sin haberla leído, reaparece (`resolveIntroStep` ya lo
        // decide); el consentimiento ya está dado en esta sesión y no se vuelve a pedir.
        const world = this.world();
        if (world) this.maybeShowInitialCaseIntro();
        this.announce('Intento reanudado. Continúas exactamente donde quedaste.');
      },
      error: () => { this.showActionError('No pudimos reanudar el intento.'); this.busy.set(false); },
    });
  }

  /** Lo incierto del intento anterior (decisión sin confirmar, lectura, fallos de guardado, pausa en espera) no bloquea al nuevo. */
  private resetAttemptScopedState(): void {
    for (const id of new Set([this.attempt()?.attemptId, this.pendingActiveAttempt()?.attemptId])) {
      if (!id) continue;
      this.clearPendingDecision(id);
      borrarLectura(this.almacen, id);
      borrarMarcaDePausa(this.almacen, id);
    }
    this.cancelarReintentos();
    this.pendingDecisionRequest = null;
    this.decisionInFlight = false;
    this.consequenceOnResume = this.replayIntent = null;
    this.positionFailures = this.positionGiveUps = 0;
    this.dialogueStart.set(null);
  }

  /** Apaga los reintentos pendientes (pausa, decisión, posición). */
  private cancelarReintentos(): void {
    this.pausa.cancelar();
    this.decisionOnline.cancelar();
    this.positionRetry.cancelar();
    // Al salir del juego, Inicio y Casos no deben pintar lo de antes (B4a, hallazgo 2): aquí se empieza, pausa,
    // reanuda o termina el intento, así que lo guardado de este caso ya no vale. Se pide perezoso y a prueba de fallos:
    // las pruebas de instancia montan el juego sin la sesión que la caché necesita.
    const caso = this.attempt()?.caseVersionId ?? Number(this.route.snapshot?.paramMap?.get('caseVersionId'));
    // La caché sigue a la sesión con un effect sobre `currentUser`: sin una sesión de verdad (pruebas de instancia con un
    // AuthService de mentira) no se crea, porque su effect fallaría después, fuera de este try.
    const sesion = this.injector.get(AuthService, null) as { currentUser?: unknown } | null;
    if (caso && typeof sesion?.currentUser === 'function') {
      try { this.injector.get(CaseAccessCache).olvidarCaso(caso); } catch { /* sin caché no hay nada viejo que olvidar */ }
    }
  }

  startNewAttempt() {
    const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    if (!id) return;
    if (this.mode() === 'rehearsal') { this.beginRehearsal(id, this.rehearsalFrom); return; }
    // El intento que la persona vio y aceptó perder: se toma ANTES de limpiar el estado y viaja al servidor.
    const aceptado = this.pendingActiveAttempt()?.attemptId;
    this.showResumePrompt.set(false);
    this.resetAttemptScopedState();
    // Nada del intento anterior sobrevive: ni su diálogo o selección, ni la bitácora abierta, ni una
    // decisión que esperaba confirmación de evidencia (las opciones se repiten entre intentos).
    this.clearTransientOverlays();
    this.nearbyInteraction.set(null);
    this.endPausing();
    // Los avisos pendientes eran del intento anterior.
    this.resetNotices();
    this.loading.set(true);
    this.beginAttempt(id, true, aceptado);
  }

  /** Abre (o reabre) el ensayo: `POST rehearsal` cierra el anterior; sin consentimiento ni introducción (4.2.1) y sin guardar el token. */
  private beginRehearsal(caseVersionId: number, desde: number | null): void {
    this.resetAttemptScopedState();
    this.rehearsalGone.set(false);
    this.clearTransientOverlays();   // incluye los avisos pendientes (resetNotices)
    this.nearbyInteraction.set(null);
    this.endPausing();
    this.error.set('');
    this.loading.set(true);
    this.rehearsalApi.start(caseVersionId, desde).subscribe({
      next: ({ rehearsal, ...attempt }) => {
        this.rehearsal.set(rehearsal);
        this.attempt.set(attempt);
        this.viewedNpcKeys.set(new Set());
        this.busy.set(false);
        this.worldStarted.set(false);   // arranque limpio: el mundo anterior se vuelve a montar
        this.startWorld(attempt);
      },
      error: cause => {
        if (reintentarSinDesde(desde, cause)) this.beginRehearsal(caseVersionId, null);
        else this.fail(DRAFT_COPY.rehearsalOpenFailed.text, cause, () => this.beginRehearsal(caseVersionId, desde));
      },
    });
  }

  /** El panel de autora cambió algo: guarda el bloque nuevo y relee el juego (mismo token) para que el mundo lo muestre. */
  reloadRehearsal(block: RehearsalBlock): void {
    const attempt = this.attempt();
    if (!attempt) return;
    this.rehearsal.set(block);
    this.clearTransientOverlays();   // nada del juego anterior sobrevive al ajuste
    this.busy.set(true);
    this.viewedNpcKeys.set(new Set());   // lo hablado lo dice el mundo recién leído
    this.simulationService.getAttempt(attempt.attemptId).subscribe({
      next: fresh => { this.attempt.set(this.attempt()?.status === 'PAUSED' ? { ...fresh, status: 'PAUSED' } : fresh); this.loadWorld(fresh); },
      error: cause => {
        this.busy.set(false);
        this.orRehearsalGone(cause, () => this.fail(DRAFT_COPY.rehearsalReloadFailed.text, cause, () => this.reloadRehearsal(block)));
      },
    });
  }

  /** El ensayo se descartó o cerró: se corta la secuencia y la burbuja y se ofrece abrir otro. Se dice una sola vez. */
  showRehearsalGone(why: 'gone' | 'closed' = 'gone'): void {
    if (this.rehearsalGone()) return;
    this.cancelarReintentos();
    this.endPausing();
    this.rehearsalWhy.set(why);
    this.reaction?.cancel();
    this.pendingAfterReaction = null;
    this.reactions?.dispose();
    this.reacting.set(false); this.busy.set(false); this.loading.set(false); this.fadeActive.set(false);
    this.dismissActionError();
    this.rehearsalGone.set(true);
    this.announce((why === 'closed' ? DRAFT_COPY.rehearsalClosed : DRAFT_COPY.rehearsalGone).text, 'assertive');
  }

  /**
   * El intento se abrió de nuevo en otra pestaña u otro equipo y el servidor cerró este como reemplazado (V4): se cortan los
   * reintentos (pausa, decisión, posición), se retira lo que estaba abierto y la pantalla del cierre dice «Intento
   * reemplazado» con «Volver al catálogo», desde donde se sigue el intento nuevo. Se dice una sola vez.
   */
  private showAttemptReplaced(attemptId: string): void {
    const current = this.attempt();
    if (!current || current.attemptId !== attemptId || current.status === 'REPLACED') return;
    this.cancelarReintentos();
    this.endPausing();
    this.reaction?.cancel();
    this.pendingAfterReaction = null;
    this.reacting.set(false); this.busy.set(false); this.loading.set(false); this.fadeActive.set(false);
    this.pendingDecisionRequest = null;
    this.decisionInFlight = false;
    this.consequenceOnResume = this.replayIntent = null;
    this.positionFailures = this.positionGiveUps = 0;
    if (this.positionSaveHandle) { window.clearTimeout(this.positionSaveHandle); this.positionSaveHandle = null; }
    this.dismissActionError();
    this.clearTransientOverlays();
    borrarMarcaDePausa(this.almacen, attemptId);
    this.attempt.set({ ...current, status: 'REPLACED' });
    // Lo mismo que dice la pantalla del cierre (encabezado y titular de `attempt-outcome`): sin texto nuevo que validar.
    this.announce('Intento reemplazado. Empezaste un intento nuevo; este quedó cerrado tal como estaba.', 'assertive');
  }

  /** Ensayo perdido: nada que pausar en el servidor; «Salida segura» y Esc llevan al editor (REGLA-004). */
  private leaveRehearsal(): void { void this.router.navigate(['/portal/casos', this.attempt()?.caseVersionId ?? Number(this.route.snapshot.paramMap.get('caseVersionId')), 'editor']); }

  /** «Empezar de nuevo» tras perder el ensayo: otro ensayo en la escena en la que estaba. */
  restartRehearsalHere(): void { const id = Number(this.route.snapshot.paramMap.get('caseVersionId')); if (id) this.beginRehearsal(id, this.rehearsal()?.sceneId ?? this.rehearsalFrom); }

  /**
   * En ensayo, un 403/404/409 de las rutas del juego se confirma con la lectura del bloque (7.4); si no es un ensayo perdido o
   * cerrado, sigue su camino. Como estudiante, un 404 se confirma leyendo el intento: si también da 404, otra pestaña u otro
   * equipo lo reemplazó (V4) y se dice así, sin reintentar ni culpar a la conexión.
   */
  private orRehearsalGone(cause: unknown, otherwise: () => void): void {
    const attempt = this.attempt();
    if (attempt && debeConfirmarIntento(this.mode(), cause)) {
      this.simulationService.getAttempt(attempt.attemptId).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
        next: () => otherwise(),
        error: check => { if (intentoPerdido(check)) this.showAttemptReplaced(attempt.attemptId); else otherwise(); },
      });
      return;
    }
    if (!attempt || !debeConfirmarEnsayo(this.mode(), cause)) { otherwise(); return; }
    this.rehearsalApi.read(attempt.caseVersionId, attempt.attemptId).subscribe({
      next: () => otherwise(),
      error: check => { const v = veredictoDeLectura(check); if (v) this.showRehearsalGone(v === 'cerrado' ? 'closed' : 'gone'); else otherwise(); },
    });
  }

  private beginAttempt(caseVersionId: number, forceNew: boolean, expectedAttemptId?: string) {
    const numero = this.nuevoArranque();
    this.simulationService.startAttempt(caseVersionId, forceNew, expectedAttemptId).subscribe({
      next: attempt => { if (this.esArranqueVigente(numero)) this.bootstrapAttempt(attempt); },
      // Un rechazo de acceso (cerró, aún no abre, secuencia) se dice con el aviso del caso y no se reintenta: repetirlo
      // da el mismo 403. Cualquier otro fallo conserva su mensaje y su reintento.
      error: cause => {
        if (!this.esArranqueVigente(numero)) return;
        // 409: el intento abierto ya no es el que la persona aceptó perder (otra pestaña lo reemplazó o lo abrió) o el
        // servidor no deja reemplazarlo. Nunca se reintenta a ciegas: se relee y se vuelve a preguntar.
        if (forceNew && esConflictoDeIntento(cause)) { this.volverAPreguntar(caseVersionId); return; }
        const refused = accessErrorMessage(cause);
        if (refused) this.fail(refused, cause, null);
        else this.fail('No pudimos iniciar la simulación. Inténtalo de nuevo.', cause, () => this.beginAttempt(caseVersionId, forceNew, expectedAttemptId));
      },
    });
  }

  /** Relee el intento abierto tras un conflicto y ofrece otra vez «Continuar / Iniciar nuevo» con lo que hay ahora. */
  private volverAPreguntar(caseVersionId: number): void {
    const numero = this.nuevoArranque();
    this.announce(DRAFT_COPY.intentoCambio.text, 'assertive');
    this.simulationService.getActiveAttempt(caseVersionId).subscribe({
      next: active => {
        if (!this.esArranqueVigente(numero)) return;
        if (active && (active.status === 'IN_PROGRESS' || active.status === 'PAUSED')) {
          this.pendingActiveAttempt.set(active);
          this.showResumePrompt.set(true);
          this.loading.set(false);
          return;
        }
        this.beginAttempt(caseVersionId, false);
      },
      error: cause => {
        if (this.esArranqueVigente(numero)) this.fail('No pudimos iniciar la simulación. Inténtalo de nuevo.', cause, () => this.volverAPreguntar(caseVersionId));
      },
    });
  }

  private bootstrapAttempt(attempt: SimulationAttemptState) {
    // S3-2b: el consentimiento puede estar ya en el servidor (otro navegador, otra sesión): se pregunta ANTES de decidir si
    // se pide el aviso. Hasta que responde solo se ve el indicador de carga; si falla o tarda, se pide el aviso.
    this.primeConsent(attempt, () => this.continueBootstrap(attempt));
  }

  /**
   * Pregunta al servidor (`prime`, opcional en el registro) si la persona ya aceptó el aviso y recién entonces sigue con
   * `then`. Nunca bloquea ni se ve: la lectura que falla, se rechaza, lanza o pasa de `CONSENT_PRIME_TIMEOUT_MS` deja todo
   * como estaba (= se pide el aviso). Un registro sin `prime`, o un intento que no está en curso, sigue en el acto.
   */
  private primeConsent(attempt: SimulationAttemptState, then: () => void): void {
    let pending: PromiseLike<void> | undefined;
    if (attempt.status === 'IN_PROGRESS') {
      try {
        pending = this.consentRecorder.prime?.(attempt.caseVersionId);
      } catch {
        pending = undefined;
      }
    }
    if (!pending || typeof pending.then !== 'function') {
      then();
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => proceed(), CONSENT_PRIME_TIMEOUT_MS);
    this.consentPrimeTimer = timer;
    const proceed = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (this.consentPrimeTimer === timer) this.consentPrimeTimer = null;
      // Una respuesta que llega con la pantalla ya cerrada no arranca audio ni mundo.
      if (!this.destroyed) then();
    };
    pending.then(proceed, proceed);
  }

  private continueBootstrap(attempt: SimulationAttemptState) {
    this.attempt.set(attempt);
    this.persistAttemptToken(attempt);
    // ETH-01: sin consentimiento no se inicializa audio, ni se pide el mundo,
    // ni se monta el HUD. Solo queda en pantalla la advertencia.
    if (attempt.status === 'IN_PROGRESS' && !this.hasContentConsent(attempt)) {
      this.worldStarted.set(false);
      this.loading.set(false);
      this.showContentWarning.set(true);
      return;
    }
    this.startWorld(attempt);
  }

  private hasContentConsent(attempt: SimulationAttemptState): boolean {
    return this.mode() === 'rehearsal' || this.consentRecorder.isGiven(this.caseConsentStorageKey(attempt));
  }

  /** Arranque real (post-consentimiento). Idempotente ante dobles llamadas. */
  private startWorld(attempt: SimulationAttemptState) {
    if (this.worldStarted()) return;
    this.worldStarted.set(true);
    // Un arranque nuevo (otro intento, otro consentimiento) muestra el indicador hasta SU primer cuadro.
    this.worldRendered.set(false);
    this.worldLoadPercent.set(null);
    this.loading.set(true);
    this.audioDirector.init();
    this.musicMuted.set(this.audioDirector.isMusicMuted());
    this.sfxMuted.set(this.audioDirector.isSfxMuted());
    this.lastPersona = { attemptId: attempt.attemptId, persona: attempt.persona };
    this.viewedNpcKeys.set(this.restoreViewedNpcKeys(attempt));
    this.restorePendingDecision(attempt);
    this.readingRestorePending = true;
    this.loadProgressMap(attempt);
    this.loadWorld(attempt);
    this.applyAudioScene(attempt);
  }

  private readonly overlayKeysDown = new Set<string>();

  /** Reserva la pulsación antes de que un hijo cierre la capa o el navegador devuelva el foco. */
  private readonly captureOverlayKey = (event: KeyboardEvent): void => {
    const key = event.code || event.key;
    if (!event.repeat) {
      const avanzaCinematica = this.cinematica() && (event.key === 'ArrowRight' || event.key === 'PageDown');
      if (avanzaCinematica || (OVERLAY_KEYS.has(event.key) && this.worldMotionPaused())) this.overlayKeysDown.add(key);
      else this.overlayKeysDown.delete(key);
      return;
    }
    if (!this.overlayKeysDown.has(key)) return;
    const target = event.target instanceof Element ? event.target : null;
    const desplazaLectura = (event.key === ' ' || event.key === 'PageDown')
      && target?.closest('app-cinematica-caso, app-tutor-caso') && isScrollRegionTarget(target);
    if (!desplazaLectura && !isTextEntryTarget(target) && event.key !== 'e' && event.key !== 'E') event.preventDefault();
    event.stopPropagation();
  };

  private readonly releaseOverlayKey = (event: KeyboardEvent): void => {
    this.overlayKeysDown.delete(event.code || event.key);
  };

  @HostListener('window:blur')
  clearOverlayKeys(): void { this.overlayKeysDown.clear(); }

  @HostListener('window:keydown', ['$event'])
  handleGlobalInteraction(event: KeyboardEvent) {
    // Los manejadores de las capas pueden consumir la tecla en document antes de que llegue a window.
    if (event.defaultPrevented) return;
    if (this.overlayKeysDown.has(event.code || event.key)) {
      // Este oyente se registra antes de que arranque el mundo. Phaser no debe encolar la tecla en window:
      // al consumirla en su siguiente cuadro, el botón podría haber cerrado la capa y devuelto el foco.
      // La acción nativa de Enter/Espacio sigue disponible en el botón de la capa.
      event.stopImmediatePropagation();
      if (!this.worldMotionPaused()) return;
    }
    if (this.rehearsalGone() && event.key !== 'Escape') return;   // ensayo perdido: el mundo no atiende teclas; Esc sigue
    // Durante la reacción solo Esc (salida segura) llega a la partida: nada abre interacciones ni mueve al jugador.
    if (this.reacting() && event.key !== 'Escape') return;
    // Un Esc mantenido (temblor, pulsación larga) no encadena acciones: sin esto, una sola pulsación cerraba la ayuda,
    // la bitácora y el diálogo y además pausaba el caso (~30 eventos por segundo). Solo cuenta el primer evento.
    if (event.key === 'Escape' && event.repeat) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    const editable = (event.target as HTMLElement | null)?.isContentEditable;

    if (this.showContentWarning()) {
      // El consentimiento exige activación explícita de sus botones (Tab +
      // Enter/click). Se traga Escape para que no caiga en la salida segura,
      // que mutaría el intento en backend sin decisión informada.
      if (event.key === 'Escape') event.preventDefault();
      return;
    }

    // La cinemática atiende sus teclas en su propio oyente (Esc la detiene; detenida, Esc es la salida segura): el mundo de
    // debajo no recibe ninguna.
    if (this.cinematica()) return;
    if (this.tutor()) {
      // REGLA-004: como en la tarjeta de entrada, Esc es la salida segura. Enter y Espacio pasan las líneas (el tutor).
      if (event.key === 'Escape') {
        event.preventDefault();
        this.pauseFromOverlay();
      }
      return;
    }

    if (this.showCaseIntro() || this.cambioDeLugar()) {
      // REGLA-004: Esc pausa también aquí. Va antes del chequeo de botones porque el foco de las
      // tarjetas siempre está en uno (`cdkFocusInitial`) y, sin este orden, Esc nunca llegaría.
      if (event.key === 'Escape') {
        event.preventDefault();
        this.pauseFromOverlay();
        return;
      }
      // Los botones de las tarjetas (Continuar, Silenciar música) se activan solos.
      if (tag === 'BUTTON' || tag === 'A') {
        this.activateCardButtonIfCancelled(event);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.continueFromCaseIntro();
      }
      return;
    }

    if (this.transitionNote() && !this.inputBlocked() && !this.helpOpen() && !this.controlsVisible() && event.key !== 'Escape') {
      const target = event.target instanceof Element ? event.target : null;
      if ((event.key === 'Enter' || event.key === ' ') && !isActivatableTarget(target) && !isTextEntryTarget(target)) {
        event.preventDefault();
        this.cerrarNotaDeTransicion();
      }
      return;
    }

    if (event.key === 'Escape') {
      // Cadena: controles → «Ir a…» → ayuda → bitácora → diálogo → pausa. La pausa sale en el acto, aunque haya una petición en curso.
      // Cerrar la tarjeta de controles no pausa: la pulsación se consume (P8).
      if (this.controlsVisible()) { event.preventDefault(); this.closeControls(); return; }
      if (this.placesOpen())  { event.preventDefault(); this.closePlaces(); return; }
      if (this.helpOpen())    { event.preventDefault(); this.helpOpen.set(false); return; }
      if (this.journalOpen()) { event.preventDefault(); this.journalOpen.set(false); return; }
      if (this.dialogue())    { event.preventDefault(); this.closeDialogue(); return; }
      if (this.pendingWalkInteraction()) { event.preventDefault(); this.stopPendingWalk(); return; }
      if (this.rehearsalGone() || this.attempt()?.status === 'IN_PROGRESS' || this.reactingToLast()) { event.preventDefault(); this.pauseFromOverlay(); }
      return;
    }

    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
    // Enter/Espacio conservan la activación propia de botones y enlaces. Otros
    // atajos (J, E) siguen siendo globales aunque el foco permanezca un instante
    // en el botón que acaba de cerrar un overlay.
    if ((tag === 'BUTTON' || tag === 'A') && (event.key === 'Enter' || event.key === ' ')) return;

    if (this.inputBlocked()) {
      if (['e', 'E', 'j', 'J', ' ', 'Enter'].includes(event.key)) event.preventDefault();
      return;
    }

    // Con la pantalla de ayuda abierta E, J, Espacio y Enter no actúan sobre el mundo de debajo (Espacio sigue desplazando el texto).
    if ((this.helpOpen() || this.controlsVisible()) && ['e', 'E', 'j', 'J', ' ', 'Enter'].includes(event.key)) return;

    // Atajos de una letra (F6-10; WCAG 2.1.4): apagables, y solo actúan con el foco en el juego, en el cuerpo o en un
    // botón de la interfaz (nunca en un campo, una región con scroll ni un diálogo). Enter y Espacio no dependen del
    // ajuste. El destino de un keydown sintético puede ser el documento, que no es un elemento.
    const isLetterShortcut = event.key === 'j' || event.key === 'J' || event.key === 'e' || event.key === 'E'
      || event.key === 'z' || event.key === 'Z' || event.key === 'm' || event.key === 'M'
      || event.key === 'i' || event.key === 'I' || event.key === '?';
    const focusTarget = event.target instanceof Element ? event.target : null;
    if (isLetterShortcut && (!this.shortcuts.enabled() || !isShortcutContext(focusTarget))) return;

    // Vista cercana (bloque M1): la cámara sigue al personaje de cerca, para quien ve poco. Se recuerda.
    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      if (!event.repeat) this.cameraSettings.toggleCercana();
      return;
    }

    // Plano del lugar (bloque M1): M lo abre; con él abierto, M y Esc los atiende el propio plano.
    if (event.key === 'm' || event.key === 'M') {
      if (!this.placePlan()) return;
      event.preventDefault();
      if (!event.repeat) this.openPlan();
      return;
    }

    if (event.key === 'j' || event.key === 'J') {
      event.preventDefault();
      this.journalOpen.set(!this.journalOpen());
      return;
    }

    // «Ir a…» (P8): I abre la lista de personas y puertas, igual que su botón de la cabecera. Con una capa abierta no actúa.
    if ((event.key === 'i' || event.key === 'I') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (this.helpOpen() || this.controlsVisible() || this.attempt()?.status !== 'IN_PROGRESS') return;
      event.preventDefault();
      if (!event.repeat) this.openPlaces();
      return;
    }

    // Controles (P8): «?» abre la tarjeta y, con ella abierta, la cierra.
    if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!event.repeat) { if (this.controlsVisible()) this.closeControls(); else this.openControls(); }
      return;
    }

    if (['e','E',' ','Enter'].includes(event.key)) {
      const nb = this.nearbyInteraction();
      if (!nb) return;
      event.preventDefault();
      // Mantener la tecla pulsada no repite la acción (al cerrar el diálogo volvería a abrirse).
      if (!event.repeat) this.openInteraction(nb);
    }
  }

  /**
   * Red de seguridad para los botones de las tarjetas (Continuar, Silenciar música). Phaser ya no
   * captura Enter ni Espacio (`addKeys(…, false)` y `disableGlobalCapture()`), así que la
   * activación nativa del botón funciona sola y aquí no se espera hacer nada. Solo actúa si
   * algo más en `window` cancela la tecla: se mira al terminar el despacho y, si quedó
   * cancelada, el botón se activa a mano; si no, no se hace nada (evita la doble activación).
   */
  private activateCardButtonIfCancelled(event: KeyboardEvent): void {
    const button = event.target as HTMLElement | null;
    if (button?.tagName !== 'BUTTON' || event.repeat) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    window.setTimeout(() => { if (event.defaultPrevented) button.click(); });
  }

  /** Alto (px CSS) de la franja de cine de arriba: el mismo `clamp(28px, 8%, 72px)` de su estilo. */
  private cinemaTopPx(): number {
    const height = this.canvasZone()?.nativeElement.getBoundingClientRect().height ?? 0;
    return Math.round(Math.min(72, Math.max(28, height * 0.08)));
  }

  /** Alto (px CSS) del cuadro de diálogo de abajo que tapa el lienzo; 0 si el diálogo va al costado o no hay. */
  private dialogueCoverCss(mode: string): number {
    const host = this.canvasZone()?.nativeElement;
    if (!host || typeof document === 'undefined') return 0;
    // Lo que tapa abajo: el cuadro de diálogo y, durante la reacción, la franja con lo que dice quien reacciona.
    // El cuadro y TODO lo que se le monta encima (aviso, ficha «Decisión», «Volver al mapa», «Ver pista»: se dibujan
    // fuera de su caja). La franja de la reacción vive en el DOM aunque no se vea: solo cuenta durante la reacción.
    const dialogo = mode === 'dialogue-cinematic' ? document.querySelector('app-dialogue-panel.dialogue-cinematic') : null;
    const raices = [
      this.reacting() ? document.querySelector('app-reaction-director .reaction-strip') : null,
    ].filter((r): r is Element => r !== null);
    const visible = (el: Element) => (el as Element & { checkVisibility?: (o?: object) => boolean })
      .checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
    const reaccion = raices.flatMap(r => [r, ...Array.from(r.querySelectorAll('*'))]).filter(visible);
    // El panel conserva su maqueta cuando espera la cámara, incluso si sus opciones aún son inertes.
    const panel = dialogo ? [dialogo, ...dialogo.querySelectorAll('.dialogue-strip, .panel-head, .speaker-name, .placa, .strip-body')] : [];
    const cajas = [...panel, ...reaccion].map(el => el.getBoundingClientRect());
    return altoTapado(host.getBoundingClientRect().bottom, cajas);
  }

  openInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS' || this.inputBlocked() || this.busy()) return;
    // La respuesta es el diálogo que se abre: la medida termina en el pintado que lo muestra (efecto del constructor).
    perfStart('interaction-to-response');

    // Una persona del escenario llega como `npc:{clave}`: no es un objeto del servidor (POST /interactions/npc:… da 404).
    if (interaction.key.startsWith('npc:')) {
      const npc = this.scenarioNpc(interaction.key);
      if (npc) this.openNpcDialogue(npc);
      return;
    }

    if (interaction.type === 'EXIT' && this.doorTargetNodeKey(interaction)) {
      // Cruzar una puerta no abre un diálogo: no es una «respuesta» y su medida no se arrastra a otro.
      perfCancel('interaction-to-response');
      this.tryOpenDoor(interaction);
      return;
    }

    // Una nota o un recurso del caso se lee sin preguntarle nada al servidor: su texto ya está en el mundo.
    if (readsLocally(interaction)) {
      this.showLocalReading(interaction);
      return;
    }

    if (isSceneAmbientInteraction(interaction.key)) {
      this.showAmbientDialogue(interaction);
      return;
    }

    if (isRiskyInteraction(interaction.key)) {
      this.showRiskyActionWarning(interaction);
      return;
    }

    this.openBackendInteraction(interaction);
  }

  handleFrontendChoice(key: string) {
    if (key === 'frontend:cancel-restricted') {
      this.pendingRestrictedInteraction.set(null);
      this.closeDialogue();
      return;
    }
    if (key === 'frontend:proceed-restricted') {
      const interaction = this.pendingRestrictedInteraction();
      this.pendingRestrictedInteraction.set(null);
      this.dialogue.set(null);
      if (interaction) this.openBackendInteraction(interaction);
    }
  }

  /** Abre «Cómo se juega» (botón «?» del HUD, fila de Ajustes o «Más ayuda»). Quien la abre ya vio la tarjeta de primera vez. */
  openHelp(): void {
    if (!this.ayudaDisponible()) return;
    this.markHelpCardSeen();
    this.controlsOpen.set(false);
    this.helpOpen.set(true);
  }

  /** «Controles» (cabecera) o «?»: abre la tarjeta de controles. Quien la abre ya no necesita la de primera vez. */
  openControls(): void {
    if (!this.ayudaDisponible()) return;
    this.markHelpCardSeen();
    this.helpOpen.set(false);
    this.controlsOpen.set(true);
  }

  /** «Entendido» o Esc en la tarjeta de controles: se da por vista y, si la pidió la persona, el foco vuelve a su botón. */
  closeControls(): void {
    const pedida = this.controlsOpen();
    this.markHelpCardSeen();
    this.controlsOpen.set(false);
    if (pedida) afterNextRender(() => document.querySelector<HTMLElement>('[data-hud-controls]')?.focus(), { injector: this.injector });
  }

  /** «Más ayuda» en la tarjeta de controles: cambia a la pantalla «Cómo se juega». */
  openHelpFromControls(): void {
    this.openHelp();
  }

  /** «Texto instantáneo» de Ajustes: se recuerda y se anuncia (el panel de diálogo lo aplica en la línea siguiente). */
  toggleInstantText(): void {
    this.instantText.toggle();
    this.announce(this.instantText.enabled() ? 'Texto instantáneo activado.' : 'Texto instantáneo desactivado.');
  }

  markHelpCardSeen(): void {
    markHelpSeen(HELP_FIRST_CARD);
    this.helpCardSeen.set(true);
    this.helpCardShown = false;
  }

  /** «Ver la ayuda otra vez» (Ajustes): borra la marca y la tarjeta de primera vez vuelve a mostrarse en esta sesión. */
  resetHelpCard(): void {
    resetHelpSeen();
    this.helpCardSeen.set(false);
  }

  /** El canvas recupera su tamaño al abrir o cerrar el panel lateral (AC-5): se relee el contenedor. */
  refreshWorldScale(): void {
    this.gameWorld?.refreshScale();
  }

  /** Texto, nombre accesible y ayuda del botón de la barra para un objeto o una persona cercana. */
  private interactionAction(obj: MapObjectState | null): {
    obj: MapObjectState; verb: InteractionVerb; ariaLabel: string; title: string;
  } | null {
    if (!obj) return null;
    const mapKey = this.world()?.map.key;
    const shown = { ...obj, label: getSceneDisplayLabel(obj, mapKey) };
    const verb = interactionVerb(shown, obj.type === 'EXIT' ? this.doorStatusFor(obj) : null);
    if (!verb) return null;
    const reason = verb.locked && verb.reason ? verb.reason : null;
    const rawDescription = obj.key.startsWith('npc:') ? '' : getSceneInteractionDescription(obj, mapKey);
    // La descripción sembrada solo sirve de ayuda (title) si dice algo que el verbo y la etiqueta no dicen.
    const description = rawDescription && !verb.text.toLowerCase().includes(rawDescription.trim().toLowerCase()) ? rawDescription : '';
    return {
      obj,
      verb,
      // El nombre contiene el texto visible (WCAG 2.5.3) y no promete la tecla: solo se rotula con puntero fino.
      ariaLabel: `Interactuar: ${verb.text}${reason ? `, bloqueada: ${reason}` : ''}`,
      title: reason ? `${verb.text}. ${reason}` : description ? `${verb.text}. ${description}` : verb.text,
    };
  }

  /** Pidió interactuar y no hay nada a su alcance (E, Espacio, Enter o el botón táctil): línea estática de `NOTHING_NEARBY_MS`. */
  showNothingNearby(): void {
    this.nothingNearbyNote.set(ORIENTATION_COPY.now.nothingNearby);
    // La barra ya no es una región viva: lo que la persona pidió se anuncia aquí, no por la línea de reposo.
    this.announce(ORIENTATION_COPY.now.nothingNearby);
    if (this.nothingNearbyTimer !== null) window.clearTimeout(this.nothingNearbyTimer);
    this.nothingNearbyTimer = window.setTimeout(() => {
      this.nothingNearbyTimer = null;
      this.nothingNearbyNote.set('');
    }, NOTHING_NEARBY_MS);
  }

  /** Persona del escenario (clave `npc:{clave}` del mundo) → su configuración; null si no está cargada. */
  private scenarioNpc(key: string): NpcConfig | null {
    const npcKey = key.replace(/^npc:/, '');
    return this.scenarioConfig()?.rooms.flatMap(room => room.npcs).find(npc => npc.key === npcKey) ?? null;
  }

  private openBackendInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS' || this.inputBlocked() || this.busy()) return;
    this.busy.set(true);
    this.withSyncedPosition(() => this.doOpenBackendInteraction(interaction));
  }

  private doOpenBackendInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') { this.busy.set(false); return; }

    const mapKey = this.world()?.map.key;
    const vigente = () => this.respuestaVigente(game.attemptId, mapKey);

    this.selectedInteraction.set(interaction);
    this.gameWorld?.focus(interaction.key);
    this.busy.set(true);
    this.simulationService.openInteraction(game.attemptId, interaction.key).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: result => {
        if (!vigente()) { this.busy.set(false); return; }
        this.world.set(result.world);
        this.mergeViewedNpcKeysFromWorld(result.world);
        this.applyDecisionOptions(result.world);
        this.selectedInteraction.set(result.interaction);
        this.dialogue.set(this.decorateDialogue(result.dialogue ?? result.interaction.dialogue, interaction.key));
        this.announcePickup(result);
        if (interaction.type !== 'PERSON') this.reactions?.onInspected(interaction.key);
        this.busy.set(false);
      },
      error: err => {
        perfCancel('interaction-to-response');
        if (!vigente()) { this.busy.set(false); return; }
        this.selectedInteraction.set(null);
        this.releaseDialogue();
        this.dialogueStart.set(null);
        this.reportApiError(err, 'No pudimos abrir la interacción.');
        this.busy.set(false);
      }
    });
  }

  private doorTargetNodeKey(obj: MapObjectState): string | null {
    const target = (obj.metadata as { targetNodeKey?: unknown } | undefined)?.targetNodeKey;
    return typeof target === 'string' && target ? target : null;
  }

  /** Fase 10: puerta espacial NO puntuada — usa el enterRoom existente.
   *  Caso PDF: envía doorKey (el backend re-valida puerta y requisitos), y la
   *  puerta bloqueada muestra un aviso transitorio, no un DialoguePanel. */
  private tryOpenDoor(door: MapObjectState) {
    const game = this.attempt();
    const target = this.doorTargetNodeKey(door);
    if (!game || !target || this.inputBlocked() || this.busy()) return;
    // Una sola función decide si la puerta se abre y por qué no: la misma de la barra, el rótulo y la lista.
    const context = this.doorContext();
    const status = context ? doorStatus(door, context) : null;
    if (!status || status.state === 'locked') {
      this.audioDirector.playSfx('ui_cancel');
      this.showDoorNotice(status?.message ?? ORIENTATION_COPY.door.fallback);
      return;
    }
    if (!this.doorInteractionArmed) {
      // La regla (alejarse de las puertas) se rearma al llegar una posición; si ya se está lejos y esa posición aún no llegó,
      // se rearma aquí mismo y la puerta se cruza (no se le pide dar pasos a quien ya los dio).
      const here = this.gameWorld?.playerPosition() ?? this.lastPosition ?? this.world()?.player ?? null;
      const message = here ? doorRearmMessage(here, this.doorPoints()) : null;
      if (here && message === null) {
        this.doorInteractionArmed = true;
      } else {
        this.audioDirector.playSfx('ui_cancel');
        this.showStepsNotice(message ?? ORIENTATION_COPY.door.awayFromDoorGeneric);
        return;
      }
    }
    this.busy.set(true);
    const cruzar = () => this.withSyncedPosition(() => this.triggerFade(() => {
      this.simulationService.enterRoom(
        game.attemptId, target, door.key,
      ).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
        next: world => {
          // La pausa llegó mientras la puerta esperaba: el mundo nuevo no pisa la pantalla de pausa.
          if (!this.respuestaVigente(game.attemptId)) {
            this.busy.set(false);
            this.fadeActive.set(false);
            return;
          }
          this.selectedInteraction.set(null);
          this.nearbyInteraction.set(null);
          this.dialogue.set(null);
          // «Entraste a …» lo anuncia `announceRoomChange` al aplicar el mundo: una sola fuente para el cambio de sala
          // (por puerta o por decisión), así no se dice dos veces.
          this.applyWorldWithScenario(world);
          // BORRADOR: texto pendiente de Psicología. Confirmado por el servidor.
          this.showSoftNotice('Tu avance se guardó.');
        },
        error: err => this.onDoorFailed(game.attemptId, err),
      });
    }, 'door_open'));
    // Acompañantes (`metadata.acompanantes`): caminan hasta la puerta, la cruzan y recién entonces cruza quien juega.
    const acompanantes = leerAcompanantes(door.metadata);
    if (acompanantes.length > 0 && this.gameWorld) {
      this.acompanantesCruzaron = true;
      const caminata = this.gameWorld.caminarALaPuerta({ puertaKey: door.key, puerta: { x: door.x, y: door.y }, acompanantes, jugador: false });
      this.refreshGuide();
      void caminata.then(() => {
        if (this.respuestaVigente(game.attemptId)) { cruzar(); return; }
        // La pausa llegó mientras caminaban: la puerta no se cruza y vuelven a verse.
        this.busy.set(false);
        this.devolverAcompanantes(game);
      });
    } else {
      cruzar();
    }
  }

  /** Se ocultaron acompañantes al cruzar la puerta: si la entrada falla se repone el mundo para que reaparezcan. */
  private acompanantesCruzaron = false;

  private devolverAcompanantes(game: SimulationAttemptState | null): void {
    if (!this.acompanantesCruzaron) return;
    this.acompanantesCruzaron = false;
    this.gameWorld?.mostrarAcompanantes();
    this.refreshGuide();
    if (game && this.respuestaVigente(game.attemptId)) this.loadWorld(game);
  }

  /** La puerta falló. Con la pausa puesta mientras esperaba, nada sale sobre la pantalla de pausa. */
  private onDoorFailed(attemptId: string, err: unknown): void {
    this.busy.set(false);
    this.fadeActive.set(false);
    this.devolverAcompanantes(this.attempt());
    if (!this.respuestaVigente(attemptId)) return;
    // Si el servidor rechaza una puerta que el cliente creía abierta, su texto (el del seed) puede nombrar
    // temas de las decisiones: se dice lo que el cliente sabe decir, sin ese texto.
    if (err instanceof HttpErrorResponse && err.status === 400) this.showDoorNotice(ORIENTATION_COPY.door.fallback);
    else this.reportApiError(err, 'No pudimos cruzar la puerta.');
  }

  /**
   * La intención de decidir en curso: si la misma opción falla en la red y se reenvía, viaja con el mismo `requestId`
   * (el servidor responde la repetición sin decidir dos veces). Se libera al recibir respuesta.
   */
  private pendingDecisionRequest: { decisionOptionId: number; requestId: string; nodeId?: number; dialogueKey?: string; choiceText?: string } | null = null;
  /** Dónde arranca la conversación que se reabre al recargar (R1): su clave y la línea en que iba. */
  readonly dialogueStart = signal<{ key: string; line: number } | null>(null);
  /** Almacenamiento de la sesión sin que un bloqueo (modo privado, cuota) rompa el juego. */
  private readonly almacen: AlmacenSimple = {
    getItem: key => this.readStored(key),
    setItem: (key, value) => this.writeStored(key, value),
    removeItem: key => { try { sessionStorage.removeItem(key); } catch { /* sin almacenamiento: nada que borrar */ } },
  };
  protected readonly dialoguePanel = viewChild(DialoguePanelComponent);
  private readingRestorePending = false;
  private readonly positionOrder = new OrdenDeRespuestas();
  private positionFailures = 0;

  /** Texto del aviso del sistema con ese id; '' si no hay o la persona ya lo cerró. */
  private noticeText(id: number | null): string {
    return id === null ? '' : this.systemNotices().find(message => message.id === id)?.text ?? '';
  }

  /**
   * Aviso accionable de puerta (VD-29): aviso de advertencia del sistema SIN cierre automático. Lo pinta y anuncia
   * `ui-toast-host` (una vez, con cortesía), no mueve el foco y reemplaza al de la puerta anterior.
   */
  /** P2: una sala por piezas no cargó entera: se ve su versión simple y se dice, sin bloquear el juego. */
  onSalaIncompleta(): void {
    if (this.attempt()?.status !== 'IN_PROGRESS') return;   // la sala se recargó bajo la pausa: el aviso no sale sobre ella
    this.notifications.show('warning', 'Parte de esta sala no cargó: se muestra una versión simple. Puedes seguir jugando.', 8000);
  }

  private showDoorNotice(message: string): void {
    this.dismissDoorNotice();
    this.doorNoticeId.set(this.notifications.show('warning', message, 0));
  }

  private dismissDoorNotice(): void {
    const id = this.doorNoticeId();
    if (id !== null) this.notifications.dismiss(id);
    this.doorNoticeId.set(null);
  }

  /** Error de una acción: aviso de error del sistema (no se va solo); el siguiente reemplaza al anterior. */
  private showActionError(message: string) {
    this.dismissActionError();
    this.actionErrorId.set(this.notifications.show('error', message));
  }

  private dismissActionError(): void {
    const id = this.actionErrorId();
    if (id !== null) this.notifications.dismiss(id);
    this.actionErrorId.set(null);
  }

  onRoomExit(event: { targetRoomKey: string; entryX: number; entryY: number }) {
    this.gameWorld?.transitionToRoom(event.targetRoomKey, event.entryX, event.entryY);
  }

  /** Disparo walk-over legacy (mapas sin scenarioConfig) — misma puerta gateada. */
  onDoorTrigger(event: { targetNodeKey: string; entryX: number; entryY: number }) {
    const door = this.world()?.objects.find(
      o => o.type === 'EXIT' && this.doorTargetNodeKey(o) === event.targetNodeKey,
    );
    if (door) this.tryOpenDoor(door);
  }

  /**
   * F§7.6: decora la conversación antes de mostrarla (el
   * aviso único de que se puede conocer más, herramienta ausente) y quita las decisiones que no son de esta
   * etapa: ningún objeto del mundo ofrece una decisión que `currentNode.options` no contiene (AC-3).
   * Las opciones no revelan su resultado pedagógico antes de responder.
   */
  private decorateDialogue(dialogue: DialogueState | null, speakerObjectKey: string): DialogueState | null {
    if (!dialogue) return null;
    const node = this.attempt()?.currentNode;
    return decorateDialogueState({ ...dialogue, speakerObjectKey }, {
      nodeKey: node?.key ?? null,
      nodeOptionIds: node?.options?.map(option => option.id) ?? null,
      world: this.world(),
      viewedNpcKeys: this.viewedNpcKeys(),
      copy: this.copyContext(),
      notice: this.refreshGuide().quedaPorConocer ? DRAFT_COPY.noticeMoreToKnow.text : null,
    });
  }

  /** Estado de una puerta (null si no es una salida o aún no hay mundo): lo leen la barra, el aviso y el rótulo del mundo. */
  doorStatusFor(door: MapObjectState): DoorStatus | null {
    if (door.type !== 'EXIT') return null;
    const context = this.doorContext();
    return context ? doorStatus(door, context) : null;
  }

  /** Contexto de las puertas (F§7.5): null mientras no haya intento y mundo. */
  private doorContext(): (DoorStatusContext & { world: SimulationWorldState }) | null {
    const nodo = this.visibleNode();
    const world = this.world();
    if (!nodo || !world) return null;
    return {
      nodeKey: nodo.key,
      world,
      viewedNpcKeys: collectViewedNpcKeys(world, this.viewedNpcKeys()),
      copy: this.copyContext(),
    };
  }

  /** Contexto de redacción de las puertas. */
  private copyContext(): CopyContext {
    const world = this.world();
    return {
      world,
      npcs: this.scenarioConfig()?.rooms.flatMap(room => room.npcs) ?? [],
    };
  }

  private showRiskyActionWarning(interaction: MapObjectState) {
    const def = getRiskyInteractionDef(interaction.key);
    if (!def) return;

    this.pendingRestrictedInteraction.set(interaction);
    this.selectedInteraction.set(interaction);
    this.gameWorld?.focus(interaction.key);
    this.dialogue.set({
      key: `risky-warning-${interaction.key}`,
      speakerName: def.speakerName,
      portraitKey: def.portraitKey,
      emotion: 'concerned',
      lines: [{
        order: 1,
        speakerName: def.speakerName,
        text: def.warningMessage,
        emotion: 'concerned',
      }],
      choices: [
        {
          key: 'frontend:cancel-restricted',
          text: 'Cancelar',
          decisionOptionId: null,
          requiredToolCode: null,
          effect: {},
        },
        {
          key: 'frontend:proceed-restricted',
          text: 'Continuar bajo riesgo',
          decisionOptionId: null,
          requiredToolCode: null,
          effect: {},
        },
      ],
    });
  }

  private showAmbientDialogue(interaction: MapObjectState) {
    this.selectedInteraction.set(interaction);
    const mapKey = this.world()?.map.key;
    const text = interaction.key === 'ambient:protocolo-noticia-dificil'
      ? PROTOCOL_INFO_MESSAGE
      : COMISARIA_AMBIENT_INFO[interaction.key]
        ?? getSceneInteractionDescription(interaction, mapKey);
    this.dialogue.set({
      key: interaction.key,
      speakerName: interaction.label,
      portraitKey: 'info',
      emotion: 'neutral',
      lines: [{
        order: 1,
        speakerName: interaction.label,
        text,
        emotion: 'neutral',
      }],
      choices: [],
    });
  }

  /**
   * Diálogo local de una nota o un recurso: su `interactionText` (lo que el docente escribió en «Al revisar») tal cual,
   * sin llamada al servidor. Sin texto, muestra su nombre.
   */
  private showLocalReading(interaction: MapObjectState): void {
    this.selectedInteraction.set(interaction);
    const text = interaction.interactionText.trim() || interaction.label;
    this.dialogue.set({
      key: interaction.key,
      speakerName: interaction.label,
      portraitKey: 'info',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: interaction.label, text, emotion: 'neutral' }],
      choices: [],
    });
  }

  /** Recoger algo: sonido discreto y «Obtuviste: {etiqueta}. Ya está en tu barra de herramientas.». */
  private announcePickup(result: InteractionResult): void {
    if (!result.unlockedToolCode) return;
    this.audioDirector.playSfx('item_pickup');
    this.showSoftNotice(ORIENTATION_COPY.notices.obtained(
      getSceneDisplayLabel(result.interaction, result.world.map.key),
    ));
  }

  /** Aviso breve (VD-29): se anuncia por la región de cortesía y, como ya se anunció, se apaga a los `NOTICE_MS`. */
  private showSoftNotice(message: string): void {
    this.softNotice.set(message);
    this.announce(message);
    if (this.softNoticeTimer !== null) window.clearTimeout(this.softNoticeTimer);
    this.softNoticeTimer = window.setTimeout(() => {
      this.softNoticeTimer = null;
      this.softNotice.set('');
      this.decisionSelection.set('');
    }, NOTICE_MS);
  }

  /**
   * Avisa con el mensaje real del servidor; si el interceptor ya avisó (sin red, sesión), no duplica. Un 403
   * `CONSENT_REQUIRED` no es un error de la acción: la pantalla vuelve al aviso (S3-2b).
   */
  private reportApiError(err: unknown, fallback: string): void {
    if (this.attempt()?.status === 'PAUSED') return;   // un error tardío no sale sobre la pantalla de pausa
    // Una acción que no respondió a tiempo: la persona lo ve y puede reintentar; nada queda colgado.
    if (esPlazoVencido(err)) {
      this.showActionError(DRAFT_COPY.actionSlow.text);
      return;
    }
    if (isConsentRequiredError(err)) {
      this.requireConsentAgain();
      return;
    }
    this.orRehearsalGone(err, () => {
      const message = apiErrorMessage(err, fallback);
      if (message) this.showActionError(message);
    });
  }

  /** Suelta la opción que el panel de diálogo tenía marcada como elegida. */
  private releaseDialogue(): void {
    this.dialogueReleaseToken.update(token => token + 1);
  }

  executeDecision(decisionOptionId: number) {
    const game = this.attempt();
    if (!game) return;
    if (this.busy()) {
      // La elección se descarta: sin soltar el panel la opción quedaría marcada y bloqueada.
      this.releaseDialogue();
      return;
    }
    if (this.pendingDecisionRequest && this.pendingDecisionRequest.decisionOptionId !== decisionOptionId) {
      this.showActionError(DRAFT_COPY.decisionConfirming.text);
      this.releaseDialogue();
      return;
    }
    if (!(game.currentNode.options ?? []).some(o => o.id === decisionOptionId)) {
      // Decisión de otra etapa (sala visitada por puerta): feedback claro, sin 400. Red de seguridad:
      // la decoración del diálogo ya no ofrece estas opciones.
      this.showActionError('Esta intervención pertenece a otra etapa del caso. Vuelve cuando el flujo te lleve a esta sala.');
      this.releaseDialogue();
      return;
    }
    const previousDialogue = this.dialogue();
    this.busy.set(true);
    perfStart('decision-to-scene');
    this.dialogue.set(null);
    this.journalMessage.set('');
    this.audioDirector.playSfx('dialogue_advance');   // el aviso de que la elección salió; ya no hay fundido aquí
    const request = this.decisionRequestFor(decisionOptionId);
    request.choiceText = previousDialogue?.choices.find(choice => choice.decisionOptionId === decisionOptionId)?.text ?? request.choiceText;
    this.decisionInFlight = true;
    this.simulationService.chooseDecision(
      game.attemptId, decisionOptionId, request.requestId,
    ).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: updated => this.onDecisionResult(game, updated),
      error: err => {
        perfCancel('decision-to-scene');
        this.decisionInFlight = false;
        if (this.choiceLostUnderPause()) return;
        // La conversación vuelve EN LAS OPCIONES (su última línea, M1); al volver la red la elección se reenvía sola.
        this.dialogue.set(previousDialogue);
        if (previousDialogue?.lines?.length) this.dialogueStart.set({ key: previousDialogue.key, line: previousDialogue.lines.length - 1 });
        if (this.pendingDecisionRequest) this.pendingDecisionRequest.dialogueKey = previousDialogue?.key;
        if (this.attempt()?.attemptId === game.attemptId) this.decisionOnline.armar(null);
        this.releaseDialogue();
        this.busy.set(false);
        this.handleDecisionFailure(err, game);
      }
    });
  }

  /** Llegó la respuesta de la decisión: con la pausa local puesta (Esc con ella en vuelo) se adopta sin reproducirla; si no, sigue su camino. */
  private onDecisionResult(game: SimulationAttemptState, updated: SimulationDecisionResult): void {
    this.decisionInFlight = false;
    // BORRADOR: texto pendiente de Psicología. La opción procede del nodo que se envió, también en reintentos de red.
    const selected = this.pendingDecisionRequest?.choiceText
      ?? game.currentNode.options?.find(option => option.id === this.pendingDecisionRequest?.decisionOptionId)?.text;
    this.clearPendingDecision(game.attemptId);
    if (this.attempt()?.status === 'PAUSED') this.adoptDecisionUnderPause(updated);
    else {
      this.decisionSelection.set(!updated.retry && selected ? `Elegiste: “${conNombre(selected, this.nombreDeQuienJuega())}”` : '');
      this.applyDecisionResult(game, updated);
    }
  }

  /** La decisión en vuelo llegó con la pausa local puesta: se adopta su estado SIN dejar la pausa, sin reproducir la reacción; la consecuencia se lee al reanudar. */
  private adoptDecisionUnderPause(updated: SimulationDecisionResult): void {
    perfCancel('decision-to-scene');
    this.busy.set(false);
    if (updated.status !== 'IN_PROGRESS') {   // la decisión cerró el caso: manda el resultado y ya no hay pausa que registrar
      this.pausa.cancelar();
      this.endPausing();
      this.attempt.set(updated);
      this.showClosedAttempt(updated);
      return;
    }
    this.attempt.set({ ...updated, status: 'PAUSED' });
    this.trackPersona(updated);
    this.persistAttemptToken(updated);
    this.consequenceOnResume = updated;
    this.pausa.intentar();
  }

  /** La decisión falló o no se pudo conciliar con la pausa local puesta: la persona sigue fuera, sin aviso (al reanudar la intención pendiente se le dice). */
  private choiceLostUnderPause(): boolean {
    if (this.attempt()?.status !== 'PAUSED') return false;
    this.busy.set(false);
    this.pausa.intentar();
    return true;
  }

  /** El camino normal de la respuesta de una decisión: reacción del personaje y, tras ella, consecuencia y sala nueva. */
  private applyDecisionResult(game: SimulationAttemptState, updated: SimulationDecisionResult): void {
    // Una segunda oportunidad no aplicó la primera respuesta: no se anuncia como decisión guardada.
    // BORRADOR: texto pendiente de Psicología. El acuse se añade a otro aviso si todavía está visible.
    if (!updated.retry) {
      const previous = this.softNotice();
      this.showSoftNotice(previous ? `${previous} ${ORIENTATION_COPY.notices.decisionRegistered}` : ORIENTATION_COPY.notices.decisionRegistered);
    }
    this.trackStageChange(game, updated);
    this.heldNode.set(escenaRetenida(this.visibleNode() ?? game.currentNode, updated.currentNode));
    this.attempt.set(updated);
    // La etiqueta nueva la dice la reacción en su paso (`afterReaction` la deja si no hubo): aquí solo el icono.
    this.syncPersonaIcon(updated, false);
    this.trackPersona(updated);
    this.persistAttemptToken(updated);
    this.selectedInteraction.set(null);
    this.nearbyInteraction.set(null);
    this.journalPanel?.clear();
    // El personaje reacciona en su sala; la supervisión y la sala de destino siguen en `afterReaction`.
    this.pendingAfterReaction = updated;
    if (!this.reaction) { this.afterReaction(); return; }
    this.reacting.set(true);
    const reaction = updated.reaction;
    this.reaction.play(
      { reaction: reaction ? { ...reaction, line: conNombre(reaction.line, this.nombreDeQuienJuega()) } : null,
        personaAntes: game.persona, personaDespues: updated.persona, reduceMotion: this.reduceMotion() },
      this.reactionActor(reaction?.objectKey ?? null),
    );
  }

  /** Quién reacciona: el nombre en la sala actual y, si es la persona clave, su retrato. */
  private reactionActor(objectKey: string | null): { nombre: string; visual: CharacterVisual | null } {
    const world = this.world();
    const keyPerson = world ? resolveKeyPerson(world.objects ?? []) : null;
    // Sin objectKey (o fuera de esta sala) habla la persona clave de la sala; sin ella, nadie con nombre.
    const object = (objectKey ? world?.objects?.find(o => o.key === objectKey) : undefined) ?? keyPerson ?? undefined;
    if (!world || !object) return { nombre: '', visual: null };
    const isKeyPerson = keyPerson?.key === object.key;
    // La cara: la de la persona clave, o la del personaje de la sala que reacciona (la misma fuente que el diálogo y la
    // burbuja); sin esto el hermano mayor reaccionaba sin retrato en la entrada.
    const visual = (isKeyPerson ? this.patientVisual() : null) ?? this.gameWorld?.characterVisualOf(object.key) ?? null;
    return { nombre: getSceneDisplayLabel(object, world.map.key), visual };
  }

  /** Terminó la reacción (completa o saltada): nota de supervisión sobre la escena y, detrás de ella, la sala de destino. */
  afterReaction(motivo: FinReaccion = 'completa'): void {
    if (motivo === 'cancelada') return;   // la salida segura ya tomó la pantalla (`cutReactionForPause`)
    const updated = this.pendingAfterReaction;
    this.pendingAfterReaction = null;
    this.reacting.set(false);
    if (!updated) return;
    // Última decisión: la consecuencia se lee sobre la escena y el resultado se abre al cerrarla. Se arma antes
    // de pedir el mundo: si este falla, su error suelta la retención. Sin consecuencia que mostrar, el resultado
    // se abre ya y el cierre suena como siempre. Nada de esto mira la clasificación (RN-08).
    if (updated.status === 'COMPLETED') {
      const retenida = this.holdOutcomeForConsequence(updated);
      if (!retenida) this.playCompletionAudio();
      this.loadProgressMap(updated);
      this.applyAudioScene(updated);
      // El fundido nunca va encima de un panel abierto (REGLA-004: la «Salida segura» de la supervisión queda a la vista y
      // se puede pulsar): con la supervisión retenida, el mundo del cierre se carga detrás, sin fundido.
      if (retenida) this.loadWorld(updated);
      else this.triggerFade(() => this.loadWorld(updated), null);   // la elección ya sonó al enviarse
      return;
    } else {
      // V7: reacción (ya leída) → consecuencia (espera a cerrarse) → aviso si cambia de sala (espera) → cambio. La
      // consecuencia se lee en la sala donde se decidió; el mundo de la escena siguiente se pide al cerrarla.
      const consequence = this.buildConsequenceDialogue(updated);
      this.consequenceOnResume = consequence ? updated : null;   // si la salida segura llega con ella a la vista, se lee al reanudar
      this.transicionPendiente = updated;
      if (consequence) this.dialogue.set(consequence);
      else this.seguirTrasConsecuencia();
    }
  }

  /**
   * V7: la consecuencia ya se leyó (o no había). Se pide el mundo de la escena siguiente: si es otra sala, primero la
   * tarjeta «La historia continúa en <lugar>»; si es la misma, se aplica como siempre. Si el pedido falla, sigue el camino
   * de siempre (`loadWorld`), con su manejo de errores.
   */
  private seguirTrasConsecuencia(): void {
    const updated = this.transicionPendiente;
    this.transicionPendiente = null;
    if (!updated) return;
    const token = ++this.transicionToken;
    const salaActual = this.world()?.map ?? null;
    this.simulationService.getWorld(updated.attemptId).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: mundo => {
        if (token !== this.transicionToken) return;
        const cambiaDeSala = salaActual !== null && !mismoLugar(salaActual, mundo.map);
        const seguir = () => {
          if (token !== this.transicionToken) return;
          if (cambiaDeSala) {
            const lugar = mundo.map.title?.trim() || 'otro lugar';
            this.cambioDeLugar.set({ lugar, mundo, intento: updated });
            this.announce(`La historia continúa en ${lugar}.`);
            return;
          }
          this.irAlMundo(updated, mundo);
        };
        // Tras decidir, si la sala actual tiene la puerta hacia el nodo siguiente: los acompañantes caminan hasta ella y
        // quien juega entra el último (el servidor ya movió el intento; el mundo nuevo se pinta después, sin cambios).
        const salida = cambiaDeSala ? this.salidaHaciaNodo(updated.currentNode?.key ?? null) : null;
        if (salida && this.gameWorld) {
          this.acompanantesCruzaron = true;
          const caminata = this.gameWorld.caminarALaPuerta({
            puertaKey: salida.key, puerta: { x: salida.x, y: salida.y }, acompanantes: leerAcompanantes(salida.metadata), jugador: true,
          });
          this.refreshGuide();
          void caminata.then(seguir);
          return;
        }
        seguir();
      },
      error: () => {
        if (token === this.transicionToken) this.irAlMundo(updated, null);
      },
    });
  }

  /** La puerta EXIT de la sala actual cuyo destino es el nodo `nodeKey`, o null (entonces el cambio es el de siempre). */
  private salidaHaciaNodo(nodeKey: string | null): MapObjectState | null {
    if (!nodeKey) return null;
    return this.world()?.objects.find(o => (o.type || '').toUpperCase() === 'EXIT' && this.doorTargetNodeKey(o) === nodeKey) ?? null;
  }

  /** V7: «Ir a <lugar>» en la tarjeta del cambio de lugar: ahora sí cambia la sala. */
  irAlLugar(): void {
    const cambio = this.cambioDeLugar();
    if (!cambio) return;
    this.cambioDeLugar.set(null);
    this.irAlMundo(cambio.intento, cambio.mundo);
  }

  /** Aplica el mundo de la escena siguiente (el ya pedido, o lo pide si no lo hay) tras el fundido de siempre. */
  private irAlMundo(updated: SimulationAttemptState, mundo: SimulationWorldState | null): void {
    this.loadProgressMap(updated);
    this.applyAudioScene(updated);
    const token = this.transicionToken;
    this.triggerFade(() => {
      if (token !== this.transicionToken) return;
      if (mundo) this.applyWorldWithScenario(mundo);
      else this.loadWorld(updated);
    }, null);   // la elección ya sonó al enviarse
  }

  /** V7: la transición se corta (pausa, recarga): la tarjeta se va y una respuesta tardía del mundo ya no hace nada. */
  private cortarTransicion(): void {
    this.devolverAcompanantes(null);
    this.transicionPendiente = null;
    this.transicionToken++;
    this.cambioDeLugar.set(null);
    this.heldNode.set(null);
  }

  /** La salida segura corta la reacción en el acto: si la decisión cerró el caso, el resultado se abre sin supervisión; si no, su consecuencia se lee al reanudar (A3). */
  private cutReactionForPause(): void {
    const updated = this.pendingAfterReaction;
    this.pendingAfterReaction = null;
    this.reaction?.cancel();
    this.heldNode.set(null);
    this.reacting.set(false);
    this.busy.set(false);
    if (!updated) return;
    if (updated.status !== 'IN_PROGRESS') this.showClosedAttempt(updated);
    else this.consequenceOnResume = updated;
  }

  /** El intento cerró con la decisión: suena el cierre y se carga el mundo del resultado. */
  private showClosedAttempt(updated: SimulationAttemptState): void {
    this.playCompletionAudio();
    this.loadProgressMap(updated);
    this.applyAudioScene(updated);
    this.loadWorld(updated);
  }

  useTool(toolCode: string) {
    const game = this.attempt();
    const target = this.selectedInteraction()?.key ?? null;
    if (!game) return;
    if (this.busy()) {
      this.releaseDialogue();
      return;
    }
    this.withSyncedPosition(() => this.doUseTool(toolCode, target));
  }

  private doUseTool(toolCode: string, target: string | null) {
    const game = this.attempt();
    if (!game) return;
    if (this.busy()) {
      this.releaseDialogue();
      return;
    }
    this.busy.set(true);
    this.simulationService.useTool(game.attemptId, toolCode, target).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: (result: ToolUseResult) => {
        // La pausa o una sala nueva llegaron mientras tanto: la respuesta tardía no pisa el estado.
        if (!this.respuestaVigente(game.attemptId)) { this.busy.set(false); return; }
        this.world.set(result.world);
        this.mergeViewedNpcKeysFromWorld(result.world);
        this.applyDecisionOptions(result.world);
        this.showToolFeedback(result);
        this.busy.set(false);
      },
      error: err => {
        this.releaseDialogue();
        this.reportApiError(err, 'No pudimos usar la herramienta.');
        this.busy.set(false);
      }
    });
  }

  selectTool(toolCode: string) {
    const tool = this.world()?.tools.find(t => t.code === toolCode);
    if (!tool || this.inputBlocked() || this.busy()) return;
    this.audioDirector.playSfx('ui_select');
    this.dialogue.set({
      key: tool.code, speakerName: 'Herramienta profesional', portraitKey: tool.icon, emotion: 'neutral',
      lines: [{ order: 1, speakerName: tool.label, text: tool.description, emotion: 'neutral' }], choices: []
    });
    this.selectedInteraction.set({
      key: `tool-${tool.code}`, label: tool.label, type: 'TOOL',
      x: 0, y: 0, width: 0, height: 0, color: '#4FA3A5', icon: tool.icon,
      shortCode: tool.code.slice(0,4), collision: false,
      interactionPrompt: 'Herramienta profesional', interactionText: tool.description,
      decisionOptionId: null, toolCode: tool.code, dialogue: null
    });
  }

  // BORRADOR: texto pendiente de Psicología. La consecuencia puede conducir a otra etapa o al resultado.
  protected dialogueFinalAction(): string | null {
    if (!this.dialogue()?.key.startsWith('consequence-')) return null;
    if (this.holdingOutcome()) return 'Ver resultado';
    return this.transicionPendiente ? 'Continuar la historia' : null;
  }

  closeDialogue() {
    // Con la supervisión de la última decisión retenida, cerrarla abre el resultado (`releaseHeldOutcome`).
    const cerrada = this.dialogue();
    this.dialogue.set(null);
    this.consequenceOnResume = null;   // leída o descartada a propósito: no vuelve
    // Al cerrar ya no hay nada «abierto»: sin esto el objeto, y la herramienta del dock, quedaban marcados.
    this.selectedInteraction.set(null);
    // V7: cerrar la consecuencia de una decisión es lo que deja seguir a la escena siguiente (y a su aviso de cambio).
    if (this.transicionPendiente && cerrada?.key.startsWith('consequence-')) this.seguirTrasConsecuencia();
  }

  /** Diálogo informativo de NPC (frontend-only, sin decisión) → modo cinematic. */
  openNpcDialogue(npc: NpcConfig) {
    if (this.inputBlocked() || this.busy()) return;
    const game = this.attempt();
    if (game?.status === 'IN_PROGRESS') {
      this.busy.set(true);
      this.withSyncedPosition(() => this.recordNpcInteraction(npc));
      return;
    }
    this.showNpcDialogue(npc);
  }

  private recordNpcInteraction(npc: NpcConfig): void {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') {
      this.busy.set(false);
      return;
    }
    const mapKey = this.world()?.map.key;
    this.simulationService.recordNpcInteraction(game.attemptId, npc.key).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: world => {
        if (!this.respuestaVigente(game.attemptId, mapKey)) { this.busy.set(false); return; }
        // Con «hablado en esta escena» el mundo nuevo trae la marca para la guía (contrato §3).
        if (world.viewedNpcKeysHere !== undefined) this.world.set(world);
        this.mergeViewedNpcKeysFromWorld(world);
        this.applyDecisionOptions(world);
        this.showNpcDialogue(npc);
        this.busy.set(false);
      },
      error: err => {
        this.releaseDialogue();
        this.reportApiError(err, 'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.');
        this.busy.set(false);
      },
    });
  }

  private showNpcDialogue(npc: NpcConfig): void {
    if (!npc.dialogue?.lines?.length) return;
    this.dialogue.set({
      key: `npc-${npc.key}`,
      recipeId: npc.recipeId,
      speakerObjectKey: `${NPC_KEY_PREFIX}${npc.key}`,
      speakerName: npc.displayName,
      portraitKey: npc.portrait ?? null,
      emotion: 'neutral',
      lines: npc.dialogue.lines.map((line, index) => ({
        order: index + 1,
        speakerName: npc.displayName,
        text: line.text,
        emotion: line.emotion ?? 'neutral',
      })),
      choices: [],
    });
  }

  saveReflection(text: string) {
    const game = this.attempt();
    if (!game || !text.trim() || this.busy()) return;
    this.busy.set(true);
    this.journalSaveState.set('saving');
    this.simulationService.saveReflection(game.attemptId, game.currentNode.id, text.trim()).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: () => {
        this.journalMessage.set('Bitácora guardada y cifrada.');
        this.journalSaveState.set('saved');
        this.busy.set(false);
      },
      error: err => {
        this.busy.set(false);
        // S3-2b: sin consentimiento no se guarda nada y tampoco es un fallo de guardado: vuelve el aviso.
        if (isConsentRequiredError(err)) {
          this.journalSaveState.set('idle');
          this.requireConsentAgain();
          return;
        }
        this.journalMessage.set('No pudimos guardar la bitácora.');
        this.journalSaveState.set('error');
      }
    });
  }

  /**
   * Salida segura desde cualquier superposición (diálogo con o sin opciones, bitácora, introducción
   * y contexto) y desde el pie (F§7.8). Es el camino de REGLA-004: saca a la persona YA, con o sin red.
   *
   * - No hace nada sin un intento `IN_PROGRESS`, bajo el aviso de contenido (ETH-01) ni bajo el
   *   de reanudar, ni si ya hay una pausa pedida (un segundo toque no pausa dos veces).
   * - Pausa LOCALMENTE en el acto (el intento pasa a `PAUSED` en el cliente) y luego sincroniza con el servidor (`pausa`), sin
   *   devolver nunca a la persona al caso; espera la respuesta de una decisión en vuelo para que el servidor la aplique antes.
   */
  pauseFromOverlay(): void {
    if (this.rehearsalGone()) return this.leaveRehearsal();
    // Con la última supervisión a la vista el intento ya terminó: no hay nada que pausar. «Salida segura»
    // hace lo mismo que «Continuar»: cierra la supervisión y abre el resultado, donde están las salidas.
    if (this.holdingOutcome()) {
      this.closeDialogue();
      return;
    }
    // Última decisión en plena reacción: igual que con la supervisión, «Salida segura» corta y abre el resultado.
    if (this.reactingToLast()) {
      this.cutReactionForPause();
      return;
    }
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') return;
    if (this.showResumePrompt() || this.showContentWarning() || this.pausing()) return;
    this.pausing.set(true);
    this.pausePositionNote.set(null);
    // BORRADOR: texto pendiente de Psicología.
    this.pauseState.set('saving');
    // Sonido discreto: la salida segura es seria, no alarmista.
    this.audioDirector.playSfx('ui_cancel');
    if (this.reacting()) this.cutReactionForPause();   // sin encuadre, gesto ni nota de supervisión sobre la pausa
    this.capturePositionForPause(game);
    this.attempt.set({ ...this.attempt()!, status: 'PAUSED' });
    this.clearTransientOverlays();
    this.busy.set(false);
    if (this.mode() !== 'rehearsal') guardarMarcaDePausa(this.almacen, game.attemptId);
    this.pausa.iniciar();
  }

  /**
   * Al pulsar «Salida segura», la posición viva que aún no está guardada pasa a viajar con la pausa: se corta el guardado
   * con espera (y su reintento) para que no salga después de la pausa, que el servidor ya no aceptaría.
   */
  private capturePositionForPause(game: SimulationAttemptState): void {
    const live = this.gameWorld?.playerPosition();
    if (live) this.lastPosition = live;
    if (this.positionSaveHandle) { window.clearTimeout(this.positionSaveHandle); this.positionSaveHandle = null; }
    this.positionRetry.cancelar();
    const world = this.world(), last = this.lastPosition, synced = this.lastSyncedPosition;
    const pending = !!last && (!synced || synced.x !== last.x || synced.y !== last.y);
    this.positionForPause = pending && world ? { attemptId: game.attemptId, mapKey: world.map.key, x: last!.x, y: last!.y } : null;
  }

  /**
   * Antes de registrar la pausa, la posición que quedó pendiente (V4): así el servidor la guarda con la pausa. Si el servidor
   * la rechaza (fuera del mapa, otra sala), la pausa sigue igual; sin red o sin respuesta falla la cadena entera y la pausa
   * pendiente la reintenta, posición incluida, al volver la red.
   */
  private positionBeforePause(): Observable<unknown> {
    const pending = this.positionForPause, game = this.hintAttempt();
    if (!pending || !game || pending.attemptId !== game.attemptId) return of(null);
    return this.simulationService.updateWorldState(game.attemptId, pending.x, pending.y, pending.mapKey, true).pipe(
      timeout(PLAZO_ACCION_MS),
      tap(() => {
        if (this.positionForPause === pending) this.positionForPause = null;
        this.lastSyncedPosition = { x: pending.x, y: pending.y };
      }),
      catchError(err => {
        const sinRed = esPlazoVencido(err) || (err instanceof HttpErrorResponse && err.status === 0);
        if (sinRed) return throwError(() => err);
        if (this.positionForPause === pending) this.positionForPause = null;
        // BORRADOR: texto pendiente de Psicología. La pausa sigue, pero la posición fue rechazada.
        this.pausePositionNote.set('No se guardó tu última posición. Al reanudar, vuelve al lugar donde estabas.');
        return of(null);
      }),
      defaultIfEmpty(null),
    );
  }

  /** El servidor registró la pausa (o dijo en qué estado quedó el intento): se adopta y se recarga el mundo. */
  private onPauseRegistered(updated: SimulationAttemptState): void {
    this.endPausing();
    borrarMarcaDePausa(this.almacen, updated.attemptId);
    this.attempt.set(updated);
    // BORRADOR: texto pendiente de Psicología. La respuesta confirma la pausa, no necesariamente la posición.
    if (updated.status === 'PAUSED') this.announce('La pausa se guardó.');
    this.busy.set(true);
    this.worldReloadPending = true;
    this.loadWorld(updated);
  }

  /** La pausa pedida terminó o se descartó. */
  private endPausing(): void {
    this.pausing.set(false);
    this.pauseState.set('none');
  }

  /** ¿Sigue en curso el intento `attemptId` (y, si se pide, en la misma sala)? Para descartar respuestas tardías. */
  private respuestaVigente(attemptId: string, mapKey?: string | null): boolean {
    return respuestaVigente(
      { attemptId, mapKey },
      { attemptId: this.attempt()?.attemptId, status: this.attempt()?.status, mapKey: this.world()?.map.key },
    );
  }

  /** Cierra toda superposición y descarta lo que esperaba una respuesta (pausa e intento nuevo). */
  private clearTransientOverlays(): void {
    this.cortarTransicion();
    this.selectedInteraction.set(null);
    this.supervisionHold.set(false);
    this.dialogue.set(null);
    this.journalOpen.set(false);
    // «Ir a…» tiene su propia «Salida segura»: pausar desde ahí no la deja bajo la pantalla de pausa ni la trae de vuelta.
    this.placesOpen.set(false);
    this.planOpen.set(false);
    this.showCaseIntro.set(false);
    this.cerrarEntradaDelCaso();
    this.helpOpen.set(false);
    this.pendingRestrictedInteraction.set(null);
    this.resetNotices();
    this.audioDirector.stopIntroLament();
  }

  rememberPosition(x: number, y: number) {
    this.lastPosition = { x, y };
    this.rearmDoorInteractionWhenAway(x, y);
    if (this.positionSaveHandle) window.clearTimeout(this.positionSaveHandle);
    this.positionSaveHandle = window.setTimeout(() => this.persistPosition(), POSITION_SAVE_DEBOUNCE_MS);
  }

  /** Las puertas que cruzan de sala (EXIT con destino): las que piden alejarse antes de volver a cruzarlas. */
  private doorPoints(): { x: number; y: number }[] {
    return (this.world()?.objects ?? []).filter(object =>
      (object.type || '').toUpperCase() === 'EXIT' && this.doorTargetNodeKey(object),
    );
  }

  private rearmDoorInteractionWhenAway(x: number, y: number): void {
    if (this.doorInteractionArmed) return;
    // La misma cuenta dice si ya se puede (null) y, si no, cuánto falta: aviso y regla no pueden desacordarse.
    const message = doorRearmMessage({ x, y }, this.doorPoints());
    if (message === null) {
      this.doorInteractionArmed = true;
      if (this.stepsNotice()) {
        this.stepsNotice.set('');
        this.announce(ORIENTATION_COPY.door.rearmed);
      }
    } else if (this.stepsNotice()) {
      this.stepsNotice.set(message);   // el texto sigue a quien camina; no se vuelve a anunciar (una vez basta)
    }
  }

  /** «Aléjate de la puerta…»: aviso no modal; se dice una vez por pulsación y desaparece solo al cumplirse la regla. */
  private showStepsNotice(message: string): void {
    this.stepsNotice.set(message);
    this.announce(message);
  }

  visitedStageLabels(): string[] {
    const map = this.progressMap();
    if (!map?.nodes.length) return [];
    const visited = new Set(map.visitedNodeKeys);
    return map.nodes
      .filter(node => visited.has(node.key))
      .map(node => node.label);
  }

  supportResources(): string[] {
    const game = this.attempt();
    const resources = [
      ...(game?.currentNode.supportResources ?? []),
      ...(game?.supportResources ?? [])
    ];
    return Array.from(new Set(resources.filter(Boolean)));
  }

  statusLabelA11y(status: SimulationAttemptState['status']): string {
    return {
      IN_PROGRESS: 'En progreso',
      PAUSED: 'En pausa segura (reanudable)',
      COMPLETED: 'Finalizado',
      SAFE_EXITED: 'Cerrado con salida segura',
      REPLACED: 'Reemplazado por un intento nuevo',
    }[status];
  }

  private showToolFeedback(result: ToolUseResult): void {
    this.audioDirector.playSfx('ui_confirm');
    this.dialogue.set({
      key: `tool-feedback-${result.toolCode}-${Date.now()}`,
      speakerName: result.pertinent ? 'Herramienta pertinente' : 'Herramienta aplicada',
      hidePortrait: true,
      portraitKey: null, emotion: result.pertinent ? 'positive' : 'neutral',
      lines: [{ order: 1, speakerName: '', text: result.feedbackMessage, emotion: 'neutral' }],
      choices: []
    });
    // Sin announce(): el panel de diálogo ya anuncia esta misma línea por su región viva (con las dos se leía dos veces).
  }

  toggleMusicMute(): void {
    const muted = this.audioDirector.toggleMusicMuted();
    this.musicMuted.set(muted);
    if (!muted) {
      // Durante la intro vuelve su tema; en la partida, la música adaptativa del mapa.
      if (this.showCaseIntro()) this.audioDirector.playIntroLament();
      else this.applyAudioScene(this.attempt());
    }
    this.announce(muted ? 'Música silenciada.' : 'Música activada.');
  }

  toggleSfxMute(): void {
    const muted = this.audioDirector.toggleSfxMuted();
    this.sfxMuted.set(muted);
    this.announce(muted ? 'Sonidos de acciones silenciados.' : 'Sonidos de acciones activados.');
  }

  toggleReduceMotion(): void {
    const reduced = !this.reduceMotion();
    this.reduceMotion.set(reduced);
    this.announce(reduced ? 'Movimiento reducido activado.' : 'Movimiento reducido desactivado.');
  }

  /** Reutiliza el `requestId` de la misma opción si el envío anterior falló; si no, abre una intención nueva (y la guarda). */
  private decisionRequestFor(decisionOptionId: number): { decisionOptionId: number; requestId: string; choiceText?: string } {
    const pending = this.pendingDecisionRequest;
    if (pending && pending.decisionOptionId === decisionOptionId) return pending;
    const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const game = this.attempt();
    const request = { decisionOptionId, requestId, nodeId: game?.currentNode.id };
    this.pendingDecisionRequest = request;
    if (game && this.mode() !== 'rehearsal') {
      guardarIntencion(this.almacen, { attemptId: game.attemptId, nodeId: game.currentNode.id, decisionOptionId, requestId });
    }
    return request;
  }

  /** La decisión se confirmó o se descartó con certeza: la intención ya no se retiene (ni en memoria ni en la sesión). */
  private clearPendingDecision(attemptId: string): void {
    this.pendingDecisionRequest = null;
    this.decisionOnline.cancelar();
    borrarIntencion(this.almacen, attemptId);
  }

  /**
   * El envío de la decisión falló. El plazo y los fallos de red o servidor conservan la intención (se reenvía con el mismo
   * `requestId`). Un 4xx se consulta: si la decisión sí se aplicó, se reenvía (el servidor devuelve su respuesta original).
   */
  private handleDecisionFailure(err: unknown, game: SimulationAttemptState): void {
    const veredicto = veredictoDeEnvio(err);
    if (veredicto === 'plazo') {
      this.showActionError(DRAFT_COPY.decisionSlow.text);
      return;
    }
    if (veredicto === 'conservar') {
      this.reportApiError(err, 'No pudimos registrar tu decisión. Inténtalo de nuevo.');
      return;
    }
    this.busy.set(true);
    this.decisionInFlight = true;   // la pausa pendiente espera a que se concilie
    this.simulationService.getAttempt(game.attemptId).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: fresh => {
        const pending = this.pendingDecisionRequest;
        if (this.attempt()?.attemptId !== game.attemptId) { this.decisionInFlight = false; this.busy.set(false); return; }
        if (pending && veredictoDeIntencion({ nodeId: game.currentNode.id }, fresh) === 'aplicada') {
          // El primer envío sí llegó: se reenvía con el mismo requestId; si eso falla, se adopta el intento del servidor.
          this.simulationService.chooseDecision(game.attemptId, pending.decisionOptionId, pending.requestId)
            .pipe(timeout(PLAZO_ACCION_MS)).subscribe({
              next: updated => this.onDecisionResult(game, updated),
              error: () => { this.clearPendingDecision(game.attemptId); this.adoptServerAttempt(fresh); },
            });
          return;
        }
        this.decisionInFlight = false;
        this.busy.set(false);
        if (this.choiceLostUnderPause()) return;
        this.clearPendingDecision(game.attemptId);
        this.reportApiError(err, 'No pudimos registrar tu decisión. Inténtalo de nuevo.');
      },
      // Sin poder consultar, el resultado sigue incierto: la intención se conserva.
      error: cause => {
        this.decisionInFlight = false;
        this.busy.set(false);
        if (!this.choiceLostUnderPause()) this.orRehearsalGone(cause, () => this.showActionError(DRAFT_COPY.decisionConfirming.text));
      },
    });
  }

  /** El servidor ya avanzó el intento y no se pudo reenviar la decisión: se adopta su estado (con la pausa local puesta, la pausa lo trae al registrarse). */
  private adoptServerAttempt(fresh: SimulationAttemptState): void {
    this.decisionInFlight = false;
    this.persistAttemptToken(fresh);
    if (this.attempt()?.status === 'PAUSED') { this.busy.set(false); this.pausa.intentar(); return; }
    this.attempt.set(fresh);
    this.dialogue.set(null);
    this.selectedInteraction.set(null);
    this.nearbyInteraction.set(null);
    this.loadWorld(fresh);
  }

  /** Al volver la red, la elección que no salió se reenvía sola con su mismo `requestId` (idempotente) y se avisa. */
  private resendDecisionOnline(): void {
    const pending = this.pendingDecisionRequest, game = this.attempt();
    const veredicto = puedeReenviarEleccion({
      pendiente: pending, intento: game && { status: game.status, nodeId: game.currentNode.id }, dialogoAbierto: this.dialogue()?.key ?? null,
      otraSuperposicion: this.journalOpen() || this.helpOpen() || this.placesOpen() || this.planOpen() || this.showContentWarning(),
      ocupado: this.busy() || this.decisionInFlight,
    });
    if (veredicto === 'esperar') this.decisionOnline.armar(esperaDeSincronizacion(1));
    if (veredicto !== 'reenviar') return;
    this.showSoftNotice(DRAFT_COPY.decisionResentOnline.text);
    this.executeDecision(pending!.decisionOptionId);
  }

  /** Tras recargar o al reanudar: la intención guardada se retoma con su `requestId` o, si el servidor ya avanzó, se reenvía para mostrar su consecuencia. */
  private restorePendingDecision(attempt: SimulationAttemptState, aviso: string = DRAFT_COPY.decisionConfirming.text): void {
    if (this.mode() === 'rehearsal') return;
    const intencion = leerIntencion(this.almacen, attempt.attemptId);
    if (!intencion) return;
    if (attempt.status !== 'IN_PROGRESS') borrarIntencion(this.almacen, attempt.attemptId);
    else if (veredictoDeIntencion(intencion, attempt) === 'aplicada') this.replayIntent = intencion;
    else {
      this.pendingDecisionRequest = { decisionOptionId: intencion.decisionOptionId, requestId: intencion.requestId, nodeId: intencion.nodeId };
      this.notifications.show('info', aviso);
    }
  }

  /** La decisión ya se aplicó pero su respuesta se perdió: se reenvía con el MISMO requestId y se lee su consecuencia sobre la escena. */
  private replayAppliedDecision(): void {
    const intencion = this.replayIntent, game = this.attempt();
    this.replayIntent = null;
    if (!intencion || !game) return;
    this.simulationService.chooseDecision(game.attemptId, intencion.decisionOptionId, intencion.requestId)
      .pipe(timeout(PLAZO_ACCION_MS)).subscribe({
        next: result => {
          const consequence = this.buildConsequenceDialogue(result);
          const visible = consequence && this.respuestaVigente(game.attemptId) && !this.dialogue();
          if (visible) this.dialogue.set(consequence);
          if (!consequence || visible) borrarIntencion(this.almacen, game.attemptId);   // solo ante un resultado cierto y atendido
        },
        error: err => { if (veredictoDeEnvio(err) === 'conciliar') borrarIntencion(this.almacen, game.attemptId); },
      });
  }

  /** Guarda qué conversación va abierta, en qué línea y en qué escena (o borra el punto al cerrarla). */
  private saveReadingPoint(seleccion: MapObjectState | null, dialogo: DialogueState | null, line: number): void {
    const game = this.attempt();
    if (!game || this.mode() === 'rehearsal') return;
    const objectKey = objetoDeLectura(seleccion, dialogo);
    if (objectKey && dialogo) {
      guardarLectura(this.almacen, { attemptId: game.attemptId, nodeId: game.currentNode.id, objectKey, dialogueKey: dialogo.key, line });
    } else {
      borrarLectura(this.almacen, game.attemptId);
    }
  }

  /** Tras recargar el mundo: reabre la conversación (de un objeto o de un personaje de ambiente) en la línea en que iba; si la escena cambió o ya no está, se descarta. */
  private restoreReadingPoint(world: SimulationWorldState): void {
    this.readingRestorePending = false;
    const game = this.attempt();
    if (!game || this.mode() === 'rehearsal') return;
    const punto = leerLectura(this.almacen, game.attemptId);
    if (!punto) return;
    const reabrible = game.status === 'IN_PROGRESS' && punto.nodeId === game.currentNode.id && !this.showCaseIntro() && !this.inputBlocked();
    const npcKey = claveDeNpc(punto.objectKey);
    const npc = reabrible && npcKey
      ? npcsDeLaSala(this.scenarioConfig()?.rooms.find(room => room.key === world.map.key)?.npcs ?? [], world.map.ambient).find(candidate => candidate.key === npcKey)
      : undefined;
    const objeto = reabrible && !npcKey ? world.objects.find(candidate => candidate.key === punto.objectKey && candidate.type !== 'EXIT') : undefined;
    if (!npc && !objeto) {
      borrarLectura(this.almacen, game.attemptId);
      return;
    }
    this.dialogueStart.set({ key: punto.dialogueKey, line: punto.line });
    // Un personaje de ambiente ya quedó registrado al abrirlo la primera vez: reabrir no vuelve a tocar el servidor.
    if (npc) this.showNpcDialogue(npc);
    else this.openBackendInteraction(objeto!);
  }

  /**
   * Última decisión (DLG-05): muestra la consecuencia sobre la escena y retiene el resultado hasta que se cierre.
   * Devuelve `false` si no hay nada que mostrar (ni consecuencia ni reintento) o si no se puede armar: el resultado
   * se abre entonces como siempre.
   */
  private holdOutcomeForConsequence(decision: SimulationDecisionResult): boolean {
    let dialogue: DialogueState | null;
    try {
      dialogue = this.buildConsequenceDialogue(decision);
    } catch {
      return false;
    }
    if (!dialogue) return false;
    this.dialogue.set(dialogue);
    this.supervisionHold.set(true);
    return true;
  }

  /** La supervisión retenida ya no está a la vista: suena el cierre del caso y el foco pasa al resultado. */
  private releaseHeldOutcome(): void {
    this.supervisionHold.set(false);
    this.announce('Se abre el resultado del caso.');
    this.playCompletionAudio();
    // El foco inicial lo toma el propio resultado, en su título y nunca en un botón (H-05): si se mantuvo Enter para
    // cerrar la supervisión, un botón enfocado («Reintentar caso») se activaría solo con la repetición de la tecla.
  }

  private playCompletionAudio(): void {
    this.audioDirector.playResolution();
    this.audioDirector.playSfx('session_complete');
  }

  /**
   * Lo que se lee justo tras decidir (RN-08): la consecuencia narrativa y, si la regla concede otra oportunidad, el aviso
   * neutro de reintento. Nunca la clasificación, la razón de la prohibición ni el mensaje evaluativo: eso va al cierre.
   * Devuelve `null` si no hay nada que decir.
   */
  private buildConsequenceDialogue(decision: SimulationDecisionResult): DialogueState | null {
    const mundo = this.world();
    const tutor = identidadDelTutor(mundo?.map.ambient?.['tutor']) ?? identidadDelTutor(mundo?.tutorInicial);
    const hablante = tutor?.nombre ?? CONSEQUENCE_SPEAKER;
    const text = decision.consequence?.text?.trim() ?? '';
    const lines: DialogueState['lines'] = [];
    if (text) {
      lines.push({ order: 1, speakerName: hablante, text, emotion: 'neutral' });
    }
    if (decision.retry) {
      lines.push({ order: lines.length + 1, speakerName: text ? '' : hablante, text: RETRY_NOTICE, emotion: 'neutral' });
    } else if (text || tutor) {
      // Sin cifras: «puntaje» convierte el caso en un marcador.
      lines.push({ order: lines.length + 1, speakerName: '', text: ORIENTATION_COPY.notices.supervision, emotion: 'neutral' });
    }
    if (!lines.length) return null;
    return {
      key: `consequence-${Date.now()}`, speakerName: hablante,
      hidePortrait: !tutor,
      ...(tutor ? { tutor: { rol: tutor.rol }, recipeId: tutor.recipeId } : {}),
      portraitKey: null,
      emotion: 'neutral',
      lines, choices: []
    };
  }

  private triggerFade(callback: () => void, sound: 'dialogue_advance' | 'door_open' | null = 'dialogue_advance'): void {
    if (sound) this.audioDirector.playSfx(sound);
    this.fadeActive.set(true);
    window.setTimeout(callback, FADE_OUT_MS);
  }

  /** Programa los efectos de cámara para cuando el fundido de escena ya dejó ver el mundo. */
  private scheduleRevealEffects(): void {
    window.setTimeout(() => this.playRevealEffects(), SCENE_FADE_MS);
  }

  /** Sin clasificación: el mundo solo revela la sala (RN-08; la sacudida por decisión se retiró). */
  private playRevealEffects(): void {
    this.gameWorld?.playRevealEffects();
  }

  private loadProgressMap(attempt: SimulationAttemptState) {
    this.simulationService.getProgressMap(attempt.attemptId).subscribe({
      next: map => this.progressMap.set(map),
      error: err => {
        this.progressMap.set(null);
        if (isConsentRequiredError(err)) this.requireConsentAgain();
      }
    });
  }

  private loadWorld(attempt: SimulationAttemptState) {
    this.simulationService.getWorld(attempt.attemptId).pipe(timeout(PLAZO_ACCION_MS)).subscribe({
      next: world => this.applyWorldWithScenario(world),
      error: cause => {
        // S3-2b: sin consentimiento el servidor no entrega el mundo. No es un fallo de carga (sin «Reintentar»): vuelve el aviso.
        if (isConsentRequiredError(cause)) this.requireConsentAgain();
        else this.orRehearsalGone(cause, () => this.fail('No pudimos cargar el mapa del caso.', cause, () => this.loadWorld(attempt)));
        this.worldReloadPending = false;
        this.resumeQueued = false;
        this.readingRestorePending = false;   // sin mundo no hay conversación que reabrir; el guardado no se queda mudo
        // Sin mapa no hay escena sobre la que leer la supervisión: el resultado no puede quedar retenido.
        this.supervisionHold.set(false);
        this.pendingStage = null;
        this.loading.set(false);
        this.busy.set(false);
        this.fadeActive.set(false);
      }
    });
  }

  /** Carga el ScenarioConfig que corresponde al mapa del mundo y aplica ambos. */
  private applyWorldWithScenario(world: SimulationWorldState): void {
    // P2 (contrato x-siep 2.2): una sala por piezas se arma con lo que manda el servidor; el ScenarioConfig del legado
    // que comparta su clave de mapa dibujaría otra sala encima.
    if (salaDelMundo(world.map as unknown as Record<string, unknown>, world.objects)) {
      this.scenarioConfig.set(null);
      this.applyLoadedWorld(world);
      return;
    }
    this.simulationService.getScenarioConfig(world.map.key).subscribe({
      next: config => {
        this.scenarioConfig.set(config);
        this.applyLoadedWorld(world);
      },
      error: () => {
        // Solo entrar al renderer legacy cuando sabemos que el asset no existe.
        // Vaciar la configuración mientras el GET seguía pendiente abría una
        // ventana en la que las puertas DB walk-over podían dispararse solas.
        this.scenarioConfig.set(null);
        this.applyLoadedWorld(world);
      },
    });
  }

  /** Termina la recarga del mundo tras una pausa y atiende el «Reanudar» que llegó mientras tanto. */
  private finishWorldReload(): void {
    const resume = this.resumeQueued;
    this.worldReloadPending = false;
    this.resumeQueued = false;
    if (resume) this.resumeCurrentAttempt();
  }

  private applyLoadedWorld(world: SimulationWorldState): void {
    const previousMapKey = this.world()?.map.key ?? null;
    const mapChanged = previousMapKey !== world.map.key;
    if (mapChanged) {
      this.acompanantesCruzaron = false;
      this.doorInteractionArmed = false;
      this.stepsNotice.set('');
      // El aviso de una puerta de la sala anterior ya no dice nada de esta (permanece hasta cerrarse o cambiar de sala).
      this.dismissDoorNotice();
    }
    this.world.set(world);
    this.heldNode.set(null);
    this.syncPersonaIcon(this.attempt());
    this.mergeViewedNpcKeysFromWorld(world);
    this.applyDecisionOptions(world);
    this.loading.set(false);
    this.busy.set(false);
    this.worldRevealTimer = window.setTimeout(() => {
      this.fadeActive.set(false);
      this.scheduleRevealEffects();
    }, WORLD_REVEAL_DELAY_MS);
    // Etapa nueva (se decidió): banner con su título aunque el mapa sea el mismo (F§4.5). No se
    // repite al recargar: `pendingStage` solo lo arma la respuesta de una decisión.
    const stage = this.pendingStage;
    this.pendingStage = null;
    const live = this.attempt()?.status === 'IN_PROGRESS';   // con la pausa puesta (local o registrada) ningún aviso de etapa o sala
    if (stage && live) this.announceNewStage(stage);
    if (previousMapKey && mapChanged) {
      // La posición pendiente pertenece a la sala anterior: descartarla evita
      // que un flush posterior envíe coordenadas del mapa viejo.
      this.lastPosition = null;
      this.lastSyncedPosition = null;
      if (live) this.announceRoomChange(world, stage !== null);
    }
    this.maybeShowInitialCaseIntro();
    if (this.readingRestorePending) this.restoreReadingPoint(world);
    if (this.replayIntent) this.replayAppliedDecision();
    // Al final, con la escena ya aplicada: si «Reanudar» llegó durante la recarga, se atiende ahora.
    this.finishWorldReload();
  }

  /** La persona de este intento sobre la cabeza de la paciente en el mundo (el icono nace con el último estado). */
  private syncPersonaIcon(attempt: SimulationAttemptState | null, withLabel = true): void {
    if (!attempt?.persona) return;
    this.gameWorld?.updatePatientVisualState(attempt.persona);
    // El estado en palabras sobre la persona clave también fuera de la reacción (4.3.1).
    if (withLabel) this.gameWorld?.setPersonaState(attempt.persona.label);
  }

  /** Música y viñeta siguen a la intensidad de la escena y a la activación de la persona, nunca a una cifra. */
  private applyAudioScene(attempt: SimulationAttemptState | null): void {
    this.audioDirector.setScene(attempt?.currentNode?.intensity ?? 'MEDIUM', attempt?.persona?.activation ?? 'CALM');
  }

  /**
   * Anuncia, en cortesía y una sola vez, que la persona cambió de estado (VD-23). Compara con la última persona vista del
   * MISMO intento: la primera carga y un intento distinto solo la recuerdan.
   */
  private trackPersona(attempt: SimulationAttemptState): void {
    const previous = this.lastPersona;
    this.lastPersona = { attemptId: attempt.attemptId, persona: attempt.persona };
    if (!previous || previous.attemptId !== attempt.attemptId) return;
    const message = personaChangeAnnouncement(previous.persona, attempt.persona);
    if (message) this.announce(message);
  }

  private maybeShowInitialCaseIntro(): void {
    const attempt = this.attempt();
    if (!attempt) return;
    const step = this.resolveIntroStepFor(attempt);
    this.applyIntroStep(step);
    // Con la entrada ya hecha: el tutor de esta sala si aún no se vio en este intento (al volver de una pausa, por ejemplo).
    if (step === 'none') this.mostrarTutorPendiente();
  }

  private resolveIntroStepFor(attempt: SimulationAttemptState): IntroGateStep {
    return resolveIntroStep({
      attemptStatus: attempt.status,
      // Una lectura que falla (modo privado, política) es «sin consentimiento» / «sin leer»: se vuelve a pedir.
      consentGiven: this.hasContentConsent(attempt),
      introRead: this.mode() === 'rehearsal' || this.readStored(this.caseIntroStorageKey(attempt)) === 'read',
    });
  }

  private applyIntroStep(step: IntroGateStep): void {
    switch (step) {
      case 'consent':
        this.showContentWarning.set(true);
        return;
      case 'card':
        // Una sala inicial con cinemática o tutor reemplaza la tarjeta genérica «Antes de comenzar»: no salen las dos.
        if (this.empezarEntradaDelCaso()) return;
        this.revealCaseIntro();
        return;
      default:
        return;
    }
  }

  /**
   * Aceptar el aviso de contenido (ETH-01): pasa por el registro con estados. Guardando, el botón muestra su estado
   * y no hay doble envío; si el almacenamiento falla, NO se da por registrado: error con «Reintentar» y ni mundo,
   * ni HUD, ni audio. Solo con el consentimiento ya registrado se anuncia y arranca el mundo.
   */
  acceptContentWarning(): void {
    const attempt = this.attempt();
    if (!attempt || this.consentState() === 'saving') return;
    this.consentState.set('saving');
    this.announce(DRAFT_COPY.consentSaving.text);
    this.consentRecorder.record(this.caseConsentStorageKey(attempt)).then(
      () => {
        // El aviso pudo cerrarse mientras se registraba («Volver al catálogo»): una respuesta tardía no arranca nada.
        if (!this.showContentWarning() || this.consentState() !== 'saving') return;
        this.consentState.set('idle');
        this.showContentWarning.set(false);
        this.announce('Continuaste al caso. Cargando el escenario.');
        this.startWorld(attempt);
      },
      (cause: unknown) => {
        if (!this.showContentWarning()) return;
        // S3-2b: un aviso de otra versión dice que hay una versión nueva (recargar); cualquier otro fallo, lo de siempre.
        this.consentErrorText.set(cause instanceof ConsentNoticeStaleError
          ? DRAFT_COPY.consentNoticeStale.text
          : DRAFT_COPY.consentStorageError.text);
        this.consentState.set('error');
        this.announce(this.consentErrorText(), 'assertive');
      },
    );
  }

  /**
   * El servidor respondió 403 `CONSENT_REQUIRED` (S3-2b, ETH-01): el consentimiento se retiró en otra pestaña o el aviso
   * cambió de versión. Se vuelve al aviso previo SIN perder el intento ni mostrar un error genérico: lo que se sabía del
   * consentimiento deja de valer, no queda mundo, HUD ni audio (como antes de aceptar) y, al aceptar de nuevo, el mundo
   * se pide otra vez. La pausa y la salida segura no pasan por aquí: el servidor nunca les exige el consentimiento (REGLA-004).
   * Pública porque el panel de diálogo la dispara (`(consentRequired)`) cuando son las pistas las que reciben el 403.
   */
  requireConsentAgain(): void {
    const attempt = this.attempt();
    if (!attempt) return;
    this.consentRecorder.forget?.(this.caseConsentStorageKey(attempt));
    if (this.showContentWarning()) return;
    this.clearTransientOverlays();
    this.dismissActionError();
    this.audioDirector.dispose();
    this.worldStarted.set(false);
    this.consentState.set('idle');
    this.loading.set(false);
    this.showContentWarning.set(true);
  }

  /** «Iniciar nuevo intento» (RN-07): nombra lo que se pierde; «Continuar» conserva el intento abierto. */
  requestNewAttempt(): void {
    const copy = DRAFT_COPY.newAttemptConsequence;
    void this.dialog.consequence({
      // La capa se abre tras pulsar un botón del juego, pero el foco puede estar en el cuerpo: la piel no se adivina.
      piel: 'game',
      title: copy.title,
      consequence: copy.text,
      continueLabel: 'Continuar',
      proceedLabel: 'Iniciar nuevo intento',
    }).then(answer => {
      if (answer === 'proceed') this.startNewAttempt();
    });
  }

  /** «Ir a…» (F6-11): abre la lista de lo que se puede alcanzar en la sala (personas, puertas y objetos ya examinados). */
  openPlaces(): void {
    const examined = new Set(this.world()?.inspectedObjectKeys ?? []);
    // El siguiente paso de la ficha va primero y con su etiqueta (P9): la lista y la ficha no se contradicen.
    this.placeOptions.set(selectPlacesWithNext(this.gameWorld?.places() ?? [], examined, this.refreshGuide().siguienteLugar?.key ?? null));
    this.placesOpen.set(true);
  }

  /** Cierra la lista y devuelve el foco a su acceso: la cabecera estaba inerte mientras estuvo abierta. */
  /** Abre el plano completo (bloque M1): solo con plano y con el mundo libre (sin diálogo, bitácora ni otra capa). */
  openPlan(): void {
    if (!this.placePlan() || this.inputBlocked()) return;
    this.planOpen.set(true);
  }

  /** Cierra el plano y devuelve el foco al minimapa (o al mundo si está oculto). */
  closePlan(): void {
    if (!this.planOpen()) return;
    this.planOpen.set(false);
    afterNextRender(() => {
      const target = document.querySelector<HTMLElement>('[data-minimapa-abrir]') ?? document.getElementById('game-area');
      target?.focus();
    }, { injector: this.injector });
  }

  closePlaces(restoreFocus = true): void {
    if (!this.placesOpen()) return;
    if (this.pendingWalkInteraction()) this.stopPendingWalk();
    this.placesOpen.set(false);
    if (restoreFocus) afterNextRender(() => document.querySelector<HTMLElement>('[data-hud-places]')?.focus(), { injector: this.injector });
  }

  /** Al hablar se conserva la lista para mostrar y cancelar el trayecto; los demás destinos cierran la lista. */
  choosePlace(place: PlaceCandidate): void {
    if (place.kind === 'person') { this.requestInteraction(this.personForPlace(place), true); return; }
    if (place.kind === 'door') {
      const door = this.world()?.objects.find(obj => obj.key === place.key && obj.type === 'EXIT');
      if (door) this.requestInteraction(door, true);
      return;
    }
    if (this.pendingWalkInteraction()) this.stopPendingWalk();
    this.closePlaces();
    if (!this.gameWorld?.walkToKey(place.key)) {
      this.showWalkBlocked(place.label);
    }
  }

  /**
   * Phaser no pintó el mundo a tiempo (F6-8): el error de siempre con «Reintentar». Lo colgado es el lienzo, no el
   * estado del mundo (que ya llegó): reintentar REINICIA Phaser (`retryLoad`, que rearma el plazo) y deja el indicador
   * de arranque hasta su primer cuadro. Si el mundo pinta antes de pulsarlo, `onWorldReady` retira el error.
   */
  onWorldBootFailed(): void {
    if (!this.attempt() || this.error()) return;
    this.bootFailureShown = true;
    this.fail('No pudimos cargar el mapa del caso.', null, () => {
      this.bootFailureShown = false;
      this.worldRendered.set(false);
      this.loading.set(false);
      this.gameWorld?.retryLoad();
    });
  }

  /** «Ir allí» de la ficha del objetivo (P9): el mismo camino automático que «Ir a…», sin abrir la lista. */
  goToStep(key: string): void {
    if (this.inputBlocked()) return;
    if (this.pendingWalkInteraction()?.key === key) { this.stopPendingWalk(); return; }
    this.cancelPendingInteraction();
    const target = this.guide().siguienteLugar;
    const label = target?.label ?? '';
    const door = this.world()?.objects.find(obj => obj.key === key && obj.type === 'EXIT');
    if (door) { this.requestInteraction(door); return; }
    if (target?.key === key && target.tipo === 'persona') {
      this.requestInteraction(this.personForPlace({ key, label, kind: 'person' }));
      return;
    }
    if (!this.gameWorld?.walkToKey(key)) this.showWalkBlocked(label);
  }

  private personForPlace(place: PlaceCandidate): MapObjectState {
    return this.world()?.objects.find(obj => obj.key === place.key && obj.type === 'PERSON') ?? {
      key: place.key, label: place.label, type: 'PERSON', x: 0, y: 0, width: 0, height: 0,
      color: '', icon: '', shortCode: '', collision: false, interactionPrompt: '', interactionText: '',
      decisionOptionId: null, toolCode: null, dialogue: null,
    };
  }

  /** Terminó la caminata de «Ir a…»: «Llegaste a …» o que no se pudo llegar (VD-19, borrador). */
  readonly pendingWalkInteraction = signal<MapObjectState | null>(null);

  // BORRADOR: texto pendiente de Psicología.
  walkingLabel(obj: MapObjectState): string | null {
    return this.pendingWalkInteraction()?.key === obj.key ? `${walkingText(obj.type === 'EXIT' ? 'door' : 'object', obj.label)}… Pulsa para cancelar` : null;
  }

  requestInteraction(obj: MapObjectState, fromPlaces = false): void {
    if ((fromPlaces ? this.inputBlockedOutsidePlaces() : this.inputBlocked()) || this.busy()) return;
    if (obj.type !== 'PERSON' && obj.type !== 'EXIT') { this.openInteraction(obj); return; }
    if (this.pendingWalkInteraction()?.key === obj.key) { this.stopPendingWalk(); return; }
    if (obj.type === 'EXIT' && this.doorStatusFor(obj)?.state === 'locked') {
      this.showDoorNotice(this.doorStatusFor(obj)?.message ?? ORIENTATION_COPY.door.fallback);
      return;
    }
    if (this.nearbyInteraction()?.key === obj.key || this.nearbyAlso()?.key === obj.key || this.gameWorld?.isInReach?.(obj.key)) {
      this.gameWorld?.cancelWalk?.();
      this.cancelPendingInteraction();
      if (fromPlaces) this.closePlaces(false);
      this.openInteraction(obj);
      return;
    }
    this.pendingWalkInteraction.set(obj);
    if (!this.gameWorld?.walkToKey(obj.key)) {
      this.pendingWalkInteraction.set(null);
      if (fromPlaces) this.closePlaces();
      const npcKey = obj.key.startsWith('npc:') ? obj.key.slice(4) : obj.key;
      const room = this.scenarioConfig()?.rooms.find(r => r.npcs.some(npc => npc.key === npcKey));
      if (room && room.key !== this.world()?.map.key) {
        this.showSoftNotice(`${obj.label} está en ${room.displayName}. Usa “Ir a…” para buscar una puerta.`);
      } else {
        this.showWalkBlocked(obj.label);
      }
    } else if (this.pendingWalkInteraction()?.key === obj.key) {
      // BORRADOR: texto pendiente de Psicología. Una sola fuente de anuncio.
      this.announce(`${walkingText(obj.type === 'EXIT' ? 'door' : 'object', obj.label)}. Pulsa de nuevo para cancelar.`);
    }
  }

  cancelPendingInteraction(): void { this.pendingWalkInteraction.set(null); }

  stopPendingWalk(): void {
    this.gameWorld?.cancelWalk();
    this.cancelPendingInteraction();
  }

  onWalkEnded(event: { key: string; label: string; outcome: 'arrived' | 'blocked' }): void {
    const pending = this.pendingWalkInteraction();
    this.pendingWalkInteraction.set(null);
    if (pending && this.placesOpen()) this.closePlaces(event.outcome === 'blocked');
    if (event.outcome === 'blocked') {
      this.showWalkBlocked(event.label);
      return;
    }
    if (pending?.key === event.key) { this.openInteraction(pending); return; }
    this.showSoftNotice(`${DRAFT_COPY.placesArrived.text} ${event.label}`);
    afterNextRender(() => {
      if (this.contextualInteraction()?.key === event.key && !this.inputBlocked()) {
        document.querySelector<HTMLElement>('.bottom-zone .context-bar__interaction')?.focus();
      }
    }, { injector: this.injector });
  }

  private showWalkBlocked(label: string): void {
    const message = `${DRAFT_COPY.placesBlocked.text} ${label}. Camina con las flechas o busca el lugar en esta sala.`;
    this.showSoftNotice(message);
  }

  declineContentWarning(): void {
    this.showContentWarning.set(false);
    this.consentState.set('idle');
    this.announce('Volviste al catálogo. Puedes retomar el caso cuando lo decidas.');
    void this.router.navigate(['/portal/simulador']);
  }

  private caseConsentStorageKey(attempt: SimulationAttemptState): string {
    return consentStorageKey(attempt.caseVersionId, attempt.attemptId);
  }

  private revealCaseIntro(): void {
    this.showCaseIntro.set(true);
    this.audioDirector.playIntroLament();
  }

  continueFromCaseIntro(): void {
    const attempt = this.attempt();
    if (attempt) this.writeStored(this.caseIntroStorageKey(attempt), 'read');
    this.showCaseIntro.set(false);
    this.audioDirector.stopIntroLament();
    this.applyAudioScene(attempt);
    this.announce(DRAFT_COPY.introDone.text);
    this.mostrarNotaDeInicio(this.world());
  }

  /** Lectura y escritura del almacenamiento de la sesión sin que un bloqueo (modo privado, cuota) rompa el juego. */
  private readStored(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStored(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento la marca no se guarda: lo no leído se vuelve a mostrar. El juego sigue.
    }
  }

  private caseIntroStorageKey(attempt: SimulationAttemptState): string {
    return `siep_case_intro_${attempt.caseVersionId}_${attempt.attemptId}`;
  }

  /** Al cambiar de sala (puerta o decisión): nombre de la sala (`ROOM_BANNER_MS`) y, si el
   *  mapa trae texto de transición autorado (salto temporal), overlay breve. */
  private announceRoomChange(world: SimulationWorldState, stageBannerShown = false): void {
    // Con una etapa nueva manda su banner («Nueva etapa: …»), que ya nombra dónde estás.
    if (!stageBannerShown) {
      this.showRoomBanner(world.map.title, ROOM_BANNER_MS);
      this.announce(`Entraste a ${world.map.title}.`);
    }
    // El tutor de la sala (si lo trae y no se vio en este intento) va primero; la nota de capítulo espera a que se cierre.
    if (this.abrirTutor(world, world)) return;
    this.mostrarNotaDeTransicion(world);
  }

  /** La nota de capítulo o de salto de tiempo (`map.ambient.transitionText`), una vez por sala, con `{nombre}` puesto. */
  private mostrarNotaDeTransicion(world: SimulationWorldState): boolean {
    const crudo = (world.map.ambient as Record<string, unknown> | undefined)?.['transitionText'];
    if (typeof crudo !== 'string' || !crudo || this.seenTransitionMapKeys.has(world.map.key)) return false;
    const transition = conNombre(crudo, this.nombreDeQuienJuega());
    this.seenTransitionMapKeys.add(world.map.key);
    this.transitionNote.set(transition);
    this.announce(transition);
    if (this.transitionNoteTimer !== null) window.clearTimeout(this.transitionNoteTimer);
    this.transitionNoteTimer = window.setTimeout(() => this.cerrarNotaDeTransicion(), TRANSITION_NOTE_MS);
    return true;
  }

  private cerrarNotaDeTransicion(): void {
    if (this.transitionNoteTimer !== null) window.clearTimeout(this.transitionNoteTimer);
    this.transitionNoteTimer = null;
    this.transitionNote.set('');
  }

  /**
   * La nota de capítulo de la sala donde empieza el juego, al terminar la entrada (tarjeta, o cinemática y tutor). Antes no
   * salía nunca: `announceRoomChange` solo corre al CAMBIAR de sala. Una vez por intento.
   */
  private mostrarNotaDeInicio(world: SimulationWorldState | null): void {
    const attempt = this.attempt();
    if (!world || !attempt || attempt.status !== 'IN_PROGRESS') return;
    const vistos = new VistosDelIntento(attempt.attemptId);
    if (vistos.visto(marcaDeCapitulo(world.map.key))) return;
    if (this.mostrarNotaDeTransicion(world)) vistos.marcar(marcaDeCapitulo(world.map.key));
  }

  /**
   * La entrada del caso cuando la sala inicial trae cinemática o tutor (contrato del caso insignia): consentimiento →
   * cinemática → tutor → mundo y nota de capítulo. Cada pieza sale una vez por intento (las ya vistas se saltan). false si
   * la sala no trae ninguna de las dos: entonces sale la tarjeta genérica. En el ensayo de la docente no hay entrada (4.2.1).
   */
  private empezarEntradaDelCaso(): boolean {
    if (this.entradaEnCurso) return true;
    const world = this.world(), attempt = this.attempt();
    if (!world || !attempt || attempt.status !== 'IN_PROGRESS' || this.mode() === 'rehearsal') return false;
    const cine = leerCinematica(world.map.ambient);
    if (!cine && !leerTutor(world.map.ambient)) return false;
    this.entradaEnCurso = true;
    if (cine && !new VistosDelIntento(attempt.attemptId).visto(marcaDeCinematica(cine.id))) {
      this.audioDirector.playIntroLament();
      this.cinematica.set(cine);
      return true;
    }
    this.seguirEntrada();
    return true;
  }

  /** Tras la cinemática: el tutor de la sala inicial (si falta verlo) o el final de la entrada. */
  private seguirEntrada(): void {
    if (this.abrirTutor(this.world(), null)) return;
    this.terminarEntrada();
  }

  /** La cinemática terminó (vista o saltada): queda vista en este intento y sigue la entrada. */
  alTerminarCinematica(): void {
    const cine = this.cinematica(), attempt = this.attempt();
    if (cine && attempt) new VistosDelIntento(attempt.attemptId).marcar(marcaDeCinematica(cine.id));
    this.cinematica.set(null);
    this.audioDirector.silenciarIntro(false);
    this.seguirEntrada();
    this.relevarFocoDeLaEntrada();
  }

  /** El corte a negro de la cinemática pide silencio a la música de entrada. */
  silenciarIntro(silencio: boolean): void {
    this.audioDirector.silenciarIntro(silencio);
  }

  /** Abre el tutor de la sala si lo trae y aún no se vio en este intento. `nota`: la sala cuya nota de capítulo espera tras él. */
  private abrirTutor(world: SimulationWorldState | null, nota: SimulationWorldState | null): boolean {
    const attempt = this.attempt();
    if (!world || !attempt || attempt.status !== 'IN_PROGRESS' || this.mode() === 'rehearsal' || this.tutorAbierto()) return false;
    const datos = leerTutor(world.map.ambient);
    if (!datos || new VistosDelIntento(attempt.attemptId).visto(marcaDeTutor(world.map.key))) return false;
    this.notaTrasTutor = nota;
    this.tutorAbierto.set({ datos, mapa: world.map.key });
    return true;
  }

  /** El tutor se cerró: queda visto en esta sala y sigue lo que esperaba (el final de la entrada o la nota de capítulo). */
  alCerrarTutor(): void {
    const abierto = this.tutorAbierto(), attempt = this.attempt();
    if (abierto && attempt) new VistosDelIntento(attempt.attemptId).marcar(marcaDeTutor(abierto.mapa));
    this.tutorAbierto.set(null);
    const nota = this.notaTrasTutor;
    this.notaTrasTutor = null;
    this.relevarFocoDeLaEntrada();
    if (this.entradaEnCurso) {
      this.terminarEntrada();
      return;
    }
    if (nota) this.mostrarNotaDeTransicion(nota);
  }

  /** Fin de la entrada: queda «leída» (como la tarjeta), suena la música de la escena y sale la nota de la sala inicial. */
  private terminarEntrada(): void {
    this.entradaEnCurso = false;
    const attempt = this.attempt();
    if (attempt) this.writeStored(this.caseIntroStorageKey(attempt), 'read');
    this.audioDirector.stopIntroLament();
    this.applyAudioScene(attempt);
    this.announce(DRAFT_COPY.introDone.text);
    this.mostrarNotaDeInicio(this.world());
  }

  /** Un tutor que quedó sin ver en esta sala (se pausó con él abierto o se volvió otro día), si nada más ocupa la pantalla. */
  private mostrarTutorPendiente(): void {
    if (this.dialogue() || this.cambioDeLugar() || this.reacting() || this.showCaseIntro() || this.cinematica()) return;
    this.abrirTutor(this.world(), null);
  }

  /**
   * Pausa o intento nuevo: se cierran la cinemática y el tutor. La cinemática queda vista (quien salió por la salida segura
   * no tiene que volver a verla); el tutor no, y sale otra vez al reanudar.
   */
  private cerrarEntradaDelCaso(): void {
    const cine = this.cinematica(), attempt = this.attempt();
    if (cine && attempt) new VistosDelIntento(attempt.attemptId).marcar(marcaDeCinematica(cine.id));
    if (cine) this.audioDirector.silenciarIntro(false);
    this.cinematica.set(null);
    this.tutorAbierto.set(null);
    this.entradaEnCurso = false;
    this.notaTrasTutor = null;
  }

  /** La sala y la persona a atender que ya se anunciaron: `world.set` repite el mundo en cada acción y no debe repetir el aviso. */
  private announcedKeyPerson: string | null = null;

  /**
   * Anuncia la persona a atender de la sala («Marta, persona a atender») por la región viva de cortesía: al entrar a la sala
   * y cuando cambia, no en cada vez que el mundo se vuelve a poner. Sin ella, olvida la anterior (volver a una sala con ella
   * la anuncia de nuevo).
   */
  private announceKeyPerson(world: SimulationWorldState | null): void {
    const person = world ? resolveKeyPerson(world.objects ?? []) : null;
    if (!world || !person) {
      this.announcedKeyPerson = null;
      return;
    }
    const id = `${world.map.key}|${person.key}`;
    if (id === this.announcedKeyPerson) return;
    this.announcedKeyPerson = id;
    this.announce(keyPersonAccessibleName(getSceneDisplayLabel(person, world.map.key)));
  }

  private showRoomBanner(text: string, ms: number, etapa = false): void {
    this.bannerDeEtapa.set(etapa);
    this.roomBanner.set(text);
    if (this.roomBannerTimer !== null) window.clearTimeout(this.roomBannerTimer);
    this.roomBannerTimer = window.setTimeout(() => this.roomBanner.set(''), ms);
  }

  /** La decisión llevó a otra etapa (aunque la sala sea la misma): se recuerda hasta que llegue su mundo. */
  private trackStageChange(previous: SimulationAttemptState, updated: SimulationAttemptState): void {
    if (updated.status !== 'IN_PROGRESS' || updated.currentNode.key === previous.currentNode.key) return;
    this.pendingStage = updated.currentNode.title;
  }

  /** Banner con el título de la escena nueva. */
  private announceNewStage(title: string): void {
    this.showRoomBanner(title, STAGE_BANNER_MS, true);
    this.announce(title);
  }

  /** Descarta avisos pendientes y visibles (intento nuevo o pausa): eran de lo que se estaba haciendo. */
  private resetNotices(): void {
    if (this.softNoticeTimer !== null) window.clearTimeout(this.softNoticeTimer);
    this.softNoticeTimer = null;
    this.softNotice.set('');
    this.decisionSelection.set('');
    // Banner de sala o de etapa, aviso de puerta y nota de transición (z 320-340): sin esto quedaban pintados encima de
    // la pantalla de pausa (F7). Eran de lo que se estaba haciendo. (El aviso de puerta ya no se apaga solo: se retira
    // aquí, al cerrarse o al cambiar de sala.)
    if (this.roomBannerTimer !== null) window.clearTimeout(this.roomBannerTimer);
    this.roomBannerTimer = null;
    this.roomBanner.set('');
    this.dismissDoorNotice();
    this.stepsNotice.set('');
    this.cerrarNotaDeTransicion();
  }

  /**
   * Anuncia por las regiones vivas de la app. `polite` por defecto; `assertive` solo para errores y para la salida
   * segura (la urgencia no se usa para llamar la atención sobre lo que no la tiene).
   */
  private announce(message: string, politeness: AnnouncePoliteness = 'polite'): void {
    this.liveAnnouncer.announce(message, politeness);
  }

  private persistAttemptToken(attempt: SimulationAttemptState) {
    if (this.mode() === 'rehearsal') return;   // un ensayo no se reanuda: sin token en la pestaña
    this.writeStored(`siep_attempt_${attempt.caseVersionId}`, JSON.stringify({
      attemptId: attempt.attemptId,
      viewedNpcKeys: Array.from(this.viewedNpcKeys()),
    }));
  }

  private restoreViewedNpcKeys(attempt: SimulationAttemptState): ReadonlySet<string> {
    try {
      const raw = sessionStorage.getItem(`siep_attempt_${attempt.caseVersionId}`);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw) as { attemptId?: unknown; viewedNpcKeys?: unknown };
      if (parsed.attemptId !== attempt.attemptId || !Array.isArray(parsed.viewedNpcKeys)) {
        return new Set<string>();
      }
      return new Set(parsed.viewedNpcKeys.filter((key): key is string => typeof key === 'string' && key.length > 0));
    } catch {
      return new Set<string>();
    }
  }

  /** El servidor oculta las opciones cuyo requisito de exploración no se cumple: cuando la respuesta del mundo trae
   *  `decisionOptions`, esa lista (las ofrecidas ahora) reemplaza las del nodo actual. Sin la clave no se toca nada. */
  private applyDecisionOptions(world: SimulationWorldState): void {
    this.reactions?.setComments(world.comments ?? []);
    const offered = world.decisionOptions;
    if (offered) {
      const node = this.attempt()?.status === 'IN_PROGRESS' ? this.attempt()!.currentNode : null;
      const before = node ? node.options.map(option => option.id) : null;
      const nodeBefore = this.optionsNodeId;
      this.optionsNodeId = node?.id ?? null;
      this.attempt.update(game => game && game.status === 'IN_PROGRESS'
        ? { ...game, currentNode: { ...game.currentNode, options: offered.map(option => ({ ...option })) } }
        : game);
      // Explorar abrió otra forma de responder: se avisa una vez (los mismos ids no vuelven a avisar) y la conversación abierta la muestra.
      if (avisarOpcionNueva({ nodoAntes: nodeBefore, nodoDespues: this.optionsNodeId, antes: before, despues: offered.map(option => option.id) })) {
        this.showSoftNotice(DRAFT_COPY.noticeNewOption.text);
        this.redecorateOpenDialogue();
      }
    }
    this.refreshGuide(world);
  }

  /** Vuelve a decorar la conversación con decisiones que sigue abierta, desde el diálogo del objeto: así muestra la opción nueva. */
  private redecorateOpenDialogue(): void {
    const open = this.dialogue();
    const selected = this.selectedInteraction();
    if (open?.choices.some(choice => choice.decisionOptionId != null) && selected?.dialogue?.key === open.key) {
      this.dialogue.set(this.decorateDialogue(selected.dialogue, selected.key));
    }
  }

  /** Relee la guía de la escena (objetivo del documento, lo que hay en la sala, si queda algo por conocer). */
  refreshGuide(world: SimulationWorldState | null = this.world()): GuiaEscena {
    // El siguiente paso (V7): las puertas cerradas no se proponen; las herramientas de la sala, hasta que se recogen.
    const cerradas = this.doorStates();
    const inventario = world?.inventory ?? [];
    const nombre = this.nombreDeQuienJuega();
    const guiaAutorada = leerGuiaAutorada(world?.map?.ambient, nombre);
    const guide = armarGuia({
      goal: conNombre(fichaDeLaSala(this.visibleNode(), world?.map, guiaAutorada).objetivo, nombre),
      lugares: (this.gameWorld?.places() ?? []).map(l => l.kind === 'door' && cerradas[l.key] === 'locked' ? { ...l, note: 'cerrada' } : l),
      inspeccionados: world?.inspectedObjectKeys ?? [],
      hablados: collectViewedNpcKeys(world, this.viewedNpcKeys()),
      herramientas: (world?.objects ?? []).filter(o => o.type === 'TOOL' && o.toolCode)
        .map(o => ({ key: o.key, label: o.label, recogida: inventario.includes(o.toolCode!) })),
      // La guía escrita en el caso (`ambiente.guia`) reemplaza los pasos calculados; sin ella todo sigue igual.
      autorada: this.guiaAutoradaDe(world, inventario, guiaAutorada),
    });
    // El cálculo sigue disponible para avisos; solo se retiene la ficha mientras se lee o reacciona.
    if (!this.dialogue() && !this.selectedInteraction() && !this.reacting()) this.guide.set(guide);
    return guide;
  }

  private guiaAutoradaDe(
    world: SimulationWorldState | null, inventario: readonly string[], guia: ReturnType<typeof leerGuiaAutorada>,
  ) {
    if (!guia) return undefined;
    return {
      guia,
      mundo: {
        hablados: collectViewedNpcKeys(world, this.viewedNpcKeys()),
        viewedNpcKeysHere: world?.viewedNpcKeysHere,
        inspeccionados: world?.inspectedObjectKeys ?? [],
        inventario,
        herramientasUsadas: world?.usedToolKeysHere ?? world?.usedToolKeys ?? [],
      },
    };
  }

  private mergeViewedNpcKeysFromWorld(world: SimulationWorldState): void {
    const fromDb = this.viewedNpcKeysFromWorld(world);
    if (!fromDb.length) return;
    this.viewedNpcKeys.update(prev => {
      const next = new Set(prev);
      fromDb.forEach(key => next.add(key));
      this.persistViewedNpcKeys(next);
      return next;
    });
  }

  private viewedNpcKeysFromWorld(world: SimulationWorldState): string[] {
    const raw = world.flags?.['viewedNpcKeys'];
    return Array.isArray(raw)
      ? raw.filter((key): key is string => typeof key === 'string' && key.length > 0)
      : [];
  }

  private persistViewedNpcKeys(keys: ReadonlySet<string> = this.viewedNpcKeys()): void {
    const attempt = this.attempt();
    if (!attempt || this.mode() === 'rehearsal') return;
    this.writeStored(`siep_attempt_${attempt.caseVersionId}`, JSON.stringify({
      attemptId: attempt.attemptId,
      viewedNpcKeys: Array.from(keys),
    }));
  }

  private persistPosition() {
    const game = this.attempt(), world = this.world();
    if (!game || !world || !this.lastPosition || game.status !== 'IN_PROGRESS') return;
    const synced = { ...this.lastPosition };
    const order = this.positionOrder.emitir();
    this.simulationService.updateWorldState(game.attemptId,
      synced.x, synced.y, world.map.key).pipe(timeout(PLAZO_ACCION_MS))
      .subscribe({
        next: updated => {
          this.positionFailures = this.positionGiveUps = 0;
          this.positionRetry.cancelar();
          // Una respuesta vieja que llega después de otra más nueva no pisa lo ya sincronizado.
          if (!this.positionOrder.aceptar(order)) return;
          if (this.respuestaVigente(game.attemptId, world.map.key) && updated.attemptId === game.attemptId && updated.map.key === world.map.key) {
            this.lastSyncedPosition = synced;
          }
        },
        // Un fallo no interrumpe la caminata, salvo que el servidor haya perdido el consentimiento (S3-2b): se reintenta.
        error: err => {
          if (isConsentRequiredError(err)) this.requireConsentAgain();
          else if (this.respuestaVigente(game.attemptId)) this.orRehearsalGone(err, () => this.retryPositionSave());
        },
      });
  }

  /** El guardado automático falló: se reintenta con espera creciente y, agotados los intentos, se avisa. */
  private retryPositionSave(): void {
    if (this.destroyed) return;
    this.positionFailures += 1;
    const paso = pasoTrasFalloDeGuardado(this.positionFailures);
    if (paso.accion === 'avisar') {
      this.positionFailures = 0;
      if (this.positionGiveUps++ === 0) this.showActionError(DRAFT_COPY.positionNotSaved.text);   // una sola vez mientras siga pendiente
      this.positionRetry.armar(esperaDeSincronizacion(this.positionGiveUps));   // y se retoma al volver la red y con espera creciente (M2)
      return;
    }
    if (this.positionSaveHandle) window.clearTimeout(this.positionSaveHandle);
    this.positionSaveHandle = window.setTimeout(() => this.persistPosition(), paso.esperaMs);
  }

  /** GAME-01: el backend valida proximidad contra la posición PERSISTIDA.
   *  Antes de una acción validada (interacción, herramienta, puerta) se
   *  sincroniza la posición pendiente del debounce para cubrir la carrera
   *  "moverse y pulsar E antes de persistir". Si el flush falla, la acción
   *  se detiene con un aviso para que la persona reintente (el backend validaría contra una posición vieja).
   *
   *  `lastPosition` llega por `positionChange`, que avisa a Angular a lo sumo cada 125 ms: puede
   *  ir ~19 px por detrás y el servidor valida con radio 60. Por eso se toma antes la posición
   *  viva de la escena (vaciar la de la escena no bastaría: la ruta de E llama a
   *  `openInteraction` sin pasar por ella). */
  private withSyncedPosition(next: () => void): void {
    const live = this.gameWorld?.playerPosition();
    if (live) this.lastPosition = live;
    const game = this.attempt(), world = this.world();
    const pending = this.lastPosition && (
      !this.lastSyncedPosition
      || this.lastSyncedPosition.x !== this.lastPosition.x
      || this.lastSyncedPosition.y !== this.lastPosition.y);
    if (!game || !world || !pending || game.status !== 'IN_PROGRESS') {
      next();
      return;
    }
    if (this.positionSaveHandle) {
      window.clearTimeout(this.positionSaveHandle);
      this.positionSaveHandle = null;
    }
    const synced = { ...this.lastPosition! };
    const order = this.positionOrder.emitir();
    this.simulationService.updateWorldState(game.attemptId,
      synced.x, synced.y, world.map.key).pipe(timeout(PLAZO_ACCION_MS), retry(1))
      .subscribe({
        next: ack => {
          if (!this.respuestaVigente(game.attemptId, world.map.key) || ack.map.key !== world.map.key || ack.attemptId !== game.attemptId) {
            this.busy.set(false);
            return;
          }
          if (this.positionOrder.aceptar(order)) this.lastSyncedPosition = synced;
          next();
        },
        error: err => {
          if (isConsentRequiredError(err)) { this.busy.set(false); this.requireConsentAgain(); return; }
          this.busy.set(false);
          this.releaseDialogue();
          if (this.attempt()?.status !== 'PAUSED') this.orRehearsalGone(err, () => this.showActionError(DRAFT_COPY.positionNotSyncedForAction.text));
        },
      });
  }
}
