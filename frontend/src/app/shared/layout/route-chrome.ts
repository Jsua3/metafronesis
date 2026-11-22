import { Router } from '@angular/router';

/**
 * `full`: la barra del portal y el contenido bajo ella. `hidden`: sin barra y la pantalla ocupa la ventana (el juego).
 * `propio`: sin la barra del portal porque la pantalla trae la suya (el editor de casos, con su barra de vidrio): la
 * página se desplaza en `window`, como en el portal.
 */
export type RouteChrome = 'full' | 'hidden' | 'propio';

const VALORES: readonly RouteChrome[] = ['hidden', 'propio'];

/**
 * `chrome` del árbol de rutas activo: la ruta más profunda que diga `data: { chrome: 'hidden' | 'propio' }` oculta la barra
 * del portal (el juego y la sala ocupan la ventana; el editor pone la suya). Una sola fuente para el shell y para quien
 * decide por pantalla (la colocación de los avisos, F6-1).
 */
export function readRouteChrome(router: Router): RouteChrome {
  let route = router.routerState.snapshot.root;
  let chrome: RouteChrome = 'full';
  for (;;) {
    const valor = route.data?.['chrome'];
    if (VALORES.includes(valor)) chrome = valor;
    if (!route.firstChild) return chrome;
    route = route.firstChild;
  }
}
