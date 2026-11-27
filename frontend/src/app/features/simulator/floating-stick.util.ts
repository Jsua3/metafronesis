import type { PlayerMotionInput } from './player-motion.util';

export const STICK_DEAD_ZONE = 12;
export const STICK_RADIUS = 56;
const STILL: PlayerMotionInput = { left: false, right: false, up: false, down: false };

export interface FloatingStick {
  pointerId: number; x: number; y: number; dx: number; dy: number; dragging: boolean; input: PlayerMotionInput;
}

export function beginStick(current: FloatingStick | null, pointerId: number, x: number, y: number): FloatingStick | null {
  return current ?? { pointerId, x, y, dx: 0, dy: 0, dragging: false, input: STILL };
}

export function moveStick(current: FloatingStick | null, pointerId: number, x: number, y: number): FloatingStick | null {
  if (!current || current.pointerId !== pointerId) return current;
  const rawX = x - current.x, rawY = y - current.y;
  const distance = Math.hypot(rawX, rawY);
  const factor = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
  const dragging = current.dragging || distance >= STICK_DEAD_ZONE;
  if (distance < STICK_DEAD_ZONE) return { ...current, dx: rawX, dy: rawY, dragging, input: STILL };
  const horizontal = Math.abs(rawX) >= Math.abs(rawY) * 2.414213562;
  const vertical = Math.abs(rawY) >= Math.abs(rawX) * 2.414213562;
  return { ...current, dx: rawX * factor, dy: rawY * factor, dragging,
    input: { left: !vertical && rawX < 0, right: !vertical && rawX > 0,
      up: !horizontal && rawY < 0, down: !horizontal && rawY > 0 } };
}

export function endStick(current: FloatingStick | null, pointerId: number): { state: FloatingStick | null; tap: boolean } {
  if (!current || current.pointerId !== pointerId) return { state: current, tap: false };
  return { state: null, tap: !current.dragging };
}
