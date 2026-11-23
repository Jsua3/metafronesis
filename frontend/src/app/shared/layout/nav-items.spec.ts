import { navItemsFor, rolesFor } from './nav-items';

describe('navegación de la ola 1', () => {
  it.each([['ESTUDIANTE', ['/portal/dashboard', '/portal/simulador', '/portal/personaje', '/portal/invitaciones']], ['PROFESOR', ['/portal/grupos']], ['ADMIN', ['/portal/admin/usuarios']]] as const)('%s ve sus destinos', (rol, rutas) => {
    expect(navItemsFor(rol).map(item => item.route)).toEqual(rutas);
  });
  it('rechaza destinos desconocidos', () => expect(() => rolesFor('no-existe')).toThrow());
});
