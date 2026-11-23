/**
 * Turno de los comentarios de la escena (contrato 2.1, 4.6): un comentario por acercamiento, en el orden del
 * documento, sin repetir. Lo ya dicho se recuerda en la pestaña (`sessionStorage`), no en el servidor. Módulo puro:
 * sin Angular ni Phaser.
 */
import { WorldComment } from '../../../core/models/simulation.model';

export const DURACION_BURBUJA_MS = 6000;

export interface MemoriaComentarios {
  dichos(): ReadonlySet<string>;
  marcar(id: string): void;
}

type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

function almacenPorDefecto(): Almacen | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function leer(almacen: Almacen | null, clave: string): string[] {
  try {
    const parsed: unknown = JSON.parse(almacen?.getItem(clave) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** `storage` omitido = `sessionStorage`; `null` = solo memoria. Cada lectura y escritura va en try/catch. */
export function memoriaDeComentarios(attemptId: string, storage?: Almacen | null): MemoriaComentarios {
  const almacen = storage === undefined ? almacenPorDefecto() : storage;
  const clave = `siep_comentarios_${attemptId}`;
  const respaldo = new Set<string>();
  return {
    dichos() {
      return new Set([...leer(almacen, clave), ...respaldo]);
    },
    marcar(id) {
      respaldo.add(id);
      try {
        almacen?.setItem(clave, JSON.stringify([...new Set([...leer(almacen, clave), id])]));
      } catch {
        // Sin almacenamiento: queda el respaldo en memoria.
      }
    },
  };
}

/** El primero del documento para esa persona que no se dijo. */
export function siguienteComentario(comments: readonly WorldComment[], objectKey: string, dichos: ReadonlySet<string>): WorldComment | null {
  return comments.find(c => c.objectKey === objectKey && !dichos.has(c.id)) ?? null;
}
