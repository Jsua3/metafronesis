/**
 * El ensayo del borrador (contrato 2.1, 7): reglas puras del modo ensayo de la pantalla del juego y del panel de autora.
 * Sin Angular ni Phaser. El panel se arma con el bloque `rehearsal` del servidor (`explored`, `explorable`, `scenes`): no
 * con listas globales del mundo ni del editor.
 */
import type {
  Activation, Bond, ExploredFactKind, Milestone, RehearsalAdjustBody, RehearsalBlock, RehearsalComment, RehearsalOption,
} from '../../../core/models/simulation.model';
import { DRAFT_COPY } from '../draft-copy';
import { missedFactsText } from '../outcome-text.util';

/** La escena `desde` de la dirección (`?desde=33`): un entero positivo, o `null` para empezar en la de inicio. */
export function escenaDesde(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * ¿Hay que confirmar con la lectura del bloque si el ensayo sigue vivo? Solo en modo ensayo y ante un 403/404 (las rutas del
 * juego de un ensayo descartado responden 403, Ruling 3, 7.4; las del panel, 404) o un 409 (ensayo ya cerrado).
 */
export function debeConfirmarEnsayo(modo: 'student' | 'rehearsal', err: unknown): boolean {
  if (modo !== 'rehearsal') return false;
  const status = (err as { status?: unknown } | null)?.status;
  return status === 403 || status === 404 || status === 409;
}

/** Lo que dice la lectura del bloque cuando falla: el ensayo se descartó (404 `REHEARSAL_GONE`), se cerró (409 `REHEARSAL_CLOSED`) o es otra cosa (`null`). */
export function veredictoDeLectura(err: unknown): 'perdido' | 'cerrado' | null {
  const e = err as { status?: unknown; error?: { code?: unknown } | null } | null;
  if (e?.status === 404 && e.error?.code === 'REHEARSAL_GONE') return 'perdido';
  if (e?.status === 409 && e.error?.code === 'REHEARSAL_CLOSED') return 'cerrado';
  return null;
}

/** Una escena `desde` que ya no existe (400 al abrir el ensayo) se reintenta desde el inicio. */
export function reintentarSinDesde(desde: number | null, err: unknown): boolean {
  return desde !== null && (err as { status?: unknown } | null)?.status === 400;
}

export interface CasillaExplorado { kind: ExploredFactKind; key: string; label: string; marcada: boolean }

export interface PanelEnsayo {
  escenaId: number;
  escenas: { id: number; title: string }[];
  /** Lo que `PATCH explorado` admite en la escena actual, con lo que cuenta hoy marcado. */
  explorado: CasillaExplorado[];
  persona: { bond: Bond; activation: Activation; label: string };
  hitos: { key: string; label: string; cumplido: boolean }[];
  ocultas: { id: number; text: string; porQue: string }[];
  comentarios: { index: number; personaje: string; line: string; estado: string }[];
  avisos: string[];
  camino: string[];
}

const LISTA_DE: Record<ExploredFactKind, keyof NonNullable<RehearsalAdjustBody['explorado']>> = {
  talked: 'talked', inspected: 'inspected', has: 'has', used: 'used',
};

const VINCULOS: Record<Bond, string> = {
  WITHDRAWN: DRAFT_COPY.rehearsalBondWithdrawn.text,
  GUARDED: DRAFT_COPY.rehearsalBondGuarded.text,
  OPEN: DRAFT_COPY.rehearsalBondOpen.text,
};
const ACTIVACIONES: Record<Activation, string> = {
  CALM: DRAFT_COPY.rehearsalActivationCalm.text,
  TENSE: DRAFT_COPY.rehearsalActivationTense.text,
  CRISIS: DRAFT_COPY.rehearsalActivationCrisis.text,
};

export const VINCULOS_EN_ORDEN: readonly Bond[] = ['WITHDRAWN', 'GUARDED', 'OPEN'];
export const ACTIVACIONES_EN_ORDEN: readonly Activation[] = ['CALM', 'TENSE', 'CRISIS'];

export function palabraDeVinculo(bond: Bond): string { return VINCULOS[bond]; }
export function palabraDeActivacion(activation: Activation): string { return ACTIVACIONES[activation]; }

/** Por qué una respuesta que el estudiante no vería no aparece. */
export function porQueNoAparece(o: RehearsalOption): string {
  if (o.retainedBy === 'facts') return `${DRAFT_COPY.rehearsalMissing.text} ${missedFactsText(o.missing)}`;
  if (o.retainedBy === 'broken') return DRAFT_COPY.rehearsalBroken.text;
  return DRAFT_COPY.rehearsalHeldByCondition.text;
}

/** Cuándo se dice un comentario, o por qué todavía no. */
export function estadoComentario(c: RehearsalComment): string {
  if (c.due) return DRAFT_COPY.rehearsalCommentDue.text;
  if (c.retainedBy === 'broken') return DRAFT_COPY.rehearsalCommentBroken.text;
  if (c.retainedBy === 'absent') return DRAFT_COPY.rehearsalCommentAbsent.text;
  if (c.missing.length > 0) return `${DRAFT_COPY.rehearsalCommentWaiting.text} ${missedFactsText(c.missing)}`;
  return DRAFT_COPY.rehearsalHeldByCondition.text;
}

/** Lo que el panel muestra, armado con el bloque del servidor y los hitos que declara el caso (`rules.milestones`). */
export function armarPanel(block: RehearsalBlock, ctx: { hitosDeclarados: readonly Milestone[] }): PanelEnsayo {
  const cumplidos = new Set(block.milestones);
  const declarados = ctx.hitosDeclarados.length > 0
    ? ctx.hitosDeclarados.map(h => ({ key: h.key, label: h.label }))
    : block.milestones.map(key => ({ key, label: key }));
  return {
    escenaId: block.sceneId,
    escenas: block.scenes.map(s => ({ id: s.id, title: s.title })),
    explorado: block.explorable.map(e => ({
      kind: e.kind, key: e.key, label: e.label, marcada: block.explored[LISTA_DE[e.kind]].includes(e.key),
    })),
    persona: { ...block.persona },
    hitos: declarados.map(h => ({ ...h, cumplido: cumplidos.has(h.key) })),
    ocultas: block.options.filter(o => !o.offered).map(o => ({ id: o.id, text: o.text, porQue: porQueNoAparece(o) })),
    comentarios: block.comments.map(c => ({ index: c.index, personaje: c.personaje, line: c.line, estado: estadoComentario(c) })),
    avisos: [...block.warnings],
    camino: block.path.map(p => p.title),
  };
}

/** Lo explorado completo que se quiere (el `PATCH` reemplaza las cuatro listas), con el cambio aplicado. */
export function cuerpoExplorado(
  panel: PanelEnsayo, cambio: { kind: ExploredFactKind; key: string; marcada: boolean },
): NonNullable<RehearsalAdjustBody['explorado']> {
  const cuerpo = { talked: [] as string[], inspected: [] as string[], has: [] as string[], used: [] as string[] };
  for (const casilla of panel.explorado) {
    const igual = casilla.kind === cambio.kind && casilla.key === cambio.key;
    if (igual ? cambio.marcada : casilla.marcada) cuerpo[LISTA_DE[casilla.kind]].push(casilla.key);
  }
  return cuerpo;
}
