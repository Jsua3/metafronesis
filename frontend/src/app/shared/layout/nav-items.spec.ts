import { navItemsFor, rolesFor } from './nav-items';

describe('navegación de la ola 1', () => {
  it.each([['ESTUDIANTE', '/portal/invitaciones'], ['PROFESOR', '/portal/grupos'], ['ADMIN', '/portal/admin/usuarios']] as const)('%s ve su destino', (rol, ruta) => {
    expect(navItemsFor(rol).map(item => item.route)).toEqual([ruta]);
  });
  it('rechaza destinos desconocidos', () => expect(() => rolesFor('no-existe')).toThrow());
});
