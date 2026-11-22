import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { appConfig } from '../../app.config';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notifications/notification.service';
import { SiepErrorHandler, UNHANDLED_ERROR_NOTICE } from './siep-error-handler';

// req: RNF-05
describe('SiepErrorHandler (ANG-8)', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), SiepErrorHandler],
    });
  });

  afterEach(() => consoleError.mockRestore());

  const visible = () => firstValueFrom(TestBed.inject(NotificationService).messages$);

  it('registra el error en consola sin tragarlo', () => {
    const failure = new Error('Fallo de renderizado en panel');

    TestBed.inject(SiepErrorHandler).handleError(failure);

    expect(consoleError).toHaveBeenCalledWith('[SIEP:UnhandledError]', failure);
  });

  it('avisa a quien usa la aplicación con un solo texto, sin filtrar el mensaje técnico', async () => {
    TestBed.inject(SiepErrorHandler).handleError(new Error('Cannot read properties of undefined (reading "x")'));

    const messages = await visible();

    expect(messages).toEqual([expect.objectContaining({ type: 'error', text: UNHANDLED_ERROR_NOTICE })]);
    expect(messages[0].text).not.toContain('undefined');
  });

  it('varios errores seguidos dejan un solo aviso: el servicio absorbe el repetido', async () => {
    const handler = TestBed.inject(SiepErrorHandler);

    handler.handleError(new Error('uno'));
    handler.handleError(new Error('dos'));
    handler.handleError('tres');

    expect(await visible()).toHaveLength(1);
  });

  it.each([
    new Error('ResizeObserver loop completed with undelivered notifications.'),
    new DOMException('The operation was aborted.', 'AbortError'),
    'AbortError: cancelado',
  ])('el ruido benigno del navegador (%s) se registra pero no avisa', async benign => {
    TestBed.inject(SiepErrorHandler).handleError(benign);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(await visible()).toEqual([]);
  });

  it('app.config provee SiepErrorHandler como ErrorHandler global', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: AuthService, useValue: { syncCurrentUser: () => of(null) } }],
    });
    expect(TestBed.inject(ErrorHandler)).toBeInstanceOf(SiepErrorHandler);
  });
});
