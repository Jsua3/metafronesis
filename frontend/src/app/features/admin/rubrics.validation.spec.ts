import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { AuthService } from '../../core/auth/auth.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { RubricaEditorComponent } from './rubrica-editor.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar en el editor de una rúbrica (R1: el formulario vive en `RubricaEditorComponent`).
 *
 * No se renderiza el template: se instancia el componente con dobles de los
 * servicios y un host DOM mínimo (sin Material) para comprobar el foco.
 */
const entrevista = {
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

describe('rúbricas: validar al enviar (comportamiento)', () => {
  let component: RubricaEditorComponent;
  let host: HTMLElement;
  let rubrics: { list: Mock; detail: Mock; create: Mock; update: Mock };
  let notify: { success: Mock; error: Mock; warning: Mock; info: Mock };

  /** Primer criterio del formulario (el que crea `newRubric()`). */
  const criterion = () => component.criteria.at(0);
  /** Deja válido el formulario de una rúbrica nueva. */
  const fillValid = () => {
    component.form.patchValue({ name: 'Entrevista clínica' });
    criterion().patchValue({ title: 'Escucha', weight: 100 });
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    rubrics = {
      list: vi.fn(() => of([])),
      detail: vi.fn(() => of(entrevista)),
      create: vi.fn(),
      update: vi.fn(),
    };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: RubricService, useValue: rubrics },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes('ADMIN') } },
        { provide: CaseCatalogApi, useValue: { listDrafts: vi.fn(() => of([])) } },
        { provide: NotificationService, useValue: notify },
        { provide: ElementRef, useValue: new ElementRef(host) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new RubricaEditorComponent());
  });

  afterEach(() => {
    host.remove();
    TestBed.resetTestingModule();
  });

  describe('guardar con el formulario inválido', () => {
    it('no llama al servicio, marca todos los campos como tocados y no avisa', () => {
      component.newRubric();

      component.save();

      expect(rubrics.create).not.toHaveBeenCalled();
      expect(rubrics.update).not.toHaveBeenCalled();
      expect(Object.values(component.form.controls).every(control => control.touched)).toBe(true);
      expect(component.message()).toBe('');
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });

    it('un criterio inválido dentro del FormArray también impide guardar y queda tocado', () => {
      component.newRubric();
      component.form.patchValue({ name: 'Entrevista clínica' });
      expect(component.form.controls.name.valid).toBe(true);
      expect(criterion().get('title')?.hasError('required')).toBe(true);

      component.save();

      expect(rubrics.create).not.toHaveBeenCalled();
      expect(component.criteria.touched).toBe(true);
      expect(criterion().get('title')?.touched).toBe(true);
      expect(criterion().get('weight')?.touched).toBe(true);
    });

    it('con una rúbrica abierta y un criterio sin nombre tampoco actualiza', () => {
      component.openRubric(4);
      criterion().patchValue({ title: '' });

      component.save();

      expect(rubrics.update).not.toHaveBeenCalled();
      expect(criterion().get('title')?.touched).toBe(true);
    });

    // R1: el campo «Orden» ya no existe (el orden es la posición), así que solo el peso tiene rango.
    it('un peso fuera de 0 a 100 impide guardar', () => {
      component.newRubric();
      fillValid();
      expect(component.form.valid).toBe(true);

      criterion().patchValue({ weight: 101 });
      component.save();
      expect(criterion().get('weight')?.hasError('max')).toBe(true);

      criterion().patchValue({ weight: -1 });
      component.save();
      expect(criterion().get('weight')?.hasError('min')).toBe(true);

      expect(rubrics.create).not.toHaveBeenCalled();
    });

    it('la versión vacía impide guardar', () => {
      component.newRubric();
      fillValid();
      component.form.patchValue({ version: '' });

      component.save();

      expect(rubrics.create).not.toHaveBeenCalled();
      expect(component.form.controls.version.hasError('required')).toBe(true);
      expect(component.form.controls.version.touched).toBe(true);
    });

    it('enfoca el primer control inválido del host', () => {
      host.innerHTML = '<input id="ok" class="ng-valid"><input id="uno" class="ng-invalid"><input id="dos" class="ng-invalid">';
      component.newRubric();

      component.save();

      expect(document.activeElement).toBe(host.querySelector('#uno'));
    });

    it('mientras guarda no marca ni enfoca nada y no vuelve a llamar al servicio', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';
      component.newRubric();
      component.saving.set(true);

      component.save();

      expect(rubrics.create).not.toHaveBeenCalled();
      expect(component.form.controls.name.touched).toBe(false);
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });
  });

  describe('guardar con el formulario válido', () => {
    it('llama al servicio y no mueve el foco', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';
      component.newRubric();
      fillValid();
      rubrics.create.mockReturnValue(of(entrevista));

      component.save();

      expect(rubrics.create).toHaveBeenCalledTimes(1);
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });
  });

  describe('reinicio del formulario', () => {
    it('«Nueva rúbrica» deja valores por defecto, un criterio en blanco y sin campos tocados', () => {
      component.openRubric(4);
      component.form.markAllAsTouched();

      component.newRubric();

      expect(component.form.getRawValue().name).toBe('');
      expect(component.form.getRawValue().version).toBe('1.0');
      expect(component.criteria.length).toBe(1);
      expect(component.form.touched).toBe(false);
      expect(criterion().touched).toBe(false);
    });

    it('abrir una rúbrica carga sus datos y sus criterios sin campos tocados', () => {
      component.newRubric();
      component.save();
      expect(component.form.touched).toBe(true);

      component.openRubric(4);

      expect(component.form.getRawValue().name).toBe('Entrevista clínica');
      expect(component.criteria.length).toBe(1);
      expect(component.form.touched).toBe(false);
      expect(component.form.valid).toBe(true);
    });
  });
});
