/**
 * Ayuda de redacción para los descriptores de una rúbrica analítica (EDITOR.md §5.2). Brookhart: un descriptor DESCRIBE
 * lo que se observa en el intento; no lo califica («excelente», «regular») ni se queda en contar cosas («al menos dos»),
 * porque un recuento no dice cómo se hizo. Es una nota que orienta, nunca un bloqueo: el texto se guarda igual.
 *
 * Función pura (sin Angular) para poder probarla sola y reutilizarla en el editor de casos.
 */
export type AvisoDescriptor = 'juicio' | 'recuento';

// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología.
export const TEXTO_AVISO_DESCRIPTOR: Readonly<Record<AvisoDescriptor, string>> = {
  juicio: 'Describe lo que se observa en el intento, no lo califiques.',
  recuento: 'Contar cosas no dice cómo se hicieron: describe lo que se observa en el intento.',
};

// Palabras de juicio, sin tildes (el texto se normaliza antes de buscar).
const JUICIO = /\b(excelente|excelentes|muy bien|bien hecho|bueno|buena|buenos|buenas|regular|regulares|deficiente|deficientes|malo|mala|malos|malas|pobre|pobres|insuficiente|insuficientes|adecuado|adecuada|optimo|optima)\b/;
// Recuentos: «al menos», «como minimo», «mas de», cifras y números escritos desde el dos. «Un», «uno» y «una» quedan
// fuera a propósito: en español son sobre todo artículos («identifica una necesidad») y darían avisos falsos.
const RECUENTO = /\b(al menos|como minimo|como maximo|mas de|menos de|\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/;

/** Los avisos que merece un descriptor (vacío si está bien o si no hay texto). */
export function avisosDeDescriptor(texto: string | null | undefined): AvisoDescriptor[] {
  const normalizado = (texto ?? '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!normalizado) return [];
  const avisos: AvisoDescriptor[] = [];
  if (JUICIO.test(normalizado)) avisos.push('juicio');
  if (RECUENTO.test(normalizado)) avisos.push('recuento');
  return avisos;
}
