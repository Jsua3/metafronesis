import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';

export type AccessRequestStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED';

export interface AccessRequest {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
}

interface ApiAccessRequest {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  status: AccessRequestStatus;
  created_at: string;
  reviewed_at: string | null;
}

interface ApiResponse<T> {
  message: string | null;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class AccessRequestAdminService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/admin/access-requests';

  listPending() {
    return this.http
      .get<ApiResponse<ApiAccessRequest[]>>(`${this.API}?status=PENDING`)
      .pipe(map(response => response.data.map(item => this.toModel(item))));
  }

  updateStatus(id: number, status: AccessRequestStatus) {
    return this.http
      .patch<ApiResponse<ApiAccessRequest>>(`${this.API}/${id}/status`, { status })
      .pipe(map(response => this.toModel(response.data)));
  }

  private toModel(item: ApiAccessRequest): AccessRequest {
    return {
      id: item.id,
      nombre: item.nombre,
      apellido: item.apellido,
      email: item.email,
      status: item.status,
      createdAt: item.created_at,
      reviewedAt: item.reviewed_at,
    };
  }
}
