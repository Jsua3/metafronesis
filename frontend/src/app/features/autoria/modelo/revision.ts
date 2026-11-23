import type { ValidationIssue } from '../../../core/models/simulation.model';
import { revisarCaminos, type TipoAviso } from './caminos';
import type { CasoBorrador, Escena, Respuesta, SalaCaso } from './caso';
import { competenciasMarcadas } from './efectos';
import { escenasAlcanzables, hitosInalcanzables } from './hitos';
import { evaluarCondicion, esCondicionValida, hitosDeCondicion } from './condiciones';
import { contextosDeRecorridos } from './recorridos';
import { anclaDeElemento, elementoDeRuta, personaDeTrayecto } from './salas-a-documento';

export interface Falta {
  mensaje: string;
  /** El código de la regla del modelo que la causa (el mismo que usa la compuerta del servidor); ausente en los avisos de caminos y de IA. */
  codigo?: string;
  /**
   * A dónde lleva «Llévame ahí»: una ruta y, si hace falta, la acción que muestra la guía o el elemento concreto (`ancla`)
   * al que va el foco al llegar: una respuesta, un hito, un final, el aviso de una escena…
   */
  ir: { ruta: string; accionId?: string; ancla?: string };
}

/** Las seis reglas de publicación del modelo, más las dos que cuelgan de los finales. */
export const CODIGOS_DEL_MODELO = [
  'scene-without-recommended', 'contraindicated-without-reason', 'milestone-unreachable', 'ending-unreachable',
  'ending-without-default', 'competency-without-evidence', 'high-intensity-without-warning',
] as const;

const recorte = (texto: string, largo = 60): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim() || 'sin escribir';
  return limpio.length <= largo ? limpio : `${limpio.slice(0, largo - 1)}…`;
};

const rutaDeEscena = (id: string | number) => `/editor/escena/${id}`;

/** La primera respuesta del caso (escena y respuesta), donde se marcan las competencias. */
function primeraRespuesta(caso: Pick<CasoBorrador, 'escenas'>): { escena: Escena; respuestaId: string } | null {
  const escena = caso.escenas.find((e) => e.respuestas.length > 0);
  return escena ? { escena, respuestaId: escena.respuestas[0].id } : null;
}

/**
 * Las respuestas de la escena que su sala no tiene cómo ofrecer. El estudiante elige una respuesta de dos formas: hablando con
 * una persona de la sala (el guion cuelga de ella) o tocando un objeto del mapa que la ofrece (`decisionOptionId`). Sin personas,
 * solo las ofrecen los objetos; una respuesta recién escrita (sin número del servidor) no puede estar ofrecida por ninguno.
 */
export function respuestasSinForma(escena: Pick<Escena, 'respuestas'>, sala: Pick<SalaCaso, 'personajes' | 'muebles' | 'objetos'>): Respuesta[] {
  if (sala.personajes.length > 0) return [];
  const ofrecidas = new Set([...sala.objetos, ...sala.muebles].flatMap((o) => (o.decisionOptionId === undefined ? [] : [o.decisionOptionId])));
  return escena.respuestas.filter((r) => !(/^\d+$/.test(r.id) && ofrecidas.has(Number(r.id))));
}

/**
 * Una escena con respuestas que su sala no tiene cómo ofrecer (ni una persona ni un objeto del mapa que las ofrezca) no se puede
 * jugar: el estudiante no podría responder. Lleva al catálogo de la sala para agregar una persona.
 */
function faltasDeSalasSinPersonas(caso: Pick<CasoBorrador, 'escenas' | 'salas'>): Falta[] {
  const faltas: Falta[] = [];
  for (const e of caso.escenas) {
    const sala = caso.salas.find((s) => s.id === e.salaId);
    if (!sala || respuestasSinForma(e, sala).length === 0) continue;
    faltas.push({
      mensaje: `La escena «${e.titulo}» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.`,
      ir: { ruta: `/editor/sala/${sala.id}`, ancla: 'catalogo' },
    });
  }
  return faltas;
}

