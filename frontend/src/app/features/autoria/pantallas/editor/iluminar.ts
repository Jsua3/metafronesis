import type { CasoBorrador } from '../../modelo/caso';

/**
 * Qué respuestas (flechas) se iluminan al pasar por una escena del mapa: el camino más corto desde el inicio hasta ella
 * (cómo llega el estudiante) y las que salen de ella (a dónde puede ir). EDITOR-PRO.md, punto 3: «aristas que se
 * iluminan al pasar por encima mostrando el camino».
 *
 * Patrón: función pura (recorrido en anchura); el mapa la usa como un `computed`.
 */
export function caminoIluminado(caso: CasoBorrador, escenaId: string): Set<string> {
  const porId = new Map(caso.escenas.map((e) => [e.id, e]));
  const resultado = new Set<string>();
  for (const r of porId.get(escenaId)?.respuestas ?? []) if (r.destinoId && porId.has(r.destinoId)) resultado.add(r.id);
  if (!caso.inicioId || !porId.has(caso.inicioId) || caso.inicioId === escenaId) return resultado;

  // Recorrido en anchura desde el inicio; `llegada` guarda por qué respuesta se llegó a cada escena la primera vez.
  const llegada = new Map<string, { desde: string; respuesta: string }>();
  const cola = [caso.inicioId];
  const vistas = new Set(cola);
  while (cola.length && !vistas.has(escenaId)) {
    const actual = porId.get(cola.shift()!)!;
    for (const r of actual.respuestas) {
      if (!r.destinoId || vistas.has(r.destinoId) || !porId.has(r.destinoId)) continue;
      vistas.add(r.destinoId);
      llegada.set(r.destinoId, { desde: actual.id, respuesta: r.id });
      cola.push(r.destinoId);
    }
  }
  for (let paso = llegada.get(escenaId); paso; paso = llegada.get(paso.desde)) resultado.add(paso.respuesta);
  return resultado;
}
