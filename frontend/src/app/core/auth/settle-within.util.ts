/**
 * Espera `work` como mucho `budgetMs`. Si llega a tiempo devuelve su valor; si
 * no, o si falla, devuelve `undefined` sin cancelar el trabajo, que sigue en
 * segundo plano. Sirve para que un inicializador no retenga el primer pintado.
 */
export function settleWithin<T>(work: Promise<T>, budgetMs: number): Promise<T | undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), budgetMs);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
