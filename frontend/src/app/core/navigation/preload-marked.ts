import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, catchError, of } from 'rxjs';

/**
 * Precarga SOLO las rutas con `data: { precargar: true }` (plan visual F4-3). La usa «Sin conexión»: se descarga
 * con red tras la primera navegación y el Router la guarda cargada, así que sin red se muestra sin pedir nada. El
 * resto de rutas sigue perezoso y el bundle inicial no crece (importarla directa le sumaba ~80 kB).
 *
 * Si la precarga falla (sin red en ese momento), emite null: un error sin capturar cortaría la precarga de las
 * demás rutas, como hace PreloadAllModules con su catchError (revisión de F4, I-1).
 */
@Injectable({ providedIn: 'root' })
export class PreloadMarkedRoutes implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['precargar'] === true ? load().pipe(catchError(() => of(null))) : of(null);
  }
}
