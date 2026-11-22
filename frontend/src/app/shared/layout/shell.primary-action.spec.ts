import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class Screen {}

/**
 * Acción principal de cada rol (T15.4), reescrita para la barra de vidrio (plan visual F3-3). Antes era un botón al
 * pie del menú lateral; ahora es el destino principal de la barra, que nunca se pliega. El estudiante va a sus casos
 * (el menú no sabe si hay un intento activo, así que no promete «Continuar»); el docente, a revisar intentos
 * (Revisión); el administrador, a Usuarios (DISENO §3.2: su tarea principal, que deja de plegarse).
 */
describe('acción principal de cada rol en la barra (T15.4)', () => {
  const cases: Array<[User['role'], string]> = [
    ['ESTUDIANTE', '/portal/invitaciones'],
    ['PROFESOR', '/portal/grupos'],
    ['ADMIN', '/portal/admin/usuarios'],
  ];

  for (const [role, route] of cases) {
    it(`${role}: ${route} está en la barra, a la vista al desplazarse, y nada promete «Continuar simulación»`, async () => {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideRouter([{ path: '**', component: Screen }]),
          { provide: AuthService, useValue: { currentUser: signal<User>({ id: 1, nombre: 'A', apellido: 'B', email: 'a@b.co', role }), logout: () => undefined } },
        ],
      });
      const fixture = TestBed.createComponent(ShellComponent);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      const link = [...host.querySelectorAll<HTMLAnchorElement>('.modulo-principal a.nav-enlace')]
        .find(anchor => anchor.getAttribute('href') === route);
      expect(link, route).toBeDefined();
      expect(link!.classList).not.toContain('control-plegable');
      expect(host.textContent).not.toMatch(/continuar simulación/i);
    });
  }
});
