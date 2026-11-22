import { HttpErrorResponse } from '@angular/common/http';

import { CONSENT_REQUIRED, REHEARSAL_GONE, apiErrorMessage, isConsentRequiredError, isRehearsalGoneError } from './api-error.util';

function httpError(status: number, error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error });
}

// req: ETH-01, SIEP-RF-05
describe('isConsentRequiredError', () => {
  const required = { success: false, code: 'CONSENT_REQUIRED', message: 'Para continuar necesitas leer y aceptar el aviso.', noticeVersion: 'v-vigente' };

  it('reconoce el 403 con el código estable CONSENT_REQUIRED', () => {
    expect(CONSENT_REQUIRED).toBe('CONSENT_REQUIRED');
    expect(isConsentRequiredError(httpError(403, required))).toBe(true);
  });

  it('decide por el código y nunca por el texto', () => {
    expect(isConsentRequiredError(httpError(403, { ...required, message: 'otro texto' }))).toBe(true);
    expect(isConsentRequiredError(httpError(403, { success: false, code: 'OTRO', message: required.message }))).toBe(false);
  });

  it('no confunde otros 403 ni otros códigos de consentimiento', () => {
    for (const code of ['PASSWORD_CHANGE_REQUIRED', 'DATA_TREATMENT_CONSENT_REQUIRED', 'ACCESS_CLOSED', 'FORBIDDEN']) {
      expect(isConsentRequiredError(httpError(403, { success: false, code })), code).toBe(false);
    }
    expect(isConsentRequiredError(httpError(403, null))).toBe(false);
    expect(isConsentRequiredError(httpError(403, 'CONSENT_REQUIRED'))).toBe(false);
    expect(isConsentRequiredError(httpError(403, {}))).toBe(false);
  });

  it('exige también el estado 403', () => {
    for (const status of [0, 400, 401, 404, 409, 429, 500]) {
      expect(isConsentRequiredError(httpError(status, required)), String(status)).toBe(false);
    }
  });

  it('lo que no es una respuesta HTTP no cuenta', () => {
    expect(isConsentRequiredError(new Error('CONSENT_REQUIRED'))).toBe(false);
    expect(isConsentRequiredError(null)).toBe(false);
    expect(isConsentRequiredError({ status: 403, error: required })).toBe(false);
  });
});

describe('apiErrorMessage', () => {
  it('usa el mensaje del backend', () => {
    expect(apiErrorMessage(httpError(400, { message: 'El código ya existe.' }), 'Respaldo')).toBe('El código ya existe.');
  });

  it('usa detail cuando no hay message (DRF)', () => {
    expect(apiErrorMessage(httpError(404, { detail: 'No encontrado.' }), 'Respaldo')).toBe('No encontrado.');
  });

  it('usa el respaldo si el cuerpo no trae texto', () => {
    expect(apiErrorMessage(httpError(500, null), 'No fue posible guardar.')).toBe('No fue posible guardar.');
    expect(apiErrorMessage(httpError(400, { message: '   ' }), 'Respaldo')).toBe('Respaldo');
  });

  it('devuelve null cuando el interceptor ya avisó', () => {
    for (const status of [0, 401, 403]) {
      expect(apiErrorMessage(httpError(status, { message: 'x' }), 'Respaldo')).toBeNull();
    }
    expect(apiErrorMessage(new Error('boom'), 'Respaldo')).toBeNull();
  });
});

describe('isRehearsalGoneError', () => {
  it('reconoce el 404 REHEARSAL_GONE y nada más', () => {
    expect(REHEARSAL_GONE).toBe('REHEARSAL_GONE');
    expect(isRehearsalGoneError(httpError(404, { code: 'REHEARSAL_GONE' }))).toBe(true);
    expect(isRehearsalGoneError(httpError(404, { code: 'NOT_FOUND' }))).toBe(false);
    expect(isRehearsalGoneError(httpError(403, { code: 'REHEARSAL_GONE' }))).toBe(false);
    expect(isRehearsalGoneError(httpError(404, null))).toBe(false);
    expect(isRehearsalGoneError(new Error('REHEARSAL_GONE'))).toBe(false);
  });
});
