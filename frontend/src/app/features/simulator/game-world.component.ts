import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, computed, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import Phaser from 'phaser';
import { Activation, CollisionZoneState, Intensity, MapObjectState, NpcConfig, Persona, RoomConfig, ScenarioConfig, SimulationWorldState } from '../../core/models/simulation.model';
import { backgroundImage, walkableZone } from './room-ambient.util';
import { LEGACY_FEET_OFFSET_Y, isPaintedDoor, markerFeetOffsetY, markerLabelOffsetY, standsOnFeet } from './object-anchor.util';
import { ALTO_DE_PERSONA_PX, type Caja, cajaDelCuerpo, cajaDelRotulo, yDelRotulo } from './rotulo-sin-pisar.util';
import { KenneyDungeonFrames } from './kenney-frames.constants';
import {
  HOSPITAL_COLLISIONS,
  isHospitalMap,
} from './hospital-map.config';
import {
  COMISARIA_COLLISIONS,
  COMISARIA_ZONES,
  isComisariaMap,
} from './comisaria-map.config';
import {
  applySceneDisplayLabels,
  buildSceneAmbientObject,
  getSceneAmbientZones,
  getSceneDisplayLabel,
} from './scene-map-display.util';
import {
  effectiveNpcBehavior, freeTileNear, MovementPattern, npcPause, npcSpeed, npcZone,
  reached, resolvePattern, stepToward,
} from './scene-motion.util';
import { nextAmbientStep, npcMotionStrategyFor } from './motion-strategies';
import { DEPTH, actorDepth, tiledLayerDepth } from './depth-sort.util';
import { AvisoDePuertaComponent } from './sala/aviso-de-puerta.component';
import { MANIFIESTO_DE_PIEZAS_URL, esManifiestoDePiezas } from './sala/catalogo';
import { EscenaDeSala } from './sala/escena-de-sala';
import type { MuebleDeSala } from './sala/escena-de-sala';
import { piezaDelObjeto } from './sala/mueble-vivo';
import type { ManifiestoDePiezas } from './sala/catalogo';
import type { Cuerpo } from './sala/luz';
import { puertaDelObjeto, salaDelMundo } from './sala/mundo-a-sala';
import {
  AUTHORED_CLINICAL_COLLISIONS,
  AUTHORED_PLAYER_SPAWN,
  AUTHORED_ROOM_HEIGHT,
  AUTHORED_ROOM_WIDTH,
  authoredMarkerPositionForMap,
} from './authored-clinical-room.util';
import { resolveSceneRenderer } from './scene-renderer.registry';
import { caseRoomCollisions } from './case-pdf-rooms.geometry';
import { SceneRenderMetadata } from './scene-layer.types';
import { resolveRoomPlayerPosition } from './room-player-position.util';
import {
  LABEL_BASE_FONT_PX,
  LABEL_MAX_SCREEN_WIDTH_PX,
  MARKER_INTERACT_RADIUS,
  NPC_INTERACT_RADIUS,
  NearbyCandidate,
  NearbyPick,
  labelScaleFor,
  pickNearby,
  selectRevealed,
} from './interaction-priority.util';
import { serverRejectsPlayerAt } from './server-world-geometry.util';
import { InteractionVerb, exitVerb, interactionVerb, participatesInInteraction } from './interaction-verb.util';
import { paintVignette, vignetteTextureKey } from './vignette-texture.util';
import {
  WORLD_FONT_FAMILY, WORLD_LABEL_FONT_FAMILY, WORLD_LABEL_INK, WORLD_LABEL_PLATE, whenWorldFontsReady,
} from './world-typography.util';
import { HOVER_HIT, HoverCandidate, pickHoverTarget } from './world-hover.util';
import { NO_WALK, WALK_GROUND_RADIUS_PX, WalkState, cancelWalkOnKeys, reachRadius, startWalk, tickWalk } from './world-walk.util';
import { InputKind, nextInputKind, touchControlsVisible } from './world-input-kind.util';
import { PlaceCandidate } from './world-places.util';
import { DRAFT_COPY } from './draft-copy';
import { pasosDeGesto } from './caso/gestos';
import type { Gesto } from './caso/vocabulario';
import {
  KEY_PERSON_CHEVRON, KEY_PERSON_COLOR, KEY_PERSON_COLOR_HEX, KEY_PERSON_HALO_HEX, KEY_PERSON_NAME_GAP_PX,
  KEY_PERSON_HEAD_PX, isKeyPerson, keyPersonTipOffsetY, resolveKeyPerson,
} from './key-person.util';
import { GAZE_HOLD_MS } from './gaze.util';
import { MS_POR_PASO_DE_MIRADA, Mirada, actualizarMirada, direccionDeVector, miradaInicial, mirarHacia, orientacionDeDato, pasosDeGiro } from './direccion-ocho';
import {
  PERSON_PAUSE_MIN_MS, PersonWalkEnv, PersonWalkState, bodyBlocks, parsePersonMovement, personFacing, personWalkBounds, resumePersonWalk,
  randomPersonPause, startPersonWalk, tickPersonWalk,
} from './person-walk.util';
import { COARSE_POINTER_QUERY, matchesMedia } from './pointer-modality.util';
import {
  NUDGE_SUBSTEPS,
  PlayerDirection,
  PlayerMotionInput,
  computeNudgeStep,
  computePlayerStep,
  playerHitbox,
  rectsIntersect,
  splitFrameDelta,
} from './player-motion.util';
import { EmittedPosition, shouldEmitPosition } from './position-emit.util';
import { heldInput } from './touch-hold.util';
import { attachScrollKeyGuard, isScrollRegionTarget, isShortcutContext, isTextEntryTarget, resolveInteractPress } from './keyboard-focus.util';
import { isCriticalAsset } from './asset-criticality.util';
import {
  Caja as CajaDePlaca, EstadoCamara, Momento, avanzarCamara, comoDibujar, duracionDeViaje, enViajeDentro, esperaDelGeneral, objetivoCamara, sinSaltos,
} from './camara/camara';
import { fitGameToHost, pixelScaleConfig, watchHostSize } from './pixel-canvas';
import { PixelRender } from './pixel-render';
import { doorFacing, doorSpriteSpecs, resolveDoorSideTextureKey, resolveDoorTextureKey } from './door-sprite.util';
import { furnitureSpriteSpecs } from './furniture-sprite.util';
import { CameraFlash, CRISIS_VIGNETTE_TINT, crisisVignetteState, roomEntryFlash, vignetteFrame } from './game-feel.util';
import { artLoadsFor, BibliotecaManifest, objectSheetSpecs, objectSpriteSpecs, spriteFor } from './object-sprite.util';
import {
  ProximityAnimation, ProximityReport, proximityAnimationKey, proximityReport, syncProximityAnimation,
} from './proximity-animation.util';
import { AVATAR_STORAGE_KEY } from '../character/avatar.store';
import { NpcMotionConfig, NpcMovementZone } from '../../core/models/simulation.model';
import type { KitBundle, ViewId } from '../character/kit/kit-engine';
import { CharacterRef, CharacterVisual, resolveCharacter } from '../character/kit/character-visual.resolver';
import {
  KIT_ORIGIN_X, KIT_ORIGIN_Y, addComposedSheets, addRgbaTexture, ensureCharacterAnims, kitFrameIndex, kitSheetKey,
  playKitPose, queueCharacterSheets,
} from '../character/kit/kit-phaser';
import { KitService } from '../character/kit/kit.service';
import { BibliotecaManifestService } from './biblioteca-manifest.service';
import {
  KIT_ICON_OFFSET_Y, KIT_LABEL_OFFSET_Y, PATIENT_RECIPE_ID,
  extrasCharacterRef, markerEmphasis, npcCharacterRef, personCharacterRef, playerCharacterRef,
} from './world-characters.util';
import { PERSONA_ICON_KINDS, personaIconImage, personaIconKey, personaIconKind, personaIconView } from './persona-icon.util';
import { DOOR_FALLBACK_HEIGHT, DOOR_SPRITE_FEET_Y, doorHintY, staleSpriteSize, worldSpriteForTexture } from './world-scale.util';
import { npcsDeLaSala } from './caso/npcs-de-sala';

/** Lo que la pantalla le pide a la cámara (bloque M1): explorar, o encuadrar la conversación o el objeto `clave`. */
export type CameraMoment = { tipo: 'explorar' } | { tipo: 'conversacion' | 'objeto'; clave: string };
export interface CameraOptions { cercana: boolean; acercarAuto: boolean }
export interface CameraReport {
  zoom: number; momento: Momento['tipo']; x: number; y: number; viajando: boolean;
  /** Lo que la interfaz tapa (px CSS) abajo y arriba, tal como lo recibe la cámara, y la sala que encuadra («1200x528»). */
  abajo: number; arriba: number; sala: string;
}

/** P2: el aviso de una puerta de pieza, en px del contenedor del juego. */
interface AvisoDePuertaEnPantalla {
  id: string;
  texto: string;
  bloqueada: boolean;
  x: number;
  y: number;
}

interface WorldCallbacks {
  onReady:       () => void;
  /** P2: una sala por piezas no pudo armarse (alguna pieza no cargó) y se muestra por el camino de imagen fija. */
  onSalaIncompleta?: () => void;
  /** P2: el aviso de la puerta de pieza activa, o null si no hay ninguna (o el mundo está en pausa). */
  onAvisoDePuerta?: (aviso: AvisoDePuertaEnPantalla | null) => void;
  /** Candidato PRINCIPAL en rango (un NPC va como MapObjectState sintético con key `npc:{clave}`); null si no hay. */
  onProximity:   (obj: MapObjectState | null) => void;
  /** Candidato secundario (otra persona u objeto también en rango); null si no hay. */
  onProximityAlso: (obj: MapObjectState | null) => void;
  /** Se pidió interactuar (E o «Interactuar») y no hay nada al alcance. */
  onNothingNearby: () => void;
  onInteract:    (obj: MapObjectState) => void;
  onPosition:    (x: number, y: number) => void;
  /** Posición de cada cuadro con movimiento, sin limitar; se llama fuera de Angular. */
  onPositionFrame: (x: number, y: number) => void;
  onRoomExit:    (targetRoomKey: string, entryX: number, entryY: number) => void;
  onEnterRoom:   (targetNodeKey: string, entryX: number, entryY: number) => void;
  onNpcInteract: (npc: NpcConfig) => void;
  /** El puntero está sobre esta clave (marcador o `npc:{clave}`) o sobre nada (F6-7, VD-5). */
  onHover?:      (key: string | null) => void;
  /** Para la prueba de extremo a extremo: qué objeto anima por cercanía y el cuadro de cada uno; solo se avisa al cambiar. */
  onProximityAnimation?: (report: ProximityReport) => void;
  /** Para la prueba de extremo a extremo: el nombre que lleva el indicador de la persona a atender, o `null` si la sala no lo tiene. */
  onKeyPersonIndicator?: (name: string | null) => void;
  /** Para la prueba de extremo a extremo: dónde está ahora la persona a atender (redondeada), o `null` si no hay; solo se avisa al cambiar. */
  onKeyPersonPosition?: (position: { x: number; y: number } | null) => void;
  /** Cámara (bloque M1): zoom entero asentado, momento y centro redondeado; solo se avisa al cambiar. */
  onCamera?: (camera: CameraReport) => void;
  /** Terminó una caminata pedida con «Ir a…» (F6-11): llegó, o no pudo (muro, mueble, servidor). */
  onWalkEnded?:  (key: string, label: string, outcome: 'arrived' | 'blocked') => void;
  /** Progreso de la precarga, 0-100 (solo la carga inicial). */
  onLoadProgress: (percent: number) => void;
  /**
   * La segunda ola de carga (el arte de la biblioteca que pide `queueMissingArt` ya con el mundo en marcha) sigue viva:
   * se avisa al empezar y con cada archivo que llega o falla, para que el vigilante de arranque cuente esa espera como
   * avance y no declare colgada una sala que sí está cargando.
   */
  onArtLoading?: () => void;
  /** Fin de la precarga; lista las claves esenciales que fallaron (vacía si todo cargó). */
  onLoadComplete: (criticalFailures: string[]) => void;
  /** Recetas de las personas de la sala inicial: solo esas se precargan; el resto se trae en segundo plano (modo aula). */
  recetasIniciales?: () => readonly string[] | null;
  reduceMotion:  boolean;
  sfxMuted:       boolean;
  /** Manifiesto del arte de la biblioteca (null si no cargó: los objetos quedan en su reposo, sin animación de cercanía). */
  artManifest?: BibliotecaManifest | null;
  /** Paquete del kit (null si no cargó: los actores caen a su marcador). */
  kit: KitBundle | null;
}

interface AmbientMover {
  key: string;
  origin: { x: number; y: number };
  pattern: MovementPattern;
  target: { x: number; y: number } | null;
  retargetAt: number;
  patrolIdx: number;
}

/** Persona del caso que camina (`metadata.movimiento` distinto de «quieto»): su estado y la última pose dibujada. */
interface PersonWalker {
  key: string;
  state: PersonWalkState;
  /** Cuánto bajo su marcador pisa (0 si el marcador es su punto de apoyo, `metadata.apoyo = "pies"`; 16 en los casos de antes). */
  feetOffsetY: number;
  lastPose: { direction: ViewId | null; walking: boolean };
}

interface NpcMover {
  key: string;
  cfg: NpcMotionConfig;
  zone: NpcMovementZone;
  target: { x: number; y: number } | null;
  anchorIdx: number;
  pauseUntil: number;
  /** Hacia dónde mira el NPC (8 direcciones, con margen y giro por las vistas de en medio). */
  mirada: Mirada;
  lastPose: { direction: ViewId | null; walking: boolean };
}


/** Profundidad de los rótulos del mundo: sobre todos los actores y bajo los rótulos de puerta (UI). */
const LABEL_DEPTH = DEPTH.UI - 1;
/** Cada cuánto (ms) la cámara vuelve a medir las placas de la interfaz (zona segura, U1). */
const MEDIR_PLACAS_MS = 150;
/** Prefijo de la clave con la que una persona del escenario sale como candidato de proximidad. */
export const NPC_KEY_PREFIX = 'npc:';
/** Cuánto se sostiene el último plano cercano al soltarse (entre la decisión y la reacción, bloque M1). */
const RETENER_PLANO_MS = 1300;
/** Por debajo de esto (px físicos) el lienzo aún no tiene tamaño y la cámara espera (bloque M1). */
const VISTA_MINIMA_PX = 64;
/** Plazo máximo para el primer cuadro del mundo (F6-8): pasado, el anfitrión ofrece reintentar. */
const BOOT_WATCHDOG_MS = 25_000;

/** Una mirada sostenida: cómo miraba antes, cómo mira ahora, sus avisos pendientes y cómo se suelta (`restore`: volver a como miraba). */
interface Gaze { base: ViewId; current: ViewId; timers: Array<{ remove(): void }>; end: (restore?: boolean) => void }
const NO_KEYS: ReadonlySet<string> = new Set<string>();
/** El informe de cercanía cuando ningún objeto tiene hoja: lo que se publica al quedarse sin animaciones. */
const NO_PROXIMITY_REPORT = JSON.stringify({ playing: null, frames: {} });
/** Anillo estático bajo el siguiente destino del proceso: trazo claro con halo oscuro (contraste en cualquier piso). */
const RING_COLOR = 0xcdbcff;
const RING_HALO_COLOR = 0x0b0f1a;

