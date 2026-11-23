import {
  CompetencyEvidence, CompetencyLevelEntry, FormativeLevel, OwnerEvaluationEntry, RubricCriterionView,
  RubricEvaluationView, RubricLevelOption, descriptorDelNivel,
} from '../../../core/models/revision.model';

/**
 * Lo que no es pantalla en el panel de valoración (EDITOR §5.4, bloque R2): el estado del formulario, la traducción del
 * teclado a acciones, el emparejamiento de un criterio con su evidencia y la forma que lee el estudiante. Son funciones
 * puras, sin Angular, para que el componente solo pinte y coordine (SOLID, S) y para probarlas sin montar nada.
 */

/** Lo que el formulario tiene en un momento: sirve para saber si hay cambios sin guardar. */
export interface FormSnapshot {
  levels: Record<number, FormativeLevel | null>;
  comments: Record<number, string>;
  comment: string;
}

/** Un nivel y una observación por criterio: lo único que viaja al servidor (nunca un número, RN-09). */
export interface ScoreEnviado {
  criterionId: number;
  level: FormativeLevel;
  comment: string;
}

/** Los cuatro niveles, en el orden de la escala; sus nombres llegan de `DRAFT_COPY` o del servidor. */
export const ORDEN_NIVELES: readonly FormativeLevel[] = ['EN_INICIO', 'EN_PROCESO', 'LOGRADO', 'DESTACADO'];

export function snapshotOf(rubric: RubricEvaluationView | null | undefined): FormSnapshot {
  const criteria = rubric?.criteria ?? [];
  const scores = rubric?.scores ?? [];
  const score = (id: number) => scores.find(item => item.criterionId === id);
  return {
    // Sin nivel guardado el criterio queda «Sin calificar» (null).
    levels: Object.fromEntries(criteria.map(item => [item.id, score(item.id)?.level ?? null])),
    comments: Object.fromEntries(criteria.map(item => [item.id, score(item.id)?.comment ?? ''])),
    comment: rubric?.comment ?? '',
  };
}

export function sameSnapshot(a: FormSnapshot, b: FormSnapshot): boolean {
  const keys = new Set([...Object.keys(a.levels), ...Object.keys(b.levels)].map(Number));
  for (const key of keys) {
    if ((a.levels[key] ?? null) !== (b.levels[key] ?? null)) return false;
    if ((a.comments[key] ?? '').trim() !== (b.comments[key] ?? '').trim()) return false;
  }
  return a.comment.trim() === b.comment.trim();
}

/**
 * Lo guardado cambió (respondió el guardado o llegó la recarga) sin cambiar de intento: cada campo que la docente
 * tocó desde que pulsó guardar (`tocados`) se queda como lo dejó; el resto toma lo nuevo. Así no se pierde lo que
 * escribió mientras el guardado o la recarga estaban en camino (revisión de la pasada final).
 */
export function conservarEdiciones<T>(
  nueva: Record<number, T>,
  anterior: Record<number, T> | undefined,
  tocados: ReadonlySet<number>,
): Record<number, T> {
  const resultado: Record<number, T> = { ...nueva };
  if (!anterior) return resultado;
  for (const key of tocados) {
    if (key in anterior) resultado[key] = anterior[key];
  }
  return resultado;
}

/** ¿Hay algo guardado en el servidor? (un nivel, una observación o la retroalimentación). */
export function tieneContenido(snapshot: FormSnapshot): boolean {
  return Object.values(snapshot.levels).some(Boolean)
    || Object.values(snapshot.comments).some(text => !!text.trim())
    || !!snapshot.comment.trim();
}

// ── Teclado (EDITOR §5.4, «Valoración rápida con teclado») ─────────────────────────────────────────────────────────
export type AccionDeTecla =
  | { tipo: 'nivel'; nivel: FormativeLevel }
  | { tipo: 'quitar' }
  | { tipo: 'anterior' }
  | { tipo: 'siguiente' }
  | { tipo: 'observacion' };

/**
 * Qué hace una tecla pulsada con el foco en el grupo de niveles de un criterio. Las de una sola cifra o letra solo
 * valen ahí (la excepción que admite WCAG 2.1.4); con un modificador no hacen nada, para no robar atajos del navegador.
 * ← y → no se traducen: son el comportamiento nativo de un grupo de botones de opción.
 */
