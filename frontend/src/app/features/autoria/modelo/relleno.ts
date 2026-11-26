export const PATRONES_RELLENO: readonly string[] = [
  "^respuesta\\s+\\d+\\s+de\\s+la\\s+persona\\s+profesional[.!…?]*$",
  "^esta respuesta tiene consecuencias en el vinculo con la persona consultante[.!…?]*$",
  "^(?:escribe|escribir|introduce|introducir)\\s+(?:aqui\\s+)?(?:la |una |el |un |tu )?(?:respuesta|retroalimentacion|texto|dialogo)(?:\\s+aqui)?[.!…?]*$",
  "^\\[\\s*(?:respuesta|retroalimentacion|texto|dialogo)(?:\\s+\\d+)?\\s*\\]$",
  "^lorem ipsum\\b.*$"
];
import type { Escena } from './caso';

/** Contrato compartido con la compuerta: frases de muestra, no juicios sobre la calidad clínica. */
const expresiones = PATRONES_RELLENO.map((p) => new RegExp(p, 'u'));
export function esRelleno(texto: string): boolean {
  const normalizado = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return expresiones.some((p) => p.test(normalizado));
}
export function tieneRelleno(escena: Pick<Escena, 'lineas' | 'respuestas' | 'narracion'>): boolean {
  return esRelleno(escena.narracion) || escena.lineas.some((l) => esRelleno(l.texto))
    || escena.respuestas.some((r) => esRelleno(r.texto) || esRelleno(r.retroalimentacion));
}
