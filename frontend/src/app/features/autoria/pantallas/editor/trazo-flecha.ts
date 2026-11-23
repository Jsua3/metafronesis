import { ALTO_ESCENA, ANCHO_ESCENA } from '../../modelo/trazado';
import type { Punto } from './camara';

/** Una respuesta dibujada en el mapa: su curva, su punto medio (para el globo) y sus dos puertos. */
export interface Flecha {
  id: string;
  origen: string;
  destino: string;
  texto: string;
  /** A dónde lleva la respuesta, dicho con palabras. */
  hacia: string;
  d: string;
  medio: Punto;
  /** El puerto de salida (borde de la escena de origen) y el de entrada (borde de la de destino). */
  ini: Punto;
  fin: Punto;
  deElegida: boolean;
}

/**
 * La curva de una respuesta entre dos tarjetas (esquinas en `a` y `b`). Si el destino queda sobre todo abajo (o arriba),
 * sale por el borde de abajo y entra por el de arriba; si queda a un lado, sale y entra por los costados. Sirve igual para
 * un mapa ordenado de izquierda a derecha que de arriba abajo.
 *
 * Patrón: función pura.
 */
export function trazo(a: Punto, b: Punto, mismo: boolean): Pick<Flecha, 'd' | 'medio' | 'ini' | 'fin'> {
  if (mismo) {
    const x = a.x + ANCHO_ESCENA - 30, y = a.y;
    return {
      d: `M${x},${y} C${x + 10},${y - 50} ${x + 60},${y - 30} ${x + 30},${y + 4}`,
      medio: { x: x + 30, y: y - 30 }, ini: { x, y }, fin: { x: x + 30, y: y + 4 },
    };
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dy) > Math.abs(dx) * 1.2) {
    const baja = dy > 0;
    const x1 = a.x + ANCHO_ESCENA / 2, y1 = baja ? a.y + ALTO_ESCENA : a.y;
    const x2 = b.x + ANCHO_ESCENA / 2, y2 = baja ? b.y - 2 : b.y + ALTO_ESCENA + 2;
    const c = Math.max(40, Math.abs(y2 - y1) / 2) * (baja ? 1 : -1);
    return {
      d: `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`,
      medio: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, ini: { x: x1, y: y1 }, fin: { x: x2, y: y2 },
    };
  }
  const avanza = dx >= 0;
  const x1 = avanza ? a.x + ANCHO_ESCENA : a.x, y1 = a.y + ALTO_ESCENA / 2;
  const x2 = avanza ? b.x - 2 : b.x + ANCHO_ESCENA + 2, y2 = b.y + ALTO_ESCENA / 2;
  const c = Math.max(40, Math.abs(x2 - x1) / 2) * (avanza ? 1 : -1);
  return {
    d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`,
    medio: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, ini: { x: x1, y: y1 }, fin: { x: x2, y: y2 },
  };
}
