/**
 * El intento reemplazado (V4, 17 nov. 2026): si la misma persona abre el caso otra vez (otra pestaña, otro equipo), el
 * servidor cierra el intento anterior como `REPLACED` y sus rutas responden 404 «Intento no encontrado». La pantalla vieja
 * no debe reintentar para siempre ni decir «Revisa tu conexión»: confirma leyendo el intento y, si también da 404, lo
 * muestra como reemplazado.
 */

function estadoDe(err: unknown): unknown {
  return (err as { status?: unknown } | null)?.status;
}

/** En el juego del estudiante, un 404 de una ruta del intento se confirma con la lectura del intento. */
export function debeConfirmarIntento(modo: 'student' | 'rehearsal', err: unknown): boolean {
  return modo === 'student' && estadoDe(err) === 404;
}

/** La lectura del intento también dio 404: el intento ya no es de esta pantalla (otro lo reemplazó). */
export function intentoPerdido(err: unknown): boolean {
  return estadoDe(err) === 404;
}
