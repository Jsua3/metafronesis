import { Injectable, inject } from '@angular/core';

import { CasoStore } from './estado/caso.store';

/** Dónde vive el editor en el programa: la lista de casos y, debajo, el editor de cada uno. */
export const RUTA_CASOS = '/portal/casos';

/**
 * Traduce una dirección «del editor» a la del programa. Las pantallas del editor hablan de sus momentos con
 * direcciones cortas (`/editor`, `/editor/escena/<id>`, `/editor/finales`, `/revision`, `/lugar`, `/salas`, `/`);
 * en el programa cuelgan de la lista de casos:
 *
 * - `/` → la lista de casos
 * - `/lugar` y `/salas` → los dos pasos de crear un caso (`/portal/casos/nuevo[/salas]`)
 * - `/generando/<id>` → la pantalla de avance de la generación (`/portal/casos/nuevo/generando/<id>`)
 * - `/editor…` y `/revision` → el editor del caso abierto (`/portal/casos/<caso>/editor[…]`)
 *
 * `casoId` es el caso abierto; sin caso, las direcciones del editor llevan a la lista.
 */
export function rutaDelEditor(destino: string, casoId: string | null): string {
  const corte = destino.indexOf('?');
  const ruta = corte < 0 ? destino : destino.slice(0, corte);
  const consulta = corte < 0 ? '' : destino.slice(corte);
  if (ruta === '/' || ruta === '') return RUTA_CASOS;
  if (ruta === '/lugar') return `${RUTA_CASOS}/nuevo${consulta}`;
  if (ruta === '/salas') return `${RUTA_CASOS}/nuevo/salas${consulta}`;
  if (ruta.startsWith('/generando/')) return `${RUTA_CASOS}/nuevo${ruta}${consulta}`;
  if (casoId === null) return RUTA_CASOS;
  const base = `${RUTA_CASOS}/${encodeURIComponent(casoId)}/editor`;
  if (ruta === '/revision') return `${base}${ruta}${consulta}`;
  if (ruta === '/editor' || ruta.startsWith('/editor/')) return `${base}${ruta.slice('/editor'.length)}${consulta}`;
  return RUTA_CASOS;
}

/** Las direcciones del editor para las plantillas y la navegación: se arman con el caso que está abierto. */
@Injectable({ providedIn: 'root' })
export class RutasAutoria {
  private readonly store = inject(CasoStore);

  /** `a('/editor/escena', id)` → la dirección real de esa escena en el caso abierto. */
  a(destino: string, ...segmentos: Array<string | number>): string {
    const completo = segmentos.reduce<string>((ruta, s) => `${ruta}/${encodeURIComponent(String(s))}`, destino);
    return rutaDelEditor(completo, this.store.caso()?.id ?? null);
  }
}
