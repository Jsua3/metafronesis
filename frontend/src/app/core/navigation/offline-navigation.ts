import { inject } from '@angular/core';
import { NavigationError, RedirectCommand, Router } from '@angular/router';

/** Mensajes con que cada navegador (y webpack) avisa de que no pudo descargar un módulo perezoso. */
const LOAD_FAILURE = /ChunkLoadError|dynamically imported module|Importing a module script failed/i;

/** La página a la que se redirige. Si es ELLA la que falla, no se vuelve a redirigir (sin bucle). */
const OFFLINE_PAGE = '/sin-conexion';

/**
 * ¿El error de navegación es la falta de red? (plan visual F4-3): la descarga del código de una ruta perezosa
 * falló, o el navegador dice que está sin conexión.
 */
export function isOfflineLoadError(error: unknown): boolean {
  const description = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  if (LOAD_FAILURE.test(description)) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Manejador de errores de navegación (withNavigationErrorHandler): sin red, lleva a «Sin conexión» con la ruta
 * pedida para reintentar, sin cambiar la dirección visible. Siempre a la página de nivel superior (dentro del portal
 * necesitaría además el shell). Esa página es perezosa pero se PRECARGA con red (PreloadMarkedRoutes); si aun así
 * es ella la que no pudo cargarse (sin red antes de la precarga, o una pestaña vieja tras un despliegue), no se
 * redirige otra vez: el error sigue su curso y no hay bucle (revisión de F4, I-1). Los demás errores, undefined.
 */
export function offlineNavigationHandler(error: NavigationError): RedirectCommand | undefined {
  if (!isOfflineLoadError(error.error) || error.url.startsWith(OFFLINE_PAGE)) return undefined;
  const router = inject(Router);
  return new RedirectCommand(router.createUrlTree([OFFLINE_PAGE], { queryParams: { desde: error.url } }), {
    skipLocationChange: true,
  });
}
