/**
 * Del mundo que entrega el servidor (contrato x-siep 2.2, sección 5) a la sala por piezas que arma el juego.
 *
 *     salaDelMundo(mapa, objetos) -> SalaPorPiezas | null
 *
 * - `map.structure` es la `estructura` tal cual; `null` (o ausente, o una que no se entiende) es una sala de imagen fija:
 *   devuelve null y la escena sigue por el camino de hoy.
 * - El encuadre viene en `map.ambient.encuadre`.
 * - Cada objeto `EXIT` con `metadata.muro`, `pos` y `modelo` es una puerta de pieza; uno sin esos datos es una puerta de las
 *   de hoy (pintada en el fondo) y no entra.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node. Recibe formas estructurales para no
 * depender de los modelos de la app.
 */
import type { EstructuraDeSala, PuertaDeSala, SalaPorPiezas } from './catalogo';
import { MUROS, esAncho, esEncuadre } from './geometria';
import type { Encuadre, Muro } from './geometria';

export interface MapaDelMundo {
  structure?: unknown;
  ambient?: unknown;
}

export interface ObjetoDelMundo {
  key: string;
  type: string;
  label?: string;
  metadata?: unknown;
}

const tabla = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null);
const texto = (x: unknown): string | undefined => (typeof x === 'string' && x.length > 0 ? x : undefined);

function estructuraValida(x: unknown): EstructuraDeSala | null {
  const e = tabla(x);
  const acabados = tabla(e?.['acabados']);
  if (!e || !acabados || !esAncho(e['ancho'])) return null;
  if (!texto(acabados['piso']) || !texto(acabados['muro']) || !texto(acabados['paleta'])) return null;
  if (e['piezas'] !== undefined && !Array.isArray(e['piezas'])) return null;
  return e as unknown as EstructuraDeSala;
}

/** La puerta de pieza que es un objeto `EXIT`, o null si es una puerta de las de hoy. */
export function puertaDelObjeto(objeto: ObjetoDelMundo): PuertaDeSala | null {
  if ((objeto.type ?? '').toUpperCase() !== 'EXIT') return null;
  const m = tabla(objeto.metadata);
  const muro = m?.['muro'], pos = m?.['pos'], modelo = texto(m?.['modelo']);
  if (typeof muro !== 'string' || !(MUROS as readonly string[]).includes(muro)) return null;
  if (typeof pos !== 'number' || !Number.isFinite(pos) || !modelo) return null;
  return {
    id: objeto.key, muro: muro as Muro, pos, modelo,
    hacia: texto(m?.['targetNodeKey']), par: texto(m?.['par']), etiqueta: texto(objeto.label) ?? '',
  };
}

export function salaDelMundo(mapa: MapaDelMundo, objetos: readonly ObjetoDelMundo[]): SalaPorPiezas | null {
  const estructura = estructuraValida(mapa.structure);
  if (!estructura) return null;
  const pedido = tabla(mapa.ambient)?.['encuadre'];
  const encuadre: Encuadre = esEncuadre(pedido) ? pedido : 'tres-paredes';
  const puertas = objetos.map(puertaDelObjeto).filter((p): p is PuertaDeSala => p !== null);
  return { encuadre, estructura, puertas };
}
