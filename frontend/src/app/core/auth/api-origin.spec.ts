import { isSameOriginApiUrl } from './api-origin';

/** El token solo viaja a la propia API (S1-4, hallazgo 15 de la revisión de la línea base). */
// req: SIEP-RNF-04
describe('isSameOriginApiUrl', () => {
  it.each([
    '/api/auth/me',
    '/api/grupos/3/estudiantes?pagina=2',
    'api/auth/me',
  ])('%s es de la propia API', url => {
    expect(isSameOriginApiUrl(url)).toBe(true);
  });

  it('una URL absoluta del mismo origen cuenta', () => {
    expect(isSameOriginApiUrl(`${location.origin}/api/auth/me`)).toBe(true);
  });

  it.each([
    'https://otro.sitio/api/auth/me',
    'http://localhost:9/api/auth/me',
    '//otro.sitio/api/auth/me',
    'https://accounts.google.com/gsi/client',
    '/apis/algo',
    '/assets/mundo/fondo.webp',
    '/',
    '',
    'javascript:alert(1)',
  ])('%s no recibe el token', url => {
    expect(isSameOriginApiUrl(url)).toBe(false);
  });
});
