/**
 * Los requisitos de una respuesta («Aparece si…»): la condición del documento 2.1 traducida a lo que la interfaz sabe mostrar.
 * Funciones puras. Lo que la interfaz sabe armar es «todas estas»: una lista de hechos (habló con, revisó, usó) que se
 * cumplen a la vez. Todo lo demás (un hito, un `any`, un `not`, un conteo, un hecho sin casilla) se conserva tal cual, se
 * lee en palabras y solo se pierde si la docente lo quita a propósito.
 */
import type { CasoBorrador } from './caso';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS } from './persona';

export type TipoHecho = 'talked' | 'inspected' | 'has' | 'used';

export interface Hecho {
  tipo: TipoHecho;
  clave: string;
}

export type LecturaCondicion =
  | { forma: 'ninguna' }
  | { forma: 'todas'; hechos: Hecho[] }
  | { forma: 'otra'; crudo: Record<string, unknown> };

const TIPOS_DE_HECHO: readonly TipoHecho[] = ['talked', 'inspected', 'has', 'used'];
/** Hasta dónde se anida una condición; más allá es un dato roto (el mismo tope que el servidor). */
const PROFUNDIDAD_MAXIMA = 12;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** El hecho que dice un objeto de una sola clave (`{talked: 'laura'}`), o `null` si no es un hecho. */
function hechoDe(v: unknown): Hecho | null {
  if (!esObjeto(v)) return null;
  const claves = Object.keys(v);
  if (claves.length !== 1) return null;
  const tipo = TIPOS_DE_HECHO.find((t) => t === claves[0]);
  const clave = v[claves[0]];
  return tipo && typeof clave === 'string' && clave !== '' ? { tipo, clave } : null;
}

/**
 * ¿Tiene casilla en la interfaz? Sin otra información, `talked`, `inspected` y `used` con un código simple la tienen; `has` y
 * `used` con `@objetivo` no. Quien conoce la sala pasa `casillasDe(piezasDeSala(…))`, que también deja fuera lo que la sala no ofrece
 * (un personaje de ambiente).
 */
const CASILLA_POR_DEFECTO = (h: Hecho): boolean => h.tipo !== 'has' && !(h.tipo === 'used' && h.clave.includes('@'));

/**
 * Lee la condición de un requisito. Ausente, `null` y `{}` son «ninguna»; un hecho solo o `{all: [hechos]}` con casilla cada uno son «todas»;
 * todo lo demás, incluido un dato roto, es «otra» con el crudo copiado (un dato que no es un objeto da `{}`).
 */
export function leerCondicion(crudo: unknown, tieneCasilla: (h: Hecho) => boolean = CASILLA_POR_DEFECTO): LecturaCondicion {
  if (crudo === undefined || crudo === null) return { forma: 'ninguna' };
  if (!esObjeto(crudo)) return { forma: 'otra', crudo: {} };
  if (Object.keys(crudo).length === 0) return { forma: 'ninguna' };
  const otra: LecturaCondicion = { forma: 'otra', crudo: structuredClone(crudo) };

  const solo = hechoDe(crudo);
  if (solo) return tieneCasilla(solo) ? { forma: 'todas', hechos: [solo] } : otra;

  const lista = crudo['all'];
  if (Object.keys(crudo).length === 1 && Array.isArray(lista) && lista.length > 0) {
    const hechos = lista.map(hechoDe);
    if (hechos.every((h): h is Hecho => h !== null && tieneCasilla(h))) return { forma: 'todas', hechos };
  }
  return otra;
}

/** La condición como JSON del documento: `ninguna` es `{}`; un hecho, el hecho; varios, `{all: […]}`; `otra`, su crudo. */
export function escribirCondicion(lectura: LecturaCondicion): Record<string, unknown> {
  if (lectura.forma === 'ninguna') return {};
  if (lectura.forma === 'otra') return structuredClone(lectura.crudo);
  const hechos = lectura.hechos.map((h) => ({ [h.tipo]: h.clave }));
  if (hechos.length === 0) return {};
  return hechos.length === 1 ? hechos[0] : { all: hechos };
}

