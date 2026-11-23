/**
 * Propuestas del asistente de IA. El servidor (`assistant/propose`) devuelve una lista de cambios ya validada contra el
 * caso guardado, con el vocabulario de diez operaciones de `backend_django/apps/simulation/services/authoring/assistant/schema.py`.
 * Aquí se vuelven a revisar contra el borrador (por si cambió mientras la IA pensaba) y se aplican solo las partes que el
 * docente marca, todo o nada. Todo lo nuevo queda con la marca «sugerido por la IA» hasta que el docente lo acepte.
 *
 * Los números de las propuestas son filas del servidor (escena, personaje, mapa, objeto, opción): el `ResolverIds` los
 * traduce a los ids del borrador. Una escena nueva se declara con `add-scene` y un id temporal `nueva-N`.
 */
import type { Intensity } from '../../../core/models/simulation.model';
import type { CasoBorrador, ClaseRespuesta, CondicionFinal, Escena, Final, TonoFinal } from '../modelo/caso';
import { describirCondicion, esCondicionValida, hitosDeCondicion } from '../modelo/condiciones';
import { SEPARACION_ESCENAS } from '../modelo/copiar';
import { finalesDePlantilla } from '../modelo/finales';
import { EXPRESIONES, type Expresion } from '../modelo/escenario';
import { limitarAZona, zonaCaminable } from '../modelo/geometria';
import { claveDeRegla, claveLibre } from '../modelo/hacia-api';
import { posicionLibre } from '../modelo/trazado';
import { NOMBRE_CLASE, NOMBRE_EXPRESION } from '../modelo/textos';

/** Una escena: el número de una que existe en el servidor o el id temporal de una que declara la propuesta. */
export type RefEscena = number | string;

export type Cambio =
  | { op: 'add-scene'; id: string; title: string; narrative: string; intensity: Intensity; warningMessage: string; afterNodeId: RefEscena | null }
  | { op: 'add-line'; nodeId: RefEscena; characterId: number; text: string; expression: Expresion }
  | {
    op: 'add-response'; nodeId: RefEscena; text: string; responseClass: ClaseRespuesta; feedbackText: string;
    prohibitionReason: string; targetNodeId: RefEscena;
  }
  | { op: 'place-character'; mapId: number; characterId: number; x: number; y: number; expression: Expresion }
  | { op: 'move'; objectId: number; x: number; y: number }
  | { op: 'add-ending'; key: string; title: string; message: string; tone: TonoFinal; when: CondicionFinal | null }
  | { op: 'set-response-class'; decisionId: number; responseClass: ClaseRespuesta; prohibitionReason: string }
  | { op: 'set-persona-effect'; decisionId: number; bond: number | null; activation: number | null }
  | { op: 'mark-milestone'; decisionId: number; milestoneKey: string }
  | { op: 'set-intensity'; nodeId: RefEscena; intensity: Intensity; warningMessage: string };

export const MENSAJE_PROPUESTA_INVALIDA = 'La propuesta no se pudo usar. Pídela de nuevo con otras palabras.';

/** Traduce los números del servidor a los ids del borrador; `undefined` si el borrador no tiene eso. */
export interface ResolverIds {
  escena(nodoId: number): string | undefined;
  /** La clave del personaje del caso. */
  personaje(personajeId: number): string | undefined;
  sala(mapaId: number): string | undefined;
  objeto(objetoId: number): { salaId: string; tipo: 'mueble' | 'objeto' | 'personaje'; indice: number } | undefined;
  respuesta(decisionId: number): { escenaId: string; respuestaId: string } | undefined;
}

