import type { CasoBorrador, Escena, Respuesta } from '../../modelo/caso';
import { escenasEnOrden } from '../../modelo/progreso';

const LETRAS = ['A', 'B', 'C', 'D'];

/**
 * Lo que depende de una respuesta o de una escena, dicho en palabras, para la confirmación de borrado (EDITOR.md §4.6).
 * Las líneas se borran al instante con «Deshacer» (nada las referencia); las respuestas y las escenas piden confirmación
 * porque otras partes del caso apuntan a ellas y rehacer eso a mano no es fiel. La confirmación nombra esas partes.
 *
 * Funciones puras sobre el caso (sin store): se prueban solas y el guion solo las pinta.
 */

/** «N · Título» con el número del orden de la historia (el mismo del riel y de «Lleva a…»). */
export function etiquetaDeEscena(caso: Pick<CasoBorrador, 'escenas' | 'inicioId'>, escena: Escena): string {
  return `${escenasEnOrden(caso).indexOf(escena) + 1} · ${escena.titulo}`;
}

/** Los nombres que el catálogo del lugar da a sus piezas (objetos, muebles y herramientas), por id. */
function nombreDePieza(caso: Pick<CasoBorrador, 'catalogo'>, ref: string): string {
  for (const lista of Object.values(caso.catalogo ?? {})) {
    if (!Array.isArray(lista)) continue;
    const pieza = (lista as { id?: string; nombre?: string }[]).find((p) => p.id === ref);
    if (pieza?.nombre) return pieza.nombre;
  }
  return ref;
}

/**
 * Lo que se pierde al borrar una respuesta: los objetos de las salas que la ofrecen (`decisionOptionId`) y, si es el único
 * camino hacia su destino, que esa escena se queda sin conexión. Una respuesta leída del servidor lleva como id el número de
 * su opción (`String(id)`, ver `modelo/caso.ts`), que es el que guarda el objeto; una recién creada aún no la ofrece nadie.
 */
export function dependenciasDeRespuesta(caso: CasoBorrador, respuesta: Respuesta): string[] {
  const partes: string[] = [];
  const opcion = /^\d+$/.test(respuesta.id) ? Number(respuesta.id) : null;
  if (opcion !== null) {
    for (const sala of caso.salas) {
      for (const o of [...sala.objetos, ...sala.muebles]) {
        if (o.decisionOptionId === opcion) partes.push(`La ofrece «${nombreDePieza(caso, o.ref)}» de la sala ${sala.nombre}.`);
      }
    }
  }
  const destino = respuesta.destinoId ? caso.escenas.find((e) => e.id === respuesta.destinoId) : undefined;
  if (destino && destino.id !== caso.inicioId) {
    const otros = caso.escenas.some((e) => e.respuestas.some((r) => r.id !== respuesta.id && r.destinoId === destino.id));
    if (!otros) partes.push(`Es el único camino hacia «${etiquetaDeEscena(caso, destino)}»: esa escena quedará sin conexión.`);
  }
  return partes;
}

/**
 * ¿Una respuesta está en blanco? Entonces borrarla no pierde nada y no hace falta preguntar. Cuenta TODO lo que puede llevar
 * (cualquier efecto: pasos, persona, competencias…) y lo que apunta a ella desde el caso (un objeto de sala que la ofrece):
 * una respuesta sin texto pero con competencias o referenciada no está en blanco (revisión de Codex, hallazgo 2).
 */
export function respuestaEnBlanco(caso: CasoBorrador, r: Respuesta): boolean {
  return !r.texto.trim() && !r.clase && !r.retroalimentacion.trim() && !r.razon.trim() && r.destinoId === null
    && Object.values(r.efectos ?? {}).every(vacio) && Object.keys(r.requiere ?? {}).length === 0
    && Object.keys(r.reaccion ?? {}).length === 0 && dependenciasDeRespuesta(caso, r).length === 0;
}

/** Un efecto sin contenido: ausente, lista vacía u objeto sin claves. */
function vacio(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (Array.isArray(valor)) return valor.length === 0;
  return typeof valor === 'object' && Object.keys(valor).length === 0;
}

/**
 * Lo que se pierde al borrar una escena: las respuestas que llegan a ella (quedan sin destino) y, si es el inicio, cuál
 * pasa a serlo (`store.borrarEscena` toma la primera de las que quedan).
 */
export function dependenciasDeEscena(caso: CasoBorrador, escena: Escena): string[] {
  const partes: string[] = [];
  const llegan = caso.escenas.flatMap((e) => e.id === escena.id ? [] : e.respuestas.flatMap((r, i) =>
    r.destinoId === escena.id ? [`Respuesta ${LETRAS[i] ?? i + 1} de ${etiquetaDeEscena(caso, e)}`] : []));
  if (llegan.length) partes.push(`Llegan aquí: ${llegan.join(', ')}. Quedarán sin destino.`);
  if (caso.inicioId === escena.id) {
    const nuevo = caso.escenas.find((e) => e.id !== escena.id);
    if (nuevo) partes.push(`Es el inicio del caso: «${nuevo.titulo}» pasará a serlo.`);
  }
  const respuestas = escena.respuestas.length;
  if (respuestas) partes.push(respuestas === 1 ? 'Se borra también su respuesta.' : `Se borran también sus ${respuestas} respuestas.`);
  return partes;
}
