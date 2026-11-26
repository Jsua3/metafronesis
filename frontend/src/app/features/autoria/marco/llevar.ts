import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { NotificationService } from '../../../core/notifications/notification.service';
import { GuiaService } from '../guia/guia.service';
import { RutasAutoria } from '../rutas';

/** A dónde lleva «Llévame ahí» o «Siguiente paso»: la misma forma que `Falta['ir']`. */
export interface Destino {
  /** Dirección corta del editor (`/editor/escena/3`); vacía = la pantalla actual. */
  ruta: string;
  accionId?: string;
  ancla?: string;
  aviso?: string;
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
  const avisos = inject(NotificationService);
  return async (destino) => {
    if (destino.accionId) await guia.mostrar(destino.accionId, 'foco');
    if (destino.ruta) {
      const direccion = rutas.a(destino.ruta);
      if (router.url.split('?')[0] !== direccion) await router.navigateByUrl(direccion);
    }
    if (destino.ancla) await enfocar(destino.ancla);
    if (destino.aviso) avisos.info(destino.aviso);
  };
}

/** Espera a que la pantalla dibuje el elemento (hasta ~1,5 s), lo trae a la vista y le pasa el foco. */
async function enfocar(id: string): Promise<void> {
  for (let intento = 0; intento < 60; intento++) {
    const el = document.getElementById(id);
    if (el) {
      // Abrir cualquier <details> nativo que oculte el destino.
      for (let padre = el.parentElement; padre; padre = padre.parentElement) {
        if (padre instanceof HTMLDetailsElement) padre.open = true;
      }
      const control = id.startsWith('linea-') ? el.querySelector<HTMLElement>('textarea') ?? el : el.matches('a[href], button, input, select, textarea, [tabindex]')
        ? el : el.querySelector<HTMLElement>('textarea:not([disabled]), input:not([disabled]), select:not([disabled]), button:not([disabled])') ?? el;
      if (!control.matches('a[href], button, input, select, textarea, [tabindex]')) control.setAttribute('tabindex', '-1');
      control.scrollIntoView?.({ block: 'center', behavior: 'auto' });
      control.focus();
      // Resalte sin animación: también respeta la preferencia de reducir movimiento.
      const anterior = control.style.outline;
      control.style.outline = '3px solid var(--ds-info)';
      setTimeout(() => { control.style.outline = anterior; }, 2000);
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
