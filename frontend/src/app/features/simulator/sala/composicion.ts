/**
 * De la `estructura` de una sala a su plan de dibujo: qué imagen va, de dónde se recorta y dónde se pega.
 *
 *     planDeSala(sala, manifiesto, momento?) -> PlanDeSala
 *
 * Es el espejo de `capas` en `tools/escenarios/piezas_sala.py`: coloca cada pieza y cada puerta en el mismo píxel
 * (`scripts/world-art/salas-composicion.test.mjs`). El plan no pinta nada: lo ejecutan `pintor.ts` (por software, para el
 * fondo y las pruebas) y `escena-de-sala.ts` (Phaser). Lo que la estructura trae mal se omite con un aviso; el resto se arma.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import { encendidaForzada } from './catalogo';
import type { FichaDePieza, ManifiestoDePiezas, SalaPorPiezas, VistaDePieza } from './catalogo';
import {
  ALTO, ALTO_MAESTRA_MURO, FONDO, MUROS, SEAM, TOP, borde, enPantalla, largoMuro, laterales, limites, llegada, recorteDeMaestra,
  zonaCaminable,
} from './geometria';
import type { Encuadre, Momento, Muro } from './geometria';

type Color = [number, number, number];

/** Lo que se ve donde no hay sala. */
export const VACIO: Color = [14, 16, 22];
/** Franjas del cielo de una sala al aire libre, de arriba abajo. */
export const CIELO_DE_DIA: Color[] = [[196, 214, 224], [182, 204, 218], [168, 194, 212], [154, 184, 206]];
export const CIELO_DE_NOCHE: Color[] = [[22, 26, 48], [26, 32, 56], [32, 38, 64], [40, 46, 72]];

/** Una imagen (o un recorte suyo) pegada en el fondo de la sala. */
export interface Recorte {
  /** Relativa a `biblioteca/`. */
  ruta: string;
  x: number;
  y: number;
  /** [x, y, ancho, alto] del rectángulo de la imagen que se pega; sin él, la imagen entera. */
  origen?: [number, number, number, number];
  /** Se copia sin mirar el alfa: el piso y el muro del fondo. */
  opaco?: boolean;
}

export interface PuertaDelPlan {
  hacia?: string;
  par?: string;
  etiqueta: string;
  muro: Muro;
  /** Punto de apoyo de la puerta en pantalla. */
  ancla: [number, number];
  /** Dónde queda parado quien la cruza hacia esta sala. */
  llegada: [number, number];
}

/** Una pieza suelta: una tira horizontal de `cuadros` cuadros de `w` × `h`, pegada con su esquina en (x, y). */
export interface SpriteDeSala {
  id: string;
  tipo: string;
  modelo: string;
  /** `muro`: bajo los muebles y las personas. `piso`: entre ellos, ordenado por `z`. `frente`: encima de todos. */
  capa: 'muro' | 'piso' | 'frente';
  ruta: string;
  w: number;
  h: number;
  cuadros: number;
  /** Cuadro en reposo: el estado de la ventana o de la lámpara en este momento; 0 en lo demás. */
  cuadro: number;
  /** Cuadros por segundo de lo que se mueve solo (el reloj). */
  fps?: number;
  x: number;
  y: number;
  z: number;
  /** Se dibuja reflejado: la vista lateral en el muro derecho. */
  espejo: boolean;
  muro?: Muro;
  pos?: number;
  puerta?: PuertaDelPlan;
  /** Mapa de brillo (misma tira, mismos cuadros) y punto del piso donde se mide la luz que le llega. */
  brillo?: string;
  /** Mapa de luz propia (misma tira, mismos cuadros): va encima de la luz. */
  emisivo?: string;
  punto: [number, number];
}

