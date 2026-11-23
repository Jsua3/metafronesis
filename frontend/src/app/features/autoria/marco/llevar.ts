import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { GuiaService } from '../guia/guia.service';
import { RutasAutoria } from '../rutas';

/** A dónde lleva «Llévame ahí» o «Siguiente paso»: la misma forma que `Falta['ir']`. */
export interface Destino {
  /** Dirección corta del editor (`/editor/escena/3`); vacía = la pantalla actual. */
  ruta: string;
  accionId?: string;
  ancla?: string;
}

/**
 * «Llévame ahí» del marco (hoja de pendientes y «Siguiente paso»), con el mismo comportamiento que la revisión: muestra la
 * acción con la guía si la hay, abre la pantalla y, si es algo concreto, le da el foco cuando ya está dibujado.
 * Se llama en un contexto de inyección y devuelve la función.
 */
export function injectLlevar(): (destino: Destino) => Promise<void> {
  const router = inject(Router);
  const rutas = inject(RutasAutoria);
  const guia = inject(GuiaService);
  return async (destino) => {
    if (destino.accionId) await guia.mostrar(destino.accionId, 'foco');
    if (destino.ruta) {
      const direccion = rutas.a(destino.ruta);
      if (router.url.split('?')[0] !== direccion) await router.navigateByUrl(direccion);
    }
    if (destino.ancla) await enfocar(destino.ancla);
  };
}

/** Espera a que la pantalla dibuje el elemento (hasta ~1,5 s), lo trae a la vista y le pasa el foco. */
async function enfocar(id: string): Promise<void> {
  for (let intento = 0; intento < 60; intento++) {
    const el = document.getElementById(id);
    if (el) {
      if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
      el.scrollIntoView?.({ block: 'center' });
      el.focus();
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
