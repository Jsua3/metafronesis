import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withNavigationErrorHandler, withPreloading } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MAT_CARD_CONFIG } from '@angular/material/card';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { NotificationService } from './core/notifications/notification.service';
import { watchConnectionRecovery } from './core/notifications/connection-recovery';
import { SiepErrorHandler } from './core/error/siep-error-handler';
import { offlineNavigationHandler } from './core/navigation/offline-navigation';
import { PreloadMarkedRoutes } from './core/navigation/preload-marked';
import { AuthService } from './core/auth/auth.service';
import { settleWithin } from './core/auth/settle-within.util';
import { User } from './core/models/user.model';
import { SiepTitleStrategy } from './core/title/siep-title.strategy';

/**
 * Lo máximo que el arranque espera a `/api/auth/me`. El usuario ya sale del JWT
 * (los guards solo miran el token): `/me` completa nombre y apellido y, si falla
 * con 401 o 403 de cuenta inactiva, el interceptor limpia la sesión y lleva al login.
 */
const AUTH_SYNC_BUDGET_MS = 1500;

/** Valida la sesión contra `/me` sin retener el primer pintado más de AUTH_SYNC_BUDGET_MS. */
export function initializeAuthSession(): Promise<User | null | undefined> {
  const auth = inject(AuthService);
  return settleWithin(firstValueFrom(auth.syncCurrentUser()), AUTH_SYNC_BUDGET_MS);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useExisting: SiepErrorHandler },
    // Sin red, una navegación que no pudo descargar su código lleva a «Sin conexión», precargada con red (F4-3).
    provideRouter(routes, withNavigationErrorHandler(offlineNavigationHandler), withPreloading(PreloadMarkedRoutes), withComponentInputBinding()),
    { provide: TitleStrategy, useClass: SiepTitleStrategy },
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideAppInitializer(initializeAuthSession),
    // El aviso de conexión se retira solo al volver la red (evento `online`) o con la primera respuesta correcta.
    provideAppInitializer(() => { watchConnectionRecovery(inject(NotificationService)); }),
    // Material Symbols (subconjunto autoalojado): la fuente la pone la regla `.mat-icon` de styles.scss, que todo
    // <mat-icon> lleva. Antes se fijaba también la clase por defecto del registro, pero ninguna regla la usa y tocar
    // `@angular/material/icon` desde aquí (registro o ficha de opciones: esbuild parte por módulo) metía <mat-icon> y
    // su registro (~19 kB) en el paquete inicial, que la portada y el login no usan hasta cargar su ruta (pasada final).
    // Tarjetas con borde fino por token y elevación suave (F1-4): la apariencia «elevated» fija border-width 0.
    { provide: MAT_CARD_CONFIG, useValue: { appearance: 'outlined' } },
  ]
};
