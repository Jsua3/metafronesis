import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { User, LoginResponse } from '../models/user.model';
import { decodeJwtPayload, isJwtExpired, isJwtMalformed } from './token.utils';

interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T;
}

interface UserSummary {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  role: User['role'];
  mustChangePassword?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'psychosim_token';
  private readonly API = '/api/auth';

  currentUser = signal<User | null>(this.loadUser());

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string) {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/login`, { email, password })
      .pipe(tap(res => {
        this.saveSession(res.data.token, res.data.user);
      }));
  }

  loginWithGoogle(credential: string) {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/google`, { credential })
      .pipe(tap(res => {
        this.saveSession(res.data.token, res.data.user);
      }));
  }

  requestAccess(payload: { nombre: string; apellido: string; email: string; website?: string }) {
    return this.http.post<ApiResponse<{ status: string }>>(`${this.API}/access-request`, payload);
  }

  googleConfig() {
    return this.http.get<ApiResponse<{ clientId: string; enabled: boolean }>>(`${this.API}/google/config`)
      .pipe(map(res => res.data));
  }

  saveSession(token: string, user: User): void {
    if (!token || this.isTokenExpired(token)) {
      this.clearSession();
      return;
    }
    localStorage.setItem(this.TOKEN_KEY, token);
    this.currentUser.set(user);
  }

  clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    this.currentUser.set(null);
  }

  redirectToLogin(): void {
    this.router.navigate(['/login']);
  }

  endSession(): void {
    this.clearSession();
    this.redirectToLogin();
  }

  logout() {
    this.revokeOnServer();
    this.endSession();
  }

  /**
   * S1-4: avisa al servidor para que el token deje de valer. La salida no espera ni depende de eso: sin red, con la
   * sesión ya vencida o con cualquier error, la sesión local se cierra igual.
   */
  private revokeOnServer(): void {
    const token = this.getToken();
    if (!token || this.isTokenExpired(token)) return;
    this.http.post(`${this.API}/logout`, {}, { headers: { Authorization: `Bearer ${token}` } })
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  syncCurrentUser(): Observable<User | null> {
    const token = this.getToken();
    if (!token || this.isTokenExpired(token)) {
      this.clearSession();
      return of(null);
    }

    return this.http.get<ApiResponse<UserSummary>>(`${this.API}/me`).pipe(
      tap(res => this.currentUser.set(this.toUser(res.data))),
      map(() => this.currentUser()),
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isTokenExpired(token = this.getToken()): boolean {
    return isJwtExpired(token);
  }

  isTokenMalformed(token = this.getToken()): boolean {
    return isJwtMalformed(token);
  }

  /** E2-9: la sesión entró con una contraseña temporal y debe cambiarla antes de usar el portal. */
  mustChangePassword(): boolean {
    return this.currentUser()?.mustChangePassword === true;
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<ApiResponse<{ token?: string } | null>>(`${this.API}/change-password`, { currentPassword, newPassword })
      // S1-4: cambiar la contraseña cierra las demás sesiones y el servidor reemite un token a la actual: se guarda
      // para que la persona siga en el portal sin volver a entrar.
      .pipe(tap(res => {
        const token = res.data?.token;
        if (token) localStorage.setItem(this.TOKEN_KEY, token);
      }));
  }

  /** Tras cambiarla: la sesión sigue (el token no cambia) y deja de exigirlo. */
  markPasswordChanged(): void {
    const user = this.currentUser();
    if (user) this.currentUser.set({ ...user, mustChangePassword: false });
  }

  /** Un 403 `PASSWORD_CHANGE_REQUIRED` lo dice aunque `/auth/me` no haya llegado (el JWT no lo lleva). */
  requirePasswordChange(): void {
    const user = this.currentUser() ?? this.loadUser();
    if (user) this.currentUser.set({ ...user, mustChangePassword: true });
  }

  hasRole(...roles: string[]): boolean {
    const user = this.currentUser() ?? this.loadUser();
    return user ? roles.includes(user.role) : false;
  }

  private saveUserFromToken(token: string): User | null {
    const payload = decodeJwtPayload(token);
    if (!payload || !this.isValidRole(payload.role)) return null;
    return {
      id: Number(payload.userId),
      email: String(payload.sub ?? ''),
      role: payload.role,
      nombre: '',
      apellido: ''
    };
  }

  private loadUser(): User | null {
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (!token || this.isTokenExpired(token)) return null;
    return this.saveUserFromToken(token);
  }

  private isValidRole(role: unknown): role is User['role'] {
    return role === 'ADMIN' || role === 'PROFESOR' || role === 'ESTUDIANTE';
  }

  private toUser(summary: UserSummary): User {
    return {
      id: summary.id,
      nombre: summary.nombre,
      apellido: summary.apellido,
      email: summary.email,
      role: summary.role,
      mustChangePassword: summary.mustChangePassword === true
    };
  }
}
