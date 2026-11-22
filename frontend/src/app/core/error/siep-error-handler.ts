import { ErrorHandler, Injectable, inject } from '@angular/core';

import { NotificationService } from '../notifications/notification.service';

/**
 * Lo que ve quien usa la aplicación cuando algo falla sin que nadie lo haya previsto. No lleva el mensaje técnico (ese
 * va al registro de la consola). BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (VD-23).
 */
export const UNHANDLED_ERROR_NOTICE = 'Algo no salió como esperábamos. Si vuelve a pasar, recarga la página.';

/** Avisos del navegador que no son un fallo de la aplicación: se registran pero no se avisa de ellos. */
const BENIGN_BROWSER_PATTERNS = [
  /ResizeObserver loop/i,
  /AbortError/i,
];

/** `Nombre: mensaje` de lo que se lanzó: el nombre importa (un `DOMException` abortado solo lo trae ahí). */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return '';
}

/**
 * Manejador global de errores de cliente (E5-8 · ANG-8). Registra siempre el error en la consola, sin tragarlo, y
 * avisa a la persona con un solo texto (`NotificationService` absorbe los repetidos, así que una cascada de fallos
 * no apila tarjetas). El ruido benigno del navegador (ResizeObserver, una petición abortada) solo se registra.
 */
@Injectable({ providedIn: 'root' })
export class SiepErrorHandler implements ErrorHandler {
  private readonly notifications = inject(NotificationService);

  handleError(error: unknown): void {
    console.error('[SIEP:UnhandledError]', error);
    if (BENIGN_BROWSER_PATTERNS.some(pattern => pattern.test(describe(error)))) {
      return;
    }
    this.notifications.error(UNHANDLED_ERROR_NOTICE);
  }
}
