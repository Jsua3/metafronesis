/**
 * Una sala por piezas dentro de una escena de Phaser: pinta el plan de `composicion.ts`, pone encima las dos capas de luz
 * de `luz.ts` y lleva las puertas con `puerta.ts`. Es lo que la escena del juego (y el arnés de capturas) crea al entrar en
 * una sala que trae `estructura`; lo demás de la escena (actores, cámara, rótulos) no cambia.
 *
 * - Fondo (piso, tapetes, muros, capas propias y la sombra de lo que cuelga del muro): se compone por software con
 *   `pintarFondo`, igual píxel a píxel a Python, y va como una sola textura.
 * - Piezas y puertas: sprites de sus tiras, para que se animen (reloj, puertas, ventanas y lámparas según el momento).
 * - Luz: dos texturas del tamaño de la sala, sobre los actores. `ambiente` multiplica y `brillo` suma: quien pasa por un
 *   haz se ilumina y quien está en penumbra se oscurece. La sombra de quien juega y la cuña de la puerta abierta se
 *   rehacen solo en el rectángulo que cambia.
 * - La puerta del lado de la cámara se señala con una flecha en el piso, que sube y baja (quieta con movimiento reducido).
 */
import Phaser from 'phaser';

import { DEPTH, actorDepth } from '../depth-sort.util';
import { urlDePieza } from './catalogo';
import type { ManifiestoDePiezas, MuebleDeCatalogo, SalaPorPiezas } from './catalogo';
import { clipsDe, cuadroDelClip } from './mueble-vivo';
import type { Clip } from './mueble-vivo';
import { planDeSala, rutasDelPlan } from './composicion';
import type { PlanDeSala, SpriteDeSala } from './composicion';
import type { Momento, Muro } from './geometria';
import { colorDeReflejo, cuerpoDe, prepararLuz } from './luz';
import type { Cuerpo, LuzDeSala, Mascara, Rectangulo, TonoDeReflejo } from './luz';
import { brilloDeSprite, emisivoDeSprite, pintarFondo } from './pintor';
import type { Imagen } from './pintor';
import {
  PUERTA_ABIERTA, PUERTA_CERRADA, abiertaDelTodo, avanzarPuerta, cuadroVisible, desvioDeSacudida, puertaActiva, sacudir,
} from './puerta';
import type { EstadoDePuerta, Hojas } from './puerta';

/** Profundidades: el fondo y lo del muro bajo los actores; lo del lado de la cámara sobre ellos; la luz sobre todo eso. */
export const PROFUNDIDAD = {
  fondo: DEPTH.BACKGROUND,
  muro: DEPTH.WALLS,
  sombras: DEPTH.ENVIRONMENT,
  flechas: DEPTH.LIGHTING_FLOOR,
  frente: DEPTH.PROPS_FRONT,
  /** El brillo de vidrio y metal va justo encima de su pieza: así quien pasa por delante lo tapa. */
  brilloMuro: DEPTH.WALLS + 0.5,
  brilloFrente: DEPTH.PROPS_FRONT + 0.5,
  ambiente: DEPTH.LIGHTING - 2,
  brillo: DEPTH.LIGHTING - 1,
  /** La luz propia de las piezas del muro: encima de la luz, sin multiplicar por ambiente (regla de P1). */
  emisivo: DEPTH.LIGHTING - 0.5,
} as const;

/** Flecha del lado de la cámara: periodo del vaivén y cuánto sube. */
const FLECHA_PERIODO_MS = 1200;
const FLECHA_SUBE = 2;

export interface PuertaDeEscena {
  id: string;
  muro: Muro;
  etiqueta: string;
  hacia?: string;
  par?: string;
  /** Punto de apoyo de la puerta en pantalla. */
  ancla: [number, number];
  /** Umbral: donde se mide la cercanía y donde aparece quien llega por ella. */
  umbral: [number, number];
}

export interface OpcionesDeEscena {
  momento?: Momento;
  reducido: boolean;
  /** Muebles y objetos de la biblioteca de piezas que dibuja la escena (con su animación, su brillo y su luz propia). */
  muebles?: readonly MuebleDeSala[];
  /** Muebles y personas quietos de la sala: arrojan sombra. */
  cuerpos?: readonly Cuerpo[];
}

interface SpriteVivo {
  plan: SpriteDeSala;
  objeto: Phaser.GameObjects.Sprite;
  hojas: Hojas;
  estado: EstadoDePuerta;
  /** Su luz propia, si es una pieza del piso o del lado de la cámara con mapa `emisivo`: sigue su cuadro. */
  emisivo?: Phaser.GameObjects.Sprite;
}

const clave = (ruta: string) => `sala:${ruta}`;
const pixeles = new Map<string, Imagen>();

/** Los píxeles de una textura cargada, leídos una sola vez. */
function pixelesDe(escena: Phaser.Scene, ruta: string): Imagen | null {
  const guardada = pixeles.get(ruta);
  if (guardada) return guardada;
  if (!escena.textures.exists(clave(ruta))) return null;
  const fuente = escena.textures.get(clave(ruta)).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const lienzo = document.createElement('canvas');
  lienzo.width = fuente.width;
  lienzo.height = fuente.height;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, 0, 0);
  const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const imagen = { ancho: lienzo.width, alto: lienzo.height, rgba: datos.data };
  pixeles.set(ruta, imagen);
  return imagen;
}

