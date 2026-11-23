import { navItemsFor, rolesFor } from './nav-items';

describe('navegación de la ola 1', () => {
  it('ESTUDIANTE ve Inicio, Casos, Mi personaje y Grupos, en ese orden', () => {
    expect(navItemsFor('ESTUDIANTE').map(item => item.route)).toEqual(['/portal/dashboard', '/portal/simulador', '/portal/personaje', '/portal/invitaciones']);
  });
  it('PROFESOR ve Inicio, Revisión, Casos, Grupos, Reportes y Rúbricas, en ese orden', () => {
    expect(navItemsFor('PROFESOR').map(item => item.route)).toEqual(['/portal/dashboard', '/portal/docente/trazabilidad', '/portal/casos', '/portal/grupos', '/portal/reportes', '/portal/rubricas']);
  });
  it('ADMIN ve Inicio, Usuarios, Casos, Revisión, Reportes y Rúbricas, en ese orden', () => {
    expect(navItemsFor('ADMIN').map(item => item.route)).toEqual(['/portal/dashboard', '/portal/admin/usuarios', '/portal/casos', '/portal/docente/trazabilidad', '/portal/reportes', '/portal/rubricas']);
  });
  it('Revisión y Rúbricas son del personal y Rúbricas se pliega al desplazarse', () => {
    expect(rolesFor('trazabilidad')).toEqual(['PROFESOR', 'ADMIN']);
    expect(rolesFor('reportes')).toEqual(['PROFESOR', 'ADMIN']);
    expect(rolesFor('rubricas')).toEqual(['PROFESOR', 'ADMIN']);
    expect(navItemsFor('PROFESOR').filter(item => item.fold.includes('PROFESOR')).map(item => item.id)).toEqual(['reportes', 'rubricas']);
  });
  it('rechaza destinos desconocidos', () => expect(() => rolesFor('no-existe')).toThrow());
});
