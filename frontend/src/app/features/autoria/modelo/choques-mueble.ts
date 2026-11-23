import type { SalaCaso } from './caso';
import { claveDeNuevo, huella } from './hacia-api';
import type { Escenario } from './escenario';

/** La clave que recibe un mueble al recorrer los objetos de la sala. */
export function claveDeMueble(sala: SalaCaso, indice: number): string {
  const usadas = new Set<string>();
  return sala.muebles.slice(0, indice + 1).map(m => claveDeNuevo(m.clave, m.ref, usadas)).at(-1)!;
}

/** Fija las claves provisionales antes de quitar o agregar piezas, para que no cambien las huellas restantes. */
export function fijarClavesDeMuebles(sala: SalaCaso): void {
  const usadas = new Set<string>();
  for (const m of sala.muebles) m.clave = claveDeNuevo(m.clave, m.ref, usadas);
}

export function trasladarChoque(sala: SalaCaso, clave: string, dx: number, dy: number): void {
  const zona = sala.choques[clave];
  if (zona) sala.choques[clave] = { ...zona, x: zona.x + dx, y: zona.y + dy };
}

export function crearChoque(sala: SalaCaso, clave: string, ref: string, x: number, y: number, catalogo: Escenario['catalogo']): void {
  const ficha = catalogo.muebles.find(m => m.id === ref);
  if (!ficha?.colision) return;
  const zona = huella(clave, ficha.nombre, x, y, ficha.ancho, ficha.alto);
  sala.choques[clave] = { x: zona.x, y: zona.y, ancho: zona.width, alto: zona.height };
}
