import { HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { isConsentRequiredError } from '../api/api-error.util';
import { NotificationService } from '../notifications/notification.service';
import { AuthService } from './auth.service';
import { CHANGE_PASSWORD_PATH, PASSWORD_CHANGE_REQUIRED } from './password-change';
import { throttledMessage } from './throttled';

export const SESSION_MESSAGE = 'Tu sesión ya no es válida o tu usuario está inactivo. Contacta al administrador.';
export const CONNECTION_MESSAGE = 'No fue posible conectar con el servidor. Intenta nuevamente.';
export const PERMISSION_MESSAGE = 'No tienes permisos para realizar esta acción.';

const LOGIN_URL = '/api/auth/login';
const LOGOUT_URL = '/api/auth/logout';
const ME_URL = '/api/auth/me';
/**
 * Pantallas que muestran su propio texto de 429: las públicas de acceso (acceso, Google y solicitud de acceso) y la generación
 * de casos con IA (el tope del día en «Describe tu caso», los intentos agotados en el avance).
 */
const SELF_THROTTLED_URLS = [LOGIN_URL, '/api/auth/google', '/api/auth/access-request', '/api/authoring/generations'];

/**
 * Marca de una petición cuyo 403 lo explica su pantalla con su propio texto (p. ej. «Esta rúbrica es de solo
 * lectura», E2-2): el aviso genérico «No tienes permisos…» no sale además. El cambio de contraseña obligatorio manda
 * igual (su eslabón va antes).
 */
export const SCREEN_HANDLES_FORBIDDEN = new HttpContextToken<boolean>(() => false);

/**
 * Marca de una petición cuya falta de red la explica su pantalla (la salida segura sin red, REGLA-004: la pantalla de pausa
 * dice que la pausa se registrará al volver la conexión): el aviso global «No fue posible conectar…» no sale además.
 */
export const SCREEN_HANDLES_OFFLINE = new HttpContextToken<boolean>(() => false);

/** Lo que cada eslabón necesita para decidir y actuar; se pasa entero para no acoplarlos a `inject()`. */
export interface HttpErrorContext {
  error: unknown;
  url: string;
  screenHandlesForbidden?: boolean;
  screenHandlesOffline?: boolean;
  auth: Pick<AuthService, 'clearSession' | 'requirePasswordChange'>;
  router: Pick<Router, 'url' | 'navigate'>;
  notifications: Pick<NotificationService, 'error' | 'warning'>;
}

/**
 * Eslabón de la cadena de responsabilidad que atiende los errores HTTP: si reconoce el error lo
 * atiende y corta; si no, lo pasa al siguiente. El interceptor siempre vuelve a lanzar el error,
 * así que los eslabones solo producen efectos (avisar, cerrar sesión, navegar).
 */
export abstract class HttpErrorHandler {
  private next: HttpErrorHandler | null = null;

  setNext(next: HttpErrorHandler): HttpErrorHandler {
    this.next = next;
    return next;
  }

  handle(ctx: HttpErrorContext): void {
    if (this.canHandle(ctx)) {
      this.apply(ctx);
      return;
    }
    this.next?.handle(ctx);
  }

  protected abstract canHandle(ctx: HttpErrorContext): boolean;
  protected abstract apply(ctx: HttpErrorContext): void;
}

function statusOf(ctx: HttpErrorContext): number | null {
  return ctx.error instanceof HttpErrorResponse ? ctx.error.status : null;
}

/**
 * Sesión inválida: la limpia y, si no está ya en /login, avisa y lleva al login. Con `returnTo`, el acceso vuelve
 * luego a la pantalla en la que estaba (plan visual F3-6, H-34; el acceso valida la ruta).
 */
function expireSession(ctx: HttpErrorContext, returnTo = false): void {
  ctx.auth.clearSession();
  if (!ctx.router.url.startsWith('/login')) {
    ctx.notifications.warning(SESSION_MESSAGE);
    if (returnTo) ctx.router.navigate(['/login'], { queryParams: { returnUrl: ctx.router.url } });
    else ctx.router.navigate(['/login']);
  }
}

/** Algo que no es una respuesta HTTP (p. ej. lo lanzó otro interceptor): se trata como falta de conexión. */
export class NonHttpErrorHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return !(ctx.error instanceof HttpErrorResponse);
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.error(CONNECTION_MESSAGE);
  }
}