/** El alfa (0 a 255) del cuadro que muestra un sprite, ya volteado si lo está. null si no tiene imagen. */
function alfaDelCuadro(sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): { datos: Uint8Array; w: number; h: number } | null {
  const frame = sprite.frame;
  const w = frame?.cutWidth ?? 0, h = frame?.cutHeight ?? 0;
  const fuente = frame?.source?.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!w || !h || !fuente) return null;
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const datos = new Uint8Array(w * h);
  for (let f = 0; f < h; f++) {
    for (let col = 0; col < w; col++) datos[f * w + (sprite.flipX ? w - 1 - col : col)] = rgba[(f * w + col) * 4 + 3];
  }
  return { datos, w, h };
}

/** Galón de 9 × 6 px que apunta hacia la cámara, con su contorno: la flecha de la puerta que no se ve. */
function texturaDeFlecha(escena: Phaser.Scene): string {
  const nombre = 'sala:flecha-camara';
  if (escena.textures.exists(nombre)) return nombre;
  const forma = [
    '.#######.',
    '#ooooooo#',
    '.#ooooo#.',
    '..#ooo#..',
    '...#o#...',
    '....#....',
  ];
  const lienzo = escena.textures.createCanvas(nombre, 9, 6);
  const ctx = lienzo?.getContext();
  if (!lienzo || !ctx) return nombre;
  forma.forEach((fila, y) => [...fila].forEach((c, x) => {
    if (c === '.') return;
    ctx.fillStyle = c === '#' ? '#281c18' : '#f2e2b8';
    ctx.fillRect(x, y, 1, 1);
  }));
  lienzo.refresh();
  return nombre;
}

/** Un mueble u objeto de la biblioteca de piezas puesto en la sala: (x, y) es donde pisa. */
export interface MuebleDeSala {
  id: string;
  clave: string;
  ficha: MuebleDeCatalogo;
  x: number;
  y: number;
  espejo: boolean;
}

interface MuebleVivo {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  extras: Phaser.GameObjects.Sprite[];
  clips: Record<string, Clip>;
  clip: string;
  desde: number;
}

const texturaDeMueble = (clave: string) => `sala:mueble:${clave}`;

/**
 * Lo caro de armar una sala (el fondo compuesto y la luz) guardado por su firma: cada respuesta del servidor vuelve a armar
 * la escena (`renderWorld`) y, si la sala y sus cuerpos no cambiaron, la cuenta da los mismos píxeles. Las cuatro últimas.
 */
const cacheDeSalas = new Map<string, unknown>();
function enCache<T>(clave: string, hacer: () => T): T {
  if (cacheDeSalas.has(clave)) {
    const valor = cacheDeSalas.get(clave) as T;
    cacheDeSalas.delete(clave);
    cacheDeSalas.set(clave, valor);
    return valor;
  }
  const valor = hacer();
  cacheDeSalas.set(clave, valor);
  while (cacheDeSalas.size > 8) cacheDeSalas.delete(cacheDeSalas.keys().next().value as string);
  return valor;
}

function firmaDePlan(sala: SalaPorPiezas, plan: PlanDeSala): string {
  return JSON.stringify([sala.encuadre, sala.estructura, sala.puertas ?? [], plan.momento, plan.ancho]);
}

function firmaDeCuerpos(cuerpos: readonly Cuerpo[]): string {
  return JSON.stringify(cuerpos.map(c => {
    const m = c.mascara as Mascara | readonly string[] | undefined;
    let suma = 0;
    if (m && !Array.isArray(m)) {
      const datos = (m as Mascara).datos;
      for (let i = 0; i < datos.length; i++) if (datos[i]) suma = (suma * 31 + i) % 1000000007;
    }
    return [c.x0, c.x1, c.y0, c.y1, c.alto, c.x, c.y, c.px, c.py, m && !Array.isArray(m) ? `${(m as Mascara).ancho}x${(m as Mascara).alto}:${suma}` : m];
  }));
}

export class EscenaDeSala {
  readonly plan: PlanDeSala;
  private readonly escena: Phaser.Scene;
  private readonly objetos: Phaser.GameObjects.GameObject[] = [];
  private readonly vivos: SpriteVivo[] = [];
  private readonly flechas: { objeto: Phaser.GameObjects.Image; y: number }[] = [];
  private readonly luz: LuzDeSala;
  private readonly lienzos: { ambiente: Phaser.Textures.CanvasTexture; brillo: Phaser.Textures.CanvasTexture } | null;
  private readonly texturasPropias: string[] = [];
  private reducido: boolean;
  private tiempo = 0;
  private activa: string | null = null;
  private abiertas = '';
  /** Brillo de vidrio y metal: lo del muro (bajo los actores) y lo del lado de la cámara (sobre ellos). */
  private readonly brillos: { lienzo: Phaser.Textures.CanvasTexture; rgb: Uint8ClampedArray; capas: string[] }[] = [];
  private readonly imagenesDeBrillo = new Map<string, Imagen>();
  private readonly mueblesVivos: MuebleVivo[] = [];
  private cercano: string | null = null;
  /** La capa de luz propia de las piezas del muro y el cuadro de cada puerta con la que se pintó. */
  private lienzoEmisivo: Phaser.Textures.CanvasTexture | null = null;
  private firmaDeEmisivo = '';
  /** Sombra con silueta de cada figura (por id) y dónde quedan los pies en cada silueta guardada. */
  private readonly sombras = new Map<string, Phaser.GameObjects.Image>();
  /** La silueta de cada cuadro (textura:cuadro:volteo), sacada una vez de su alfa. */
  /** Sufijo único de las texturas de esta sala (no chocan con las de la sala anterior). */
  private readonly sufijo: string;
  private readonly siluetas = new Map<string, { mascara: Mascara; px: number; py: number; alto: number }>();
  /** Lo último que pintó cada sombra, para no rehacerla si nada cambió. */
  private readonly firmasDeSombra = new Map<string, string>();
  private firmaDeBrillo = '';