/** Para un borrador que no viene del servidor: los números son los ids del borrador. */
export function resolverLocal(caso: CasoBorrador): ResolverIds {
  return {
    escena: (n) => caso.escenas.find((e) => e.id === String(n))?.id,
    personaje: (n) => caso.personajes.find((p) => p.id === String(n))?.id,
    sala: (n) => caso.salas.find((s) => s.id === String(n))?.id,
    objeto: () => undefined,
    respuesta: (n) => {
      const escena = caso.escenas.find((e) => e.respuestas.some((r) => r.id === String(n)));
      return escena ? { escenaId: escena.id, respuestaId: String(n) } : undefined;
    },
  };
}

/** Lo que una propuesta toca, para saber qué guardar en el servidor. */
export interface Tocados {
  /** Escenas nuevas, en el orden en que se crean. */
  escenasNuevas: string[];
  /** Escenas existentes cuyo nodo cambia (la intensidad). */
  escenas: string[];
  guiones: string[];
  respuestas: string[];
  salas: string[];
  finales: boolean;
}

type Resultado = { ok: true; cambios: Cambio[] } | { ok: false; motivo: string };

const esTexto = (v: unknown): v is string => typeof v === 'string';
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const esTemporal = (v: unknown): v is string => esTexto(v) && /^nueva-\d+$/.test(v);

const OPERACIONES = new Set([
  'add-scene', 'add-line', 'add-response', 'place-character', 'move', 'add-ending', 'set-response-class',
  'set-persona-effect', 'mark-milestone', 'set-intensity',
]);

/**
 * Revisa que la propuesta tenga forma de propuesta y que todo lo que nombra exista en el borrador (o se declare antes).
 * Nada se aplica aquí. El servidor ya hizo la revisión de fondo (vocabulario, límites y reglas de contenido).
 */
export function validarPropuesta(caso: CasoBorrador, cambios: unknown, resolver: ResolverIds = resolverLocal(caso)): Resultado {
  if (!Array.isArray(cambios)) return { ok: false, motivo: 'No es una lista de cambios.' };
  const temporales = new Set<string>();
  const hitos = new Set(caso.hitos.map((h) => h.clave));
  for (const [i, c] of cambios.entries()) {
    const mal = (motivo: string): Resultado => ({ ok: false, motivo: `Cambio ${i + 1}: ${motivo}` });
    if (!esObjeto(c) || !esTexto(c['op']) || !OPERACIONES.has(c['op'])) return mal('ese tipo de cambio no existe.');
    const escena = (ref: unknown): boolean =>
      esTemporal(ref) ? temporales.has(ref) : esNumero(ref) && resolver.escena(ref) !== undefined;
    switch (c['op']) {
      case 'add-scene':
        if (!esTemporal(c['id']) || temporales.has(c['id'])) return mal('el id de la escena nueva no es válido.');
        if (!esTexto(c['title']) || !c['title'].trim()) return mal('falta el nombre de la escena.');
        if (c['afterNodeId'] !== null && c['afterNodeId'] !== undefined && !escena(c['afterNodeId'])) return mal('la escena de referencia no existe.');
        if (caso.salas.length === 0) return mal('el caso no tiene salas donde poner la escena.');
        temporales.add(c['id']);
        break;
      case 'add-line':
        if (!escena(c['nodeId'])) return mal('la escena no existe.');
        if (!esNumero(c['characterId']) || resolver.personaje(c['characterId']) === undefined) return mal('el personaje no está en el caso.');
        if (!esTexto(c['text'])) return mal('falta el texto.');
        if (!EXPRESIONES.includes(c['expression'] as Expresion)) return mal('la expresión no existe.');
        break;
      case 'add-response':
        if (!escena(c['nodeId']) || !escena(c['targetNodeId'])) return mal('la escena no existe.');
        if (!esTexto(c['text']) || !esTexto(c['feedbackText'])) return mal('falta el texto.');
        if (!esTexto(c['responseClass']) || !(c['responseClass'] in NOMBRE_CLASE)) return mal('la clase no existe.');
        break;
      case 'place-character':
        if (!esNumero(c['mapId']) || resolver.sala(c['mapId']) === undefined) return mal('la sala no está en el caso.');
        if (!esNumero(c['characterId']) || resolver.personaje(c['characterId']) === undefined) return mal('el personaje no está en el caso.');
        if (!esNumero(c['x']) || !esNumero(c['y'])) return mal('faltan las coordenadas.');
        if (!EXPRESIONES.includes(c['expression'] as Expresion)) return mal('la expresión no existe.');
        break;
      case 'move':
        if (!esNumero(c['objectId']) || resolver.objeto(c['objectId']) === undefined) return mal('no hay nada en esa posición.');
        if (!esNumero(c['x']) || !esNumero(c['y'])) return mal('faltan las coordenadas.');
        break;
      case 'add-ending':
        if (!esTexto(c['key']) || !esTexto(c['title']) || !esTexto(c['message'])) return mal('faltan el nombre o el texto.');
        if (c['when'] !== null && (!esCondicionValida(c['when']) || hitosDeCondicion(c['when']).some((h) => !hitos.has(h)))) {
          return mal('la condición no es válida.');
        }
        break;
      case 'set-response-class':
      case 'set-persona-effect':
      case 'mark-milestone':
        if (!esNumero(c['decisionId']) || resolver.respuesta(c['decisionId']) === undefined) return mal('la respuesta no está en el caso.');
        break;
      case 'set-intensity':
        if (!escena(c['nodeId'])) return mal('la escena no existe.');
        break;
    }
  }
  return { ok: true, cambios: cambios as Cambio[] };
}

