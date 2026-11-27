import type { MapObjectState } from '../../../core/models/simulation.model';
import type { RgbaImage } from '../../character/kit/kit-engine';
import { actorDepth } from '../depth-sort.util';
import { playerHitbox, rectsIntersect } from '../player-motion.util';
import type { MuebleDeSala } from './escena-de-sala';

interface Punto {
  x: number;
  y: number;
}

interface Cama {
  cabeza: Punto;
  cobija: { x: number; y: number; ancho: number; alto: number };
  colores: readonly [number, number, number];
  horizontal?: boolean;
}

// Coordenadas del primer cuadro de cada arte. La cabeza señala el centro y la primera fila del recorte del kit.
const CAMAS: ReadonlyMap<string, Cama> = new Map([
  ['hospital/cama-recuperacion', {
    cabeza: { x: 32, y: 5 }, cobija: { x: 31, y: 18, ancho: 64, alto: 14 },
    colores: [0x72928e, 0x92b0a8, 0x567274], horizontal: true,
  }],
  ['casa/cama-sencilla', {
    cabeza: { x: 30, y: 6 }, cobija: { x: 16, y: 24, ancho: 26, alto: 17 },
    colores: [0x547eba, 0x6da4cf, 0x3c5198],
  }],
  ['casa/cama-doble', {
    cabeza: { x: 29, y: 6 }, cobija: { x: 15, y: 24, ancho: 26, alto: 23 },
    colores: [0x3a7c70, 0x569e86, 0x2a6565],
  }],
]);

/** Primera y última fila útil del tablero, medidas en el cuadro del arte. */
const TABLEROS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['casa/escritorio-infantil', [12, 17]],
  ['casa/mesa-centro-casa', [1, 6]],
  ['casa/mesa-comedor', [2, 11]],
  ['casa/mesa-noche', [14, 17]],
  ['comisaria/escritorio-funcionario', [22, 28]],
  ['comisaria/mesa-baja-nna', [2, 9]],
  ['comisaria/mesa-reunion', [2, 18]],
  ['hospital/escritorio', [7, 12]],
  ['hospital/mesa-centro', [1, 5]],
  ['universidad/escritorio', [22, 28]],
  ['universidad/mesa-cafeteria', [6, 11]],
  ['universidad/mesa-centro', [1, 6]],
  ['universidad/mesa-estudio', [12, 17]],
]);

export interface ApoyoDeMueble {
  mueble: MuebleDeSala;
  dibujo: Punto;
  llegada: Punto;
  cama?: Cama;
}

export const FILAS_DE_CABEZA = 23;

export function anclaDelArte(ficha: MuebleDeSala['ficha']): readonly [number, number] {
  return ficha.apoyo ?? [Math.floor(ficha.ancho / 2), ficha.alto];
}

/** Delante del brillo y el emisivo del mueble, todavía dentro de la banda de actores. */
export function profundidadSobre(y: number): number {
  return actorDepth(y) + 0.02;
}

function huella(mueble: MuebleDeSala) {
  const ancho = mueble.ficha.huella?.ancho ?? mueble.ficha.ancho;
  const fondo = mueble.ficha.huella?.fondo ?? 16;
  return { x: mueble.x - Math.floor(ancho / 2), y: mueble.y - fondo, width: ancho, height: fondo };
}

export function pisaElMueble(mueble: MuebleDeSala, x: number, y: number): boolean {
  return rectsIntersect(playerHitbox(x, y), huella(mueble));
}

/** Se prueba primero el frente y luego los otros bordes si el frente queda detrás de un obstáculo. */
export function bordesDelMueble(apoyo: ApoyoDeMueble): Punto[] {
  const { x, y, width, height } = huella(apoyo.mueble);
  // El avatar que llega a la cama deja libre la vista de la cara desde la cámara.
  const separacion = apoyo.cama ? (apoyo.mueble.espejo ? 32 : -32) : 0;
  const bordeX = Math.max(x, Math.min(x + width, apoyo.dibujo.x + separacion));
  const medioY = y + Math.floor(height / 2) + 8;
  const lados = [{ x: x - 20, y: medioY }, { x: x + width + 20, y: medioY }];
  if (apoyo.dibujo.x > apoyo.mueble.x) lados.reverse();
  return [
    { x: bordeX, y: y + height + 24 },
    ...lados,
    { x: bordeX, y: y - 16 },
  ];
}

