import type { PlanDeSala } from '../../simulator/sala/composicion';
import type { Encuadre } from './escenario';
import { ALTO_SALA, PISO, ancla, largoMuro, limites, redondear } from './geometria';
import type { Muro, Punto, Zona } from './geometria';

export type LugarEnMuro = { muro: Muro; pos: number };
export type LugarEnSuelo = { x: number; y: number };
export type Caja = { x: number; y: number; ancho: number; alto: number };

/**
 * Las zonas de toque de las piezas de muro con el dedo (WCAG 2.5.8; táctil: 44 px). Cada caja crece, centrada, hasta
 * `minimo` (en px de la sala: 44 / escala) sin moverse; si la zona agrandada de dos piezas se pisa, el borde entre ambas
 * queda a mitad de camino entre sus centros, por el eje en que más se separan, y ninguna zona queda más chica que su caja.
 * El dibujo no cambia: lo pinta el lienzo; esto es solo el botón transparente encima.
 */
export function zonasDeToque(cajas: ReadonlyMap<string, Caja>, minimo: number): Map<string, Caja> {
  const zonas = new Map<string, { x0: number; y0: number; x1: number; y1: number; c: Caja }>();
  for (const [id, c] of cajas) {
    const ancho = Math.max(c.ancho, minimo), alto = Math.max(c.alto, minimo);
    const cx = c.x + c.ancho / 2, cy = c.y + c.alto / 2;
    zonas.set(id, { x0: cx - ancho / 2, y0: cy - alto / 2, x1: cx + ancho / 2, y1: cy + alto / 2, c });
  }
  const lista = [...zonas.values()];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (a.x0 >= b.x1 || b.x0 >= a.x1 || a.y0 >= b.y1 || b.y0 >= a.y1) continue;
      const dx = (b.c.x + b.c.ancho / 2) - (a.c.x + a.c.ancho / 2);
      const dy = (b.c.y + b.c.alto / 2) - (a.c.y + a.c.alto / 2);
      const [izq, der] = dx >= 0 ? [a, b] : [b, a];
      const [arr, aba] = dy >= 0 ? [a, b] : [b, a];
      if (Math.abs(dx) >= Math.abs(dy)) {
        const mitad = (izq.c.x + izq.c.ancho / 2 + der.c.x + der.c.ancho / 2) / 2;
        izq.x1 = Math.min(izq.x1, Math.max(izq.c.x + izq.c.ancho, mitad));
        der.x0 = Math.max(der.x0, Math.min(der.c.x, mitad));
      } else {
        const mitad = (arr.c.y + arr.c.alto / 2 + aba.c.y + aba.c.alto / 2) / 2;
        arr.y1 = Math.min(arr.y1, Math.max(arr.c.y + arr.c.alto, mitad));
        aba.y0 = Math.max(aba.y0, Math.min(aba.c.y, mitad));
      }
    }
  }
  return new Map([...zonas].map(([id, z]) => [id, { x: z.x0, y: z.y0, ancho: z.x1 - z.x0, alto: z.y1 - z.y0 }]));
}

type Ficha = { ocupa: number; franja: readonly [number, number] };
type Ocupacion = Ficha & { esPuerta: boolean };

const rejilla = (valor: number) => redondear(valor, 8) * 8;
const limitar = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(maximo, valor));

export function cajaDePieza(
  id: string, plan: PlanDeSala | null, lugar: LugarEnMuro | LugarEnSuelo, ficha: Ficha, encuadre: Encuadre, ancho: number,
): Caja {
  const sprite = plan?.sprites.find((s) => s.id === id);
  if (sprite) return { x: sprite.x, y: sprite.y, ancho: sprite.w, alto: sprite.h };

  const w = Math.max(24, ficha.ocupa);
  const h = Math.max(24, ficha.franja[1] - ficha.franja[0]);
  if (!('muro' in lugar)) return { x: lugar.x - w / 2, y: lugar.y - h / 2, ancho: w, alto: h };
  const punto = ancla(lugar.muro, lugar.pos, encuadre, ancho);
  if (lugar.muro === 'fondo') {
    return { x: punto.x - w / 2, y: PISO - ficha.franja[1], ancho: w, alto: h };
  }
  if (lugar.muro === 'camara') return { x: punto.x - w / 2, y: ALTO_SALA - 24, ancho: w, alto: 24 };
  return { x: punto.x - w / 2, y: punto.y - h / 2, ancho: w, alto: h };
}

