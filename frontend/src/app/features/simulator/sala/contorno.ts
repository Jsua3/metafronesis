import Phaser from 'phaser';
import { alfaDelCuadro } from './alfa-del-cuadro';
import type { Punto } from '../caso/acompanantes';

type Sprite = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
type Figura = Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
type Parte = Sprite | Figura;
type Tramo = [x: number, y: number, ancho: number];

interface Mascara {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  opaco(x: number, y: number): boolean;
}

/** Píxeles transparentes que tocan un píxel opaco por un lado, agrupados en tramos horizontales. */
export function bordeDeUnPixel(mascaras: readonly Mascara[]): Tramo[] {
  if (!mascaras.length) return [];
  const izquierda = Math.min(...mascaras.map(m => m.x)) - 1;
  const arriba = Math.min(...mascaras.map(m => m.y)) - 1;
  const ancho = Math.max(...mascaras.map(m => m.x + m.ancho)) - izquierda + 1;
  const alto = Math.max(...mascaras.map(m => m.y + m.alto)) - arriba + 1;
  const union = new Uint8Array(ancho * alto);
  for (const m of mascaras) {
    for (let y = 0; y < m.alto; y++) {
      for (let x = 0; x < m.ancho; x++) {
        if (m.opaco(x, y)) union[(m.y - arriba + y) * ancho + m.x - izquierda + x] = 1;
      }
    }
  }
  const borde: Tramo[] = [];
  for (let y = 0; y < alto; y++) {
    let inicio = -1;
    for (let x = 0; x <= ancho; x++) {
      const i = y * ancho + x;
      const toca = x < ancho && !union[i] && (
        (x > 0 && union[i - 1]) || (x + 1 < ancho && union[i + 1]) || union[i - ancho] || union[i + ancho]
      );
      if (toca && inicio < 0) inicio = x;
      if (!toca && inicio >= 0) {
        borde.push([izquierda + inicio, arriba + y, x - inicio]);
        inicio = -1;
      }
    }
  }
  return borde;
}

function esSprite(parte: Phaser.GameObjects.GameObject): parte is Sprite {
  return parte instanceof Phaser.GameObjects.Image || parte instanceof Phaser.GameObjects.Sprite;
}

export function partesDelContorno(dibujo: Phaser.GameObjects.GameObject): Parte[] {
  if (esSprite(dibujo) || dibujo instanceof Phaser.GameObjects.Arc || dibujo instanceof Phaser.GameObjects.Rectangle) return [dibujo];
  if (!(dibujo instanceof Phaser.GameObjects.Container)) return [];
  const sprites = dibujo.list.filter(esSprite);
  if (sprites.length) return sprites;
  const base = dibujo.list.find(p => (p instanceof Phaser.GameObjects.Arc || p instanceof Phaser.GameObjects.Rectangle) && p.isStroked);
  return base ? [base as Figura] : [];
}

const alfas = new WeakMap<Phaser.Textures.Frame, ReturnType<typeof alfaDelCuadro>>();

function mascaraDe(parte: Parte, origen: Punto, escalaX: number, escalaY: number): Mascara | null {
  const sx = parte.scaleX * escalaX;
  const sy = parte.scaleY * escalaY;
  if (esSprite(parte)) {
    if (!alfas.has(parte.frame)) alfas.set(parte.frame, alfaDelCuadro(parte, false));
    const alfa = alfas.get(parte.frame);
    if (!alfa) return null;
    const crop = parte.isCropped && (parte as Sprite & { _crop: { x: number; y: number; width: number; height: number } })._crop;
    const inicioX = crop ? crop.x : 0, inicioY = crop ? crop.y : 0;
    const x = Math.round(origen.x + (inicioX - parte.displayOriginX) * sx);
    const y = Math.round(origen.y + (inicioY - parte.displayOriginY) * sy);
    const ancho = Math.round((crop ? crop.width : alfa.w) * sx);
    const alto = Math.round((crop ? crop.height : alfa.h) * sy);
    return { x, y, ancho, alto, opaco: (dx, dy) => {
      const px = inicioX + Math.floor((dx + .5) / sx);
      const py = inicioY + Math.floor((dy + .5) / sy);
      return alfa.datos[(parte.flipY ? alfa.h - 1 - py : py) * alfa.w + (parte.flipX ? alfa.w - 1 - px : px)] >= 128;
    } };
  }
  const rx = (parte.width + (parte.isStroked ? parte.lineWidth : 0)) * sx / 2;
  const ry = (parte.height + (parte.isStroked ? parte.lineWidth : 0)) * sy / 2;
  const ancho = Math.round(rx * 2), alto = Math.round(ry * 2);
  return { x: Math.round(origen.x - rx), y: Math.round(origen.y - ry), ancho, alto,
    opaco: (x, y) => !(parte instanceof Phaser.GameObjects.Arc)
      || ((x + .5 - rx) / rx) ** 2 + ((y + .5 - ry) / ry) ** 2 <= 1 };
}

const COLOR_CONTORNO = 0xcdbcff;

export class ContornoDeDibujo {
  private firma = '';
  private readonly cuadros = new Map<string, Tramo[]>();
  readonly dibujo: Phaser.GameObjects.Graphics;

  constructor(escena: Phaser.Scene, private readonly partes: readonly Parte[]) {
    this.dibujo = escena.add.graphics().setVisible(false);
  }

  actualizar(base: Phaser.GameObjects.Container | Sprite): void {
    const { scaleX, scaleY } = base;
    const firma = this.partes.map(parte => esSprite(parte)
      ? `${parte.frame.texture.key}:${parte.frame.name}:${+parte.flipX}:${+parte.flipY}`
      : parte.type).join('|') + `:${scaleX}:${scaleY}`;
    if (firma !== this.firma) {
      this.firma = firma;
      let tramos = this.cuadros.get(firma);
      if (!tramos) {
        const mascaras = this.partes.flatMap(parte => {
          const padre = parte.parentContainer;
          const anidada = padre && padre !== base;
          const origen = parte === base ? { x: 0, y: 0 } : {
            x: ((anidada ? padre.x : 0) + parte.x) * scaleX,
            y: ((anidada ? padre.y : 0) + parte.y) * scaleY,
          };
          const mascara = mascaraDe(parte, origen, parte === base ? 1 : scaleX, parte === base ? 1 : scaleY);
          return mascara ? [mascara] : [];
        });
        tramos = bordeDeUnPixel(mascaras);
        this.cuadros.set(firma, tramos);
      }
      this.dibujo.clear().fillStyle(COLOR_CONTORNO);
      for (const [x, y, ancho] of tramos) this.dibujo.fillRect(x, y, ancho, 1);
    }
    const x = Math.round(base.x), y = Math.round(base.y);
    if (this.dibujo.x !== x || this.dibujo.y !== y) this.dibujo.setPosition(x, y);
    // Bajo el dibujo para conservar la oclusión natural de muebles y actores.
    if (this.dibujo.depth !== base.depth - .0001) this.dibujo.setDepth(base.depth - .0001);
    this.dibujo.setVisible(true);
  }
}
