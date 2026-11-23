import { HttpErrorResponse } from '@angular/common/http';

import { CaseAccess } from '../../core/models/simulation.model';
import { accessErrorMessage, accessFromError, accessNotice } from './case-access.util';

// req: RN-04, RF-15, RF-16
describe('accessNotice (por qué un caso asignado todavía no se puede iniciar)', () => {
  it('un acceso permitido no lleva aviso', () => {
    expect(accessNotice({ allowed: true })).toBeNull();
    expect(accessNotice({ allowed: true, closesAt: '2026-11-01T23:59:00' })).toBeNull();
  });

  it('«aún no abre» dice cuándo abre, con la fecha y la hora en español', () => {
    const notice = accessNotice({ allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00' })!;
    expect(notice.title).toBe('Aún no abre');
    expect(notice.detail).toMatch(/20 de oct/);
    expect(notice.detail).toMatch(/8:00/);
    expect(notice.tone).toBe('info');
    expect(notice.icon).toBe('schedule');
  });

  it('«aún no abre» sin fecha no inventa una', () => {
    const notice = accessNotice({ allowed: false, reason: 'NOT_YET_OPEN' })!;
    expect(notice.detail).not.toMatch(/\d/);
    expect(notice.detail).toContain('docente');
  });

  it('«ya cerró» dice cuándo cerró y que un intento en curso se puede terminar (decisión 12)', () => {
    const notice = accessNotice({ allowed: false, reason: 'CLOSED', closesAt: '2026-10-05T23:59:00' })!;
    expect(notice.title).toBe('Ya cerró');
    expect(notice.detail).toMatch(/5 de oct/);
    expect(notice.detail).toContain('uno en curso se puede terminar');
    expect(notice.tone).toBe('warning');
    expect(notice.icon).toBe('block');
  });

  it('un caso que va después de otro dice que hay que completar el anterior', () => {
    const notice = accessNotice({ allowed: false, reason: 'LOCKED_BY_SEQUENCE' })!;
    expect(notice.title).toBe('Bloqueado por la secuencia');
    expect(notice.detail).toContain('caso anterior');
    expect(notice.icon).toBe('lock');
  });

  it('un caso no asignado lo dice y manda a esperar a la asignación del docente', () => {
    const notice = accessNotice({ allowed: false, reason: 'NOT_ASSIGNED' })!;
    expect(notice.title).toBe('Este caso no está asignado a tu cuenta');
    expect(notice.detail).toContain('docente');
    expect(notice.icon).toBe('lock');
  });

  it('un motivo que el cliente no conoce se dice con palabras neutras, sin mostrar el código', () => {
    const notice = accessNotice({ allowed: false, reason: 'OTRO_MOTIVO' } as unknown as CaseAccess)!;
    expect(notice.title).toBe('Este caso no está disponible ahora');
    expect(`${notice.title} ${notice.detail}`).not.toContain('OTRO_MOTIVO');
  });

  it('negado sin motivo también es «no disponible» (el servidor es quien decide)', () => {
    expect(accessNotice({ allowed: false })!.title).toBe('Este caso no está disponible ahora');
  });
});

// req: RN-04, RF-15, decisión 12
describe('accessFromError (el rechazo ACCESS_* del servidor al iniciar un intento)', () => {
  const refusal = (code: string, extra: Record<string, unknown> = {}) =>
    new HttpErrorResponse({ status: 403, error: { success: false, code, message: 'texto del servidor', ...extra } });

  it('convierte cada código ACCESS_* en la decisión de acceso, con la ventana que trae', () => {
    expect(accessFromError(refusal('ACCESS_CLOSED', { closesAt: '2026-10-05T23:59:00-05:00' })))
      .toEqual({ allowed: false, reason: 'CLOSED', closesAt: '2026-10-05T23:59:00-05:00' });
    expect(accessFromError(refusal('ACCESS_NOT_YET_OPEN', { opensAt: '2026-10-20T08:00:00-05:00' })))
      .toEqual({ allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00-05:00' });
    expect(accessFromError(refusal('ACCESS_LOCKED_BY_SEQUENCE'))).toEqual({ allowed: false, reason: 'LOCKED_BY_SEQUENCE' });
    expect(accessFromError(refusal('ACCESS_NOT_ASSIGNED'))).toEqual({ allowed: false, reason: 'NOT_ASSIGNED' });
  });

  it('un 403 de otra cosa, otro estado o algo que no es una respuesta HTTP no es un rechazo de acceso', () => {
    expect(accessFromError(refusal('PASSWORD_CHANGE_REQUIRED'))).toBeNull();
    expect(accessFromError(new HttpErrorResponse({ status: 403 }))).toBeNull();
    expect(accessFromError(new HttpErrorResponse({ status: 409, error: { code: 'ACCESS_CLOSED' } }))).toBeNull();
    expect(accessFromError(new Error('ACCESS_CLOSED'))).toBeNull();
    expect(accessFromError(null)).toBeNull();
  });

  it('un código ACCESS_ que el cliente no conoce igual se dice «no disponible» (sin mostrar el código)', () => {
    const message = accessErrorMessage(refusal('ACCESS_OTRA_COSA'))!;
    expect(message).toContain('Este caso no está disponible ahora');
    expect(message).not.toContain('ACCESS_OTRA_COSA');
  });

  it('el mensaje une el título y el detalle del aviso del caso', () => {
    const message = accessErrorMessage(refusal('ACCESS_CLOSED', { closesAt: '2026-10-05T23:59:00-05:00' }))!;
    expect(message).toMatch(/^Ya cerró\. /);
    expect(message).toContain('ya no se pueden iniciar intentos');
    expect(accessErrorMessage(new HttpErrorResponse({ status: 500 }))).toBeNull();
  });
});
