/**
 * La escena que la barra y la ficha muestran sobre el mundo actual. La respuesta de la decisión ya trae la
 * siguiente, que se presenta al cargar su mundo.
 */

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
