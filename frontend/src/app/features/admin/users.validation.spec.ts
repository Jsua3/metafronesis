import { AuthService } from '../../core/auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UsersComponent } from './users.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar en el formulario de Usuarios.
 *
 * No se renderiza el template: se instancia el componente con dobles de los
 * servicios y un host DOM mínimo (sin Material) para comprobar el foco.
 */
const ana = { id: 5, email: 'ana@siep.test', nombre: 'Ana', apellido: 'Pérez', role: 'ESTUDIANTE', activo: true } as AdminUser;
const solicitud = {
  id: 21,
  nombre: 'Rosa',
  apellido: 'Vega',
  email: 'rosa@siep.test',
  status: 'PENDING',
  createdAt: '2026-09-01T10:00:00Z',
  reviewedAt: null,
} as AccessRequest;

describe('usuarios: validar al enviar (comportamiento)', () => {
  let component: UsersComponent;
  let host: HTMLElement;
  let service: { list: Mock; create: Mock; update: Mock; updateStatus: Mock };
  let notify: { success: Mock; error: Mock; warning: Mock; info: Mock };

  /** Rellena los campos obligatorios distintos de la contraseña. */
  const fillRequired = () => component.form.patchValue({ nombre: 'Luis', apellido: 'Gómez', email: 'luis@siep.test' });
  const password = () => component.form.controls.password;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    service = { list: vi.fn(() => of([ana])), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ id: 99 }) } },
        { provide: Router, useValue: null }, { provide: ActivatedRoute, useValue: null },
        { provide: UserAdminService, useValue: service },
        { provide: AccessRequestAdminService, useValue: { listPending: vi.fn(() => of([])), updateStatus: vi.fn() } },
        { provide: NotificationService, useValue: notify },
        // La hoja del formulario no se abre en estas pruebas: aquí se ejercita la validación del formulario.
        { provide: UiDialog, useValue: { sheet: vi.fn(() => ({ close: vi.fn() })), confirm: vi.fn(() => Promise.resolve(true)) } },
        { provide: ElementRef, useValue: new ElementRef(host) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new UsersComponent());
  });

  afterEach(() => {
    host.remove();
    TestBed.resetTestingModule();
  });

  describe('guardar con el formulario inválido', () => {
    it('no llama al servicio, marca todos los campos como tocados y no muestra banner ni aviso', () => {
      component.newUser();

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
      expect(Object.values(component.form.controls).every(control => control.touched)).toBe(true);
      expect(component.error()).toBe('');
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });

    it('al editar con un campo vacío tampoco llama al servicio', () => {
      component.editUser(ana);
      component.form.patchValue({ nombre: '' });

      component.save();

      expect(service.update).not.toHaveBeenCalled();
      expect(component.form.controls.nombre.touched).toBe(true);
    });

    it('con todo lo demás correcto, la contraseña vacía al crear no llama al servicio', () => {
      component.newUser();
      fillRequired();

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(password().touched).toBe(true);
      expect(password().hasError('required')).toBe(true);
    });

    it('enfoca el primer control inválido del host', () => {
      host.innerHTML = '<input id="ok" class="ng-valid"><input id="uno" class="ng-invalid"><input id="dos" class="ng-invalid">';
      component.newUser();

      component.save();

      expect(document.activeElement).toBe(host.querySelector('#uno'));
    });

    it('un formulario válido no mueve el foco', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';
      component.newUser();
      fillRequired();
      password().setValue('1234567890');
      service.create.mockReturnValue(of({ ...ana, id: 6 }));

      component.save();

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });
  });

  describe('contraseña al crear', () => {
    const escenarios: Array<[string, () => void]> = [
      ['estado inicial', () => component.ngOnInit()],
      ['tras newUser()', () => component.newUser()],
    ];

    it.each(escenarios)('%s: vacía es obligatoria', (_nombre, preparar) => {
      preparar();
      fillRequired();

      expect(password().hasError('required')).toBe(true);
      expect(component.form.invalid).toBe(true);
    });

    it.each(escenarios)('%s: con 9 caracteres es inválida (el servidor exige 10, E2-9)', (_nombre, preparar) => {
      preparar();
      fillRequired();
      password().setValue('123456789');

      expect(password().hasError('minlength')).toBe(true);
      expect(password().hasError('required')).toBe(false);
      expect(component.form.invalid).toBe(true);
    });

    it.each(escenarios)('%s: con 10 caracteres es válida', (_nombre, preparar) => {
      preparar();
      fillRequired();
      password().setValue('1234567890');

      expect(password().valid).toBe(true);
      expect(component.form.valid).toBe(true);
    });

    it('atender una solicitud de acceso es crear: la contraseña vuelve a ser obligatoria', () => {
      component.editUser(ana);
      expect(password().valid).toBe(true);

      component.attendRequest(solicitud);

      expect(component.selectedUser()).toBeNull();
      expect(password().hasError('required')).toBe(true);
      expect(component.form.invalid).toBe(true);
    });
  });

  describe('contraseña al editar', () => {
    it('vacía es válida y el formulario no se bloquea', () => {
      component.editUser(ana);

      expect(password().hasError('required')).toBe(false);
      expect(password().valid).toBe(true);
      expect(component.form.valid).toBe(true);
    });

    it('con 9 caracteres es inválida y con 10 es válida (E2-9)', () => {
      component.editUser(ana);

      password().setValue('123456789');
      expect(password().hasError('minlength')).toBe(true);
      expect(component.form.invalid).toBe(true);

      password().setValue('1234567890');
      expect(password().valid).toBe(true);
    });

    it('guardar con la contraseña vacía actualiza sin enviarla', () => {
      component.editUser(ana);
      service.update.mockReturnValue(of(ana));

      component.save();

      expect(service.update).toHaveBeenCalledWith(5, expect.objectContaining({ password: undefined }));
    });

    it('las reglas siguen al modo: editar y volver a crear', () => {
      component.editUser(ana);
      expect(password().valid).toBe(true);

      component.newUser();
      expect(password().hasError('required')).toBe(true);

      component.editUser(ana);
      expect(password().valid).toBe(true);
    });

    it('tras crear con éxito el formulario queda en modo edición (contraseña opcional)', () => {
      component.newUser();
      fillRequired();
      password().setValue('1234567890');
      service.create.mockReturnValue(of({ ...ana, id: 6, nombre: 'Luis', email: 'luis@siep.test' }));

      component.save();

      expect(component.selectedUser()?.id).toBe(6);
      expect(password().valid).toBe(true);
      expect(password().value).toBe('');
    });
  });
});
