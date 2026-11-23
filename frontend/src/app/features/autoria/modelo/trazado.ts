import type { CasoBorrador } from './caso';

/** Tamaño de la tarjeta de una escena en el mapa. */
export const ANCHO_ESCENA = 208;
export const ALTO_ESCENA = 140;

/**
 * Hacia dónde corre la historia en el mapa (EDITOR.md §4.2, regla 6):
 * - `'izquierda-derecha'`: el de siempre; cada paso de la historia es una columna.
 * - `'arriba-abajo'`: cada paso es una fila. Se recomienda para historias casi lineales, porque el desplazamiento natural de
 *   una pantalla es vertical y las ramas (pocas) se reparten a lo ancho, que es donde sobra espacio.
 */
export type DireccionTrazado = 'izquierda-derecha' | 'arriba-abajo';

/**
 * El primer lugar libre a partir de `deseada`, bajando de a una tarjeta, para que una escena
 * nueva no quede encima de otra.
 */
export function posicionLibre(ocupadas: { x: number; y: number }[], deseada: { x: number; y: number }): { x: number; y: number } {
  const p = { ...deseada };
  const choca = () => ocupadas.some((o) => Math.abs(o.x - p.x) < ANCHO_ESCENA && Math.abs(o.y - p.y) < ALTO_ESCENA);
  while (choca()) p.y += ALTO_ESCENA + 20;
  return p;
}

/** Distribuye por distancia mínima desde el inicio; los ciclos nunca alteran una capa ya alcanzada. */
export function trazarEscenas(
  caso: CasoBorrador,
  direccion: DireccionTrazado = 'izquierda-derecha',
): Map<string, { x: number; y: number }> {
  const escenas = new Map(caso.escenas.map((e) => [e.id, e]));
  const capas = new Map<string, number>();
  const recorrer = (inicio: string, nivel: number) => {
    const cola = [inicio];
    capas.set(inicio, nivel);
    for (let i = 0; i < cola.length; i++) {
      const id = cola[i];
      for (const respuesta of escenas.get(id)!.respuestas) {
        const destino = respuesta.destinoId;
        if (destino && escenas.has(destino) && !capas.has(destino)) {
          capas.set(destino, capas.get(id)! + 1);
          cola.push(destino);
        }
      }
    }
  };
  const inicio = caso.inicioId && escenas.has(caso.inicioId) ? caso.inicioId : caso.escenas[0]?.id;
  if (inicio) recorrer(inicio, 0);
  // Las escenas desconectadas se colocan después del recorrido principal, sin ocultarlas.
  for (const e of caso.escenas) if (!capas.has(e.id)) recorrer(e.id, Math.max(0, ...capas.values()) + 1);
  const columnas: string[][] = [];
  for (const e of caso.escenas) (columnas[capas.get(e.id)!] ??= []).push(e.id);
  // Orden baricéntrico de los predecesores: reduce cruces conservando el orden ante empates.
  for (let c = 1; c < columnas.length; c++) {
    const anterior = columnas[c - 1];
    const centro = (id: string) => {
      const indices = anterior.flatMap((origen, i) => escenas.get(origen)!.respuestas.some((r) => r.destinoId === id) ? [i] : []);
      return indices.length ? indices.reduce((a, b) => a + b, 0) / indices.length : anterior.length / 2;
    };
    columnas[c].sort ( (a, b) => centro(a) - centro(b));
  }
  const maximo = Math.max(0, ...columnas.map((c) => c.length));
  const horizontal = direccion === 'izquierda-derecha';
  const pasoPrincipal = horizontal ? ANCHO_ESCENA + 112 : ALTO_ESCENA + 96;
  const pasoTransversal = horizontal ? ALTO_ESCENA + 80 : ANCHO_ESCENA + 80;
  const posiciones = new Map<string, { x: number; y: number }>();
  columnas.forEach((columna, c) => columna.forEach((id, fila) => {
    const transversal = Math.round((fila + (maximo - columna.length) / 2) * pasoTransversal);
    posiciones.set(id, horizontal ? { x: c * pasoPrincipal, y: transversal } : { x: transversal, y: c * pasoPrincipal });
  }));
  return posiciones;
}
