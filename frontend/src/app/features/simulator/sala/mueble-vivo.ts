/**
 * Muebles y objetos de la biblioteca de piezas (P1 y O1) dentro de una sala del juego: qué pieza del manifiesto es un objeto
 * del caso y cómo se anima. Pura, sin dependencias, como el resto de `sala/`.
 *
 * - Un objeto del caso trae su arte en `metadata.arte` (`/assets/biblioteca/<ruta>`). Es una pieza si esa ruta es la de
 *   un mueble, un objeto o una herramienta del manifiesto, o si es el arte VIEJO que la pieza reemplaza (`reemplaza`): así
 *   los casos hechos con la biblioteca anterior ven el arte nuevo de O1 sin tocar el caso.
 * - Sus animaciones (`animaciones`: `reposo` en bucle, `cerca` y `revisar` una vez) van por pasos enteros: el cuadro es
 *   `de + ⌊ms · fps / 1000⌋`. Sin animaciones declaradas y con varios cuadros, el reposo los recorre todos con su `fps`
 *   (regla 6 de calidad: nada quieto que en la realidad se mueva). Con movimiento reducido no se anima: el reposo se queda
 *   en su primer cuadro y lo que va una vez salta a su final.
 */
import type { ManifiestoDePiezas, MuebleDeCatalogo } from './catalogo';

const PREFIJO = '/assets/biblioteca/';

export interface PiezaDeObjeto {
  clave: string;
  ficha: MuebleDeCatalogo;
}

export interface Clip {
  de: number;
  hasta: number;
  fps: number;
  bucle: boolean;
  /** Al terminar (una vez): vuelve a este clip. */
  luego?: string;
  /** Al terminar (una vez): se queda en su último cuadro. */
  sostener?: boolean;
}

type Seccion = Record<string, MuebleDeCatalogo & { reemplaza?: string }>;

/** La pieza del manifiesto que dibuja un objeto del caso, o null si su arte no es de la biblioteca de piezas. */
export function piezaDelObjeto(arte: unknown, manifiesto: ManifiestoDePiezas): PiezaDeObjeto | null {
  if (typeof arte !== 'string' || !arte.startsWith(PREFIJO)) return null;
  const ruta = arte.slice(PREFIJO.length);
  const secciones = manifiesto as unknown as Record<string, Seccion | undefined>;
  for (const nombre of ['muebles', 'objetos', 'herramientas']) {
    for (const [clave, ficha] of Object.entries(secciones[nombre] ?? {})) {
      if (ficha && (ficha.ruta === ruta || ficha.reemplaza === ruta)) return { clave, ficha };
    }
  }
  return null;
}

/** Los clips de una pieza; siempre trae `reposo`. */
export function clipsDe(ficha: MuebleDeCatalogo): Record<string, Clip> {
  const cuadros = Math.max(1, ficha.cuadros ?? 1);
  const declaradas = (ficha as { animaciones?: Record<string, Partial<Clip>> }).animaciones ?? {};
  const clips: Record<string, Clip> = {};
  for (const [nombre, a] of Object.entries(declaradas)) {
    const de = Math.max(0, Math.min(a.de ?? 0, cuadros - 1));
    const clip: Clip = { de, hasta: Math.max(de, Math.min(a.hasta ?? de, cuadros - 1)), fps: Math.max(1, a.fps ?? ficha.fps ?? 1), bucle: a.bucle === true };
    if (a.luego) clip.luego = a.luego;
    if (a.sostener) clip.sostener = true;
    clips[nombre] = clip;
  }
  if (!clips['reposo']) clips['reposo'] = { de: 0, hasta: ficha.fps ? cuadros - 1 : 0, fps: Math.max(1, ficha.fps ?? 1), bucle: true };
  return clips;
}

/** El cuadro del clip a los `ms` de empezar, y si ya terminó (solo los de una vez). */
export function cuadroDelClip(clip: Clip, ms: number, reducido: boolean): { cuadro: number; termino: boolean } {
  const largo = clip.hasta - clip.de + 1;
  if (clip.bucle) {
    if (reducido) return { cuadro: clip.de, termino: false };
    return { cuadro: clip.de + (Math.floor((ms * clip.fps) / 1000) % largo), termino: false };
  }
  if (reducido) return { cuadro: clip.hasta, termino: true };
  const paso = Math.floor((ms * clip.fps) / 1000);
  return paso >= largo ? { cuadro: clip.hasta, termino: true } : { cuadro: clip.de + paso, termino: false };
}