/** Solo enlaza claves exactas de PROP visibles cuyo arte admite esa relación. */
export function apoyoDeMueble(obj: MapObjectState, muebles: ReadonlyMap<string, MuebleDeSala>): ApoyoDeMueble | null {
  const metadata = obj.metadata;
  const enCama = obj.type === 'PERSON' && metadata?.['postura'] === 'en-cama';
  const sobre = !['PERSON', 'PROP', 'EXIT', 'TRIGGER'].includes(obj.type) && metadata?.['apoyo'] === 'sobre';
  if (!enCama && !sobre) return null;
  const clave = metadata?.[enCama ? 'cama' : 'mueble'];
  const mueble = typeof clave === 'string' && clave ? muebles.get(clave) : undefined;
  if (!mueble || !Number.isFinite(mueble.x) || !Number.isFinite(mueble.y)) return null;

  const [ax, ay] = anclaDelArte(mueble.ficha);
  const origen = { x: Math.round(mueble.x) - ax, y: Math.round(mueble.y) - ay };
  const cama = enCama ? CAMAS.get(mueble.clave) : undefined;
  let dibujo: Punto;
  if (cama) {
    const x = mueble.espejo ? mueble.ficha.ancho - cama.cabeza.x : cama.cabeza.x;
    dibujo = { x: origen.x + x, y: origen.y + cama.cabeza.y };
  } else {
    const tablero = sobre ? TABLEROS.get(mueble.clave) : undefined;
    if (!tablero || !Number.isFinite(obj.x) || !Number.isFinite(obj.y)) return null;
    dibujo = { x: Math.round(obj.x), y: Math.round(obj.y) };
    if (dibujo.x < origen.x + 4 || dibujo.x > origen.x + mueble.ficha.ancho - 5
      || dibujo.y < origen.y + tablero[0] || dibujo.y > origen.y + tablero[1]) return null;
  }
  const apoyo = { mueble, dibujo, llegada: dibujo, cama };
  apoyo.llegada = bordesDelMueble(apoyo)[0];
  return apoyo;
}

export function cuadroDeRespiracion(ms: number, reducido: boolean): number {
  return !reducido && ms % 2500 >= 1850 ? 1 : 0;
}

/** Dos cuadros pixel a pixel. Solo el pliegue y el volumen del pecho se desplazan. */
export function cobijaDeCama(cama: Cama): RgbaImage {
  const { ancho, alto } = cama.cobija;
  const width = ancho * 2;
  const rgba = new Uint8Array(width * alto * 4);
  const [tela, claro, sombra] = cama.colores;
  for (let cuadro = 0; cuadro < 2; cuadro++) {
    const tramo = (x: number, y: number, largo: number, color: number) => {
      for (let px = x; px < x + largo; px++) {
        const i = (y * width + cuadro * ancho + px) * 4;
        rgba.set([color >> 16, (color >> 8) & 255, color & 255, 255], i);
      }
    };
    if (cama.horizontal) {
      tramo(11, 2 - cuadro, 23, claro);
      tramo(9, 3 - cuadro, 31, tela);
      tramo(7, 4 - cuadro, 37, tela);
      tramo(5, 5 - cuadro, 42, tela);
      tramo(4, 6 - cuadro, 48, tela);
      for (let y = 7 - cuadro; y < 12; y++) {
        const x = y < 9 ? 2 : 0;
        tramo(x, y, y < 8 ? 56 : ancho - x - 1, tela);
      }
      tramo(2, 12, ancho - 3, sombra);
      tramo(5, 13, ancho - 7, sombra);
      // Doblez en diagonal, con un borde oscuro debajo del hilo claro.
      for (let y = 3 - cuadro; y < 12; y++) {
        const x = 18 - y;
        tramo(x, y, 4, claro);
        tramo(x + 4, y, 2, sombra);
      }
      tramo(25, 5 - cuadro, 10, claro);
      tramo(34, 6 - cuadro, 12, claro);
    } else {
      tramo(4, 2 - cuadro, ancho - 8, claro);
      tramo(2, 3 - cuadro, ancho - 4, claro);
      tramo(1, 4 - cuadro, ancho - 2, sombra);
      for (let y = 5 - cuadro; y < alto - 1; y++) {
        const margen = 1 + Math.floor(y / 7);
        tramo(margen, y, ancho - 2 * margen, tela);
        tramo(margen, y, 1, claro);
        tramo(ancho - margen - 2, y, 2, sombra);
      }
      tramo(4, alto - 1, ancho - 8, sombra);
    }
  }
  return { width, height: alto, rgba };
}
