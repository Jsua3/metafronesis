/**
 * Sprites pixel-art de los objetos del mapa (herramientas y objetos de escenario).
 *
 * Reemplazan los marcadores abstractos (`buildToolMarker`: badge + código; o el
 * tile genérico de `dungeon-tiles` para los OBJECT) por un ítem reconocible. Si
 * un objeto no tiene sprite (o el asset no cargó), el resolver devuelve `null` y
 * el marcador cae a su representación previa — degradación elegante.
 */

/** tool_code → nombre base del asset (herramientas que el jugador recoge). */
const TOOL_SPRITE: Record<string, string> = {
  PAP: 'tool_pap',
  SPIKES: 'tool_spikes',
  REFLECTION_JOURNAL: 'tool_reflection_journal',
  SAFETY_ROUTE: 'tool_safety_route',
  RISK_METER: 'tool_risk_meter',
};

/** short_code → nombre base del asset (objetos de escenario interactivos, tipo OBJECT). */
const OBJECT_SPRITE: Record<string, string> = {
  EXP: 'object_expediente',
  LEY: 'object_marco_normativo',
  REG: 'object_registro',
  RES: 'object_acceso_restringido',
  FIN: 'object_cierre',
};

/** Clave de textura Phaser para un sprite de objeto. */
export function objectTextureKey(assetName: string): string {
  return `object-${assetName}`;
}

/** { textureKey, assetPath } de todos los sprites (herramientas + escenario) para precargar. */
export function objectSpriteSpecs(): { textureKey: string; assetPath: string }[] {
  return [...Object.values(TOOL_SPRITE), ...Object.values(OBJECT_SPRITE)].map(name => ({
    textureKey: objectTextureKey(name),
    assetPath: `/assets/game/objects/${name}.png`,
  }));
}

/** Clave de textura Phaser para un `toolCode` (TOOL), o `null`. */
export function resolveToolTextureKey(toolCode: string | null | undefined): string | null {
  if (!toolCode) return null;
  const name = TOOL_SPRITE[toolCode];
  return name ? objectTextureKey(name) : null;
}

/** Clave de textura Phaser para un `shortCode` (OBJECT de escenario), o `null`. */
export function resolveObjectTextureKey(shortCode: string | null | undefined): string | null {
  if (!shortCode) return null;
  const name = OBJECT_SPRITE[shortCode];
  return name ? objectTextureKey(name) : null;
}

// ── Arte de la biblioteca y animación de cercanía ─────────────────────────────────────────────────────────────

/** Prefijo público de los PNG de la biblioteca; las claves del manifiesto son relativas a él. */
export const BIBLIOTECA_PREFIX = '/assets/biblioteca/';
/** Dónde se sirve el manifiesto del arte (`biblioteca/manifiesto.json` versionado en `src/assets`). */
export const BIBLIOTECA_MANIFEST_URL = `${BIBLIOTECA_PREFIX}manifiesto.json`;
/** Cuadros por segundo de la animación de cercanía cuando ni el caso ni el manifiesto dicen otra cosa. */
export const DEFAULT_PROXIMITY_FPS = 6;
/** Una hoja con menos cuadros que esto no anima nada: se queda en el reposo. */
const MIN_SHEET_FRAMES = 2;

export interface ManifestEntry {
  /** Ancho en píxeles; en una hoja animada es el de UN cuadro (la hoja mide `cuadros × ancho`). */
  ancho: number;
  alto: number;
  cuadros?: number;
  fps?: number;
  origen: 'modelo' | 'lugar' | 'existente';
}

export interface BibliotecaManifest {
  esquema: number;
  sprites: Record<string, ManifestEntry>;
}

/** Hoja de animación de cercanía lista para `load.spritesheet`. */
export interface ObjectSheet {
  textureKey: string;
  assetPath: string;
  frames: number;
  fps: number;
  frameWidth: number;
  frameHeight: number;
}

/** Lo que el juego dibuja para un objeto: el reposo y, si el manifiesto la respalda, su hoja de cercanía. */
export interface ObjectSprite {
  textureKey: string;
  assetPath: string;
  sheet?: ObjectSheet;
}

/** Un archivo que la escena debe tener cargado antes de dibujar el objeto. */
export interface ArtLoad {
  kind: 'image' | 'sheet';
  textureKey: string;
  assetPath: string;
  frameWidth?: number;
  frameHeight?: number;
}

/** ¿Es un manifiesto que este código sabe leer? Cualquier otra cosa cuenta como «sin manifiesto». */
export function isBibliotecaManifest(x: unknown): x is BibliotecaManifest {
  const manifest = x as Partial<BibliotecaManifest> | null;
  return !!manifest && typeof manifest === 'object' && manifest.esquema === 1
    && !!manifest.sprites && typeof manifest.sprites === 'object' && !Array.isArray(manifest.sprites);
}

/** Clave del manifiesto (relativa a `assets/biblioteca/`) de una ruta pública, o `null` si no es un PNG de la biblioteca. */
export function manifestKeyOf(assetPath: unknown): string | null {
  if (typeof assetPath !== 'string' || !assetPath.startsWith(BIBLIOTECA_PREFIX) || !assetPath.endsWith('.png')) return null;
  const key = assetPath.slice(BIBLIOTECA_PREFIX.length);
  const suspicious = key.includes('..') || key.includes('\\') || key.includes('//');
  return key.length > 0 && !suspicious ? key : null;
}