// ─── Lo que se puede elegir en una sala ──────────────────────────────────────

export const AVISO_HERRAMIENTA_SIN_ENTREGA = 'Nadie entrega esta herramienta en el caso: el estudiante no podrá conseguirla.'; // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología

/**
 * Algo que un requisito o un comentario puede nombrar. `clave` es la que va en el requisito (la del objeto del mapa, o el código de
 * la herramienta); `ref` es la del personaje o la de la pieza del catálogo (la que lleva una reacción o un comentario).
 */
export interface PiezaElegible {
  tipo: TipoHecho;
  clave: string;
  ref: string;
  nombre: string;
  aviso: string | null;
}

export interface PiezasDeSala {
  personas: PiezaElegible[];
  objetos: PiezaElegible[];
  herramientas: PiezaElegible[];
}

/**
 * Las personas de la sala (`talked`), sus objetos (`inspected`) y las herramientas del caso (`used`). Una pieza sin `clave` (aún sin
 * guardar) no sale. Una herramienta que ningún objeto del caso entrega lleva el aviso.
 */
export function piezasDeSala(caso: CasoBorrador, salaId: string): PiezasDeSala {
  const sala = caso.salas.find((s) => s.id === salaId);
  const nombreDePieza = (ref: string): string =>
    caso.catalogo.objetos.find((o) => o.id === ref)?.nombre ?? caso.catalogo.herramientas.find((h) => h.id === ref)?.nombre ?? ref;

  const personas: PiezaElegible[] = [];
  for (const p of sala?.personajes ?? []) {
    if (!p.clave) continue;
    personas.push({ tipo: 'talked', clave: p.clave, ref: p.ref, nombre: caso.personajes.find((x) => x.id === p.ref)?.nombre ?? p.ref, aviso: null });
  }
  const objetos: PiezaElegible[] = [];
  for (const o of sala?.objetos ?? []) {
    if (!o.clave) continue;
    objetos.push({ tipo: 'inspected', clave: o.clave, ref: o.ref, nombre: nombreDePieza(o.ref), aviso: null });
  }
  const entregadas = new Set(caso.salas.flatMap((s) => [...s.objetos, ...s.muebles]).flatMap((o) => (o.toolCode ? [o.toolCode] : [])));
  const herramientas: PiezaElegible[] = (caso.herramientas ?? []).map((h) => ({
    tipo: 'used', clave: h.codigo, ref: h.codigo, nombre: h.nombre, aviso: entregadas.has(h.codigo) ? null : AVISO_HERRAMIENTA_SIN_ENTREGA,
  }));
  return { personas, objetos, herramientas };
}

/** El predicado de casillas de una sala: solo tiene casilla lo que `piezasDeSala` ofrece (para `leerCondicion`). */
export function casillasDe(piezas: PiezasDeSala): (h: Hecho) => boolean {
  const ofrecidas = new Set([...piezas.personas, ...piezas.objetos, ...piezas.herramientas].map((p) => `${p.tipo}:${p.clave}`));
  return (h) => ofrecidas.has(`${h.tipo}:${h.clave}`);
}

// ─── En palabras ─────────────────────────────────────────────────────────────

const AVISO_ROTO = 'un requisito que el editor no puede leer'; // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología

// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
const COMPARADORES: ReadonlyArray<readonly [string, string]> = [
  ['gte', 'al menos'], ['gt', 'más de'], ['lte', 'como mucho'], ['lt', 'menos de'], ['eq', 'exactamente'],
];
// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
const CLASE_EN_PLURAL: Record<string, string> = {
  recommended: 'recomendadas', acceptable: 'aceptables', risky: 'con riesgo', contraindicated: 'contraindicadas',
};
// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (los verbos de los hechos y las frases de abajo: «y», «alguna de estas», «no…», «cumplió el hito», «eligió… respuestas», «la persona usuaria quedó»)
const VERBO_DE_HECHO: Record<TipoHecho, string> = { talked: 'habló con', inspected: 'revisó', has: 'tiene', used: 'usó' };

