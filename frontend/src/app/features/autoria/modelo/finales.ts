import type { CasoBorrador, ClaveFinalPlantilla, CondicionFinal, ConteoClase, Final, Hito, Respuesta, TextosPlantilla, TonoFinal } from './caso';
import { type ContextoCondicion, evaluarCondicion } from './condiciones';
import { ACTIVACIONES, VINCULOS, acotar, pasoDeRespuesta } from './persona';

/** Los cuatro finales del modelo, en el orden en que se evalúan: gana el primero que se cumple. */
export type FinalAutomatico = ClaveFinalPlantilla;

export const ORDEN_AUTOMATICOS: readonly FinalAutomatico[] = ['critica', 'protectora', 'riesgo_persistente', 'con_brechas'];

/**
 * Nombre y texto de los cuatro finales del modelo (los mismos que el servidor, `services/endings.py`).
 * Borrador: los nombres y los textos están por confirmar con Psicología.
 */
export const FINALES_AUTOMATICOS: Record<FinalAutomatico, { nombre: string; texto: string; tono: TonoFinal }> = {
  critica: {
    nombre: 'Intervención con riesgo de revictimización',
    texto: 'Alguna de tus respuestas pudo hacerle daño a la persona usuaria, o quedaron sin darse pasos de protección que el caso exigía. Revisa tu recorrido con tu docente.',
    tono: 'critical',
  },
  protectora: {
    nombre: 'Intervención protectora',
    texto: 'Cuidaste a la persona usuaria y diste los pasos de protección que el caso pedía. Repasa tu recorrido para ver qué te funcionó.',
    tono: 'positive',
  },
  riesgo_persistente: {
    nombre: 'El riesgo sigue abierto',
    texto: 'Quedó pendiente alguno de los pasos de protección, o varias de tus respuestas dejaron a la persona usuaria en riesgo. Revisa con tu docente qué faltó.',
    tono: 'warning',
  },
  con_brechas: {
    nombre: 'Intervención con brechas',
    texto: 'Hiciste parte del trabajo, pero quedaron respuestas por mejorar. Repasa tu recorrido y piensa qué harías distinto.',
    tono: 'neutral',
  },
};

/**
 * La condición de cada final de plantilla sobre los hitos decisivos del caso (la misma regla que
 * `casedef/legacy.py::template_endings_when`). `con_brechas` no tiene: es el final por defecto.
 */
export function condicionesDePlantilla(decisivos: string[]): Record<FinalAutomatico, CondicionFinal | null> {
  const deben: CondicionFinal[] = decisivos.map((milestone) => ({ milestone }));
  const critica: CondicionFinal[] = [{ count: 'contraindicated', gte: 2 }];
  if (deben.length) critica.push({ all: [{ count: 'contraindicated', gte: 1 }, { not: { all: deben } }] });
  return {
    critica: { any: critica },
    protectora: { all: [{ count: 'contraindicated', eq: 0 }, { count: 'risky', lte: 1 }, ...deben] },
    riesgo_persistente: { any: [...deben.map((item): CondicionFinal => ({ not: item })), { count: 'risky', gte: 3 }] },
    con_brechas: null,
  };
}

/**
 * Los cuatro finales de plantilla del caso, en el orden en que se evalúan. La condición siempre sale de los hitos
 * decisivos de ahora (marcar o desmarcar uno la regenera); el nombre y el texto son los del modelo salvo los que el
 * docente reescribió (`textosPlantilla`), que nunca se pisan.
 */
export function finalesDePlantilla(caso: Pick<CasoBorrador, 'hitos' | 'textosPlantilla'>): Final[] {
  const condiciones = condicionesDePlantilla(caso.hitos.filter((h) => h.decisivo).map((h) => h.clave));
  return ORDEN_AUTOMATICOS.map((id) => {
    const editado = caso.textosPlantilla?.[id];
    return {
      id, nombre: editado?.nombre?.trim() ? editado.nombre : FINALES_AUTOMATICOS[id].nombre,
      texto: editado?.texto?.trim() ? editado.texto : FINALES_AUTOMATICOS[id].texto, tono: FINALES_AUTOMATICOS[id].tono,
      condicion: condiciones[id], marcaIa: false,
    };
  });
}

/** ¿Reescribió el docente el nombre o el texto de algún final de plantilla? */
export function plantillaEditada(caso: Pick<CasoBorrador, 'textosPlantilla'>): boolean {
  return ORDEN_AUTOMATICOS.some((id) => {
    const editado = caso.textosPlantilla?.[id];
    const otroNombre = !!editado?.nombre?.trim() && editado.nombre !== FINALES_AUTOMATICOS[id].nombre;
    const otroTexto = !!editado?.texto?.trim() && editado.texto !== FINALES_AUTOMATICOS[id].texto;
    return otroNombre || otroTexto;
  });
}

