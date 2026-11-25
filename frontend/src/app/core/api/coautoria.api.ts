import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiDataResponse } from './api-response';

/**
 * La IA coautora, fase 1 (SIEP-269), rutas «authoring/coauthor» del servidor. La IA aclara la idea del docente con preguntas de tres
 * opciones y acuerda una ficha («Lo que acordamos»). Diseño: `docs/diseno/2026-11-25-ia-coautora-del-editor.md`.
 */
export type EstadoAcuerdo = 'clarifying' | 'ready' | 'summarized' | 'accepted' | 'cancelled';
export type AmbitoPregunta = 'historia' | 'personajes' | 'lugar' | 'evaluacion';

export interface PreguntaCoautora {
  numero: number;
  ambito: AmbitoPregunta;
  texto: string;
  porque: string;
  opciones: string[];
  /** La posición (0, 1 o 2) de la opción que recomienda la IA. */
  recomendada: number;
}

export interface RespuestaDada {
  numero: number;
  ambito: AmbitoPregunta;
  pregunta: string;
  porque: string;
  opciones: string[];
  recomendada: number;
  eleccion: Eleccion;
  /** La respuesta como se lee («Decide tú: …» si la eligió la IA). */
  respuesta: string;
}

export interface FichaAcordada {
  titulo: string;
  objetivo: string;
  personajes: { nombre: string; descripcion: string }[];
  lugar: string;
  momento: 'dia' | 'noche';
  escenas: { titulo: string; proposito: string }[];
  hitos: string[];
  finales: { titulo: string; descripcion: string }[];
  intensidad: 'LOW' | 'MEDIUM' | 'HIGH';
  temasSensibles: string[];
}

export interface Acuerdo {
  id: string;
  status: EstadoAcuerdo;
  lugarId: string | null;
  caseVersionId: number | null;
  idea: string;
  respuestas: RespuestaDada[];
  pregunta: PreguntaCoautora | null;
  topePreguntas: number;
  ficha: FichaAcordada | null;
  llamadasUsadas: number;
  llamadasTope: number;
  generationId: string | null;
  ocupado: boolean;
  /** Solo al iniciar, si la primera pregunta falló: el acuerdo existe y la pregunta se pide de nuevo. */
  error?: { code: string; message: string };
}

export type Eleccion = { tipo: 'opcion'; indice: number } | { tipo: 'propia'; texto: string } | { tipo: 'decide' };

export type DestinoCoautora = { lugarId: string } | { caseVersionId: number };

@Injectable({ providedIn: 'root' })
export class CoautoriaApi {
  private readonly http = inject(HttpClient);
  private readonly API_COAUTORA = '/api/authoring/coauthor';

  private datos(peticion: Observable<ApiDataResponse<Acuerdo>>): Observable<Acuerdo> {
    return peticion.pipe(map((r) => r.data));
  }

  iniciar(idea: string, destino: DestinoCoautora): Observable<Acuerdo> {
    return this.datos(this.http.post<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}`, { idea, ...destino }));
  }

  leer(id: string): Observable<Acuerdo> {
    return this.datos(this.http.get<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}`));
  }

  cancelar(id: string): Observable<Acuerdo> {
    return this.datos(this.http.delete<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}`));
  }

  pedirPregunta(id: string): Observable<Acuerdo> {
    return this.datos(this.http.post<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}/question`, {}));
  }

  responder(id: string, numero: number, eleccion: Eleccion): Observable<Acuerdo> {
    return this.datos(this.http.post<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}/answer`, { numero, eleccion }));
  }

  saltar(id: string): Observable<Acuerdo> {
    return this.datos(this.http.post<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}/skip`, {}));
  }

  /** Pide la ficha; con `cambio`, la rehace aplicando lo que pide el docente. */
  resumir(id: string, cambio?: string): Observable<Acuerdo> {
    return this.datos(this.http.post<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}/summary`, cambio ? { cambio } : {}));
  }

  corregir(id: string, ficha: FichaAcordada): Observable<Acuerdo> {
    return this.datos(this.http.put<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}/summary`, { ficha }));
  }

  aceptar(id: string): Observable<Acuerdo> {
    return this.datos(this.http.post<ApiDataResponse<Acuerdo>>(`${this.API_COAUTORA}/${id}/accept`, {}));
  }
}