/** Dónde se mide la luz que le llega a lo que brilla de una pieza: un poco delante de ella, sobre el piso. */
function puntoDeMedida(muro: Muro | 'suelo', ancla: [number, number]): [number, number] {
  const [ax, ay] = ancla;
  if (muro === 'fondo') return [ax, SEAM + 24];
  if (muro === 'izquierda') return [ax + 24, ay];
  if (muro === 'derecha') return [ax - 24, ay];
  if (muro === 'camara') return [ax, ALTO - 30];
  return [ax, ay - 1];
}

export interface PlanDeSala {
  ancho: number;
  alto: number;
  momento: Momento;
  exterior: boolean;
  /** Franjas del cielo si la sala es al aire libre. */
  cielo: Color[] | null;
  /** En orden de pintado: piso, tapetes, muro del fondo, capas propias y muros laterales. */
  fondo: Recorte[];
  /** En el orden de la estructura: primero las piezas y después las puertas. */
  sprites: SpriteDeSala[];
  /** Una por cada puerta del lado de la cámara: la punta de la flecha que la señala en el piso. */
  flechas: { id: string; x: number; y: number }[];
  /** [x, y, ancho, alto] de la zona caminable. */
  zona: [number, number, number, number];
  /** Extremos del muro del fondo: ahí cae la sombra de lo que cuelga de él. */
  muroFondo: { x0: number; x1: number };
  avisos: string[];
}

function propio<T>(tabla: Record<string, T> | undefined, clave: string): T | undefined {
  return tabla && Object.hasOwn(tabla, clave) ? tabla[clave] : undefined;
}

/** Una ruta que viene dentro de la estructura solo vale si es una imagen de la biblioteca de piezas. */
function rutaDePiezas(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && /^piezas\/[a-z0-9-]+(\/[a-z0-9-]+)*\.png$/.test(ruta);
}

/** El cuadro que corresponde al momento: la ventana cambia de cielo y la lámpara se enciende de noche. */
function cuadroDe(tipo: string, ficha: FichaDePieza, momento: Momento, forzada: boolean | null): number {
  if (ficha.cuadros !== 2) return 0;
  if (tipo === 'ventana') return momento === 'noche' ? 1 : 0;
  if (tipo === 'lampara') return (forzada ?? momento === 'noche') ? 1 : 0;
  return 0;
}

function vistaDe(ficha: FichaDePieza, muro: Muro, ancho: number): VistaDePieza | undefined {
  if (muro === 'fondo') return ficha.vistas.frente;
  if (muro === 'camara') return ficha.vistas.camara;
  return propio(ficha.vistas.lado, String(ancho));
}

