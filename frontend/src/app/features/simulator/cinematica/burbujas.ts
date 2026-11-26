import type { BurbujaEnCuadro } from './escenas';

const TINTA = '#281c18';
const PAPEL = '#f0eadc';

type Punto = { x: number; y: number };

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

function partirLineas(ctx: CanvasRenderingContext2D, texto: string, limite: number): string[] {
  const lineas: string[] = [];
  let linea = '';
  for (const palabra of texto.split(/\s+/)) {
    const junta = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(junta).width <= limite) {
      linea = junta;
      continue;
    }
    if (linea) lineas.push(linea);
    linea = '';
    for (const letra of palabra) {
      if (linea && ctx.measureText(linea + letra).width > limite) {
        lineas.push(linea);
        linea = '';
      }
      linea += letra;
    }
  }
  if (linea) lineas.push(linea);
  return lineas;
}

/** Placa de papel y cola escalonada con la misma paleta que el comentario sobre el NPC. */
function placa(ctx: CanvasRenderingContext2D, w: number, h: number, grito: boolean): void {
  const saliente = grito ? 2 : 0;
  ctx.fillStyle = TINTA;
  ctx.fillRect(2, saliente, w - 4, h - 2 * saliente);
  ctx.fillRect(0, saliente + 2, w, h - 4 - 2 * saliente);
  if (grito) {
    for (let x = 5; x < w - 6; x += 7) {
      ctx.fillRect(x, 1, 4, 2);
      ctx.fillRect(x + 1, 0, 2, 2);
      ctx.fillRect(x + 1, h - 3, 4, 2);
      ctx.fillRect(x + 2, h - 2, 2, 2);
    }
  }
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(2, saliente + 2, w - 4, h - 4 - 2 * saliente);
  ctx.fillStyle = '#c6beb2';
  ctx.fillRect(3, h - saliente - 4, w - 6, 2);
  ctx.fillStyle = PAPEL;
  ctx.fillRect(3, saliente + 3, w - 6, h - 7 - 2 * saliente);
  for (let y = saliente + 4; y < h - saliente - 4; y += 4) {
    for (let x = 4 + y % 3; x < w - 4; x += 6) {
      ctx.fillStyle = x % 4 ? '#f7f3e8' : '#e7e0d0';
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function cola(ctx: CanvasRenderingContext2D, x: number, y: number, punta: Punto): void {
  const h = punta.y - y;
  for (let fila = 0; fila <= h; fila++) {
    const centro = Math.round(x + (punta.x - x) * fila / h);
    const borde = Math.max(0, Math.round(3 * (1 - fila / h)));
    ctx.fillStyle = TINTA;
    ctx.fillRect(centro - borde, y + fila, 1 + 2 * borde, 1);
    if (borde > 0 && fila < h - 1) {
      ctx.fillStyle = PAPEL;
      ctx.fillRect(centro - borde + 1, y + fila, 2 * borde - 1, 1);
    }
  }
}

function signosDeGrito(ctx: CanvasRenderingContext2D, cabeza: Punto, zoom: number): void {
  ctx.save();
  ctx.translate(cabeza.x, cabeza.y);
  ctx.scale(zoom, zoom);
  for (const x of [-15, 13]) {
    const lado = Math.sign(x);
    ctx.fillStyle = TINTA;
    ctx.fillRect(x - 1, -1, 4, 10);
    ctx.fillStyle = '#ffdfab';
    ctx.fillRect(x, 0, 2, 5);
    ctx.fillRect(x, 7, 2, 1);
    ctx.fillStyle = '#ffd087';
    ctx.fillRect(x + 5 * lado, -2, 2, 1);
    ctx.fillRect(x + 6 * lado, -3, 2, 1);
    ctx.fillRect(x + 5 * lado, 5, 3, 1);
  }
  ctx.restore();
}

function auricular(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = TINTA;
  ctx.fillRect(x - 5, y - 4, 10, 8);
  ctx.fillRect(x - 4, y - 5, 8, 10);
  ctx.fillStyle = '#ffdfab';
  ctx.fillRect(x - 3, y - 3, 3, 2);
  ctx.fillRect(x - 2, y - 1, 2, 2);
  ctx.fillRect(x - 1, y + 1, 3, 2);
  ctx.fillRect(x + 1, y + 2, 2, 2);
}

interface Cartela {
  texto: string;
  grito: boolean;
  imagen: HTMLCanvasElement;
  w: number;
  h: number;
}

/**
 * Segunda capa del lienzo. El marco vive en la misma rejilla que el decorado, y la letra se rasteriza al tamaño
 * físico de lectura. Los glifos tienen alfa binario, igual que los bordes del arte.
 */
export class LienzoDeBurbujas {
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly letras: CanvasRenderingContext2D | null;
  private readonly placa: CanvasRenderingContext2D | null;
  private cartela: Cartela | null = null;
  private dibujada = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    try { this.ctx = canvas.getContext('2d'); } catch { /* Puede faltar el contexto 2D. */ }
    this.letras = this.ctx ? canvas.ownerDocument.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null;
    this.placa = this.ctx ? canvas.ownerDocument.createElement('canvas').getContext('2d') : null;
  }

  ajustar(ancho: number, alto: number, dpr: number): void {
    const canvas = this.canvas;
    if (canvas.width !== ancho || canvas.height !== alto) {
      canvas.width = ancho;
      canvas.height = alto;
      this.cartela = null;
    }
    canvas.style.width = `${ancho / dpr}px`;
    canvas.style.height = `${alto / dpr}px`;
  }

  pintar(burbuja: BurbujaEnCuadro | undefined, origen: Punto, zoom: number, k: number, dpr: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.dibujada) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.dibujada = false;
    if (!burbuja) return;
    const ancho = Math.floor(this.canvas.width / k), alto = Math.floor(this.canvas.height / k);
    const telefono = burbuja.quien === 'telefono';
    const derecha = burbuja.actor.vista === 'right' || burbuja.actor.vista === 'down-right';
    const grito = burbuja.grito === true;
    const cartela = this.cartela?.texto === burbuja.texto && this.cartela.grito === grito
      ? this.cartela : this.prepararCartela(burbuja.texto, grito, ancho - 8, k, dpr);
    this.cartela = cartela;
    if (!cartela || cartela.h + 12 > alto) return;
    const cabeza = {
      x: Math.round(origen.x + (burbuja.actor.x + burbuja.sacudida) * zoom),
      y: Math.round(origen.y + (burbuja.actor.y - 64) * zoom),
    };
    const punta = {
      x: limitar(cabeza.x + (telefono ? (derecha ? 22 : -22) * zoom : 0), 5, ancho - 6),
      y: limitar(cabeza.y + (telefono ? 6 * zoom : -1), 5, alto - 6),
    };
    const { w, h } = cartela;
    const proporcion = telefono ? (derecha ? 0.25 : 0.75) : 0.5;
    const x = limitar(punta.x - Math.floor(w * proporcion), 4, ancho - w - 4);
    const arriba = punta.y >= h + 12;
    const y = arriba ? punta.y - h - 7 : limitar(punta.y + 10, 4, alto - h - 4);
    const base = limitar(punta.x, x + 5, x + w - 6);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (arriba) {
      cola(ctx, base, y + h - 3, punta);
    } else if (y > punta.y + 2) {
      ctx.save();
      ctx.scale(1, -1);
      cola(ctx, base, -y - 2, { x: punta.x, y: -punta.y });
      ctx.restore();
    }
    if (grito) signosDeGrito(ctx, telefono ? punta : cabeza, zoom);
    if (telefono) auricular(ctx, punta.x, punta.y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cartela.imagen, x * k, y * k);
    this.dibujada = true;
  }

  private prepararCartela(texto: string, grito: boolean, maximo: number, k: number, dpr: number): Cartela | null {
    const l = this.letras, p = this.placa;
    if (!l || !p || maximo < 22) return null;
    const tam = Math.max(Math.round(16 * dpr), 7 * k);
    const fuente = `600 ${tam}px Poppins, system-ui, sans-serif`;
    const paso = Math.ceil(tam * 1.32);
    l.font = fuente;
    const lineas = partirLineas(l, texto, Math.min((maximo - 14) * k, 22 * tam));
    const w = Math.ceil(Math.max(...lineas.map(linea => l.measureText(linea).width)) / k) + 14;
    const h = Math.ceil(lineas.length * paso / k) + (grito ? 12 : 8);
    l.canvas.width = p.canvas.width = w * k;
    l.canvas.height = p.canvas.height = h * k;
    l.font = fuente;
    l.fillStyle = TINTA;
    l.textAlign = 'center';
    l.textBaseline = 'middle';
    lineas.forEach((linea, i) => l.fillText(linea, w * k / 2, h * k / 2 + (i - (lineas.length - 1) / 2) * paso));
    const pixeles = l.getImageData(0, 0, l.canvas.width, l.canvas.height);
    for (let a = 3; a < pixeles.data.length; a += 4) pixeles.data[a] = pixeles.data[a] >= 120 ? 255 : 0;
    l.putImageData(pixeles, 0, 0);
    p.setTransform(k, 0, 0, k, 0, 0);
    placa(p, w, h, grito);
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.drawImage(l.canvas, 0, 0);
    return { texto, grito, imagen: p.canvas, w, h };
  }
}