  /** El plan de dibujo de la sala, o null si su estructura no se puede armar (ancho fuera del catálogo, por ejemplo). */
  static planear(sala: SalaPorPiezas, manifiesto: ManifiestoDePiezas | null, momento?: Momento): PlanDeSala | null {
    if (!manifiesto) return null;
    try {
      return planDeSala(sala, manifiesto, momento);
    } catch {
      return null;
    }
  }

  /**
   * Qué falta para armar el plan: 'listo' si todo está cargado, 'pedir' si falta algo que aún no ha fallado y 'fallo' si
   * alguna imagen ya falló al cargar (`fallidas`, claves del cargador): entonces la sala no se arma a medias ni se vuelve
   * a pedir sin fin; quien la monta sigue por el camino de imagen fija y lo avisa.
   */
  static estadoDeTexturas(plan: PlanDeSala, existe: (clave: string) => boolean, fallidas: ReadonlySet<string>): 'listo' | 'pedir' | 'fallo' {
    let pedir = false;
    for (const ruta of rutasDelPlan(plan)) {
      if (existe(clave(ruta))) continue;
      if (fallidas.has(clave(ruta))) return 'fallo';
      pedir = true;
    }
    return pedir ? 'pedir' : 'listo';
  }

  /** Pide las imágenes que el plan necesita, no están cargadas y no han fallado. true si pidió alguna: hay que esperar. */
  static pedirTexturas(escena: Phaser.Scene, plan: PlanDeSala, fallidas: ReadonlySet<string> = new Set()): boolean {
    let pidio = false;
    const enFondo = new Set(plan.fondo.map(r => r.ruta));
    for (const ruta of rutasDelPlan(plan)) {
      if (escena.textures.exists(clave(ruta)) || fallidas.has(clave(ruta))) continue;
      const sprite = enFondo.has(ruta) ? undefined : plan.sprites.find(s => s.ruta === ruta);
      if (sprite) escena.load.spritesheet(clave(ruta), urlDePieza(ruta), { frameWidth: sprite.w, frameHeight: sprite.h });
      else escena.load.image(clave(ruta), urlDePieza(ruta));
      pidio = true;
    }
    return pidio;
  }