/** Una escena con diálogo, pero sin respuestas, en una sala sin personas: nadie dice sus líneas. Conviene verlo; no impide enviar. */
function avisosDeDialogoSinPersona(caso: Pick<CasoBorrador, 'escenas' | 'salas'>): Falta[] {
  return caso.escenas.flatMap((e) => {
    const sala = caso.salas.find((s) => s.id === e.salaId);
    if (!sala || sala.personajes.length > 0 || e.respuestas.length > 0 || e.lineas.length === 0) return [];
    return [{
      mensaje: `La escena «${e.titulo}» tiene diálogo pero en su sala no hay nadie que lo diga. Agrega una persona.`,
      ir: { ruta: `/editor/sala/${sala.id}`, ancla: 'catalogo' },
    }];
  });
}

/** Las reglas del modelo de respuesta, comprobadas sobre el borrador: lo mismo que mide la compuerta al publicar. */
function faltasDelModelo(caso: CasoBorrador): Falta[] {
  const faltas: Falta[] = [];

  for (const e of caso.escenas) {
    const clasificadas = e.respuestas.length > 0 && e.respuestas.every((r) => r.clase);
    if (!e.esFinal && clasificadas && !e.respuestas.some((r) => r.clase === 'RECOMMENDED')) {
      faltas.push({
        codigo: 'scene-without-recommended',
        mensaje: `La escena «${e.titulo}» no tiene ninguna respuesta recomendada: marca al menos una como «Recomendada».`,
        ir: { ruta: rutaDeEscena(e.id), ancla: 'respuestas-escena' },
      });
    }
    for (const r of e.respuestas) {
      if (r.clase === 'CONTRAINDICATED' && !r.razon.trim()) {
        faltas.push({
          codigo: 'contraindicated-without-reason',
          mensaje: `La respuesta «${recorte(r.texto)}» de la escena «${e.titulo}» es contraindicada y no explica por qué: escribe el motivo de la prohibición.`,
          ir: { ruta: rutaDeEscena(e.id), ancla: `respuesta-${r.id}` },
        });
      }
    }
    if (e.intensidad === 'HIGH' && !e.advertencia?.trim()) {
      faltas.push({
        codigo: 'high-intensity-without-warning',
        mensaje: `La escena «${e.titulo}» es de intensidad alta y no tiene aviso para el estudiante: escríbelo antes de enviar.`,
        ir: { ruta: rutaDeEscena(e.id), ancla: 'aviso-escena' },
      });
    }
  }

  for (const h of hitosInalcanzables(caso)) {
    faltas.push({
      codigo: 'milestone-unreachable',
      mensaje: `El hito «${h.nombre}» no se puede cumplir: ninguna respuesta de las escenas a las que se llega desde el inicio lo marca.`,
      ir: { ruta: '/editor/evaluacion', ancla: `hito-${h.clave}` },
    });
  }

  faltas.push(...faltasDeFinales(caso));
  return faltas;
}

/** Finales propios que ningún recorrido cumple, o sin uno que valga para todos. (Los de plantilla solo avisan en el servidor.) */
function faltasDeFinales(caso: CasoBorrador): Falta[] {
  if (caso.modoFinales !== 'propio' || caso.finales.length === 0) return [];
  const declarados = new Set(caso.hitos.map((h) => h.clave));
  // Si un final nombra un hito que ya no existe, eso es lo que hay que arreglar primero (ya tiene su aviso).
  if (caso.finales.some((f) => hitosDeCondicion(f.condicion).some((h) => !declarados.has(h)))) return [];
  const { contextos, omitido } = contextosDeRecorridos(caso);
  if (omitido || contextos.length === 0) return [];
  const faltas: Falta[] = [];
  for (const f of caso.finales) {
    if (f.condicion === null || !esCondicionValida(f.condicion)) continue;
    if (!contextos.some((ctx) => evaluarCondicion(f.condicion, ctx))) {
      faltas.push({
        codigo: 'ending-unreachable',
        mensaje: `El final «${f.nombre}» no se puede alcanzar: ningún recorrido completo cumple su condición.`,
        ir: { ruta: '/editor/finales', ancla: `final-${f.id}` },
      });
    }
  }
  const sinPorDefecto = !caso.finales.some((f) => f.condicion === null);
  if (sinPorDefecto && caso.finales.every((f) => esCondicionValida(f.condicion))
    && contextos.some((ctx) => !caso.finales.some((f) => evaluarCondicion(f.condicion, ctx)))) {
    faltas.push({
      codigo: 'ending-without-default',
      mensaje: 'Ningún final del caso aplica a todos los recorridos: agrega un final sin condición para el resto.',
      ir: { ruta: '/editor/finales', accionId: 'definir-finales' },
    });
  }
  return faltas;
}

