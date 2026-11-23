/**
 * Tipos de un lugar de la biblioteca: los de `core/models/biblioteca.model.ts`, que espejan campo por campo el
 * contrato de la biblioteca (`biblioteca/esquema/escenario.schema.json`, esquema 2). Aquí se reexportan con el
 * nombre que usa el editor.
 */
import type { Expresion } from '../../../core/models/biblioteca.model';

export type {
  AnimacionCerca,
  Colocacion,
  ColocacionPersonaje,
  Encuadre,
  Escenario,
  Expresion,
  HerramientaCatalogo,
  HitoLugar,
  LugarResumen,
  Mirando,
  MuebleCatalogo,
  NivelRiesgoLugar,
  ObjetoCatalogo,
  Personaje,
  Puerta,
  Punto,
  Recorrido,
  Sala,
  TipoObjeto,
} from '../../../core/models/biblioteca.model';

/** Las seis expresiones del kit de personajes, en el orden en que se ofrecen. */
export const EXPRESIONES: readonly Expresion[] = ['neutral', 'alegre', 'preocupada', 'triste', 'cautelosa', 'en-crisis'];