function referencias(c: Cambio): RefEscena[] {
  switch (c.op) {
    case 'add-scene': return c.afterNodeId === null ? [] : [c.afterNodeId];
    case 'add-line': case 'set-intensity': return [c.nodeId];
    case 'add-response': return [c.nodeId, c.targetNodeId];
    default: return [];
  }
}

/**
 * Para cada cambio, los índices de las escenas nuevas de la propuesta que necesita, también las
 * de la cadena (una línea de una escena que va después de otra escena nueva necesita las dos).
 */
export function dependencias(cambios: Cambio[]): number[][] {
  const indice = new Map<string, number>();
  cambios.forEach((c, i) => { if (c.op === 'add-scene') indice.set(c.id, i); });
  const directas = cambios.map((c, i) =>
    [...new Set(referencias(c).map((r) => (esTexto(r) ? indice.get(r) : undefined)).filter((j): j is number => j !== undefined && j !== i))]);
  return directas.map((_, i) => {
    const todas: number[] = [];
    const pendientes = [...directas[i]];
    while (pendientes.length) {
      const j = pendientes.shift()!;
      if (j === i || todas.includes(j)) continue;
      todas.push(j);
      pendientes.push(...directas[j]);
    }
    return todas;
  });
}

/** Cómo se llama cada cosa ante el docente. */
function nombres(caso: CasoBorrador, resolver: ResolverIds, todos: Cambio[]) {
  return {
    escena: (ref: RefEscena | null): string => {
      if (ref === null) return 'una escena';
      if (esTexto(ref)) return (todos.find((x) => x.op === 'add-scene' && x.id === ref) as { title?: string } | undefined)?.title ?? 'una escena';
      const id = resolver.escena(ref);
      return caso.escenas.find((e) => e.id === id)?.titulo ?? 'una escena';
    },
    personaje: (n: number): string => {
      const clave = resolver.personaje(n);
      return caso.personajes.find((p) => p.id === clave)?.nombre ?? 'un personaje';
    },
    sala: (mapaId: number): string => {
      const id = resolver.sala(mapaId);
      return caso.salas.find((s) => s.id === id)?.nombre ?? 'una sala';
    },
  };
}