  constructor(escena: Phaser.Scene, sala: SalaPorPiezas, plan: PlanDeSala, manifiesto: ManifiestoDePiezas, opciones: OpcionesDeEscena) {
    this.escena = escena;
    this.plan = plan;
    this.reducido = opciones.reducido;
    const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.sufijo = sufijo;

    // Fondo: una sola textura, compuesta como en Python.
    const imagenes = new Map<string, Imagen>();
    for (const r of plan.fondo) {
      const px = pixelesDe(escena, r.ruta);
      if (px) imagenes.set(r.ruta, px);
    }
    for (const s of plan.sprites) {
      if (s.capa === 'muro' && s.muro === 'fondo') {
        const px = pixelesDe(escena, s.ruta);
        if (px) imagenes.set(s.ruta, px);
      }
    }
    const fondo = enCache(`fondo|${firmaDePlan(sala, plan)}`, () => pintarFondo(plan, imagenes));
    const nombreFondo = `sala:fondo-${sufijo}`;
    const lienzoFondo = escena.textures.createCanvas(nombreFondo, plan.ancho, plan.alto);
    if (lienzoFondo) {
      lienzoFondo.getContext().putImageData(new ImageData(new Uint8ClampedArray(fondo.rgba), plan.ancho, plan.alto), 0, 0);
      lienzoFondo.refresh();
      this.texturasPropias.push(nombreFondo);
      this.objetos.push(escena.add.image(0, 0, nombreFondo).setOrigin(0, 0).setDepth(PROFUNDIDAD.fondo));
    }

    // Piezas y puertas.
    for (const s of plan.sprites) {
      if (!escena.textures.exists(clave(s.ruta))) continue;
      const objeto = escena.add.sprite(s.x, s.y, clave(s.ruta), s.cuadro).setOrigin(0, 0).setFlipX(s.espejo);
      objeto.setDepth(s.capa === 'muro' ? PROFUNDIDAD.muro : s.capa === 'frente' ? PROFUNDIDAD.frente : actorDepth(s.z));
      this.objetos.push(objeto);
      const hojas = (manifiesto.piezas[`puerta/${s.modelo}`]?.hojas ?? 'una') as Hojas;
      this.vivos.push({ plan: s, objeto, hojas, estado: PUERTA_CERRADA });
    }
    const flecha = texturaDeFlecha(escena);
    for (const f of plan.flechas) {
      const objeto = escena.add.image(f.x, f.y, flecha).setOrigin(0.5, 1).setDepth(PROFUNDIDAD.flechas);
      this.objetos.push(objeto);
      this.flechas.push({ objeto, y: f.y });
    }

    // Muebles y objetos de la biblioteca de piezas: su hoja, su animación y su silueta para la sombra.
    const cuerpos: Cuerpo[] = [...(opciones.cuerpos ?? [])];
    for (const m of opciones.muebles ?? []) {
      const hoja = texturaDeMueble(m.clave);
      if (!escena.textures.exists(hoja)) continue;
      const clips = clipsDe(m.ficha);
      const apoyo = (m.ficha as { apoyo?: [number, number] }).apoyo ?? [Math.floor(m.ficha.ancho / 2), m.ficha.alto];
      const sprite = escena.add.sprite(m.x, m.y, hoja, clips['reposo'].de)
        .setOrigin(apoyo[0] / m.ficha.ancho, apoyo[1] / m.ficha.alto).setFlipX(m.espejo).setDepth(actorDepth(m.y));
      this.objetos.push(sprite);
      this.mueblesVivos.push({ id: m.id, sprite, extras: [], clips, clip: 'reposo', desde: 0 });
      const cuerpo = EscenaDeSala.cuerpoDeSprite(sprite, 0, 0);
      if (cuerpo) cuerpos.push(cuerpo);
    }

    // Luz.
    // La misma sala con los mismos cuerpos da la misma luz: se reutiliza (cada interacción vuelve a armar la escena) con
    // sus puertas cerradas, que es como nace la escena nueva.
    this.luz = enCache(`luz|${firmaDePlan(sala, plan)}|${firmaDeCuerpos(cuerpos)}`,
      () => prepararLuz(sala, manifiesto.piezas, { momento: plan.momento, cuerpos }));
    this.luz.abrir([]);
    const capas = this.luz.capas();
    const ambiente = escena.textures.createCanvas(`sala:ambiente-${sufijo}`, plan.ancho, plan.alto);
    const brillo = escena.textures.createCanvas(`sala:brillo-${sufijo}`, plan.ancho, plan.alto);
    if (ambiente && brillo) {
      this.lienzos = { ambiente, brillo };
      this.texturasPropias.push(ambiente.key, brillo.key);
      ambiente.getContext().putImageData(new ImageData(capas.ambiente, plan.ancho, plan.alto), 0, 0);
      brillo.getContext().putImageData(new ImageData(capas.brillo, plan.ancho, plan.alto), 0, 0);
      ambiente.refresh();
      brillo.refresh();
      this.objetos.push(
        escena.add.image(0, 0, ambiente.key).setOrigin(0, 0).setDepth(PROFUNDIDAD.ambiente).setBlendMode(Phaser.BlendModes.MULTIPLY),
        escena.add.image(0, 0, brillo.key).setOrigin(0, 0).setDepth(PROFUNDIDAD.brillo).setBlendMode(Phaser.BlendModes.ADD),
      );
    } else {
      this.lienzos = null;
    }

    // Brillo de vidrio, metal y barniz: solo si alguna pieza trae su mapa.
    for (const s of plan.sprites) {
      for (const ruta of s.brillo ? [s.ruta, s.brillo] : []) {
        const px = pixelesDe(escena, ruta);
        if (px) this.imagenesDeBrillo.set(ruta, px);
      }
    }
    if (plan.sprites.some(s => s.brillo && this.imagenesDeBrillo.has(s.brillo))) {
      for (const [nombre, capas, profundidad] of [['muro', ['muro', 'piso'], PROFUNDIDAD.brilloMuro], ['frente', ['frente'], PROFUNDIDAD.brilloFrente]] as const) {
        const lienzo = escena.textures.createCanvas(`sala:brillo-${nombre}-${sufijo}`, plan.ancho, plan.alto);
        if (!lienzo) continue;
        this.texturasPropias.push(lienzo.key);
        this.objetos.push(escena.add.image(0, 0, lienzo.key).setOrigin(0, 0).setDepth(profundidad).setBlendMode(Phaser.BlendModes.ADD));
        this.brillos.push({ lienzo, rgb: new Uint8ClampedArray(plan.ancho * plan.alto * 3), capas: [...capas] });
      }
      this.pintarBrillos();
    }

    // Brillo y luz propia de cada mueble: hojas iguales a la suya, encima de él y en su mismo cuadro (lo tapa quien pasa).
    const fichas = new Map((opciones.muebles ?? []).map(m => [m.id, m]));
    for (const vivo of this.mueblesVivos) {
      const m = fichas.get(vivo.id);
      if (!m) continue;
      const reflejo = this.luz.reflejoEn(m.x, m.y - 1);
      const tenido = m.ficha.brillo ? this.brilloTenido(m.ficha.brillo, m.ficha.ancho, m.ficha.alto, reflejo.k, reflejo.tono) : null;
      const propio = m.ficha.emisivo && escena.textures.exists(clave(m.ficha.emisivo)) ? `sala:emisivo:${m.ficha.emisivo}:${m.ficha.ancho}x${m.ficha.alto}` : null;
      if (propio && m.ficha.emisivo && !escena.textures.exists(propio)) {
        escena.textures.addSpriteSheet(propio, escena.textures.get(clave(m.ficha.emisivo)).getSourceImage() as HTMLImageElement,
          { frameWidth: m.ficha.ancho, frameHeight: m.ficha.alto });
      }
      for (const [textura, mezcla, encima] of [[tenido, Phaser.BlendModes.ADD, 0.005], [propio, Phaser.BlendModes.NORMAL, 0.01]] as const) {
        if (!textura) continue;
        const extra = escena.add.sprite(vivo.sprite.x, vivo.sprite.y, textura, vivo.sprite.frame.name)
          .setOrigin(vivo.sprite.originX, vivo.sprite.originY).setFlipX(vivo.sprite.flipX)
          .setDepth(vivo.sprite.depth + encima).setBlendMode(mezcla);
        this.objetos.push(extra);
        vivo.extras.push(extra);
      }
    }

    // Luz propia (`emisivo`): la de las piezas del muro va en una capa encima de la luz, con la oclusión de P1 (cada pieza
    // borra su silueta y pega su mapa); la de las piezas del piso y del lado de la cámara va justo encima de su pieza, así
    // quien pasa delante la tapa (diferencia aceptada: ahí la multiplica el ambiente, que al pie de una lámpara es casi 1).
    if (plan.sprites.some(s => s.emisivo)) {
      for (const s of plan.sprites) {
        for (const r of s.capa === 'muro' || s.emisivo ? [s.ruta, ...(s.emisivo ? [s.emisivo] : [])] : []) {
          const px = pixelesDe(escena, r);
          if (px) this.imagenesDeBrillo.set(r, px);
        }
      }
      if (plan.sprites.some(s => s.capa === 'muro' && s.emisivo && this.imagenesDeBrillo.has(s.emisivo))) {
        const lienzo = escena.textures.createCanvas(`sala:emisivo-${sufijo}`, plan.ancho, plan.alto);
        if (lienzo) {
          this.lienzoEmisivo = lienzo;
          this.texturasPropias.push(lienzo.key);
          this.objetos.push(escena.add.image(0, 0, lienzo.key).setOrigin(0, 0).setDepth(PROFUNDIDAD.emisivo));
          this.pintarEmisivo();
        }
      }
      for (const vivo of this.vivos) {
        const p = vivo.plan;
        if (p.capa === 'muro' || !p.emisivo || !escena.textures.exists(clave(p.emisivo))) continue;
        const nombre = `sala:emisivo:${p.emisivo}:${p.w}x${p.h}`;
        if (!escena.textures.exists(nombre)) {
          escena.textures.addSpriteSheet(nombre, escena.textures.get(clave(p.emisivo)).getSourceImage() as HTMLImageElement, { frameWidth: p.w, frameHeight: p.h });
        }
        const propio = escena.add.sprite(p.x, p.y, nombre, p.cuadro).setOrigin(0, 0).setFlipX(p.espejo).setDepth(vivo.objeto.depth + 0.01);
        this.objetos.push(propio);
        vivo.emisivo = propio;
      }
    }
  }