/** Mismas claves en el mismo orden (listas de a lo sumo cuatro): decide si hay que repintar. */
function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class DataDrivenWorldScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  private playerSprite?: Phaser.GameObjects.Sprite;
  /** Visual del jugador en el kit (null si no hay paquete). */
  private playerVisual: CharacterVisual | null = null;
  /** Última persona recibida: cada icono nace con ella (los actores se recrean en cada render). */
  private persona: Persona | null = null;
  /** Las hojas y animaciones del jugador están listas (si no, marcador geométrico). */
  private playerKitReady = false;
  private lastDirection: PlayerDirection = 'down';
  /** Hacia dónde mira el jugador (8 direcciones): la decide la entrada, con margen y giro por las vistas de en medio. */
  private mirada: Mirada = miradaInicial('down');
  /** Última pose aplicada — la animación solo cambia si dirección, caminar o movimiento reducido cambiaron. */
  private lastPose: { direction: ViewId | null; walking: boolean; reduce: boolean } = { direction: null, walking: false, reduce: false };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private wallsLayer?: Phaser.Tilemaps.TilemapLayer;
  private scenarioConfig?: ScenarioConfig;
  private currentRoomKey = '';
  private authoredRoomActive = false;
  private dbDoorArmed = true;
  /** Histéresis de puertas BD: dispara al acercarse (≤30) pero solo re-arma al
   *  alejarse bien (≥72). Evita el rebote cuando el punto de entrada de una sala
   *  queda cerca de la puerta de regreso (el armado inmediato disparaba de vuelta). */
  private readonly doorTriggerDist = 30;
  private readonly doorRearmDist = 72;
  private readonly tiledExits   = new Map<string, { x: number; y: number; w: number; h: number }>();
  private readonly npcMarkers   = new Map<string, Phaser.GameObjects.Container>();
  private readonly markers    = new Map<string, Phaser.GameObjects.Container>();
  private readonly markerData = new Map<string, MapObjectState>();
  private readonly markerLabels = new Map<string, Phaser.GameObjects.Text>();
  /** Objetos con hoja de cercanía, por clave de marcador: se reproduce cuando son el candidato principal. */
  private readonly proximityAnimations = new Map<string, ProximityAnimation>();
  /** Lo último que se avisó de esas animaciones (se compara para avisar solo cuando cambia). */
  private lastProximityReport = '';
  /** Texturas de arte que ya se pidieron (lleguen o fallen): no se vuelven a pedir en cada pintado. */
  private readonly requestedArt = new Set<string>();
  private readonly doorHints  = new Map<string, Phaser.GameObjects.Container>();
  private readonly ambientMovers = new Map<string, AmbientMover>();
  private readonly npcMovers = new Map<string, NpcMover>();
  /** Personas del caso que caminan (P6): `deambula` o `va-y-viene`; las quietas no se registran. */
  private readonly personWalkers = new Map<string, PersonWalker>();
  /** La sala de la que son `personWalkers` y cómo iban al reconstruirse: si la sala es la misma, retoman (cada `world.set` la reconstruye). */
  private personWalkRoom = '';
  private savedPersonWalks: ReadonlyMap<string, PersonWalkState> | null = null;
  /** Último estado en palabras de la persona clave: el indicador se recrea en cada render y lo vuelve a escribir. */
  private personaState: string | null = null;
  /** Personas en pleno gesto: su caminata se suspende hasta que vuelven a su sitio. */
  private readonly gesturing = new Set<string>();
  /** Cierres de los gestos en curso: Phaser descarta los tweens en `killAll` sin avisar, así que se llaman a mano. */
  private readonly gestureEnds = new Set<() => void>();
  /** Miradas sostenidas (`faceTowards`): entran en `gesturing` para que ningún paseo las pise mientras duran. */
  private readonly gazes = new Map<string, Gaze>();
  /** Chevrón y nombre sobre la persona clave de la sala (a lo sumo uno). */
  private keyPersonIndicator?: { key: string; container: Phaser.GameObjects.Container; tipOffsetY: number };
  /** Lo último que se avisó de dónde está la persona clave (se compara para avisar solo cuando cambia de píxel). */
  private lastKeyPersonPosition: { x: number; y: number } | null = null;
  /** El mundo se congela con diálogo/journal/outcome abiertos (Fase 5/13). */
  private motionPaused = false;
  private readonly AMBIENT_SPEED = 22;        // px/sec — slow, clinical
  private readonly AMBIENT_RETARGET_MS = 2600;
  private world?: SimulationWorldState;
  /** Clave del candidato PRINCIPAL en rango: la de un marcador o `npc:{clave}`. */
  private nearestKey: string | null = null;
  /** Clave del candidato secundario (otro en rango), o null. */
  private alsoKey: string | null = null;
  private selectedKey: string | null = null;
  /** Siguiente destino del proceso (lo fija Angular): el anillo y el rótulo fijo van ahí. */
  private nextTargetKey: string | null = null;
  private doorStates: Readonly<Record<string, 'open' | 'locked'>> = {};
  /** Objetos de decisión de otras etapas: se atenúan y no llevan anillo. */
  private dimmedKeys: ReadonlySet<string> = NO_KEYS;
  /** Puntero táctil o modo compacto: en los rótulos solo el destino y el más cercano. */
  private compactLabels = false;
  // ── Ratón (F6-7, VD-5): contorno, verbo y cursor solo sobre lo que el jugador ya podría saber ──
  private hoverKey: string | null = null;
  private hoverOutline?: Phaser.GameObjects.Graphics;
  private hoverLabel?: Phaser.GameObjects.Text;
  /** Lo ya examinado (objetos inspeccionados y personas con las que ya habló): se resalta aunque esté lejos. */
  private examinedKeys: ReadonlySet<string> = NO_KEYS;
  /** «Atajos de una tecla» activos (F6-10): con ellos apagados WASD y E no hacen nada; flechas, Enter y Espacio siguen. */
  private shortcutsEnabled = true;
  /** Caminata pedida con un clic (F6-7): sus «teclas» salen de `tickWalk` y pasan por el movimiento de siempre. */
  private walk: WalkState = NO_WALK;
  /** Destino pedido con «Ir a…» (F6-11): al llegar o rendirse la escena lo avisa; un clic o una tecla lo sueltan. */
  private walkGoal: { key: string; label: string } | null = null;
  /**
   * «Ir a…» pide la caminata MIENTRAS su lista sigue abierta: la escena aún figura pausada (Angular le avisa del cierre
   * en el siguiente ciclo). Esa caminata espera a que se reanude en vez de cancelarse; una pausa que llega con la
   * caminata ya en marcha (un diálogo, la bitácora) sí la suelta.
   */
  private walkWaitsForResume = false;
  private targetRing?: { halo: Phaser.GameObjects.Ellipse; ring: Phaser.GameObjects.Ellipse };
  /** Escala de los rótulos para medir ≥ 12 px de pantalla; se recalcula al cambiar el tamaño del canvas. */
  private labelScale = 1;
  /** Ancho de ajuste de línea de los rótulos de objetos (coordenadas locales del texto). */
  private labelWrap = 140;
  /** Lista de trabajo de la proximidad y sus piezas: se reutilizan, nada se asigna por cuadro. */
  private readonly candidates: NearbyCandidate[] = [];
  private readonly candidatePool: NearbyCandidate[] = [];
  private readonly pick: NearbyPick = { primary: null, secondary: null };
  /** Rótulos visibles ahora y su arreglo de trabajo: solo se repinta cuando el conjunto cambia. */
  private revealed: string[] = [];
  private revealScratch: string[] = [];
  private readonly npcKeys = new Map<string, string>();
  /** Claves de los rótulos visibles cuyo dueño se desplaza: son los únicos que se recolocan por cuadro. */
  private readonly followLabels: string[] = [];
  private ready = false;
  /** Vértices al píxel con zoom de cámara (PHA-1) y resolución de los textos (PHA-2). */
  private pixelRender?: PixelRender;
  private assetsLoaded = false;
  private firstSceneFadeDone = false;
  /** Activación de la persona y intensidad de la escena; las fija Angular y sobreviven a los re-render. */
  private activation: Activation = 'CALM';
  private intensity: Intensity = 'MEDIUM';
  /** Capa de crisis sobre la viñeta de tono; se recrea en cada render. */
  private crisisVignette?: Phaser.GameObjects.Image;
  /** Sala que encuadra la cámara: el zoom entero se recalcula con ella al cambiar el lienzo. */
  private roomSize = { width: AUTHORED_ROOM_WIDTH, height: AUTHORED_ROOM_HEIGHT };
  /** Cámara (bloque M1): la decide `camara/camara.ts`; aquí solo su estado, lo pedido y el último aviso. */
  private camState: EstadoCamara | null = null;
  private camCut = true;
  private camMoment: CameraMoment = { tipo: 'explorar' };
  /** Persona que reacciona (`frameActors`): manda sobre el momento mientras dura la reacción. */
  private camFrameKey: string | null = null;
  private camOptions: CameraOptions = { cercana: false, acercarAuto: true };
  /** Alto (px CSS) que el cuadro de diálogo (o la franja de abajo) tapa abajo del lienzo, y la franja de arriba. */
  private camCoveredCss = 0;
  private camCoveredTopCss = 0;
  /** Zona segura (U1): quien mide las placas de la interfaz sobre el lienzo (px CSS) y lo último que midió. */
  private camPlacasMedir: (() => readonly CajaDePlaca[]) | null = null;
  private camPlacas: readonly CajaDePlaca[] = [];
  private camPlacasEn = Number.NEGATIVE_INFINITY;
  private camFrozen = false;
  private camSettledZoom = 0;
  private camReport = '';
  /** Dirección de cámara (regla 7): el plano en curso, el viaje entre planos y el plano general al entrar a una sala. */
  private camMomentType: Momento['tipo'] = 'explorar';
  private camTargetZoom = 0;
  private camTravel: { desde: EstadoCamara; inicio: number; dur: number } | null = null;
  private camEntrada: { espera: number; hasta: number | null; x: number | null; y: number | null } | null = null;
  private camRoomId = '';
  private readonly camRoomsSeen = new Set<string>();
  /** Escala CSS del lienzo ya compuesto durante un viaje (1 en reposo). */
  private camDrawScale = 1;
  /** El último plano cercano, sostenido un momento al soltarse (ver `cameraMomentNow`), y si se está sosteniendo ahora. */
  private camRetenido: { momento: Momento; hasta: number; x: number; y: number } | null = null;
  private camSosteniendo = false;
  private camUltimoObjetivo: EstadoCamara | null = null;
  /** Viñeta de tono de la sala actual (se redibuja al rectángulo visible si cambia el lienzo). */
  private toneVignette?: Phaser.GameObjects.Image;
  /** Textura vigente de cada viñeta (tono o crisis): al cambiar el tamaño se retira la anterior (F6-8). */
  private readonly vignetteKeys = new Map<'tone' | 'crisis', string>();
  /** La última imagen de cada papel: se destruye antes de retirar su textura (ver `addVignette`). */
  private readonly vignetteImages = new Map<'tone' | 'crisis', Phaser.GameObjects.Image>();
  private crisisPulse?: Phaser.Tweens.Tween;
  /** Último estado de crisis aplicado; evita reiniciar un pulso que no cambió. */
  private crisisStateKey = '';
  /** Destello decidido al cambiar de sala; se dispara al terminar el render. */
  private pendingRoomFlash: CameraFlash | null = null;
  private stepTimer = 0;
  private readonly STEP_INTERVAL = 280; // ms — natural walking cadence (~215 steps/min)
  /** Última posición avisada a Angular (ver position-emit.util). */
  private lastEmittedPosition: EmittedPosition | null = null;
  /** Hay movimiento que la limitación de frecuencia todavía no avisó. */
  private positionDirty = false;
  private interactionCooldown = 0;
  /** Pulsación de interactuar que espera a que termine el enfriamiento. */
  private interactPending = false;
  /** `down` recibido de E, Espacio y Enter desde el último cuadro (ver `create()`). */
  private readonly tappedKeys = { e: false, space: false, enter: false };
  private readonly INTERACTION_COOLDOWN_MS = 260;
  /** Flecha táctil apretada (null si no hay ninguna) y desde cuándo (reloj de la escena). */
  private heldDirection: PlayerDirection | null = null;
  private heldSince = 0;

  constructor(private readonly callbacks: WorldCallbacks) {
    super('data-driven-world');
  }

  preload() {
    // Cargas posteriores (hojas bajo demanda) no deben reabrir la capa de carga:
    // por eso ambos oyentes ignoran lo que llega después de la carga inicial.
    const criticalFailures: string[] = [];
    let lastPercent = -1;
    this.load.on('progress', (value: number) => {
      if (this.assetsLoaded) return;
      const percent = Math.round(value * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      this.callbacks.onLoadProgress(percent);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // Lo decorativo cae a su respaldo; un mapa o tileset deja la sala en paneles planos.
      if (!this.assetsLoaded && isCriticalAsset(file.key)) criticalFailures.push(file.key);
    });

    // ── Plain images for Tiled tilemap layer rendering (all 3 Kenney packs) ──
    // tiny-dungeon: 12×11 = 132 tiles  (GID  1–132)
    // tiny-town:    12×11 = 132 tiles  (GID  133–264)
    // rpg-urban:    27×18 = 486 tiles  (GID  265–750)
    this.load.image('dungeon-img', '/assets/game/kenney/tiny-dungeon/Tilemap/tilemap_packed.png');
    this.load.image('town-img',   '/assets/game/kenney/tiny-town/Tilemap/tilemap_packed.png');
    this.load.image('rpg-img',    '/assets/game/kenney/rpg-urban-pack/Spritesheet/tilemap_packed.png');

    // Dungeon spritesheet (used for interactive object marker icons)
    this.load.spritesheet('dungeon-tiles',
      '/assets/game/kenney/tiny-dungeon/Tilemap/tilemap_packed.png',
      { frameWidth: 16, frameHeight: 16 });

    // ── Jugador del kit (spec §8.2): receta publicada (PNG) o avatar compuesto (lienzo) ──
    const kit = this.callbacks.kit;
    if (kit) {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(AVATAR_STORAGE_KEY) : null;
      this.playerVisual = resolveCharacter(kit, playerCharacterRef(stored));
      queueCharacterSheets(this, this.playerVisual);
      // NPC, personas, guía y figurantes: todas las recetas que no son jugables (unos 14 personajes).
      // Antes de caminar solo las de la sala inicial; las demás, en segundo plano al terminar (ver create()).
      const iniciales = this.callbacks.recetasIniciales?.() ?? null;
      for (const [recipeId, recipe] of Object.entries(kit.recipes)) {
        if (recipe.kind === 'jugable') continue;
        if (iniciales && !iniciales.includes(recipeId)) { this.recetasDiferidas.push(recipeId); continue; }
        queueCharacterSheets(this, resolveCharacter(kit, { kind: 'receta', recipeId }));
      }
    }

    // ── Sprites pixel-art de objetos (herramientas + escenario), puertas y mobiliario; fallback si faltan ──
    for (const spec of [...objectSpriteSpecs(), ...doorSpriteSpecs(), ...furnitureSpriteSpecs()]) {
      this.load.image(spec.textureKey, spec.assetPath);
    }
    // Hojas de cercanía de esos mismos sprites: solo las que el manifiesto respalda; si una falla, el objeto queda en su reposo.
    for (const sheet of objectSheetSpecs(this.callbacks.artManifest ?? null)) {
      this.requestedArt.add(sheet.textureKey);
      this.load.spritesheet(sheet.textureKey, sheet.assetPath, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
    }

    // Tiled JSON maps — all known scenario keys (missing ones fail silently)
    // Rename the Tiled object "name" field to match your backend object keys.
    const scenarioKeys = [
      'urgencias-crisis', 'ruta-proteccion', 'informe-integral',
      'valoracion-comisaria', 'proteccion-nna', 'cierre-seguimiento'
    ];
    for (const key of scenarioKeys) {
      this.load.tilemapTiledJSON(`map-${key}`, `/assets/game/maps/${key}.json`);
    }

    // Multi-room maps — comisaria-familia pilot + 5 remaining scenarios
    const roomMapKeys = [
      'comisaria-sala-espera',
      'comisaria-consultorio',
      'comisaria-supervisor',
      // single-room scenario halls
      'urgencias-sala',
      'ruta-sala',
      'informe-oficina',
      'nna-sala',
      'cierre-sala',
    ];
    for (const key of roomMapKeys) {
      this.load.tilemapTiledJSON(`map-${key}`, `/assets/game/maps/${key}.json`);
    }

    // ── Audio: Kenney Foley footsteps + Interface Sounds blip (CC0) ──────────
    // Missing files fail silently via the 'loaderror' handler above — no crash.
    this.load.audio('step0', '/assets/game/audio/footstep_concrete_000.ogg');
    this.load.audio('step1', '/assets/game/audio/footstep_concrete_001.ogg');
    this.load.audio('step2', '/assets/game/audio/footstep_concrete_002.ogg');
    this.load.audio('proximity-blip', '/assets/game/audio/blip_select.ogg');

    this.load.once('complete', () => {
      this.assetsLoaded = true;
      this.callbacks.onLoadComplete(criticalFailures);
    });
  }

  /** Recetas que no están en la sala inicial: se cargan en segundo plano tras la carga inicial. */
  private recetasDiferidas: string[] = [];

  /** Trae en segundo plano las hojas de las personas que no están en la sala inicial (listas antes de llegar a una puerta). */
  cargarRecetasDiferidas(): void {
    const kit = this.callbacks.kit;
    if (!kit || !this.recetasDiferidas.length) return;
    for (const recipeId of this.recetasDiferidas.splice(0)) queueCharacterSheets(this, resolveCharacter(kit, { kind: 'receta', recipeId }));
    this.load.start();
  }

  create() {
    this.pixelRender = new PixelRender(this).attach();
    this.events.once('shutdown', () => this.endGestures());
    this.events.once('shutdown', () => this.soltarSalaPorPiezas());   // P2
    this.ready = true;
    // Phaser solo LEE las teclas: sin captura no llama a `preventDefault`, así el navegador
    // conserva Enter/Espacio en los botones y todas las teclas en el textarea de la bitácora.
    // `createCursorKeys` captura flechas, Espacio y Shift por su cuenta (de ahí el apagado
    // global); `update()` ignora lo que corresponda según el elemento con foco.
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.disableGlobalCapture();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,E,SPACE,ENTER', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.playerKitReady = this.playerVisual !== null && ensureCharacterAnims(this, this.playerVisual);
    for (const kind of PERSONA_ICON_KINDS) addRgbaTexture(this, personaIconKey(kind), personaIconImage(kind));
    // Un toque corto (keydown y keyup en el mismo cuadro, habitual con pocos fps) deja `JustDown` en falso
    // y la pulsación se perdía junto a una persona (T0.2): el evento `down` de la tecla sí llega siempre.
    this.keys['E']?.on('down', () => { this.tappedKeys.e = true; });
    this.keys['SPACE']?.on('down', () => { this.tappedKeys.space = true; });
    this.keys['ENTER']?.on('down', () => { this.tappedKeys.enter = true; });
    // Ratón (F6-7): por eventos del puntero, nunca por cuadro (`update()` no cambia).
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('gameout', () => this.setHover(null));
    // Al cambiar el tamaño o el dpr del lienzo: nuevo zoom entero y rótulos de ≥ 12 px de pantalla.
    this.scale.on('resize', () => this.refitCamera());
    this.scale.on('resize', this.onScaleResize, this);
    // La cámara se mueve después de que el jugador se movió en el cuadro (bloque M1).
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, (_time: number, delta: number) => this.stepCamera(delta));
    this.onScaleResize();
    this.renderWorld();
  }

  /** Publica la posición: al DOM en cada cuadro (contrato del e2e) y a Angular como
   *  mucho cada POSITION_EMIT_INTERVAL_MS. `force` salta el intervalo (fin de un
   *  movimiento, nudge táctil). */
  private emitPosition(force = false): void {
    if (!this.player) return;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y);
    this.callbacks.onPositionFrame(x, y);
    const last = this.lastEmittedPosition;
    if (last && last.x === x && last.y === y) {
      this.positionDirty = false;
      return;
    }
    const now = this.time.now;
    if (!force && !shouldEmitPosition(last, x, y, now)) {
      this.positionDirty = true;
      return;
    }
    this.positionDirty = false;
    this.lastEmittedPosition = { x, y, at: now };
    this.callbacks.onPosition(x, y);
  }

  /** Al dejar de avanzar, la última posición se avisa exacta: es la que se persiste. */
  private flushPosition(): void {
    if (this.positionDirty) this.emitPosition(true);
  }

  override update(time: number, delta: number) {
    this.reportProximityAnimation();
    if (!this.player || !this.cursors || !this.keys || !this.world) {
      this.tappedKeys.e = this.tappedKeys.space = this.tappedKeys.enter = false;
      return;
    }
    // Sin captura de Phaser, las teclas también llegan mientras se escribe en la bitácora o se
    // activa un botón. El foco se lee una vez por cuadro y decide qué teclas cuentan.
    const focus = document.activeElement;
    // Escribiendo o con el foco en una región con scroll (sus flechas la desplazan, H-12) el jugador no camina.
    const typing = isTextEntryTarget(focus) || isScrollRegionTarget(focus);
    // Con una capa abierta (diálogo, decisión, plano del lugar, bitácora…: `motionPaused`) el jugador tampoco camina.
    const bloqueado = typing || this.motionPaused;
    // Las letras (WASD y E) solo con el ajuste activo y con el foco en el juego o en el cuerpo (F6-10, WCAG 2.1.4).
    const letters = this.shortcutsEnabled && isShortcutContext(focus);
    const keyInput: PlayerMotionInput = heldInput({
      left:  !bloqueado && (this.cursors.left.isDown  || (letters && this.keys['A'].isDown)),
      right: !bloqueado && (this.cursors.right.isDown || (letters && this.keys['D'].isDown)),
      up:    !bloqueado && (this.cursors.up.isDown    || (letters && this.keys['W'].isDown)),
      down:  !bloqueado && (this.cursors.down.isDown  || (letters && this.keys['S'].isDown)),
    }, this.heldDirection, this.time.now - this.heldSince);
    // Caminata del ratón (F6-7): el teclado o la cruceta mandan sobre el destino y una capa abierta lo suelta.
    // Lo que pide pasa por el mismo paso con colisión y deslizamiento que el teclado.
    let input = keyInput;
    if (this.walk.target) {
      if (this.motionPaused && this.walkWaitsForResume) {
        // Pedida desde una lista que se está cerrando: espera, sin soltarse ni mover al jugador.
      } else {
        this.walkWaitsForResume = false;
        this.walk = this.motionPaused ? NO_WALK : cancelWalkOnKeys(this.walk, keyInput);
        if (this.walk.target) {
          const tick = tickWalk(this.walk, { x: this.player.x, y: this.player.y }, delta);
          this.walk = tick.state;
          input = tick.input;
          if (tick.arrived || tick.gaveUp) this.finishWalkGoal(tick.arrived ? 'arrived' : 'blocked');
        } else {
          this.walkGoal = null; // lo soltaron las teclas o una capa: nadie espera un aviso de llegada
        }
      }
    }
    // Helper puro (player-motion.util): normaliza diagonal, limita delta y
    // resuelve dirección estable (sin parpadeo diagonal).
    const step = computePlayerStep(input, this.lastDirection, delta);
    // Hacia dónde mira (8 direcciones, sin parpadeo entre vecinas): la entrada, no el paso, para que contra la pared mire hacia la tecla.
    this.mirada = actualizarMirada(this.mirada, Number(input.right) - Number(input.left), Number(input.down) - Number(input.up), delta, { reducirMovimiento: this.callbacks.reduceMotion });

    if (step.moving) {
      // Sub-pasos con colisión: misma velocidad real a cualquier fps.
      let moved = false;
      for (const subDelta of splitFrameDelta(delta)) {
        const part = computePlayerStep(input, this.lastDirection, subDelta);
        moved = this.movePlayer(part.dx, part.dy) || moved;
      }
      this.lastDirection = step.direction;
      if (moved) {
        this.emitPosition();
        this.applyPlayerPose(this.mirada.actual, true);
        // ── Footstep audio: one random variant every STEP_INTERVAL ms ────────
        if (!this.callbacks.reduceMotion && !this.callbacks.sfxMuted) {
          this.stepTimer += delta;
          if (this.stepTimer >= this.STEP_INTERVAL) {
            this.stepTimer = 0;
            this.sound.play(`step${Phaser.Math.Between(0, 2)}`, { volume: 0.35 });
          }
        }
      } else {
        // Bloqueado del todo contra pared/mueble: sin avance real no debe
        // correr la animación de caminata (ni sonar pasos).
        this.flushPosition();
        this.applyPlayerPose(this.mirada.actual, false);
      }
    } else {
      this.stepTimer = this.STEP_INTERVAL; // prime timer: first step fires on frame 1 of movement, not after a full interval
      this.flushPosition();
      this.applyPlayerPose(this.mirada.actual, false);
    }

    this.interactionCooldown = Math.max(0, this.interactionCooldown - delta);
    // JustDown se lee SIEMPRE, los tres, aunque el resultado se descarte: `Key._justDown` sigue
    // en true hasta que alguien lo lee, y una «e» escrita en la bitácora dispararía
    // `interactNearest()` en cuanto el foco saliera del campo.
    // La E se lee SIEMPRE (como las otras dos) y después se enmascara: sin leerla quedaría latente.
    const justE = Phaser.Input.Keyboard.JustDown(this.keys['E']);
    const pressed = resolveInteractPress(focus, {
      e: justE && letters,
      space: Phaser.Input.Keyboard.JustDown(this.keys['SPACE']),
      enter: Phaser.Input.Keyboard.JustDown(this.keys['ENTER']),
    });
    // El toque corto cuenta igual que `JustDown` (mismas reglas de foco) y se consume en este cuadro.
    if (!letters) this.tappedKeys.e = false;
    const tapped = resolveInteractPress(focus, this.tappedKeys);
    this.tappedKeys.e = this.tappedKeys.space = this.tappedKeys.enter = false;
    // Una pulsación durante el enfriamiento espera a que termine (como cuando JustDown
    // quedaba sin leer); al escribir, cualquier pulsación pendiente se descarta.
    this.interactPending = !typing && (this.interactPending || pressed || tapped);
    if (this.interactPending && this.interactionCooldown <= 0) {
      this.interactPending = false;
      this.interactionCooldown = this.INTERACTION_COOLDOWN_MS;
      this.interactNearest();
    }
    this.updateNearestInteraction();
    this.updateAmbientMovers(time, delta);
    this.updateNpcMovers(time, delta);
    this.updatePersonWalkers(delta);
    // 2.5D: re-ordena por Y a los actores que se mueven
    if (this.player) this.ysort(this.player);
    for (const mover of this.ambientMovers.values()) {
      const marker = this.markers.get(mover.key);
      if (marker) this.ysort(marker);
    }
    for (const walker of this.personWalkers.values()) {
      const marker = this.markers.get(walker.key);
      if (marker) this.ysort(marker);
    }
    for (const container of this.npcMarkers.values()) this.ysort(container);
    this.checkExitTriggers();
    this.checkDbDoorTriggers();
    // P2: la sala por piezas abre la puerta a la que se acerca quien juega y rehace su luz (sombra incluida).
    // P2: con una capa encima (plano, diálogo, bitácora) las puertas de pieza no se abren ni se cierran: quedan como estaban.
    if (this.salaPorPiezas && !this.motionPaused) {
      const activa = this.salaPorPiezas.actualizar(delta, this.player ? { x: this.player.x, y: this.player.y } : null,
        new Set(Object.keys(this.doorStates).filter(clave => this.doorStates[clave] === 'locked')), this.callbacks.reduceMotion);
      this.sombrasConSilueta(this.salaPorPiezas);
      this.avisoDePuerta(activa);
      this.salaPorPiezas.cerca(this.nearestKey);
    } else {
      this.avisoDePuerta(null);
    }
  }

  /**
   * P2: el aviso de la puerta de pieza activa («E · Pasar a …»), un botón de Angular sobre el lienzo, en px del contenedor
   * (posición de `posicionDelAviso` por la cámara y el devicePixelRatio). Solo avisa a Angular cuando cambia.
   */
  private avisoDePuerta(id: string | null): void {
    let aviso: AvisoDePuertaEnPantalla | null = null;
    const p = id ? this.salaPorPiezas?.posicionDelAviso(id) : null;
    const obj = id ? this.markerData.get(id) : undefined;
    if (id && p && obj) {
      const cam = this.cameras.main, dpr = 1 / (this.scale.zoom || 1);
      aviso = {
        id, texto: exitVerb(obj.label), bloqueada: this.doorStates[id] === 'locked',
        x: Math.round(((p.x - cam.worldView.x) * cam.zoom) / dpr), y: Math.round(((p.y - cam.worldView.y) * cam.zoom) / dpr),
      };
    }
    const firma = aviso ? `${aviso.id}|${aviso.x}|${aviso.y}|${aviso.bloqueada}` : '';
    if (firma === this.firmaDelAviso) return;
    this.firmaDelAviso = firma;
    this.callbacks.onAvisoDePuerta?.(aviso);
  }

  /** P2: la sombra con silueta de quien juega y de cada persona del caso, en una sala por piezas (regla 3 de calidad). */
  private sombrasConSilueta(sala: EscenaDeSala): void {
    const medida = (window as unknown as { __p2Sombras?: { ms: number; veces: number } }).__p2Sombras;   // medida opcional: la prueba e2e `medir:` la pone para saber cuánto cuestan las sombras
    const t0 = medida ? performance.now() : 0;
    this.sombrasConSiluetaMedidas(sala);
    if (medida) { medida.ms += performance.now() - t0; medida.veces++; }
  }

  private sombrasConSiluetaMedidas(sala: EscenaDeSala): void {
    if (this.player) sala.sombraDeFigura('jugador', this.playerSprite, this.player.x, this.player.y);
    for (const [key, m] of this.markers) {
      const sprite = (m as unknown as Record<string, unknown>)['__personSprite'] as Phaser.GameObjects.Sprite | undefined;
      if (sprite) sala.sombraDeFigura(key, sprite, m.x + sprite.x, m.y + sprite.y);
    }
  }

  setWorld(world: SimulationWorldState) {
    this.pendingRoomFlash = roomEntryFlash(this.world?.map.key ?? null, world.map.key, this.callbacks.reduceMotion)
      ?? this.pendingRoomFlash;
    // Cambio de mapa (decisión o puerta): la sala previa ya no aplica. Sin este
    // reset, keepPosition "conserva" la posición del render transicional y se
    // pierde la entrada (entryX/entryY) que enter_room persistió en world.player.
    // La primera hidratación también nace desarmada: una recarga puede restaurar
    // al jugador junto a la puerta de regreso antes de resolver ScenarioConfig.
    if (!this.world || this.world.map.key !== world.map.key) {
      this.currentRoomKey = '';
      // La caminata del ratón y el destino de «Ir a…» eran de la sala anterior: en el render heredado (casos del
      // editor, sin ScenarioConfig) nada más los suelta y el jugador caminaría solo hacia coordenadas ajenas.
      this.walk = NO_WALK;
      this.walkGoal = null;
      // Recién entrado a una sala: desarmar hasta alejarse de la puerta de regreso
      // (la histéresis de checkDbDoorTriggers re-arma al superar doorRearmDist).
      this.dbDoorArmed = false;
    }
    this.world = world;
    this.nearestKey = null;
    this.alsoKey = null;
    this.callbacks.onProximity(null);
    this.callbacks.onProximityAlso(null);
    if (this.ready) this.renderWorld();
  }

  setScenarioConfig(config: ScenarioConfig | null) {
    this.scenarioConfig = config ?? undefined;
    if (this.ready && this.world) this.renderWorld();
  }

  /** Pausa el movimiento del mundo (NPCs y ambient) sin congelar al jugador. */
  setMotionPaused(paused: boolean) {
    this.motionPaused = paused;
    if (paused) {
      this.setHeldDirection(null); // un overlay tapa los controles: no seguir caminando detrás
      this.setHover(null);
    }
    this.settlePersonWalkerPoses();
    this.applyCrisisState();
  }

  /** Flecha táctil apretada o soltada (null). La entrada de `update()` la suma pasado TOUCH_HOLD_DELAY_MS. */
  setHeldDirection(direction: PlayerDirection | null) {
    this.heldDirection = direction;
    // `boot()` y `ngOnChanges` pueden pausar antes de que Phaser arranque la escena (sin reloj aún).
    this.heldSince = direction && this.time ? this.time.now : 0;
  }

  setReduceMotion(reduced: boolean) {
    this.callbacks.reduceMotion = reduced;
    // Al reducir el movimiento lo que animaba vuelve al cuadro 0; al volver a permitirlo, el principal retoma.
    this.syncProximityAnimations();
    // Las personas que caminaban vuelven a su sitio y quedan quietas; al permitirlo de nuevo, retoman desde ahí.
    if (reduced) this.restPersonWalkers();
    this.applyCrisisState();
  }

  /** Seguro antes de `create()`: la capa se pinta con este valor en el primer render. */
  setPersonaScene(activation: Activation, intensity: Intensity) {
    this.activation = activation;
    this.intensity = intensity;
    this.applyCrisisState();
  }

  /**
   * La sala ya se ve: el destello de cambio de sala si lo hay. Sin sacudida por decisión: el movimiento de cámara no
   * puede revelar la clasificación antes del cierre (RN-08).
   */
  playRevealEffects(): void {
    this.playPendingRoomFlash();
  }

  setSfxMuted(muted: boolean) {
    this.callbacks.sfxMuted = muted;
    const sound = this.sound as Phaser.Sound.BaseSoundManager | undefined;
    if (!sound) return;
    try {
      sound.mute = muted;
    } catch {
      // Phaser can call this after the scene has been destroyed during route changes.
    }
  }

  /**
   * Called by Angular when the player steps through an exit.
   * Fades out, loads the new room, fades back in.
   */
  transitionToRoom(targetRoomKey: string, entryX: number, entryY: number) {
    if (!this.scenarioConfig) return;
    const roomConfig = this.scenarioConfig.rooms.find(r => r.key === targetRoomKey);
    if (!roomConfig) return;
    this.pendingRoomFlash = roomEntryFlash(this.currentRoomKey || null, targetRoomKey, this.callbacks.reduceMotion)
      ?? this.pendingRoomFlash;
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.renderRoom(roomConfig, entryX, entryY);
      this.cameras.main.fadeIn(180, 0, 0, 0);
      // El destello espera a que el fundido deje ver la sala: debajo de él no se percibe.
      this.cameras.main.once('camerafadeincomplete', () => this.playPendingRoomFlash());
    });
  }

  setSelected(key: string | null) {
    this.selectedKey = key;
    this.refreshMarkerStates();
  }

  nudge(direction: 'up' | 'down' | 'left' | 'right') {
    if (!this.player) return;
    this.walk = NO_WALK; // un paso de la cruceta manda sobre el destino del ratón
    this.walkGoal = null;
    // Mismo contrato que WASD (player-motion.util): sub-pasos con colisión y
    // sliding, pose/dirección estables, sin caminar en el sitio contra paredes.
    let moved = false;
    for (let i = 0; i < NUDGE_SUBSTEPS; i++) {
      const step = computeNudgeStep(direction, this.lastDirection);
      if (!this.movePlayer(step.dx, step.dy)) break;
      moved = true;
    }
    this.lastDirection = direction;
    this.mirada = mirarHacia(this.mirada, direction, { reducirMovimiento: this.callbacks.reduceMotion });
    this.applyPlayerPose(this.mirada.actual, moved); // el update() del frame siguiente vuelve a idle
    if (moved) {
      // Cada toque es un paso discreto: se avisa siempre, sin esperar el intervalo.
      this.emitPosition(true);
      this.ysort(this.player);
    }
    this.updateNearestInteraction();
  }

  /** Punto de pies actual (px enteros) o null si el jugador aún no existe. */
  playerPosition(): { x: number; y: number } | null {
    return this.player ? { x: Math.round(this.player.x), y: Math.round(this.player.y) } : null;
  }

  /**
   * Actúa sobre el candidato principal, despachando por su clave: una persona (`npc:{clave}`) abre su
   * conversación y un marcador sigue el camino de siempre. Sin nada al alcance avisa una sola vez, sin
   * sonido de error (F-14): quien escucha decide cómo decirlo.
   */
  interactNearest() {
    const key = this.nearestKey;
    if (key !== null) {
      if (key.startsWith(NPC_KEY_PREFIX)) {
        const npc = this.npcConfigFor(key);
        if (npc) { this.callbacks.onNpcInteract(npc); return; }
      } else {
        const obj = this.proximityObjectFor(key);
        if (obj) { this.salaPorPiezas?.revisar(obj.key); this.callbacks.onInteract(obj); return; }
      }
    }
    this.callbacks.onNothingNearby();
  }

  /** Siguiente destino, puertas y objetos atenuados (los fija Angular); repinta solo lo que cambió. */
  setOrientation(next: {
    nextTargetKey: string | null;
    doorStates: Readonly<Record<string, 'open' | 'locked'>>;
    dimmedKeys: ReadonlySet<string>;
  }): void {
    const targetChanged = next.nextTargetKey !== this.nextTargetKey;
    const dimmedChanged = next.dimmedKeys !== this.dimmedKeys;
    const doorsChanged = next.doorStates !== this.doorStates;
    this.nextTargetKey = next.nextTargetKey;
    this.doorStates = next.doorStates;
    this.dimmedKeys = next.dimmedKeys;
    if (!this.ready || !this.world) return;
    if (doorsChanged) this.applyDoorStates();
    if (targetChanged || dimmedChanged) this.syncTargetRing();
    // El conjunto de rótulos puede cambiar sin que el jugador se mueva (nuevo destino u objeto atenuado).
    this.updateNearestInteraction(true);
    this.refreshMarkerStates();
  }

  /** Puntero táctil o ventana compacta: rótulos mínimos (destino y el más cercano). */
  setCompactLabels(compact: boolean): void {
    this.compactLabels = compact || this.touchPointer();
  }

  /** «Atajos de una tecla» activos o no (F6-10): llega de Angular. */
  setShortcutsEnabled(enabled: boolean): void {
    this.shortcutsEnabled = enabled;
  }

  /** Lo ya examinado llega de Angular: objetos inspeccionados y personas con las que ya se habló (`npc:{clave}`). */
  setExamined(keys: ReadonlySet<string>): void {
    this.examinedKeys = keys;
  }

  /**
   * El puntero se mueve (F6-7, VD-5). Con dedo no hay «pasar por encima» y con una capa abierta el mundo no
   * responde. Solo se resalta lo que el jugador ya podría saber (`pickHoverTarget`: dentro del radio de percepción
   * o ya examinado): nada por descubrir se ilumina. Va por eventos del puntero, nunca por cuadro.
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.setHover(this.hoverTargetAt(pointer));
  }

  /**
   * Qué elegible tiene el puntero encima ahora mismo (null si nada o si el mundo no responde: dedo, capa abierta, sin
   * jugador). Lo usan el movimiento del puntero y el clic: con el cursor quieto la cámara o una persona pueden moverse
   * y el objetivo marcado en el último movimiento ya no es el que está debajo.
   */
  private hoverTargetAt(pointer: Phaser.Input.Pointer): string | null {
    if (pointer.wasTouch || this.motionPaused || !this.player || !this.world) return null;
    const px = this.player.x;
    const py = this.player.y;
    const candidates: HoverCandidate[] = [];
    this.markers.forEach((marker, key) => {
      const obj = this.markerData.get(key);
      if (!obj || !this.isInteractive(obj)) return;
      const moving = this.markerMoves(key);
      const x = moving ? marker.x : obj.x;
      const y = moving ? marker.y : obj.y;
      candidates.push({ key, x, y, playerDistance: Math.hypot(px - x, py - y) });
    });
    this.npcMarkers.forEach((container, key) => {
      candidates.push({
        key: this.npcKeyOf(key), x: container.x, y: container.y,
        playerDistance: Math.hypot(px - container.x, py - container.y),
      });
    });
    return pickHoverTarget({ x: pointer.worldX, y: pointer.worldY }, candidates, this.examinedKeys);
  }

  private setHover(key: string | null): void {
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.drawHover();
    // `input` ya no existe tras destruir la escena (cambio de ruta): el cursor se deja como esté.
    this.input?.setDefaultCursor(key === null ? 'default' : 'pointer');
    this.callbacks.onHover?.(key);
  }

  /** Dónde y con qué verbo se anuncia lo que tiene el puntero encima (el mismo verbo que la barra de contexto). */
  private hoverAnchor(key: string): { x: number; y: number; verb: InteractionVerb; reach: number; label: string } | null {
    const obj = this.proximityObjectFor(key);
    if (!obj) return null;
    let x = obj.x;
    let y = obj.y;
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const container = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      if (!container) return null;
      x = container.x;
      y = container.y;
    } else {
      const marker = this.markers.get(key);
      if (!marker) return null;
      if (this.markerMoves(key)) { x = marker.x; y = marker.y; }
    }
    const state = obj.type === 'EXIT' ? this.doorStates[key] : undefined;
    const door = state ? { state, missing: [], stageLocked: false, message: null } : null;
    const radius = key.startsWith(NPC_KEY_PREFIX) ? NPC_INTERACT_RADIUS : MARKER_INTERACT_RADIUS;
    const verb = interactionVerb(obj, door);
    return verb ? { x, y, verb, reach: reachRadius(radius), label: obj.label } : null;
  }

  /**
   * Lo que «Ir a…» puede ofrecer en la sala actual (F6-11): las personas, las puertas y los objetos con los que se
   * puede actuar. La regla de lo examinado la aplica quien muestra la lista (`selectPlaces`): aquí no se filtra por
   * lo que el jugador sabe y no sale nada clínico, solo clave, nombre y tipo.
   */
  placeCandidates(): PlaceCandidate[] {
    const out: PlaceCandidate[] = [];
    this.npcMarkers.forEach((_container, key) => {
      const candidateKey = this.npcKeyOf(key);
      const npc = this.npcConfigFor(candidateKey);
      if (npc) out.push({ key: candidateKey, label: npc.displayName, kind: 'person' });
    });
    const mapKey = this.world?.map.key ?? '';
    this.markers.forEach((_marker, key) => {
      const obj = this.markerData.get(key);
      const keyPerson = obj !== undefined && this.keyPersonKey() === key;
      if (!obj || !(keyPerson || this.isInteractive(obj))) return;
      out.push({
        key,
        label: getSceneDisplayLabel(obj, mapKey),
        kind: obj.type === 'EXIT' ? 'door' : obj.type === 'PERSON' ? 'person' : 'object',
        ...(keyPerson ? { note: DRAFT_COPY.keyPerson.text } : {}),
      });
    });
    return out;
  }

  /** Camina hasta lo elegido en «Ir a…» (F6-11) y lo avisa al llegar o si no pudo. false si ya no está en la sala. */
  walkToKey(key: string): boolean {
    const anchor = this.player ? this.hoverAnchor(key) : null;
    if (!anchor) return false;
    this.walkGoal = { key, label: anchor.label };
    this.walkWaitsForResume = this.motionPaused;
    this.walk = startWalk({ x: anchor.x, y: anchor.y, radius: anchor.reach });
    return true;
  }

  private finishWalkGoal(outcome: 'arrived' | 'blocked'): void {
    const goal = this.walkGoal;
    this.walkGoal = null;
    if (goal) this.callbacks.onWalkEnded?.(goal.key, goal.label, outcome);
  }

  /**
   * Clic con el puntero fino (F6-7, VD-5): el jugador camina hasta ahí; sobre algo señalado, hasta su alcance de
   * interacción (la barra de contexto ofrece entonces la acción de siempre). Con dedo, con una capa abierta o con
   * un botón que no es el principal no camina. La caminata la aplica `update()` con el movimiento del teclado.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch || this.motionPaused || !this.player || !this.world) return;
    if (pointer.button !== 0) return;
    // Se vuelve a decidir qué hay bajo el puntero (el último movimiento pudo quedar atrás: cámara o persona en marcha).
    const key = this.hoverTargetAt(pointer);
    this.setHover(key);
    const aimed = key === null ? null : this.hoverAnchor(key);
    this.walkGoal = null;
    this.walkWaitsForResume = false;
    this.walk = aimed
      ? startWalk({ x: aimed.x, y: aimed.y, radius: aimed.reach })
      : startWalk({ x: pointer.worldX, y: pointer.worldY, radius: WALK_GROUND_RADIUS_PX });
  }

  /** Contorno y verbo sobre lo señalado: la forma (borde y texto) lleva el mensaje, no solo el color. */
  private drawHover(): void {
    const anchor = this.hoverKey === null ? null : this.hoverAnchor(this.hoverKey);
    if (!anchor) {
      this.hoverOutline?.setVisible(false);
      this.hoverLabel?.setVisible(false);
      return;
    }
    const outline = this.hoverOutline?.active
      ? this.hoverOutline
      : (this.hoverOutline = this.add.graphics().setDepth(LABEL_DEPTH));
    const left = anchor.x - HOVER_HIT.halfWidth;
    const top = anchor.y - HOVER_HIT.above;
    const width = HOVER_HIT.halfWidth * 2;
    const height = HOVER_HIT.above + HOVER_HIT.below;
    outline.clear();
    outline.lineStyle(4, RING_HALO_COLOR, 0.85).strokeRect(left - 1, top - 1, width + 2, height + 2);
    // Una puerta bloqueada lo dice también en el rótulo: el contorno no depende solo del color.
    outline.lineStyle(2, RING_COLOR, 1).strokeRect(left, top, width, height);
    outline.setVisible(true);

    const label = this.hoverLabel?.active
      ? this.hoverLabel
      : (this.hoverLabel = this.add.text(0, 0, '', {
          fontFamily: WORLD_LABEL_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: WORLD_LABEL_INK,
          backgroundColor: WORLD_LABEL_PLATE, padding: { x: 4, y: 3 }, align: 'center',
        }).setOrigin(0.5, 1).setScale(this.labelScale).setDepth(LABEL_DEPTH));
    label.setText(anchor.verb.locked ? `${anchor.verb.text} · bloqueada` : anchor.verb.text);
    label.setPosition(anchor.x, top - 4).setVisible(true);
  }

  focus(key: string) {
    const m = this.markers.get(key);
    if (!m || this.callbacks.reduceMotion) return;
    // Un marcador con sprite de pixel art (una persona del kit, una puerta, una herramienta) no se
    // escala: el pulso va a su anillo.
    const bag = m as unknown as Record<string, unknown>;
    const target = bag['__kitSprite'] === true || bag['__pixelSprite'] === true ? bag['__pulse'] : m;
    this.tweens.add({ targets: target, scale: 1.16, duration: 140, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
  }

  /** Termina los gestos en curso: promesa resuelta y persona en su sitio. */
  private endGestures(): void {
    for (const end of [...this.gestureEnds]) end();
  }

  /** ¿Hay un gesto en curso? Mirar hacia algo (`faceTowards`) no cuenta. */
  isGesturing(key: string): boolean { return this.gesturing.has(key) && !this.gazes.has(key); }

  /** El marcador (persona o NPC) de una clave del mundo. */
  private actorOf(key: string): Phaser.GameObjects.Container | undefined {
    return key.startsWith(NPC_KEY_PREFIX) ? this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length)) : this.markers.get(key);
  }

  /**
   * La reacción de `key` a una respuesta: la cámara encuadra al jugador y a esa persona, de cerca, hasta `releaseFrame`
   * (bloque M1). Con movimiento reducido es un corte. Sin la clave en la sala, nada.
   */
  frameActors(key: string): void {
    if (!this.feetOf(key)) return;
    this.camFrameKey = key;
  }

  /** Terminó la reacción: la cámara vuelve al momento que pide la pantalla. */
  releaseFrame(): void {
    this.camFrameKey = null;
  }

  /**
   * Lo que la pantalla pide (bloque M1): explorar, hablar con `clave` o revisar `clave`; cuánto tapa abajo el cuadro de
   * diálogo o la franja de cine, y cuánto la franja de arriba (px CSS).
   */
  setCameraMoment(moment: CameraMoment, coveredCss: number, coveredTopCss = 0): void {
    this.camMoment = moment;
    this.camCoveredCss = Math.max(0, coveredCss);
    this.camCoveredTopCss = Math.max(0, coveredTopCss);
  }

  setCameraOptions(options: CameraOptions): void {
    this.camOptions = { ...options };
  }

  /** Zona segura (U1): la pantalla da cómo medir sus placas sobre el lienzo; se mide a lo sumo cada `MEDIR_PLACAS_MS`. */
  setCameraPlacas(medir: (() => readonly CajaDePlaca[]) | null): void {
    this.camPlacasMedir = medir;
    this.camPlacasEn = Number.NEGATIVE_INFINITY;
    if (!medir) this.camPlacas = [];
  }

  /** Con el plano abierto la cámara no se mueve ni cambia de zoom. */
  setCameraFrozen(frozen: boolean): void {
    this.camFrozen = frozen;
  }

  private camNow(): number {
    return this.time?.now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  /**
   * El plano que toca ahora: la reacción manda (la cámara va a quien reacciona); luego lo que pide la pantalla; al
   * entrar a una sala, el plano general hasta que pasa su espera o el personaje se mueve; si no, caminar.
   */
  private cameraMomentNow(ahora: number): Momento {
    this.camSosteniendo = false;
    const cercano = this.closeMomentNow();
    if (cercano) {
      this.camRetenido = { momento: cercano, hasta: ahora + RETENER_PLANO_MS, x: this.player?.x ?? 0, y: this.player?.y ?? 0 };
      return cercano;
    }
    // Entre la decisión y la reacción el diálogo se cierra casi un segundo antes de que empiece la reacción (la respuesta
    // del servidor): el plano se sostiene QUIETO para que la cámara no amague con volver a caminar ni dé un pulso al
    // irse el cuadro. Si el personaje echa a andar, se suelta enseguida.
    const r = this.camRetenido;
    if (r && ahora < r.hasta && this.player && Math.hypot(this.player.x - r.x, this.player.y - r.y) <= 6) {
      this.camSosteniendo = true;
      return r.momento;
    }
    this.camRetenido = null;
    const entrada = this.camEntrada;
    if (entrada && this.player) {
      if (entrada.x === null || entrada.y === null) { entrada.x = this.player.x; entrada.y = this.player.y; }
      if (entrada.hasta === null) entrada.hasta = ahora + entrada.espera;
      const seMovio = Math.hypot(this.player.x - entrada.x, this.player.y - entrada.y) > 6;
      if (!seMovio && ahora < entrada.hasta) return { tipo: 'general' };
      this.camEntrada = null;
    }
    return { tipo: 'explorar' };
  }

  /** La reacción, la conversación o el objeto en curso, con los pies de quien corresponda; null si no hay. */
  private closeMomentNow(): Momento | null {
    if (this.camFrameKey) {
      const de = this.feetOf(this.camFrameKey);
      if (de) return { tipo: 'reaccion', de };
    }
    if (this.camMoment.tipo !== 'explorar') {
      const feet = this.feetOf(this.camMoment.clave);
      if (feet) return this.camMoment.tipo === 'conversacion' ? { tipo: 'conversacion', con: feet } : { tipo: 'objeto', en: feet };
    }
    return null;
  }

  /**
   * Un cuadro de cámara (bloque M1, regla 7 de la vara): `objetivoCamara` decide el plano; entre un plano y otro hay un
   * viaje con arranque y llegada suaves (`enViaje`, con la duración de cada cambio); dentro de un plano, el seguimiento
   * con zona muerta (`avanzarCamara`). Con movimiento reducido todo es corte. Quieta durante un fundido y con el plano
   * del lugar abierto. Durante un viaje la escena se dibuja al entero de abajo y el lienzo ya compuesto se escala.
   */
  private stepCamera(delta: number): void {
    const cam = this.cameras?.main;
    if (!cam || !this.player || this.camFrozen || cam.fadeEffect.isRunning) return;
    // Lienzo todavía sin tamaño (se ve 1 px de alto mientras la pantalla se arma): no se encuadra ni corre la espera del
    // plano general; el primer cuadro con tamaño real es el corte.
    if (cam.width < VISTA_MINIMA_PX || cam.height < VISTA_MINIMA_PX) return;
    const ahora = this.camNow();
    // El plano general de una sala nueva cuenta solo cuando se ve: detrás de una nota o un diálogo, espera.
    if (this.camEntrada?.hasta != null && this.motionPaused) this.camEntrada.hasta += Math.max(0, delta);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const momento = this.cameraMomentNow(ahora);
    const sala = { ancho: this.roomSize.width, alto: this.roomSize.height };
    // Las placas de la interfaz cambian poco (abrir la ficha, una acción al alcance): se miden unas veces por segundo.
    if (this.camPlacasMedir && ahora - this.camPlacasEn >= MEDIR_PLACAS_MS) {
      this.camPlacas = this.camPlacasMedir();
      this.camPlacasEn = ahora;
    }
    const vista = {
      ancho: cam.width, alto: cam.height, dpr,
      cubiertoAbajo: this.camCoveredCss * dpr, cubiertoArriba: this.camCoveredTopCss * dpr,
      placas: this.camPlacas.map(p => ({ x: p.x * dpr, y: p.y * dpr, ancho: p.ancho * dpr, alto: p.alto * dpr })),
    };
    const calculado = objetivoCamara({
      jugador: { x: this.player.x, y: this.player.y },
      sala,
      vista,
      momento,
      cercana: this.camOptions.cercana,
      acercarAuto: this.camOptions.acercarAuto,
      cerca: this.nearestKey ? this.feetOf(this.nearestKey) : null,
    }, this.camCut ? null : this.camState);
    // Plano sostenido: el objetivo es el de antes de soltarse (sin recalcular con el cuadro que se va).
    const objetivo = this.camSosteniendo && this.camUltimoObjetivo ? this.camUltimoObjetivo : calculado;
    if (!this.camSosteniendo) this.camUltimoObjetivo = calculado;

    let next: EstadoCamara;
    if (this.camCut || !this.camState || this.callbacks.reduceMotion) {
      next = { centro: { ...objetivo.centro }, zoom: objetivo.zoom };
      this.camTravel = null;
    } else {
      const cambiaPlano = momento.tipo !== this.camMomentType || objetivo.zoom !== this.camTargetZoom;
      if (cambiaPlano) {
        const dur = momento.tipo !== this.camMomentType ? duracionDeViaje(this.camMomentType, momento.tipo) : 800;
        this.camTravel = { desde: this.camState, inicio: ahora, dur };
      }
      if (this.camTravel) {
        const t = (ahora - this.camTravel.inicio) / this.camTravel.dur;
        next = enViajeDentro(this.camTravel.desde, objetivo, t, vista, sala);
        if (t >= 1) this.camTravel = null;
      } else {
        next = avanzarCamara(this.camState, objetivo, delta, false);
      }
      // V5: un objetivo que cambia de golpe a mitad de un viaje (la placa que se esquiva) no se ve como un salto.
      next = sinSaltos(this.camState, next, delta);
    }
    this.camCut = false;
    this.camMomentType = momento.tipo;
    this.camTargetZoom = objetivo.zoom;
    this.camState = next;

    const { base, escala } = comoDibujar(next.zoom);
    if (cam.zoom !== base) cam.setZoom(base);
    cam.centerOn(next.centro.x, next.centro.y);
    this.applyCanvasScale(escala);
    this.scaleLabelsForZoom(next.zoom);
    if (escala === 1 && base !== this.camSettledZoom) {
      this.camSettledZoom = base;
      this.onCameraZoomSettled();
    }
    const report: CameraReport = {
      zoom: this.camSettledZoom, momento: momento.tipo, x: Math.round(next.centro.x), y: Math.round(next.centro.y),
      viajando: this.camTravel !== null, abajo: Math.round(this.camCoveredCss), arriba: Math.round(this.camCoveredTopCss),
      sala: `${sala.ancho}x${sala.alto} vista ${cam.width}x${cam.height}`,
    };
    const key = `${report.zoom}|${report.momento}|${report.x}|${report.y}|${report.viajando}|${report.abajo}|${report.arriba}|${report.sala}`;
    if (key !== this.camReport) {
      this.camReport = key;
      this.callbacks.onCamera?.(report);
    }
  }

  /**
   * Escala CSS del lienzo ya compuesto (regla 7: el viaje escala la imagen entera, no cada dibujo, y los píxeles no
   * bailen). 1 en reposo. El contenedor recorta lo que sobra; la interfaz HTML encima no se escala.
   */
  private applyCanvasScale(escala: number): void {
    if (Math.abs(escala - this.camDrawScale) < 0.0005) return;
    this.camDrawScale = escala;
    const canvas = this.game?.canvas as HTMLCanvasElement | undefined;
    if (!canvas?.style) return;
    if (canvas.parentElement) canvas.parentElement.style.overflow = 'hidden';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.transformOrigin = '50% 50%';
    canvas.style.transform = escala === 1 ? '' : `scale(${escala})`;
  }

  /**
   * Los rótulos miden lo mismo en pantalla con cualquier zoom (regla 7): su escala de mundo es la de ×1 dividida por el
   * zoom efectivo. En un viaje se ajusta cada cuadro (solo `setScale`, sin repintar textos); en reposo, una vez.
   */
  private scaleLabelsForZoom(zoom: number): void {
    const displayScale = this.scale?.displayScale?.x;
    if (!displayScale || !(zoom > 0)) return;
    const next = labelScaleFor(displayScale, 1) / zoom;
    if (Math.abs(next - this.labelScale) < 0.0005) return;
    this.labelScale = next;
    this.markerLabels.forEach(label => label.setScale(next));
    this.hoverLabel?.setScale(next);
    this.keyPersonIndicator?.container.setScale(next);
    this.doorHints.forEach(hint => { hint.setScale(next); this.placeDoorHint(hint); });
    this.npcMarkers.forEach(container => {
      const bag = container as unknown as Record<string, unknown>;
      (bag['__labelSprite'] as Phaser.GameObjects.Text | undefined)?.setScale(next);
      (bag['__hintSprite'] as Phaser.GameObjects.Text | undefined)?.setScale(next);
    });
  }

  /**
   * La cámara llegó a un zoom entero nuevo: rótulos de ≥ 12 px de pantalla, textos a esa resolución y viñetas al nuevo
   * rectángulo visible (como `refitCamera`). Una vez por cambio de zoom, nunca por cuadro. Las viñetas solo se rehacen
   * si ya existen: al pintar una sala, `renderWorld` las crea después con el zoom ya puesto.
   */
  private onCameraZoomSettled(): void {
    this.pixelRender?.refreshTexts(this.camSettledZoom);
    if (this.syncLabelScale() && this.world) this.refreshMarkerStates();
    if (!this.ready) return;
    if (this.toneVignette) {
      this.toneVignette.destroy();
      this.applyLightingOverlay();
    }
    if (this.crisisVignette) {
      this.crisisVignette.destroy();
      this.applyCrisisVignette();
    }
  }

  /** Reproduce los pasos del gesto sobre el marcador de `key` y lo deja en su sitio exacto; resuelve al terminar (o ya, sin pasos).
   *  `voltear` no se aplica: game-world.kit.contract.spec.ts prohíbe espejar personas y ningún gesto lo pide. */
  playGesture(key: string, gesto: Gesto): Promise<void> {
    this.gazes.get(key)?.end();   // un gesto manda sobre la mirada
    const actor = this.actorOf(key);
    const toward = (a: number, b: number) => Math.sign(a - b) as -1 | 0 | 1;
    const steps = actor ? pasosDeGesto(gesto, {
      haciaJugador: { x: toward(this.player?.x ?? actor.x, actor.x), y: toward(this.player?.y ?? actor.y, actor.y) },
    }, this.callbacks.reduceMotion) : [];
    if (!actor || steps.length === 0 || this.gesturing.has(key)) return Promise.resolve();
    const origin = { x: actor.x, y: actor.y, angle: actor.angle };
    this.gesturing.add(key);
    return new Promise<void>(resolve => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.gestureEnds.delete(finish);
        this.gesturing.delete(key);
        if (actor.scene) {   // un repintado de la sala (o su cierre) ya pudo destruirla
          actor.setPosition(origin.x, origin.y).setAngle(origin.angle);
        }
        resolve();
      };
      this.gestureEnds.add(finish);
      let x = origin.x, y = origin.y;
      const run = (i: number) => {
        if (i >= steps.length) { finish(); return; }
        const step = steps[i];
        x += step.dx; y += step.dy;
        this.tweens.add({
          targets: actor, x, y, angle: step.angulo, duration: step.ms, ease: 'Sine.easeInOut',
          onComplete: () => run(i + 1), onStop: finish,
        });
      };
      run(0);
    });
  }

  /** Una línea en palabras bajo el nombre de la persona clave (`null` la quita); la escena la recuerda entre renders. */
  setPersonaState(text: string | null): void {
    this.personaState = text;
    const indicator = this.keyPersonIndicator;
    const marker = indicator && this.markers.get(indicator.key);
    const object = indicator && this.markerData.get(indicator.key);
    if (!indicator || !marker || !object) return;
    indicator.container.destroy();
    this.buildKeyPersonIndicator(marker, object);
  }

  /** Pone a la persona (o NPC) mirando hacia el jugador o hacia otra clave, sin caminar, y SOSTIENE la mirada `holdMs`: el paseo no la pisa y al vencer retoma. De media vuelta pasa antes por una dirección intermedia (con movimiento reducido, de una vez). */
  faceTowards(key: string, target: 'player' | string, holdMs: number = GAZE_HOLD_MS): void {
    const actor = this.actorOf(key);
    const from = this.liveFeetOf(key);
    const to = target === 'player' ? (this.player ? { x: this.player.x, y: this.player.y } : null) : this.liveFeetOf(target);
    if (!actor || !from || !to || (this.gesturing.has(key) && !this.gazes.has(key))) return;
    const dx = to.x - from.x;
    const gaze = this.holdGaze(key, actor, holdMs);
    const direction = direccionDeVector(dx, to.y - from.y, null) ?? gaze.current;
    // Gira por las vistas de en medio, una cada MS_POR_PASO_DE_MIRADA (con movimiento reducido, de una vez).
    const pasos = this.callbacks.reduceMotion ? [direction] : pasosDeGiro(gaze.current, direction, dx);
    if (!pasos.length) { this.poseFacing(key, actor, direction); gaze.current = direction; return; }
    pasos.forEach((vista, k) => {
      const poner = (): void => { gaze.current = vista; this.poseFacing(key, actor, vista); };
      if (k === 0) poner(); else gaze.timers.push(this.time.delayedCall(k * MS_POR_PASO_DE_MIRADA, poner));
    });
  }

  /** Registra (o renueva) la mirada sostenida de `key`: queda en `gesturing` hasta vencer, hasta un gesto o hasta que la sala se repinte. */
  private holdGaze(key: string, actor: Phaser.GameObjects.Container, holdMs: number): Gaze {
    const previous = this.gazes.get(key);
    const base = previous?.base ?? this.facingOf(key);
    previous?.end();
    const gaze: Gaze = { base, current: previous?.current ?? base, timers: [], end: () => undefined };
    gaze.end = (restore = false): void => {
      for (const timer of gaze.timers) timer.remove();
      gaze.timers.length = 0;
      if (this.gazes.get(key) !== gaze) return;
      this.gazes.delete(key);
      this.gesturing.delete(key);
      this.gestureEnds.delete(gaze.end);
      // Quien camina retoma su rumbo en su siguiente paso; el resto vuelve a como miraba.
      if (restore && actor.scene && !this.personWalkers.has(key)) this.poseFacing(key, actor, gaze.base);
    };
    this.gazes.set(key, gaze);
    this.gesturing.add(key);
    this.gestureEnds.add(gaze.end);
    gaze.timers.push(this.time.delayedCall(holdMs, () => gaze.end(true)));
    return gaze;
  }

  /** Hacia dónde mira ahora la persona (o NPC) de `key`. */
  private facingOf(key: string): ViewId {
    const walker = this.personWalkers.get(key);
    if (walker) return walker.lastPose.direction ?? walker.state.direction;
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const name = key.slice(NPC_KEY_PREFIX.length);
      const mover = this.npcMovers.get(name);
      const config = (this.npcMarkers.get(name) as unknown as Record<string, unknown> | undefined)?.['__npcConfig'] as NpcConfig | undefined;
      return mover?.lastPose.direction ?? orientacionDeDato(config?.facing);
    }
    return personFacing(this.markerData.get(key)?.facing);
  }

  /** Pone la pose de reposo de `key` mirando a `direction` (por el camino que cada tipo de persona ya tiene). */
  private poseFacing(key: string, actor: Phaser.GameObjects.Container, direction: ViewId): void {
    const walker = this.personWalkers.get(key);
    if (walker) {
      // Su mirada queda donde se le puso: al retomar el paseo gira desde aquí, no salta.
      const mirada = mirarHacia(walker.state.mirada ?? miradaInicial(walker.state.direction), direction, { reducirMovimiento: true });
      walker.state = { ...walker.state, mirada, direction };
      this.applyPersonPose(walker, actor, direction, false);
      return;
    }
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const mover = this.npcMovers.get(key.slice(NPC_KEY_PREFIX.length));
      if (mover) mover.mirada = mirarHacia(mover.mirada ?? miradaInicial(mover.lastPose.direction ?? 'down'), direction, { reducirMovimiento: true });
      if (mover) this.applyNpcPose(mover, actor, direction, false); else this.applyNpcFacing(actor, direction);
      return;
    }
    const bag = actor as unknown as Record<string, unknown>;
    const sprite = bag['__personSprite'] as Phaser.GameObjects.Sprite | undefined;
    const visual = bag['__personVisual'] as CharacterVisual | undefined;
    if (sprite && visual) playKitPose(sprite, visual, direction, false, this.callbacks.reduceMotion);
  }

  /** Dónde pisa ahora `key`: el contenedor VIVO (camina o flota) más el contacto con el piso; no la posición de reposo del dato. */
  private liveFeetOf(key: string): { x: number; y: number } | null {
    const actor = this.actorOf(key);
    if (!actor) return null;
    const object = this.markerData.get(key);
    return { x: actor.x, y: actor.y + (key.startsWith(NPC_KEY_PREFIX) || !object ? 0 : markerFeetOffsetY(object)) };
  }

  /** Claves de las personas (marcadores PERSON y `npc:{clave}`) cuyos pies están a menos de `radiusPx` de los pies del objeto `key` (posiciones vivas). */
  peopleNear(key: string, radiusPx: number): string[] {
    const from = this.liveFeetOf(key);
    if (!from) return [];
    const near: string[] = [];
    const check = (candidate: string): void => {
      const feet = candidate === key ? null : this.liveFeetOf(candidate);
      if (feet && Math.hypot(feet.x - from.x, feet.y - from.y) < radiusPx) near.push(candidate);
    };
    for (const [other, object] of this.markerData) if (object.type === 'PERSON' && this.markers.has(other)) check(other);
    for (const npcKey of this.npcMarkers.keys()) check(NPC_KEY_PREFIX + npcKey);
    return near;
  }

  /** La cabeza de la persona en px CSS relativos al host (cámara, zoom y escala del lienzo); `null` si no está en la sala. Sin asignaciones por llamada salvo el resultado. */
  screenAnchorOf(key: string): { x: number; y: number } | null {
    const actor = this.actorOf(key);
    const object = this.markerData.get(key);
    if (!actor) return null;
    const footY = actor.y + (key.startsWith(NPC_KEY_PREFIX) || !object ? 0 : markerFeetOffsetY(object));
    const cam = this.cameras.main;
    const view = cam.worldView;
    const zoom = cam.zoom || 1;
    const scale = this.scale?.displayScale;
    const sx = scale?.x || 1;
    const sy = scale?.y || 1;
    const x = ((actor.x - view.x) * zoom) / sx;
    const y = (((footY - KEY_PERSON_HEAD_PX) - view.y) * zoom) / sy;
    const k = this.camDrawScale;
    if (k === 1) return { x, y };
    // Durante un viaje el lienzo compuesto va escalado alrededor de su centro (bloque M1).
    const cx = cam.width / (2 * sx);
    const cy = cam.height / (2 * sy);
    return { x: cx + (x - cx) * k, y: cy + (y - cy) * k };
  }

  /** El aspecto con el que se dibuja a la persona o al NPC de `key`. */
  characterVisualOf(key: string): CharacterVisual | null {
    const bag = this.actorOf(key) as unknown as Record<string, unknown> | undefined;
    return (bag?.['__personVisual'] ?? bag?.['__npcVisual'] ?? null) as CharacterVisual | null;
  }

  /** ¿Es `key` la persona clave de la sala? */
  isKeyPerson(key: string): boolean { return this.keyPersonKey() === key; }

  /** Fase 4: draws the authored per-room background image (world.map.ambient.backgroundImage)
   *  over the procedural floor. No-op if none; safe on load failure (procedural floor remains). */
  private applyAuthoredBackground(mapW: number, mapH: number): void {
    const url = backgroundImage(this.world?.map.ambient);
    if (!url) return;
    const key = `authored-bg-${url}`;
    const place = () => {
      if (!this.textures.exists(key)) return;
      this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(mapW, mapH).setDepth(1);
    };
    if (this.textures.exists(key)) { place(); return; }
    this.load.image(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, place);
    this.load.start();
  }

  /**
   * Crea las capas de tiles de un Tilemap aplicando las bandas 2.5D
   * (floor, props_back, walls_back/walls, props_front, lighting, overlay).
   * La capa de paredes alimenta `this.wallsLayer` para colisión.
   * Retrocompatible: mapas con solo `Floor`/`Walls` se comportan igual que antes.
   */
  private buildTiledLayers(
    tilemap: Phaser.Tilemaps.Tilemap,
    tilesets: Phaser.Tilemaps.Tileset[],
  ): void {
    for (const layerData of tilemap.layers) {
      const depth = tiledLayerDepth(layerData.name);
      if (depth === null) continue;
      // Sin el parámetro `gpu` (Phaser 4), createLayer() siempre crea la variante CPU clásica;
      // el tipo de retorno es la unión TilemapLayer | TilemapGPULayer solo porque la firma no
      // tiene sobrecargas para distinguirlo según ese argumento.
      const layer = tilemap.createLayer(layerData.name, tilesets) as Phaser.Tilemaps.TilemapLayer | null;
      if (!layer) continue;
      layer.setDepth(depth);
      // La capa de paredes (legacy `Walls` o `walls_back`/`collision`) es la sólida.
      const norm = layerData.name.trim().toLowerCase().replace(/^\d+[_-]?/, '');
      if (norm === 'walls' || norm === 'walls_back' || norm === 'collision') {
        this.wallsLayer = layer;
      }
    }
  }

  /**
   * Pide el arte de los objetos del mundo que aún no está en la escena: reposos y hojas de la biblioteca, que no se
   * precargan (son muchos y cada caso usa pocos). Devuelve true si quedó algo en cola; el mundo se pinta de nuevo al
   * terminar la carga. Lo que falla no se vuelve a pedir: ese objeto queda en su reposo o en su marcador de siempre.
   */
  private queueMissingArt(): boolean {
    const pending = artLoadsFor(this.renderableWorldObjects(), this.callbacks.artManifest ?? null)
      .filter(art => !this.textures.exists(art.textureKey) && !this.requestedArt.has(art.textureKey));
    if (pending.length === 0) return false;
    for (const art of pending) {
      this.requestedArt.add(art.textureKey);
      if (art.kind === 'sheet') {
        this.load.spritesheet(art.textureKey, art.assetPath, { frameWidth: art.frameWidth!, frameHeight: art.frameHeight! });
      } else {
        this.load.image(art.textureKey, art.assetPath);
      }
    }
    // Esta carga ocurre tras la inicial, que ya no avisa su progreso: cada archivo que llega (o falla) reanuda el vigilante.
    const waiting = () => this.callbacks.onArtLoading?.();
    this.load.on(Phaser.Loader.Events.PROGRESS, waiting);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.PROGRESS, waiting);
      if (this.ready) this.renderWorld();
    });
    waiting();
    this.load.start();
    return true;
  }

  /** P2: la sala por piezas que se está mostrando (null en las salas de imagen fija o de Tiled). */
  private salaPorPiezas: EscenaDeSala | null = null;
  private manifiestoDePiezasPedido = false;
  /** P2: claves de piezas que fallaron al cargar: no se vuelven a pedir (hallazgo 2 de la revisión de Codex). */
  private readonly piezasFallidas = new Set<string>();
  /** P2: la sala por piezas apartada durante un repintado de la misma sala (vuelve sin rearmarse). */
  private salaApartada: EscenaDeSala | null = null;
  /** P2: dónde estaba la cámara al apartar la sala (vuelve ahí si la sala vuelve). */
  private camaraApartada: { x: number; y: number } | null = null;

  /** P2: lo que dibuja la sala por piezas: estructura, encuadre, puertas y objetos con arte. Igual = no hay que rearmarla. */
  private firmaDeSala(): string {
    if (!this.world) return '';
    const mapa = this.world.map as unknown as Record<string, unknown>;
    const objetos = this.world.objects
      .filter(o => o.type === 'EXIT' || typeof o.metadata?.['arte'] === 'string')
      .map(o => [o.key, o.type, o.x, o.y, o.metadata?.['arte'] ?? null, o.metadata?.['espejo'] ?? null, o.metadata?.['muro'] ?? null,
        o.metadata?.['pos'] ?? null, o.metadata?.['modelo'] ?? null]);
    return JSON.stringify([mapa['key'], mapa['structure'] ?? null, (mapa['ambient'] as Record<string, unknown> | undefined)?.['encuadre'] ?? null, objetos]);
  }
  private salaIncompletaAvisada: string | null = null;
  private firmaDelAviso = '';

  /**
   * P2: los muebles y objetos del caso que tienen arte, como cuerpos de la luz: su silueta es el alfa de su dibujo y se
   * apoyan en el centro de su base (`cuerpoDe`). Las personas no: su sombra camina con ellas (`sombraDeFigura`).
   */
  private cuerposDeLaSala(): Cuerpo[] {
    const cuerpos: Cuerpo[] = [];
    for (const [key, m] of this.markers) {
      const arte = (m as unknown as Record<string, unknown>)['__artSprite'] as Phaser.GameObjects.Image | undefined;
      const obj = this.markerData.get(key);
      if (!arte || !obj || obj.type === 'PERSON' || obj.metadata?.['sombra'] === false) continue;
      const cuerpo = EscenaDeSala.cuerpoDeSprite(arte, m.x, m.y);
      if (cuerpo) cuerpos.push(cuerpo);
    }
    return cuerpos;
  }

  /**
   * P2: los objetos del caso cuyo arte es una pieza de la biblioteca (un mueble, un objeto o una herramienta de P1 y O1, por
   * su ruta o por el arte viejo que reemplaza): los dibuja la escena de la sala, con su animación, su brillo y su luz propia.
   */
  private mueblesDeLaSala(manifiesto: ManifiestoDePiezas): MuebleDeSala[] {
    return this.renderableWorldObjects().flatMap(obj => {
      if (obj.type === 'EXIT' || obj.type === 'PERSON') return [];
      const pieza = piezaDelObjeto(obj.metadata?.['arte'], manifiesto);
      return pieza ? [{
        id: obj.key, clave: pieza.clave, ficha: pieza.ficha, x: obj.x, y: obj.y + markerFeetOffsetY(obj),
        espejo: obj.metadata?.['espejo'] === true,
      }] : [];
    });
  }

  /** P2: ¿el mundo de ahora es una sala por piezas (`map.structure` válida)? Manda sobre el ScenarioConfig del legado. */
  private esSalaPorPiezas(): boolean {
    return !!this.world && salaDelMundo(this.world.map as unknown as Record<string, unknown>, this.world.objects) !== null;
  }

  /** P2: suelta la sala por piezas (sprites, texturas propias y capas de luz) al cambiar de camino o al apagar la escena. */
  private soltarSalaPorPiezas(): void {
    this.salaPorPiezas?.destruir();
    this.salaPorPiezas = null;
    this.salaApartada?.destruir();
    this.salaApartada = null;
    this.avisoDePuerta(null);
  }

  /**
   * P2 (contrato x-siep 2.2): si el mapa trae `structure`, la sala se arma con piezas, con su luz y sus puertas, y aquí se
   * monta lo demás del juego como siempre. Devuelve false si la sala no es por piezas (o no se puede armar): entonces
   * `renderWorld` sigue por el camino de hoy. Mientras llegan el manifiesto o las imágenes devuelve true y repinta al llegar.
   */
  private renderSalaPorPiezas(mapW: number, mapH: number): boolean {
    const sala = this.world ? salaDelMundo(this.world.map as unknown as Record<string, unknown>, this.world.objects) : null;
    if (!sala || !this.world) return false;
    const manifiesto = this.cache.json.get('sala:manifiesto-de-piezas') as unknown;
    if (!esManifiestoDePiezas(manifiesto)) {
      if (this.manifiestoDePiezasPedido) return false;   // no cargó: la sala sigue por el camino de hoy
      this.manifiestoDePiezasPedido = true;
      this.load.json('sala:manifiesto-de-piezas', MANIFIESTO_DE_PIEZAS_URL);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => { if (this.ready) this.renderWorld(); });
      this.load.start();
      return true;
    }
    const plan = EscenaDeSala.planear(sala, manifiesto);
    if (!plan) return false;
    const muebles = this.mueblesDeLaSala(manifiesto);
    const estado = EscenaDeSala.estadoDeTexturas(plan, clave => this.textures.exists(clave), this.piezasFallidas);
    if (estado === 'fallo') {
      // Una pieza no cargó: la sala no se arma a medias ni se vuelve a pedir; sigue por el camino de imagen fija y se avisa.
      if (this.salaIncompletaAvisada !== this.world.map.key) {   // una vez por sala, no en cada repintado
        this.salaIncompletaAvisada = this.world.map.key;
        console.error('[sala por piezas] no cargaron:', [...this.piezasFallidas].join(', '));
        this.callbacks.onSalaIncompleta?.();
      }
      return false;
    }
    const faltanMuebles = EscenaDeSala.pedirMuebles(this, muebles, this.piezasFallidas);
    if (estado === 'pedir' || faltanMuebles) {
      const alFallar = (archivo: Phaser.Loader.File) => { this.piezasFallidas.add(archivo.key); };
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, alFallar);
      if (estado === 'pedir') EscenaDeSala.pedirTexturas(this, plan, this.piezasFallidas);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, alFallar);
        if (this.ready) this.renderWorld();
      });
      this.load.start();
      return true;
    }
    const apartada = this.salaApartada;
    this.salaApartada = null;
    if (apartada && apartada.firma !== this.firmaDeSala()) apartada.destruir();
    // Las puertas de pieza ya están en el muro: su marcador no lleva sprite, solo el rótulo y el área para cruzar.
    // Los muebles y objetos de la biblioteca de piezas los dibuja la escena (con su animación); su marcador, solo el rótulo.
    const dePieza = new Set([...(sala.puertas ?? []).map(p => p.id), ...muebles.map(m => m.id)]);
    this.renderableWorldObjects()
      .map(obj => (dePieza.has(obj.key) ? { ...obj, metadata: { ...(obj.metadata ?? {}), pintada: true, dePieza: true } } : obj))
      .forEach(obj => this.createMarker(obj));
    // Los muebles y objetos del caso con arte arrojan su silueta en la luz de la sala (las personas, la suya al caminar).
    if (apartada && apartada.firma === this.firmaDeSala()) {
      apartada.devolver();
      this.salaPorPiezas = apartada;
    } else {
      this.salaPorPiezas = new EscenaDeSala(this, sala, plan, manifiesto, {
        reducido: this.callbacks.reduceMotion, cuerpos: this.cuerposDeLaSala(), muebles,
      });
      this.salaPorPiezas.firma = this.firmaDeSala();
    }
    this.createPlayer(this.world.player.x, this.world.player.y);
    // Cámara (M1): la sala compuesta mide `plan.ancho × plan.alto` (528 de alto, contrato 2.2); el `height` del mapa del
    // servidor puede ser mayor y la cámara mostraba el vacío bajo la sala en el plano general.
    this.applyPixelCamera(plan.ancho || mapW, plan.alto || mapH);
    const camara = this.camaraApartada;
    this.camaraApartada = null;
    if (camara && this.salaPorPiezas === apartada) this.cameras.main.setScroll(camara.x, camara.y);   // la misma sala: sin salto
    this.refreshMarkerStates();
    this.updateNearestInteraction(true);
    this.applyCrisisVignette();
    this.playIntroFade();
    this.callbacks.onReady();
    // V6: la luz «en sombra» (la de las sombras de quien camina) es perezosa y la pagaba el primer cuadro de juego, unos
    // 390 ms con la CPU ×4 al pulsar «Continuar» en «Antes de comenzar». Se calcula ya, fuera de este cuadro y con la sala
    // lista: mientras la tarjeta está a la vista. Si la sala ya no es esta, no se hace nada.
    const recienArmada = this.salaPorPiezas;
    setTimeout(() => { if (this.salaPorPiezas === recienArmada) recienArmada?.calentarSombras(); }, 0);
    return true;
  }

  private renderWorld() {
    if (!this.world) return;
    // El arte de la biblioteca que aún no está cargado se pide primero; el mundo se pinta de nuevo al llegar.
    if (this.queueMissingArt()) return;

    // Multi-room mode: delegate to renderRoom() when a ScenarioConfig is loaded
    // (P2: salvo que el mundo sea una sala por piezas: ella manda, aunque haya llegado una configuración del legado).
    if (this.scenarioConfig && !this.esSalaPorPiezas()) {
      const room = this.roomForCurrentWorld()
        ?? this.scenarioConfig.rooms.find(r => r.key === this.scenarioConfig!.startRoomKey)
        ?? this.scenarioConfig.rooms[0];
      this.renderRoom(room, room.spawnX, room.spawnY);
      return;
    }

    this.cameras.main.stopFollow();   // clear stale follow target before destroying children
    // Los pulsos repeat:-1 sobreviven a removeAll y se acumulaban en cada re-render.
    this.endGestures();   // antes del killAll: Phaser descarta los tweens sin avisar y la promesa quedaría colgada
    // P2: si la sala por piezas que viene es la misma (misma estructura, puertas y objetos con arte), se aparta entera y
    // vuelve después del repintado: cada interacción trae el mundo completo y rearmarla congelaba el juego (V2).
    if (this.salaPorPiezas && this.salaPorPiezas.firma === this.firmaDeSala()) {
      this.salaApartada = this.salaPorPiezas;
      this.salaApartada.apartar();
      // Y la cámara queda donde estaba: rearmarla la centraría de golpe en quien juega (un salto de unos px al revisar).
      this.camaraApartada = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
    } else {
      this.salaPorPiezas?.destruir();   // sus texturas de lienzo no las borra removeAll
    }
    this.salaPorPiezas = null;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.markers.clear();
    this.markerData.clear();
    this.proximityAnimations.clear();
    this.markerLabels.clear();
    this.doorHints.clear();
    this.npcMarkers.clear();
    this.ambientMovers.clear();
    this.npcMovers.clear();
    this.resetPersonWalkers(this.world.map.key);
    this.tiledExits.clear();
    this.toneVignette = undefined;
    this.resetOrientationVisuals();
    this.wallsLayer = undefined;
    this.authoredRoomActive = false;
    this.currentRoomKey = '';

    const mapKey  = this.world.map.key;
    const { width: mapW, height: mapH } = this.world.map;
    this.cameras.main.setBackgroundColor('#0e141a');

    // P2: una sala con `structure` se arma por piezas; sin ella, todo sigue como hoy.
    if (this.renderSalaPorPiezas(mapW, mapH)) return;

    // ── Fase C: registry de renderers también en modo sala única ───────────
    // Si hay renderer para este mapa, él pinta todas las capas visuales y aquí
    // solo queda el gameplay (markers remapeados, jugador, cámara, guía).
    const sceneRenderer = resolveSceneRenderer(mapKey);
    if (sceneRenderer) {
      this.authoredRoomActive = true;
      const metadata = sceneRenderer.render(this, {
        width: mapW,
        height: mapH,
        reduceMotion: this.callbacks.reduceMotion,
        ambientTone: this.ambientTone(),
      });
      this.renderableWorldObjects()
        .map(obj => {
          const authored = authoredMarkerPositionForMap(mapKey, obj.key);
          return authored ? { ...obj, x: authored.x, y: authored.y } : obj;
        })
        .forEach(obj => this.createMarker(obj));
      // Posición persistida solo si sigue siendo jugable en la sala autoría.
      const persisted = { x: this.world.player.x, y: this.world.player.y };
      const spawn = this.wouldCollide(persisted.x, persisted.y) ? AUTHORED_PLAYER_SPAWN : persisted;
      this.createPlayer(spawn.x, spawn.y);
      this.applyPixelCamera(metadata.bounds.width, metadata.bounds.height);
      this.refreshMarkerStates();
      this.updateNearestInteraction(true);
      this.applyCrisisVignette();
      this.playIntroFade();
      this.callbacks.onReady();
      return;
    }

    // ── Layer 0-1: procedural dark floor + grid (always — permanent base) ──
    // Tiled floor tiles sit on top; GID 0 cells (empty) let this base show through.
    this.add.rectangle(mapW/2, mapH/2, mapW-40, mapH-42, 0x131c28, 1).setDepth(0);
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x1c2d3e, 0.65);
    for (let x = 56; x <= mapW-56; x += 32) g.lineBetween(x, 44, x, mapH-44);
    for (let y = 56; y <= mapH-56; y += 32) g.lineBetween(44, y, mapW-44, y);

    // ── Fase 4: authored per-room background image (over the procedural floor) ──
    this.applyAuthoredBackground(mapW, mapH);

    // ── Layer 2-3: Tiled tile layers (Floor + Walls) if map available ─────
    // Floor layer starts empty (all GID 0 = transparent).
    // Open any map in Tiled editor, paint tiles on the Floor layer, save → renders here.
    let tiledObjects: Phaser.Types.Tilemaps.TiledObject[] = [];
    let hasTiledMap = false;

    if (this.assetsLoaded) {
      try {
        const tilemap    = this.make.tilemap({ key: `map-${mapKey}` });
        // Register all 3 tilesets — only those present in the map JSON are used
        const ts1 = tilemap.addTilesetImage('tiny-dungeon', 'dungeon-img');
        const ts2 = tilemap.addTilesetImage('tiny-town',    'town-img');
        const ts3 = tilemap.addTilesetImage('rpg-urban',    'rpg-img');
        const tilesets = [ts1, ts2, ts3].filter((t): t is Phaser.Tilemaps.Tileset => t !== null);
        if (tilesets.length > 0) {
          this.buildTiledLayers(tilemap, tilesets);
        }
        tiledObjects = tilemap.getObjectLayer('Objects')?.objects ?? [];
        hasTiledMap  = true;
      } catch {
        hasTiledMap = false;
      }
    }

    // Collision-zone panels only when no Tiled layout is available
    if (!hasTiledMap) {
      this.world.collisions.forEach(zone => this.renderCollisionZone(zone));
    }
    // ─────────────────────────────────────────────────────────────────────

    // Room border (depth 5) + title (depth 6) — always above tile layers (depth 2-3)
    this.add.rectangle(mapW/2, mapH/2, mapW-36, mapH-38)
      .setStrokeStyle(3, 0x4f7cac, .3).setFillStyle(0x000000, 0).setDepth(5);
    this.add.text(16, 12, this.world.map.title, {
      fontFamily: WORLD_FONT_FAMILY, fontSize: '16px', color: '#9dc0e8', fontStyle: 'bold'
    }).setDepth(6).setScrollFactor(0);   // pin to screen — stays top-left as camera scrolls
    if (isComisariaMap(mapKey)) {
      this.add.text(56, 66, 'Comisaría — Restablecimiento de derechos', {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '11px', color: 'rgba(157,192,232,.72)',
      }).setDepth(6);
    }

    if (isComisariaMap(mapKey)) {
      this.renderComisariaEnvironment();
    }

    // Merge Tiled object positions with backend objects.
    // Tiled object "name" must match the backend MapObjectState "key".
    let mergedObjects = this.renderableWorldObjects().map(obj => {
      const t = tiledObjects.find(o => o.name === obj.key);
      return (t?.x != null && t?.y != null) ? { ...obj, x: t.x, y: t.y } : obj;
    });
    if (isComisariaMap(mapKey)) {
      mergedObjects = applySceneDisplayLabels(mergedObjects, mapKey);
    }

    mergedObjects.forEach(obj => this.createMarker(obj));
    this.spawnAmbientDust(mapW, mapH);
    this.createPlayer(this.world.player.x, this.world.player.y);

    // ── Cámara: zoom entero (spec §8.3); sigue a la jugadora dentro de la sala ──
    this.applyPixelCamera(mapW, mapH);

    this.refreshMarkerStates();
    this.updateNearestInteraction(true); // suppress blip on initial spawn
    this.applyLightingOverlay();
    this.applyCrisisVignette();
    this.playIntroFade();
    this.callbacks.onReady();
  }

  /**
   * Renders a single room from the ScenarioConfig.
   * Called by renderWorld() in multi-room mode and by transitionToRoom().
   */
  private renderRoom(roomConfig: RoomConfig, spawnX: number, spawnY: number) {
    // Si el mundo se refresca sin cambiar de sala (p. ej. al persistir la
    // posición del jugador), conserva la posición actual: el re-render no debe
    // teletransportar al jugador de vuelta al spawn.
    const keepPosition = this.currentRoomKey === roomConfig.key && this.player
      ? { x: this.player.x, y: this.player.y }
      : null;

    this.cameras.main.stopFollow();
    this.endGestures();   // antes del killAll: Phaser descarta los tweens sin avisar y la promesa quedaría colgada
    this.soltarSalaPorPiezas();   // P2: si la sala anterior era por piezas, sus texturas y su luz no quedan vivas
    this.tweens.killAll();
    this.children.removeAll(true);
    this.markers.clear();
    this.markerData.clear();
    this.proximityAnimations.clear();
    this.markerLabels.clear();
    this.doorHints.clear();
    this.npcMarkers.clear();
    this.ambientMovers.clear();
    this.npcMovers.clear();
    this.resetPersonWalkers(roomConfig.key);
    this.tiledExits.clear();
    this.toneVignette = undefined;
    this.resetOrientationVisuals();
    // Un refresco de la misma sala conserva la caminata; una sala nueva no la arrastra.
    if (!keepPosition) { this.walk = NO_WALK; this.walkGoal = null; }
    this.wallsLayer = undefined;
    this.interactionCooldown = 0;
    this.cameras.main.setBackgroundColor('#0e141a');
    this.currentRoomKey = roomConfig.key;

    let actualMapW = AUTHORED_ROOM_WIDTH, actualMapH = AUTHORED_ROOM_HEIGHT;
    let tiledObjects: Phaser.Types.Tilemaps.TiledObject[] = [];
    // Fase C: el registry decide qué renderer pinta la sala; sin renderer se
    // usa el flujo Tiled/procedural existente.
    const sceneRenderer = resolveSceneRenderer(roomConfig.tiledMapKey);
    const authoredClinicalRoom = sceneRenderer !== null;
    this.authoredRoomActive = authoredClinicalRoom;

    if (!authoredClinicalRoom) {
      // Title pinned to screen (la sala autoría no lleva título pegado al mapa;
      // la ubicación ya vive en la top bar del HUD)
      this.add.text(16, 12, roomConfig.displayName, {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '16px', color: '#9dc0e8', fontStyle: 'bold'
      }).setDepth(6).setScrollFactor(0);
    }

    if (this.assetsLoaded && !authoredClinicalRoom) {
      try {
        const tilemap = this.make.tilemap({ key: roomConfig.tiledMapKey });
        const ts1 = tilemap.addTilesetImage('tiny-dungeon', 'dungeon-img');
        const ts2 = tilemap.addTilesetImage('tiny-town',    'town-img');
        const ts3 = tilemap.addTilesetImage('rpg-urban',    'rpg-img');
        const tilesets = [ts1, ts2, ts3].filter((t): t is Phaser.Tilemaps.Tileset => t !== null);

        if (tilesets.length > 0) {
          this.buildTiledLayers(tilemap, tilesets);
        }

        actualMapW = tilemap.widthInPixels;
        actualMapH = tilemap.heightInPixels;

        // Register EXIT objects for transition detection
        tiledObjects = tilemap.getObjectLayer('Objects')?.objects ?? [];
        for (const exit of roomConfig.exits) {
          const obj = tiledObjects.find(o => o.name === exit.objectName);
          if (obj?.x != null && obj?.y != null) {
            this.tiledExits.set(exit.objectName, {
              x: obj.x, y: obj.y,
              w: obj.width ?? 32, h: obj.height ?? 48
            });
          }
        }
      } catch {
        // Map not found — render empty room with fallback dimensions
      }
    }


    let sceneMetadata: SceneRenderMetadata | null = null;
    if (sceneRenderer) {
      // Sala premium: el renderer pinta TODAS las capas visuales (background,
      // floor, props, lighting). Sin grilla genérica ni borde de editor.
      sceneMetadata = sceneRenderer.render(this, {
        width: actualMapW,
        height: actualMapH,
        reduceMotion: this.callbacks.reduceMotion,
        ambientTone: this.ambientTone(),
      });
    } else {
      // ── Dark procedural floor + subtle grid (mirrors renderWorld style) ─────
      // Floor tile layer uses GID 0 (transparent) everywhere, so this dark rect IS the floor.
      this.add.rectangle(actualMapW / 2, actualMapH / 2, actualMapW - 40, actualMapH - 42, 0x131c28, 1).setDepth(0);
      const gfx = this.add.graphics().setDepth(1);
      gfx.lineStyle(1, 0x1c2d3e, 0.55);
      for (let gx = 16; gx < actualMapW; gx += 32) gfx.lineBetween(gx, 0, gx, actualMapH);
      for (let gy = 16; gy < actualMapH; gy += 32) gfx.lineBetween(0, gy, actualMapW, gy);

      // Room border
      this.add.rectangle(actualMapW / 2, actualMapH / 2, actualMapW - 36, actualMapH - 38)
        .setStrokeStyle(3, 0x4f7cac, .3).setFillStyle(0x000000, 0).setDepth(5);
    }

    // Backend interactive objects (markers) — merge Tiled Objects-layer positions
    // (Tiled object "name" must match the backend MapObjectState "key").
    // En la sala autoría las posiciones del seed pertenecen al tilemap viejo,
    // así que se remapean a los puntos jugables de la sala.
    if (this.world) {
      const mergedObjects = this.renderableWorldObjects().map(obj => {
        if (authoredClinicalRoom) {
          const authored = authoredMarkerPositionForMap(roomConfig.tiledMapKey, obj.key);
          if (authored) return { ...obj, x: authored.x, y: authored.y };
        }
        const t = tiledObjects.find(o => o.name === obj.key);
        return (t?.x != null && t?.y != null) ? { ...obj, x: t.x, y: t.y } : obj;
      });
      mergedObjects.forEach(obj => this.createMarker(obj));
    }

    // Los JSON de escenario traen coords de la sala autoría; spawnNpcs tiene la
    // red de seguridad (freeTileNear) si alguna cayera en colisión.
    this.spawnNpcs(npcsDeLaSala(roomConfig.npcs, this.world?.map.ambient));
    // Fase 10: enter_room persiste entryX/entryY en world.player. Esa autoridad
    // debe ganar incluso si el ScenarioConfig asíncrono dejó un actor transitorio
    // en el centro; el actor vivo solo respalda datos backend no jugables.
    const persisted = this.world ? { x: this.world.player.x, y: this.world.player.y } : null;
    const spawn = authoredClinicalRoom
      ? resolveRoomPlayerPosition({
          authoritative: persisted,
          live: keepPosition,
          fallback: { x: AUTHORED_PLAYER_SPAWN.x, y: AUTHORED_PLAYER_SPAWN.y },
          collides: point => this.wouldCollide(point.x, point.y),
        })
      : keepPosition ?? { x: spawnX, y: spawnY };
    this.createPlayer(spawn.x, spawn.y);
    this.applyPixelCamera(actualMapW, actualMapH);
    this.refreshMarkerStates();
    this.updateNearestInteraction(true);
    // Evitar doble lighting: si el renderer ya pintó su capa de luz, la viñeta
    // genérica solo ensuciaría/oscurecería la escena premium.
    if (!sceneMetadata?.paintedLayers.includes('lighting')) this.applyLightingOverlay();
    this.applyCrisisVignette();
    this.playIntroFade();
    this.callbacks.onReady();
  }

  /** Fade-in breve al entrar a la simulación (solo la primera escena). */
  private playIntroFade(): void {
    if (this.firstSceneFadeDone) return;
    this.firstSceneFadeDone = true;
    if (!this.callbacks.reduceMotion) this.cameras.main.fadeIn(300, 7, 10, 20);
  }

  /**
   * Sala nueva o lienzo nuevo (bloque M1): la cámara la decide `camara/camara.ts` cada cuadro (zoom entero de spec §8.3
   * con un ancho de referencia de 960, zona muerta, límites de la sala). Aquí solo se pide un corte: ni seguimiento de
   * Phaser ni límites de cámara, que pelearían con el controlador.
   */
  private applyPixelCamera(roomWidth: number, roomHeight: number): void {
    this.roomSize = { width: roomWidth, height: roomHeight };
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.removeBounds();
    // Sala nueva (no un repintado ni un cambio de lienzo): plano general que después se cierra sobre el personaje,
    // sostenido más la primera vez que se ve la sala. Con movimiento reducido, sin plano general.
    const sala = this.world?.map?.key || this.currentRoomKey || '';
    if (sala !== this.camRoomId) {
      this.camRoomId = sala;
      const yaVisitada = this.camRoomsSeen.has(sala);
      this.camRoomsSeen.add(sala);
      // La espera empieza el primer cuadro en que el plano general se ve de verdad (ver `cameraMomentNow`).
      this.camEntrada = this.callbacks.reduceMotion ? null : { espera: esperaDelGeneral(yaVisitada), hasta: null, x: null, y: null };
      // Solo una sala nueva es un corte: repintar la misma sala (cada respuesta del servidor) no corta el viaje en curso.
      this.camCut = true;
      this.camTravel = null;
    }
    this.stepCamera(0);
  }

  /** El lienzo cambió de tamaño o de dpr: nuevo zoom entero y viñetas al nuevo rectángulo visible. */
  private refitCamera(): void {
    if (!this.ready || !this.player) return;
    // El lienzo cambió (el aviso sensible que se pliega, el panel, la ventana): sin corte; si el plano cambia de zoom,
    // la cámara viaja al nuevo. Un corte aquí se comía el cierre sobre el personaje tras el plano general.
    this.applyPixelCamera(this.roomSize.width, this.roomSize.height);
    if (this.toneVignette) {
      this.toneVignette.destroy();
      this.applyLightingOverlay();
    }
    this.crisisVignette?.destroy();
    this.applyCrisisVignette();
  }

  private checkExitTriggers() {
    if (!this.player || !this.scenarioConfig) return;
    const roomConfig = this.scenarioConfig.rooms.find(r => r.key === this.currentRoomKey);
    if (!roomConfig) return;
    const px = this.player.x, py = this.player.y;
    for (const exit of roomConfig.exits) {
      const zone = this.tiledExits.get(exit.objectName);
      if (!zone) continue;
      if (px >= zone.x && px <= zone.x + zone.w && py >= zone.y && py <= zone.y + zone.h) {
        this.tiledExits.delete(exit.objectName); // one-shot until room reloads
        this.callbacks.onRoomExit(exit.targetRoomKey, exit.entryX, exit.entryY);
        return;
      }
    }
  }

  /** Fase 5: DB-driven spatial doors — when the player reaches an EXIT object whose
   *  metadata carries a targetNodeKey, fire onEnterRoom once (re-armed when away). */
  private checkDbDoorTriggers() {
    if (!this.player || !this.world || this.scenarioConfig) return;
    const px = this.player.x, py = this.player.y;
    // Resolver la puerta MÁS CERCANA (no la primera del arreglo): si dos puertas
    // caen en rango, se cruza la que el jugador realmente tiene encima.
    let nearest: { target: string; entryX: number; entryY: number } | null = null;
    let nearestDist = Infinity;
    for (const obj of this.world.objects) {
      if ((obj.type || '').toUpperCase() !== 'EXIT') continue;
      if (puertaDelObjeto(obj)) continue;   // P2: una puerta de pieza se cruza con E, no al pisarla (diseño 4.4)
      const meta = obj.metadata as { targetNodeKey?: string; entryX?: number; entryY?: number } | undefined;
      const target = meta?.targetNodeKey;
      if (!target) continue;
      const d = Phaser.Math.Distance.Between(px, py, obj.x, obj.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = { target, entryX: Number(meta?.entryX ?? obj.x), entryY: Number(meta?.entryY ?? obj.y) };
      }
    }
    // Dispara solo si está armado y el jugador está sobre la puerta.
    if (nearest && this.dbDoorArmed && nearestDist <= this.doorTriggerDist) {
      this.dbDoorArmed = false;
      this.callbacks.onEnterRoom(nearest.target, nearest.entryX, nearest.entryY);
      return;
    }
    // Re-arma SOLO cuando se aleja claramente de toda puerta (histéresis): así, al
    // entrar a una sala junto a la puerta de regreso, no se dispara de inmediato.
    if (nearestDist >= this.doorRearmDist) this.dbDoorArmed = true;
  }

  private roomForCurrentWorld(): RoomConfig | null {
    if (!this.world || !this.scenarioConfig) return null;
    const mapKey = this.world.map.key;
    const baseKey = mapKey.replace(/-(accion|cierre|marco)$/i, '');
    const candidates = new Set([mapKey, `map-${mapKey}`, baseKey, `map-${baseKey}`]);
    const direct = this.scenarioConfig.rooms.find(room =>
      candidates.has(room.key) || candidates.has(room.tiledMapKey)
    );
    if (direct) return direct;
    return this.scenarioConfig.rooms.find(room => room.key === this.currentRoomKey) ?? null;
  }

  private renderableWorldObjects(): MapObjectState[] {
    const inventory = new Set(this.world?.inventory ?? []);
    return (this.world?.objects ?? []).filter(object =>
      !(object.type === 'TOOL' && object.toolCode && inventory.has(object.toolCode))
    );
  }

  /** Registra el mover del NPC (si trae motion) con su posición real de spawn. */
  private registerNpcMover(npc: NpcConfig, pos: { x: number; y: number }): void {
    if (!npc.motion) return;
    this.npcMovers.set(npc.key, {
      key: npc.key,
      cfg: npc.motion,
      zone: npcZone(npc.motion, pos),
      target: null,
      anchorIdx: 0,
      pauseUntil: this.time.now + (npc.motion.startDelayMs ?? 600),
      mirada: miradaInicial(orientacionDeDato(npc.facing)),
      lastPose: { direction: orientacionDeDato(npc.facing), walking: false },
    });
  }

  /** Pose del NPC (dirección + caminando) solo si cambió — como el jugador. */
  private applyNpcPose(mover: NpcMover, container: Phaser.GameObjects.Container, direction: ViewId, walking: boolean): void {
    if (mover.lastPose.direction === direction && mover.lastPose.walking === walking) return;
    mover.lastPose = { direction, walking };
    this.playNpc(container, direction, walking);
  }

  private updateNpcMovers(time: number, delta: number) {
    if (this.motionPaused || this.npcMovers.size === 0) return;
    for (const mover of this.npcMovers.values()) {
      const container = this.npcMarkers.get(mover.key);
      if (!container || this.gesturing.has(this.npcKeyOf(mover.key))) continue;   // mirando hacia algo o en pleno gesto
      const behavior = effectiveNpcBehavior(mover.cfg.behavior, this.callbacks.reduceMotion);
      const opts = { msPorPaso: MS_POR_PASO_DE_MIRADA, reducirMovimiento: this.callbacks.reduceMotion };
      mover.mirada ??= miradaInicial(mover.lastPose.direction ?? 'down');
      // Quieto o en pausa: un giro empezado termina (8 direcciones, `direccion-ocho.ts`).
      const mirarQuieto = (): void => {
        mover.mirada = actualizarMirada(mover.mirada, 0, 0, delta, opts);
        this.applyNpcPose(mover, container, mover.mirada.actual, false);
      };

      if (behavior === 'idle') { mirarQuieto(); continue; }

      if (behavior === 'attentive') {
        // Gira hacia el jugador cuando está cerca, sin parpadear entre vecinas; nunca se traslada.
        const cerca = !!this.player && Phaser.Math.Distance.Between(this.player.x, this.player.y, container.x, container.y) <= 110;
        const vx = cerca && this.player ? this.player.x - container.x : 0;
        const vy = cerca && this.player ? this.player.y - container.y : 0;
        mover.mirada = actualizarMirada(mover.mirada, vx, vy, delta, opts);
        this.applyNpcPose(mover, container, mover.mirada.actual, false);
        continue;
      }

      if (time < mover.pauseUntil) { mirarQuieto(); continue; }

      if (!mover.target) {
        mover.target = this.nextNpcTarget(mover, container);
        if (!mover.target) { mover.pauseUntil = time + 600; continue; }
      }

      const next = stepToward(container, mover.target, npcSpeed(mover.cfg) * (delta / 1000));
      const desde = { x: container.x, y: container.y };
      let avanza = true;
      if (!this.wouldCollide(next.x, next.y)) container.setPosition(next.x, next.y);
      else if (!this.wouldCollide(next.x, container.y)) container.setPosition(next.x, container.y);
      else if (!this.wouldCollide(container.x, next.y)) container.setPosition(container.x, next.y);
      else avanza = false;
      // Mira hacia donde avanzó de verdad (también deslizando por una pared).
      mover.mirada = actualizarMirada(mover.mirada, container.x - desde.x, container.y - desde.y, delta, opts);
      if (!avanza) {
        // Bloqueado del todo: nuevo objetivo después, nunca caminar en el sitio.
        mover.target = null;
        mover.pauseUntil = time + 900;
        this.applyNpcPose(mover, container, mover.mirada.actual, false);
        continue;
      }
      this.applyNpcPose(mover, container, mover.mirada.actual, true);

      if (reached(container, mover.target, 2)) {
        const anchors = mover.cfg.anchors ?? [];
        const anchor = anchors.length ? anchors[mover.anchorIdx] : null;
        if (anchor?.face) mover.mirada = mirarHacia(mover.mirada, orientacionDeDato(anchor.face), opts);
        this.applyNpcPose(mover, container, mover.mirada.actual, false);
        mover.pauseUntil = time + npcPause(mover.cfg, anchor);
        mover.anchorIdx = npcMotionStrategyFor(mover.cfg.behavior).anchorAfterArrival(mover.anchorIdx, anchors.length);
        mover.target = null;
      }
    }
  }

  private nextNpcTarget(mover: NpcMover, container: Phaser.GameObjects.Container): { x: number; y: number } | null {
    return npcMotionStrategyFor(mover.cfg.behavior).nextTarget({
      zone: mover.zone,
      anchors: mover.cfg.anchors,
      anchorIdx: mover.anchorIdx,
      from: container,
      player: this.player ?? null,
      rand: Math.random,
      isBlocked: (x, y) => this.wouldCollide(x, y),
    });
  }

  /** Reposo del NPC mirando a `direction` (las 4 filas del kit son reales). */
  private applyNpcFacing(container: Phaser.GameObjects.Container, direction: ViewId): void {
    this.playNpc(container, direction, false);
  }

  private playNpc(container: Phaser.GameObjects.Container, direction: ViewId, walking: boolean): void {
    const bag = container as unknown as Record<string, unknown>;
    const sprite = bag['__npcSprite'] as Phaser.GameObjects.Sprite | undefined;
    const visual = bag['__npcVisual'] as CharacterVisual | undefined;
    if (sprite && visual) playKitPose(sprite, visual, direction, walking, this.callbacks.reduceMotion);
  }

  private spawnNpcs(npcs: NpcConfig[]) {
    for (const npc of npcs) {
      // Red de seguridad: si la coord del JSON cae en colisión, buscar piso libre.
      const pos = this.wouldCollide(npc.x, npc.y)
        ? freeTileNear({ x: npc.x, y: npc.y }, (x, y) => this.wouldCollide(x, y), 18, 3)
        : { x: npc.x, y: npc.y };
      const visual = this.actorVisual(npcCharacterRef(npc));
      // Sombra de contacto en dos pasos: asienta al NPC en el piso.
      const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);
      const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);
      const figure: Phaser.GameObjects.GameObject = visual
        ? this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', npc.facing ?? 'down')).setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)
        : this.add.circle(0, -20, 10, 0x4fa3a5, 1);
      // Nombre y pista: objetos de la escena sobre los actores (no hijos del contenedor); nacen ocultos.
      const { label, hint } = this.createNpcLabels(npc, pos, KIT_LABEL_OFFSET_Y);
      const parts: Phaser.GameObjects.GameObject[] = [shadowSoft, shadow, figure];
      const icon = visual?.recipeId === PATIENT_RECIPE_ID ? this.patientIcon(0) : null;
      if (icon) parts.push(icon);
      const container = this.add.container(pos.x, pos.y, parts);
      this.setFeetOffset(container, 0);   // pies = origen del contenedor
      this.npcMarkers.set(npc.key, container);
      const bag = container as unknown as Record<string, unknown>;
      bag['__npcConfig'] = npc;
      bag['__hintSprite'] = hint;
      bag['__labelSprite'] = label;
      bag['__labelOffsetY'] = KIT_LABEL_OFFSET_Y;
      bag['__patientIcon'] = icon;
      if (visual && figure instanceof Phaser.GameObjects.Sprite) {
        bag['__npcSprite'] = figure;
        bag['__npcVisual'] = visual;
      }
      this.applyNpcFacing(container, orientacionDeDato(npc.facing));
      this.registerNpcMover(npc, pos);
    }
  }

  /** Clave de proximidad de una persona (`npc:{clave}`), creada una vez para no concatenar por cuadro. */
  private npcKeyOf(key: string): string {
    let candidateKey = this.npcKeys.get(key);
    if (candidateKey === undefined) {
      candidateKey = NPC_KEY_PREFIX + key;
      this.npcKeys.set(key, candidateKey);
    }
    return candidateKey;
  }

  private npcConfigFor(candidateKey: string): NpcConfig | null {
    const container = this.npcMarkers.get(candidateKey.slice(NPC_KEY_PREFIX.length));
    if (!container) return null;
    return ((container as unknown as Record<string, unknown>)['__npcConfig'] as NpcConfig | undefined) ?? null;
  }

  /** Pista sobre una persona a su alcance: sin la letra E donde no hay teclado ni con los atajos apagados. */
  private npcHintGlyph(): string {
    return this.touchPointer() || !this.shortcutsEnabled ? '▲' : '▲ E';
  }

  /** Puntero táctil (sin teclado): evita atajos de teclado en los textos del mundo. */
  private touchPointer(): boolean {
    try {
      return window.matchMedia?.('(pointer: coarse)').matches ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Nombre y pista de una persona: objetos de la escena y no hijos de su contenedor, para dibujarse sobre
   * todos los actores (el contenedor se ordena por su Y y un sprite de delante taparía el nombre). Nacen
   * ocultos: la escena no debe leerse como un diagrama etiquetado; `refreshMarkerStates` los muestra y
   * `placeLabel` los coloca cuando toca.
   */
  private createNpcLabels(
    npc: NpcConfig, pos: { x: number; y: number }, offsetY: number,
  ): { label: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text } {
    const label = this.add.text(pos.x, pos.y + offsetY, npc.displayName, {
      fontFamily: WORLD_LABEL_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: WORLD_LABEL_INK, fontStyle: 'bold',
      backgroundColor: WORLD_LABEL_PLATE, padding: { x: 4, y: 2 }, align: 'center',
    }).setOrigin(0.5, 1).setAlpha(0).setScale(this.labelScale).setDepth(LABEL_DEPTH);
    const hint = this.add.text(pos.x, pos.y + offsetY, this.npcHintGlyph(), {
      fontFamily: WORLD_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#4fa3a5',
      fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5, 1).setAlpha(0).setScale(this.labelScale).setDepth(LABEL_DEPTH);
    hint.setY(label.y - label.displayHeight - 2);
    return { label, hint };
  }

  /**
   * Coloca el rótulo (y la pista) de un candidato junto a su dueño: el de una persona encima de su cabeza
   * con la pista apilada sobre el nombre; el de un marcador debajo del icono. Un marcador que flota
   * suavemente usa su posición de reposo (el rótulo no tiembla); solo los que de verdad se desplazan
   * (deambulan) usan la posición viva.
   */
  private placeLabel(key: string): void {
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const container = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      if (!container) return;
      const bag = container as unknown as Record<string, unknown>;
      const label = bag['__labelSprite'] as Phaser.GameObjects.Text | undefined;
      const hint = bag['__hintSprite'] as Phaser.GameObjects.Text | undefined;
      const offsetY = (bag['__labelOffsetY'] as number | undefined) ?? 0;
      if (!label) return;
      if (label.x !== container.x || label.y !== container.y + offsetY) label.setPosition(container.x, container.y + offsetY);
      hint?.setPosition(container.x, label.y - label.displayHeight - 2);
      return;
    }
    const marker = this.markers.get(key);
    const label = this.markerLabels.get(key);
    const obj = this.markerData.get(key);
    if (!marker || !label || !obj) return;
    const moving = this.markerMoves(key);
    const x = moving ? marker.x : obj.x;
    // P2: bajo los pies como siempre; si ahí pisa a otra persona o un rótulo visible, sobre la cabeza (rotulo-sin-pisar).
    const pies = (moving ? marker.y : obj.y) + markerFeetOffsetY(obj);
    const y = yDelRotulo(x, pies, label.displayWidth, label.displayHeight,
      obj.type === 'PERSON' ? ALTO_DE_PERSONA_PX : 0, this.cajasOcupadas(key));
    if (label.x !== x || label.y !== y) label.setPosition(x, y);
  }

  /** P2: los cuerpos de las demás personas y los rótulos visibles de los demás, para que un rótulo no los pise. */
  private cajasOcupadas(propia: string): Caja[] {
    const cajas: Caja[] = [];
    this.markers.forEach((m, key) => {
      if (key === propia) return;
      const obj = this.markerData.get(key);
      if (!obj) return;
      const moving = this.markerMoves(key);
      if (obj.type === 'PERSON') cajas.push(cajaDelCuerpo(moving ? m.x : obj.x, (moving ? m.y : obj.y) + markerFeetOffsetY(obj)));
      const otro = this.markerLabels.get(key);
      if (otro && otro.alpha > 0) cajas.push(cajaDelRotulo(otro.x, otro.y, otro.displayWidth, otro.displayHeight));
    });
    return cajas;
  }

  /**
   * La persona consultante (decisión 13): un icono de pixel art sobre la cabeza de cada
   * actor dibujado con su receta; el sprite no se toca. La crisis, además, sacude 2 px.
   */
  updatePatientVisualState(persona: Persona) {
    this.persona = persona;
    const kind = personaIconKind(persona);
    for (const container of [...this.npcMarkers.values(), ...this.markers.values()]) {
      const icon = (container as unknown as Record<string, unknown>)['__patientIcon'] as Phaser.GameObjects.Image | null | undefined;
      if (!icon) continue;
      icon.setVisible(kind !== null);
      if (kind) icon.setTexture(personaIconKey(kind));
      if (kind === 'crisis' && !this.callbacks.reduceMotion) {
        this.tweens.add({ targets: container, x: container.x + 2, duration: 60, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      }
    }
  }

  private renderComisariaEnvironment() {
    const g = this.add.graphics().setDepth(3.5);

    COMISARIA_ZONES.forEach(zone => {
      const cx = zone.x + zone.width / 2;
      const cy = zone.y + zone.height / 2;
      this.add.rectangle(cx, cy, zone.width, zone.height, zone.tint, zone.alpha)
        .setStrokeStyle(1, 0x5b4f8f, 0.38)
        .setDepth(3.5);
      this.add.text(zone.x + 8, zone.y + 6, zone.label, {
        fontFamily: WORLD_FONT_FAMILY,
        fontSize: '9px',
        color: 'rgba(184,168,232,.75)',
        backgroundColor: 'rgba(8,12,18,.5)',
        padding: { x: 4, y: 2 },
      }).setDepth(4).setAlpha(0.85);
    });

    g.lineStyle(2, 0x5b4f8f, 0.45);
    g.lineBetween(364, 44, 364, 496);
    g.lineBetween(624, 44, 624, 496);
    g.lineBetween(640, 190, 910, 190);
    g.lineBetween(640, 330, 910, 330);
    g.lineStyle(2, 0xa85062, 0.55);
    g.strokeRect(640, 48, 270, 140);

    this.add.text(72, 392, 'COMISARÍA DE FAMILIA', {
      fontFamily: WORLD_FONT_FAMILY,
      fontSize: '12px',
      color: '#e8f0f4',
      fontStyle: 'bold',
      backgroundColor: 'rgba(91,79,143,.82)',
      padding: { x: 8, y: 4 },
    }).setDepth(6);

    // Figurantes (spec §7.2): la receta de figurantes, con los pies donde antes terminaba el sprite.
    this.addExtra(180, 236);
    this.add.text(180, 248, 'Sobreviviente', {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '9px', color: '#ffd4c0',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    this.addExtra(280, 215);
    this.add.text(280, 228, 'Psicóloga social', {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '9px', color: '#a8c8ff',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    this.addExtra(760, 106);
    this.add.text(760, 118, 'Funcionario de derechos', {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '9px', color: '#9dc0e8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    this.addExtra(760, 415);
    this.add.text(760, 428, 'Trabajadora social', {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '9px', color: '#b8e8c8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

    if (this.assetsLoaded && this.textures.exists('dungeon-tiles')) {
      [[120, 400], [160, 400]].forEach(([x, y]) => {
        this.add.image(x, y, 'dungeon-tiles', KenneyDungeonFrames.DESK).setScale(2).setDepth(7);
      });
      [[200, 320], [240, 320]].forEach(([x, y]) => {
        this.add.image(x, y, 'dungeon-tiles', KenneyDungeonFrames.CHAIR).setScale(2).setDepth(7);
      });
      this.add.image(500, 280, 'dungeon-tiles', KenneyDungeonFrames.CABINET).setScale(2).setDepth(7);
    }
  }

  /**
   * Viñeta de iluminación procedural (sin assets). Pineada a cámara, estática
   * (segura con prefers-reduced-motion). El tinte sigue `ambient.ambientTone`.
   */
  /** Tono ambiental autorado del mapa actual (calm | clinical | warm | tense). */
  private ambientTone(): string {
    return String(
      (this.world?.map.ambient as { ambientTone?: unknown })?.ambientTone ?? 'calm',
    ).toLowerCase();
  }

  private applyLightingOverlay(): void {
    const tone = this.ambientTone();
    const tint =
      tone === 'warm' ? 0x3a2a1a :
      tone === 'clinical' ? 0x1a2433 :
      tone === 'tense' ? 0x2a1420 :
      0x141a2e; // calm (default)
    // Borde oscuro suave en los 4 lados. Banda corta y alpha bajo: enmarca sin leerse como overlay técnico.
    this.toneVignette = this.addVignette('tone', tint, 0.12, 0.3, DEPTH.LIGHTING_FLOOR);
  }

  /**
   * Banda de viñeta en los cuatro bordes del rectángulo que la cámara muestra (F6-8): UNA textura de lienzo por
   * tamaño —reutilizada, y regenerada solo si cambia el tamaño— dibujada como imagen, en vez de decenas de
   * `strokeRect` por re-render. Opacidad `edgeAlpha` en el borde, que cae al cuadrado hacia dentro. scrollFactor 0 no
   * anula el zoom de la cámara; por eso se coloca sobre `vignetteFrame` y no sobre (0,0)-(ancho,alto).
   */
  private addVignette(
    role: 'tone' | 'crisis', tint: number, bandRatio: number, edgeAlpha: number, depth: number,
  ): Phaser.GameObjects.Image {
    const cam = this.cameras.main;
    const frame = vignetteFrame(cam.width, cam.height, cam.zoom);
    const spec = {
      width: Math.max(1, Math.round(frame.width)), height: Math.max(1, Math.round(frame.height)),
      tint, bandRatio, edgeAlpha,
    };
    const key = vignetteTextureKey(spec);
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, spec.width, spec.height);
      if (texture) {
        paintVignette(texture.getContext(), spec);
        texture.refresh();
      }
    }
    // La imagen anterior de este papel se va ANTES de retirar su textura: si seguía viva (dos llamadas seguidas, p. ej. el
    // zoom que se asienta mientras la sala se repinta), quedaba en la lista de dibujo con la textura destruida. La de crisis
    // tiene alfa 0 hasta la activación CRISIS, así que fallaba justo entonces (`TexturerImage.run`, «reading 'resolution'»
    // de null: el mundo se detenía tras una reacción «en-crisis», B en V4).
    this.vignetteImages.get(role)?.destroy();
    // La textura de otro tamaño de este mismo papel ya no hace falta.
    const previous = this.vignetteKeys.get(role);
    if (previous && previous !== key && this.textures.exists(previous)) this.textures.remove(previous);
    this.vignetteKeys.set(role, key);
    const image = this.add.image(frame.x, frame.y, key)
      .setOrigin(0, 0)
      .setDisplaySize(frame.width, frame.height)
      .setScrollFactor(0)
      .setDepth(depth);
    this.vignetteImages.set(role, image);
    return image;
  }

  /**
   * Viñeta de crisis: la misma banda que la de tono pero rojo-violeta, y con su
   * opacidad atada a la activación de la persona. Se pinta también en salas con luz
   * pintada, porque es estado del caso y no decoración.
   */
  private applyCrisisVignette(): void {
    // El killAll() del re-render ya detuvo el pulso; se para igual por si alguien llama sin él.
    this.crisisPulse?.stop();
    this.crisisPulse = undefined;
    this.crisisStateKey = '';
    this.crisisVignette = this.addVignette('crisis', CRISIS_VIGNETTE_TINT, 0.18, 1, DEPTH.LIGHTING + 1);
    this.applyCrisisState();
  }

  private applyCrisisState(): void {
    const g = this.crisisVignette;
    if (!g || !g.scene) return;
    // Con el mundo en pausa (diálogo, bitácora, cierre) la crisis se ve fija: nada late mientras se lee.
    const state = crisisVignetteState(this.activation, this.intensity, this.callbacks.reduceMotion || this.motionPaused);
    const key = JSON.stringify(state);
    // Mismo estado y el pulso sigue vivo: no se reinicia (pasar de 88 a 90 no debe dar un salto).
    if (key === this.crisisStateKey && (!state.pulse || this.crisisPulse?.isPlaying())) return;
    this.crisisStateKey = key;
    this.crisisPulse?.stop();
    this.crisisPulse = undefined;
    g.setAlpha(state.alpha);
    if (state.pulse) {
      this.crisisPulse = this.tweens.add({
        targets: g,
        alpha: { from: state.pulse.from, to: state.pulse.to },
        duration: state.pulse.durationMs,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /**
   * Dispara el destello decidido al cambiar de sala. Lo llama quien sabe que la sala ya se ve:
   * el fin del fundido de cámara (salida cliente) o Angular al retirar su fundido de escena.
   */
  playPendingRoomFlash(): void {
    const flash = this.pendingRoomFlash;
    this.pendingRoomFlash = null;
    // Se decidió antes de verse la sala: nada si entre tanto se activó el movimiento reducido
    // o la escena ya no existe (cambio de ruta con un temporizador pendiente).
    if (!flash || this.callbacks.reduceMotion || !this.ready || !this.cameras?.main) return;
    const cam = this.cameras.main;
    cam.flashEffect.alpha = flash.peakAlpha;
    cam.flash(flash.durationMs, ...flash.rgb);
  }

  private renderCollisionZone(zone: CollisionZoneState) {
    const cx = zone.x + zone.width/2;
    const cy = zone.y + zone.height/2;
    const isDoor = /puerta|door/i.test(zone.label ?? '');
    // Walls: solid dark panels; doors get a subtle teal accent
    const themeClr = this.borderFor(this.world!.map.theme);
    this.add.rectangle(cx, cy, zone.width, zone.height,
      isDoor ? 0x0c1926 : 0x090d14, isDoor ? .92 : 1)
      .setStrokeStyle(isDoor ? 2 : 1, isDoor ? themeClr : 0x18263a, isDoor ? .8 : .45)
      .setDepth(4);
    if (zone.label) {
      this.add.text(zone.x+5, zone.y+3, zone.label, {
        fontFamily: WORLD_FONT_FAMILY, fontSize: '11px', color: '#9dc0e8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x:4, y:2 }
      }).setDepth(5);
    }
  }

  private createPlayer(x: number, y: number) {
    this.lastPose = { direction: null, walking: false, reduce: this.callbacks.reduceMotion };
    const visual = this.playerVisual;
    if (visual && this.playerKitReady) {
      // Contrato de pies (player-motion.util): (x, y) del contenedor = pies; el cuadro del
      // kit trae los pies en (24, 68). Sombra en dos pasos bajo los pies, a escala 1.
      const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);
      const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);
      const sprite = this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down'))
        .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
      this.player = this.add.container(x, y, [shadowSoft, shadow, sprite]).setDepth(actorDepth(y));
      this.playerSprite = sprite;
      playKitPose(sprite, visual, 'down', false, this.callbacks.reduceMotion);
      return;
    }
    // Sin hoja del kit (no cargó): marcador geométrico con el mismo contrato de pies.
    const shadow = this.add.ellipse(0, 0, 16, 5, 0x000000, .22);
    const body = this.add.rectangle(0, -14, 24, 32, 0x4f7cac, 1).setStrokeStyle(2, 0xffffff, .9);
    const head = this.add.circle(0, -36, 12, 0xf4c6a8, 1).setStrokeStyle(2, 0xffffff, .85);
    const badge = this.add.rectangle(0, -10, 12, 7, 0xffffff, .9);
    this.player = this.add.container(x, y, [shadow, body, head, badge]).setDepth(actorDepth(y));
    this.playerSprite = undefined;
  }

  /**
   * Aplica la pose SOLO si cambió (dirección, caminar o movimiento reducido): la animación no
   * se reinicia en cada update y el reposo es inmediato al soltar teclas o chocar con una pared.
   */
  private applyPlayerPose(direction: ViewId, walking: boolean): void {
    const reduce = this.callbacks.reduceMotion;
    if (this.lastPose.direction === direction && this.lastPose.walking === walking && this.lastPose.reduce === reduce) return;
    this.lastPose = { direction, walking, reduce };
    if (this.playerSprite && this.playerVisual && this.playerKitReady) {
      playKitPose(this.playerSprite, this.playerVisual, direction, walking, this.callbacks.reduceMotion);
    }
  }

  /** Visual del kit con sus animaciones listas; si sus hojas no están, el figurante; si tampoco, null (→ marcador). */
  private actorVisual(ref: CharacterRef): CharacterVisual | null {
    const kit = this.callbacks.kit;
    if (!kit || !this.assetsLoaded) return null;
    for (const candidate of [ref, extrasCharacterRef(kit)]) {
      const visual = resolveCharacter(kit, candidate);
      addComposedSheets(this, visual); // un avatar autorado se compone aquí; las recetas vienen del preload
      if (ensureCharacterAnims(this, visual)) return visual;
    }
    return null;
  }

  /** Icono de la persona con los pies del actor en `feetY`; nace con el último estado conocido. */
  private patientIcon(feetY: number): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(personaIconKey('crisis'))) return null;
    const view = personaIconView(this.persona);
    return this.add.image(0, feetY + KIT_ICON_OFFSET_Y, view.key).setOrigin(0.5, 1).setVisible(view.visible);
  }

  /** Figurante de los mapas legados (spec §7.2): de frente, a escala 1, pies en `feetY`. */
  private addExtra(x: number, feetY: number): void {
    const kit = this.callbacks.kit;
    const visual = kit ? this.actorVisual(extrasCharacterRef(kit)) : null;
    if (!visual) return;
    const sprite = this.add.sprite(x, feetY, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down'))
      .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)
      .setDepth(actorDepth(feetY));
    playKitPose(sprite, visual, 'down', false, this.callbacks.reduceMotion);
  }

  /** Devuelve la clave si su textura ya cargó; si no, null (→ fallback del marcador). */
  private loadedTexture(key: string | null): string | null {
    return key && this.textures.exists(key) ? key : null;
  }

  /**
   * Sprite de un objeto con arte propio, o `null` (→ su marcador de siempre). Con hoja de cercanía cargada nace en
   * el cuadro 0 (el reposo: mismas medidas) y su animación queda lista; si la hoja falta del manifiesto o no cargó,
   * se dibuja el reposo y no hay animación.
   */
  private buildArtSprite(
    object: MapObjectState,
  ): { sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; animation: ProximityAnimation | null } | null {
    const art = spriteFor(object, this.callbacks.artManifest ?? null);
    if (!art) return null;
    // Con apoyo en los pies (lo que trae el editor) la base del arte está en (x, y); sin él, centrado y 6 px arriba.
    const onFeet = standsOnFeet(object);
    const artY = onFeet ? 0 : -6;
    const sheet = art.sheet;
    if (sheet && this.textures.exists(sheet.textureKey)) {
      const animationKey = proximityAnimationKey(sheet.textureKey, sheet.fps);
      if (this.ensureProximityAnimation(animationKey, sheet.textureKey, sheet.frames, sheet.fps)) {
        const sprite = this.add.sprite(0, artY, sheet.textureKey, 0);
        if (onFeet) sprite.setOrigin(0.5, 1);
        return { sprite, animation: { sprite, animationKey, playing: false } };
      }
    }
    if (!this.textures.exists(art.textureKey)) return null;
    const image = this.add.image(0, artY, art.textureKey);
    if (onFeet) image.setOrigin(0.5, 1);
    return { sprite: this.atWorldScale(image), animation: null };
  }

  /** Registra (una sola vez) la animación en bucle de una hoja; false si la hoja trae menos de dos cuadros. */
  private ensureProximityAnimation(animationKey: string, textureKey: string, frames: number, fps: number): boolean {
    if (this.anims.exists(animationKey)) return true;
    // `frameTotal` cuenta el cuadro base de Phaser además de los de la hoja.
    const available = Math.min(frames, this.textures.get(textureKey).frameTotal - 1);
    if (available < 2) return false;
    this.anims.create({
      key: animationKey,
      frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: available - 1 }),
      frameRate: fps,
      repeat: -1,
    });
    return true;
  }

  /** Avisa al host (solo cuando cambia) qué anima por cercanía y en qué cuadro va cada objeto con hoja. */
  private reportProximityAnimation(): void {
    const notify = this.callbacks.onProximityAnimation;
    if (!notify) return;
    // Sin hojas de cercanía (la mayoría de las salas) y con «nada anima» ya publicado, no hay informe que armar por cuadro.
    if (this.proximityAnimations.size === 0 && this.lastProximityReport === NO_PROXIMITY_REPORT) return;
    const report = proximityReport(this.proximityAnimations);
    const serialized = JSON.stringify(report);
    if (serialized === this.lastProximityReport) return;
    this.lastProximityReport = serialized;
    notify(report);
  }

  /** Reproduce o detiene la animación de cercanía de cada objeto que la tiene, según sea o no el principal. */
  private syncProximityAnimations(): void {
    this.proximityAnimations.forEach((animation, key) => {
      syncProximityAnimation(animation, key === this.nearestKey, this.callbacks.reduceMotion);
    });
  }

  /**
   * Sprite de una puerta, o `null` si no hay arte para ella (→ fallback del marcador).
   *
   * Contra un muro lateral se usa la variante en 3/4; el asset está dibujado
   * mirando a la derecha (muro izquierdo) y el muro derecho es su espejo, así que
   * ahí basta con `flipX`. Sin muro lateral (o sin asset lateral) cae a la frontal.
   */
  private buildDoorSprite(object: MapObjectState): Phaser.GameObjects.Image | null {
    const facing = doorFacing(object.x, this.world?.map.width ?? AUTHORED_ROOM_WIDTH);
    const sideKey = facing ? this.loadedTexture(resolveDoorSideTextureKey(object.key)) : null;
    const key = sideKey ?? this.loadedTexture(resolveDoorTextureKey(object.key));
    if (!key) return null;
    const image = this.add.image(0, DOOR_SPRITE_FEET_Y, key)
      .setOrigin(0.5, 1)
      .setFlipX(sideKey != null && facing === 'left');
    return this.atWorldScale(image);
  }

  /** A escala 1; un PNG viejo en la caché del navegador (otro tamaño que la tabla) se fuerza al de la tabla. */
  private atWorldScale<T extends Phaser.GameObjects.Image>(image: T): T {
    const spec = worldSpriteForTexture(image.texture.key);
    const stale = spec ? staleSpriteSize(spec, image.width, image.height) : null;
    if (stale) image.setDisplaySize(stale.width, stale.height);
    return image;
  }

  private createMarker(object: MapObjectState) {
    const isExit = object.type === 'EXIT';
    const color  = Number.parseInt(object.color.replace('#', ''), 16) || 0x4fa3a5;
    const displayLabel = getSceneDisplayLabel(object, this.world?.map.key);
    // El label nace oculto: la escena se lee por iconos/rings y el texto solo
    // aparece para la interacción cercana o seleccionada (refreshMarkerStates).
    // Los EXIT no llevan label propio — su door hint ya nombra el destino.
    // Fuera del contenedor del marcador y sobre los actores: un sprite que pase por delante no lo tapa.
    const label  = isExit ? null : this.add.text(object.x, object.y + markerLabelOffsetY(object), displayLabel, {
      fontFamily: WORLD_LABEL_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: WORLD_LABEL_INK,
      backgroundColor: WORLD_LABEL_PLATE, padding: { x:5, y:3 }, align: 'center', wordWrap: { width: this.labelWrap }
    }).setOrigin(.5, 0).setAlpha(0).setScale(this.labelScale).setDepth(LABEL_DEPTH);

    let main: Phaser.GameObjects.GameObject;
    // Dónde pisa el objeto dentro de su marcador: 0 si su posición es su punto de apoyo (`metadata.apoyo`), 16 como siempre si no.
    const feetY = markerFeetOffsetY(object);
    // Una puerta que ya está pintada en el fondo no lleva sprite encima: solo la pista y el área para cruzar.
    // Una puerta pintada en el fondo o una pieza que dibuja la sala por piezas (P2): sin sprite propio, solo rótulo y área.
    const painted = isPaintedDoor(object) || object.metadata?.['dePieza'] === true;
    let personVisual: CharacterVisual | null = null;
    let personSpriteForWalk: Phaser.GameObjects.Sprite | null = null;
    let doorSprite: Phaser.GameObjects.Image | null = null;

    // Un marcador con sprite de pixel art nunca se escala (markerEmphasis, focus): spec §1.1.2.
    let pixelSprite = false;
    const art = this.assetsLoaded && !isExit && !painted ? this.buildArtSprite(object) : null;
    if (painted) {
      main = this.add.container(0, 0);
    } else if (this.assetsLoaded) {
      doorSprite = isExit ? this.buildDoorSprite(object) : null;
      if (doorSprite) {
        // Puerta de arte propio: gana en ambos contextos (sala de autoría y salas
        // Kenney), unificando el lenguaje visual. Al no ser un tile de Kenney, no
        // rompe la regla de la sala premium. Si el asset falta, caen las ramas de abajo.
        main = doorSprite;
        pixelSprite = true;
      } else if (isExit && this.authoredRoomActive) {
        // Puerta dibujada (la sala premium no mezcla tiles Kenney): marco + hoja + pomo.
        const doorFrame = this.add.rectangle(0, -10, 34, 46, 0x1a1530, 0.92).setStrokeStyle(2, 0xb69cff, 0.8);
        const doorPanel = this.add.rectangle(0, -10, 24, 36, 0x2a2348, 1);
        const doorKnob = this.add.circle(7, -8, 2.5, 0xb69cff, 1);
        main = this.add.container(0, 0, [doorFrame, doorPanel, doorKnob]);
      } else if (isExit && this.textures.exists('dungeon-tiles')) {
        main = this.add.image(0, 0, 'dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(3);
        pixelSprite = true;
      } else if (art) {
        // Arte propio del objeto (biblioteca o sprites fijos): con hoja de cercanía si el manifiesto la respalda.
        main = art.sprite;
        pixelSprite = true;
      } else if (object.type === 'TOOL') {
        main = this.buildToolMarker(color, object.shortCode || object.toolCode || object.label);
      } else if (object.type === 'PERSON') {
        personVisual = this.callbacks.kit ? this.actorVisual(personCharacterRef(this.callbacks.kit, object)) : null;
        if (personVisual) {
          // Pies del arte sobre la sombra del marcador (y = 16), mirando hacia donde dice el editor (de frente si no dice) y respirando.
          const facing = personFacing(object.facing);
          const personSprite = this.add.sprite(0, feetY, kitSheetKey(personVisual, 'idle'), kitFrameIndex('idle', facing))
            .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
          playKitPose(personSprite, personVisual, facing, false, this.callbacks.reduceMotion);
          main = personSprite;
          personSpriteForWalk = personSprite;
        } else {
          main = this.buildGeomMarker(color);
        }
      } else if (this.textures.exists('dungeon-tiles')) {
        main = this.add.image(0, 0, 'dungeon-tiles', this.frameForType(object.type)).setScale(2);
        pixelSprite = true;
      } else {
        main = this.buildGeomMarker(color);
      }
    } else {
      main = this.buildGeomMarker(color);
    }

    // Un icono de respaldo (sin arte propio) va centrado: con el apoyo en los pies queda sobre la sombra, 16 px arriba.
    const centerY = feetY - LEGACY_FEET_OFFSET_Y;
    if (centerY !== 0 && !art && !doorSprite && !personVisual && !painted) (main as unknown as { y: number }).y = centerY;
    const pulse = this.add.circle(0, centerY, 22, color, .1);
    if (painted) pulse.setVisible(false);
    else if (!this.callbacks.reduceMotion) {
      this.tweens.add({ targets: pulse, scale: 1.3, alpha: .05, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // Sombra de contacto: el icono queda asentado en el piso, no flotando (una puerta pintada ya tiene la suya en el fondo).
    const markerShadow = this.add.ellipse(0, feetY, 26, 8, 0x000000, .2);
    if (painted) markerShadow.setVisible(false);
    const marker = this.add.container(object.x, object.y, [markerShadow, pulse, main]);
    this.setFeetOffset(marker, feetY);   // la sombra marca el contacto con el piso
    this.markers.set(object.key, marker);
    this.markerData.set(object.key, object);
    if (art?.animation) this.proximityAnimations.set(object.key, art.animation);
    const bag = marker as unknown as Record<string, unknown>;
    bag['__kitSprite'] = personVisual !== null;
    if (art && main === art.sprite) bag['__artSprite'] = art.sprite;   // P2: su silueta va a la luz de la sala por piezas
    bag['__pixelSprite'] = pixelSprite;
    bag['__pulse'] = pulse;
    if (personSpriteForWalk && personVisual) {
      bag['__personSprite'] = personSpriteForWalk;
      bag['__personVisual'] = personVisual;
    }
    if (personVisual?.recipeId === PATIENT_RECIPE_ID) {
      const icon = this.patientIcon(feetY);
      if (icon) {
        marker.add(icon);
        bag['__patientIcon'] = icon;
      }
    }
    if (label) this.markerLabels.set(object.key, label);
    this.registerPersonWalk(marker, object);
    this.applyAmbientLife(marker, object);
    this.buildKeyPersonIndicator(marker, object);

    // La puerta de pieza no lleva esta pista de Phaser: la avisa `app-aviso-de-puerta` sobre el lienzo (P2).
    if (isExit && object.metadata?.['dePieza'] !== true) {
      const hintTx = this.add.text(0, 0, this.doorHintText(object.label), {
        fontFamily: WORLD_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#4fa3a5', fontStyle: 'bold'
      }).setOrigin(.5);
      // Ancho a la medida del texto + relleno + hueco del candado (a la izquierda, solo si está bloqueada).
      const hintWidth = Math.ceil(hintTx.width) + 38;
      const hintBg = this.add.rectangle(0, 0, hintWidth, 22, 0x0e141a, .88).setStrokeStyle(1, 0x4fa3a5, .5);
      const lock = this.buildDoorLock(hintWidth, hintTx.width);
      // Sobre el borde alto de la puerta: su alto sale del arte, ya no hay una escala que adivinar.
      const hintY = doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT);
      const hint = this.add.container(object.x, hintY, [hintBg, lock, hintTx])
        .setDepth(DEPTH.UI).setVisible(false).setScale(this.labelScale);
      const bag = hint as unknown as Record<string, unknown>;
      bag['__doorBg'] = hintBg;
      bag['__doorLock'] = lock;
      bag['__doorX'] = object.x;
      bag['__doorHalfWidth'] = hintWidth / 2;
      this.placeDoorHint(hint);
      this.doorHints.set(object.key, hint);
    }
  }

  /** Centra el rótulo de una puerta sobre ella sin salirse del mapa (las puertas están en los bordes). */
  private placeDoorHint(hint: Phaser.GameObjects.Container): void {
    const bag = hint as unknown as Record<string, unknown>;
    const x = bag['__doorX'] as number | undefined;
    const half = bag['__doorHalfWidth'] as number | undefined;
    if (x === undefined || half === undefined) return;
    const reach = half * this.labelScale + 6;
    hint.x = Math.max(reach, Math.min(960 - reach, x));
  }

  /** Texto del rótulo de una puerta: sin la letra E donde no hay teclado ni con los atajos apagados. */
  private doorHintText(label: string): string {
    return this.touchPointer() || !this.shortcutsEnabled ? `${label} →` : `E  ${label} →`;
  }

  /**
   * Candado y borde discontinuo de una puerta bloqueada: la forma lo dice, no solo el color (WCAG 1.4.1).
   * Se dibuja una vez, oculto; `applyDoorStates` lo enciende cuando la puerta está bloqueada.
   */
  private buildDoorLock(width: number, textWidth: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setVisible(false);
    const left = -width / 2, right = width / 2, top = -11, bottom = 11;
    g.lineStyle(1, 0xe8f0f4, 0.9);
    const dashed = (x1: number, y1: number, x2: number, y2: number) => {
      const length = Math.hypot(x2 - x1, y2 - y1);
      const dx = (x2 - x1) / length, dy = (y2 - y1) / length;
      for (let at = 0; at < length; at += 7) {
        const end = Math.min(at + 4, length);
        g.lineBetween(x1 + dx * at, y1 + dy * at, x1 + dx * end, y1 + dy * end);
      }
    };
    dashed(left, top, right, top);
    dashed(left, bottom, right, bottom);
    dashed(left, top, left, bottom);
    dashed(right, top, right, bottom);
    // Candado: cuerpo y arco, a la izquierda del texto.
    const cx = -textWidth / 2 - 13;
    g.fillStyle(0xe8f0f4, 1).fillRect(cx - 4, -1, 8, 6);
    g.lineStyle(1.5, 0xe8f0f4, 1);
    g.beginPath();
    g.arc(cx, -1, 3, Math.PI, 0, false);
    g.strokePath();
    return g;
  }

  /** Muestra u oculta el candado y el borde discontinuo según `doorStates`. */
  private applyDoorStates(): void {
    this.doorHints.forEach((hint, key) => {
      const bag = hint as unknown as Record<string, unknown>;
      const locked = this.doorStates[key] === 'locked';
      (bag['__doorLock'] as Phaser.GameObjects.Graphics | undefined)?.setVisible(locked);
      (bag['__doorBg'] as Phaser.GameObjects.Rectangle | undefined)?.setStrokeStyle(1, 0x4fa3a5, locked ? 0 : 0.5);
    });
  }

  /** Dónde pisa un candidato (para el anillo): los pies de la persona o el contacto del marcador con el piso. */
  private feetOf(key: string): { x: number; y: number } | null {
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const npc = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      return npc ? { x: npc.x, y: npc.y } : null;
    }
    // Posición de reposo del marcador (la del dato, no la del icono que flota): el anillo es estático.
    const obj = this.markerData.get(key);
    return obj && this.markers.has(key) ? { x: obj.x, y: obj.y + markerFeetOffsetY(obj) } : null;
  }

  /**
   * Anillo estático bajo el siguiente destino: creado una vez por sala y reposicionado al cambiar la clave.
   * Sin animación (tampoco con movimiento normal): no hay tween ni trabajo por cuadro. Va bajo los
   * actores (profundidad de entorno), con halo oscuro para que se lea sobre cualquier piso.
   */
  private syncTargetRing(): void {
    const key = this.nextTargetKey;
    const feet = key !== null && !this.dimmedKeys.has(key) ? this.feetOf(key) : null;
    if (!feet) {
      this.targetRing?.halo.setVisible(false);
      this.targetRing?.ring.setVisible(false);
      return;
    }
    if (!this.targetRing || !this.targetRing.ring.scene) {
      const depth = DEPTH.ENVIRONMENT + 0.5;
      const halo = this.add.ellipse(0, 0, 70, 26).setStrokeStyle(4, RING_HALO_COLOR, 0.85).setDepth(depth);
      const ring = this.add.ellipse(0, 0, 68, 24).setStrokeStyle(2, RING_COLOR, 0.9).setDepth(depth + 0.01);
      this.targetRing = { halo, ring };
    }
    const { halo, ring } = this.targetRing;
    if (ring.x !== feet.x || ring.y !== feet.y) {
      halo.setPosition(feet.x, feet.y);
      ring.setPosition(feet.x, feet.y);
    }
    halo.setVisible(true);
    ring.setVisible(true);
  }

  /** Reinicia lo que `children.removeAll` destruye al reconstruir la sala. */
  private resetOrientationVisuals(): void {
    this.targetRing = undefined;
    this.revealed.length = 0;
    // El contorno y el verbo del puntero también los destruye `children.removeAll`: se vuelven a crear al usarlos.
    this.hoverOutline = undefined;
    this.hoverLabel = undefined;
    this.hoverKey = null;
    this.keyPersonIndicator = undefined;
    this.callbacks.onKeyPersonIndicator?.(null);
    this.reportKeyPersonPosition(null);
  }

  private isInteractive(o: MapObjectState): boolean {
    return o.type === 'EXIT' || o.type === 'TOOL' || o.type === 'ROUTE' || o.type === 'NOTE' || o.type === 'RESOURCE'
      || o.decisionOptionId != null
      || (o.toolCode != null && o.toolCode !== '')
      || o.dialogue != null;
  }

  /**
   * Per-object ambient behavior (B1). Interactive markers get a gentle float
   * (they must stay put for interaction); non-interactive actors wander/patrol
   * via the motion helpers, collision-aware. Static when reduced motion.
   */
  private applyAmbientLife(marker: Phaser.GameObjects.Container, object: MapObjectState) {
    if (this.callbacks.reduceMotion) return;
    // Las personas ya respiran con su hoja de reposo; el vaivén queda para herramientas y objetos.
    if (object.type === 'PERSON' && this.isInteractive(object)) return;
    // Una persona con `metadata.movimiento` se mueve con su propia conducta (P6), no con el vaivén heredado.
    if (object.type === 'PERSON' && object.metadata?.['movimiento'] !== undefined) return;
    // Un mueble (PROP) se queda quieto: no flota ni se mueve.
    if (object.type === 'PROP') return;

    if (this.isInteractive(object)) {
      // Interactable juice: subtle float on top of the existing glow pulse.
      this.tweens.add({
        targets: marker, y: object.y - 3, duration: 1400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return;
    }

    const pattern = resolvePattern(object);
    if (pattern.type === 'idle') {
      if (object.type !== 'PERSON') {
        this.tweens.add({
          targets: marker, y: object.y - 2, duration: 1700,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
      return;
    }
    this.ambientMovers.set(object.key, {
      key: object.key,
      origin: { x: object.x, y: object.y },
      pattern,
      target: null,
      retargetAt: 0,
      patrolIdx: 0,
    });
  }

  /** Un marcador que se mueve (vaivén ambiental o persona que camina): su posición viva es la del contenedor, no la del dato. */
  private markerMoves(key: string): boolean {
    return this.ambientMovers.has(key) || this.personWalkers.has(key);
  }

  /**
   * Registra a la persona que camina (P6): `metadata.movimiento` es «deambula» o `va-y-viene`. Lo quieto, ausente o mal
   * formado no se registra (queda como siempre). Empieza con una pausa de 1 a 3 s para que varias no echen a andar a la vez.
   */
  private registerPersonWalk(marker: Phaser.GameObjects.Container, object: MapObjectState): void {
    if (object.type !== 'PERSON') return;
    const movement = parsePersonMovement(object.metadata?.['movimiento']);
    if (movement.tipo === 'quieto') return;
    const direction = personFacing(object.facing);
    const origin = { x: marker.x, y: marker.y };
    // Reconstruir la sala (cada `world.set`) no la devuelve a su origen: si iba caminando en esta misma sala, retoma.
    const resumed = resumePersonWalk(this.savedPersonWalks?.get(object.key), movement, origin);
    const walker: PersonWalker = {
      key: object.key,
      state: resumed ?? startPersonWalk(movement, origin, direction, randomPersonPause(Math.random)),
      feetOffsetY: markerFeetOffsetY(object),
      lastPose: { direction, walking: false },
    };
    this.personWalkers.set(object.key, walker);
    if (resumed) {
      if (resumed.x !== marker.x || resumed.y !== marker.y) marker.setPosition(resumed.x, resumed.y);
      // El cuerpo nace de pie y de frente: se le da la pose que le toca.
      walker.lastPose = { direction: null, walking: false };
      this.applyPersonPose(walker, marker, resumed.direction, this.personShouldWalk(resumed));
    }
  }

  /** ¿Debe verse caminando? Solo si va andando y el mundo no está en pausa ni se pidió reducir el movimiento. */
  private personShouldWalk(state: PersonWalkState): boolean {
    return state.walking && !this.motionPaused && !this.callbacks.reduceMotion;
  }

  /**
   * La sala se reconstruye: guarda cómo iba cada persona que camina (si la sala es la misma, se retoma al registrarlas de
   * nuevo) y vacía el registro. Una sala distinta no arrastra a las de la anterior.
   */
  private resetPersonWalkers(room: string): void {
    const sameRoom = this.personWalkRoom === room;
    this.savedPersonWalks = sameRoom && this.personWalkers.size > 0
      ? new Map([...this.personWalkers].map(([key, walker]) => [key, walker.state]))
      : null;
    this.personWalkers.clear();
    this.personWalkRoom = room;
  }

  /** Pausar el mundo deja de pie a quien caminaba (no mueve las piernas en su sitio); reanudar le devuelve la pose que le toca. */
  private settlePersonWalkerPoses(): void {
    for (const walker of this.personWalkers.values()) {
      const marker = this.markers.get(walker.key);
      if (marker) this.applyPersonPose(walker, marker, walker.state.direction, this.personShouldWalk(walker.state));
    }
  }

  /**
   * Mueve a las personas que caminan. Se detiene con cualquier capa abierta (diálogo, lectura, bitácora…: `motionPaused`) y
   * con «Reducir movimiento» queda quieta en su sitio. Usa la colisión del jugador (`wouldCollide`, con los PIES de la
   * persona) y trata al jugador como un obstáculo móvil.
   */
  private updatePersonWalkers(delta: number): void {
    if (this.motionPaused || this.callbacks.reduceMotion || this.personWalkers.size === 0) return;
    // Por donde camina: la zona que el encuadre de la sala deja al suelo (el resto es pared pintada) o, sin encuadre, toda la sala.
    const zone = walkableZone(this.world?.map.ambient);
    for (const walker of this.personWalkers.values()) {
      const marker = this.markers.get(walker.key);
      if (!marker || this.gesturing.has(walker.key)) continue;
      const feet = walker.feetOffsetY;
      const bounds = personWalkBounds(
        this.world?.map.width || AUTHORED_ROOM_WIDTH, this.world?.map.height || AUTHORED_ROOM_HEIGHT, undefined, zone, feet,
      );
      const env: PersonWalkEnv = {
        bounds,
        rand: Math.random,
        blocked: (x, y, from) => this.wouldCollide(x, y + feet, walker.key)
          || bodyBlocks({ x, y: y + feet }, { x: from.x, y: from.y + feet }, this.player ? { x: this.player.x, y: this.player.y } : null),
      };
      const next = tickPersonWalk(walker.state, delta, env);
      walker.state = next;
      if (next.x !== marker.x || next.y !== marker.y) marker.setPosition(next.x, next.y);
      this.applyPersonPose(walker, marker, next.direction, next.walking);
    }
    this.syncKeyPersonIndicator();
  }

  /** Pose de la persona (dirección + caminando) solo si cambió, como el jugador y las personas del escenario. */
  private applyPersonPose(walker: PersonWalker, marker: Phaser.GameObjects.Container, direction: ViewId, walking: boolean): void {
    if (walker.lastPose.direction === direction && walker.lastPose.walking === walking) return;
    walker.lastPose = { direction, walking };
    const bag = marker as unknown as Record<string, unknown>;
    const sprite = bag['__personSprite'] as Phaser.GameObjects.Sprite | undefined;
    const visual = bag['__personVisual'] as CharacterVisual | undefined;
    if (sprite && visual) playKitPose(sprite, visual, direction, walking, this.callbacks.reduceMotion);
  }

  /** «Reducir movimiento» (también en caliente): cada persona vuelve a su sitio original, de pie, y queda quieta. */
  private restPersonWalkers(): void {
    for (const walker of this.personWalkers.values()) {
      const { origin, movement, direction } = walker.state;
      walker.state = startPersonWalk(movement, origin, direction, PERSON_PAUSE_MIN_MS);
      const marker = this.markers.get(walker.key);
      if (!marker) continue;
      marker.setPosition(origin.x, origin.y);
      this.applyPersonPose(walker, marker, direction, false);
    }
    this.syncKeyPersonIndicator();
  }

  /** Clave de la persona clave de la sala: la primera de la lista con `metadata.personaClave === true`. */
  private keyPersonKey(): string | null {
    return this.world ? resolveKeyPerson(this.world.objects)?.key ?? null : null;
  }

  /**
   * Chevrón + nombre sobre la cabeza de la persona clave (P6): siempre visible, no solo cuando es la más cercana. Color
   * #B69CFF con halo oscuro; la forma y el nombre dicen lo mismo que el color. Estático (no se anima).
   */
  private buildKeyPersonIndicator(marker: { x: number; y: number }, object: MapObjectState): void {
    if (!isKeyPerson(object) || object.key !== this.keyPersonKey()) return;
    const { halfWidth, height } = KEY_PERSON_CHEVRON;
    const chevron = this.add.graphics();
    chevron.fillStyle(KEY_PERSON_COLOR_HEX, 1);
    chevron.fillTriangle(-halfWidth, -height, halfWidth, -height, 0, 0);
    chevron.lineStyle(2, KEY_PERSON_HALO_HEX, 0.9);
    chevron.strokeTriangle(-halfWidth, -height, halfWidth, -height, 0, 0);
    const label = getSceneDisplayLabel(object, this.world?.map.key);
    const state = this.personaState;
    const stateHeight = state ? LABEL_BASE_FONT_PX + 8 : 0;
    const name = this.add.text(0, -(height + KEY_PERSON_NAME_GAP_PX + stateHeight), label, {
      fontFamily: WORLD_LABEL_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: KEY_PERSON_COLOR, fontStyle: 'bold',
      backgroundColor: WORLD_LABEL_PLATE, padding: { x: 5, y: 3 }, align: 'center',
    }).setOrigin(0.5, 1);
    const tipOffsetY = keyPersonTipOffsetY(markerFeetOffsetY(object));
    const children: Phaser.GameObjects.GameObject[] = [chevron, name];
    if (state) {
      children.push(this.add.text(0, -(height + KEY_PERSON_NAME_GAP_PX), state, {
        fontFamily: WORLD_LABEL_FONT_FAMILY, fontSize: `${LABEL_BASE_FONT_PX}px`, color: WORLD_LABEL_INK,
        backgroundColor: WORLD_LABEL_PLATE, padding: { x: 5, y: 3 }, align: 'center',
      }).setOrigin(0.5, 1));
    }
    const container = this.add.container(marker.x, marker.y + tipOffsetY, children)
      .setDepth(LABEL_DEPTH)
      .setScale(this.labelScale);
    this.keyPersonIndicator = { key: object.key, container, tipOffsetY };
    this.callbacks.onKeyPersonIndicator?.(label);
    this.reportKeyPersonPosition(marker);
  }

  /** Avisa dónde está la persona clave (al píxel) solo cuando cambia: un cuadro sin moverla no cuesta nada. `null`: la sala no la tiene. */
  private reportKeyPersonPosition(marker: { x: number; y: number } | null): void {
    const notify = this.callbacks.onKeyPersonPosition;
    if (!notify) return;
    const next = marker ? { x: Math.round(marker.x), y: Math.round(marker.y) } : null;
    const last = this.lastKeyPersonPosition;
    if (next === last || (next && last && next.x === last.x && next.y === last.y)) return;
    this.lastKeyPersonPosition = next;
    notify(next);
  }

  /** El indicador acompaña a la persona clave cuando camina. */
  private syncKeyPersonIndicator(): void {
    const indicator = this.keyPersonIndicator;
    const marker = indicator ? this.markers.get(indicator.key) : undefined;
    if (!indicator || !marker) return;
    this.reportKeyPersonPosition(marker);
    const y = marker.y + indicator.tipOffsetY;
    if (indicator.container.x !== marker.x || indicator.container.y !== y) indicator.container.setPosition(marker.x, y);
  }

  private updateAmbientMovers(time: number, delta: number) {
    if (this.motionPaused || this.callbacks.reduceMotion || this.ambientMovers.size === 0) return;
    const step = this.AMBIENT_SPEED * (delta / 1000);
    for (const mover of this.ambientMovers.values()) {
      const marker = this.markers.get(mover.key);
      if (!marker) continue;
      if (!mover.target || reached(marker, mover.target, 2) || time >= mover.retargetAt) {
        mover.target = this.nextAmbientTarget(mover);
        mover.retargetAt = time + this.AMBIENT_RETARGET_MS;
      }
      if (!mover.target) continue;
      const next = stepToward(marker, mover.target, step);
      if (!this.wouldCollide(next.x, next.y)) {
        marker.setPosition(next.x, next.y);
      } else {
        mover.target = null;   // blocked → re-pick next frame
      }
    }
  }

  private nextAmbientTarget(mover: AmbientMover): { x: number; y: number } | null {
    const step = nextAmbientStep(mover.pattern, mover, Math.random);
    mover.patrolIdx = step.patrolIdx;
    return step.target;
  }

  /** One tasteful scene-level effect: faint, slow-rising dust motes. */
  private spawnAmbientDust(w: number, h: number) {
    if (this.callbacks.reduceMotion) return;
    for (let i = 0; i < 5; i++) {
      const mote = this.add.circle(
        Phaser.Math.Between(60, w - 60), Phaser.Math.Between(80, h - 120),
        1.5, 0x9dc0e8, 0.18,
      ).setDepth(2.5);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(20, 48),
        x: mote.x + Phaser.Math.Between(-16, 16),
        alpha: 0,
        duration: Phaser.Math.Between(4200, 7200),
        delay: Phaser.Math.Between(0, 2600),
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private buildGeomMarker(color: number): Phaser.GameObjects.Container {
    const glow = this.add.circle(0, 0, 34, color, .16);
    const base = this.add.circle(0, 0, 24, color, .9).setStrokeStyle(3, 0xffffff, .95);
    if (!this.callbacks.reduceMotion) {
      this.tweens.add({ targets: glow, scale: 1.2, alpha: .08, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return this.add.container(0, 0, [glow, base]);
  }

  private buildToolMarker(color: number, label: string): Phaser.GameObjects.Container {
    const glow = this.add.circle(0, 0, 30, color, .14);
    const base = this.add.rectangle(0, 0, 42, 28, color, .9)
      .setStrokeStyle(3, 0xffffff, .92);
    const shine = this.add.rectangle(-7, -7, 22, 3, 0xffffff, .28);
    const text = this.add.text(0, 0, label.slice(0, 4).toUpperCase(), {
      fontFamily: WORLD_FONT_FAMILY,
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(.5);
    if (!this.callbacks.reduceMotion) {
      this.tweens.add({ targets: glow, scale: 1.15, alpha: .07, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return this.add.container(0, 0, [glow, base, shine, text]);
  }

  private frameForType(type: string): number {
    const map: Record<string, number> = {
      PERSON: KenneyDungeonFrames.DESK, OBJECT: KenneyDungeonFrames.CABINET,
      ROUTE: KenneyDungeonFrames.PLANT, TOOL: KenneyDungeonFrames.CABINET,
      WARNING: KenneyDungeonFrames.DESK
    };
    return map[type] ?? KenneyDungeonFrames.DESK;
  }

  /**
   * Ordena un actor por la Y de sus PIES (2.5D: más abajo = más al frente).
   * El jugador ya está anclado a pies (offset 0); NPCs/markers/guía guardan en
   * `__feetOffset` la distancia centro→pies para comparar al mismo nivel.
   */
  private ysort(obj: Phaser.GameObjects.Container): void {
    const feetOffset = Number((obj as unknown as Record<string, unknown>)['__feetOffset'] ?? 0);
    obj.setDepth(actorDepth(obj.y + feetOffset));
  }

  /** Registra la distancia centro→pies de un actor y lo ordena ya mismo. */
  private setFeetOffset(obj: Phaser.GameObjects.Container, offset: number): void {
    (obj as unknown as Record<string, unknown>)['__feetOffset'] = offset;
    this.ysort(obj);
  }

  /** Mueve con sliding contra paredes. Devuelve true si hubo avance real. */
  private movePlayer(dx: number, dy: number): boolean {
    if (!this.player) return false;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    // Try full movement
    if (!this.wouldCollide(nx, ny)) { this.player.setPosition(nx, ny); return true; }
    // Slide along walls: try horizontal-only
    if (dx !== 0 && !this.wouldCollide(nx, this.player.y)) { this.player.setPosition(nx, this.player.y); return true; }
    // Slide along walls: try vertical-only
    if (dy !== 0 && !this.wouldCollide(this.player.x, ny)) { this.player.setPosition(this.player.x, ny); return true; }
    // Fully blocked
    return false;
  }

  /**
   * true si poner los PIES del jugador en (x, y) chocaría. Usa el hitbox de
   * pies (player-motion.util): muebles y paredes bloquean pies; la cabeza y el
   * pelo pueden solapar visualmente sin chocar. Con wallsLayer (Tiled) prueba
   * las 4 esquinas del hitbox; si no, las zonas AABB de la sala/backend.
   *
   * Siempre se suma la regla autoritativa del servidor (GAME-01): una posición
   * que el backend rechazaría tampoco es caminable aquí, así la posición
   * persistida nunca se queda atrás en silencio y las acciones validadas por
   * proximidad no fallan con "demasiado lejos".
   */
  private wouldCollide(x: number, y: number, ignoreObjectKey?: string): boolean {
    if (this.world && serverRejectsPlayerAt(this.world, x, y, ignoreObjectKey)) return true;
    const hb = playerHitbox(x, y);
    if (this.wallsLayer) {
      const corners = [
        { x: hb.x, y: hb.y }, { x: hb.x + hb.width, y: hb.y },
        { x: hb.x, y: hb.y + hb.height }, { x: hb.x + hb.width, y: hb.y + hb.height },
      ];
      return corners.some(pt => {
        const tile = this.wallsLayer!.getTileAtWorldXY(pt.x, pt.y);
        return tile !== null && tile.index > 0;
      });
    }
    // Legacy fallback: backend AABB zones
    if (!this.world) return false;
    const mapKey = this.world.map.key;
    // Salas del caso PDF: geometría propia por sala (espejo del seed backend).
    const caseZones = caseRoomCollisions(mapKey);
    const zones = caseZones
      ? caseZones
      : this.authoredRoomActive
        ? AUTHORED_CLINICAL_COLLISIONS
        : isHospitalMap(mapKey)
          ? HOSPITAL_COLLISIONS
          : isComisariaMap(mapKey)
            ? COMISARIA_COLLISIONS
            : this.world.collisions.map(z => ({ x: z.x, y: z.y, width: z.width, height: z.height }));
    return zones.some(z => rectsIntersect(hb, z));
  }

  /** Pieza de la lista de trabajo de candidatos (se crea una sola vez y se reutiliza). */
  private candidateAt(index: number): NearbyCandidate {
    return this.candidatePool[index] ??= { key: '', kind: 'marker', exit: false, distance: 0, radius: 0 };
  }

  /**
   * Proximidad por cuadro: marcadores y personas en UNA lista (radios 74 y 72), `pickNearby` elige el
   * principal y el secundario, y `selectRevealed` los rótulos. Reutiliza listas y piezas: no asigna
   * nada. Solo cuando cambia el principal, el secundario o el conjunto de rótulos avisa a Angular y
   * repinta (`refreshMarkerStates`); el anillo y los atenuados no cuestan nada por cuadro.
   */
  private updateNearestInteraction(suppressSound = false) {
    const player = this.player;
    if (!player || !this.world) return;
    const px = player.x, py = player.y;
    const mapKey = this.world.map.key;
    const list = this.candidates;
    list.length = 0;
    let anyInRange = false;
    let targetX = 0, targetY = 0, targetSeen = false;
    // Un objeto atenuado nunca es el destino: ni anillo ni rótulo fijo (lo atenuado no llama la atención).
    const target = this.nextTargetKey !== null && !this.dimmedKeys.has(this.nextTargetKey) ? this.nextTargetKey : null;

    for (const [key, marker] of this.markers) {
      const obj = this.markerData.get(key);
      if (!obj) continue;
      // Un mueble (PROP) y lo que no tiene comportamiento se dibujan, pero no entran en la prioridad de interacción.
      if (!participatesInInteraction(obj)) continue;
      const c = this.candidateAt(list.length);
      c.key = key; c.kind = 'marker'; c.exit = obj.type === 'EXIT';
      c.distance = Math.hypot(px - marker.x, py - marker.y); c.radius = MARKER_INTERACT_RADIUS;
      if (c.distance <= c.radius) anyInRange = true;
      list.push(c);
    }
    for (const [key, container] of this.npcMarkers) {
      const c = this.candidateAt(list.length);
      c.key = this.npcKeyOf(key); c.kind = 'npc'; c.exit = false;
      c.distance = Math.hypot(px - container.x, py - container.y); c.radius = NPC_INTERACT_RADIUS;
      if (c.distance <= c.radius) anyInRange = true;
      if (c.key === target) { targetSeen = true; targetX = container.x; targetY = container.y; }
      list.push(c);
    }
    // Las zonas ambientales son sabor de último recurso: solo cuentan si nada más está a su alcance.
    if (!anyInRange) {
      for (const zone of getSceneAmbientZones(mapKey)) {
        const c = this.candidateAt(list.length);
        c.key = zone.key; c.kind = 'marker'; c.exit = false;
        c.distance = Math.hypot(px - zone.x, py - zone.y); c.radius = zone.radius;
        list.push(c);
      }
    }

    const picked = pickNearby(list, this.nearestKey, this.pick);
    const primaryKey = picked.primary?.key ?? null;
    const alsoKey = picked.secondary?.key ?? null;
    selectRevealed(list, target, primaryKey, this.dimmedKeys, this.compactLabels ? 1 : 2, this.revealScratch);
    const revealChanged = !sameKeys(this.revealScratch, this.revealed);
    if (revealChanged) {
      const swap = this.revealed;
      this.revealed = this.revealScratch;
      this.revealScratch = swap;
    }
    // Un destino que se mueve (una persona que deambula) arrastra su anillo; el de un marcador queda
    // quieto en su sitio (la flotación suave del icono no lo mueve).
    const ring = this.targetRing?.ring;
    if (targetSeen && ring && (ring.x !== targetX || ring.y !== targetY)) {
      this.targetRing!.halo.setPosition(targetX, targetY);
      ring.setPosition(targetX, targetY);
    }

    const primaryChanged = primaryKey !== this.nearestKey;
    if (primaryChanged) {
      this.nearestKey = primaryKey;
      this.callbacks.onProximity(primaryKey ? this.proximityObjectFor(primaryKey) : null);
    }
    const alsoChanged = alsoKey !== this.alsoKey;
    if (alsoChanged) {
      this.alsoKey = alsoKey;
      this.callbacks.onProximityAlso(alsoKey ? this.proximityObjectFor(alsoKey) : null);
    }
    if (primaryChanged || alsoChanged || revealChanged) this.refreshMarkerStates();
    // Casi siempre vacío: solo los rótulos visibles de quien camina o deambula siguen a su dueño.
    for (let i = 0; i < this.followLabels.length; i++) this.placeLabel(this.followLabels[i]);
    // Play blip only when *entering* range (the primary changes to a key), not on every frame.
    // suppressSound=true on spawn/world-switch to avoid a false-positive blip on load.
    if (primaryChanged && primaryKey && !this.callbacks.reduceMotion && !this.callbacks.sfxMuted && !suppressSound) {
      this.sound.play('proximity-blip', { volume: 0.45 });
    }
  }

  /**
   * Lo que se le entrega a Angular de un candidato: el marcador con su nombre de pantalla y su posición
   * viva, la zona ambiental, o una persona como `MapObjectState` sintético (`npc:{clave}`, tipo PERSON,
   * sin texto sembrado: el texto del botón lo pone quien lo muestra).
   */
  private proximityObjectFor(key: string): MapObjectState | null {
    const mapKey = this.world?.map.key ?? '';
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const container = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      const npc = this.npcConfigFor(key);
      if (!container || !npc) return null;
      return {
        key, label: npc.displayName, type: 'PERSON', x: container.x, y: container.y,
        width: 0, height: 0, color: '#4fa3a5', icon: 'person', shortCode: '', collision: false,
        interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
      };
    }
    const obj = this.markerData.get(key);
    const marker = this.markers.get(key);
    if (obj && marker) {
      return { ...obj, label: getSceneDisplayLabel(obj, mapKey), x: marker.x, y: marker.y };
    }
    const zone = getSceneAmbientZones(mapKey).find(z => z.key === key);
    return zone ? buildSceneAmbientObject(zone, mapKey) : null;
  }

  /**
   * Pinta el estado de los marcadores y personas. Solo se llama cuando algo cambió (principal,
   * secundario, conjunto de rótulos, selección, atenuados, destino), nunca por cuadro.
   */
  private refreshMarkerStates() {
    this.syncLabelScale();
    this.syncProximityAnimations();
    const revealed = this.revealed;
    this.syncTargetRing();
    this.applyDoorStates();
    this.followLabels.length = 0;
    this.markers.forEach((m, key) => {
      const sel = key === this.selectedKey, near = key === this.nearestKey;
      const bag = m as unknown as Record<string, unknown>;
      const emphasis = markerEmphasis({
        selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true,
        dimmed: this.dimmedKeys.has(key),
      });
      m.setScale(emphasis.scale);
      m.setAlpha(emphasis.alpha);
      const label = this.markerLabels.get(key);
      if (!label) return;
      const shown = sel || near || revealed.includes(key);
      label.setAlpha(shown ? 1 : 0);
      if (shown) {
        this.placeLabel(key);
        if (this.markerMoves(key)) this.followLabels.push(key);
      }
    });
    this.doorHints.forEach((h, key) => h.setVisible(key === this.nearestKey || revealed.includes(key)));
    this.npcMarkers.forEach((container, key) => {
      const candidateKey = this.npcKeyOf(key);
      const bag = container as unknown as Record<string, unknown>;
      const shown = revealed.includes(candidateKey);
      (bag['__labelSprite'] as Phaser.GameObjects.Text | undefined)?.setAlpha(shown ? 1 : 0);
      const inRange = candidateKey === this.nearestKey || candidateKey === this.alsoKey;
      (bag['__hintSprite'] as Phaser.GameObjects.Text | undefined)?.setAlpha(inRange ? 1 : 0);
      if (shown || inRange) {
        this.placeLabel(candidateKey);
        if (this.npcMovers.has(key)) this.followLabels.push(candidateKey);
      }
    });
  }

  /**
   * Reescala los rótulos para que midan ≥ 12 px de pantalla con el tamaño del canvas y el zoom de cámara
   * de ahora. Devuelve true si cambió algo. Se llama al cambiar el tamaño del canvas y al repintar
   * (el zoom lo fija cada render de sala), nunca por cuadro.
   */
  private syncLabelScale(): boolean {
    // `scale` y `cameras` no existen antes de `create()` ni tras destruir la escena (cambio de ruta).
    const displayScale = this.scale?.displayScale?.x;
    if (!displayScale) return false;
    const zoom = this.cameras?.main?.zoom ?? 1;
    // Mismo tamaño en pantalla con cualquier zoom (regla 7): la escala de ×1 entre el zoom.
    const next = labelScaleFor(displayScale, 1) / zoom;
    if (Math.abs(next - this.labelScale) < 0.01) {
      // La escala no cambió, pero el zoom de la sala sí pudo: la resolución de los textos lo sigue (PHA-2).
      this.pixelRender?.refreshTexts(zoom);
      return false;
    }
    this.labelScale = next;
    // Ancho máximo del rótulo: 168 px de pantalla (en coordenadas locales del texto).
    this.labelWrap = Math.min(140, (LABEL_MAX_SCREEN_WIDTH_PX * displayScale) / (zoom * next));
    this.markerLabels.forEach(label => label.setScale(next).setWordWrapWidth(this.labelWrap));
    this.hoverLabel?.setScale(next);
    this.keyPersonIndicator?.container.setScale(next);
    this.doorHints.forEach(hint => { hint.setScale(next); this.placeDoorHint(hint); });
    this.npcMarkers.forEach(container => {
      const bag = container as unknown as Record<string, unknown>;
      (bag['__labelSprite'] as Phaser.GameObjects.Text | undefined)?.setScale(next);
      (bag['__hintSprite'] as Phaser.GameObjects.Text | undefined)?.setScale(next);
    });
    this.pixelRender?.refreshTexts(zoom);
    return true;
  }

  /** El canvas cambió de tamaño: los rótulos se reescalan y se vuelven a colocar (la pista se apila según el alto del nombre). */
  private onScaleResize(): void {
    if (this.syncLabelScale() && this.world) this.refreshMarkerStates();
  }

  private borderFor(theme: string): number {
    const m: Record<string, number> = {
      'protection-route':0x2f7476,'technical-record':0x2f5f8f,
      'risk-assessment':0x5b4f8f,'child-protection':0x5d9278,'follow-up':0x2f5f8f
    };
    return m[theme] ?? 0x4f7cac;
  }
}

@Component({
  selector: 'app-game-world',
  standalone: true,
  imports: [CommonModule, MatIconModule, AvisoDePuertaComponent],
  host: { '[class.touch-input]': 'touchInput()' },
  template: `
    <div #gameHost class="phaser-host" role="application"
      [attr.data-world-ready]="renderReady()"
      [attr.data-rendered-map-key]="renderedMapKey()"
      [attr.data-rendered-scenario-key]="renderedScenarioKey()"
      [attr.aria-label]="worldLabel()">
    </div>
    @if (avisoDePuerta(); as aviso) {
      <app-aviso-de-puerta [texto]="aviso.texto" [bloqueada]="aviso.bloqueada" [falta]="doorMessages()[aviso.id] ?? null" [conTecla]="!touchInput()"
        [x]="aviso.x" [y]="aviso.y" (cruzar)="cruzarPorAviso(aviso.id)" />
    }
    @if (!assetsReady() && showLoader()) {
      <div class="world-loading">
        <p class="world-loading__label" role="status">Preparando la escena…</p>
        <div class="world-loading__track" role="progressbar" aria-label="Carga de la escena"
          aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="loadPercent()">
          <span class="world-loading__fill" [style.transform]="'scaleX(' + loadPercent() / 100 + ')'"></span>
        </div>
        <p class="world-loading__percent" aria-hidden="true">{{ loadPercent() }}&nbsp;%</p>
      </div>
    }
    @if (criticalLoadFailed()) {
      <div class="world-load-warning" role="alert">
        <p>Parte del mapa no cargó y la sala se ve simplificada.</p>
        <div class="world-load-warning__actions">
          <button type="button" class="psy-button" (click)="retryLoad()">Reintentar</button>
          <button type="button" class="psy-button psy-button--ghost" (click)="dismissLoadWarning()">Seguir así</button>
        </div>
      </div>
    }
    <div class="touch-controls" role="group" aria-label="Controles táctiles">
      <div class="touch-dpad">
        <button type="button" class="psy-icon-button touch-btn touch-btn--up" aria-label="Mover arriba"
          (pointerdown)="holdDirection($event, 'up')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'up')"><mat-icon>keyboard_arrow_up</mat-icon></button>
        <button type="button" class="psy-icon-button touch-btn touch-btn--left" aria-label="Mover izquierda"
          (pointerdown)="holdDirection($event, 'left')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'left')"><mat-icon>keyboard_arrow_left</mat-icon></button>
        <button type="button" class="psy-icon-button touch-btn touch-btn--right" aria-label="Mover derecha"
          (pointerdown)="holdDirection($event, 'right')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'right')"><mat-icon>keyboard_arrow_right</mat-icon></button>
        <button type="button" class="psy-icon-button touch-btn touch-btn--down" aria-label="Mover abajo"
          (pointerdown)="holdDirection($event, 'down')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'down')"><mat-icon>keyboard_arrow_down</mat-icon></button>
      </div>
      <!-- Sin [disabled] ni aria-disabled (Playwright los toma por «no habilitado» y el e2e táctil no podría
           tocar): sin nada cerca el toque se acepta y la escena avisa (nothingNearby). -->
      <button type="button" class="psy-button psy-button--glass touch-interact"
        [class.touch-interact--idle]="!interactLabel()"
        [attr.aria-label]="'Interactuar: ' + (interactLabel() ?? 'Acércate a algo')"
        (click)="interactNearest()"><mat-icon aria-hidden="true">touch_app</mat-icon><span class="touch-interact__label">{{ interactLabel() ?? 'Acércate a algo' }}</span></button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: block; position: relative; width: 100%; height: 100%; }
    .phaser-host { width: 100%; height: 100%; }
    /* El lienzo mide el contenedor × devicePixelRatio y Phaser lo devuelve al tamaño
       CSS del contenedor (scale.zoom = 1/dpr): nada lo estira a escalas fraccionarias. */
    :host ::ng-deep .phaser-host canvas { display: block; }
    /* Cruceta abajo a la izquierda y «Interactuar» abajo a la derecha. El lienzo ocupa todo el contenedor
       (ya no hay bandas negras de encaje 16:9): la sala centrada deja márgenes a los lados. El
       contenedor no recibe toques; solo los controles. */
    .touch-controls {
      display: none;
      position: absolute;
      left: 8px;
      right: 8px;
      /* Encima del pie de la pantalla del juego (--alto-pie lo publica simulation-play; fuera de ella, 0): con el mundo a
         sangre, la ficha táctil «Hablar con…» tapaba en el teléfono la puerta de la barra de acción (V4). */
      bottom: calc(8px + var(--alto-pie, 0px));
      grid-template-columns: auto auto;
      justify-content: space-between;
      align-items: end;
      gap: 8px;
      pointer-events: none;
      z-index: 48;
    }
    .touch-dpad, .touch-interact { pointer-events: auto; }
    /* Cruz de 3x3 de 48 px: 3 x 48 + 2 x 4 = 152 px, menos que la banda negra de 844x390 (169 px). */
    .touch-dpad {
      display: grid;
      grid-template-columns: repeat(3, 48px);
      grid-template-rows: repeat(3, 48px);
      gap: 4px;
    }
    .touch-btn { width: 48px; height: 48px; }
    .touch-btn--up { grid-area: 1 / 2; }
    .touch-btn--left { grid-area: 2 / 1; }
    .touch-btn--right { grid-area: 2 / 3; }
    .touch-btn--down { grid-area: 3 / 2; }
    .touch-btn {
      background: rgba(8,12,18,.7); border-color: rgba(79,163,165,.3); color: #4fa3a5;
      /* Mantener pulsado no debe hacer scroll, zoom, seleccionar texto ni abrir el menú largo. */
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    /* El botón dice con qué va a interactuar: el texto cabe en la banda lateral partiéndose en líneas. */
    .touch-interact {
      font-size: .82rem;
      min-height: 48px;
      max-width: 156px;
      padding: 6px 10px;
      gap: 6px;
      line-height: 1.15;
      white-space: normal;
      text-align: center;
    }
    .touch-interact__label { overflow-wrap: anywhere; }
    /* Sin nada cerca (el estado más frecuente): texto oscuro sobre el vidrio claro (>= 4,5:1 incluso sobre un mundo negro,
       el peor fondo) y borde discontinuo: el reposo no se distingue solo por el tono. En anchos < 700 px manda el fondo oscuro. */
    .touch-interact--idle { color: #10131a; border-style: dashed; }
    /* Aparece solo si la carga pasa de 300 ms: con caché caliente no parpadea. */
    .world-loading {
      position: absolute;
      inset: 0;
      min-height: 240px;
      z-index: 50;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 10px;
      background: #0e1322;
      color: #e8f0f4;
      animation: world-loading-in 200ms var(--psy-ease-out) 300ms both;
    }
    .world-loading__label { margin: 0; font-size: .95rem; }
    .world-loading__track {
      width: min(280px, 70vw);
      height: 6px;
      border-radius: 999px;
      background: rgba(182,156,255,.18);
      overflow: hidden;
    }
    .world-loading__fill {
      display: block;
      height: 100%;
      background: #b69cff;
      transform-origin: left center;
      transition: transform 160ms linear;
    }
    .world-loading__percent {
      margin: 0;
      font: 600 .8rem/1 'JetBrains Mono', ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
      color: rgba(232,240,244,.72);
    }
    .world-load-warning {
      position: absolute;
      left: 50%;
      top: 16px;
      z-index: 51;
      transform: translateX(-50%);
      width: min(420px, calc(100% - 32px));
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid rgba(245,184,75,.45);
      border-radius: 10px;
      background: rgba(8,12,18,.94);
      color: #e8f0f4;
      text-align: center;
    }
    .world-load-warning p { margin: 0; }
    .world-load-warning__actions { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    @keyframes world-loading-in { from { opacity: 0; } to { opacity: 1; } }
    /* Por tipo de puntero: tabletas en horizontal sí; ventanas de escritorio estrechas no. */
    /* La cruceta sigue a la ENTRADA real (F6-7): el primer toque la muestra y mover el ratón la oculta; sin entrada
       aún, vale el puntero principal. Lo decide la clase touch-input del anfitrión. */
    :host(.touch-input) .touch-controls { display: grid; }
    /* En anchos cortos (< 700 px) la cruz ya no cabe en las bandas negras y se encima al mundo:
       se hace semitransparente para que el piso se siga viendo por debajo. */
    @media (max-width: 699px) {
      :host(.touch-input) .touch-btn { background: rgba(8,12,18,.45); border-color: rgba(79,163,165,.55); }
      /* Fondo oscuro translúcido: el texto pasa a claro (el vidrio claro de escritorio lleva texto oscuro). */
      :host(.touch-input) .touch-interact { background: rgba(8,12,18,.6); border-color: rgba(232,240,244,.5); color: #e8f0f4; }
      :host(.touch-input) .touch-interact--idle { color: rgba(232,240,244,.8); border-style: dashed; }
    }
  `]
})
export class GameWorldComponent implements OnChanges, OnDestroy {
  readonly world = input<SimulationWorldState | null>(null);
  readonly scenarioConfig = input<ScenarioConfig | null>(null);
  readonly selectedInteractionKey = input<string | null>(null);
  readonly nearbyInteraction = input<MapObjectState | null>(null);
  /** Lo que dice el botón táctil: el verbo y el objeto del candidato principal; null si no hay nada cerca. */
  readonly interactLabel = computed(() => {
    const nearby = this.nearbyInteraction();
    if (!nearby) return null;
    const state = nearby.type === 'EXIT' ? this.doorStates()[nearby.key] : undefined;
    const door = state ? { state, missing: [], stageLocked: false, message: null } : null;
    return interactionVerb(nearby, door)?.text ?? null;
  });
  /** Personas con las que ya se habló (claves de persona): lo ya examinado se resalta con el ratón aunque esté lejos. */
  readonly viewedNpcKeys = input<ReadonlySet<string>>(NO_KEYS);
  /** «Atajos de una tecla» (F6-10, WCAG 2.1.4): con false WASD y E no hacen nada en el mundo. */
  readonly shortcuts = input(true);
  /** Nombre accesible del mundo: solo promete las teclas que «Atajos de una tecla» deja activas (F6-10, revisión de F6). */
  protected readonly worldLabel = computed(() => (this.shortcuts()
    ? 'Mapa explorable de la simulación. Usa WASD o flechas para moverte, E para interactuar.'
    : 'Mapa explorable de la simulación. Usa las flechas para moverte, Enter para interactuar.'));
  /** true mientras hay diálogo/journal/outcome: congela NPCs y ambient. */
  readonly motionPaused = input(false);
  readonly sfxMuted = input(false);
  readonly reduceMotion = input<boolean | null>(null);
  /** Activación de la persona (serena, tensa o en crisis): mueve la viñeta de crisis. */
  readonly activation = input<Activation>('CALM');
  /** Intensidad de la escena: una escena de intensidad alta oscurece un poco la viñeta. */
  readonly intensity = input<Intensity>('MEDIUM');
  /** Siguiente destino del proceso (clave de objeto o `npc:{clave}`): lleva el anillo y el rótulo fijo. */
  readonly nextTargetKey = input<string | null>(null);
  /** Estado vivo de cada puerta por clave: la bloqueada lleva candado y borde discontinuo en su rótulo. */
  readonly doorStates = input<Record<string, 'open' | 'locked'>>({});
  /** Motivo de cada puerta bloqueada (clave → texto, de `doorStatus`): el aviso de la puerta de pieza lo dice como la barra. */
  readonly doorMessages = input<Record<string, string>>({});
  /** Objetos de decisión de otras etapas: se atenúan, sin anillo y con rótulo solo muy cerca. */
  readonly dimmedKeys = input<ReadonlySet<string>>(new Set<string>());
  /** Modo compacto (móvil horizontal): rótulos mínimos. El puntero táctil ya lo implica. */
  readonly compact = input(false);
  /**
   * Con false el mundo no pinta su propio indicador de carga: el anfitrión ya muestra UNO desde el intento hasta el
   * primer cuadro (`worldReady`), y dos en secuencia eran tres señales distintas (plan visual F6-1).
   */
  readonly showLoader = input(true);
  /** Primer cuadro pintado del mapa actual: el anfitrión retira su indicador de carga. */
  /**
   * Retrato de la persona consultante del caso (la receta de la paciente), para que el HUD la muestre con la expresión
   * de su estado. `null` si el kit no la trae: el HUD dice la persona solo con palabras.
   */
  readonly patientVisual = output<CharacterVisual | null>();
  readonly worldReady = output<void>();
  /** Candidato PRINCIPAL en rango; un NPC llega como `MapObjectState` sintético con key `npc:{clave}`. */
  readonly proximity = output<MapObjectState | null>();
  /** Candidato secundario en rango (otra persona u objeto), o null. */
  readonly proximityAlso = output<MapObjectState | null>();
  /** Se pidió interactuar (E o «Interactuar») y no hay nada al alcance. */
  readonly nothingNearby = output<void>();
  readonly interact = output<MapObjectState>();
  readonly positionChange = output<{ x: number; y: number }>();
  readonly roomExit = output<{ targetRoomKey: string; entryX: number; entryY: number }>();
  readonly enterRoom = output<{ targetNodeKey: string; entryX: number; entryY: number }>();
  readonly npcInteract = output<NpcConfig>();
  /** Phaser no pintó ni un cuadro en `BOOT_WATCHDOG_MS` (contexto perdido, recurso colgado): quien lo aloja ofrece reintentar. */
  readonly bootFailed = output<void>();
  /** P2: una sala por piezas no cargó entera y se muestra en su versión simple (el anfitrión lo avisa). */
  readonly salaIncompleta = output<void>();
  /** P2: el aviso de la puerta de pieza activa sobre el lienzo (null: ninguno). */
  readonly avisoDePuerta = signal<AvisoDePuertaEnPantalla | null>(null);

  /** P2: pulsar el aviso es lo mismo que E junto a esa puerta: el anfitrión decide si se cruza o dice qué falta. */
  cruzarPorAviso(id: string): void {
    const puerta = this.world()?.objects.find(o => o.key === id);
    if (puerta) this.interact.emit(puerta);
  }
  /** Terminó la caminata pedida con «Ir a…» (F6-11): llegó o no pudo. */
  readonly walkEnded = output<{ key: string; label: string; outcome: 'arrived' | 'blocked' }>();
  readonly renderReady = signal(false);
  readonly renderedMapKey = signal<string | null>(null);
  readonly renderedScenarioKey = signal<string | null>(null);
  /** Progreso real de la precarga de Phaser (0-100). */
  readonly loadPercent = signal(0);
  /** true cuando terminó la precarga inicial (con o sin fallos). */
  readonly assetsReady = signal(false);
  /** Faltó un mapa o tileset: la sala se ve en paneles planos. */
  readonly criticalLoadFailed = signal(false);
  /** Zoom entero de la cámara en reposo (bloque M1): los marcos del diálogo se dibujan a este mismo factor (I1). */
  readonly cameraZoom = signal(1);
  private scene?: DataDrivenWorldScene;
  private phaserGame?: Phaser.Game;
  private bootWatchdog?: number;
  private gameHost?: ElementRef<HTMLDivElement>;
  /** Deja de seguir el tamaño del contenedor y el devicePixelRatio. */
  private detachHostWatch?: () => void;
  /** Retira el bloqueo de desplazamiento por teclado (flechas y Espacio) de `window`. */
  private detachScrollKeyGuard?: () => void;

  private readonly kit = inject(KitService);
  private readonly bibliotecaManifest = inject(BibliotecaManifestService);
  /** El componente se destruyó mientras llegaba el paquete del kit. */
  private destroyed = false;
  private booting = false;

  /** La última entrada real (dedo o ratón): decide la cruceta junto con el puntero principal (F6-7, VD-5). */
  private lastInput: InputKind = null;
  readonly touchInput = signal(touchControlsVisible(null, matchesMedia(COARSE_POINTER_QUERY)));
  private readonly onPointerKind = (event: PointerEvent): void => {
    const next = nextInputKind(this.lastInput, event.pointerType, matchesMedia('(any-pointer: fine)'));
    if (next === this.lastInput) return;
    this.lastInput = next;
    this.zone.run(() => this.touchInput.set(touchControlsVisible(next, matchesMedia(COARSE_POINTER_QUERY))));
  };

  constructor(private readonly zone: NgZone) {
    // Fuera de Angular: el puntero se mueve ~60 veces por segundo y solo un cambio de entrada entra a la zona.
    zone.runOutsideAngular(() => {
      document.addEventListener('pointerdown', this.onPointerKind, { capture: true, passive: true });
      document.addEventListener('pointermove', this.onPointerKind, { capture: true, passive: true });
    });
  }

  @ViewChild('gameHost')
  set host(value: ElementRef<HTMLDivElement> | undefined) {
    this.gameHost = value;
    if (value) this.boot();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['scenarioConfig']) {
      this.renderReady.set(false);
      this.renderedMapKey.set(null);
      this.renderedScenarioKey.set(null);
      this.scene?.setScenarioConfig(this.scenarioConfig());
    }
    if (changes['world'] && this.world()) {
      this.renderReady.set(false);
      this.renderedMapKey.set(null);
      this.renderedScenarioKey.set(null);
      this.scene?.setWorld(this.world()!);
    }
    if (changes['world'] || changes['viewedNpcKeys']) this.pushExamined();
    if (changes['shortcuts']) this.scene?.setShortcutsEnabled(this.shortcuts());
    if (changes['selectedInteractionKey']) this.scene?.setSelected(this.selectedInteractionKey());
    if (changes['motionPaused']) this.scene?.setMotionPaused(this.motionPaused());
    if (changes['sfxMuted']) this.scene?.setSfxMuted(this.sfxMuted());
    if (changes['reduceMotion']) this.scene?.setReduceMotion(this.effectiveReduceMotion());
    if (changes['activation'] || changes['intensity']) this.scene?.setPersonaScene(this.activation(), this.intensity());
    if (changes['compact']) this.scene?.setCompactLabels(this.compact());
    if (changes['nextTargetKey'] || changes['doorStates'] || changes['dimmedKeys']) this.pushOrientation();
  }

  /** Lo ya examinado: los objetos que el servidor da por inspeccionados y las personas con quienes ya se habló. */
  private pushExamined(): void {
    const examined = new Set<string>(this.world()?.inspectedObjectKeys ?? []);
    for (const key of this.viewedNpcKeys()) examined.add(NPC_KEY_PREFIX + key);
    this.scene?.setExamined(examined);
  }

  /** Lleva a la escena el destino, el estado de las puertas y los atenuados. */
  private pushOrientation(): void {
    this.scene?.setOrientation({
      nextTargetKey: this.nextTargetKey(),
      doorStates: this.doorStates(),
      dimmedKeys: this.dimmedKeys(),
    });
  }

  /**
   * Vuelve a medir el contenedor y reencaja el canvas. Phaser no lo hace solo cuando el contenedor
   * cambia de tamaño sin que cambie la ventana (panel lateral que se abre y se cierra, pie que crece):
   * `refresh()` usa el tamaño en caché del contenedor, así que antes hay que leerlo (T0.3).
   */
  refreshScale(): void {
    const host = this.gameHost?.nativeElement;
    if (this.phaserGame && host) fitGameToHost(this.phaserGame, host);
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.clearBootWatchdog();
    document.removeEventListener('pointerdown', this.onPointerKind, true);
    document.removeEventListener('pointermove', this.onPointerKind, true);
    this.detachScrollKeyGuard?.();
    this.detachScrollKeyGuard = undefined;
    this.detachHostWatch?.();
    this.detachHostWatch = undefined;
    this.phaserGame?.destroy(true);
  }

  nudge(direction: 'up' | 'down' | 'left' | 'right') { this.scene?.nudge(direction); }

  /** Pies del jugador en la escena (px enteros) o null si aún no existe. Es la posición viva:
   *  `positionChange` llega a Angular a lo sumo ~8 veces por segundo y va hasta 125 ms atrás. */
  playerPosition(): { x: number; y: number } | null {
    return this.scene?.playerPosition() ?? null;
  }

  /** Toque: el paso de siempre al instante; si se mantiene, la escena camina hasta soltar. */
  holdDirection(event: PointerEvent, direction: PlayerDirection) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // El paso va primero: con un `pointerId` ya inactivo la captura lanza y el toque se perdería.
    this.scene?.nudge(direction);
    this.scene?.setHeldDirection(direction);
    // Captura: si el dedo se desliza fuera del botón, el pointerup igual llega aquí.
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // Sin captura el toque sigue funcionando; solo se pierde el seguimiento fuera del botón.
    }
  }

  releaseDirection() { this.scene?.setHeldDirection(null); }

  /** Enter/Espacio sobre la flecha (click sin puntero, `detail === 0`): un paso. Los clics de
   *  puntero ya dieron su paso en pointerdown y no deben duplicarlo. */
  keyboardNudge(event: MouseEvent, direction: PlayerDirection) {
    if (event.detail === 0) this.nudge(direction);
  }

  /** Pies del jugador como data-player-x/y en el host de Phaser (contrato de navegación
   *  del e2e). Se escriben directo en el DOM: cambian en cada cuadro de caminata y una
   *  señal o un binding dispararían la detección de cambios de toda la app. */
  private writePlayerPosition(position: { x: number; y: number } | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host || !position) return;
    host.setAttribute('data-player-x', String(position.x));
    host.setAttribute('data-player-y', String(position.y));
  }

  interactNearest() { this.scene?.interactNearest(); }

  /** Personas, puertas y objetos de la sala a los que «Ir a…» puede llevar (F6-11). */
  places(): PlaceCandidate[] { return this.scene?.placeCandidates() ?? []; }

  /** Camina hasta una de ellas; false si ya no está (cambió la sala). */
  walkToKey(key: string): boolean { return this.scene?.walkToKey(key) ?? false; }

  /** Qué anima por cercanía y el cuadro de cada objeto con hoja, como `data-proximity` (JSON) del host: contrato del e2e. Directo al DOM. */
  private writeProximityAnimation(report: ProximityReport): void {
    const host = this.gameHost?.nativeElement;
    if (!host) return;
    if (Object.keys(report.frames).length === 0) host.removeAttribute('data-proximity');
    else host.setAttribute('data-proximity', JSON.stringify(report));
  }

  /** El nombre que lleva el indicador de la persona a atender, como `data-key-person` del host (contrato del e2e). Directo al DOM. */
  private writeKeyPerson(name: string | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host) return;
    if (name === null) host.removeAttribute('data-key-person');
    else host.setAttribute('data-key-person', name);
  }

  /** Cámara como `data-camera-zoom/moment/x/y` del host (contrato del e2e del bloque M1) y zoom asentado como señal. Directo al DOM. */
  private writeCamera(camera: CameraReport): void {
    if (camera.zoom > 0 && camera.zoom !== this.cameraZoom()) this.cameraZoom.set(camera.zoom);
    const host = this.gameHost?.nativeElement;
    if (!host) return;
    host.setAttribute('data-camera-zoom', String(camera.zoom));
    host.setAttribute('data-camera-moment', camera.momento);
    host.setAttribute('data-camera-x', String(camera.x));
    host.setAttribute('data-camera-y', String(camera.y));
    host.setAttribute('data-camera-travel', camera.viajando ? 'true' : 'false');
    host.setAttribute('data-camera-cover', `${camera.abajo},${camera.arriba}`);
    host.setAttribute('data-camera-room', camera.sala);
  }

  /** Dónde está ahora la persona a atender, como `data-key-person-x/y` del host (contrato del e2e, igual que `data-player-x/y`). Directo al DOM. */
  private writeKeyPersonPosition(position: { x: number; y: number } | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host) return;
    if (position === null) {
      host.removeAttribute('data-key-person-x');
      host.removeAttribute('data-key-person-y');
    } else {
      host.setAttribute('data-key-person-x', String(position.x));
      host.setAttribute('data-key-person-y', String(position.y));
    }
  }

  /** Qué tiene el puntero encima, como `data-world-hover` del host (contrato del e2e: el contorno y el cursor viven en
   *  el lienzo). Directo al DOM: cambia con el puntero y no debe disparar la detección de cambios. */
  private writeHover(key: string | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host) return;
    if (key === null) host.removeAttribute('data-world-hover');
    else host.setAttribute('data-world-hover', key);
  }

  /** Reinicia Phaser desde cero: vuelve a pedir lo que falló (lo demás sale de la caché
   *  del navegador) sin recargar la página ni perder el intento. */
  retryLoad(): void {
    this.detachHostWatch?.();
    this.detachHostWatch = undefined;
    this.phaserGame?.destroy(true);
    this.phaserGame = undefined;
    this.scene = undefined;
    this.renderReady.set(false);
    this.renderedMapKey.set(null);
    this.renderedScenarioKey.set(null);
    this.assetsReady.set(false);
    this.loadPercent.set(0);
    this.criticalLoadFailed.set(false);
    // «Reintentar» desaparece con el aviso: el foco no queda perdido en <body> (F6-8, H-05).
    document.getElementById('main-content')?.focus({ preventScroll: true });
    this.boot();
  }

  dismissLoadWarning(): void { this.criticalLoadFailed.set(false); }
  focus(key: string) { this.scene?.focus(key); }
  frameActors(key: string) { this.scene?.frameActors(key); }
  releaseFrame() { this.scene?.releaseFrame(); }
  /** Cámara (bloque M1): momento que pide la pantalla y alto (px CSS) que el cuadro de diálogo tapa abajo del lienzo. */
  private cameraOptions: CameraOptions = { cercana: false, acercarAuto: true };
  private cameraMoment: CameraMoment = { tipo: 'explorar' };
  private cameraCoveredCss = 0;
  private cameraCoveredTopCss = 0;
  private cameraPlacas: (() => readonly CajaDePlaca[]) | null = null;
  /** Zona segura de la cámara (U1): cómo medir las placas de la interfaz sobre el lienzo (px CSS desde su esquina). */
  setCameraPlacas(medir: (() => readonly CajaDePlaca[]) | null) {
    this.cameraPlacas = medir;
    this.scene?.setCameraPlacas?.(medir);
  }
  setCameraMoment(moment: CameraMoment, coveredCss = 0, coveredTopCss = 0) {
    this.cameraMoment = moment;
    this.cameraCoveredCss = coveredCss;
    this.cameraCoveredTopCss = coveredTopCss;
    this.scene?.setCameraMoment(moment, coveredCss, coveredTopCss);
  }
  setCameraOptions(options: CameraOptions) {
    this.cameraOptions = options;
    this.scene?.setCameraOptions(options);
  }
  setCameraFrozen(frozen: boolean) { this.scene?.setCameraFrozen(frozen); }
  setPersonaState(text: string | null) { this.scene?.setPersonaState(text); }
  faceTowards(key: string, target: 'player' | string) { this.scene?.faceTowards(key, target); }
  peopleNear(key: string, radiusPx: number): string[] { return this.scene?.peopleNear(key, radiusPx) ?? []; }
  screenAnchorOf(key: string): { x: number; y: number } | null { return this.scene?.screenAnchorOf(key) ?? null; }
  characterVisualOf(key: string): CharacterVisual | null { return this.scene?.characterVisualOf(key) ?? null; }
  isKeyPerson(key: string): boolean { return this.scene?.isKeyPerson(key) ?? false; }
  /** Marca el gesto en curso como `data-reaction` del host (contrato del e2e: solo la reacción a una decisión) mientras dura; `{ mark: false }` gesticula sin marcar. Directo al DOM. */
  playGesture(key: string, gesto: Gesto, options: { mark?: boolean } = {}): Promise<void> {
    const host = this.gameHost?.nativeElement;
    const busy = this.scene?.isGesturing(key) ?? true;   // un gesto que no empieza no toca la marca del que sigue
    const run = this.scene?.playGesture(key, gesto) ?? Promise.resolve();
    if (busy || options.mark === false) return run;
    host?.setAttribute('data-reaction', gesto);
    return run.finally(() => host?.removeAttribute('data-reaction'));
  }
  setScenarioConfig(config: ScenarioConfig | null) { this.scene?.setScenarioConfig(config); }
  transitionToRoom(targetRoomKey: string, entryX: number, entryY: number) {
    this.scene?.transitionToRoom(targetRoomKey, entryX, entryY);
  }
  playRevealEffects() { this.scene?.playRevealEffects(); }
  updatePatientVisualState(persona: Persona) {
    this.scene?.updatePatientVisualState(persona);
  }

  private boot() {
    if (!this.gameHost || this.phaserGame || this.booting) return;
    this.booting = true;
    // El paquete del kit llega antes que Phaser; si falla, el juego arranca igual y los
    // actores caen a su marcador (KitService lo reintenta en el próximo boot).
    // También se espera a Poppins (con plazo): Phaser mide el texto al crearlo y con la fuente aún sin cargar queda mal medido.
    // El manifiesto del arte de la biblioteca viaja igual: si no llega, el juego sigue sin animaciones de cercanía.
    Promise.all([
      this.kit.load().then(bundle => bundle, () => null),
      this.bibliotecaManifest.load(),
      whenWorldFontsReady(),
    ]).then(([bundle, manifest]) => {
      this.booting = false;
      if (!this.destroyed) this.emitPatientVisual(bundle);
      if (!this.destroyed && this.gameHost && !this.phaserGame) this.startGame(bundle, manifest);
    });
  }

  private emitPatientVisual(bundle: KitBundle | null): void {
    const visual = bundle ? resolveCharacter(bundle, { kind: 'receta', recipeId: PATIENT_RECIPE_ID }) : null;
    this.patientVisual.emit(visual?.recipeId === PATIENT_RECIPE_ID ? visual : null);
  }

  private startGame(kit: KitBundle | null, artManifest: BibliotecaManifest | null) {
    const reduceMotion = this.effectiveReduceMotion();
    this.zone.runOutsideAngular(() => {
      this.scene = new DataDrivenWorldScene({
        reduceMotion,
        kit,
        artManifest,
        onReady:       () => this.zone.run(() => {
          this.clearBootWatchdog();
          this.renderedMapKey.set(this.world()?.map.key ?? null);
          this.renderedScenarioKey.set(this.scenarioConfig()?.startRoomKey ?? null);
          this.writePlayerPosition(this.scene?.playerPosition() ?? null);
          this.renderReady.set(true);
          this.worldReady.emit();
          // Con la sala ya armada, el resto de los personajes llega en segundo plano (no compite con la sala inicial).
          this.scene?.cargarRecetasDiferidas();
        }),
        onSalaIncompleta: () => this.zone.run(() => this.salaIncompleta.emit()),
        onAvisoDePuerta: aviso => this.zone.run(() => this.avisoDePuerta.set(aviso)),
        onProximity:   i => this.zone.run(() => this.proximity.emit(i)),
        onProximityAlso: i => this.zone.run(() => this.proximityAlso.emit(i)),
        onNothingNearby: () => this.zone.run(() => this.nothingNearby.emit()),
        onInteract:    i => this.zone.run(() => this.interact.emit(i)),
        onPosition:    (x, y) => this.zone.run(() => this.positionChange.emit({ x, y })),
        onPositionFrame: (x, y) => this.writePlayerPosition({ x, y }),
        onRoomExit:    (targetRoomKey, entryX, entryY) =>
          this.zone.run(() => this.roomExit.emit({ targetRoomKey, entryX, entryY })),
        onEnterRoom:   (targetNodeKey, entryX, entryY) =>
          this.zone.run(() => this.enterRoom.emit({ targetNodeKey, entryX, entryY })),
        onNpcInteract: npc => this.zone.run(() => this.npcInteract.emit(npc)),
        onHover:       key => this.writeHover(key),
        onProximityAnimation: report => this.writeProximityAnimation(report),
        onKeyPersonIndicator: name => this.writeKeyPerson(name),
        onKeyPersonPosition: position => this.writeKeyPersonPosition(position),
        onCamera: camera => this.writeCamera(camera),
        onWalkEnded:   (key, label, outcome) => this.zone.run(() => this.walkEnded.emit({ key, label, outcome })),
        onLoadProgress: percent => this.zone.run(() => {
          this.loadPercent.set(percent);
          // Una carga que avanza no está colgada: el plazo cuenta desde el último avance, no desde el arranque.
          if (!this.renderReady()) this.armBootWatchdog();
        }),
        onArtLoading: () => this.onArtLoading(),
        recetasIniciales: () => {
          const objetos = this.world()?.objects;
          if (!objetos) return null;
          const recetas = objetos.filter(o => o.type === 'PERSON').map(o => o.metadata?.['recipeId'])
            .filter((r): r is string => typeof r === 'string' && r.length > 0);
          return recetas.length ? recetas : null;
        },
        onLoadComplete: failures => this.zone.run(() => {
          this.loadPercent.set(100);
          this.assetsReady.set(true);
          this.criticalLoadFailed.set(failures.length > 0);
          if (failures.length > 0) console.warn('[GameWorld] Recursos esenciales sin cargar:', failures);
        }),
        sfxMuted: this.sfxMuted(),
      });
      this.scene.setPersonaScene(this.activation(), this.intensity());
      // La cámara recibe lo que la pantalla pidió antes de que existiera la escena (bloque M1).
      this.scene.setCameraOptions(this.cameraOptions);
      this.scene.setCameraMoment(this.cameraMoment, this.cameraCoveredCss, this.cameraCoveredTopCss);
      this.scene.setCameraPlacas?.(this.cameraPlacas);
      this.armBootWatchdog();
      this.phaserGame = new Phaser.Game({
        // PHA-5 (E5-8): se mantiene Phaser.AUTO (WebGL preferido con caída a Canvas 2D) para soportar equipos de aula
        // sin aceleración WebGL; la viñeta de crisis se genera en textura de canvas (vignette-texture.util) compatible con ambos.
        // Con qué se dibuja de verdad lo MIDE `e2e/render-info.e2e.ts` en cada corrida (renderizador y GPU, en el informe) y
        // falla si cae a Canvas 2D: ahí el juego funciona pero va con otro costo y otro aspecto.
        type: Phaser.AUTO,
        parent: this.gameHost!.nativeElement,
        backgroundColor: '#0e141a',
        pixelArt: true,    // vecino más cercano: el pixel art no se suaviza
        // Cámaras con roundPixels; en Phaser 4 eso solo redondea traslaciones puras, así que con zoom de
        // cámara ≥ 2 los vértices los alinea PixelRender (vertexRoundMode 'fullAuto', F0-7).
        roundPixels: true,
        scale: pixelScaleConfig(this.gameHost!.nativeElement),
        scene: this.scene
      });
      // Sin la captura de Phaser, flechas y Espacio desplazarían la página (la «Vista previa»
      // del editor tiene scroll). Se arma DESPUÉS de crear el juego: Phaser descarta los
      // `keydown` ya cancelados. En un reintento se vuelve a armar tras el nuevo juego.
      this.detachScrollKeyGuard?.();
      this.detachScrollKeyGuard = attachScrollKeyGuard(this.zone);
      // Lienzo en píxeles físicos: sigue al contenedor (panel derecho, rotación, bottom
      // sheet) y al devicePixelRatio (zoom del navegador, cambio de monitor).
      this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);
    });
    window.setTimeout(() => {
      this.scene?.setScenarioConfig(this.scenarioConfig());
      if (this.world()) this.scene?.setWorld(this.world()!);
      this.scene?.setMotionPaused(this.motionPaused());
      this.scene?.setSfxMuted(this.sfxMuted());
      this.scene?.setReduceMotion(this.effectiveReduceMotion());
      this.scene?.setCompactLabels(this.compact());
      this.scene?.setShortcutsEnabled(this.shortcuts());
      this.pushExamined();
      this.pushOrientation();
    }, 0);
  }

  /** La segunda ola de carga (arte de la biblioteca) sigue viva: mientras la primera pintura la espera, el vigilante se reanuda. */
  onArtLoading(): void {
    if (!this.destroyed && !this.renderReady()) this.armBootWatchdog();
  }

  /** Si en `BOOT_WATCHDOG_MS` el mundo no se pintó, avisa: el indicador de carga no puede quedar eterno. */
  private armBootWatchdog(): void {
    this.clearBootWatchdog();
    this.bootWatchdog = window.setTimeout(() => {
      this.bootWatchdog = undefined;
      if (this.destroyed || this.renderReady()) return;
      this.zone.run(() => this.bootFailed.emit());
    }, BOOT_WATCHDOG_MS);
  }

  private clearBootWatchdog(): void {
    if (this.bootWatchdog !== undefined) window.clearTimeout(this.bootWatchdog);
    this.bootWatchdog = undefined;
  }

  private effectiveReduceMotion(): boolean {
    return this.reduceMotion() ?? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }
}