/**
 * ¿Se puede enviar el caso a Psicología? Lo bloquean los avisos de caminos, las respuestas sin clasificar, las reglas
 * del modelo de respuesta (recomendada por escena, motivo de las contraindicadas, hitos y finales que se puedan alcanzar,
 * competencias con evidencia, aviso en las escenas intensas) y cualquier parte generada por IA que el docente aún no aceptó.
 */
export function puedeEnviar(caso: CasoBorrador): { ok: boolean; faltas: Falta[] } {
  const faltas: Falta[] = revisarCaminos(caso).map((a) => ({
    mensaje: a.mensaje,
    ir: a.tipo === 'respuesta-sin-destino' && a.escenaId
      ? { ruta: `/editor/escena/${a.escenaId}`, accionId: 'respuesta-a-escena-nueva' }
      : a.tipo === 'final-sin-hito'
        ? { ruta: '/editor/finales', accionId: 'definir-finales' }
        : { ruta: '/editor', accionId: 'revisar-caminos' },
  }));

  const sinClasificar = caso.escenas.flatMap((e) => e.respuestas.filter((r) => !r.clase).map(() => e.id));
  if (sinClasificar.length) {
    const n = sinClasificar.length;
    faltas.push({
      mensaje: n === 1 ? 'Hay 1 respuesta sin clasificar.' : `Hay ${n} respuestas sin clasificar.`,
      ir: { ruta: `/editor/escena/${sinClasificar[0]}` },
    });
  }

  faltas.push(...faltasDeSalasSinPersonas(caso));
  faltas.push(...faltasDelModelo(caso));

  // La lista de verificación ética: todos los ítems obligatorios marcados (lo mismo que exige la compuerta).
  if (caso.lista?.items.some((i) => i.obligatorio && !i.cumplido)) {
    faltas.push({
      codigo: 'CHECKLIST_INCOMPLETE',
      mensaje: 'Falta completar la lista de verificación: marca todos los ítems obligatorios.',
      ir: { ruta: '/revision', ancla: 'lista-verificacion' },
    });
  }

  const { cuantas, primera } = partesDeIa(caso);
  if (cuantas) {
    faltas.push({
      mensaje: cuantas === 1 ? '1 parte generada por IA sin revisar.' : `${cuantas} partes generadas por IA sin revisar.`,
      ir: primera!,
    });
  }
  return { ok: faltas.length === 0, faltas };
}

/** Cuántas partes sugeridas por la IA siguen sin revisar y a dónde ir a la primera. */
function partesDeIa(caso: CasoBorrador): { cuantas: number; primera: Falta['ir'] | null } {
  let cuantas = 0;
  let primera: Falta['ir'] | null = null;
  for (const e of caso.escenas) {
    const partes = (e.marcaIa ? 1 : 0) + e.lineas.filter((l) => l.marcaIa).length + e.respuestas.filter((r) => r.marcaIa).length;
    if (partes && !primera) primera = e.marcaIa ? { ruta: '/editor', accionId: 'aceptar-ia' } : { ruta: `/editor/escena/${e.id}`, accionId: 'aceptar-ia' };
    cuantas += partes;
  }
  // lo que la IA puso o movió en las salas
  let piezasIa = 0;
  for (const sala of caso.salas) {
    const marcadas = [...sala.muebles, ...sala.objetos, ...sala.personajes].filter((p) => p.marcaIa).length;
    if (marcadas && !primera) primera = { ruta: `/editor/sala/${sala.id}`, accionId: 'aceptar-ia' };
    piezasIa += marcadas;
  }
  const finalesIa = caso.finales.filter((f) => f.marcaIa).length;
  if (finalesIa && !primera) primera = { ruta: '/editor/finales', accionId: 'aceptar-ia' };
  return { cuantas: cuantas + piezasIa + finalesIa, primera };
}

/** Los códigos del mundo que los avisos de caminos del editor ya cubren, y el aviso que los cubre. */
const AVISO_QUE_CUBRE: Record<string, TipoAviso> = {
  'WORLD.NO_START_NODE': 'sin-inicio',
  'WORLD.NO_TERMINAL_NODE': 'sin-final',
  'WORLD.UNREACHABLE_NODE': 'inalcanzable',
  'WORLD.NODE_WITHOUT_OPTIONS': 'sin-salida',
};

