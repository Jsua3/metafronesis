import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { isSameOriginApiUrl } from './api-origin';
import { AuthService } from './auth.service';
import { NotificationService } from '../notifications/notification.service';
import { CONNECTION_MESSAGE, SCREEN_HANDLES_FORBIDDEN, SCREEN_HANDLES_OFFLINE, buildHttpErrorChain } from './http-error-chain';

const errorChain = buildHttpErrorChain();

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);
  const token = auth.getToken();
  const isLoginRequest = req.url.includes('/api/auth/login');

  if (token && !isLoginRequest && isSameOriginApiUrl(req.url) && !auth.isTokenExpired(token)) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    // Con la primera respuesta del servidor la conexión volvió: el aviso de conexión ya no vale y se retira solo.
    tap(event => {
      if (event instanceof HttpResponse) notifications.dismissMatching('error', CONNECTION_MESSAGE);
    }),
    catchError((error: unknown) => {
      errorChain.handle({
        error, url: req.url, auth, router, notifications,
        screenHandlesForbidden: req.context.get(SCREEN_HANDLES_FORBIDDEN),
        screenHandlesOffline: req.context.get(SCREEN_HANDLES_OFFLINE),
      });
      return throwError(() => error);
    })
  );
};
