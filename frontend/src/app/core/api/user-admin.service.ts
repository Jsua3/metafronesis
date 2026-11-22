import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { User } from '../models/user.model';

export type UserRole = User['role'];

export interface AdminUser extends User {
  activo: boolean;
  /** E2-9: cuenta creada por una importación que el administrador aún no aprueba. */
  pendingApproval?: boolean;
}

/** Respuesta de `POST /api/admin/users/approve` (E2-9): nunca trae contraseñas; la temporal sale por correo. */
export interface ApproveUsersResult {
  approved: number;
  approvedIds: number[];
  skipped: number[];
  emailed: number;
  failed: number[];
}

/** El servidor acepta como mucho 100 cuentas por orden (cada aprobación manda un correo). */
export const APPROVE_BATCH_SIZE = 100;

export interface CreateUserRequest {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  role: UserRole;
  activo: boolean;
}

export interface UpdateUserRequest {
  email: string;
  password?: string;
  nombre: string;
  apellido: string;
  role: UserRole;
}

interface ApiResponse<T> {
  message: string | null;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/admin/users';

  list() {
    return this.http.get<ApiResponse<AdminUser[]>>(this.API).pipe(map(response => response.data));
  }

  create(request: CreateUserRequest) {
    return this.http.post<ApiResponse<AdminUser>>(this.API, request).pipe(map(response => response.data));
  }

  update(id: number, request: UpdateUserRequest) {
    return this.http.put<ApiResponse<AdminUser>>(`${this.API}/${id}`, request).pipe(map(response => response.data));
  }

  /** Aprueba cuentas pendientes (≤ 100 por orden): cada una recibe su contraseña temporal por correo. */
  approve(userIds: number[]) {
    return this.http.post<ApiResponse<ApproveUsersResult>>(`${this.API}/approve`, { userIds })
      .pipe(map(response => response.data));
  }

  updateStatus(id: number, activo: boolean) {
    return this.http.patch<ApiResponse<AdminUser>>(`${this.API}/${id}/status`, { activo })
      .pipe(map(response => response.data));
  }
}