/** Las respuestas de la escena que tienen número del servidor, en el orden de ese número (el orden en que se exportan las opciones). */
function respuestasConNumero(escena: Pick<Escena, 'respuestas'>): string[] {
  return escena.respuestas.filter((r) => /^\d+$/.test(r.id)).sort((a, b) => Number(a.id) - Number(b.id)).map((r) => r.id);
}

/**
 * A dónde lleva una falta de las reglas OCL-09 a OCL-12 del documento: se lee su `path` (`x-siep.escenas[i].opciones[j].requiere`,
 * `….reaccion…`, `….comentarios[k]…`). La j-ésima opción es la j-ésima respuesta guardada de la escena; si no se halla, se abre la
 * lista de respuestas. El comentario `k` es su posición en el documento, la misma de su ancla.
 */
function irALaFaltaDelDocumento(
  h: ValidationIssue,
  caso: Pick<CasoBorrador, 'escenas'>,
  respuestasGuardadas: ((escenaId: string) => string[]) | undefined,
): Falta['ir'] {
  if (h.nodeId === undefined) return { ruta: '/editor' };
  const ruta = rutaDeEscena(h.nodeId);
  const path = h.path ?? '';
  // se decide por el `path`: OCL-10, OCL-11 y OCL-12 valen tanto para respuestas como para comentarios
  const comentario = /\.comentarios\[(\d+)\]/.exec(path);
  if (comentario) return { ruta, ancla: `comentario-${comentario[1]}` };
  const opcion = /\.opciones\[(\d+)\]\.(requiere|reaccion)\b/.exec(path);
  const escena = caso.escenas.find((e) => e.id === String(h.nodeId));
  const respuesta = opcion && escena ? (respuestasGuardadas?.(escena.id) ?? respuestasConNumero(escena))[Number(opcion[1])] : undefined;
  if (!opcion) return { ruta, ancla: h.code === 'DSL.OCL-12' ? 'comentarios-titulo' : 'respuestas-escena' }; // sin ruta reconocible: el respaldo por código
  if (!respuesta) return { ruta, ancla: 'respuestas-escena' };
  return { ruta, ancla: `${opcion[2] === 'requiere' ? 'aparece-si' : 'reaccion'}-${respuesta}` };
}

/**
 * Lo que la compuerta del servidor dice que impide publicar (los hallazgos que son errores), como faltas del docente. Las
 * reglas del modelo llevan a la escena, la respuesta, el hito o el final concretos; lo que el editor ya listó por su cuenta
 * (`faltasLocales`, y sus avisos de caminos y de IA) no se repite.
 */
