import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { DestinoConInsignia, NavBadgesService, pendientesDeUsuarios, textoInsignia, textoInsigniaAccesible } from './nav-badges.service';
import { UserRole, navItemsFor } from './nav-items';

const persona = (id: number): User => ({ id, nombre: 'Ana', apellido: 'Ruiz', email: 'a@b.co', role: 'ESTUDIANTE' });

/**
 * Insignias de pendientes de la navegación (DISENO §2.5, C15): las escriben las pantallas que ya tienen el dato y las
 * pinta la barra. Siguen a la persona de la sesión (D-16): en un computador compartido nadie ve las de la anterior.
 */
// req: DISENO C15, D-16
describe('NavBadgesService', () => {
  const currentUser = signal<User | null>(persona(1));
  let insignias: NavBadgesService;

  beforeEach(() => {
    currentUser.set(persona(1));
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: AuthService, useValue: { currentUser } }],
    });
    insignias = TestBed.inject(NavBadgesService);
  });

  it('empieza sin cuentas', () => {
    expect(insignias.cuentas()).toEqual({});
    expect(insignias.cuenta('invitaciones')).toBe(0);
  });

  it('fija y lee las cuentas por destino; 0 la quita', () => {
    insignias.fijar('invitaciones', 2);
    insignias.fijar('usuarios', 5);
    expect(insignias.cuentas()).toEqual({ invitaciones: 2, usuarios: 5 });
    insignias.fijar('invitaciones', 0);
    expect(insignias.cuentas()).toEqual({ usuarios: 5 });
  });

  // P6: una sola fuente para el número de pendientes de Usuarios (el Inicio y la pantalla escriben con la misma regla).
  it('«Usuarios» suma solicitudes y cuentas por aprobar, y sin una de las dos cifras no dice ninguna', () => {
    insignias.fijarUsuarios(3, 1);
    expect(insignias.cuenta('usuarios')).toBe(4);
    insignias.fijarUsuarios(0, 0);
    expect(insignias.cuentas()).toEqual({});
    insignias.fijarUsuarios(3, null);
    expect(insignias.cuentas()).toEqual({});
    insignias.fijarUsuarios(null, 2);
    expect(insignias.cuentas()).toEqual({});
    expect(pendientesDeUsuarios(2, 2)).toBe(4);
    expect(pendientesDeUsuarios(null, 2)).toBeNull();
  });

  it('descarta negativos, decimales y valores no finitos', () => {
    insignias.fijar('invitaciones', -3);
    insignias.fijar('invitaciones', 2.7);
    insignias.fijar('usuarios', Number.NaN);
    expect(insignias.cuentas()).toEqual({ invitaciones: 2 });
    insignias.fijar('invitaciones', Number.POSITIVE_INFINITY);
    expect(insignias.cuentas()).toEqual({});
  });

  // D-22: el destino «Grupos» del estudiante tiene el id `invitaciones`; una insignia con un id que no es un destino
  // del menú no se pintaría nunca.
  it('cada destino que admite insignia es un destino real del menú, del rol que hace ese trabajo', () => {
    const destinos: Record<DestinoConInsignia, UserRole> = { invitaciones: 'ESTUDIANTE', trazabilidad: 'PROFESOR', usuarios: 'ADMIN' };
    for (const [id, rol] of Object.entries(destinos)) {
      expect(navItemsFor(rol).some(item => item.id === id), `${rol} → ${id}`).toBe(true);
    }
  });

  it('las cuentas de otra persona se leen vacías y no se mezclan con las nuevas', () => {
    insignias.fijar('invitaciones', 2);
    currentUser.set(persona(2));
    expect(insignias.cuentas()).toEqual({});
    insignias.fijar('usuarios', 1);
    expect(insignias.cuentas()).toEqual({ usuarios: 1 });
    currentUser.set(persona(1));
    expect(insignias.cuentas()).toEqual({});
  });

  it('sin sesión no hay cuentas ni se pueden escribir', () => {
    currentUser.set(null);
    insignias.fijar('invitaciones', 4);
    expect(insignias.cuentas()).toEqual({});
  });

  // cerrar sesión y volver a entrar con la misma persona, sin recargar, no revive las cuentas.
  it('al cerrar sesión se vacía el registro: la misma persona vuelve a entrar sin pendientes viejos', () => {
    insignias.fijar('invitaciones', 3);
    currentUser.set(null);
    TestBed.tick();
    currentUser.set(persona(1));
    TestBed.tick();
    expect(insignias.cuentas()).toEqual({});
  });

  it('el texto visible se abrevia a «99+» y el accesible dice cuántos pendientes hay', () => {
    expect(textoInsignia(7)).toBe('7');
    expect(textoInsignia(100)).toBe('99+');
    expect(textoInsigniaAccesible(1)).toBe(' (1 pendiente)');
    expect(textoInsigniaAccesible(3)).toBe(' (3 pendientes)');
  });
});