  /** Repinta la capa de luz propia de las piezas del muro con el cuadro que muestra cada una (`componer_sala`). */
  private pintarEmisivo(): void {
    if (!this.lienzoEmisivo) return;
    const { ancho, alto } = this.plan;
    const rgba = new Uint8ClampedArray(ancho * alto * 4);
    for (const vivo of this.vivos) {
      if (vivo.plan.capa !== 'muro') continue;
      const cuadro = vivo.plan.puerta ? cuadroVisible(vivo.estado, vivo.hojas) : vivo.plan.cuadro;
      emisivoDeSprite(rgba, ancho, alto, this.imagenesDeBrillo, vivo.plan, cuadro);
    }
    this.lienzoEmisivo.getContext().putImageData(new ImageData(rgba, ancho, alto), 0, 0);
    this.lienzoEmisivo.refresh();
  }

  /**
   * Repinta el brillo de las piezas con el cuadro que muestra cada una y la luz que le llega ahora (igual que
   * `piezas_sala.componer_sala`). Va en su propia capa, que suma, justo encima de las piezas.
   */
  private pintarBrillos(): void {
    if (!this.brillos.length) return;
    const { ancho, alto } = this.plan;
    for (const capa of this.brillos) {
      capa.rgb.fill(0);
      for (const vivo of this.vivos) {
        if (!capa.capas.includes(vivo.plan.capa)) continue;
        const cuadro = vivo.plan.puerta ? cuadroVisible(vivo.estado, vivo.hojas) : vivo.plan.cuadro;
        const [x, y] = vivo.plan.punto;
        brilloDeSprite(capa.rgb, ancho, alto, this.imagenesDeBrillo, vivo.plan, cuadro, this.luz.reflejoEn(x, y));
      }
      const rgba = new Uint8ClampedArray(ancho * alto * 4);
      for (let p = 0, q = 0; q < capa.rgb.length; p += 4, q += 3) {
        rgba[p] = capa.rgb[q];
        rgba[p + 1] = capa.rgb[q + 1];
        rgba[p + 2] = capa.rgb[q + 2];
        rgba[p + 3] = 255;
      }
      capa.lienzo.getContext().putImageData(new ImageData(rgba, ancho, alto), 0, 0);
      capa.lienzo.refresh();
    }
  }

  /** Las puertas de la sala, con su umbral. */
  puertas(): PuertaDeEscena[] {
    return this.plan.sprites.flatMap(s => s.puerta ? [{
      id: s.id, muro: s.puerta.muro, etiqueta: s.puerta.etiqueta, hacia: s.puerta.hacia, par: s.puerta.par,
      ancla: s.puerta.ancla, umbral: s.puerta.llegada,
    }] : []);
  }

  /** La puerta que manda ahora (la que muestra el aviso), o null. */
  puertaActiva(): string | null {
    return this.activa;
  }

