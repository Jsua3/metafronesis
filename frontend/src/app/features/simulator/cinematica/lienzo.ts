/**
 * El lienzo de la cinemática: pinta un `CuadroDeCinematica` (de `escenas.ts`) con el arte del juego.
 *
 * - El lienzo trabaja en PÍXELES DEL ARTE: su resolución es la de la vista en píxeles del decorado y el navegador lo agranda
 *   a una escala entera de píxeles físicos (`medirVista`), con `image-rendering: pixelated`. Así cada píxel del arte mide lo
 *   mismo en toda la pantalla y nada se suaviza.
 * - La cámara se mueve con suavidad sin romper la rejilla: el lienzo trae un píxel de margen y lo que sobra de la posición
 *   (la fracción) se lo da al componente para correrlo con CSS, en píxeles físicos enteros.
 * - Los decorados se componen una vez (`decorados.ts`, por software, con la luz de las salas). Encima, cada cuadro: la
 *   ventana encendida con sus siluetas, las personas del kit teñidas por la luz de donde pisan (y su sombra), la camilla,
 *   las luces de emergencia y la viñeta.
 * - Si algo no carga (sin red, un archivo que falta) no se rompe: el decorado que falta se pinta con un fondo de respaldo
 *   del mismo momento, y lo que falta de una persona simplemente no se dibuja. Los subtítulos siguen.
 */
import { MANIFIESTO_DE_PIEZAS_URL, esManifiestoDePiezas, urlDePieza } from '../sala/catalogo';
import type { ManifiestoDePiezas } from '../sala/catalogo';
import type { Imagen } from '../sala/pintor';
import { FRAME, VIEW_ROWS } from '../../character/kit/kit-engine';
import { KIT_ASSETS } from '../../character/kit/character-visual.resolver';
import { pintarDecorado, rutasDelDecorado, luzEn } from './decorados';
import type { ClaveDeDecorado, DecoradoPintado } from './decorados';
import { decoradoDelPlano, recetasDelPlano } from './escenas';
import { cuartoEncendido, hazDeBaliza, reflejoDeVidrio, resplandor, vinetaTramada } from './pixeles';
import { SEAM } from '../sala/geometria';
import type { ActorEnCuadro, CuadroDeCinematica, MuebleEnCuadro } from './escenas';
import type { PlanoLeido } from './lectura';

/** Lo que mide la vista en píxeles del arte y a cuántos píxeles físicos equivale cada uno. */
export interface MedidaDeVista {
  /** Píxeles físicos por píxel del arte (entero ≥ 1). */
  k: number;
  dpr: number;
  ancho: number;
  alto: number;
}

/** Ancho de arte que se busca: muestra dos tercios de una sala de 960 (las personas se ven de cerca, como en el cine). */
const ANCHO_BUSCADO = 680;

/** La escala entera y el tamaño en píxeles del arte para una banda de `anchoCss × altoCss`. Pura. */
export function medirVista(anchoCss: number, altoCss: number, dpr: number): MedidaDeVista {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const css = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  const w = Math.max(1, Math.round(css(anchoCss) * d));
  const h = Math.max(1, Math.round(css(altoCss) * d));
  const k = Math.max(1, Math.round(w / ANCHO_BUSCADO));
  return { k, dpr: d, ancho: Math.ceil(w / k), alto: Math.ceil(h / k) };
}

/** El negro del cine del juego (`--pixel-cine`): lo que se ve donde no hay decorado. */
const NEGRO = '#0b0a12';
/** Fondos de respaldo (sin arte): cielo, pared y piso de cada momento. */
const RESPALDO: Record<ClaveDeDecorado, readonly [string, string, string]> = {
  'calle:tarde': ['#a3889a', '#a77a5c', '#6e6258'],
  'calle:noche': ['#161a30', '#2b2c3e', '#25262f'],
  'urgencias:noche': ['#0e1016', '#46606a', '#5a6870'],
};

interface Hojas { idle: CanvasImageSource; walk: CanvasImageSource }

