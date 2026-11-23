/**
 * La biblioteca de lugares (`GET /api/biblioteca/lugares[/<id>]`).
 *
 * El detalle de un lugar es el `escenario.json` de la biblioteca (esquema 2) campo por campo, con una sola
 * diferencia: el servidor cambia cada ruta de imagen por su dirección pública (`/assets/biblioteca/…`). Los
 * contratos generados (`generated/openapi-contracts.d.ts`) no tipan estas dos rutas, así que se tipan a mano.
 */

export type Encuadre = 'tres-paredes' | 'dos-paredes-izquierda' | 'dos-paredes-derecha' | 'una-pared';
/** Las seis expresiones del kit de personajes: cada una tiene su retrato. */
export type Expresion = 'neutral' | 'alegre' | 'preocupada' | 'triste' | 'cautelosa' | 'en-crisis';
export type Mirando = 'izquierda' | 'derecha';
export type TipoObjeto =
  | 'PERSON' | 'OBJECT' | 'ROUTE' | 'TOOL' | 'WARNING' | 'EXIT'
  | 'PROP' | 'TOOL_TARGET' | 'TRIGGER' | 'NOTE' | 'RESOURCE';

export interface Punto {
  x: number;
  y: number;
}

/** Un mueble u objeto colocado en una sala; `x, y` es su punto de apoyo en el suelo. */
export interface Colocacion extends Punto {
  ref: string;
  espejo?: boolean;
}

export interface ColocacionPersonaje extends Punto {
  ref: string;
  mirando: Mirando;
  expresion: Expresion;
}

export interface Puerta extends Punto {
  id: string;
  hacia: string;
  etiqueta: string;
}

export interface Sala {
  id: string;
  nombre: string;
  descripcion: string;
  encuadre: Encuadre;
  fondo: string;
  entrada: Punto;
  muebles: Colocacion[];
  objetos: Colocacion[];
  personajes: ColocacionPersonaje[];
  puertas: Puerta[];
}

export interface Recorrido {
  id: string;
  nombre: string;
  descripcion: string;
  salas: string[];
}

export interface MuebleCatalogo {
  id: string;
  nombre: string;
  arte: string;
  ancho: number;
  alto: number;
  colision: boolean;
}

/** La animación que se reproduce cuando la persona se acerca a un objeto. */
export interface AnimacionCerca {
  hoja: string;
  cuadros: number;
  fps: number;
}

export interface ObjetoCatalogo {
  id: string;
  nombre: string;
  tipo: TipoObjeto;
  arte: string;
  textoInteraccion: string;
  /** Lo que muestra «Revisar» en los objetos NOTE y RESOURCE. */
  alRevisar?: string;
  efecto?: 'ninguno' | 'pista';
  animacionCerca?: AnimacionCerca;
  desdeModelo?: string;
  /** Hitos del lugar que este objeto ayuda a cumplir (con los guiones de la biblioteca). */
  hitos?: string[];
}

export interface HerramientaCatalogo {
  id: string;
  nombre: string;
  descripcion: string;
  arte: string;
  alRevisar?: string;
  animacionCerca?: AnimacionCerca;
  desdeModelo?: string;
  hitos?: string[];
}

export interface Personaje {
  id: string;
  nombre: string;
  rol: string;
  recipeId: string;
}

/** Un hito del lugar, con la clave que trae la biblioteca (con guiones). */
export interface HitoLugar {
  key: string;
  label: string;
  description: string;
  decisive: boolean;
}

export type NivelRiesgoLugar = 'VARIABLE' | 'MODERATE' | 'SEVERE' | 'EXTREME';

/** El detalle de un lugar: lo que `GET /api/biblioteca/lugares/<id>` entrega. */
export interface Escenario {
  esquema: 1 | 2;
  id: string;
  nombre: string;
  descripcion: string;
  temas: string[];
  completo: boolean;
  arteProvisional: boolean;
  salas: Sala[];
  recorridosSugeridos: Recorrido[];
  catalogo: {
    muebles: MuebleCatalogo[];
    objetos: ObjetoCatalogo[];
    herramientas: HerramientaCatalogo[];
  };
  personajes: Personaje[];
  hitos?: HitoLugar[];
  nivelRiesgoPorDefecto?: NivelRiesgoLugar;
}

/** Un lugar en la lista: `salas` y `hitos` son cuántas hay. */
export interface LugarResumen {
  id: string;
  nombre: string;
  descripcion: string;
  salas: number;
  completo: boolean;
  arteProvisional: boolean;
  temas: string[];
  hitos: number;
  nivelRiesgoPorDefecto: NivelRiesgoLugar;
  /** Dirección pública de la imagen de portada. */
  portada: string;
}
