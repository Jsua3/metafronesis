import { HttpErrorResponse } from '@angular/common/http';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { AuthService } from '../../core/auth/auth.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { RubricaEditorComponent, RUBRIC_GONE_MESSAGE } from './rubrica-editor.component';
import type { Mock } from 'vitest';

/**
 * Feedback de acciones del editor de una rúbrica (R1: las órdenes viven en `RubricaEditorComponent`; el error de carga
 * de la lista, en la biblioteca: `rubrics.component.spec.ts`). «Refrescar la lista» es ahora emitir `guardada`, que la
 * biblioteca atiende pidiendo la lista de nuevo.
 *
 * No se renderiza el template: se instancia el componente con dobles de los
 * servicios y se ejercitan sus métodos públicos.
 */
const rubric = {
  id: 4,
  name: 'Entrevista clínica',
  description: null,
  active: false,
  version: '1.0',
  isDefault: false,
  totalWeight: 100,
  criteriaCount: 1,
  criteria: [{ id: 1, title: 'Escucha', weight: 100, displayOrder: 1, active: true }],
} as RubricAdmin;

function backendError(status: number, body: unknown) {
  return throwError(() => new HttpErrorResponse({ status, error: body }));
}

describe('rúbricas: feedback de acciones (comportamiento)', () => {
  let component: RubricaEditorComponent;
  let guardadas: RubricAdmin[];
  let rubrics: Record<
    'list' | 'detail' | 'create' | 'update' | 'activate' | 'deactivate' | 'duplicate' | 'setDefault' | 'assignToCaseVersion',
    Mock
  >;
  let simulation: { listDrafts: Mock };
  let notify: { success: Mock; error: Mock; warning: Mock; info: Mock };

  beforeEach(() => {
    rubrics = {
      list: vi.fn(() => of([])),
      detail: vi.fn(() => of(rubric)),
      create: vi.fn(),
      update: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      duplicate: vi.fn(),
      setDefault: vi.fn(),
      assignToCaseVersion: vi.fn(),
    };
    simulation = { listDrafts: vi.fn(() => of([])) };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: RubricService, useValue: rubrics },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes('ADMIN') } },
        { provide: CaseCatalogApi, useValue: simulation },
        { provide: NotificationService, useValue: notify },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new RubricaEditorComponent());
    guardadas = [];
    component.guardada.subscribe(r => guardadas.push(r));
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('guardar', () => {
    beforeEach(() => component.form.patchValue({ name: 'Entrevista clínica' }));

    it('éxito: avisa junto a la acción, libera saving y no usa el banner', () => {
      rubrics.create.mockReturnValue(of(rubric));

      component.save();

      expect(rubrics.create).toHaveBeenCalledTimes(1);
      expect(notify.success).toHaveBeenCalledTimes(1);
      expect(notify.success).toHaveBeenCalledWith('Rúbrica guardada.');
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.message()).toBe('');
      expect(component.saving()).toBe(false);
      expect(component.selected()).toBe(rubric);
      expect(guardadas).toEqual([rubric]);
    });

    it('con una rúbrica abierta actualiza en lugar de crear y avisa igual', () => {
      component.selected.set(rubric);
      rubrics.update.mockReturnValue(of(rubric));

      component.save();

      expect(rubrics.update).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Entrevista clínica' }));
      expect(rubrics.create).not.toHaveBeenCalled();
      expect(notify.success).toHaveBeenCalledWith('Rúbrica guardada.');
    });

    it('error 500 con mensaje: avisa el mensaje del backend y libera saving', () => {
      rubrics.create.mockReturnValue(backendError(500, { message: 'La ponderación debe sumar 100.' }));

      component.save();

      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith('La ponderación debe sumar 100.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.message()).toBe('');
      expect(component.saving()).toBe(false);
    });

    it('error sin mensaje útil: avisa el texto de respaldo', () => {
      rubrics.create.mockReturnValue(backendError(500, null));

      component.save();

      expect(notify.error).toHaveBeenCalledWith('No fue posible guardar la rúbrica. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    });

    it('sin conexión (status 0): no duplica el aviso del interceptor pero libera saving', () => {
      rubrics.create.mockReturnValue(backendError(0, null));

      component.save();

      expect(notify.error).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });
  });

  describe('usar en un caso', () => {
    beforeEach(() => {
      component.selected.set(rubric);
      component.caseVersionId.set(9);
    });

    it('éxito: avisa el resultado', () => {
      rubrics.assignToCaseVersion.mockReturnValue(of({ caseVersionId: 9, rubric }));

      component.assign();

      expect(rubrics.assignToCaseVersion).toHaveBeenCalledWith(9, 4);
      expect(notify.success).toHaveBeenCalledWith('Rúbrica asignada al caso.');
      expect(component.message()).toBe('');
    });

    it('error 500 con mensaje: avisa el mensaje del backend', () => {
      rubrics.assignToCaseVersion.mockReturnValue(backendError(500, { message: 'La simulación ya tiene evaluaciones.' }));

      component.assign();

      expect(notify.error).toHaveBeenCalledWith('La simulación ya tiene evaluaciones.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.message()).toBe('');
    });

    it('error sin mensaje útil: avisa el texto de respaldo', () => {
      rubrics.assignToCaseVersion.mockReturnValue(backendError(500, null));

      component.assign();

      expect(notify.error).toHaveBeenCalledWith('No fue posible asignar la rúbrica. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    });
  });

  describe('activar, desactivar, duplicar y marcar como predeterminada', () => {
    const actions: Array<[string, 'activate' | 'deactivate' | 'duplicate' | 'setDefault', string]> = [
      ['activar', 'activate', 'Rúbrica activada.'],
      ['desactivar', 'deactivate', 'Rúbrica desactivada.'],
      ['duplicar', 'duplicate', 'Rúbrica duplicada.'],
      ['predeterminar', 'setDefault', 'Rúbrica predeterminada actualizada.'],
    ];

    beforeEach(() => component.selected.set(rubric));

    it.each(actions)('%s: avisa el éxito y avisa a la biblioteca', (_label, method, text) => {
      rubrics[method].mockReturnValue(of(rubric));

      component[method]();

      expect(rubrics[method]).toHaveBeenCalledWith(4);
      expect(notify.success).toHaveBeenCalledWith(text);
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.message()).toBe('');
      expect(guardadas).toEqual([rubric]);
    });

    it.each(actions)('%s con error 500: avisa el mensaje del backend', (_label, method) => {
      rubrics[method].mockReturnValue(backendError(500, { message: 'Motivo del backend' }));

      component[method]();

      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith('Motivo del backend');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.message()).toBe('');
    });

    it('con error sin mensaje avisa el texto de respaldo', () => {
      rubrics.activate.mockReturnValue(backendError(500, null));

      component.activate();

      expect(notify.error).toHaveBeenCalledWith('No fue posible actualizar la rúbrica. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    });

    it('sin rúbrica abierta no llama al backend ni avisa', () => {
      component.selected.set(null);

      component.activate();

      expect(rubrics.activate).not.toHaveBeenCalled();
      expect(notify.success).not.toHaveBeenCalled();
      expect(notify.error).not.toHaveBeenCalled();
    });
  });

  describe('lo que sigue en el banner', () => {
    it('un error al abrir una rúbrica queda en el banner y no crea un aviso', () => {
      rubrics.detail.mockReturnValue(backendError(500, null));

      component.openRubric(4);

      expect(component.message()).toBe('No fue posible abrir la rúbrica.');
      expect(component.messageIsError()).toBe(true);
      expect(notify.error).not.toHaveBeenCalled();
    });

    it('si la rúbrica ya no existe (404) lo dice y avisa a la biblioteca para volver a la lista', () => {
      let perdida = 0;
      component.perdida.subscribe(() => (perdida += 1));
      rubrics.detail.mockReturnValue(backendError(404, null));

      component.openRubric(4);

      expect(component.message()).toBe(RUBRIC_GONE_MESSAGE);
      expect(perdida).toBe(1);
      expect(notify.error).not.toHaveBeenCalled();
    });
  });
});