function bibliotecaTextureKey(manifestKey: string): string {
  return `biblioteca-${manifestKey}`;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * La hoja de `key`, solo si el manifiesto la describe con cuadros de verdad: las medidas del cuadro salen del
 * manifiesto y nunca de los metadatos del caso. `fps` es el que pide el caso, si no el del manifiesto, si no 6.
 */
function sheetFor(
  assetPath: string, manifest: BibliotecaManifest | null, requestedFps: unknown, textureKey: string,
): ObjectSheet | undefined {
  const key = manifestKeyOf(assetPath);
  const entry = key && manifest ? manifest.sprites[key] : undefined;
  if (!key || !entry) return undefined;
  const frames = entry.cuadros;
  const frameWidth = positiveNumber(entry.ancho);
  const frameHeight = positiveNumber(entry.alto);
  if (typeof frames !== 'number' || !Number.isInteger(frames) || frames < MIN_SHEET_FRAMES || !frameWidth || !frameHeight) {
    return undefined;
  }
  const fps = positiveNumber(requestedFps) ?? positiveNumber(entry.fps) ?? DEFAULT_PROXIMITY_FPS;
  return { textureKey, assetPath, frames, fps, frameWidth, frameHeight };
}

interface SpriteSource {
  type: string;
  toolCode?: string | null;
  shortCode?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Qué dibuja el juego para un objeto. Primero lo que el caso trae en `metadata.arte` (+ `animacionCerca`, un objeto
 * copiado de la biblioteca); si no, los sprites fijos de siempre por `toolCode`/`shortCode`, con su hoja `existente`
 * del manifiesto. Sin manifiesto, o con la hoja ausente de él, queda el reposo; sin reposo, `null` (→ marcador previo).
 * Personas y puertas no pasan por aquí: tienen su propio arte.
 */
export function spriteFor(obj: SpriteSource, manifest: BibliotecaManifest | null): ObjectSprite | null {
  if (obj.type === 'PERSON' || obj.type === 'EXIT') return null;

  const arte = obj.metadata?.['arte'];
  const arteKey = manifestKeyOf(arte);
  if (arteKey) {
    const rest: ObjectSprite = { textureKey: bibliotecaTextureKey(arteKey), assetPath: arte as string };
    const cerca = obj.metadata?.['animacionCerca'] as { hoja?: unknown; fps?: unknown } | null | undefined;
    const hojaKey = manifestKeyOf(cerca?.hoja);
    if (hojaKey) {
      const sheet = sheetFor(cerca!.hoja as string, manifest, cerca?.fps, bibliotecaTextureKey(hojaKey));
      if (sheet) rest.sheet = sheet;
    }
    return rest;
  }

  const name = obj.type === 'TOOL' ? TOOL_SPRITE[obj.toolCode ?? '']
    : obj.type === 'OBJECT' ? OBJECT_SPRITE[obj.shortCode ?? ''] : undefined;
  if (!name) return null;
  const sprite: ObjectSprite = { textureKey: objectTextureKey(name), assetPath: `/assets/game/objects/${name}.png` };
  const sheet = sheetFor(`${BIBLIOTECA_PREFIX}${existingSheetKey(name)}`, manifest, null, `${sprite.textureKey}-cerca`);
  if (sheet) sprite.sheet = sheet;
  return sprite;
}

/** Clave en el manifiesto de la hoja de cercanía de uno de los sprites fijos. */
function existingSheetKey(name: string): string {
  return `modelos/existentes/arte/${name}-cerca.png`;
}

/** Las hojas de los sprites fijos que el manifiesto respalda: se precargan con el resto del arte del juego. */
export function objectSheetSpecs(manifest: BibliotecaManifest | null): ObjectSheet[] {
  const sheets: ObjectSheet[] = [];
  for (const name of [...Object.values(TOOL_SPRITE), ...Object.values(OBJECT_SPRITE)]) {
    const sheet = sheetFor(`${BIBLIOTECA_PREFIX}${existingSheetKey(name)}`, manifest, null, `${objectTextureKey(name)}-cerca`);
    if (sheet) sheets.push(sheet);
  }
  return sheets;
}

/** Lo que hay que cargar para dibujar estos objetos (reposo y hoja, sin repetidos). */
export function artLoadsFor(objects: readonly SpriteSource[], manifest: BibliotecaManifest | null): ArtLoad[] {
  const loads = new Map<string, ArtLoad>();
  for (const obj of objects) {
    const sprite = spriteFor(obj, manifest);
    if (!sprite) continue;
    if (!loads.has(sprite.textureKey)) loads.set(sprite.textureKey, { kind: 'image', textureKey: sprite.textureKey, assetPath: sprite.assetPath });
    const sheet = sprite.sheet;
    if (sheet && !loads.has(sheet.textureKey)) {
      loads.set(sheet.textureKey, {
        kind: 'sheet', textureKey: sheet.textureKey, assetPath: sheet.assetPath,
        frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
      });
    }
  }
  return [...loads.values()];
}
