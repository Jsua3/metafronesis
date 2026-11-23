/**
 * Las condiciones de un final del modo propio, vistas como frases que la docente combina con «y»:
 * «Si cumplió el hito …», «Si eligió al menos N respuestas contraindicadas», «Si la persona terminó abierta».
 * Una condición es un árbol (`all`, `any`, `not`…); las que no son una frase o una lista de frases unidas con «y» el editor no las sabe
 * mostrar en frases: `partesDeCondicion` devuelve `null` y la pantalla las conserva intactas como «condición combinada».
 */
import type { ActivacionPersona, CondicionFinal, VinculoPersona } from './caso';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS } from './persona';

export type ParteDeCondicion =
  | { tipo: 'hito'; clave: string }
  | { tipo: 'sin-hito'; clave: string }
  | { tipo: 'contraindicadas'; n: number }
  | { tipo: 'ninguna-contraindicada' }
  | { tipo: 'riesgo'; n: number }
  | { tipo: 'persona'; bond?: VinculoPersona; activation?: ActivacionPersona };

export type TipoDeParte = ParteDeCondicion['tipo'];

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const soloClaves = (o: Record<string, unknown>, ...permitidas: string[]) => Object.keys(o).every((k) => permitidas.includes(k));
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

/** Una condición que es una sola frase, o `null` si no lo es. */
function parteDe(c: unknown): ParteDeCondicion | null {
  if (!esObjeto(c)) return null;
  if ('milestone' in c) return soloClaves(c, 'milestone') && typeof c['milestone'] === 'string' && c['milestone'] ? { tipo: 'hito', clave: c['milestone'] } : null;
  if ('not' in c) {
    const dentro = c['not'];
    return soloClaves(c, 'not') && esObjeto(dentro) && soloClaves(dentro, 'milestone') && typeof dentro['milestone'] === 'string' && dentro['milestone']
      ? { tipo: 'sin-hito', clave: dentro['milestone'] } : null;
  }
  if ('count' in c) {
    if (c['count'] === 'contraindicated' && soloClaves(c, 'count', 'eq') && c['eq'] === 0) return { tipo: 'ninguna-contraindicada' };
    if (!soloClaves(c, 'count', 'gte') || !entero(c['gte'])) return null;
    if (c['count'] === 'contraindicated') return { tipo: 'contraindicadas', n: c['gte'] };
    if (c['count'] === 'risky') return { tipo: 'riesgo', n: c['gte'] };
    return null;
  }
  if ('persona' in c) {
    const p = c['persona'];
    if (!soloClaves(c, 'persona') || !esObjeto(p) || !soloClaves(p, 'bond', 'activation')) return null;
    const bond = p['bond'];
    const activation = p['activation'];
    const bondValido = bond === undefined || (typeof bond === 'string' && bond in VINCULO_EN_PALABRAS);
    const activationValida = activation === undefined || (typeof activation === 'string' && activation in ACTIVACION_EN_PALABRAS);
    if (!bondValido || !activationValida || (bond === undefined && activation === undefined)) return null;
    return {
      tipo: 'persona', ...(bond !== undefined ? { bond: bond as VinculoPersona } : {}), ...(activation !== undefined ? { activation: activation as ActivacionPersona } : {}),
    };
  }
  return null;
}

/**
 * Las frases de una condición: ninguna si no hay condición, una si es sencilla, varias si es un «todas» de frases sencillas.
 * `null` si el editor no sabe mostrarla en frases.
 */
export function partesDeCondicion(c: CondicionFinal | null): ParteDeCondicion[] | null {
  if (c === null) return [];
  if (esObjeto(c) && 'all' in c) {
    if (!soloClaves(c, 'all') || !Array.isArray(c['all']) || c['all'].length < 1) return null;
    const partes = c['all'].map(parteDe);
    return partes.every((p): p is ParteDeCondicion => p !== null) ? partes : null;
  }
  const una = parteDe(c);
  return una ? [una] : null;
}

function condicionDeParte(p: ParteDeCondicion): CondicionFinal {
  switch (p.tipo) {
    case 'hito': return { milestone: p.clave };
    case 'sin-hito': return { not: { milestone: p.clave } };
    case 'contraindicadas': return { count: 'contraindicated', gte: p.n };
    case 'ninguna-contraindicada': return { count: 'contraindicated', eq: 0 };
    case 'riesgo': return { count: 'risky', gte: p.n };
    case 'persona': return { persona: { ...(p.bond ? { bond: p.bond } : {}), ...(p.activation ? { activation: p.activation } : {}) } };
  }
}

/** Las frases vueltas condición: sin frases no hay condición; una sola es la condición; varias van unidas con «y» (`all`). */
export function condicionDePartes(partes: ParteDeCondicion[]): CondicionFinal | null {
  if (partes.length === 0) return null;
  return partes.length === 1 ? condicionDeParte(partes[0]) : { all: partes.map(condicionDeParte) };
}

/** Una frase nueva del tipo pedido, con valores que ya se pueden guardar; `null` si no se puede armar (por ejemplo, sin hitos). */
export function parteNueva(tipo: TipoDeParte, hitos: ReadonlyArray<{ clave: string }>): ParteDeCondicion | null {
  switch (tipo) {
    case 'hito':
    case 'sin-hito':
      return hitos.length ? { tipo, clave: hitos[0].clave } : null;
    case 'contraindicadas': return { tipo, n: 1 };
    case 'riesgo': return { tipo, n: 1 };
    case 'ninguna-contraindicada': return { tipo };
    case 'persona': return { tipo, bond: 'OPEN' };
  }
}

const respuestas = (n: number, clase: string) => `${n} ${n === 1 ? 'respuesta' : 'respuestas'} ${clase}`;

/** Una frase en palabras de la docente. */
export function describirParte(p: ParteDeCondicion, hitos: ReadonlyArray<{ clave: string; nombre: string }>): string {
  const nombre = (clave: string) => hitos.find((h) => h.clave === clave)?.nombre ?? clave;
  switch (p.tipo) {
    case 'hito': return `Si cumplió el hito «${nombre(p.clave)}»`;
    case 'sin-hito': return `Si no cumplió el hito «${nombre(p.clave)}»`;
    case 'contraindicadas': return `Si eligió al menos ${respuestas(p.n, p.n === 1 ? 'contraindicada' : 'contraindicadas')}`;
    case 'ninguna-contraindicada': return 'Si no eligió ninguna respuesta contraindicada';
    case 'riesgo': return `Si eligió al menos ${respuestas(p.n, 'con riesgo')}`;
    case 'persona': {
      const estado = [p.bond ? VINCULO_EN_PALABRAS[p.bond] : null, p.activation ? ACTIVACION_EN_PALABRAS[p.activation] : null].filter(Boolean);
      return `Si la persona terminó ${estado.join(' y ')}`;
    }
  }
}