export function accionDeTecla(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): AccionDeTecla | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const indice = ['1', '2', '3', '4'].indexOf(event.key);
  if (indice >= 0) return { tipo: 'nivel', nivel: ORDEN_NIVELES[indice] };
  switch (event.key) {
    case '0':
    case 'Delete':
      return { tipo: 'quitar' };
    case 'ArrowUp':
      return { tipo: 'anterior' };
    case 'ArrowDown':
      return { tipo: 'siguiente' };
    case 'c':
    case 'C':
      return { tipo: 'observacion' };
    default:
      return null;
  }
}

/** Ctrl+Enter (o ⌘+Enter) guarda la evaluación desde cualquier lugar del panel, también desde un campo de texto. */
export function esGuardarConTeclado(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

// ── Evidencia y valoración del sistema por criterio ──────────────────────────────────────────────────────────────
const mismoCodigo = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

/** Las decisiones (RK-4) que tocan la competencia del criterio; nulo si no hay ninguna o el servidor no las manda. */
export function evidenciaDe(
  criterion: Pick<RubricCriterionView, 'competency'>,
  evidencia: readonly CompetencyEvidence[] | null | undefined,
): CompetencyEvidence | null {
  const grupo = evidencia?.find(item => mismoCodigo(item.code, criterion.competency));
  return grupo?.items.length ? grupo : null;
}

/** Lo que calculó el sistema para la competencia del criterio (solo llega después de que la docente guarda la suya). */
export function sistemaDe(
  criterion: Pick<RubricCriterionView, 'competency'>,
  sistema: readonly CompetencyLevelEntry[] | null | undefined,
): CompetencyLevelEntry | null {
  return sistema?.find(item => mismoCodigo(item.code, criterion.competency)) ?? null;
}

/** «04:24»: el mismo minuto que muestra la línea de tiempo de la evidencia, para reconocer la decisión de un vistazo. */
export function marcaDeTiempo(segundos: number | null | undefined): string | null {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos) || segundos < 0) return null;
  const total = Math.floor(segundos);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const CANTIDADES = ['ningún', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];

/**
 * Cuánto falta, en palabras («Faltan dos criterios»): el panel no muestra cifras (RN-09, `docencia.e2e.ts` comprueba que
 * ninguna se lea como una escala). Más allá de doce, la cifra: una rúbrica así no existe en el programa.
 */
export function textoDeAvance(faltan: number, total: number): string {
  if (!total) return 'Esta rúbrica no tiene criterios.';
  if (faltan <= 0) return 'Todos los criterios tienen nivel.';
  const cantidad = CANTIDADES[faltan] ?? String(faltan);
  return faltan === 1 ? 'Falta un criterio por valorar.' : `Faltan ${cantidad} criterios por valorar.`;
}

/**
 * «Ver cómo lo leerá» (EDITOR §5.4 y §5.5): la misma forma que entrega `GET /attempts/{id}/evaluation` al estudiante,
 * armada con lo que hay en pantalla, para que `app-valoracion-docente` la pinte igual que en el cierre del caso. El
 * nivel global solo lo calcula el servidor: si hay cambios sin guardar, se deja vacío en vez de inventarlo aquí.
 */
export function vistaDelEstudiante(
  rubric: RubricEvaluationView,
  actual: FormSnapshot,
  niveles: readonly RubricLevelOption[],
  conCambios: boolean,
): OwnerEvaluationEntry {
  return {
    rubricName: rubric.rubricName,
    origin: 'DOCENTE',
    evaluatedAt: null,
    comment: actual.comment.trim(),
    overallLevel: conCambios ? null : rubric.overallLevel ?? null,
    criteria: rubric.criteria.map(criterion => {
      const level = actual.levels[criterion.id] ?? null;
      return {
        criterionId: criterion.id,
        title: criterion.title,
        level,
        comment: (actual.comments[criterion.id] ?? '').trim(),
        descriptor: descriptorDelNivel(criterion, level, niveles) ?? undefined,
      };
    }),
  };
}