  /**
   * Avanza `dtMs`: anima el reloj y lo que se mueve solo, abre la puerta a la que se acerca quien juega y cierra las demás,
   * y rehace la luz donde cambió (la cuña de la puerta abierta y la sombra de quien juega). Devuelve la puerta activa.
   */
  actualizar(dtMs: number, jugador: { x: number; y: number } | null, bloqueadas: ReadonlySet<string> = new Set(), reducido?: boolean): string | null {
    if (reducido !== undefined) this.reducido = reducido;
    this.tiempo += dtMs;
    this.activa = jugador ? puertaActiva(this.puertas(), jugador, this.activa) : null;
    const abiertas: string[] = [];
    for (const vivo of this.vivos) {
      const s = vivo.plan;
      if (s.puerta) {
        vivo.estado = avanzarPuerta(vivo.estado, { dtMs, cerca: this.activa === s.id, bloqueada: bloqueadas.has(s.id), reducido: this.reducido });
        vivo.objeto.setFrame(cuadroVisible(vivo.estado, vivo.hojas));
        vivo.objeto.x = s.x + desvioDeSacudida(vivo.estado);
        if (abiertaDelTodo(vivo.estado)) abiertas.push(s.id);
      } else if (s.fps && s.cuadros > 2) {
        vivo.objeto.setFrame(this.reducido ? s.cuadro : Math.floor((this.tiempo / 1000) * s.fps) % s.cuadros);
      }
      vivo.emisivo?.setFrame(vivo.objeto.frame.name);
    }
    for (const m of this.mueblesVivos) {
      const clip = m.clips[m.clip] ?? m.clips['reposo'];
      const { cuadro, termino } = cuadroDelClip(clip, this.tiempo - m.desde, this.reducido);
      if (termino && !clip.sostener) {
        m.clip = clip.luego && m.clips[clip.luego] ? clip.luego : 'reposo';
        m.desde = this.tiempo;
      }
      if (String(m.sprite.frame.name) !== String(cuadro)) {
        m.sprite.setFrame(cuadro);
        for (const e of m.extras) e.setFrame(cuadro);
      }
    }
    if (this.lienzoEmisivo) {
      const firma = this.vivos.map(v => (v.plan.puerta && v.plan.capa === 'muro' ? cuadroVisible(v.estado, v.hojas) : '')).join('|');
      if (firma !== this.firmaDeEmisivo) {
        this.firmaDeEmisivo = firma;
        this.pintarEmisivo();
      }
    }
    const firma = abiertas.join('|');
    if (firma !== this.abiertas) {
      this.abiertas = firma;
      this.pintarLuz(this.luz.abrir(abiertas));
    }
    for (const f of this.flechas) {
      const fase = this.reducido ? 0 : Math.floor(((this.tiempo % FLECHA_PERIODO_MS) / FLECHA_PERIODO_MS) * 4);
      f.objeto.y = f.y - [0, 1, FLECHA_SUBE, 1][fase];
    }
    // La sombra de quien camina ya no se rehace en la luz de la sala (era una mancha con la huella): la pinta
    // `sombraDeFigura`, con la silueta del cuadro que se ve, como capa propia de cada figura.
    // El brillo cambia con el cuadro de cada puerta y con la luz que le llega a cada pieza (la sombra de quien camina).
    if (this.brillos.length) {
      const firma = this.vivos.map(v => (v.plan.puerta ? cuadroVisible(v.estado, v.hojas) : '') + ':'
        + (v.plan.brillo ? this.luz.reflejoEn(v.plan.punto[0], v.plan.punto[1]).k : '')).join('|');
      if (firma !== this.firmaDeBrillo) {
        this.firmaDeBrillo = firma;
        this.pintarBrillos();
      }
    }
    return this.activa;
  }

  /**
   * La sombra de quien camina (y de cada persona del caso), con la regla de P1 («La sombra de quien camina», LEEME de la
   * referencia de luz): su silueta es el alfa del cuadro que se está viendo, con el apoyo en sus pies; la matriz es la de la
   * fuente que manda donde pisa (`LuzDeSala.matrizDeCuerpo`) y la sombra, tendida con su borde tramado y recortada al piso
   * (`sombraDeCuerpo`). Dentro de ella se ve la luz «en sombra» en vez de la normal: una imagen en el piso, en MULTIPLY,
   * con el cociente de las dos capas de ambiente en cada píxel (debajo de los actores, así lo de delante la tapa). El
   * brillo no se rebaja (diferencia aceptada: es pequeño y una capa que suma no se puede restar).
   */
  /**
   * Calcula ya la luz «en sombra» de la sala, la que usa `sombraDeFigura`. Es perezosa: sin esto la paga el primer cuadro
   * en que se dibuja la sombra de alguien (V6, unos 390 ms con la CPU ×4). Queda en la luz de la sala, que se reutiliza por
   * su firma: llamarla otra vez no rehace nada.
   */
  calentarSombras(): void {
    this.luz.capasEnSombra();
  }

