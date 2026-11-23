/**
 * Lienzo de Phaser en píxeles físicos (spec §8.3): el juego mide el contenedor ×
 * devicePixelRatio y `scale.zoom = 1/dpr` lo devuelve al tamaño CSS del contenedor.
 * Sustituye a Scale.FIT, que estiraba el lienzo de 960×540 a escalas fraccionarias.
 */
import Phaser from 'phaser';

import { PhysicalSize, physicalSize } from './pixel-scale.util';

export function hostPhysicalSize(host: HTMLElement): PhysicalSize {
  const rect = host.getBoundingClientRect();
  return physicalSize(rect.width, rect.height, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
}

export function pixelScaleConfig(host: HTMLElement): Phaser.Types.Core.ScaleConfig {
  const size = hostPhysicalSize(host);
  return { mode: Phaser.Scale.NONE, width: size.width, height: size.height, zoom: 1 / size.dpr };
}

/** Reajusta el lienzo al contenedor; true si algo cambió (Phaser emite `resize` y la escena recalcula el zoom). */
export function fitGameToHost(game: Phaser.Game, host: HTMLElement): boolean {
  const size = hostPhysicalSize(host);
  let changed = false;
  if (game.scale.width !== size.width || game.scale.height !== size.height) {
    game.scale.resize(size.width, size.height);
    changed = true;
  }
  if (Math.abs(game.scale.zoom - 1 / size.dpr) > 1e-6) {
    game.scale.setZoom(1 / size.dpr);
    changed = true;
  }
  return changed;
}

/**
 * Sigue el tamaño del contenedor (panel lateral, rotación) y el devicePixelRatio (zoom
 * del navegador, cambio de monitor: ambos disparan `resize` en window). Devuelve la
 * función que deja de observar.
 */
export function watchHostSize(game: Phaser.Game, host: HTMLElement): () => void {
  const refit = () => { fitGameToHost(game, host); };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refit) : null;
  observer?.observe(host);
  window.addEventListener('resize', refit);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', refit);
  };
}
