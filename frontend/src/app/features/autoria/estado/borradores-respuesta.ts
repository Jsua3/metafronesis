import type { CasoBorrador, Respuesta } from '../modelo/caso';

/** BORRADOR: respaldo local, separado por caso y escena; nunca sustituye un guardado confirmado. */
type Borrador = { escenaId: string; respuesta: Respuesta };
const clave = (id: CasoBorrador['id']) => `autoria-respuestas:${id}`;

export function leerBorradores(id: CasoBorrador['id']): Borrador[] {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(clave(id)) ?? '[]');
    return Array.isArray(valor) ? valor.filter((b): b is Borrador => !!b && typeof b.escenaId === 'string'
      && !!b.respuesta && typeof b.respuesta.id === 'string' && typeof b.respuesta.texto === 'string'
      && typeof b.respuesta.razon === 'string' && typeof b.respuesta.retroalimentacion === 'string'
      && !!b.respuesta.efectos && !b.respuesta.destinoId) : [];
  } catch { return []; }
}

export function escribirBorradores(id: CasoBorrador['id'], borradores: Borrador[]): boolean {
  try {
    if (borradores.length) localStorage.setItem(clave(id), JSON.stringify(borradores));
    else localStorage.removeItem(clave(id));
    return true;
  } catch { return false; }
}