  sombraDeFigura(id: string, sprite: Phaser.GameObjects.Sprite | null | undefined, piesX: number, piesY: number): void {
    const imagen = this.sombras.get(id);
    const silueta = sprite?.visible && sprite.frame ? this.siluetaDe(sprite) : null;
    if (!sprite || !silueta) {
      imagen?.setVisible(false);
      return;
    }
    const x = Math.round(piesX), y = Math.round(piesY);
    const firma = `${sprite.frame.texture.key}:${sprite.frame.name}:${sprite.flipX ? 1 : 0}:${x}:${y}`;
    if (imagen && this.firmasDeSombra.get(id) === firma) return;
    this.firmasDeSombra.set(id, firma);
    const c: Cuerpo = {
      x0: x - 9, x1: x + 9, y0: y - 10, y1: y, alto: silueta.alto,
      x, y: y - Math.round(sprite.originY * sprite.frame.cutHeight) + silueta.py, px: silueta.px, py: silueta.py, mascara: silueta.mascara,
    };
    const sombra = this.luz.sombraDeCuerpo(c);
    if (!sombra) {
      imagen?.setVisible(false);
      return;
    }
    const nombre = `sala:sombra:${id}:${this.sufijo}`;
    let textura = this.escena.textures.exists(nombre) ? (this.escena.textures.get(nombre) as Phaser.Textures.CanvasTexture) : null;
    if (!textura || textura.width < sombra.w || textura.height < sombra.h) {
      if (textura) this.escena.textures.remove(nombre);
      textura = this.escena.textures.createCanvas(nombre, Math.max(sombra.w, 96), Math.max(sombra.h, 96));
      if (!textura) return;
      this.texturasPropias.push(nombre);
    }
    const normal = this.luz.capas().ambiente, oscura = this.luz.capasEnSombra().ambiente, ancho = this.plan.ancho;
    const datos = new Uint8ClampedArray(textura.width * textura.height * 4);
    for (let j = 0; j < sombra.h; j++) {
      for (let i = 0; i < sombra.w; i++) {
        if (!sombra.datos[j * sombra.w + i]) continue;
        const p = ((sombra.y + j) * ancho + sombra.x + i) * 4, q = (j * textura.width + i) * 4;
        for (let k = 0; k < 3; k++) datos[q + k] = normal[p + k] ? Math.min(255, Math.floor((oscura[p + k] * 255) / normal[p + k])) : 255;
        datos[q + 3] = 255;
      }
    }
    textura.getContext().putImageData(new ImageData(datos, textura.width, textura.height), 0, 0);
    textura.refresh();
    let sombraImagen = imagen;
    if (!sombraImagen) {
      sombraImagen = this.escena.add.image(0, 0, nombre).setOrigin(0, 0).setDepth(PROFUNDIDAD.sombras + 0.1)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.sombras.set(id, sombraImagen);
      this.objetos.push(sombraImagen);
    } else if (sombraImagen.texture !== textura) {
      // Por objeto, no por clave: al crecer, el lienzo se rehace con el MISMO nombre y la imagen seguía con la textura
      // destruida (`TexturerImage.run`: «reading 'resolution'» de null, y el mundo se detenía con quien camina).
      sombraImagen.setTexture(nombre);
    }
    sombraImagen.setPosition(sombra.x, sombra.y).setVisible(true);
  }

  /** Quita la sombra de una figura que ya no está. */
  quitarSombra(id: string): void {
    const sombra = this.sombras.get(id);
    if (!sombra) return;
    sombra.destroy();
    this.sombras.delete(id);
    this.firmasDeSombra.delete(id);
  }

  /**
   * El cuerpo de un mueble u objeto dibujado por `sprite` (hijo de un contenedor en `cx`, `cy`): su silueta es el alfa del
   * cuadro que muestra y se apoya en el centro de su base (`cuerpoDe`). null si no tiene dibujo.
   */
  static cuerpoDeSprite(sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, cx: number, cy: number): Cuerpo | null {
    const alfa = alfaDelCuadro(sprite);
    if (!alfa) return null;
    const izquierda = Math.round(cx + sprite.x - sprite.originX * alfa.w), arriba = Math.round(cy + sprite.y - sprite.originY * alfa.h);
    const c = cuerpoDe(alfa.datos, alfa.w, alfa.h, izquierda, arriba);
    return c.mascara ? c : null;
  }

  /** La silueta del cuadro que muestra el sprite (alfa ≥ 128), con su apoyo: columna de los pies y fila tras la última opaca. */
  private siluetaDe(sprite: Phaser.GameObjects.Sprite): { mascara: Mascara; px: number; py: number; alto: number } | null {
    const frame = sprite.frame;
    const clave = `${frame.texture.key}:${frame.name}:${sprite.flipX ? 1 : 0}`;
    const guardada = this.siluetas.get(clave);
    if (guardada) return guardada;
    const alfa = alfaDelCuadro(sprite);
    if (!alfa) return null;
    const { w, h } = alfa;
    const piesX = Math.round(sprite.originX * w), piesY = Math.round(sprite.originY * h);
    const c = cuerpoDe(alfa.datos, w, h, 0, 0, [piesX, piesY]);
    if (!c.mascara || c.px === undefined || c.py === undefined) return null;
    const silueta = { mascara: c.mascara as Mascara, px: c.px, py: c.py, alto: c.alto };
    this.siluetas.set(clave, silueta);
    return silueta;
  }

  /** Cuánta luz le llega a lo que brilla en (x, y) y de qué tono (para los muebles y objetos que dibuja la escena). */
  reflejoEn(x: number, y: number) {
    return this.luz.reflejoEn(x, y);
  }

  /**
   * Textura con el brillo de un mueble u objeto ya teñido para la luz (k, tono): misma tira y mismos cuadros que su mapa
   * `-brillo.png`, transparente salvo lo que brilla. null si con esa luz no brilla nada o si el mapa no está cargado
   * (se pide con `EscenaDeSala.pedirBrillo`). Se dibuja encima del mueble con mezcla ADD.
   */
  brilloTenido(ruta: string, ancho: number, alto: number, k: number, tono: TonoDeReflejo): string | null {
    const mapa = pixelesDe(this.escena, ruta);
    if (!mapa) return null;
    const nombre = `sala:brillo:${ruta}:${k}:${tono}`;
    if (this.escena.textures.exists(nombre)) return nombre;
    const colores = [85, 170, 255].map(gris => colorDeReflejo(k, tono, gris));
    if (colores.every(c => !c[0] && !c[1] && !c[2])) return null;
    const datos = new Uint8ClampedArray(mapa.ancho * mapa.alto * 4);
    for (let o = 0; o < datos.length; o += 4) {
      const nivel = mapa.rgba[o + 3] === 255 ? [85, 170, 255].indexOf(mapa.rgba[o]) : -1;
      const color = nivel >= 0 ? colores[nivel] : null;
      if (!color || (!color[0] && !color[1] && !color[2])) continue;
      datos.set([color[0], color[1], color[2], 255], o);
    }
    const lienzo = document.createElement('canvas');
    lienzo.width = mapa.ancho;
    lienzo.height = mapa.alto;
    lienzo.getContext('2d')?.putImageData(new ImageData(datos, mapa.ancho, mapa.alto), 0, 0);
    this.escena.textures.addSpriteSheet(nombre, lienzo as unknown as HTMLImageElement, { frameWidth: ancho, frameHeight: alto });
    return nombre;
  }

