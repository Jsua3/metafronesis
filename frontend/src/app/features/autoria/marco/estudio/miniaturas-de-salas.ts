import { type Signal, effect, inject, signal } from '@angular/core';

import { CasoStore } from '../../estado/caso.store';
import { PintorDeVistas, type SalaDeBiblioteca } from '../../pantallas/lugar/pintor-de-vistas.service';

/**
 * La imagen de cada sala del caso abierto, venga como venga: el fondo dibujado o, si la sala es por piezas, el cuarto
 * compuesto con el pintor del juego (`PintorDeVistas`, con caché por sesión). Es lo que pintan las tarjetas de Caminos, el
 * Inspector y la vista de cámara de la escena (EDITOR-PRO.md, punto 3: «miniaturas reales»).
 *
 * Patrón: Facade + Observer. Un contenedor la llama una vez y pasa el mapa a sus piezas de presentación (que no conocen el
 * servicio). Mientras una sala se compone, su entrada falta y la pieza pinta su patrón de baldosas.
 *
 * La clave refleja el contenido de la sala y evita que una respuesta antigua reemplace la vista actual.
 */
export function injectMiniaturasDeSalas(completa = false): Signal<ReadonlyMap<string, string | null>> {
  const store = inject(CasoStore);
  const pintor = inject(PintorDeVistas);
  const mapa = signal<ReadonlyMap<string, string | null>>(new Map());
  // La clave incluye el caso y el contenido: descarta respuestas de una versión anterior de la sala.
  const solicitudes = new Map<string, { clave: string }>();
  effect(() => {
    const caso = store.caso();
    const vigentes = new Map<string, string>();
    const cambiadas = new Set<string>();
    if (caso?.lugarId) {
      for (const sala of caso.salas) {
        const clave = JSON.stringify([caso.id, caso.lugarId, sala]);
        vigentes.set(sala.id, clave);
        if (solicitudes.get(sala.id)?.clave === clave) continue;
        const solicitud = { clave };
        solicitudes.set(sala.id, solicitud);
        cambiadas.add(sala.id);
        void pintor.vista(caso.lugarId, sala as unknown as SalaDeBiblioteca, completa).then((src) => {
          if (solicitudes.get(sala.id) !== solicitud) return;
          if (!src) solicitudes.delete(sala.id);
          mapa.update((m) => new Map(m).set(sala.id, src));
        });
      }
    }
    for (const id of solicitudes.keys()) if (!vigentes.has(id)) solicitudes.delete(id);
    mapa.update((anterior) => {
      const siguiente = new Map(anterior);
      for (const id of siguiente.keys()) if (!vigentes.has(id) || cambiadas.has(id)) siguiente.delete(id);
      return siguiente.size === anterior.size && ![...cambiadas].some((id) => anterior.has(id)) ? anterior : siguiente;
    });
  });
  return mapa.asReadonly();
}