export function faltasDelServidor(
  hallazgos: ValidationIssue[],
  caso: CasoBorrador,
  opciones: {
    respuestaDeOpcion: (optionKey: string) => string | undefined;
    faltasLocales: Falta[];
    /**
     * Las respuestas de la escena que ya están en el servidor, en el orden en que este las exporta (por su número). Quien llama
     * lo sabe aun de las creadas en esta visita; si falta, se toman las que traen el número del servidor como id.
     */
    respuestasGuardadas?: (escenaId: string) => string[];
  },
): Falta[] {
  const yaListados = new Set(opciones.faltasLocales.map((f) => f.codigo).filter((c): c is string => !!c));
  const avisosDeCaminos = new Set(revisarCaminos(caso).map((a) => a.tipo));
  const hayIa = partesDeIa(caso).cuantas > 0;
  const faltas: Falta[] = [];

  for (const h of hallazgos) {
    if (h.severity !== 'error' || yaListados.has(h.code)) continue;
    const escena = h.nodeId !== undefined ? rutaDeEscena(h.nodeId) : null;
    const falta = (ir: Falta['ir']): Falta => ({ codigo: h.code, mensaje: h.message, ir });
    switch (h.code) {
      case 'scene-without-recommended':
        faltas.push(falta({ ruta: escena ?? '/editor', ...(escena ? { ancla: 'respuestas-escena' } : {}) }));
        break;
      case 'contraindicated-without-reason': {
        const respuesta = h.optionKey ? opciones.respuestaDeOpcion(h.optionKey) : undefined;
        faltas.push(falta({ ruta: escena ?? '/editor', ...(escena ? { ancla: respuesta ? `respuesta-${respuesta}` : 'respuestas-escena' } : {}) }));
        break;
      }
      case 'milestone-unreachable':
        // E5: los pasos profesionales viven en Evaluación; cada fila conserva su ancla `hito-<clave>`.
        faltas.push(falta({ ruta: '/editor/evaluacion', ...(h.milestoneKey ? { ancla: `hito-${h.milestoneKey}` } : {}) }));
        break;
      case 'ending-unreachable':
        faltas.push(falta({ ruta: '/editor/finales', ...(h.endingKey ? { ancla: `final-${h.endingKey}` } : {}) }));
        break;
      case 'ending-without-default':
        faltas.push(falta({ ruta: '/editor/finales', accionId: 'definir-finales' }));
        break;
      case 'competency-without-evidence': {
        const primera = primeraRespuesta(caso);
        faltas.push(falta(primera ? { ruta: rutaDeEscena(primera.escena.id), ancla: `competencias-${primera.respuestaId}` } : { ruta: '/editor' }));
        break;
      }
      case 'DSL.OCL-09':
      case 'DSL.OCL-10':
      case 'DSL.OCL-11':
      case 'DSL.OCL-12':
        faltas.push(falta(irALaFaltaDelDocumento(h, caso, opciones.respuestasGuardadas)));
        break;
      case 'DSL.OCL-13':
      case 'DSL.OCL-14':
      case 'DSL.OCL-15':
      case 'DSL.OCL-16':
      case 'DSL.OCL-17':
      case 'DSL.OCL-18': {
        const escenaDelCaso = caso.escenas.find((e) => e.id === String(h.nodeId));
        const salaId = escenaDelCaso?.salaId;
        const ruta = h.path?.replace(/^x-siep\.escenas\[\d+\]\.mapa(?=\.|$)/, 'x-siep.escenas[0].mapa');
        if (!salaId || !caso.salas.some((s) => s.id === salaId) || !ruta || !/^x-siep\.escenas\[\d+\]\.mapa(?:\.|$)/.test(h.path ?? '')) {
          faltas.push(falta({ ruta: escena ?? '/editor' }));
          break;
        }
        const destinoSala = { ruta: `/editor/sala/${salaId}` };
        if (!ruta.includes('.estructura.piezas[')) {
          faltas.push(falta(destinoSala));
          break;
        }
        // El orden de escenas del servidor puede diferir; solo se conserva el de las piezas de esta sala.
        const destino = elementoDeRuta(ruta, { ...caso, escenas: [escenaDelCaso] });
        faltas.push(falta(destino
          ? { ...destinoSala, ancla: anclaDeElemento(salaId, destino.elemento) }
          : { ruta: escena ?? '/editor' }));
        break;
      }
      case 'DSL.OCL-19': {
        // El trayecto de una persona: a la sala y, si se reconoce, a esa persona en el lienzo.
        const escenaDelCaso = caso.escenas.find((e) => e.id === String(h.nodeId));
        const salaId = escenaDelCaso?.salaId;
        if (!escenaDelCaso || !salaId || !caso.salas.some((s) => s.id === salaId)) {
          faltas.push(falta({ ruta: escena ?? '/editor' }));
          break;
        }
        const clave = personaDeTrayecto(caso, escenaDelCaso.id, h.message, h.path);
        faltas.push(falta({ ruta: `/editor/sala/${salaId}`, ...(clave ? { ancla: anclaDeElemento(salaId, { tipo: 'objeto', id: clave }) } : {}) }));
        break;
      }
      case 'high-intensity-without-warning':
        faltas.push(falta({ ruta: escena ?? '/editor', ...(escena ? { ancla: 'aviso-escena' } : {}) }));
        break;
      case 'ETHICS.NO_SUPPORT_RESOURCES': {
        // Los recursos de apoyo se escriben en el guion de una escena: se lleva a la primera, donde está su campo.
        const primera = caso.escenas[0];
        faltas.push(falta(primera ? { ruta: rutaDeEscena(primera.id), ancla: 'recursos-escena' } : { ruta: '/editor' }));
        break;
      }
      case 'CHECKLIST_INCOMPLETE':
        // La lista de verificación se completa en la pantalla de revisión.
        faltas.push(falta({ ruta: '/revision', ancla: 'lista-verificacion' }));
        break;
      case 'AI_SUGGESTED_UNREVIEWED':
        if (!hayIa) faltas.push(falta({ ruta: '/editor', accionId: 'aceptar-ia' }));
        break;
      default: {
        const cubierto = AVISO_QUE_CUBRE[h.code];
        if (cubierto && avisosDeCaminos.has(cubierto)) break;
        faltas.push(falta({ ruta: escena ?? '/editor' }));
      }
    }
  }
  return faltas;
}

