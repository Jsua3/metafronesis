/**
 * La cámara del lienzo de Caminos (EDITOR-PRO.md, punto 3): dónde está el mundo (el mapa del caso, en píxeles de diseño)
 * respecto de la ventana del lienzo. `x` e `y` son el desplazamiento en píxeles de pantalla; `z`, la escala.
 * Un punto del mundo `m` se ve en `m * z + (x, y)`.
 *
 * Patrón: funciones puras (Value Object inmutable): el componente guarda una `Camara` en una señal y la reemplaza.
 */
export interface Camara { x: number; y: number; z: number }
export interface Punto { x: number; y: number }
export interface Tam { w: number; h: number }

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2;

export function acotarZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** «Ver todo»: la escala con la que cabe el mundo con aire alrededor (sin agigantar un caso corto: tope 1) y centrado. */
export function encuadrar(mundo: Tam, vista: Tam, aire = 48, tope = 1): Camara {
  if (!vista.w || !vista.h) return { x: 0, y: 0, z: 1 };
  const margen = Math.min(aire, vista.w / 2, vista.h / 2);
  const z = Math.min(tope, (vista.w - margen) / mundo.w, (vista.h - margen) / mundo.h);
  return { x: Math.round((vista.w - mundo.w * z) / 2), y: Math.round((vista.h - mundo.h * z) / 2), z };
}

/**
 * Un encuadre que nunca deja el texto ilegible: si el caso entero cabe con una escala de al menos `minimo`, es «Ver todo»;
 * si no, se queda en `minimo` y muestra el comienzo de la historia (el borde izquierdo del mapa con aire, y en alto el
 * `ancla`, la escena de inicio, centrada sin dejar lienzo vacío arriba ni abajo). El minimapa lleva al resto.
 */
export function encuadrarLegible(mundo: Tam, vista: Tam, ancla: Punto, minimo: number, aire = 48): Camara {
  const todo = encuadrar(mundo, vista, aire);
  if (todo.z >= minimo || !vista.w || !vista.h) return todo;
  const z = minimo, borde = aire / 2;
  const x = mundo.w * z <= vista.w - aire
    ? Math.round((vista.w - mundo.w * z) / 2)
    : Math.round(Math.min(borde, Math.max(vista.w - borde - mundo.w * z, vista.w / 2 - ancla.x * z)));
  const y = mundo.h * z <= vista.h - aire
    ? Math.round((vista.h - mundo.h * z) / 2)
    : Math.round(Math.min(borde, Math.max(vista.h - borde - mundo.h * z, vista.h / 2 - ancla.y * z)));
  return { x, y, z };
}

/** Acerca o aleja manteniendo quieto el punto de la pantalla `ancla` (el cursor, o el centro con los botones). */
export function zoomEn(c: Camara, ancla: Punto, z: number): Camara {
  const nz = acotarZoom(z);
  const mx = (ancla.x - c.x) / c.z, my = (ancla.y - c.y) / c.z;
  return { x: ancla.x - mx * nz, y: ancla.y - my * nz, z: nz };
}

/** Lleva el punto del mundo `m` al centro de la vista, con la misma escala. */
export function centrarEn(c: Camara, m: Punto, vista: Tam): Camara {
  return { x: Math.round(vista.w / 2 - m.x * c.z), y: Math.round(vista.h / 2 - m.y * c.z), z: c.z };
}

/** ¿El rectángulo del mundo se ve entero (con un margen de 16 px)? */
export function seVe(c: Camara, r: { x: number; y: number; w: number; h: number }, vista: Tam, margen = 16): boolean {
  const x = r.x * c.z + c.x, y = r.y * c.z + c.y;
  return x >= margen && y >= margen && x + r.w * c.z <= vista.w - margen && y + r.h * c.z <= vista.h - margen;
}

/** La parte del mundo que se ve, en coordenadas del mundo (para el minimapa). */
export function ventana(c: Camara, vista: Tam): { x: number; y: number; w: number; h: number } {
  return { x: -c.x / c.z, y: -c.y / c.z, w: vista.w / c.z, h: vista.h / c.z };
}
