import { SimulationWorldState } from '../../core/models/simulation.model';
import { playerHitbox, rectsIntersect } from './player-motion.util';

/** Tamaño por defecto que usa world_service.update_position si el mapa no trae uno. */
const SERVER_DEFAULT_MAP_WIDTH = 960;
const SERVER_DEFAULT_MAP_HEIGHT = 540;

/**
 * ¿Rechazaría el backend (GAME-01) poner los pies del jugador en (x, y)?
 *
 * Espejo de world_service.update_position: hitbox de pies completo dentro de
 * los límites del mapa y sin solapar zonas de colisión ni objetos con
 * `collision` del mundo (el DTO ya excluye invisibles y herramientas
 * recogidas, igual que _position_blocked). La geometría de la sala que pinta
 * el frontend puede diferir de la BD; uniendo esta regla al choque local, el
 * cliente nunca acepta una posición que el servidor rechazaría en silencio,
 * lo que dejaría la posición persistida desfasada para las acciones validadas.
 *
 * Con geometría entera, un punto flotante aceptado sigue aceptado tras el
 * Math.round con el que se envía al servidor.
 *
 * `ignoreKey` deja fuera a un objeto (la persona que camina por su cuenta no choca con su propio rectángulo de colisión).
 */
export function serverRejectsPlayerAt(world: SimulationWorldState, x: number, y: number, ignoreKey?: string): boolean {
  const hitbox = playerHitbox(x, y);
  const mapWidth = world.map.width || SERVER_DEFAULT_MAP_WIDTH;
  const mapHeight = world.map.height || SERVER_DEFAULT_MAP_HEIGHT;
  if (hitbox.x < 0 || hitbox.y < 0
    || hitbox.x + hitbox.width > mapWidth || hitbox.y + hitbox.height > mapHeight) {
    return true;
  }
  if (world.collisions.some(zone => rectsIntersect(hitbox, zone))) return true;
  return world.objects.some(object => object.collision && (ignoreKey === undefined || object.key !== ignoreKey) && rectsIntersect(hitbox, {
    x: object.x,
    y: object.y,
    width: object.width ?? 0,
    height: object.height ?? 0,
  }));
}
