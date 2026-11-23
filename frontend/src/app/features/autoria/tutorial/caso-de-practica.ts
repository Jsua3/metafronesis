// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
export const TITULO_CASO_PRACTICA = 'Caso de práctica · Tutorial';

interface Opciones {
  existentes: readonly { caseVersionId: number; status: string }[];
  casoGuardado: string | null;
  biblioteca: {
    lugares(): Promise<{ id: string; salas: number }[]>;
    escenario(id: string): Promise<{ id: string; descripcion: string; salas: { id: string }[] }>;
  };
  crear(titulo: string, lugarId: string, salas: string[], descripcion: string): Promise<number>;
}

/**
 * El caso sobre el que corre el tutorial: el guardado si sigue siendo un borrador de la docente; si no, uno nuevo con el
 * primer lugar de la biblioteca que tenga salas y sus dos primeras salas. Devuelve el id del caso en el store.
 */
export async function asegurarCasoDePractica(o: Opciones): Promise<string> {
  if (o.casoGuardado && o.existentes.some((c) => String(c.caseVersionId) === o.casoGuardado && c.status === 'DRAFT')) {
    return o.casoGuardado;
  }
  const lugar = (await o.biblioteca.lugares()).find((l) => l.salas > 0);
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  if (!lugar) throw new Error('No hay lugares en la biblioteca para armar el caso de práctica.');
  const escenario = await o.biblioteca.escenario(lugar.id);
  const salas = escenario.salas.slice(0, 2).map((s) => s.id);
  const id = await o.crear(TITULO_CASO_PRACTICA, escenario.id, salas, escenario.descripcion);
  return String(id);
}
