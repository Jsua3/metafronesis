/**
 * Tipos de un caso en borrador: lo que el docente ve y edita. Los nombres son los del editor; las equivalencias con
 * la API de autoría (nodo, mapa, opción, reglas…) viven en `desde-api.ts` y `hacia-api.ts`.
 *
 * Los ids son los del servidor, como texto (`String(id)`), salvo los de lo que aún no se guardó (`escena-ab12…`).
 */
import type { FormativeLevel, Gesto, Intensity, ResponseClass, RiskLevel } from '../../../core/models/simulation.model';
import type { EstructuraDeSala } from '../../simulator/sala/catalogo';
import type { Muro, Zona } from './geometria';
import type { Colocacion, ColocacionPersonaje, Escenario, Expresion, Puerta, Sala } from './escenario';

/** En el caso, una puerta hacia una sala que no se eligió queda sin destino. */
export type PuertaCaso = Omit<Puerta, 'hacia'> & { hacia: string | null; muro?: Muro; pos?: number; modelo?: string; par?: string; sentidoUnico?: boolean };

/**
 * Un mueble u objeto colocado en una sala del caso. `clave` es la del objeto en el mapa (la que lo identifica al
 * guardar la sala); una pieza recién agregada aún no la tiene.
 */
export type ColocacionCaso = Colocacion & {
  clave?: string;
  /**
   * La respuesta (la opción del servidor, por su número) que ofrece este objeto del mapa: tocarlo la elige. Es otra forma de ofrecer una
   * respuesta, sin una persona. Ausente si no ofrece ninguna. Se conserva al guardar la sala.
   */
  decisionOptionId?: number;
  /** El código de la herramienta que entrega este objeto (la del caso); ausente si no entrega ninguna. Se conserva al guardar la sala. */
  toolCode?: string;
  /** Lo puso o lo movió el asistente y el docente aún no lo acepta. Ausente = no está marcado. */
  marcaIa?: boolean;
};

/**
 * Cómo se mueve una persona de la sala: se queda quieta (por defecto), camina por la sala o va y viene entre el lugar
 * donde la puso el docente y otro punto (`hasta`). Es el `metadata.movimiento` del juego, leído sin pérdida.
 */
export type MovimientoPersonaje = 'quieto' | 'deambula' | { tipo: 'va-y-viene'; hasta: { x: number; y: number } }
  | { tipo: 'ruta'; puntos: { x: number; y: number }[]; modo: 'circuito' | 'ida-y-vuelta'; pausaMs?: number };

export type ColocacionPersonajeCaso = ColocacionPersonaje & {
  clave?: string;
  /** Ausente = «no se sabe»: se conserva lo que el servidor tenía. Al leer un caso siempre viene. */
  movimiento?: MovimientoPersonaje;
  /** La persona a atender de la sala (a lo sumo una por sala). Ausente = se conserva lo que el servidor tenía. */
  personaClave?: boolean;
  /** La puso o la movió el asistente y el docente aún no la acepta. Ausente = no está marcada. */
  marcaIa?: boolean;
};

/** Sala del caso: conserva de dónde salió (si salió de un lugar) para poder «Volver a la sala original». */
export type SalaCaso = Omit<Sala, 'puertas' | 'muebles' | 'objetos' | 'personajes'> & {
  muebles: ColocacionCaso[];
  objetos: ColocacionCaso[];
  personajes: ColocacionPersonajeCaso[];
  puertas: PuertaCaso[];
  estructura: EstructuraDeSala | null;
  choques: Record<string, Zona>;
  /** El lugar y la sala de la biblioteca de los que se copió; `null` en una sala creada a mano o de un caso sin lugar. */
  origen: { lugarId: string; salaId: string } | null;
};

/**
 * La clase de una respuesta, la única etiqueta que el docente y el reporte comparten:
 * recomendada, aceptable, con riesgo o contraindicada.
 */
export type ClaseRespuesta = ResponseClass;

/** Qué tan intensa es una escena: una escena alta pide un aviso para el estudiante. */
export type IntensidadEscena = Intensity;

/** El nivel de riesgo del caso. */
export type NivelRiesgo = RiskLevel;

/** Un hito del caso: un paso profesional que el estudiante debe dar. Los decisivos deciden el final. */
/** Una competencia de la rúbrica del caso: su código (el de las respuestas) y su nombre. */
export interface CompetenciaCaso {
  codigo: string;
  nombre: string;
}

export interface Hito {
  /** Letras, números y «_» (la biblioteca los trae con guiones; al copiarlos pasan a «_»). */
  clave: string;
  nombre: string;
  descripcion: string;
  decisivo: boolean;
}

/**
 * Lo que una respuesta mueve en el caso. `persona` son pasos de −1 a +1 por eje (vínculo y activación de la persona
 * usuaria); sin `persona`, el servidor usa el paso de la clase. `competencias` son códigos del catálogo.
 */
