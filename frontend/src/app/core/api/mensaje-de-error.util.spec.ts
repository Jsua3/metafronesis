import { HttpErrorResponse } from '@angular/common/http';

import { esTextoParaPersona, mensajeDeCarga, mensajeDeError } from './mensaje-de-error.util';

const falla = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('errores en palabras de persona (P6)', () => {
  it('un mensaje del servidor en español claro se dice tal cual', () => {
    expect(mensajeDeError(falla(409, { message: 'El caso ya está asignado a este grupo.' }), 'No se pudo.')).toBe('El caso ya está asignado a este grupo.');
    expect(mensajeDeError(falla(400, { detail: 'Solo se pueden asignar casos publicados y activos' }), 'No se pudo.')).toBe('Solo se pueden asignar casos publicados y activos');
  });

  it('un texto técnico o en inglés nunca llega a la pantalla: se cambia por qué pasó y qué hacer', () => {
    for (const crudo of ['Not found.', 'Internal Server Error', 'Traceback (most recent call last): File "x.py"', '{"detail":"x"}', 'HTTP 500 del servidor', '<html><body>502</body></html>']) {
      const texto = mensajeDeError(falla(400, { message: crudo }), 'No fue posible guardar.');
      expect(texto, crudo).toBe('No fue posible guardar. Inténtalo de nuevo.');
    }
  });

  it('según el tipo de fallo sugiere la acción', () => {
    expect(mensajeDeError(falla(500), 'No fue posible guardar.')).toBe('No fue posible guardar. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    expect(mensajeDeError(falla(404), 'No fue posible guardar.')).toBe('No fue posible guardar. Puede que ya no exista o que otra persona lo haya cambiado: recarga la página.');
    expect(mensajeDeError(falla(422), 'No fue posible guardar.', 'Revisa los datos.')).toBe('No fue posible guardar. Revisa los datos.');
  });

  it('si el interceptor ya avisó (sin conexión, sesión, permiso) o no es un error HTTP, no avisa dos veces', () => {
    for (const status of [0, 401, 403]) expect(mensajeDeError(falla(status), 'x')).toBeNull();
    expect(mensajeDeError(new Error('boom'), 'x')).toBeNull();
  });

  it('distingue lo que se le puede leer a una persona', () => {
    expect(esTextoParaPersona('No tienes permisos para modificar este grupo.')).toBe(true);
    expect(esTextoParaPersona('Not found.')).toBe(false);
    expect(esTextoParaPersona('')).toBe(false);
    expect(esTextoParaPersona(42)).toBe(false);
    expect(esTextoParaPersona('x '.repeat(200))).toBe(false);
  });

  it('una carga que falló dice qué hacer según el estado', () => {
    expect(mensajeDeCarga(0, 'No pudimos cargar los grupos.')).toBe('No pudimos cargar los grupos. Revisa tu conexión e inténtalo de nuevo.');
    expect(mensajeDeCarga(401, 'No pudimos cargar los grupos.')).toBe('No pudimos cargar los grupos. Tu sesión terminó: vuelve a entrar.');
    expect(mensajeDeCarga(403, 'No pudimos cargar los grupos.')).toBe('No pudimos cargar los grupos. Tu cuenta no tiene permiso para verlo.');
    expect(mensajeDeCarga(503, 'No pudimos cargar los grupos.')).toBe('No pudimos cargar los grupos. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    expect(mensajeDeCarga(undefined, 'No pudimos cargar los grupos.')).toBe('No pudimos cargar los grupos. Inténtalo de nuevo.');
  });
});
