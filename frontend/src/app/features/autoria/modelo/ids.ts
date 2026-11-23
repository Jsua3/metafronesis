/**
 * Caracteres hexadecimales al azar. `crypto.randomUUID` solo existe en un contexto seguro (https o localhost): en el modo aula
 * se entra por `http://<ip-del-equipo>`, y ahí se usa `crypto.getRandomValues`, que existe siempre.
 */
export function hexAleatorio(largo: number): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, '').slice(0, largo);
  const bytes = new Uint8Array(Math.ceil(largo / 2));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, largo);
}

/** Identificador nuevo e irrepetible para escenas, líneas, respuestas y finales del caso. */
export function nuevoId(prefijo: string): string {
  return `${prefijo}-${hexAleatorio(8)}`;
}
