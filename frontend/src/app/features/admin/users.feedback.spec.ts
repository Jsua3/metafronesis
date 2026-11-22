import { AuthService } from '../../core/auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UsersComponent } from './users.component';
import type { Mock } from 'vitest';

/**
 * Feedback de acciones de la pantalla Usuarios.
 *
 * No se renderiza el template: se instancia el componente con dobles de los
 * servicios y se ejercitan sus métodos públicos.
 */
const ana = { id: 5, email: 'ana@siep.test', nombre: 'Ana', apellido: 'Pérez', role: 'ESTUDIANTE', activo: true } as AdminUser;

function backendError(status: number, body: unknown) {
  return throwError(() => new HttpErrorResponse({ status, error: body }));
}

describe('usuarios: feedback de acciones (comportamiento)', () => {
  let component: UsersComponent;
  let service: { list: Mock; create: Mock; update: Mock; updateStatus: Mock };
  let requests: { listPending: Mock; updateStatus: Mock };
  let notify: { success: Mock; error: Mock; warning: Mock; info: Mock };
  let dialog: { sheet: Mock; confirm: Mock };

  beforeEach(() => {
    service = { list: vi.fn(() => of([ana])), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() };
    dialog = { sheet: vi.fn(() => ({ close: vi.fn() })), confirm: vi.fn(() => Promise.resolve(true)) };
    requests = { listPending: vi.fn(() => of([])), updateStatus: vi.fn() };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ id: 99 }) } },
        { provide: Router, useValue: null }, { provide: ActivatedRoute, useValue: null },
        { provide: UserAdminService, useValue: service },
        { provide: AccessRequestAdminService, useValue: requests },
        { provide: NotificationService, useValue: notify },
        { provide: UiDialog, useValue: dialog },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new UsersComponent());
    component.users.set([ana]);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('guardar', () => {
    it('editar avisa el éxito y no deja mensaje en el banner', () => {
      component.editUser(ana);
      component.form.patchValue({ nombre: 'Ana María' });
      service.update.mockReturnValue(of({ ...ana, nombre: 'Ana María' }));

      component.save();

      expect(service.update).toHaveBeenCalledWith(5, expect.objectContaining({ nombre: 'Ana María' }));
      expect(notify.success).toHaveBeenCalledTimes(1);
      expect(notify.success).toHaveBeenCalledWith('La información se guardó correctamente.');
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.message()).toBe('');
      expect(component.error()).toBe('');
      expect(component.saving()).toBe(false);
    });

    it('crear avisa el éxito con el texto de creación', () => {
      component.newUser();
      component.form.setValue({
        nombre: 'Luis',
        apellido: 'Gómez',
        email: 'Luis@Siep.test',
        role: 'ESTUDIANTE',
        password: '1234567890',
      });
      service.create.mockReturnValue(of({ ...ana, id: 6, nombre: 'Luis', email: 'luis@siep.test' }));

      component.save();

      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'luis@siep.test' }));
      expect(notify.success).toHaveBeenCalledWith('Usuario creado correctamente.');
      expect(component.users().map(user => user.id)).toEqual([5, 6]);
    });

    it('error del backend: avisa su mensaje, libera saving y deja el banner vacío', () => {
      component.editUser(ana);
      service.update.mockReturnValue(backendError(400, { message: 'El correo ya está registrado.' }));

      component.save();

      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith('El correo ya está registrado.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.error()).toBe('');
      expect(component.saving()).toBe(false);
    });

    it('error sin mensaje útil: avisa el texto de respaldo', () => {
      component.editUser(ana);
      service.update.mockReturnValue(backendError(500, null));

      component.save();

      expect(notify.error).toHaveBeenCalledWith('No fue posible guardar los cambios.');
    });

    it('sin conexión (status 0): no duplica el aviso del interceptor pero libera saving', () => {
      component.editUser(ana);
      service.update.mockReturnValue(backendError(0, null));

      component.save();

      expect(notify.error).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });

    it('las validaciones de campos siguen en línea (mat-error) y no llaman al backend ni avisan', () => {
      component.newUser();
      component.save();

      expect(component.form.invalid).toBe(true);
      expect(notify.error).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();

      component.form.patchValue({ nombre: 'Luis', apellido: 'Gómez', email: 'luis@siep.test' });
      component.save();

      expect(component.form.controls.password.hasError('required')).toBe(true);
      expect(notify.error).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('descartar una solicitud de acceso', () => {
    const solicitud = {
      id: 21,
      nombre: 'Rosa',
      apellido: 'Vega',
      email: 'rosa@siep.test',
      status: 'PENDING',
      createdAt: '2026-09-01T10:00:00Z',
      reviewedAt: null,
    } as AccessRequest;

    beforeEach(() => component.accessRequests.set([solicitud]));

    it('éxito: avisa el resultado, quita la solicitud y deja el banner vacío', () => {
      requests.updateStatus.mockReturnValue(of({ ...solicitud, status: 'DISMISSED' }));

      component.dismissRequest(solicitud);

      expect(requests.updateStatus).toHaveBeenCalledWith(21, 'DISMISSED');
      expect(notify.success).toHaveBeenCalledTimes(1);
      expect(notify.success).toHaveBeenCalledWith('Solicitud descartada.');
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.accessRequests()).toEqual([]);
      expect(component.message()).toBe('');
      expect(component.saving()).toBe(false);
    });

    it('error 500 con mensaje: avisa el mensaje del backend, libera saving y deja el banner vacío', () => {
      requests.updateStatus.mockReturnValue(backendError(500, { message: 'La solicitud ya fue atendida.' }));

      component.dismissRequest(solicitud);

      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith('La solicitud ya fue atendida.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.accessRequests()).toEqual([solicitud]);
      expect(component.error()).toBe('');
      expect(component.saving()).toBe(false);
    });

    it('error sin mensaje útil: avisa el texto de respaldo', () => {
      requests.updateStatus.mockReturnValue(backendError(500, null));

      component.dismissRequest(solicitud);

      expect(notify.error).toHaveBeenCalledWith('No fue posible actualizar la solicitud.');
      expect(component.error()).toBe('');
    });

    it('sin conexión (status 0): no duplica el aviso del interceptor, libera saving y no hay banner', () => {
      requests.updateStatus.mockReturnValue(backendError(0, null));

      component.dismissRequest(solicitud);

      expect(notify.error).not.toHaveBeenCalled();
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.error()).toBe('');
      expect(component.message()).toBe('');
      expect(component.saving()).toBe(false);
    });
  });

  describe('cambiar el estado', () => {
    it('pide confirmar con el diálogo de la biblioteca y no llama al servidor hasta que se confirma', async () => {
      let answer!: (confirmed: boolean) => void;
      dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));
      service.updateStatus.mockReturnValue(of({ ...ana, activo: false }));

      const running = component.toggleStatus(ana);

      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Desactivar usuario', confirmLabel: 'Desactivar', tone: 'danger',
        message: expect.stringContaining('Ana Pérez'),
      }));
      expect(service.updateStatus).not.toHaveBeenCalled();

      answer(true);
      await running;
      expect(service.updateStatus).toHaveBeenCalledWith(5, false);
    });

    it('éxito: avisa el resultado y libera saving', async () => {
      service.updateStatus.mockReturnValue(of({ ...ana, activo: false }));

      await component.toggleStatus(ana);

      expect(service.updateStatus).toHaveBeenCalledWith(5, false);
      expect(notify.success).toHaveBeenCalledWith('Usuario desactivado correctamente.');
      expect(component.users()[0].activo).toBe(false);
      expect(component.saving()).toBe(false);
    });

    it('éxito al activar usa el texto de activación y el botón de confirmar no es de peligro', async () => {
      const inactivo = { ...ana, activo: false };
      component.users.set([inactivo]);
      service.updateStatus.mockReturnValue(of(ana));

      await component.toggleStatus(inactivo);

      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Activar usuario', confirmLabel: 'Activar', tone: 'default' }));
      expect(notify.success).toHaveBeenCalledWith('Usuario activado correctamente.');
    });

    it('cancelar la confirmación no cambia nada', async () => {
      dialog.confirm.mockResolvedValue(false);

      await component.toggleStatus(ana);

      expect(service.updateStatus).not.toHaveBeenCalled();
      expect(component.users()[0].activo).toBe(true);
    });

    it('dos gestos seguidos abren una sola confirmación y cambian el estado una sola vez', async () => {
      let answer!: (confirmed: boolean) => void;
      dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));
      service.updateStatus.mockReturnValue(of({ ...ana, activo: false }));

      const first = component.toggleStatus(ana);
      const second = component.toggleStatus(ana);
      answer(true);
      await Promise.all([first, second]);

      expect(dialog.confirm).toHaveBeenCalledTimes(1);
      expect(service.updateStatus).toHaveBeenCalledTimes(1);
    });

    it('error: avisa el mensaje del backend y libera saving', async () => {
      service.updateStatus.mockReturnValue(backendError(409, { message: 'No se puede desactivar al último administrador.' }));

      await component.toggleStatus(ana);

      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith('No se puede desactivar al último administrador.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.error()).toBe('');
      expect(component.saving()).toBe(false);
      expect(component.users()[0].activo).toBe(true);
    });

    it('error sin mensaje útil: avisa el texto de respaldo', async () => {
      service.updateStatus.mockReturnValue(backendError(500, null));

      await component.toggleStatus(ana);

      expect(notify.error).toHaveBeenCalledWith('No fue posible actualizar el estado del usuario.');
    });

    it('sin conexión (status 0): no duplica el aviso del interceptor', async () => {
      service.updateStatus.mockReturnValue(backendError(0, null));

      await component.toggleStatus(ana);

      expect(notify.error).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });
  });
});

describe('usuarios: el aviso de éxito no se borra al guardar (NotificationService real)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('guardar deja el formulario con el usuario guardado y el aviso sigue visible', async () => {
    const service = { update: vi.fn(() => of(ana)) };
    const requests = { listPending: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ id: 99 }) } },
        { provide: Router, useValue: null }, { provide: ActivatedRoute, useValue: null },
        { provide: UserAdminService, useValue: service },
        { provide: AccessRequestAdminService, useValue: requests },
        { provide: UiDialog, useValue: { sheet: vi.fn(() => ({ close: vi.fn() })), confirm: vi.fn(() => Promise.resolve(true)) } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    const notify = TestBed.inject(NotificationService);
    const component = TestBed.runInInjectionContext(() => new UsersComponent());
    component.editUser(ana);

    component.save();

    const visible = await firstValueFrom(notify.messages$);
    expect(visible).toEqual([expect.objectContaining({ type: 'success', text: 'La información se guardó correctamente.' })]);
    notify.clear();
  });
});
