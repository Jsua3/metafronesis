import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Lectura de los documentos JSON que viajan con el frontend (paquete del kit de personajes, manifiesto del arte de la
 * biblioteca). No son rutas de la API: se piden a los activos estáticos. Va en `core/api` porque ninguna pantalla usa
 * `HttpClient` directamente (patrón Adapter); quien la llama valida la forma de lo que recibe.
 */
@Injectable({ providedIn: 'root' })
export class GameAssetsApi {
  private readonly http = inject(HttpClient);

  getJson(url: string): Observable<unknown> {
    return this.http.get<unknown>(url);
  }
}