/**
 * Competencias de la rúbrica que ninguna respuesta parece evidenciar. Solo avisa: el editor deriva los códigos de todos los
 * criterios de la rúbrica y el servidor solo cuenta los activos enlazados al catálogo, así que la autoridad es la compuerta
 * (si ella bloquea, su falta se lista aparte). Mientras nadie declare competencias en las respuestas, no hay aviso.
 */
function avisosDeCompetencias(caso: CasoBorrador): Falta[] {
  const hayDeclaraciones = caso.escenas.some((e) => e.respuestas.some((r) => competenciasMarcadas(r.efectos).length > 0));
  if (!hayDeclaraciones) return [];
  const declaradas = new Set(escenasAlcanzables(caso).flatMap((e) => e.respuestas.flatMap((r) => competenciasMarcadas(r.efectos))));
  const primera = primeraRespuesta(caso);
  return (caso.competencias ?? []).filter((c) => !declaradas.has(c.codigo)).map((c) => ({
    codigo: 'competency-without-evidence',
    mensaje: `La competencia «${c.nombre}» de la rúbrica parece no tener evidencia: ninguna respuesta la marca. La compuerta de Psicología lo confirma al enviar.`,
    ir: primera ? { ruta: rutaDeEscena(primera.escena.id), ancla: `competencias-${primera.respuestaId}` } : { ruta: '/editor' },
  }));
}

/** El aviso del servidor por un texto que obligaría a desplazarse para leerlo al jugar (``casedef/lectura.py``). */
export const CODIGO_LARGO_DE_LECTURA = 'DSL.READING_LENGTH';

/**
 * Los avisos de largo de lectura que da el servidor, como sugerencias: no impiden enviar, citan el texto que se pasa y llevan a
 * su escena. Valen igual para un caso generado con la IA que para uno escrito a mano.
 */
export function avisosDeLectura(hallazgos: ValidationIssue[]): Falta[] {
  return hallazgos
    .filter((h) => h.code === CODIGO_LARGO_DE_LECTURA && h.severity === 'warning')
    .map((h) => ({ codigo: h.code, mensaje: h.message, ir: { ruta: h.nodeId !== undefined ? rutaDeEscena(h.nodeId) : '/editor' } }));
}

/** Cosas que conviene mirar pero no impiden enviar. */
export function sugerencias(caso: CasoBorrador): Falta[] {
  const lista: Falta[] = [...avisosDeCompetencias(caso), ...avisosDeDialogoSinPersona(caso)];
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  if (caso.probadoHastaElFinal !== true) lista.push({ mensaje: 'Todavía no probaste el caso completo en el juego.', ir: { ruta: '/editor', accionId: 'probar' } });
  caso.escenas.forEach((e) => {
    const vaciasL = e.lineas.filter((l) => !l.texto.trim()).length;
    const vaciasR = e.respuestas.filter((r) => !r.texto.trim() || !r.retroalimentacion.trim()).length;
    if (vaciasL) lista.push({ mensaje: `«${e.titulo}» tiene ${vaciasL === 1 ? 'una línea vacía' : `${vaciasL} líneas vacías`}.`, ir: { ruta: `/editor/escena/${e.id}` } });
    if (vaciasR) lista.push({ mensaje: `«${e.titulo}» tiene ${vaciasR === 1 ? 'una respuesta' : `${vaciasR} respuestas`} sin texto o sin lo que lee el estudiante después.`, ir: { ruta: `/editor/escena/${e.id}` } });
  });
  if (caso.modoFinales === 'propio' && caso.finales.some((f) => !f.texto.trim())) {
    lista.push({ mensaje: 'Hay finales sin el texto que lee el estudiante al terminar.', ir: { ruta: '/editor/finales' } });
  }
  return lista;
}
