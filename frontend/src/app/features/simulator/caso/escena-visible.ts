/**
 * La escena que la barra y la ficha del objetivo muestran mientras el personaje reacciona (4.3.3): la respuesta de
 * la decisión ya trae la escena siguiente, pero esta no se anuncia hasta que la reacción termina. Módulo puro.
 */

/** Lo mínimo que hace falta para comparar dos escenas. */
export interface EscenaComparable {
  readonly key: string;
}

/**
 * La escena que se retiene durante la reacción: la anterior, si la decisión lleva a otra; `null` si la escena es la
 * misma (o falta alguna de las dos) y por tanto no hay nada que posponer.
 */
export function escenaRetenida<T extends EscenaComparable>(antes: T | null, despues: EscenaComparable | null): T | null {
  if (!antes || !despues) return null;
  return antes.key === despues.key ? null : antes;
}
