/**
 * Las condiciones de los finales del caso: el mismo vocabulario y la misma lectura que el servidor
 * (`backend_django/apps/simulation/casedef/conditions.py`). Una condición es un árbol de datos; se recorre sin
 * `eval`, y todo lo desconocido o mal formado es «no se cumple».
 */
import type { CondicionFinal, ConteoClase } from './caso';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS } from './persona';

export const CONTEOS: readonly ConteoClase[] = ['recommended', 'acceptable', 'risky', 'contraindicated'];
const COMPARADORES = ['gte', 'gt', 'lte', 'lt', 'eq'] as const;
const VINCULOS = ['WITHDRAWN', 'GUARDED', 'OPEN'];
const ACTIVACIONES = ['CALM', 'TENSE', 'CRISIS'];
/** Hasta dónde se anida una condición; más allá es un dato roto. */
export const PROFUNDIDAD_MAXIMA = 12;

/** Lo que una condición mira de un recorrido: cuántas respuestas de cada clase, qué hitos y cómo quedó la persona. */
export interface ContextoCondicion {
  conteos: Record<ConteoClase, number>;
  hitos: ReadonlySet<string>;
  persona: { bond: string; activation: string };
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const soloClaves = (o: Record<string, unknown>, ...permitidas: string[]) => Object.keys(o).every((k) => permitidas.includes(k));

/** ¿Es una condición del vocabulario, completa y bien formada? */
export function esCondicionValida(c: unknown): c is CondicionFinal {
  return validar(c, 0);
}

function validar(c: unknown, profundidad: number): boolean {
  if (profundidad > PROFUNDIDAD_MAXIMA || !esObjeto(c)) return false;
  for (const grupo of ['all', 'any'] as const) {
    if (grupo in c) {
      const items = c[grupo];
      return soloClaves(c, grupo) && Array.isArray(items) && items.every((i) => validar(i, profundidad + 1));
    }
  }
  if ('not' in c) return soloClaves(c, 'not') && validar(c['not'], profundidad + 1);
  if ('count' in c) {
    const comparadores = COMPARADORES.filter((k) => k in c);
    return soloClaves(c, 'count', ...COMPARADORES) && CONTEOS.includes(c['count'] as ConteoClase)
      && comparadores.length > 0 && comparadores.every((k) => esNumero(c[k]));
  }
  if ('milestone' in c) return soloClaves(c, 'milestone') && typeof c['milestone'] === 'string' && c['milestone'] !== '';
  if ('persona' in c) {
    const p = c['persona'];
    return soloClaves(c, 'persona') && esObjeto(p) && Object.keys(p).length > 0
      && Object.entries(p).every(([k, v]) => (k === 'bond' && VINCULOS.includes(v as string)) || (k === 'activation' && ACTIVACIONES.includes(v as string)));
  }
  return false;
}

function cumple(valor: number, c: Record<string, unknown>): boolean {
  const presentes = COMPARADORES.filter((k) => k in c);
  if (!presentes.length) return false;
  return presentes.every((k) => {
    const limite = c[k] as number;
    return k === 'gte' ? valor >= limite : k === 'gt' ? valor > limite : k === 'lte' ? valor <= limite : k === 'lt' ? valor < limite : valor === limite;
  });
}

/** ¿Se cumple `c` con `ctx`? Lo desconocido o mal formado nunca se cumple. */
export function evaluarCondicion(c: unknown, ctx: ContextoCondicion, profundidad = 0): boolean {
  if (profundidad > PROFUNDIDAD_MAXIMA || !esObjeto(c)) return false;
  const siguiente = profundidad + 1;
  if ('all' in c || 'any' in c) {
    const grupo = 'all' in c ? 'all' : 'any';
    const items = c[grupo];
    if (!soloClaves(c, grupo) || !Array.isArray(items)) return false;
    return grupo === 'all' ? items.every((i) => evaluarCondicion(i, ctx, siguiente)) : items.some((i) => evaluarCondicion(i, ctx, siguiente));
  }
  if ('not' in c) return soloClaves(c, 'not') && validar(c['not'], siguiente) && !evaluarCondicion(c['not'], ctx, siguiente);
  if ('count' in c) {
    if (!validar(c, 0)) return false;
    return cumple(ctx.conteos[c['count'] as ConteoClase] ?? 0, c);
  }
  if ('milestone' in c) return validar(c, 0) && ctx.hitos.has(c['milestone'] as string);
  if ('persona' in c) {
    if (!validar(c, 0)) return false;
    const persona = c['persona'] as Record<string, string>;
    const actual = ctx.persona as Record<string, string>;
    return Object.entries(persona).every(([k, v]) => actual[k] === v);
  }
  return false;
}

/** Las claves de hito que nombra una condición, en el orden en que aparecen. */
export function hitosDeCondicion(c: unknown, profundidad = 0): string[] {
  if (profundidad > PROFUNDIDAD_MAXIMA || !esObjeto(c)) return [];
  const siguiente = profundidad + 1;
  if (Array.isArray(c['all'])) return c['all'].flatMap((i) => hitosDeCondicion(i, siguiente));
  if (Array.isArray(c['any'])) return c['any'].flatMap((i) => hitosDeCondicion(i, siguiente));
  if ('not' in c) return hitosDeCondicion(c['not'], siguiente);
  if (typeof c['milestone'] === 'string') return [c['milestone']];
  return [];
}

const CLASE_EN_PALABRAS: Record<ConteoClase, [string, string]> = {
  recommended: ['recomendada', 'recomendadas'],
  acceptable: ['aceptable', 'aceptables'],
  risky: ['con riesgo', 'con riesgo'],
  contraindicated: ['contraindicada', 'contraindicadas'],
};

/** Una condición en palabras para el docente: «cumple “Valorar el riesgo” y elige al menos 2 respuestas contraindicadas». */
export function describirCondicion(c: unknown, hitos: ReadonlyArray<{ clave: string; nombre: string }>): string {
  if (!esCondicionValida(c)) return 'una condición que el editor no reconoce';
  const recurre = (x: CondicionFinal) => describirCondicion(x, hitos);
  if ('all' in c) return c.all.length ? c.all.map(recurre).join(' y ') : 'siempre';
  if ('any' in c) return c.any.length ? c.any.map(recurre).join(' o ') : 'nunca';
  if ('not' in c) return `no se cumple que ${recurre(c.not)}`;
  if ('milestone' in c) return `cumple «${hitos.find((h) => h.clave === c.milestone)?.nombre ?? c.milestone}»`;
  if ('persona' in c) {
    const partes = [
      c.persona.bond ? VINCULO_EN_PALABRAS[c.persona.bond] : null,
      c.persona.activation ? ACTIVACION_EN_PALABRAS[c.persona.activation] : null,
    ].filter(Boolean);
    return `la persona termina ${partes.join(' y ')}`;
  }
  const clase = CLASE_EN_PALABRAS[c.count];
  const cuantas = (n: number) => `${n} ${n === 1 ? 'respuesta' : 'respuestas'} ${clase[n === 1 ? 0 : 1]}`;
  const frases = [
    c.eq === 0 ? `no elige ninguna respuesta ${clase[0]}` : c.eq !== undefined ? `elige exactamente ${cuantas(c.eq)}` : null,
    c.gte !== undefined ? `elige al menos ${cuantas(c.gte)}` : null,
    c.gt !== undefined ? `elige más de ${cuantas(c.gt)}` : null,
    c.lte !== undefined ? `elige como máximo ${cuantas(c.lte)}` : null,
    c.lt !== undefined ? `elige menos de ${cuantas(c.lt)}` : null,
  ].filter(Boolean);
  return frases.join(' y ');
}
