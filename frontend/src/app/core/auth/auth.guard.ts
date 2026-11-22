import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { NAV_ITEMS } from '../../shared/layout/nav-items';
import { CHANGE_PASSWORD_PATH } from './password-change';

/** Motivo que el acceso explica en pantalla (plan visual F3-6, H-34). */
export const EXPIRED_SESSION_REASON = 'sesion-expirada';

/**
 * Sin sesión válida: la limpia y manda al acceso con la ruta pedida (`returnUrl`, que el acceso valida) y, si la
 * sesión existía pero venció o está rota, con `motivo=sesion-expirada`. El aviso lo da el acceso en la pantalla (no
 * un aviso flotante que se va solo); null si la sesión es válida.
 */
function loginRedirect(auth: AuthService, router: Router, url: string): UrlTree | null {
  const token = auth.getToken();
  if (token && !auth.isTokenMalformed(token) && !auth.isTokenExpired(token)) return null;
  auth.clearSession();
  const queryParams = token ? { returnUrl: url, motivo: EXPIRED_SESSION_REASON } : { returnUrl: url };
  return router.createUrlTree(['/login'], { queryParams });
}

export const authGuard: CanActivateFn = (_route, state) =>
  loginRedirect(inject(AuthService), inject(Router), state.url) ?? true;

/**
 * E2-9 (RN-10): con la contraseña temporal sin cambiar, el servidor niega todo salvo `/api/auth/**`; el portal no se
 * abre y la persona va a «Cambia tu contraseña» con la ruta pedida (al terminar vuelve ahí). Va DESPUÉS de authGuard.
 */
export const passwordChangeGuard: CanActivateFn = (_route, state) => {
  if (!inject(AuthService).mustChangePassword()) return true;
  return inject(Router).createUrlTree([CHANGE_PASSWORD_PATH], { queryParams: { returnUrl: state.url } });
};

export const roleGuard = (...roles: string[]): CanActivateFn => (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const redirect = loginRedirect(auth, router, state.url);
  if (redirect) return redirect;

  if (auth.hasRole(...roles)) return true;
  // Plan visual F4-3: la negación se ve (página «Sin permiso» con la sección pedida), no es una redirección muda.
  const path = state.url.split(/[?#;]/, 1)[0];
  const seccion = NAV_ITEMS.find(item => item.route === path)?.id ?? state.url;
  return router.createUrlTree(['/portal/sin-permiso'], { queryParams: { seccion } });
};
