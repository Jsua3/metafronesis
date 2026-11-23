/**
 * Pure, framework-free motion helpers for the living-world scene (B1).
 * Kept independent of Phaser so they are unit-testable; the scene supplies
 * collision checks and timing.
 */
import {
  NpcMotionAnchor, NpcMotionBehavior, NpcMotionConfig, NpcMovementZone,
} from '../../core/models/simulation.model';

export type MovementPattern =
  | { type: 'idle' }
  | { type: 'wander'; radius: number }
  | { type: 'patrol'; points: Array<[number, number]> };

export const DEFAULT_WANDER_RADIUS = 28;

export function parseMovementPattern(
  raw: Record<string, unknown> | null | undefined,
): MovementPattern | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = (raw as { type?: unknown }).type;
  if (type === 'idle') return { type: 'idle' };
  if (type === 'wander') {
    const r = Number((raw as { radius?: unknown }).radius);
    return { type: 'wander', radius: Number.isFinite(r) && r > 0 ? r : DEFAULT_WANDER_RADIUS };
  }
  if (type === 'patrol') {
    const pts = (raw as { points?: unknown }).points;
    const ok = Array.isArray(pts) && pts.length > 0 && pts.every(
      p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number'),
    );
    return ok ? { type: 'patrol', points: pts as Array<[number, number]> } : null;
  }
  return null;
}

export function defaultPatternForType(type: string): MovementPattern {
  return type === 'PERSON' ? { type: 'wander', radius: DEFAULT_WANDER_RADIUS } : { type: 'idle' };
}

export function resolvePattern(
  object: { type: string; movementPattern?: Record<string, unknown> | null },
): MovementPattern {
  return parseMovementPattern(object.movementPattern) ?? defaultPatternForType(object.type);
}

export function stepToward(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  maxStep: number,
): { x: number; y: number } {
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist === 0) return { x: target.x, y: target.y };
  return { x: cur.x + (dx / dist) * maxStep, y: cur.y + (dy / dist) * maxStep };
}

export function reached(
  cur: { x: number; y: number },
  target: { x: number; y: number },
  epsilon = 1,
): boolean {
  return Math.hypot(target.x - cur.x, target.y - cur.y) <= epsilon;
}

export function pickWanderTarget(
  origin: { x: number; y: number },
  radius: number,
  rand: () => number,
): { x: number; y: number } {
  const angle = rand() * Math.PI * 2;
  const r = rand() * radius;
  return { x: origin.x + Math.cos(angle) * r, y: origin.y + Math.sin(angle) * r };
}

// ─── NPC motion (flujo competitivo) — sobrio, clínico, nada arcade ───────────

export const NPC_BEHAVIOR_SPEED: Record<NpcMotionBehavior, number> = {
  idle: 0, 'subtle-wander': 18, pace: 24, patrol: 28, avoidant: 20, attentive: 0,
};

export const NPC_BEHAVIOR_PAUSE: Record<NpcMotionBehavior, number> = {
  idle: 0, 'subtle-wander': 2400, pace: 1600, patrol: 900, avoidant: 1400, attentive: 0,
};

export const DEFAULT_NPC_ZONE_HALF = 26;
/** Distancia a la que un avoidant reacciona al jugador. */
export const AVOIDANT_TRIGGER_RANGE = 70;
/** Paso corto máximo del avoidant (no debe parecer huida). */
export const AVOIDANT_STEP_MAX = 16;

export function npcSpeed(cfg: NpcMotionConfig): number {
  return cfg.speed ?? NPC_BEHAVIOR_SPEED[cfg.behavior] ?? 0;
}

export function npcPause(cfg: NpcMotionConfig, anchor?: NpcMotionAnchor | null): number {
  return anchor?.pauseMs ?? cfg.pauseMs ?? NPC_BEHAVIOR_PAUSE[cfg.behavior] ?? 0;
}

export function npcZone(cfg: NpcMotionConfig, origin: { x: number; y: number }): NpcMovementZone {
  if (cfg.zone) return cfg.zone;
  const r = cfg.radius ?? DEFAULT_NPC_ZONE_HALF;
  return { x: origin.x - r, y: origin.y - r, width: r * 2, height: r * 2 };
}

export function clampToZone(p: { x: number; y: number }, zone: NpcMovementZone): { x: number; y: number } {
  return {
    x: Math.min(Math.max(p.x, zone.x), zone.x + zone.width),
    y: Math.min(Math.max(p.y, zone.y), zone.y + zone.height),
  };
}

export function pickZoneTarget(zone: NpcMovementZone, rand: () => number): { x: number; y: number } {
  return { x: zone.x + rand() * zone.width, y: zone.y + rand() * zone.height };
}

export function nextAnchorIndex(idx: number, length: number): number {
  return length > 0 ? (idx + 1) % length : 0;
}

/**
 * Objetivo avoidant: paso CORTO (≤ AVOIDANT_STEP_MAX) hacia el punto de la zona
 * que más se aleja del jugador, muestreando candidatos. Postura, no huida.
 */
export function avoidantTarget(
  zone: NpcMovementZone,
  from: { x: number; y: number },
  player: { x: number; y: number },
  rand: () => number,
  samples = 6,
): { x: number; y: number } {
  let best = from;
  let bestDist = Math.hypot(from.x - player.x, from.y - player.y);
  for (let i = 0; i < samples; i++) {
    const candidate = pickZoneTarget(zone, rand);
    const d = Math.hypot(candidate.x - player.x, candidate.y - player.y);
    if (d > bestDist) { best = candidate; bestDist = d; }
  }
  return clampToZone(stepToward(from, best, AVOIDANT_STEP_MAX), zone);
}

/** Con reduced motion solo se permite idle, o attentive (facing sin traslación). */
export function effectiveNpcBehavior(behavior: NpcMotionBehavior, reducedMotion: boolean): NpcMotionBehavior {
  if (!reducedMotion) return behavior;
  return behavior === 'attentive' ? 'attentive' : 'idle';
}

/**
 * Returns the target if it is free; otherwise probes 8 directions across
 * expanding rings and returns the first free offset. Falls back to the
 * target if nothing is free within `rings`.
 */
export function freeTileNear(
  target: { x: number; y: number },
  isBlocked: (x: number, y: number) => boolean,
  step = 24,
  rings = 3,
): { x: number; y: number } {
  if (!isBlocked(target.x, target.y)) return { x: target.x, y: target.y };
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let ring = 1; ring <= rings; ring++) {
    for (const [dx, dy] of dirs) {
      const x = target.x + dx * step * ring;
      const y = target.y + dy * step * ring;
      if (!isBlocked(x, y)) return { x, y };
    }
  }
  return { x: target.x, y: target.y };
}
