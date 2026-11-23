import type { Routes } from '@angular/router';

import { pantallasDelEditor, pantallasNuevoCaso } from '../autoria.routes';

/**
 * Las rutas del editor para las pruebas, sin el marco: la prueba crea el marco a mano y su `<router-outlet>` pinta las
 * pantallas, con las mismas direcciones que en el programa (`/portal/casos/<caso>/editor…`).
 */
export const rutasDePrueba: Routes = [
  { path: 'portal/casos/nuevo', children: pantallasNuevoCaso },
  { path: 'portal/casos/:caseVersionId/editor', children: pantallasDelEditor },
];
