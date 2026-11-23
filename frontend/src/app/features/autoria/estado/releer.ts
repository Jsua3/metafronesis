/**
 * Lo que el servidor tiene del caso, vuelto a leer tras un cambio de varias llamadas que falló a medias: las primeras
 * llamadas ya se guardaron y el editor tiene que mostrarlo (si no, el servidor conserva filas que la pantalla no enseña).
 *
 * Los ids que el editor ya usaba se conservan (la pantalla puede estar abierta sobre una escena creada en esta visita), y lo
 * que solo vive en el borrador porque le falta algo para guardarse (una respuesta sin clase, razón o destino) no se pierde.
 */
import type { CasoBorrador } from '../modelo/caso';
import { casoDesdeApi } from '../modelo/desde-api';
import { motivoSinGuardar } from './persistir';
import type { SesionServidor } from './sesion-servidor';

export function casoLeidoDelServidor(sesion: SesionServidor, base: CasoBorrador): CasoBorrador {
  const leido = casoDesdeApi(sesion.vista, [...sesion.mundos.values()], sesion.lugar);
  const escenaLocal = new Map(sesion.vista.nodes.map((n) => [String(n.id), sesion.idLocalDeNodo(n.id)]));
  const local = (id: string | null): string | null => (id === null ? null : (escenaLocal.get(id) ?? id));

  for (const e of leido.escenas) {
    const delBase = base.escenas.find((x) => x.id === local(e.id));
    e.respuestas = e.respuestas.map((r) => ({ ...r, id: sesion.idLocalDeDecision(Number(r.id)), destinoId: local(r.destinoId) }));
    if (delBase) {
      // las líneas no tienen fila propia en el servidor: se reconocen por su lugar y su texto
      e.lineas.forEach((l, i) => {
        if (delBase.lineas[i]?.texto === l.texto) l.id = delBase.lineas[i].id;
      });
      // lo que el docente escribió y aún no se puede guardar sigue en el borrador
      for (const r of delBase.respuestas) {
        if (motivoSinGuardar(r) !== null && !e.respuestas.some((x) => x.id === r.id)) e.respuestas.push(structuredClone(r));
      }
    }
    e.id = local(e.id)!;
  }
  leido.inicioId = local(leido.inicioId);
  leido.revision = sesion.revision;
  return leido;
}

/** Lo que el docente ve del caso, para saber si dos lecturas dicen lo mismo (sin depender del orden de las filas). */
export function firmaDelCaso(caso: CasoBorrador): string {
  const porId = <T extends { id: string }>(lista: T[]) => [...lista].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    inicio: caso.inicioId, modo: caso.modoFinales, riesgo: caso.nivelRiesgo,
    hitos: caso.hitos.map((h) => [h.clave, h.nombre, h.decisivo]),
    finales: caso.finales.map((f) => [f.id, f.nombre, f.texto, f.condicion]), plantilla: caso.textosPlantilla ?? null,
    escenas: porId(caso.escenas).map((e) => [
      e.id, e.titulo, e.narracion, e.salaId, e.esFinal, e.intensidad, e.advertencia ?? null, e.posicion.x, e.posicion.y,
      e.marcaIa === true,
      e.lineas.map((l) => [l.texto, l.personajeId, l.marcaIa]),
      porId(e.respuestas).filter((r) => motivoSinGuardar(r) === null).map((r) => [r.id, r.texto, r.clase, r.razon, r.destinoId, r.retroalimentacion, r.marcaIa]),
    ]),
    // las marcas «sugerido por la IA» también se ven: un cambio que baja marcas a medias (aceptar toda la escena) tiene que mostrarse
    salas: porId(caso.salas).map((s) => [
      s.id, s.nombre, s.muebles.map((m) => [m.ref, m.x, m.y, m.marcaIa === true]), s.objetos.map((o) => [o.ref, o.x, o.y, o.marcaIa === true]),
      s.personajes.map((p) => [p.ref, p.x, p.y, p.marcaIa === true]),
    ]),
  });
}
