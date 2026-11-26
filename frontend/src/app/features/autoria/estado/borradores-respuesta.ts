import type { CasoBorrador, Respuesta } from '../modelo/caso';

export type Borrador = { escenaId: string; respuesta: Respuesta; revision: number; guardado: number };
const prefijo = 'autoria-respuestas:';
const maximo = 12 * 60 * 60 * 1000;
const inicio = (usuario: number, caso: CasoBorrador['id']) => `${prefijo}${usuario}:${caso}:`;

export function leerBorradores(usuario: number, caso: CasoBorrador['id']): Borrador[] {
  try {
    const resultado: Borrador[] = [];
    for (const clave of Object.keys(sessionStorage).filter(k => k.startsWith(inicio(usuario, caso)))) {
      const valor: unknown = JSON.parse(sessionStorage.getItem(clave) ?? '[]');
      if (!Array.isArray(valor)) continue;
      const vigentes = valor.filter((b): b is Borrador => !!b && typeof b.escenaId === 'string'
        && Number.isFinite(b.revision) && Number.isFinite(b.guardado) && b.guardado <= Date.now()
        && Date.now() - b.guardado < maximo && !!b.respuesta && typeof b.respuesta.id === 'string'
        && typeof b.respuesta.texto === 'string' && typeof b.respuesta.razon === 'string'
        && typeof b.respuesta.retroalimentacion === 'string' && !!b.respuesta.efectos && !b.respuesta.destinoId);
      if (vigentes.length) resultado.push(...vigentes); else sessionStorage.removeItem(clave);
    }
    return resultado;
  } catch { return []; }
}

export function escribirBorradores(usuario: number, caso: CasoBorrador['id'], borradores: Borrador[]): boolean {
  try {
    const base = inicio(usuario, caso);
    const porEscena = new Map<string, Borrador[]>();
    for (const b of borradores) porEscena.set(b.escenaId, [...(porEscena.get(b.escenaId) ?? []), b]);
    for (const [escena, lista] of porEscena) sessionStorage.setItem(base + encodeURIComponent(escena), JSON.stringify(lista));
    for (const clave of Object.keys(sessionStorage)) if (clave.startsWith(base) && !porEscena.has(decodeURIComponent(clave.slice(base.length)))) sessionStorage.removeItem(clave);
    return true;
  } catch { return false; }
}

export function limpiarTodosLosBorradores(): void {
  for (const storage of [sessionStorage, localStorage]) {
    try { for (const clave of Object.keys(storage)) if (clave.startsWith(prefijo)) storage.removeItem(clave); } catch { /* almacenamiento no disponible */ }
  }
}
