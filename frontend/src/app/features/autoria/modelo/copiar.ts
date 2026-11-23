import type { CasoBorrador, Escena, SalaCaso } from './caso';
import type { Escenario } from './escenario';
import { nuevoId } from './ids';

/** Separación horizontal entre las escenas iniciales en el mapa de escenas. */
export const SEPARACION_ESCENAS = 240;

/**
 * La clave de un hito de la biblioteca (`valorar-el-riesgo`) en la forma que entiende el caso (`valorar_el_riesgo`):
 * la misma traducción que hace el servidor al crear un caso desde un lugar.
 */
export function claveDeHito(clave: string): string {
  return clave.replaceAll('-', '_');
}

/**
 * Elegir un lugar copia su escenario dentro del caso (diseño 5.1): la biblioteca no se
 * modifica y el caso queda independiente. Crea una escena por sala elegida, en ese orden;
 * la primera es el inicio. Una puerta hacia una sala no elegida queda sin destino.
 *
 * Es la copia local, para armar un borrador sin servidor (pruebas y vista previa); el caso real se crea con
 * `POST /api/authoring/cases` y `lugarId` + `salas`, y el servidor hace esta misma copia.
 */
export function copiarEscenarioAlCaso(e: Escenario, salaIds: string[], titulo: string): CasoBorrador {
  const elegidas = new Set(salaIds);
  const salas: SalaCaso[] = salaIds.map((id) => {
    const sala = e.salas.find((s) => s.id === id);
    if (!sala) throw new Error(`La sala «${id}» no existe en «${e.nombre}».`);
    const copia = structuredClone(sala);
    return {
      ...copia,
      estructura: null, choques: {},
      puertas: copia.puertas.map((p) => ({ ...p, hacia: elegidas.has(p.hacia) ? p.hacia : null })),
      origen: { lugarId: e.id, salaId: sala.id },
    };
  });

  const escenas: Escena[] = salas.map((sala, i) => ({
    id: nuevoId('escena'),
    titulo: sala.nombre,
    narracion: sala.descripcion,
    salaId: sala.id,
    lineas: [],
    respuestas: [],
    esFinal: false,
    posicion: { x: i * SEPARACION_ESCENAS, y: 0 },
    intensidad: 'MEDIUM',
    advertencia: null,
  }));

  return {
    id: nuevoId('caso'),
    revision: 0,
    titulo,
    lugarId: e.id,
    salas,
    escenas,
    inicioId: escenas[0]?.id ?? null,
    hitos: (e.hitos ?? []).map((h) => ({ clave: claveDeHito(h.key), nombre: h.label, descripcion: h.description, decisivo: h.decisive })),
    nivelRiesgo: e.nivelRiesgoPorDefecto ?? null,
    modoFinales: 'automatico',
    finales: [],
    personajes: structuredClone(e.personajes),
    catalogo: structuredClone(e.catalogo),
  };
}
