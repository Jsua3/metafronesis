import { safeReturnUrl } from './return-url';

/**
 * Regreso tras iniciar sesión (plan visual F3-6, H-34): la guardia manda a /login?returnUrl=<ruta> y el acceso vuelve
 * allí al entrar. Solo rutas INTERNAS: un returnUrl manipulado no puede sacar a la persona del sitio (open redirect).
 */
// req: BLOQUE-H (H-34: sesión expirada sin perder el lugar), RNF-004
describe('safeReturnUrl', () => {
  it('acepta rutas internas, con consulta y fragmento', () => {
    expect(safeReturnUrl('/portal/grupos')).toBe('/portal/grupos');
    expect(safeReturnUrl('/portal/docente/trazabilidad?intento=4#linea')).toBe('/portal/docente/trazabilidad?intento=4#linea');
  });

  it('rechaza lo que saldría del sitio: protocolo relativo, barras invertidas, esquemas y rutas relativas', () => {
    for (const value of ['//evil.example', '/\\evil.example', '/\\/evil.example', 'http://evil.example', 'https:evil', 'javascript:alert(1)', 'portal/grupos', ' /portal/grupos']) {
      expect(safeReturnUrl(value), value).toBeNull();
    }
  });

  it('rechaza el propio acceso (no hay bucle) y los valores vacíos', () => {
    for (const value of ['/login', '/login?returnUrl=%2Fportal', '/login;motivo=x', '', null, undefined]) {
      expect(safeReturnUrl(value), String(value)).toBeNull();
    }
  });

  it('rechaza las rutas con un escape % roto (el Router no las entiende y caería a la portada)', () => {
    expect(safeReturnUrl('/%')).toBeNull();
    expect(safeReturnUrl('/portal/%E0%A4%A')).toBeNull();
    expect(safeReturnUrl('/portal/grupos?nombre=Mar%C3%ADa')).toBe('/portal/grupos?nombre=Mar%C3%ADa');
  });

  it('rechaza caracteres de control (un salto de línea no puede partir la ruta)', () => {
    expect(safeReturnUrl('/portal\n//evil.example')).toBeNull();
    expect(safeReturnUrl('/portal\t/x')).toBeNull();
  });
});
