import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { CasoStore } from '../estado/caso.store';
import { clasificarPendientes, porCorregir, type Pendiente } from '../modelo/pendientes';
import { avanceDelCaso, escenasEnOrden, etapaDeDireccion, siguientePaso } from '../modelo/progreso';

/**
 * El avance del caso abierto, calculado UNA vez por cambio y compartido por el hilo, el riel, el botón «Pendientes» y su
 * hoja (las funciones de `modelo/` recorren todo el caso; repetirlas en cada pieza sería trabajo de más en cada tecla).
 */
@Injectable({ providedIn: 'root' })
export class ProgresoDelCaso {
  private readonly store = inject(CasoStore);
  private readonly router = inject(Router);

  /** La dirección actual, para saber en qué etapa y en qué escena está la docente. */
  readonly direccion = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );

  readonly pendientes = computed<Pendiente[]>(() => {
    const caso = this.store.caso();
    return caso ? clasificarPendientes(caso) : [];
  });

  readonly porCorregir = computed(() => porCorregir(this.pendientes()));

  readonly avance = computed(() => {
    const caso = this.store.caso();
    return caso ? avanceDelCaso(caso, this.pendientes()) : [];
  });

  /** El aviso de guardado manda sobre todo lo demás: con un conflicto o un cambio rechazado, primero eso. */
  readonly siguiente = computed(() => {
    const caso = this.store.caso();
    if (!caso) return null;
    const avisoDeGuardado = this.store.conflicto() !== null || this.store.error() !== null || this.store.descartado().length > 0;
    return siguientePaso(caso, { avisoDeGuardado }, this.pendientes());
  });

  readonly etapaActual = computed(() => etapaDeDireccion(this.direccion()));

  /** Las escenas en orden de historia (el del riel, «Escena 2 de 8» y «Escribe la escena N»). */
  readonly escenas = computed(() => {
    const caso = this.store.caso();
    return caso ? escenasEnOrden(caso) : [];
  });

  /** La escena abierta, si la dirección es la de un guion. */
  readonly escenaActual = computed(() => {
    const id = /\/editor\/escena\/([^/?#]+)/.exec(this.direccion())?.[1];
    return id ? decodeURIComponent(id) : null;
  });
}
