import { CanDeactivateFn } from '@angular/router';

/** Una pantalla que puede tener algo sin guardar decide si se puede salir (y pregunta si hace falta). */
export interface CanLeave {
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Guardia de salida mínima (plan visual F5-4): le pregunta a la pantalla. La lógica y sus dependencias (el diálogo,
 * el almacén) viven en la pantalla, que es perezosa: así no entran en el bundle inicial con las rutas.
 */
export const canLeaveGuard: CanDeactivateFn<Partial<CanLeave> | null> = component => component?.canLeave?.() ?? true;
