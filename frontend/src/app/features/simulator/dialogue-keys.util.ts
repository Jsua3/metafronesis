/** Mapea la letra de una opción ('a'..'d' o 'A'..'D') a un índice 0..3; cualquier otra → null. */
export function letterIndex(key: string): number | null {
  if (key.length !== 1) return null;
  const n = 'abcd'.indexOf(key.toLowerCase());
  return n >= 0 ? n : null;
}

/** El índice de la opción que nombra la tecla: su letra (A a D) o su número (1 a 9). */
export function choiceIndex(key: string): number | null {
  return letterIndex(key) ?? digitIndex(key);
}

/** Mapea una tecla de dígito '1'..'9' a un índice 0..8; cualquier otra → null. */
export function digitIndex(key: string): number | null {
  if (key.length !== 1) return null;
  const n = key.charCodeAt(0) - 48; // '0' = 48
  return n >= 1 && n <= 9 ? n - 1 : null;
}