export interface EfectosRespuesta {
  persona?: { bond?: number; activation?: number };
  hitos?: string[];
  competencias?: string[] | Record<string, FormativeLevel | null>;
}

export interface Linea {
  id: string;
  personajeId: string;
  texto: string;
  expresion: Expresion;
  /**
   * La emoción tal como la guardó el servidor (un caso viejo trae «concerned», «danger»…). Se lee como el retrato que
   * le corresponde (`expresion`), pero se conserva para no reescribirla si la línea se guarda sin cambiar la expresión.
   */
  emocionDeOrigen?: string;
  marcaIa: boolean;
}

/** Cómo reacciona el personaje a una respuesta (2.1): todo opcional; `{}` = sin reacción. */
export interface Reaccion {
  linea?: string;
  emocion?: Expresion;
  gesto?: Gesto;
  /** La clave del personaje que reacciona (la de `CasoBorrador.personajes`). */
  personaje?: string;
}

/** Una ayuda de la escena: `id` es el del servidor como texto, o `pista-…` si aún no se guardó. */
export interface Pista {
  id: string;
  texto: string;
}

/** Lo que dice un personaje al acercarse el jugador, con su condición opcional (`cuando`, el JSON del documento tal cual). */
export interface Comentario {
  personaje: string;
  linea: string;
  cuando?: Record<string, unknown>;
  emocion?: Expresion;
  gesto?: Gesto;
}

/** Una herramienta del caso (la que un objeto de alguna sala puede entregar). */
export interface HerramientaDelCaso {
  codigo: string;
  nombre: string;
}

export interface Respuesta {
  id: string;
  texto: string;
  /** `null` mientras el docente no la clasifica (el servidor exige una clase al guardarla). */
  clase: ClaseRespuesta | null;
  /** Por qué es contraindicada; obligatoria solo en esa clase. */
  razon: string;
  retroalimentacion: string;
  efectos: EfectosRespuesta;
  destinoId: string | null;
  marcaIa: boolean;
  /**
   * Cuándo aparece la respuesta: la condición del documento, el JSON tal cual (`{}` o ausente = siempre). Al guardar solo se manda
   * si la docente la cambió.
   */
  requiere?: Record<string, unknown>;
  /** Cómo reacciona el personaje al elegirla; ausente o `{}` = sin reacción. Al guardar solo se manda si cambió. */
  reaccion?: Reaccion;
}

export interface Escena {
  id: string;
  titulo: string;
  /** Lo que se cuenta de la escena antes de que la persona decida (la narración del nodo). */
  narracion: string;
  /** La sala de la escena; `null` si la escena no tiene mapa (un final sin sala, el inicio de un caso en blanco). */
  salaId: string | null;
  lineas: Linea[];
  respuestas: Respuesta[];
  esFinal: boolean;
  posicion: { x: number; y: number };
  /** `MEDIUM` por defecto; `HIGH` pide `advertencia`. */
  intensidad: IntensidadEscena;
  /** El aviso que el estudiante lee antes de una escena de intensidad alta; `null` si no hay. */
  advertencia: string | null;
  /**
   * Los recursos de apoyo que lee el estudiante en esta escena (a quién acudir, qué línea llamar). La casilla «protocolos de
   * seguridad» de la lista de verificación se respalda con que alguna escena tenga uno con texto. Ausente = los que ya tuviera
   * el servidor (un caso nuevo no los trae).
   */
  recursosApoyo?: string[];
  /** El objetivo de la escena (hasta 200 caracteres); ausente o vacío = no lo declara. Al guardar solo se manda si cambió. */
  objetivo?: string;
  /** Las pistas de la sala de la escena (hasta 280 caracteres cada una), en su orden. */
  pistas?: Pista[];
  /** Lo que dicen los personajes al acercarse (hasta 6). Ausente = no se sabe; al guardar solo se manda si cambió. */
  comentarios?: Comentario[];
  /** La escena la creó la IA y el docente aún no la acepta. */
  marcaIa?: boolean;
}

/** Lo que cuenta una condición: cuántas respuestas de esa clase eligió la persona. */
export type ConteoClase = 'recommended' | 'acceptable' | 'risky' | 'contraindicated';

/** Cómo termina una persona usuaria: su vínculo y su activación. */
export type VinculoPersona = 'WITHDRAWN' | 'GUARDED' | 'OPEN';
export type ActivacionPersona = 'CALM' | 'TENSE' | 'CRISIS';

/** Un comparador numérico; si hay varios, se cumplen todos. */
export interface Comparadores {
  gte?: number;
  gt?: number;
  lte?: number;
  lt?: number;
  eq?: number;
}

