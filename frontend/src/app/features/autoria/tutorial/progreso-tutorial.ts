/** Dónde va la docente en el tutorial. Vive en este navegador, por usuario (no se sincroniza entre dispositivos). */
export interface ProgresoTutorial {
  version: 1;
  /** El id del caso de práctica en el store (`String(caseVersionId)`); `null` si aún no se creó. */
  casoId: string | null;
  capitulo: number;
  paso: number;
  /** Ids de los capítulos terminados (sus logros). */
  completados: string[];
  /** Ids de los pasos prácticos hechos de verdad (no saltados). */
  practicos: string[];
  terminado: boolean;
}

export const PROGRESO_INICIAL: ProgresoTutorial = {
  version: 1, casoId: null, capitulo: 0, paso: 0, completados: [], practicos: [], terminado: false,
};

export function claveProgreso(userId: number | string | null | undefined): string {
  return `siep.tutorial.v1.${userId ?? 'anonimo'}`;
}

const esListaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function valido(v: unknown): v is ProgresoTutorial {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return p['version'] === 1 && (p['casoId'] === null || typeof p['casoId'] === 'string')
    && Number.isInteger(p['capitulo']) && Number.isInteger(p['paso'])
    && esListaDeTextos(p['completados']) && esListaDeTextos(p['practicos']) && typeof p['terminado'] === 'boolean';
}

export function leerProgreso(userId: number | string | null | undefined): ProgresoTutorial {
  try {
    const crudo = globalThis.localStorage?.getItem(claveProgreso(userId));
    if (!crudo) return { ...PROGRESO_INICIAL };
    const v: unknown = JSON.parse(crudo);
    return valido(v) ? v : { ...PROGRESO_INICIAL };
  } catch {
    return { ...PROGRESO_INICIAL };
  }
}

export function guardarProgreso(userId: number | string | null | undefined, p: ProgresoTutorial): void {
  try {
    globalThis.localStorage?.setItem(claveProgreso(userId), JSON.stringify(p));
  } catch {
    // Sin almacenamiento (modo privado estricto, cuota llena): el tutorial sigue, solo no se podrá retomar.
  }
}