/**
 * Los errores del login los muestra la propia pantalla, y el cierre de sesión (S1-4) nunca debe avisar de una sesión
 * vencida a quien acaba de salir: aquí solo se corta la cadena.
 */
export class LoginErrorHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return ctx.url.includes(LOGIN_URL) || ctx.url.includes(LOGOUT_URL);
  }
  protected apply(): void {}
}

/**
 * 429 (S1-2): el servidor frena los intentos repetidos y dice cuánto esperar. Se avisa con su texto y la sesión no se
 * toca. Las pantallas públicas de acceso lo explican ellas mismas.
 */
export class ThrottledHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 429 && !SELF_THROTTLED_URLS.some(url => ctx.url.includes(url));
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.warning(throttledMessage(ctx.error as HttpErrorResponse));
  }
}

export class UnauthorizedHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 401;
  }
  protected apply(ctx: HttpErrorContext): void {
    expireSession(ctx, true);
  }
}

/** Un 403 sobre /api/auth/me significa usuario inactivo: es sesión inválida, no falta de permisos. */
export class InactiveUserHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 403 && ctx.url.includes(ME_URL);
  }
  protected apply(ctx: HttpErrorContext): void {
    expireSession(ctx);
  }
}

/**
 * E2-9 (RN-10): el 403 `PASSWORD_CHANGE_REQUIRED` no es falta de permisos: la cuenta entró con una contraseña temporal.
 * Lleva a «Cambia tu contraseña» con la ruta en la que estaba (sin aviso de permiso ni cerrar la sesión).
 */
export class PasswordChangeRequiredHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    if (statusOf(ctx) !== 403) return false;
    const body = (ctx.error as HttpErrorResponse).error as { code?: unknown } | null;
    return body?.code === PASSWORD_CHANGE_REQUIRED;
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.auth.requirePasswordChange();
    if (ctx.router.url.startsWith(CHANGE_PASSWORD_PATH)) return;
    ctx.router.navigate([CHANGE_PASSWORD_PATH], { queryParams: { returnUrl: ctx.router.url } });
  }
}

/**
 * S3-2b (ETH-01): el 403 `CONSENT_REQUIRED` tampoco es falta de permisos: el consentimiento al aviso de contenido se
 * retiró (en otra pestaña) o el aviso cambió de versión. Lo explica la pantalla de juego volviendo al aviso, así que aquí
 * solo se corta la cadena: ni «No tienes permisos» ni se toca la sesión. Va antes de `ForbiddenHandler`.
 */
export class ConsentRequiredHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return isConsentRequiredError(ctx.error);
  }
  protected apply(): void {}
}

export class ForbiddenHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 403 && !ctx.screenHandlesForbidden;
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.warning(PERMISSION_MESSAGE);
  }
}

export class NoConnectionHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 0 && !ctx.screenHandlesOffline;
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.error(CONNECTION_MESSAGE);
  }
}

/** Orden contractual: el primero que reconoce el error lo atiende y los demás no se ejecutan. */
export function defaultHttpErrorHandlers(): HttpErrorHandler[] {
  return [
    new NonHttpErrorHandler(),
    new LoginErrorHandler(),
    new ThrottledHandler(),
    new UnauthorizedHandler(),
    new InactiveUserHandler(),
    new PasswordChangeRequiredHandler(),
    new ConsentRequiredHandler(),
    new ForbiddenHandler(),
    new NoConnectionHandler(),
  ];
}

/** Enlaza los eslabones en el orden dado y devuelve la cabeza de la cadena. */
export function buildHttpErrorChain(handlers: HttpErrorHandler[] = defaultHttpErrorHandlers()): HttpErrorHandler {
  const [head, ...rest] = handlers;
  rest.reduce<HttpErrorHandler>((previous, current) => previous.setNext(current), head);
  return head;
}