/**
 * Cuándo se muestra un final: el vocabulario del servidor (`casedef/conditions`). Un árbol de condiciones:
 * todas, alguna, ninguna, un hito cumplido, cuántas respuestas de una clase, o cómo quedó la persona.
 */
export type CondicionFinal =
  | { all: CondicionFinal[] }
  | { any: CondicionFinal[] }
  | { not: CondicionFinal }
  | { milestone: string }
  | ({ count: ConteoClase } & Comparadores)
  | { persona: { bond?: VinculoPersona; activation?: ActivacionPersona } };

export type TonoFinal = 'critical' | 'positive' | 'warning' | 'neutral';

export interface Final {
  /** La clave del final en el caso (letras, números y «_»). */
  id: string;
  nombre: string;
  texto: string;
  tono: TonoFinal;
  /** `null` en el final por defecto (el último): aplica cuando ningún otro se cumple. */
  condicion: CondicionFinal | null;
  marcaIa: boolean;
}

/** Las claves de los cuatro finales de plantilla, en el orden en que se evalúan. */
export type ClaveFinalPlantilla = 'critica' | 'protectora' | 'riesgo_persistente' | 'con_brechas';

/** Lo que el docente cambió del nombre o el texto de un final de plantilla; lo que no cambió sigue siendo el del modelo. */
export type TextosPlantilla = Partial<Record<ClaveFinalPlantilla, { nombre?: string; texto?: string }>>;

/** En qué estado está el caso en el servidor: solo un borrador se puede editar. */
export type EstadoCaso = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

/** Un ítem de la lista de verificación ética y académica del caso: su texto y quién lo fija los pone el servidor. */
export interface ItemLista {
  codigo: string;
  texto: string;
  obligatorio: boolean;
  cumplido: boolean;
  /** El texto aún está pendiente de la validación de Psicología. */
  enBorrador: boolean;
  /** Quién lo respalda, en palabras («Lo comprueba el sistema», «Declaración de quien autora el caso»…); `null` si no se sabe. */
  respaldo: string | null;
  /** ¿Existe ya lo que respalda la casilla? `null` si es solo una declaración. */
  respaldado: boolean | null;
  /**
   * Quién respalda el ítem: `author` (declaración de la docente), `constancia` (la docente lo declara al enviar y Psicología lo
   * confirma al aprobar) o `system` (lo comprueba el sistema con los datos del caso). Ausente con un servidor que no lo dice.
   */
  quien?: 'system' | 'constancia' | 'author' | null;
}

export interface ListaVerificacion {
  items: ItemLista[];
  /** Psicología ya registró la constancia de la revisión de contenido (no es una casilla de la autora). */
  constanciaRegistrada: boolean;
}

export interface CasoBorrador {
  id: string;
  /** La revisión del caso que se está viendo (viaja en cada cambio); 0 en un caso que aún no está en el servidor. */
  revision: number;
  titulo: string;
  /** El contexto que lee el estudiante antes de empezar (texto plano); ausente en un borrador que aún no está en el servidor. */
  contexto?: string;
  /** Los objetivos de aprendizaje del caso, uno por renglón; ausente en un borrador que aún no está en el servidor. */
  objetivos?: string[];
  /** Los temas sensibles que el estudiante lee en la ficha antes de empezar (RK-7); ausente con un servidor que aún no los guarda. */
  temasSensibles?: string[];
  /** El lugar de la biblioteca del que se copió; `null` en un caso sin lugar (se edita sin catálogo). */
  lugarId: string | null;
  salas: SalaCaso[];
  escenas: Escena[];
  inicioId: string | null;
  hitos: Hito[];
  nivelRiesgo: NivelRiesgo | null;
  /** `automatico`: los cuatro finales del modelo; `propio`: los del docente (`finales`). */
  modoFinales: 'automatico' | 'propio';
  finales: Final[];
  /** En modo automático, los textos de los cuatro finales de plantilla que el docente reescribió (sin cambios: el servidor usa los del modelo). */
  textosPlantilla?: TextosPlantilla;
  /** Las competencias de la rúbrica del caso, para marcar cuáles evidencia cada respuesta. */
  competencias?: CompetenciaCaso[];
  /** La lista de verificación ética y académica; ausente en un borrador que aún no está en el servidor. */
  lista?: ListaVerificacion;
  /** El estado del caso en el servidor; ausente en un borrador que aún no está allí. */
  estado?: EstadoCaso;
  /** Quien edita ya probó este caso hasta un final (el ensayo); ausente = no. */
  probadoHastaElFinal?: boolean;
  /** Las herramientas del caso (para avisar de las que ningún objeto entrega); ausente si el servidor no las trae. */
  herramientas?: HerramientaDelCaso[];
  /** Personajes y catálogo del lugar, copiados al crear el caso (el caso no depende de la biblioteca). */
  personajes: Escenario['personajes'];
  catalogo: Escenario['catalogo'];
}
