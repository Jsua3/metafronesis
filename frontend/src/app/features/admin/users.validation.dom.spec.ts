import { AuthService } from '../../core/auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UserFormSheetComponent } from './user-form-sheet.component';
import { UsersComponent } from './users.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar el formulario de usuario, con los campos de la biblioteca y el DOM renderizado de la HOJA (F7-6).
 *
 * La pantalla (`UsersComponent`) es dueña del formulario y de guardar; la hoja lo presenta. Aquí la hoja se monta
 * sobre una pantalla real. Estas pruebas comprueban lo que ve el usuario: tras enviar con errores, cambiar de
 * formulario (Nuevo usuario, editar, atender una solicitud, guardar con éxito) no debe dejar ningún mensaje de error
 * visible en un formulario en blanco.
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

describe('usuarios: validar al enviar (DOM de la hoja con la biblioteca)', () => {
  let sheet: ComponentFixture<UserFormSheetComponent>;
  let component: UsersComponent;
  let root: HTMLElement;
  let service: { list: Mock; create: Mock; update: Mock; updateStatus: Mock };
  let dialog: { sheet: Mock; confirm: Mock };
  const holder: { users?: UsersComponent } = {};

  const errorTexts = () => Array.from(root.querySelectorAll('.ui-field__message--error')).map(node => (node.textContent ?? '').trim());
  const submit = () => {
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    sheet.detectChanges();
  };
  const cancel = () => {
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(candidate => (candidate.textContent ?? '').includes('Cancelar'))!.click();
    sheet.detectChanges();
  };
  const fillValid = () => {
    component.form.patchValue({ nombre: 'Luis', apellido: 'Gómez', email: 'luis@siep.test', password: '1234567890' });
    sheet.detectChanges();
  };

  beforeEach(() => {
    service = { list: vi.fn(() => of([ana])), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() };
    // La hoja «abierta»: su capa es la raíz del componente de la hoja (donde viven los campos y se busca el foco).
    dialog = { sheet: vi.fn(() => ({ close: vi.fn(), overlayRef: { overlayElement: root } })), confirm: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      imports: [UsersComponent, UserFormSheetComponent],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ id: 99 }) } },
        { provide: Router, useValue: null }, { provide: ActivatedRoute, useValue: null },
        { provide: UserAdminService, useValue: service },
        { provide: AccessRequestAdminService, useValue: { listPending: vi.fn(() => of([])), updateStatus: vi.fn() } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
        { provide: UiDialog, useValue: dialog },
        // La hoja lee a su pantalla por DIALOG_DATA: aquí es la pantalla real, creada justo debajo.
        { provide: DIALOG_DATA, useFactory: () => ({ get host() { return holder.users!; } }) },
      ],
    });
    const screen = TestBed.createComponent(UsersComponent);
    component = screen.componentInstance;
    holder.users = component;
    screen.detectChanges();
    sheet = TestBed.createComponent(UserFormSheetComponent);
    root = sheet.nativeElement;
    document.body.appendChild(root);
    component.newUser();
    sheet.detectChanges();
  });

  afterEach(() => {
    root.remove();
    holder.users = undefined;
    TestBed.resetTestingModule();
  });

  it('al abrir el formulario no muestra ningún error', () => {
    expect(errorTexts()).toEqual([]);
  });

  it('enviar vacío muestra el error de cada campo obligatorio y no llama al servicio', () => {
    submit();

    expect(errorTexts()).toEqual([
      'Escribe el nombre.',
      'Escribe el apellido.',
      'Escribe el correo.',
      'La contraseña es obligatoria al crear un usuario.',
    ]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('enviar vacío lleva el foco al primer campo inválido', () => {
    submit();

    expect(document.activeElement).toBe(root.querySelector('input[formControlName="nombre"]'));
  });

  it('cada campo inválido queda marcado para el lector de pantalla y su error lo describe', () => {
    submit();

    const nombre = root.querySelector<HTMLInputElement>('input[formControlName="nombre"]')!;
    expect(nombre.getAttribute('aria-invalid')).toBe('true');
    expect(nombre.getAttribute('aria-required')).toBe('true');
    const described = nombre.getAttribute('aria-describedby') ?? '';
    expect(root.querySelector(`#${described}`)?.textContent?.trim()).toBe('Escribe el nombre.');
  });

  it('«Nuevo usuario» tras un envío inválido deja el formulario en blanco sin errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.newUser();
    sheet.detectChanges();

    expect(errorTexts()).toEqual([]);
  });

  it('«Cancelar» cierra la hoja', () => {
    submit();
    const ref = dialog.sheet.mock.results[0].value as { close: Mock };

    cancel();

    expect(ref.close).toHaveBeenCalledTimes(1);
  });

  it('editar un usuario tras un envío inválido no muestra errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.editUser(ana);
    sheet.detectChanges();

    expect(errorTexts()).toEqual([]);
  });

  it('editar un usuario con un dato vacío no muestra su error hasta que se envía', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.editUser({ ...ana, apellido: '' });
    sheet.detectChanges();
    expect(errorTexts()).toEqual([]);

    submit();
    expect(errorTexts()).toEqual(['Escribe el apellido.']);
  });

  it('atender una solicitud de acceso tras un envío inválido no muestra errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.attendRequest(solicitud);
    sheet.detectChanges();

    expect(errorTexts()).toEqual([]);
  });

  it('guardar con éxito tras un envío inválido no deja errores y cierra la hoja', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);
    fillValid();
    service.create.mockReturnValue(of({ ...ana, id: 6, nombre: 'Luis', email: 'luis@siep.test' }));
    const ref = dialog.sheet.mock.results[0].value as { close: Mock };

    submit();

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(errorTexts()).toEqual([]);
    expect(ref.close).toHaveBeenCalledTimes(1);
  });

  it('después de reiniciar el formulario, un nuevo envío vacío vuelve a mostrar los errores', () => {
    submit();
    component.newUser();
    sheet.detectChanges();
    expect(errorTexts()).toEqual([]);

    submit();

    expect(errorTexts()).toContain('Escribe el nombre.');
  });

  it('al editar, un correo inválido se explica y no se pide contraseña', () => {
    component.editUser(ana);
    component.form.patchValue({ email: 'no-es-correo' });
    sheet.detectChanges();

    submit();

    expect(errorTexts()).toEqual(['Escribe un correo válido.']);
  });

  it('al editar, la contraseña es opcional y la etiqueta lo dice; al crear es obligatoria', () => {
    expect(Array.from(root.querySelectorAll('label')).map(label => (label.textContent ?? '').trim())).toContain('Contraseña *');
    component.editUser(ana);
    sheet.detectChanges();
    expect(Array.from(root.querySelectorAll('label')).map(label => (label.textContent ?? '').trim())).toContain('Nueva contraseña (opcional)');
  });

  it('el botón Guardar no se bloquea por un formulario inválido y queda ocupado, con «Guardando…», solo mientras guarda', () => {
    const save = () => root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(component.form.invalid).toBe(true);
    expect(save().getAttribute('aria-disabled')).toBeNull();

    component.saving.set(true);
    sheet.detectChanges();

    expect(save().getAttribute('aria-disabled')).toBe('true');
    expect(save().getAttribute('aria-busy')).toBe('true');
    expect((save().textContent ?? '')).toContain('Guardando…');
  });
});