  /**
   * Pide las hojas de los muebles (cada cuadro de `ancho × alto`) y sus mapas de brillo y de luz propia, salvo lo que ya
   * falló (`fallidas`, claves del cargador). true si pidió algo: hay que esperar.
   */
  static pedirMuebles(escena: Phaser.Scene, muebles: readonly MuebleDeSala[], fallidas: ReadonlySet<string> = new Set()): boolean {
    let pidio = false;
    for (const m of muebles) {
      const hoja = texturaDeMueble(m.clave);
      if (!escena.textures.exists(hoja) && !fallidas.has(hoja)) {
        escena.load.spritesheet(hoja, urlDePieza(m.ficha.ruta), { frameWidth: m.ficha.ancho, frameHeight: m.ficha.alto });
        pidio = true;
      }
      for (const mapa of [m.ficha.brillo, m.ficha.emisivo]) {
        if (mapa && !escena.textures.exists(clave(mapa)) && !fallidas.has(clave(mapa))) {
          escena.load.image(clave(mapa), urlDePieza(mapa));
          pidio = true;
        }
      }
    }
    return pidio;
  }

  /** Pide el mapa de brillo de un mueble u objeto. true si hay que esperar la carga. */
  static pedirBrillo(escena: Phaser.Scene, ruta: string): boolean {
    if (escena.textures.exists(clave(ruta))) return false;
    escena.load.image(clave(ruta), urlDePieza(ruta));
    return true;
  }

  /** Firma de lo que dibuja la escena (la pone quien la arma): si la sala siguiente da la misma, se conserva entera. */
  firma = '';

  /** Saca sus objetos de la lista de la escena sin destruirlos: sobreviven a `children.removeAll` de un repintado. */
  apartar(): void {
    for (const o of this.objetos) this.escena.children.remove(o);
  }

  /** Los devuelve a la escena tal como estaban (mismos objetos, mismas texturas, mismos píxeles). */
  devolver(): void {
    for (const o of this.objetos) this.escena.add.existing(o);
  }

  /** Quien juega está cerca de este objeto (null: de ninguno): si el mueble tiene clip `cerca`, lo hace una vez. */
  cerca(id: string | null): void {
    if (id === this.cercano) return;
    this.cercano = id;
    this.empezarClip(id, 'cerca');
  }

  /** Quien juega revisa este objeto: si el mueble tiene clip `revisar`, lo hace (y se queda si el clip lo sostiene). */
  revisar(id: string): void {
    this.empezarClip(id, 'revisar');
  }

  private empezarClip(id: string | null, nombre: string): void {
    const m = id ? this.mueblesVivos.find(v => v.id === id) : undefined;
    if (!m || !m.clips[nombre]) return;
    m.clip = nombre;
    m.desde = this.tiempo;
  }

  /** Intento de cruzar una puerta cerrada con llave: traquetea. */
  sacudir(id: string): void {
    const vivo = this.vivos.find(v => v.plan.id === id);
    if (vivo) vivo.estado = sacudir(vivo.estado, this.reducido);
  }

  /** Deja una puerta abierta de una vez (quien acaba de llegar por ella la ve abierta detrás). */
  abrirYa(id: string): void {
    const vivo = this.vivos.find(v => v.plan.id === id);
    if (!vivo) return;
    vivo.estado = PUERTA_ABIERTA;
    this.activa = id;
  }

  fijarReducido(reducido: boolean): void {
    this.reducido = reducido;
  }

  /** Dónde va el aviso de una puerta, en coordenadas de sala: sobre la puerta (o sobre su umbral, si es del lado de la cámara). */
  posicionDelAviso(id: string): { x: number; y: number } | null {
    const s = this.plan.sprites.find(p => p.id === id && p.puerta);
    if (!s?.puerta) return null;
    if (s.puerta.muro === 'camara') return { x: s.puerta.llegada[0], y: s.puerta.llegada[1] - 84 };
    return { x: s.puerta.llegada[0], y: Math.min(s.y, s.puerta.llegada[1] - 84) - 6 };
  }

  destruir(): void {
    for (const objeto of this.objetos) objeto.destroy();
    for (const nombre of this.texturasPropias) if (this.escena.textures.exists(nombre)) this.escena.textures.remove(nombre);
    this.objetos.length = 0;
  }

  private pintarLuz(zona: Rectangulo | null): void {
    if (!zona || !this.lienzos) return;
    const capas = this.luz.capas();
    for (const [lienzo, datos] of [[this.lienzos.ambiente, capas.ambiente], [this.lienzos.brillo, capas.brillo]] as const) {
      lienzo.getContext().putImageData(new ImageData(datos, this.plan.ancho, this.plan.alto), 0, 0, zona.x, zona.y, zona.w, zona.h);
      lienzo.refresh();
    }
  }
}
