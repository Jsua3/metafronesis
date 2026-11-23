import type { CasoBorrador, Escena } from './caso';
import { revisarCaminos, type Aviso } from './caminos';
import { puedeEnviar, sugerencias, type Falta } from './revision';

/**
 * Qué clase de pendiente es (EDITOR.md §3.6). La compuerta no cambia: `puedeEnviar` sigue devolviendo todas las faltas y
 * el envío sigue bloqueado por las mismas. Lo que cambia es el tono con que se muestran:
 *
 * - `por-escribir`: trabajo que todavía no se hizo. Se cuenta como avance y alimenta «Siguiente paso»; nunca es un aviso.
 * - `por-corregir`: algo que la docente escribió quedó incoherente. Es lo único que se muestra como aviso.
 * - `sugerencia`: no impide enviar; va en gris, al final.
 */
export type TipoPendiente = 'por-escribir' | 'por-corregir' | 'sugerencia';

/** Las cinco etapas del hilo, en orden (§3.1). */
export const ETAPAS = ['datos', 'lugar', 'historia', 'evaluacion', 'enviar'] as const;
export type Etapa = (typeof ETAPAS)[number];

export interface Pendiente extends Falta {
  tipo: TipoPendiente;
  etapa: Etapa;
  /** La escena a la que pertenece, si es de una escena (para la cuenta del riel y de la cabecera de la escena). */
  escenaId: string | null;
}

/** Una escena «por escribir»: sin una sola línea y sin una sola respuesta. */
export function estaVacia(escena: Pick<Escena, 'lineas' | 'respuestas'>): boolean {
  return escena.lineas.length === 0 && escena.respuestas.length === 0;
}

const escenaDeRuta = (ruta: string): string | null => /\/escena\/([^/?]+)/.exec(ruta)?.[1] ?? null;

/** La etapa de una falta, por su regla y por adónde lleva. */
function etapaDe(f: Falta, aviso: Aviso | undefined): Etapa {
  if (f.codigo === 'CHECKLIST_INCOMPLETE') return 'enviar';
  if (f.ir.ruta.startsWith('/editor/sala/')) return 'lugar';
  if (aviso?.tipo === 'final-sin-hito') return 'evaluacion';
  if (f.ir.ruta.startsWith('/editor/finales') || f.codigo === 'milestone-unreachable' || f.codigo === 'ending-unreachable'
    || f.codigo === 'ending-without-default') return 'evaluacion';
  return 'historia';
}

/**
 * Clasifica las faltas de `puedeEnviar` (que ya incluyen los avisos de `revisarCaminos`, en sus primeras posiciones) y las
 * sugerencias. Reglas de §3.6; todo lo que no cae en ellas es «por corregir»:
 *
 * - `sin-salida` en una escena vacía → por escribir.
 * - `inalcanzable` y `sin-final`, mientras quede alguna escena vacía → por escribir («se resuelve al conectar las escenas»).
 * - `milestone-unreachable`, mientras ninguna respuesta marque algún hito o queden escenas vacías → por escribir.
 * - `CHECKLIST_INCOMPLETE` → etapa Enviar; es trabajo por hacer (no algo mal escrito) y solo se muestra allí.
 */
export function clasificarPendientes(caso: CasoBorrador): Pendiente[] {
  const avisos = revisarCaminos(caso);
  const vacias = new Set(caso.escenas.filter(estaVacia).map((e) => e.id));
  const quedanVacias = vacias.size > 0;
  const algunHitoMarcado = caso.escenas.some((e) => e.respuestas.some((r) => (r.efectos.hitos ?? []).length > 0));

  const faltas = puedeEnviar(caso).faltas.map((f, i): Pendiente => {
    // `puedeEnviar` arma su lista empezando por los avisos de caminos, en el mismo orden: la i-ésima falta es el i-ésimo aviso.
    const aviso = i < avisos.length ? avisos[i] : undefined;
    const escenaId = aviso?.escenaId ?? escenaDeRuta(f.ir.ruta);
    const porEscribir =
      (aviso?.tipo === 'sin-salida' && aviso.escenaId !== null && vacias.has(aviso.escenaId))
      || ((aviso?.tipo === 'inalcanzable' || aviso?.tipo === 'sin-final') && quedanVacias)
      || (f.codigo === 'milestone-unreachable' && (!algunHitoMarcado || quedanVacias))
      || f.codigo === 'CHECKLIST_INCOMPLETE';
    return { ...f, escenaId, etapa: etapaDe(f, aviso), tipo: porEscribir ? 'por-escribir' : 'por-corregir' };
  });

  const otras = sugerencias(caso).map((f): Pendiente => ({
    ...f, tipo: 'sugerencia', etapa: f.ir.ruta.startsWith('/editor/sala/') ? 'lugar' : f.ir.ruta.startsWith('/editor/finales') ? 'evaluacion' : 'historia',
    escenaId: escenaDeRuta(f.ir.ruta),
  }));
  return [...faltas, ...otras];
}

/** Los «por corregir» del caso: el número del botón «Pendientes» de la barra. */
export function porCorregir(pendientes: readonly Pendiente[]): Pendiente[] {
  return pendientes.filter((p) => p.tipo === 'por-corregir');
}
