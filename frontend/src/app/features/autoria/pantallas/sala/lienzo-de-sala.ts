import type { ManifiestoDePiezas, SalaPorPiezas } from '../../../simulator/sala/catalogo';
import type { MuebleDeSala } from '../../../simulator/sala/escena-de-sala';
import { piezaDelObjeto } from '../../../simulator/sala/mueble-vivo';
import { VIEW_ROWS, type ViewId } from '../../../character/kit/kit-engine';
import { rutaArte, rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { CasoBorrador, SalaCaso } from '../../modelo/caso';

/** La vista del kit para cada orientación de la biblioteca: idle.png tiene una fila por vista, en el orden de VIEW_ROWS. */
const VISTA_DE: Readonly<Record<string, ViewId>> = {
  abajo: 'down', 'abajo-izquierda': 'down-left', izquierda: 'left', 'arriba-izquierda': 'up-left',
  arriba: 'up', 'arriba-derecha': 'up-right', derecha: 'right', 'abajo-derecha': 'down-right',
};

/** La fila de idle.png para una orientación; sin orientación conocida, de frente (abajo). */
export function filaDeMirando(mirando: string | undefined): number {
  return VIEW_ROWS.indexOf(VISTA_DE[mirando ?? ''] ?? 'down');
}

/** Una columna más angosta que esto es de teléfono: ahí la sala no se encoge por debajo de `ESCALA_MINIMA_ANGOSTA`. */
export const COLUMNA_ANGOSTA = 600;
/**
 * La escala más chica de una sala por piezas en una columna angosta. Más chica, las piezas vecinas (una puerta y la cartelera
 * o el buzón junto a ella) se pisan con sus objetivos mínimos de 24 px y quedan tapadas (WCAG 2.5.8): la sala se desplaza
 * dentro de su columna, como con «×2», y a 390 se maneja con la misma geometría que a 1366.
 */
export const ESCALA_MINIMA_ANGOSTA = 0.8;

/**
 * La escala a la que se ve una sala por piezas de `ancho` en una columna de `disponible` px (0: aún sin medir): entera en la
 * columna y nunca más grande que 1:1 (una sala de 1200 o 1920 se ve completa a 1366 y a 1920); con «×2», al doble; en una
 * columna angosta, no menos de `ESCALA_MINIMA_ANGOSTA`.
 */
export function escalaDeSala(ancho: number, disponible: number, ampliada: boolean): number {
  if (ampliada) return 2;
  if (disponible <= 0) return 1;
  const entera = Math.min(1, disponible / ancho);
  return disponible < COLUMNA_ANGOSTA ? Math.max(entera, ESCALA_MINIMA_ANGOSTA) : entera;
}

/** Donde se publica la biblioteca de piezas (P1 y O1): sus hojas tienen cuadros de ancho × alto. */
const PIEZAS = '/assets/biblioteca/piezas/';

export interface ActorDelLienzo {
  clave: string;
  tipo: 'mueble' | 'objeto' | 'personaje';
  url: string;
  /** El cuadro de la hoja (0 × 0: la imagen entera). */
  cuadroAncho: number;
  cuadroAlto: number;
  fila: number;
  x: number;
  y: number;
  espejo: boolean;
}

export function salaParaLienzo(sala: SalaCaso): SalaPorPiezas | null {
  if (!sala.estructura) return null;
  return {
    encuadre: sala.encuadre,
    estructura: sala.estructura,
    puertas: sala.puertas.filter((p) => p.muro !== undefined).map((p) => ({
      id: p.id, muro: p.muro!, pos: p.pos ?? 0, modelo: p.modelo ?? '', etiqueta: p.etiqueta,
    })),
  };
}

/** El catálogo y las recetas pertenecen al caso, no a la sala; se pasan cuando están disponibles. */
export function actoresDeSala(sala: SalaCaso, caso?: Pick<CasoBorrador, 'catalogo' | 'personajes' | 'lugarId'>): ActorDelLienzo[] {
  const muebles = sala.muebles.flatMap((m, i): ActorDelLienzo[] => {
    const ficha = caso?.catalogo.muebles.find((c) => c.id === m.ref);
    // Solo una hoja de la biblioteca de piezas tiene cuadros de ancho × alto. En el arte de un lugar, ancho × alto es la
    // huella del mueble en el piso: como cuadro recortaba el dibujo a su franja de arriba.
    if (!ficha) return [];
    const url = rutaArte(caso?.lugarId ?? null, ficha.arte);
    const hoja = url.startsWith(PIEZAS);
    return [{ clave: `mueble-${i}`, tipo: 'mueble', url,
      cuadroAncho: hoja ? ficha.ancho : 0, cuadroAlto: hoja ? ficha.alto : 0, fila: 0, x: m.x, y: m.y, espejo: !!m.espejo }];
  });
  const objetos = sala.objetos.flatMap((o, i): ActorDelLienzo[] => {
    const ficha = caso?.catalogo.objetos.find((c) => c.id === o.ref);
    return ficha ? [{ clave: `objeto-${i}`, tipo: 'objeto', url: rutaArte(caso?.lugarId ?? null, ficha.arte),
      cuadroAncho: 0, cuadroAlto: 0, fila: 0, x: o.x, y: o.y, espejo: !!o.espejo }] : [];
  });
  const personas = sala.personajes.map((p, i): ActorDelLienzo => ({
    clave: `personaje-${i}`, tipo: 'personaje', url: rutaSpriteKit(caso?.personajes.find((c) => c.id === p.ref)?.recipeId ?? p.ref),
    cuadroAncho: 48, cuadroAlto: 72, fila: filaDeMirando(p.mirando), x: p.x, y: p.y, espejo: false,
  }));
  return [...muebles, ...objetos, ...personas];
}

/**
 * Lo que dibuja la escena de la sala y lo que va como sprite, igual que en el juego (`mueblesDeLaSala` de `game-world`):
 * un mueble u objeto cuyo arte es una pieza de la biblioteca (por su ruta o por el arte viejo que la pieza reemplaza) lo
 * dibuja la escena con la pieza, su animación, su brillo, su luz propia y su sombra. Así la docente ve lo mismo que el
 * estudiante: la «Caseta de portería» nueva de O1 y no el dibujo del lugar que reemplazó. Lo demás sigue como sprite.
 */
export function repartirActores(actores: readonly ActorDelLienzo[], manifiesto: ManifiestoDePiezas): {
  muebles: MuebleDeSala[];
  sprites: ActorDelLienzo[];
} {
  const muebles: MuebleDeSala[] = [];
  const sprites: ActorDelLienzo[] = [];
  for (const actor of actores) {
    const pieza = actor.tipo === 'personaje' ? null : piezaDelObjeto(actor.url, manifiesto);
    if (pieza) muebles.push({ id: actor.clave, clave: pieza.clave, ficha: pieza.ficha, x: actor.x, y: actor.y, espejo: actor.espejo });
    else sprites.push(actor);
  }
  return { muebles, sprites };
}