/** Cómo se describe cada parte de una propuesta ante el docente (sin números ni palabras técnicas). */
export function describirCambio(caso: CasoBorrador, c: Cambio, todos: Cambio[], resolver: ResolverIds = resolverLocal(caso)): string {
  const nombre = nombres(caso, resolver, todos);
  const decision = (n: number) => {
    const r = resolver.respuesta(n);
    return caso.escenas.find((e) => e.id === r?.escenaId)?.respuestas.find((x) => x.id === r?.respuestaId);
  };
  switch (c.op) {
    case 'add-scene': return `Escena nueva «${c.title}»`;
    case 'add-line': return `${nombre.personaje(c.characterId)} dice en «${nombre.escena(c.nodeId)}» (${NOMBRE_EXPRESION[c.expression].toLowerCase()}): «${c.text}»`;
    case 'add-response':
      return `Respuesta ${NOMBRE_CLASE[c.responseClass].toLowerCase()} en «${nombre.escena(c.nodeId)}»: «${c.text}» (lleva a «${nombre.escena(c.targetNodeId)}»)`;
    case 'place-character': return `Colocar a ${nombre.personaje(c.characterId)} en ${nombre.sala(c.mapId)}`;
    case 'move': {
      const lado = c.x < 380 ? 'a la izquierda' : c.x > 580 ? 'a la derecha' : 'al centro';
      const objeto = resolver.objeto(c.objectId);
      const sala = caso.salas.find((s) => s.id === objeto?.salaId);
      const lista = objeto && sala ? (objeto.tipo === 'mueble' ? sala.muebles : objeto.tipo === 'objeto' ? sala.objetos : sala.personajes) : [];
      const ref = objeto ? lista[objeto.indice]?.ref : undefined;
      const cosa = objeto?.tipo === 'personaje'
        ? caso.personajes.find((p) => p.id === ref)?.nombre
        : (objeto?.tipo === 'mueble' ? caso.catalogo.muebles : caso.catalogo.objetos).find((x) => x.id === ref)?.nombre;
      return `Mover ${cosa ?? 'un elemento'} ${lado}${sala ? ` en ${sala.nombre}` : ''}`;
    }
    case 'add-ending': {
      const llega = c.when ? `llega si el estudiante ${describirCondicion(c.when, caso.hitos)}` : 'llega cuando no se cumple ningún otro';
      const modelo = caso.modoFinales === 'automatico' ? '. Se agregan también los cuatro finales del modelo, para que puedas editarlos' : '';
      return `Final «${c.title}»: «${c.message}» (${llega}${modelo})`;
    }
    case 'set-response-class': return `Cambiar a «${NOMBRE_CLASE[c.responseClass]}» la respuesta «${decision(c.decisionId)?.texto ?? 'una respuesta'}»`;
    case 'set-persona-effect': return `Cambiar cómo deja a la persona la respuesta «${decision(c.decisionId)?.texto ?? 'una respuesta'}»`;
    case 'mark-milestone': {
      const hito = caso.hitos.find((h) => h.clave === c.milestoneKey);
      return `La respuesta «${decision(c.decisionId)?.texto ?? 'una respuesta'}» cuenta para «${hito?.nombre ?? 'un paso del caso'}»`;
    }
    case 'set-intensity': return `Poner la escena «${nombre.escena(c.nodeId)}» en intensidad ${c.intensity === 'HIGH' ? 'alta' : c.intensity === 'LOW' ? 'baja' : 'media'}`;
  }
}

/**
 * Aplica los cambios marcados sobre una copia del caso y la devuelve, con lo que tocó. Si algo no cuadra
 * (por ejemplo, una línea de una escena nueva que no se marcó), lanza un error y el caso original no cambia: todo o nada.
 * `nuevoId` da ids para lo nuevo (el store lo hace repetible para poder volver a aplicar la propuesta).
 */
