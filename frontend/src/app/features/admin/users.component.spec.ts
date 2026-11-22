import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiMenu } from '../../shared/ui/menu/ui-menu';
import { UserFormSheetComponent } from './user-form-sheet.component';
import { UsersComponent } from './users.component';

/**
 * Pantalla Usuarios en el sistema de la biblioteca (plan visual F7-6): el formulario va en una hoja (`UiDialog.sheet`)
 * en vez de quedar bajo la tabla, las acciones de cada fila son un botón con su ayuda y un menú, el error de la lista
 * no se confunde con una lista vacía y una solicitud de acceso que no carga se ve. La lógica de cada acción vive en
 * las specs de comportamiento (`users.feedback.spec.ts`, `users.validation.spec.ts`).
 */
const ana = { id: 5, email: 'ana@siep.test', nombre: 'Ana', apellido: 'Pérez', role: 'ESTUDIANTE', activo: true } as AdminUser;
const beto = { id: 6, email: 'beto@siep.test', nombre: 'Beto', apellido: 'Ríos', role: 'PROFESOR', activo: false } as AdminUser;
const solicitud = {
  id: 21, nombre: 'Rosa', apellido: 'Vega', email: 'rosa@siep.test', status: 'PENDING', createdAt: '2026-09-01T10:00:00Z', reviewedAt: null,
} as AccessRequest;

interface Api {
  users: () => Observable<AdminUser[]>;
  requests: () => Observable<AccessRequest[]>;
}

