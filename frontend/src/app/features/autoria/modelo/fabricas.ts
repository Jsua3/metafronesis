import type { Respuesta } from './caso';

/** Una respuesta recién creada: sin escribir, sin clase y sin efectos. */
export function nuevaRespuesta(id: string, destinoId: string | null = null, cambios: Partial<Respuesta> = {}): Respuesta {
  return { id, texto: '', clase: null, razon: '', retroalimentacion: '', efectos: {}, destinoId, marcaIa: false, ...cambios };
}