export function aplicarPropuesta(
  caso: CasoBorrador, cambios: Cambio[], seleccion: boolean[], resolver: ResolverIds, nuevoId: (prefijo: string) => string,
): { caso: CasoBorrador; tocados: Tocados } {
  const validacion = validarPropuesta(caso, cambios, resolver);
  if (!validacion.ok) throw new Error(validacion.motivo);
  const elegidos = cambios.filter((_, i) => seleccion[i]);
  const deps = dependencias(cambios);
  cambios.forEach((_, i) => {
    if (seleccion[i] && deps[i].some((j) => !seleccion[j])) throw new Error('Una parte necesita una escena nueva que no se marcó.');
  });

  const nuevo = structuredClone(caso);
  const tocados: Tocados = { escenasNuevas: [], escenas: [], guiones: [], respuestas: [], salas: [], finales: false };
  const marcar = (lista: string[], id: string) => { if (!lista.includes(id)) lista.push(id); };
  const real = new Map<string, string>(); // id temporal → id de la escena creada en el borrador
  const escenaDe = (ref: RefEscena): Escena => {
    const id = esTexto(ref) ? real.get(ref) : resolver.escena(ref);
    const escena = nuevo.escenas.find((e) => e.id === id);
    if (!escena) throw new Error('La escena de la propuesta no está en el caso.');
    return escena;
  };

  // Primero las escenas nuevas, para que el resto pueda apuntar a ellas.
  for (const c of elegidos) {
    if (c.op !== 'add-scene') continue;
    const despues = c.afterNodeId === null ? undefined : escenaDe(c.afterNodeId);
    const salaId = despues?.salaId ?? nuevo.escenas.find((e) => e.id === nuevo.inicioId)?.salaId ?? nuevo.salas[0]?.id ?? null;
    const masDerecha = Math.max(0, ...nuevo.escenas.map((e) => e.posicion.x));
    const escena: Escena = {
      id: nuevoId('escena'), titulo: c.title.trim(), narracion: c.narrative.trim(), salaId, lineas: [], respuestas: [], esFinal: false, marcaIa: true,
      intensidad: c.intensity, advertencia: c.warningMessage.trim() ? c.warningMessage.trim() : null,
      posicion: posicionLibre(nuevo.escenas.map((e) => e.posicion),
        despues ? { x: despues.posicion.x + SEPARACION_ESCENAS, y: despues.posicion.y + 140 } : { x: masDerecha + SEPARACION_ESCENAS, y: 0 }),
    };
    nuevo.escenas.push(escena);
    if (!nuevo.inicioId) nuevo.inicioId = escena.id;
    real.set(c.id, escena.id);
    tocados.escenasNuevas.push(escena.id);
  }

  for (const c of elegidos) {
    switch (c.op) {
      case 'add-line': {
        const escena = escenaDe(c.nodeId);
        escena.lineas.push({ id: nuevoId('linea'), personajeId: resolver.personaje(c.characterId)!, texto: c.text, expresion: c.expression, marcaIa: true });
        marcar(tocados.guiones, escena.id);
        break;
      }
      case 'add-response': {
        const escena = escenaDe(c.nodeId);
        const id = nuevoId('respuesta');
        escena.respuestas.push({
          id, texto: c.text, clase: c.responseClass, razon: c.responseClass === 'CONTRAINDICATED' ? c.prohibitionReason : '',
          retroalimentacion: c.feedbackText, efectos: {}, destinoId: escenaDe(c.targetNodeId).id, marcaIa: true,
        });
        marcar(tocados.respuestas, id);
        break;
      }
      case 'place-character': {
        const sala = nuevo.salas.find((s) => s.id === resolver.sala(c.mapId))!;
        const ref = resolver.personaje(c.characterId)!;
        const { x, y } = limitarAZona(zonaCaminable(sala.encuadre), c.x, c.y);
        const usadas = new Set<string>(sala.puertas.map((p) => p.id));
        for (const e of [...sala.muebles, ...sala.objetos, ...sala.personajes]) if (e.clave) usadas.add(e.clave);
        sala.personajes.push({ ref, x, y, mirando: 'izquierda', expresion: c.expression, clave: claveLibre(ref, usadas), marcaIa: true });
        marcar(tocados.salas, sala.id);
        break;
      }
      case 'move': {
        const objeto = resolver.objeto(c.objectId)!;
        const sala = nuevo.salas.find((s) => s.id === objeto.salaId)!;
        const lista = objeto.tipo === 'mueble' ? sala.muebles : objeto.tipo === 'objeto' ? sala.objetos : sala.personajes;
        const elemento = lista[objeto.indice];
        const medio = objeto.tipo === 'mueble' ? (nuevo.catalogo.muebles.find((m) => m.id === elemento.ref)?.ancho ?? 0) / 2 : 0;
        Object.assign(elemento, limitarAZona(zonaCaminable(sala.encuadre), c.x, c.y, medio), { marcaIa: true });
        marcar(tocados.salas, sala.id);
        break;
      }
      case 'add-ending': {
        // El docente pidió un final: pasa a modo «propio». Si venía de «automático», los cuatro finales del modelo se
        // siembran (editables) para que el caso no quede con uno solo, y el propuesto va antes del de por defecto.
        if (nuevo.modoFinales === 'automatico') nuevo.finales = finalesDePlantilla(nuevo);
        nuevo.modoFinales = 'propio';
        const final: Final = {
          id: claveLibre(claveDeRegla(c.key), new Set(nuevo.finales.map((f) => f.id)), '_'), nombre: c.title, texto: c.message,
          tono: c.tone, condicion: c.when ? structuredClone(c.when) : null, marcaIa: true,
        };
        const porDefecto = nuevo.finales.findIndex((f) => f.condicion === null);
        if (porDefecto === nuevo.finales.length - 1) nuevo.finales.splice(porDefecto, 0, final);
        else nuevo.finales.push(final);
        tocados.finales = true;
        break;
      }
      case 'set-response-class': {
        const ubicada = resolver.respuesta(c.decisionId)!;
        const respuesta = nuevo.escenas.find((e) => e.id === ubicada.escenaId)!.respuestas.find((r) => r.id === ubicada.respuestaId)!;
        respuesta.clase = c.responseClass;
        respuesta.razon = c.responseClass === 'CONTRAINDICATED' ? c.prohibitionReason : '';
        respuesta.marcaIa = true;
        marcar(tocados.respuestas, respuesta.id);
        break;
      }
      case 'set-persona-effect': {
        const ubicada = resolver.respuesta(c.decisionId)!;
        const respuesta = nuevo.escenas.find((e) => e.id === ubicada.escenaId)!.respuestas.find((r) => r.id === ubicada.respuestaId)!;
        const persona = { ...respuesta.efectos.persona };
        if (c.bond !== null) persona.bond = c.bond;
        if (c.activation !== null) persona.activation = c.activation;
        respuesta.efectos = { ...respuesta.efectos, persona };
        respuesta.marcaIa = true;
        marcar(tocados.respuestas, respuesta.id);
        break;
      }
      case 'mark-milestone': {
        const ubicada = resolver.respuesta(c.decisionId)!;
        const respuesta = nuevo.escenas.find((e) => e.id === ubicada.escenaId)!.respuestas.find((r) => r.id === ubicada.respuestaId)!;
        const hitosDe = respuesta.efectos.hitos ?? [];
        if (!hitosDe.includes(c.milestoneKey)) respuesta.efectos = { ...respuesta.efectos, hitos: [...hitosDe, c.milestoneKey] };
        respuesta.marcaIa = true;
        marcar(tocados.respuestas, respuesta.id);
        break;
      }
      case 'set-intensity': {
        const escena = escenaDe(c.nodeId);
        escena.intensidad = c.intensity;
        escena.advertencia = c.warningMessage.trim() ? c.warningMessage.trim() : null;
        escena.marcaIa = true;
        if (!tocados.escenasNuevas.includes(escena.id)) marcar(tocados.escenas, escena.id);
        break;
      }
    }
  }
  return { caso: nuevo, tocados };
}