type Nombres = (tipo: string, clave: string) => string;

/** Una condición en palabras; `null` si no es una condición del vocabulario. */
// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (todas las frases que arma: «y», «alguna de estas», «no ocurre que», «cumplió el hito», «eligió», «la persona usuaria quedó»)
function palabras(c: unknown, nombres: Nombres, nivel: number): string | null {
  if (nivel > PROFUNDIDAD_MAXIMA || !esObjeto(c)) return null;
  const hecho = hechoDe(c);
  if (hecho) return `${VERBO_DE_HECHO[hecho.tipo]} ${nombres(hecho.tipo, hecho.clave)}`;

  const claves = Object.keys(c);
  const compuesta = (texto: string): string => (nivel > 0 ? `(${texto})` : texto);
  if (claves.length === 1 && Array.isArray(c['all'])) {
    const partes = c['all'].map((x) => palabras(x, nombres, nivel + 1));
    return partes.length > 0 && partes.every((p): p is string => p !== null) ? compuesta(partes.join(' y ')) : null;
  }
  if (claves.length === 1 && Array.isArray(c['any'])) {
    const partes = c['any'].map((x) => palabras(x, nombres, nivel + 1));
    return partes.length > 0 && partes.every((p): p is string => p !== null) ? compuesta(`alguna de estas: ${partes.join('; ')}`) : null;
  }
  if (claves.length === 1 && 'not' in c) {
    const dentro = c['not'];
    const texto = palabras(dentro, nombres, nivel + 1);
    if (texto === null) return null;
    const esGrupo = esObjeto(dentro) && ('all' in dentro || 'any' in dentro);
    return esGrupo ? `no ocurre que ${texto.startsWith('(') ? texto : `(${texto})`}` : `no ${texto}`;
  }
  if (claves.length === 1 && typeof c['milestone'] === 'string' && c['milestone'] !== '') {
    return `cumplió el hito “${nombres('milestone', c['milestone'])}”`;
  }
  if ('count' in c && typeof c['count'] === 'string' && Object.hasOwn(CLASE_EN_PLURAL, c['count'])) {
    const limites = COMPARADORES.filter(([k]) => k in c);
    if (limites.length === 0 || !limites.every(([k]) => typeof c[k] === 'number') || claves.length !== limites.length + 1) return null;
    return `eligió ${limites.map(([k, texto]) => `${texto} ${c[k]}`).join(' y ')} respuestas ${CLASE_EN_PLURAL[c['count']]}`;
  }
  if (claves.length === 1 && esObjeto(c['persona'])) {
    const { bond, activation, ...resto } = c['persona'];
    const estados = [
      typeof bond === 'string' ? VINCULO_EN_PALABRAS[bond] : undefined,
      typeof activation === 'string' ? ACTIVACION_EN_PALABRAS[activation] : undefined,
    ].filter((e): e is string => e !== undefined);
    if (estados.length === 0 || Object.keys(resto).length > 0) return null;
    return `la persona usuaria quedó ${estados.join(' y ')}`;
  }
  return null;
}

/**
 * La condición en palabras, para la forma «otra» que la interfaz no sabe armar («habló con Laura y cumplió el hito “Informar
 * derechos”», «alguna de estas: …», «no revisó la carpeta»). `nombres` da el nombre de una pieza (`talked`, `inspected`, `has`, `used`)
 * o de un hito (`milestone`) a partir de su clave. Un dato roto da «un requisito que el editor no puede leer».
 */
export function describirCondicion(crudo: unknown, nombres: Nombres): string {
  return palabras(crudo, nombres, 0) ?? AVISO_ROTO;
}