const mismoDato = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && mismoDato((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/**
 * Si los finales que guardó el servidor son los cuatro de plantilla (mismas claves, en orden, con la condición que arman
 * los hitos decisivos), devuelve solo lo que el docente reescribió de ellos; si son otra cosa (finales propios), `null`.
 */
export function textosDeLaPlantillaGuardada(guardados: Final[], hitos: Hito[]): TextosPlantilla | null {
  if (guardados.length !== ORDEN_AUTOMATICOS.length) return null;
  const condiciones = condicionesDePlantilla(hitos.filter((h) => h.decisivo).map((h) => h.clave));
  const textos: TextosPlantilla = {};
  for (const [i, id] of ORDEN_AUTOMATICOS.entries()) {
    const f = guardados[i];
    if (f.id !== id || !mismoDato(f.condicion, condiciones[id])) return null;
    const cambios: { nombre?: string; texto?: string } = {};
    if (f.nombre !== FINALES_AUTOMATICOS[id].nombre) cambios.nombre = f.nombre;
    if (f.texto !== FINALES_AUTOMATICOS[id].texto) cambios.texto = f.texto;
    if (Object.keys(cambios).length) textos[id] = cambios;
  }
  return textos;
}

/** La regla de cada final de plantilla en palabras del docente, con el nombre de los hitos decisivos. */
export function reglasDePlantilla(decisivos: Pick<Hito, 'nombre'>[]): Record<FinalAutomatico, string> {
  const nombres = decisivos.map((h) => `«${h.nombre}»`);
  const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : (nombres[0] ?? '');
  const con = decisivos.length > 0;
  return {
    critica: con
      ? `Elige 2 o más respuestas contraindicadas, o una contraindicada sin haber cumplido todos los hitos decisivos (${lista}).`
      : 'Elige 2 o más respuestas contraindicadas.',
    protectora: con
      ? `Cumple todos los hitos decisivos (${lista}), no elige respuestas contraindicadas y elige a lo más una con riesgo.`
      : 'No elige respuestas contraindicadas y elige a lo más una con riesgo.',
    riesgo_persistente: con
      ? `Le falta algún hito decisivo (${lista}), o elige 3 o más respuestas con riesgo.`
      : 'Elige 3 o más respuestas con riesgo.',
    con_brechas: 'En cualquier otro caso.',
  };
}

export type Recorrido = { escenaId: string; respuestaId: string }[];

/** Lo que el recorrido de la persona (sus respuestas, en orden) deja para las condiciones. */
export function contextoDeRecorrido(elegidas: Respuesta[]): ContextoCondicion {
  const conteos: Record<ConteoClase, number> = { recommended: 0, acceptable: 0, risky: 0, contraindicated: 0 };
  const hitos = new Set<string>();
  let bond = 'GUARDED';
  let activation = 'TENSE';
  for (const r of elegidas) {
    if (r.clase) {
      conteos[r.clase.toLowerCase() as ConteoClase]++;
      const [dBond, dActivation] = pasoDeRespuesta(r)!;
      bond = acotar(VINCULOS, bond, dBond);
      activation = acotar(ACTIVACIONES, activation, dActivation);
    }
    for (const h of r.efectos.hitos ?? []) hitos.add(h);
  }
  return { conteos, hitos, persona: { bond, activation } };
}

/**
 * El final que vería el estudiante. `recorrido` son las respuestas que eligió, en orden. En modo propio gana el primer
 * final del docente cuya condición se cumple (el que no tiene condición aplica siempre); si ninguno se cumple, o el modo
 * es automático, gana el primero de los cuatro del modelo que se cumple.
 */
export function evaluarFinal(caso: CasoBorrador, recorrido: Recorrido): { nombre: string; texto: string } {
  const respuestas = new Map(caso.escenas.flatMap((e) => e.respuestas.map((r) => [r.id, r] as const)));
  const elegidas = recorrido.map((p) => respuestas.get(p.respuestaId)).filter((r): r is Respuesta => !!r);
  const ctx = contextoDeRecorrido(elegidas);
  const aplica = (f: Final) => f.condicion === null || evaluarCondicion(f.condicion, ctx);
  const propio = caso.modoFinales === 'propio' ? caso.finales.find(aplica) : undefined;
  const final = propio ?? finalesDePlantilla(caso).find(aplica)!;
  return { nombre: final.nombre, texto: final.texto };
}