/** Traslada el exceso al muro vecino; los extremos pueden quedar fuera de la rejilla. */
function mover(actual: LugarEnMuro, pos: number, muros: readonly Muro[], encuadre: Encuadre, ancho: number): LugarEnMuro {
  const largo = largoMuro(actual.muro, encuadre, ancho);
  if (pos >= 0 && pos <= largo) return { muro: actual.muro, pos: limitar(rejilla(pos), 0, largo) };

  const antes = pos < 0;
  let vecino: Muro;
  let extremoFinal: boolean;
  if (actual.muro === 'fondo' || actual.muro === 'camara') {
    vecino = antes ? 'izquierda' : 'derecha';
    extremoFinal = actual.muro === 'camara';
  } else {
    vecino = antes ? 'fondo' : 'camara';
    extremoFinal = actual.muro === 'derecha';
  }
  const largoVecino = largoMuro(vecino, encuadre, ancho);
  if (!largoVecino || !muros.includes(vecino)) return { muro: actual.muro, pos: antes ? 0 : largo };
  const exceso = antes ? -pos : pos - largo;
  const destino = extremoFinal ? largoVecino - exceso : exceso;
  return { muro: vecino, pos: limitar(rejilla(destino), 0, largoVecino) };
}

export function proyectarAlMuro(
  punto: Punto, actual: LugarEnMuro, muros: readonly Muro[], encuadre: Encuadre, ancho: number,
): LugarEnMuro {
  const [xl] = limites(encuadre, ancho);
  let pos: number;
  if (actual.muro === 'fondo') pos = punto.x - xl;
  else if (actual.muro === 'camara') pos = redondear((punto.x - ancho / 2) * 16, 19) + ancho / 2 - xl;
  else pos = punto.y - PISO;
  return mover(actual, pos, muros, encuadre, ancho);
}

export function pasoDeTeclado(
  actual: LugarEnMuro, tecla: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  muros: readonly Muro[], encuadre: Encuadre, ancho: number,
): LugarEnMuro {
  const paso = tecla === 'ArrowLeft' || tecla === 'ArrowUp' ? -8 : 8;
  return mover(actual, actual.pos + paso, muros, encuadre, ancho);
}

export function proyectarAlSuelo(punto: Punto, zona: Zona): LugarEnSuelo {
  const ajustar = (valor: number, inicio: number, fin: number) => {
    const primero = Math.ceil(inicio / 8) * 8;
    const ultimo = Math.floor(fin / 8) * 8;
    return primero <= ultimo ? limitar(rejilla(valor), primero, ultimo) : limitar(valor, inicio, fin);
  };
  return { x: ajustar(punto.x, zona.x, zona.x + zona.ancho), y: ajustar(punto.y, zona.y, zona.y + zona.alto) };
}

export function primerHueco(muro: Muro, ficha: Ocupacion, ocupadas: readonly (Ocupacion & { pos: number })[],
  largo: number): number | null {
  void muro;
  const centro = rejilla(largo / 2);
  for (let distancia = 0; distancia <= largo + 8; distancia += 8) {
    for (const pos of distancia === 0 ? [centro] : [centro - distancia, centro + distancia]) {
      if (2 * pos - ficha.ocupa < 0 || 2 * pos + ficha.ocupa > 2 * largo) continue;
      const choca = ocupadas.some((otra) =>
        2 * Math.abs(pos - otra.pos) < ficha.ocupa + otra.ocupa + (ficha.esPuerta || otra.esPuerta ? 16 : 0)
        && ficha.franja[0] < otra.franja[1] && otra.franja[0] < ficha.franja[1]);
      if (!choca) return pos;
    }
  }
  return null;
}
