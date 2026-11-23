import universidadJson from '../../../../../../biblioteca/escenarios/universidad/escenario.json';
import type { Escenario } from '../modelo/escenario';

/** Lo que el servidor hace con el arte de un lugar: de ruta relativa a la dirección pública. */
export function conArtePublico(lugar: unknown, lugarId: string): Escenario {
  const prefijo = `/assets/biblioteca/escenarios/${lugarId}/`;
  const copia = structuredClone(lugar) as Record<string, any>;
  const publica = (ruta: unknown) => (typeof ruta === 'string' && ruta.startsWith('arte/') ? prefijo + ruta : ruta);
  for (const sala of copia['salas'] ?? []) sala.fondo = publica(sala.fondo);
  for (const grupo of ['muebles', 'objetos', 'herramientas']) {
    for (const pieza of copia['catalogo']?.[grupo] ?? []) {
      pieza.arte = publica(pieza.arte);
      if (pieza.animacionCerca) pieza.animacionCerca.hoja = publica(pieza.animacionCerca.hoja);
    }
  }
  return copia as unknown as Escenario;
}

/**
 * La universidad de la biblioteca, tal como la entrega `GET /api/biblioteca/lugares/universidad`
 * (el mismo `escenario.json`, con el arte ya en su dirección pública). Es el lugar de las pruebas.
 */
export const universidad: Escenario = conArtePublico(universidadJson, 'universidad');