/** Un lienzo auxiliar 2D (nunca falla: sin contexto, devuelve null y quien lo pide no dibuja). */
function lienzo(ancho: number, alto: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, ancho);
  canvas.height = Math.max(1, alto);
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No cargó ${url}`));
    img.src = url;
  });
}

/** Los píxeles de una imagen ya cargada (mismo origen: no ensucia el lienzo). */
function pixelesDe(img: HTMLImageElement): Imagen | null {
  const l = lienzo(img.naturalWidth, img.naturalHeight);
  if (!l) return null;
  l.ctx.drawImage(img, 0, 0);
  return { ancho: img.naturalWidth, alto: img.naturalHeight, rgba: l.ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data };
}

function aLienzo(imagen: Imagen): HTMLCanvasElement | null {
  const l = lienzo(imagen.ancho, imagen.alto);
  if (!l) return null;
  l.ctx.putImageData(new ImageData(new Uint8ClampedArray(imagen.rgba), imagen.ancho, imagen.alto), 0, 0);
  return l.canvas;
}

/** Espera al navegador entre composiciones pesadas: el subtítulo y los botones siguen respondiendo. */
const respirar = () => new Promise<void>(resolve => setTimeout(resolve, 0));

interface DecoradoListo {
  datos: DecoradoPintado;
  fondo: HTMLCanvasElement;
  derrame: HTMLCanvasElement | null;
  /** La máscara del cristal como lienzo (blanco opaco donde hay cristal), para recortar el interior. */
  mascara: HTMLCanvasElement | null;
}

export class LienzoDeCinematica {
  private readonly ctx: CanvasRenderingContext2D | null;
  private medida: MedidaDeVista = { k: 1, dpr: 1, ancho: 640, alto: 268 };
  private readonly decorados = new Map<ClaveDeDecorado, DecoradoListo>();
  private readonly hojas = new Map<string, Hojas>();
  private camilla: HTMLImageElement | null = null;
  private capa: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private vineta: HTMLCanvasElement | null = null;
  private readonly figura = lienzo(FRAME.width, FRAME.height);
  private interior: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  /** Las capas de luz por escalones (`pixeles.ts`), compuestas una vez y reutilizadas en cada cuadro. */
  private readonly capasDeLuz = new Map<string, HTMLCanvasElement | null>();
  private mueble: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private forma: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  private destruido = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly base = '') {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', { alpha: false });
    } catch {
      ctx = null;
    }
    this.ctx = ctx;
    if (ctx) ctx.imageSmoothingEnabled = false;
  }

  /** ¿Se puede pintar? (sin contexto 2D, como en jsdom, el reproductor sigue con los subtítulos sobre negro). */
  get disponible(): boolean { return this.ctx !== null; }

  /**
   * Pide y compone lo que necesitan los planos: el manifiesto de piezas, las imágenes de cada decorado, las hojas del kit y
   * la camilla. Cada cosa por su lado: lo que falla no detiene lo demás. `primero` se avisa cuando el decorado del primer
   * plano está listo (para no esperar a todos antes de empezar).
   */
  async preparar(planos: readonly PlanoLeido[], primero?: () => void): Promise<void> {
    const claves = [...new Set(planos.map(decoradoDelPlano))]
      .filter((c): c is ClaveDeDecorado => c === 'calle:tarde' || c === 'calle:noche' || c === 'urgencias:noche');
    const recetas = [...new Set(planos.flatMap(recetasDelPlano))];
    const kit = Promise.all(recetas.map(r => this.cargarHojas(r)));
    if (planos.some(p => p.escena === 'urgencias-llegada')) {
      cargarImagen(`${this.base}${urlDePieza('piezas/muebles/hospital/camilla.png')}`).then(img => { this.camilla = img; }, () => undefined);
    }
    let manifiesto: ManifiestoDePiezas | null = null;
    try {
      const respuesta = await fetch(`${this.base}${MANIFIESTO_DE_PIEZAS_URL}`);
      const json: unknown = respuesta.ok ? await respuesta.json() : null;
      manifiesto = esManifiestoDePiezas(json) ? json : null;
    } catch {
      manifiesto = null;
    }
    if (manifiesto && !this.destruido) {
      const imagenes = new Map<string, Imagen>();
      for (const clave of claves) {
        let rutas: string[];
        try {
          rutas = rutasDelDecorado(clave, manifiesto);
        } catch {
          continue;
        }
        await Promise.all(rutas.filter(r => !imagenes.has(r)).map(r => cargarImagen(`${this.base}${urlDePieza(r)}`)
          .then(img => { const px = pixelesDe(img); if (px) imagenes.set(r, px); }, () => undefined)));
        if (this.destruido) return;
        await respirar();
        try {
          this.guardarDecorado(pintarDecorado(clave, manifiesto, imagenes));
        } catch {
          // Sin este decorado: se pinta su respaldo.
        }
        if (clave === claves[0]) primero?.();
      }
    }
    primero?.();
    await kit;
  }

  private guardarDecorado(datos: DecoradoPintado): void {
    const fondo = aLienzo(datos.imagen);
    if (!fondo) return;
    let mascara: HTMLCanvasElement | null = null;
    if (datos.vidrio) {
      const v = datos.vidrio, l = lienzo(v.w, v.h);
      if (l) {
        const img = l.ctx.createImageData(v.w, v.h);
        for (let i = 0; i < v.mascara.length; i++) if (v.mascara[i]) img.data.set([255, 255, 255, 255], i * 4);
        l.ctx.putImageData(img, 0, 0);
        mascara = l.canvas;
      }
    }
    this.decorados.set(datos.clave, { datos, fondo, derrame: datos.derrame ? aLienzo(datos.derrame) : null, mascara });
  }

  private async cargarHojas(receta: string): Promise<void> {
    try {
      const [idle, walk] = await Promise.all(['idle', 'walk'].map(h => cargarImagen(`${this.base}${KIT_ASSETS}/${receta}/${h}.png`)));
      this.hojas.set(receta, { idle, walk });
    } catch {
      // Sin su hoja, esa persona no se dibuja; la escena sigue.
    }
  }

  /** Ajusta la resolución del lienzo a la vista (más un píxel de margen por lado para el paneo suave). */
  ajustar(medida: MedidaDeVista): void {
    this.medida = medida;
    const w = medida.ancho + 2, h = medida.alto + 2;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    this.capa = lienzo(w, h);
    this.vineta = this.pintarVineta(w, h);
  }

  get vista(): { ancho: number; alto: number } {
    return { ancho: this.medida.ancho, alto: this.medida.alto };
  }

  /**
   * Pinta el cuadro (y, durante un fundido, el anterior debajo). Devuelve la fracción de píxel de la cámara del cuadro
   * actual, en píxeles del lienzo, para que el componente la corra con CSS.
   */
  pintar(actual: CuadroDeCinematica, anterior: CuadroDeCinematica | null, mezcla: number): { dx: number; dy: number } {
    if (!this.ctx || this.destruido) return { dx: 0, dy: 0 };
    if (anterior && mezcla < 1 && this.capa) {
      this.pintarCuadro(this.ctx, anterior);
      const fraccion = this.pintarCuadro(this.capa.ctx, actual);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = Math.max(0, mezcla);
      this.ctx.drawImage(this.capa.canvas, 0, 0);
      this.ctx.globalAlpha = 1;
      return fraccion;
    }
    return this.pintarCuadro(this.ctx, actual);
  }

  destruir(): void {
    this.destruido = true;
    this.decorados.clear();
    this.hojas.clear();
  }

  // ── Un cuadro ──────────────────────────────────────────────────────────────────────────────────────────────────────

  private pintarCuadro(ctx: CanvasRenderingContext2D, cuadro: CuadroDeCinematica): { dx: number; dy: number } {
    const W = this.medida.ancho + 2, H = this.medida.alto + 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = NEGRO;
    ctx.fillRect(0, 0, W, H);
    if (cuadro.decorado === 'negro') return { dx: 0, dy: 0 };
    if (cuadro.decorado === 'titulo') {
      if (this.vineta) ctx.drawImage(this.vineta, 0, 0);
      return { dx: 0, dy: 0 };
    }
    const clave = `${cuadro.decorado}:${cuadro.momento}` as ClaveDeDecorado;
    const listo = this.decorados.get(clave) ?? null;
    const anchoDec = listo?.datos.ancho ?? (cuadro.decorado === 'calle' ? 1920 : 1200);
    const altoDec = listo?.datos.alto ?? 528;
    const z = cuadro.camara.zoom;
    const vw = this.medida.ancho / z, vh = this.medida.alto / z;
    const cerca = (c: number, v: number, total: number) => total <= v ? (total - v) / 2 : Math.min(total - v, Math.max(0, c - v / 2));
    const izq = cerca(cuadro.camara.x, vw, anchoDec), arr = cerca(cuadro.camara.y, vh, altoDec);
    const px = izq * z, py = arr * z;
    const ix = Math.floor(px), iy = Math.floor(py);
    // Decorado → lienzo: x·z − ix + 1 (el píxel 0 del lienzo es el margen).
    ctx.setTransform(z, 0, 0, z, 1 - ix, 1 - iy);
    if (listo) ctx.drawImage(listo.fondo, 0, 0);
    else this.pintarRespaldo(ctx, clave, anchoDec, altoDec);
    if (cuadro.ventana && listo?.datos.vidrio) this.pintarVentana(ctx, listo, cuadro);
    const cosas: ({ y: number; actor: ActorEnCuadro } | { y: number; mueble: MuebleEnCuadro })[] = [
      ...cuadro.actores.map(actor => ({ y: actor.y, actor })),
      ...cuadro.muebles.map(mueble => ({ y: mueble.y, mueble })),
    ].sort((a, b) => a.y - b.y);
    for (const cosa of cosas) {
      if ('actor' in cosa) this.pintarActor(ctx, cosa.actor, listo, cuadro.momento);
      else this.pintarMueble(ctx, cosa.mueble, listo);
    }
    this.pintarLuces(ctx, cuadro, izq, arr, vw, vh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.vineta) ctx.drawImage(this.vineta, 0, 0);
    return { dx: px - ix, dy: py - iy };
  }

  private pintarRespaldo(ctx: CanvasRenderingContext2D, clave: ClaveDeDecorado, ancho: number, alto: number): void {
    const [cielo, pared, piso] = RESPALDO[clave];
    const interior = clave.startsWith('urgencias');
    ctx.fillStyle = cielo;
    ctx.fillRect(0, 0, ancho, 84);
    ctx.fillStyle = pared;
    ctx.fillRect(interior ? 24 : 0, interior ? 80 : 40, interior ? ancho - 48 : ancho, interior ? 150 : 190);
    ctx.fillStyle = piso;
    ctx.fillRect(0, 230, ancho, alto - 230);
  }

  /** El interior encendido de la ventana (luz cálida y, delante, las siluetas), recortado por su cristal, y su derrame. */
  private pintarVentana(ctx: CanvasRenderingContext2D, listo: DecoradoListo, cuadro: CuadroDeCinematica): void {
    const v = listo.datos.vidrio!, ventana = cuadro.ventana!;
    if (ventana.luz <= 0 || !listo.mascara) return;
    if (!this.interior || this.interior.canvas.width !== v.w || this.interior.canvas.height !== v.h) this.interior = lienzo(v.w, v.h);
    const l = this.interior;
    if (!l) return;
    const c = l.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, v.w, v.h);
    // El cuarto encendido (lámpara colgada, cuadro en la pared, mueble a contraluz), por escalones tramados.
    const momento = cuadro.momento === 'tarde' ? 'tarde' : 'noche';
    const cuarto = this.capa_(`cuarto:${v.w}x${v.h}:${momento}`, () => cuartoEncendido(v.w, v.h, momento));
    if (cuarto) c.drawImage(cuarto, 0, 0);
    // Las siluetas, negras con un borde apenas cálido: la luz está detrás de ellas.
    for (const s of ventana.siluetas) {
      const figura = this.silueta(s, '#120c0e');
      if (figura) c.drawImage(figura, s.x - v.x - FRAME.pivotX, s.y - v.y - FRAME.pivotY);
    }
    // El reflejo del vidrio: dos rayas diagonales de píxel, apenas visibles.
    const reflejo = this.capa_(`reflejo:${v.w}x${v.h}`, () => reflejoDeVidrio(v.w, v.h));
    if (reflejo) c.drawImage(reflejo, 0, 0);
    // Solo el cristal: los parteluces, el marco y las cortinas quedan del decorado.
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(listo.mascara, 0, 0);
    c.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, ventana.luz);
    ctx.drawImage(l.canvas, v.x, v.y);
    if (cuadro.momento === 'noche' && listo.derrame) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(listo.derrame, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /** El cuadro de una persona del kit como figura de un solo color (silueta o sombra). */
  private silueta(actor: ActorEnCuadro, color: string): HTMLCanvasElement | null {
    const hojas = this.hojas.get(actor.receta), f = this.figura;
    if (!hojas || !f) return null;
    const c = f.ctx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, FRAME.width, FRAME.height);
    this.dibujarCuadro(c, hojas, actor);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, FRAME.width, FRAME.height);
    c.globalCompositeOperation = 'source-over';
    return f.canvas;
  }

  private dibujarCuadro(c: CanvasRenderingContext2D, hojas: Hojas, actor: ActorEnCuadro): void {
    const fila = Math.max(0, VIEW_ROWS.indexOf(actor.vista));
    c.drawImage(hojas[actor.hoja], actor.cuadro * FRAME.width, fila * FRAME.height, FRAME.width, FRAME.height, 0, 0, FRAME.width, FRAME.height);
  }

  private pintarActor(ctx: CanvasRenderingContext2D, actor: ActorEnCuadro, listo: DecoradoListo | null, momento: string): void {
    const hojas = this.hojas.get(actor.receta), f = this.figura;
    if (!hojas || !f) return;
    const x = actor.x - FRAME.pivotX, y = actor.y - FRAME.pivotY;
    // La sombra larga de la tarde: la silueta tendida hacia la derecha y aplastada sobre el andén (el sol bajo, a la
    // izquierda). Si no, la de contacto: una mancha tramada bajo los pies.
    if (actor.sombraLarga) {
      const sombra = this.silueta(actor, '#2a2240');
      if (sombra) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        // (u, v) del cuadro con el pie en el origen → (u − 1,45·v, −0,17·v): larga, plana y hacia la derecha.
        ctx.transform(1, 0, -1.45, -0.17, actor.x, actor.y);
        ctx.drawImage(sombra, -FRAME.pivotX, -FRAME.pivotY);
        ctx.restore();
      }
    } else {
      ctx.globalAlpha = momento === 'noche' ? 0.42 : 0.3;
      ctx.fillStyle = NEGRO;
      for (const [dx, dy, w] of [[-9, -1, 18], [-11, 0, 22], [-8, 1, 16]] as const) ctx.fillRect(actor.x + dx, actor.y + dy, w, 1);
      ctx.globalAlpha = 1;
    }
    // La figura teñida por la luz de donde pisa: se multiplica y se recorta por su propio dibujo.
    const c = f.ctx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, FRAME.width, FRAME.height);
    this.dibujarCuadro(c, hojas, actor);
    if (listo) {
      const [r, g, b] = luzEn(listo.datos, actor.x, actor.y - 4);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgb(${r}, ${g}, ${b})`;
      c.fillRect(0, 0, FRAME.width, FRAME.height);
      c.globalCompositeOperation = 'destination-in';
      this.dibujarCuadro(c, hojas, actor);
      c.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(f.canvas, x, y);
  }

  private pintarMueble(ctx: CanvasRenderingContext2D, mueble: MuebleEnCuadro, listo: DecoradoListo | null): void {
    const img = this.camilla;
    if (!img) return;
    const w = img.naturalWidth || 98, h = img.naturalHeight || 44;
    if (!this.mueble || this.mueble.canvas.width !== w || this.mueble.canvas.height !== h) {
      this.mueble = lienzo(w, h);
      this.forma = lienzo(w, h);
    }
    const l = this.mueble, forma = this.forma;
    if (!l || !forma) return;
    const x = Math.round(mueble.x - w / 2), y = Math.round(mueble.y - h);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = NEGRO;
    ctx.fillRect(x + 4, mueble.y - 1, w - 8, 2);
    ctx.globalAlpha = 1;
    // La camilla y, si va alguien, su manta, en un lienzo propio: así se tiñe sin tocar lo que hay alrededor.
    const f = forma.ctx;
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, w, h);
    f.drawImage(img, 0, 0);
    if (mueble.manta) {
      // Alguien va acostado, cubierto: cabello en la almohada y la manta sobre el colchón. Sin rostro ni heridas.
      f.fillStyle = '#2b1d1a';
      f.fillRect(12, 5, 9, 4);
      f.fillStyle = '#7f95ad';
      f.fillRect(30, 4, 54, 7);
      f.fillRect(34, 3, 40, 1);
      f.fillStyle = '#a9bccd';
      f.fillRect(34, 4, 38, 2);
      f.fillStyle = '#5f7088';
      f.fillRect(30, 10, 54, 1);
    }
    if (!listo) {
      ctx.drawImage(forma.canvas, x, y);
      return;
    }
    // Lo mismo que las personas: la luz de donde está.
    const c = l.ctx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.drawImage(forma.canvas, 0, 0);
    const [r, g, b] = luzEn(listo.datos, mueble.x, mueble.y - 4);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgb(${r}, ${g}, ${b})`;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(forma.canvas, 0, 0);
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(l.canvas, x, y);
  }

  /** Luces de emergencia: rojo y azul sobre las paredes (en la calle) o el rojo que entra por la izquierda (urgencias). */
  private pintarLuces(ctx: CanvasRenderingContext2D, cuadro: CuadroDeCinematica, izq: number, arr: number, vw: number, vh: number): void {
    const { rojo, azul, barrido } = cuadro.luces;
    if (rojo <= 0.01 && azul <= 0.01) return;
    // La luz se SUMA (lighter) y su fuerza va por escalones de un cuarto: nada de transparencias continuas.
    const escalonada = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 4) / 4;
    ctx.globalCompositeOperation = 'lighter';
    if (cuadro.decorado === 'calle') {
      const ancho = Math.max(16, Math.round(vw * 0.42));
      const alto = this.decorados.get(`calle:${cuadro.momento}` as ClaveDeDecorado)?.datos.alto ?? 528;
      const hazRojo = this.capa_(`haz-rojo:${ancho}x${alto}`, () => hazDeBaliza(ancho, alto, [255, 46, 58], SEAM));
      const hazAzul = this.capa_(`haz-azul:${ancho}x${alto}`, () => hazDeBaliza(ancho, alto, [58, 104, 255], SEAM));
      if (barrido === undefined) {
        // Quieto (movimiento reducido): un tinte rojo a la izquierda y uno azul a la derecha.
        ctx.globalAlpha = escalonada(rojo) * 0.5;
        if (hazRojo) ctx.drawImage(hazRojo, Math.round(izq + vw * 0.12 - ancho / 2), 0);
        ctx.globalAlpha = escalonada(azul) * 0.5;
        if (hazAzul) ctx.drawImage(hazAzul, Math.round(izq + vw * 0.88 - ancho / 2), 0);
      } else {
        // Las balizas giran: el haz rojo barre la fachada de izquierda a derecha y el azul, medio giro después, de
        // derecha a izquierda. Siempre hay un poco de los dos (el reflejo en las paredes de enfrente).
        const recorrido = vw + ancho;
        const xr = Math.round(izq - ancho + recorrido * barrido);
        const xb = Math.round(izq + vw - recorrido * ((barrido + 0.5) % 1));
        ctx.globalAlpha = escalonada(rojo) * 0.75;
        if (hazRojo) ctx.drawImage(hazRojo, xr, 0);
        ctx.globalAlpha = escalonada(azul) * 0.75;
        if (hazAzul) ctx.drawImage(hazAzul, xb, 0);
        ctx.globalAlpha = escalonada(Math.min(rojo, azul)) * 0.25;
        if (hazRojo) ctx.drawImage(hazRojo, Math.round(izq + vw * 0.05 - ancho / 2), 0);
        if (hazAzul) ctx.drawImage(hazAzul, Math.round(izq + vw * 0.95 - ancho / 2), 0);
      }
    } else {
      // Urgencias: el rojo de la ambulancia que quedó afuera entra por la izquierda, a escalones.
      const radio = Math.max(24, Math.round(vw * 0.7));
      const charco = this.capa_(`resplandor:${radio}`, () => resplandor(radio, [255, 40, 46]));
      ctx.globalAlpha = escalonada(rojo) * 0.6;
      if (charco) ctx.drawImage(charco, 40 - radio, 300 - radio);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Una capa de luz compuesta una sola vez (y reutilizada); null si no hay lienzo (jsdom). */
  private capa_(clave: string, crear: () => Imagen): HTMLCanvasElement | null {
    if (!this.capasDeLuz.has(clave)) this.capasDeLuz.set(clave, typeof document === 'undefined' ? null : aLienzo(crear()));
    return this.capasDeLuz.get(clave) ?? null;
  }

  /** Viñeta del cine: las esquinas se oscurecen un poco, el centro queda limpio. */
  private pintarVineta(w: number, h: number): HTMLCanvasElement | null {
    const l = lienzo(w, h);
    if (!l) return null;
    const vineta = aLienzo(vinetaTramada(w, h));
    if (vineta) l.ctx.drawImage(vineta, 0, 0);
    return l.canvas;
  }
}
