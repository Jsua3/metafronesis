import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs/operators';

import {
  CasoBiblioteca, EstadoSesion, SesionDatos, SesionDetalle, SesionResumen, TransicionSesion,
} from '../models/sesion.model';
import { ApiDataResponse } from './api-response';

/** Una URL literal por transición: el contrato de rutas del cliente las lee tal cual contra Django. */
const RUTA_TRANSICION: Record<TransicionSesion, (id: number) => string> = {
  iniciar: id => `/api/sesiones/${id}/iniciar`,
  pausar: id => `/api/sesiones/${id}/pausar`,
  reanudar: id => `/api/sesiones/${id}/reanudar`,
  finalizar: id => `/api/sesiones/${id}/finalizar`,
  cancelar: id => `/api/sesiones/${id}/cancelar`,
};

/** Sesiones de clase del docente: programarlas, guiarlas en vivo y gestionar sus convocados. */
@Injectable({ providedIn: 'root' })
export class SesionesApi {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/sesiones';

  listar(estados: readonly EstadoSesion[] = []) {
    const params = estados.length ? new HttpParams().set('estado', estados.join(',')) : undefined;
    return this.http.get<ApiDataResponse<SesionResumen[]>>(this.API, { params }).pipe(map(r => r.data));
  }

  detalle(id: number) {
    return this.http.get<ApiDataResponse<SesionDetalle>>(`${this.API}/${id}`).pipe(map(r => r.data));
  }

  crear(datos: SesionDatos) {
    return this.http.post<ApiDataResponse<SesionDetalle>>(this.API, datos).pipe(map(r => r.data));
  }

  editar(id: number, cambios: Partial<SesionDatos>) {
    return this.http.patch<ApiDataResponse<SesionDetalle>>(`${this.API}/${id}`, cambios).pipe(map(r => r.data));
  }

  transicionar(id: number, accion: TransicionSesion) {
    return this.http.post<ApiDataResponse<SesionDetalle>>(RUTA_TRANSICION[accion](id), {}).pipe(map(r => r.data));
  }

  sincronizar(id: number) {
    return this.http.post<ApiDataResponse<{ agregados: number }>>(`${this.API}/${id}/sincronizar`, {}).pipe(map(r => r.data));
  }

  retirar(id: number, estudianteId: number) {
    return this.http.delete<ApiDataResponse<unknown>>(`${this.API}/${id}/convocados/${estudianteId}`).pipe(map(r => r.data));
  }

  autorizarRepeticion(id: number, estudianteId: number, motivo: string) {
    return this.http.post<ApiDataResponse<{ id: number }>>(`${this.API}/${id}/convocados/${estudianteId}/repeticion`, { motivo })
      .pipe(map(r => r.data));
  }

  /** La biblioteca: todos los casos publicados y activos, de cualquier autor. */
  casos() {
    return this.http.get<ApiDataResponse<CasoBiblioteca[]>>(`${this.API}/casos`).pipe(map(r => r.data));
  }
}