describe('pantalla Usuarios (F7-6)', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let requestsApi: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { sheet: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> };

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = () => [...host().querySelectorAll('ui-table tbody tr')];
  const component = () => fixture.componentInstance;
  const labelled = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label) as HTMLButtonElement | undefined;

  async function render(api: Partial<Api> = {}, { stable = true, vista = 'cuentas' } = {}) {
    service = {
      list: vi.fn(api.users ?? (() => of([ana, beto]))), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn(),
      approve: vi.fn(),
    };
    requestsApi = { listPending: vi.fn(api.requests ?? (() => of([]))), updateStatus: vi.fn() };
    dialog = { sheet: vi.fn(() => ({ close: vi.fn() })), confirm: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ id: 99 }) } },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } }, { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ vista })) } },
        provideZonelessChangeDetection(),
        { provide: UserAdminService, useValue: service },
        { provide: AccessRequestAdminService, useValue: requestsApi },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
        { provide: UiDialog, useValue: dialog },
      ],
    });
    fixture = TestBed.createComponent(UsersComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  it('abre la vista indicada en la URL y actualiza la navegacion', async () => {
    await render({}, { vista: 'solicitudes' });
    expect(component().vista()).toBe('solicitudes');
    component().cambiarVista('por-aprobar');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { vista: 'por-aprobar' }, queryParamsHandling: 'merge' }));
  });

  it('filtra por búsqueda y rol y conserva el recuento', async () => {
    await render();
    component().busqueda.set('beto');
    component().rol.set('PROFESOR');
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0])).toContain('Beto');
    expect(text(host().querySelector('ui-filtros'))).toContain('Mostrando 1 de 2');
  });

  it('anticipa las exclusiones y muestra un 409 parcial en línea', async () => {
    const propio = { ...ana, id: 99, role: 'PROFESOR' } as AdminUser;
    const admin = { ...beto, id: 7, role: 'ADMIN', activo: true } as AdminUser;
    const otra = { ...ana, id: 8 } as AdminUser;
    await render({ users: () => of([propio, admin, otra, beto]) });
    service['updateStatus'].mockImplementation((id: number) => id === 8
      ? throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Es el último administrador.' } }))
      : of({ ...admin, activo: false }));
    component().seleccion.set([99, 7, 8, 6]);
    await component().cambiarLote(false);
    fixture.detectChanges();
    const mensaje = dialog.confirm.mock.calls[0][0].message as string;
    expect(mensaje).toContain('cuenta propia');
    expect(mensaje).toContain('ya en ese estado');
    expect(mensaje).toContain('último administrador activo');
    expect(text(host().querySelector('.us-result'))).toContain('Es el último administrador.');
    expect(service['updateStatus']).not.toHaveBeenCalledWith(99, false);
  });

  it('conserva un administrador activo cuando se seleccionan todos', async () => {
    const admin = { ...ana, role: 'ADMIN' } as AdminUser;
    await render({ users: () => of([admin, beto]) });
    component().seleccion.set([admin.id]);
    await component().cambiarLote(false);
    expect(dialog.confirm.mock.calls[0][0].message).toContain('Ana Pérez');
    expect(service['updateStatus']).not.toHaveBeenCalled();
  });

  it('marca revisada la solicitud solo después de crear la cuenta', async () => {
    await render({ requests: () => of([solicitud]) });
    service['create'].mockReturnValue(of(ana));
    requestsApi['updateStatus'].mockReturnValue(of({ ...solicitud, status: 'REVIEWED' }));
    component().attendRequest(solicitud);
    component().form.patchValue({ password: '1234567890' });
    component().save();
    expect(requestsApi['updateStatus']).toHaveBeenCalledWith(21, 'REVIEWED');
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('un solo h1 «Usuarios», la región de estado siempre presente y «Nuevo usuario» en la cabecera', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Usuarios');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect(labelled('Nuevo usuario')).toBeDefined();
    });

    it('con usuarios: una fila por usuario con su rol y su estado en una insignia con texto', async () => {
      await render();
      expect(rows()).toHaveLength(2);
      expect(text(rows()[0])).toContain('Ana Pérez');
      expect(text(rows()[0])).toContain('ana@siep.test');
      expect(text(rows()[0])).toContain('Estudiante');
      expect(text(rows()[0].querySelector('ui-badge'))).toBe('Activo');
      expect(text(rows()[1].querySelector('ui-badge'))).toBe('Inactivo');
    });

    it('mientras carga: esqueleto en la tabla, el estado leído y ninguna fila', async () => {
      vi.useFakeTimers();
      const pending = new Subject<AdminUser[]>();
      await render({ users: () => pending }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('.ui-table__loading ui-skeleton').length).toBeGreaterThan(0);
      expect(rows()).toHaveLength(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando usuarios…');
    });

    it('si la lista falla: UN error con «Reintentar» y NO el vacío («Aún no hay usuarios»)', async () => {
      let calls = 0;
      await render({ users: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([ana])) });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(text(errors[0])).toContain('No fue posible cargar los usuarios.');
      expect(host().querySelector('ui-table ui-empty-state')).toBeNull();
      expect(text(host())).not.toContain('Aún no hay usuarios');

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(rows()).toHaveLength(1);
    });

    it('con la lista fallida, abrir «Nuevo usuario» no la convierte en un vacío: sigue el error y su «Reintentar»', async () => {
      await render({ users: () => throwError(() => new Error('HTTP 500')) });
      expect(host().querySelectorAll('ui-error-state')).toHaveLength(1);

      labelled('Nuevo usuario')!.click();
      fixture.detectChanges();

      expect(host().querySelectorAll('ui-error-state')).toHaveLength(1);
      expect(text(host())).not.toContain('Aún no hay usuarios');
    });

    it('sin usuarios: «Aún no hay usuarios» con la acción «Nuevo usuario», que abre la hoja', async () => {
      await render({ users: () => of([]) });
      const empty = host().querySelector('ui-table ui-empty-state')!;
      expect(text(empty)).toContain('Aún no hay usuarios');
      const action = [...empty.querySelectorAll('button')].find(button => text(button.querySelector('.ui-button__label')) === 'Nuevo usuario')!;
      action.click();

      expect(dialog.sheet).toHaveBeenCalledTimes(1);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('acciones', () => {
    it('«Nuevo usuario» abre el formulario en una hoja lateral con el formulario en blanco', async () => {
      await render();
      labelled('Nuevo usuario')!.click();

      expect(dialog.sheet).toHaveBeenCalledTimes(1);
      const [sheetComponent, options] = dialog.sheet.mock.calls[0];
      expect(sheetComponent).toBe(UserFormSheetComponent);
      expect(options.side).toBe('end');
      expect(options.data.host).toBe(component());
      expect(component().selectedUser()).toBeNull();
    });

    it('cada fila: un botón de editar con el nombre de la persona y un menú «Más acciones» con activar o desactivar', async () => {
      await render();
      const row = rows()[0];
      const edit = row.querySelector('button[aria-label="Editar a Ana Pérez"]') as HTMLButtonElement;
      expect(edit).not.toBeNull();
      expect(row.querySelectorAll('ui-menu')).toHaveLength(1);
      expect(row.querySelector('ui-menu button')?.getAttribute('aria-label')).toBe('Más acciones de Ana Pérez');

      edit.click();
      expect(component().selectedUser()).toEqual(ana);
      expect(dialog.sheet).toHaveBeenCalledTimes(1);
    });

    it('el menú de una fila activa pide confirmar con el diálogo de la biblioteca y aplica el cambio', async () => {
      await render();
      service['updateStatus'].mockReturnValue(of({ ...ana, activo: false }));
      const menus = fixture.debugElement.queryAll(By.directive(UiMenu));
      menus[0].triggerEventHandler('itemSelected', 'estado');
      await fixture.whenStable();

      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Desactivar usuario', confirmLabel: 'Desactivar', tone: 'danger',
        message: expect.stringContaining('Ana Pérez'),
      }));
      expect(service['updateStatus']).toHaveBeenCalledWith(5, false);
    });

    it('si se cancela la confirmación no se cambia nada', async () => {
      await render();
      dialog.confirm.mockResolvedValue(false);
      const menus = fixture.debugElement.queryAll(By.directive(UiMenu));
      menus[1].triggerEventHandler('itemSelected', 'estado');
      await fixture.whenStable();

      expect(service['updateStatus']).not.toHaveBeenCalled();
    });
  });

  // E2-9 (decisión 4 del usuario): la importación crea cuentas PENDIENTES; el administrador las aprueba y cada persona
  // recibe por correo una contraseña temporal. Antes la pantalla no distinguía una pendiente de una inactiva.
  // req: RN-10, RNF-01
  describe('cuentas pendientes de aprobación (E2-9)', () => {
    const pending = (id: number, nombre: string) =>
      ({ id, email: `${nombre.toLowerCase()}@siep.test`, nombre, apellido: 'Nueva', role: 'ESTUDIANTE', activo: false, pendingApproval: true } as AdminUser);
    const result = (over: Record<string, unknown> = {}) =>
      ({ approved: 2, approvedIds: [7, 8], skipped: [], emailed: 2, failed: [], ...over });

    it('una cuenta pendiente se lee «Pendiente de aprobación» (no «Inactivo») y su menú ofrece «Aprobar cuenta»', async () => {
      await render({ users: () => of([ana, pending(7, 'Carla')]) });
      expect(text(rows()[1].querySelector('ui-badge'))).toBe('Pendiente de aprobación');
      expect(component().rowActions(pending(7, 'Carla')).map(item => item.label)).toEqual(['Aprobar cuenta']);
      expect(component().rowActions(ana).map(item => item.label)).toEqual(['Desactivar usuario']);
    });

    it('«Aprobar pendientes (N)» aparece solo si hay pendientes, confirma y aprueba todas de una vez', async () => {
      await render();
      expect(labelled('Aprobar pendientes (0)')).toBeUndefined();
      expect(host().querySelector('.us-pending')).toBeNull();

      TestBed.resetTestingModule();
      await render({ users: () => of([ana, pending(7, 'Carla'), pending(8, 'Dario')]) });
      service['approve'].mockReturnValue(of(result()));
      component().cambiarVista('por-aprobar');
      component().seleccionarVisibles(true, true);
      fixture.detectChanges();
      labelled('Aprobar 2 cuentas')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Aprobar cuentas pendientes', confirmLabel: 'Aprobar 2 cuentas' }));
      expect(service['approve']).toHaveBeenCalledWith([7, 8]);
      expect(service['list']).toHaveBeenCalledTimes(2);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Se aprobaron 2 cuentas');
    });

    it('con más de 100 pendientes aprueba en lotes de 100 (el servidor no acepta más por orden)', async () => {
      const many = Array.from({ length: 150 }, (_unused, index) => pending(100 + index, `P${index}`));
      await render({ users: () => of(many) });
      service['approve'].mockImplementation((ids: number[]) => of(result({ approved: ids.length, approvedIds: ids, emailed: ids.length })));
      component().cambiarVista('por-aprobar');
      component().seleccionarVisibles(true, true);
      fixture.detectChanges();
      labelled('Aprobar 150 cuentas')!.click();
      await fixture.whenStable();

      expect(service['approve'].mock.calls.map(([ids]) => (ids as number[]).length)).toEqual([100, 50]);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Se aprobaron 150 cuentas');
    });

    it('si un correo no sale, lo dice: esa cuenta sigue pendiente', async () => {
      await render({ users: () => of([pending(7, 'Carla'), pending(8, 'Dario')]) });
      service['approve'].mockReturnValue(of(result({ approved: 1, approvedIds: [7], emailed: 1, failed: [8] })));
      component().cambiarVista('por-aprobar');
      component().seleccionarVisibles(true, true);
      fixture.detectChanges();
      labelled('Aprobar 2 cuentas')!.click();
      await fixture.whenStable();

      const status = text(host().querySelector('[role="status"].ds-sr-only'));
      expect(status).toContain('Se aprobó 1 cuenta');
      expect(status).toContain('No se pudo enviar el correo a 1 cuenta: sigue pendiente.');
    });

    it('«Aprobar cuenta» de una fila confirma y aprueba solo esa', async () => {
      await render({ users: () => of([ana, pending(7, 'Carla')]) });
      service['approve'].mockReturnValue(of(result({ approved: 1, approvedIds: [7], emailed: 1 })));
      const menus = fixture.debugElement.queryAll(By.directive(UiMenu));
      menus[1].triggerEventHandler('itemSelected', 'aprobar');
      await fixture.whenStable();

      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Carla Nueva') }));
      expect(service['approve']).toHaveBeenCalledWith([7]);
      expect(service['updateStatus']).not.toHaveBeenCalled();
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('la hoja y un guardado que tarda', () => {
    const fill = () => component().form.patchValue({ nombre: 'Luis', apellido: 'Gómez', email: 'luis@siep.test', password: '1234567890' });

    it('si guardar falla con la hoja ya cerrada, la hoja vuelve a abrirse con lo que se escribió', async () => {
      await render();
      const pending = new Subject<AdminUser>();
      service['create'].mockReturnValue(pending);
      component().newUser();
      fill();
      component().save();
      component().closeForm();
      expect(dialog.sheet).toHaveBeenCalledTimes(1);

      pending.error(new Error('HTTP 500'));

      expect(dialog.sheet).toHaveBeenCalledTimes(2);
      expect(component().form.getRawValue().nombre).toBe('Luis');
    });

    it('un guardado que llega tarde no pisa el formulario nuevo ni cierra la hoja nueva', async () => {
      await render();
      const pending = new Subject<AdminUser>();
      service['create'].mockReturnValue(pending);
      component().newUser();
      fill();
      component().save();
      component().closeForm();
      component().newUser();
      const second = dialog.sheet.mock.results[1].value as { close: ReturnType<typeof vi.fn> };

      pending.next({ ...ana, id: 9, nombre: 'Luis', email: 'luis@siep.test' });
      pending.complete();

      expect(second.close).not.toHaveBeenCalled();
      expect(component().selectedUser()).toBeNull();
      expect(component().form.getRawValue().nombre).toBe('');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('solicitudes de acceso', () => {
    it('con solicitudes pendientes: cada una con «Crear usuario» y «Descartar»', async () => {
      await render({ requests: () => of([solicitud]) });
      component().cambiarVista('solicitudes');
      fixture.detectChanges();
      const section = host().querySelector('.us-requests')!;
      expect(text(section)).toContain('Rosa Vega');
      expect(text(section)).toContain('rosa@siep.test');
      const create = [...section.querySelectorAll('button')].find(button => text(button.querySelector('.ui-button__label')) === 'Crear usuario')!;
      create.click();
      expect(dialog.sheet).toHaveBeenCalledTimes(1);
      expect(component().form.getRawValue().email).toBe('rosa@siep.test');
    });

    it('sin solicitudes y sin error no hay sección', async () => {
      await render();
      expect(host().querySelector('.us-requests')).toBeNull();
    });

    it('si las solicitudes no cargan, se ve (no se confunde con «no hay»), con «Reintentar»', async () => {
      let calls = 0;
      await render({ requests: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([solicitud])) });
      component().cambiarVista('solicitudes');
      fixture.detectChanges();
      const section = host().querySelector('.us-requests')!;
      expect(text(section.querySelector('ui-error-state'))).toContain('No pudimos cargar las solicitudes de acceso.');

      (section.querySelector('ui-error-state button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(text(host().querySelector('.us-requests'))).toContain('Rosa Vega');
      expect(host().querySelector('.us-requests ui-error-state')).toBeNull();
    });
  });

  it('muestra en línea el 400 LAST_ADMIN real del servidor en el resumen parcial', async () => {
    // El servidor decide en el momento (otro administrador pudo cambiar antes): el cliente no lo anticipó.
    const admin = { ...ana, id: 7 } as AdminUser;
    const otro = { ...ana, id: 8 } as AdminUser;
    await render({ users: () => of([admin, otro]) });
    service['updateStatus'].mockImplementation((id: number) => id === 8
      ? throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'LAST_ADMIN', message: 'No puedes desactivar ni quitar el rol al último administrador activo.' } }))
      : of({ ...admin, activo: false }));
    component().seleccion.set([7, 8]);
    await component().cambiarLote(false);
    fixture.detectChanges();
    expect(text(host().querySelector('.us-result'))).toContain('1 desactivadas. 1 no se pudieron actualizar.');
    expect(text(host().querySelector('.us-result'))).toContain('No puedes desactivar ni quitar el rol al último administrador activo.');
  });

  it('en Por aprobar muestra el error de carga con reintento, no «Hay 0 cuentas»', async () => {
    await render({ users: () => throwError(() => new HttpErrorResponse({ status: 500 })) }, { vista: 'por-aprobar' });
    expect(host().querySelector('.us-pending ui-error-state')).not.toBeNull();
    expect(text(host().querySelector('.us-pending'))).not.toContain('Hay 0 cuentas');
  });

  it('el resumen solo muestra el resultado de la acción en curso al encadenar aprobar y un lote', async () => {
    const pendiente = { ...ana, id: 30, pendingApproval: true } as AdminUser;
    const activo = { ...beto, id: 31, activo: true } as AdminUser;
    await render({ users: () => of([pendiente, activo]) });
    service['approve'].mockReturnValue(of({ approved: 1, approvedIds: [30], skipped: [], emailed: 1, failed: [] }));
    service['updateStatus'].mockReturnValue(of({ ...activo, activo: false }));
    await component().approveUser(pendiente);
    fixture.detectChanges();
    expect(component().actionStatus()).not.toBe('');
    component().seleccion.set([31]);
    await component().cambiarLote(false);
    fixture.detectChanges();
    expect(component().actionStatus()).toBe('');
    expect(component().resumen()).toContain('1 desactivadas');
    await component().approveUser(pendiente);
    expect(component().resultadoLote()).toBe('');
  });

  // req: RNF-04, BLOQUE-H
  describe('estructura', () => {
    it('ninguna región repite el nombre de otra y no quedan restos de Material', async () => {
      await render({ requests: () => of([solicitud]) });
      const names = [...host().querySelectorAll('section[aria-labelledby], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(names.length).toBeGreaterThan(1);
      expect(new Set(names).size).toBe(names.length);
      expect(host().querySelector('mat-card, mat-form-field, mat-select, mat-chip, table[mat-table], .psy-button, app-confirm-dialog')).toBeNull();
    });
  });
});
