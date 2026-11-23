/**
 * Parte la nota de transición en su pestaña y su texto (bloque U1): «Capítulo 2 · La noticia. Hospital, madrugada.» queda
 * como pestaña «Capítulo 2» sobre la placa «La noticia. Hospital, madrugada.». Sin el prefijo «Capítulo <n> · » todo va
 * en la placa y no hay pestaña. Pura: no toca el DOM ni el estado.
 */
export function partirNotaDeTransicion(nota: string): { capitulo: string | null; texto: string } {
  const partes = /^Capítulo\s+(\d+)\s*·\s*([\s\S]+)$/.exec(nota.trim());
  return partes ? { capitulo: 'Capítulo ' + partes[1], texto: partes[2] } : { capitulo: null, texto: nota };
}
