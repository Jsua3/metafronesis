import type { CasoBorrador, Escena, Hito } from './caso';

/** Una respuesta que cumple un hito, con la escena donde está. */
export interface LugarDeHito {
  escenaId: string;
  escenaTitulo: string;
  respuestaId: string;
  respuestaTexto: string;
}

/** Las respuestas del caso que cumplen el hito `clave`, en el orden de las escenas. */
export function dondeSeCumple(caso: Pick<CasoBorrador, 'escenas'>, clave: string): LugarDeHito[] {
  return caso.escenas.flatMap((e) =>
    e.respuestas
      .filter((r) => r.efectos.hitos?.includes(clave))
      .map((r) => ({ escenaId: e.id, escenaTitulo: e.titulo, respuestaId: r.id, respuestaTexto: r.texto })));
}

/**
 * Las escenas a las que se llega desde la de inicio. Una escena final cuenta, pero no lleva a ninguna otra; sin inicio
 * no se llega a ninguna (lo mismo que mide el servidor al publicar).
 */
export function escenasAlcanzables(caso: Pick<CasoBorrador, 'escenas' | 'inicioId'>): Escena[] {
  const porId = new Map(caso.escenas.map((e) => [e.id, e]));
  const inicio = caso.inicioId ? porId.get(caso.inicioId) : undefined;
  if (!inicio) return [];
  const vistas = new Map<string, Escena>([[inicio.id, inicio]]);
  const pendientes = [inicio];
  while (pendientes.length) {
    const escena = pendientes.shift()!;
    if (escena.esFinal) continue;
    for (const r of escena.respuestas) {
      const destino = r.destinoId ? porId.get(r.destinoId) : undefined;
      if (destino && !vistas.has(destino.id)) {
        vistas.set(destino.id, destino);
        pendientes.push(destino);
      }
    }
  }
  return [...vistas.values()];
}

/** Los hitos que ninguna respuesta de las escenas a las que se llega cumple: nadie podría lograrlos. */
export function hitosInalcanzables(caso: Pick<CasoBorrador, 'escenas' | 'inicioId' | 'hitos'>): Hito[] {
  const marcados = new Set(escenasAlcanzables(caso).flatMap((e) => e.respuestas.flatMap((r) => r.efectos.hitos ?? [])));
  return caso.hitos.filter((h) => !marcados.has(h.clave));
}