export function planDeSala(sala: SalaPorPiezas, manifiesto: ManifiestoDePiezas, momentoPedido?: Momento): PlanDeSala {
  const est = sala.estructura;
  const ancho = est.ancho;
  const b = borde(ancho);   // rechaza un ancho fuera del catálogo
  const encuadre: Encuadre = sala.encuadre;
  const momento = momentoPedido ?? est.momento ?? 'dia';
  const [izq, der] = laterales(encuadre);
  const [xl, xr] = limites(encuadre, ancho);
  const [x0] = recorteDeMaestra(ancho);
  const avisos: string[] = [];
  const fondo: Recorte[] = [];
  const sprites: SpriteDeSala[] = [];
  const flechas: PlanDeSala['flechas'] = [];

  // ── fondo: piso, tapetes, muro del fondo, capas propias y muros laterales ──
  const clavePiso = `${est.acabados.piso}-${est.acabados.variante ?? 'a'}`;
  const piso = propio(manifiesto.pisos, clavePiso);
  if (piso) fondo.push({ ruta: piso.ruta, x: 0, y: SEAM, origen: [x0, 0, ancho, FONDO], opaco: true });
  else avisos.push(`el piso ${clavePiso} no está en el catálogo`);

  for (const tapete of est.tapetes ?? []) {
    if (rutaDePiezas(tapete.ruta)) fondo.push({ ruta: tapete.ruta, x: tapete.x ?? 0, y: tapete.y ?? 0 });
    else avisos.push('un tapete no trae su imagen: se omite');
  }

  const claveMuro = `${est.acabados.muro}/${est.acabados.paleta}`;
  const muro = propio(manifiesto.muros, claveMuro);
  if (muro) fondo.push({ ruta: muro.fondo.ruta, x: xl, y: TOP - 6, origen: [x0 + xl, 0, xr - xl, ALTO_MAESTRA_MURO], opaco: true });
  else avisos.push(`el muro ${claveMuro} no está en el catálogo`);

  for (const capa of est.propios ?? []) {
    if (rutaDePiezas(capa.ruta)) fondo.push({ ruta: capa.ruta, x: 0, y: 0 });
    else avisos.push('una capa propia no es una imagen de la biblioteca de piezas: se omite');
  }

  const lado = muro ? propio(muro.lado, String(ancho)) : undefined;
  if (izq && lado?.izquierda) fondo.push({ ruta: lado.izquierda.ruta, x: 0, y: 0 });
  if (der && lado?.derecha) fondo.push({ ruta: lado.derecha.ruta, x: ancho - b, y: 0 });

  // ── piezas y puertas ──
  const enSuMuro = (muroDePieza: unknown, pos: unknown, nombre: string): muroDePieza is Muro => {
    const esMuro = typeof muroDePieza === 'string' && (MUROS as readonly string[]).includes(muroDePieza);
    const largo = esMuro ? largoMuro(muroDePieza as Muro, encuadre, ancho) : 0;
    if (!largo) {
      avisos.push(`${nombre}: el encuadre ${encuadre} no tiene muro ${String(muroDePieza)}`);
      return false;
    }
    if (typeof pos !== 'number' || !Number.isInteger(pos) || pos < 0 || pos > largo) {
      avisos.push(`${nombre}: pos ${String(pos)} fuera del muro ${String(muroDePieza)}`);
      return false;
    }
    return true;
  };
  /** Dónde va la esquina del sprite para que su punto de apoyo caiga sobre (muro, pos). */
  const colocar = (ficha: FichaDePieza, muroDePieza: Muro, pos: number, nombre: string) => {
    const vista = vistaDe(ficha, muroDePieza, ancho);
    if (!vista) {
      avisos.push(`${nombre}: ${ficha.nombre} no tiene vista para el muro ${muroDePieza}`);
      return null;
    }
    const espejo = muroDePieza === 'derecha';
    const ancla = enPantalla(muroDePieza, pos, encuadre, ancho);
    const apoyoX = espejo ? vista.ancho - vista.apoyo[0] : vista.apoyo[0];
    return { vista, espejo, ancla, x: ancla[0] - apoyoX, y: ancla[1] - vista.apoyo[1] };
  };

  for (const pieza of est.piezas ?? []) {
    const clave = `${pieza.tipo}/${pieza.modelo}`;
    const nombre = pieza.id ?? clave;
    const ficha = pieza.tipo === 'puerta' ? undefined : propio(manifiesto.piezas, clave);
    if (!ficha) {
      avisos.push(`${nombre}: ${clave} no está en el catálogo`);
      continue;
    }
    const cuadro = cuadroDe(pieza.tipo, ficha, momento, encendidaForzada(pieza));
    if (ficha.muros.includes('suelo')) {
      const vista = ficha.vistas.suelo;
      if (pieza.x === undefined || pieza.y === undefined || !vista) {
        avisos.push(`${nombre}: una lámpara de piso se ubica con x e y`);
        continue;
      }
      // `sobre`: px por encima del piso, para la lámpara que va encima de una mesa.
      sprites.push({
        id: nombre, tipo: pieza.tipo, modelo: pieza.modelo, capa: 'piso', ruta: vista.ruta, w: vista.ancho, h: vista.alto,
        cuadros: ficha.cuadros, cuadro, x: pieza.x - vista.apoyo[0], y: pieza.y - vista.apoyo[1] - (pieza.sobre ?? 0), z: pieza.y,
        espejo: false, brillo: vista.brillo, emisivo: vista.emisivo, punto: puntoDeMedida('suelo', [pieza.x, pieza.y]),
      });
      continue;
    }
    if (!enSuMuro(pieza.muro, pieza.pos, nombre)) continue;
    if (!ficha.muros.includes(pieza.muro)) {
      avisos.push(`${nombre}: ${ficha.nombre} no va en el muro ${pieza.muro}`);
      continue;
    }
    const sitio = colocar(ficha, pieza.muro, pieza.pos as number, nombre);
    if (!sitio) continue;
    const sprite: SpriteDeSala = {
      id: nombre, tipo: pieza.tipo, modelo: pieza.modelo, capa: 'muro', ruta: sitio.vista.ruta, w: sitio.vista.ancho, h: sitio.vista.alto,
      cuadros: ficha.cuadros, cuadro, x: sitio.x, y: sitio.y, z: 0, espejo: sitio.espejo, muro: pieza.muro, pos: pieza.pos,
      brillo: sitio.vista.brillo, emisivo: sitio.vista.emisivo, punto: puntoDeMedida(pieza.muro, sitio.ancla),
    };
    if (ficha.fps) sprite.fps = ficha.fps;
    sprites.push(sprite);
  }

  for (const puerta of sala.puertas ?? []) {
    const nombre = puerta.id ?? 'puerta';
    const ficha = propio(manifiesto.piezas, `puerta/${puerta.modelo}`);
    if (!ficha) {
      avisos.push(`${nombre}: la puerta ${String(puerta.modelo)} no está en el catálogo`);
      continue;
    }
    if (!enSuMuro(puerta.muro, puerta.pos, nombre)) continue;
    const sitio = colocar(ficha, puerta.muro, puerta.pos, nombre);
    if (!sitio) continue;
    const deCamara = puerta.muro === 'camara';
    sprites.push({
      id: nombre, tipo: 'puerta', modelo: puerta.modelo, capa: deCamara ? 'frente' : 'muro', ruta: sitio.vista.ruta,
      w: sitio.vista.ancho, h: sitio.vista.alto, cuadros: ficha.cuadros, cuadro: 0, x: sitio.x, y: sitio.y, z: deCamara ? ALTO : 0,
      espejo: sitio.espejo, muro: puerta.muro, pos: puerta.pos, brillo: sitio.vista.brillo, emisivo: sitio.vista.emisivo, punto: puntoDeMedida(puerta.muro, sitio.ancla),
      puerta: {
        hacia: puerta.hacia, par: puerta.par, etiqueta: puerta.etiqueta ?? '', muro: puerta.muro, ancla: sitio.ancla,
        llegada: llegada(puerta.muro, puerta.pos, encuadre, ancho),
      },
    });
    // La puerta del lado de la cámara casi no se ve: una flecha en el piso, sobre su fragmento, dice que está ahí.
    if (deCamara) flechas.push({ id: nombre, x: sitio.ancla[0], y: sitio.y - 10 });
  }

  return {
    ancho, alto: ALTO, momento, exterior: est.exterior === true,
    cielo: est.exterior === true ? (momento === 'noche' ? CIELO_DE_NOCHE : CIELO_DE_DIA) : null,
    fondo, sprites, flechas, zona: zonaCaminable(encuadre, ancho), muroFondo: { x0: xl, x1: xr }, avisos,
  };
}

/** Las imágenes que el plan necesita cargadas, sin repetir: fondo, piezas y sus mapas de brillo y de luz propia. */
export function rutasDelPlan(plan: PlanDeSala): string[] {
  const mapas = plan.sprites.flatMap(s => [s.brillo, s.emisivo].filter((r): r is string => !!r));
  return [...new Set([...plan.fondo.map(r => r.ruta), ...plan.sprites.map(s => s.ruta), ...mapas])];
}
