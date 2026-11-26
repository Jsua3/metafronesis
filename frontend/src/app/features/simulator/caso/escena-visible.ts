/**
 * La escena que la barra y la ficha muestran sobre el mundo actual. La respuesta de la decisión ya trae la
 * siguiente, que se presenta al cargar su mundo.
 */
import { GuiaAutorada } from './guia';

/** Lo mínimo que hace falta para comparar dos escenas. */
export interface EscenaComparable {
  readonly key: string;
}

/**
 * La escena que se retiene hasta aplicar el nuevo mundo: la anterior, si la decisión lleva a otra; `null` si la escena es la
 * misma (o falta alguna de las dos) y por tanto no hay nada que posponer.
 */
export function escenaRetenida<T extends EscenaComparable>(antes: T | null, despues: EscenaComparable | null): T | null {
  if (!antes || !despues) return null;
  return antes.key === despues.key ? null : antes;
}

/** Una guía sin número de etapa pertenece a la sala visitada por puerta. El nodo del intento sigue su propio recorrido. */
export function fichaDeLaSala(
  escena: { title: string; goal?: string } | null,
  mapa: { title: string } | null | undefined,
  guia: GuiaAutorada | null,
): { titulo: string | null; objetivo: string } {
  if (guia?.paso === 0 && mapa) {
    return { titulo: mapa.title, objetivo: guia.objetivo || guia.pasos[0]?.texto || '' };
  }
  return { titulo: escena?.title ?? null, objetivo: escena?.goal ?? '' };
}
