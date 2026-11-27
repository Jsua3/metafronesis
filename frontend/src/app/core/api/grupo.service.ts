import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { ApiDataResponse } from './api-response';

export interface Grupo {
  id: number;
  nombre: string;
  codigo: string;
  /** E2-10: solo las membresías ACTIVAS (quien aceptó la invitación). */
  totalEstudiantes: number;
  /** E2-10: invitaciones que aún no se responden. */
  totalInvitados?: number;
  /** Solo en el listado: avance de las asignaciones, incluidas las pausadas. */
  resumenCasos?: { asignados: number; terminados: number; oportunidades: number };
}

/** Estudiante registrado que el docente puede invitar: solo lo necesario para reconocerlo. */
export interface EstudianteSugerido {
  nombre: string;
  /** Lo que va antes de la @ del correo. */
  usuario: string;
  email: string;
}

/** Estado de la membresía (E2-10, C5): el docente invita y el estudiante acepta, rechaza o sale. */
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'REMOVED';

export interface GrupoEstudiante {
  id: number;
  /** Vacío mientras la persona no acepta (el docente solo ve el correo que escribió; D-14). */
  nombre: string;
  apellido: string;
  email: string;
  role: 'ESTUDIANTE';
  membershipStatus?: MembershipStatus;
  /** Solo de las membresías activas. */
  activo?: boolean;
}

/** Fila del resultado de una importación: lo que el docente escribió, sin datos de la cuenta (D-14). */
export interface GrupoImportStudent {
  row: number;
  nombre: string;
  apellido: string;
  email: string;
  role: 'ESTUDIANTE';
  membershipStatus: MembershipStatus;
}

export interface GrupoImportError {
  row: number;
  field?: string;
  email?: string;
  message?: string;
  error?: string;
}

export interface GrupoImportResult {
  grupo: Grupo;
  created: number;
  existing: number;
  assigned: number;
  associated: number;
  skipped: number;
  duplicated: number;
  errors: GrupoImportError[];
  students: GrupoImportStudent[];
  /** E2-9 (RN-10): cuentas nuevas que quedan pendientes de la aprobación del administrador (ya no hay contraseña). */
  pendingApproval: number;
  /** Columnas del archivo que se leyeron pero no se usan (p. ej. `password` de una plantilla vieja). */
  ignoredColumns: string[];
  expectedColumns: string[];
  message: string;
}

export interface GrupoImportSpec {
  requiredColumns: string[];
  optionalColumns: string[];
  columns: string[];
  templateFilename: string;
  acceptedExtensions: string[];
}

@Injectable({ providedIn: 'root' })
export class GrupoService {
  private http = inject(HttpClient);
  private readonly API = '/api/grupos';

  listar() {
    return this.http.get<ApiDataResponse<Grupo[]>>(this.API).pipe(map(r => r.data));
  }

  crear(nombre: string, codigo: string) {
    return this.http.post<ApiDataResponse<Grupo>>(this.API, { nombre, codigo }).pipe(map(r => r.data));
  }

  actualizar(grupoId: number, cambios: { nombre?: string; codigo?: string }) {
    return this.http.put<ApiDataResponse<Grupo>>(`${this.API}/${grupoId}`, cambios).pipe(map(r => r.data));
  }

  eliminar(grupoId: number) {
    return this.http.delete<ApiDataResponse<{ id: number }>>(`${this.API}/${grupoId}`).pipe(map(r => r.data));
  }

  quitarEstudiante(grupoId: number, estudianteId: number) {
    return this.http.delete<ApiDataResponse<Grupo>>(`${this.API}/${grupoId}/estudiantes/${estudianteId}`)
      .pipe(map(r => r.data));
  }

  /** Estudiantes registrados cuyo correo o usuario contiene `q` (mínimo 2 caracteres; pocos resultados). */
  sugerirEstudiantes(grupoId: number, q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<ApiDataResponse<EstudianteSugerido[]>>(`${this.API}/${grupoId}/estudiantes/sugerencias`, { params })
      .pipe(map(r => r.data ?? []));
  }

  /** `email` es el correo o el nombre de usuario del estudiante. */
  agregarEstudiante(grupoId: number, email: string) {
    return this.http.post<ApiDataResponse<Grupo>>(`${this.API}/${grupoId}/estudiantes`, { email })
      .pipe(map(r => ({ grupo: r.data, message: r.message })));
  }

  importarEstudiantes(grupoId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ApiDataResponse<GrupoImportResult>>(`${this.API}/${grupoId}/estudiantes/import/`, formData)
      .pipe(map(r => r.data));
  }

  importSpec() {
    return this.http.get<ApiDataResponse<GrupoImportSpec>>(`${this.API}/estudiantes/import/spec/`)
      .pipe(map(r => r.data));
  }

  descargarPlantillaImportacion() {
    return this.http.get(`${this.API}/estudiantes/import/template/`, {
      responseType: 'blob',
      observe: 'response'
    });
  }

  listarEstudiantes(grupoId: number) {
    return this.http.get<ApiDataResponse<GrupoEstudiante[]>>(`${this.API}/${grupoId}/estudiantes`)
      .pipe(map(r => r.data));
  }
}
