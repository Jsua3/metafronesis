import { FormGroupDirective } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';

import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { AuthService } from '../../core/auth/auth.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { RubricaEditorComponent } from './rubrica-editor.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar, con los campos de la biblioteca y el DOM renderizado (R1: en el editor de una rúbrica).
 *
 * `form.reset()` no reinicia `FormGroupDirective.submitted`: el reinicio pasa por la directiva del formulario. Estas
 * pruebas comprueban lo que ve el usuario: tras enviar con errores, abrir otra rúbrica o crear una nueva no debe
 * dejar ningún mensaje de error visible en un formulario recién cargado. Y la regla del 100 % de la ponderación debe
 * estar explicada en el DOM y en cada botón que depende de ella (F7-5: motivo en vez de botón apagado en silencio).
 */
function rubric(id: number, name: string, weights: number[]): RubricAdmin {
  return {
    id,
    name,
    description: null,
    active: false,
    version: '1.0',
    isDefault: false,
    totalWeight: weights.reduce((sum, weight) => sum + weight, 0),
    criteriaCount: weights.length,
    criteria: weights.map((weight, index) => ({ id: id * 10 + index, title: `Criterio ${index + 1}`, weight, displayOrder: index + 1, active: true })),
  } as RubricAdmin;
}

const completa = rubric(4, 'Entrevista clínica', [60, 40]);
const incompleta = rubric(7, 'Observación', [60, 30]);
const sinNombre = { ...rubric(9, 'Con hueco', [100]), criteria: [{ id: 91, title: '', weight: 100, displayOrder: 1, active: true }] } as RubricAdmin;

describe('rúbricas: validar al enviar (DOM del editor)', () => {
  let fixture: ComponentFixture<RubricaEditorComponent>;
  let component: RubricaEditorComponent;
  let root: HTMLElement;
  let service: { list: Mock; detail: Mock; create: Mock; update: Mock; competencies: Mock };

  const errorTexts = () => Array.from(root.querySelectorAll('.ui-field__message--error')).map(node => (node.textContent ?? '').trim());
  /** Un botón por su rótulo exacto (las acciones de estado viven en el panel «Más» del pie). */
  const actionButton = (label: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(candidate => (candidate.querySelector('.ui-button__label')?.textContent ?? '').trim() === label)!;
  const hint = () => root.querySelector('#rubric-weight-hint');
  /** Lo que el botón dice de por qué no se puede pulsar (el texto al que apunta su aria-describedby). */
  const reasonOf = (button: HTMLButtonElement) => {
    const id = (button.getAttribute('aria-describedby') ?? '').split(' ').find(Boolean);
    return id ? (root.querySelector(`#${id}`)?.textContent ?? '').trim() : '';
  };
  const formSubmitted = () => fixture.debugElement.query(By.directive(FormGroupDirective)).injector.get(FormGroupDirective).submitted;
  const submit = () => {
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
  };
  const open = (item: RubricAdmin) => {
    service.detail.mockReturnValue(of(item));
    component.openRubric(item.id);
    fixture.detectChanges();
  };
  const fillValid = () => {
    component.form.patchValue({ name: 'Entrevista clínica' });
    component.criteria.at(0).patchValue({ title: 'Escucha', weight: 100 });
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = {
      list: vi.fn(() => of([])),
      detail: vi.fn(() => of(completa)),
      create: vi.fn(),
      update: vi.fn(),
      competencies: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({
      imports: [RubricaEditorComponent],
      providers: [
        { provide: RubricService, useValue: service },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes('ADMIN') } },
        { provide: CaseCatalogApi, useValue: { listDrafts: vi.fn(() => of([])) } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(RubricaEditorComponent);
    component = fixture.componentInstance;
    root = fixture.nativeElement;
    document.body.appendChild(root);
    fixture.detectChanges();
  });

  afterEach(() => {
    root.remove();
    TestBed.resetTestingModule();
  });

  describe('errores al enviar', () => {
    it('al abrir el formulario (una rúbrica nueva) no muestra ningún error', () => {
      expect(errorTexts()).toEqual([]);
    });

    it('enviar vacío muestra el error de cada campo obligatorio y no llama al servicio', () => {
      component.newRubric();
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre de la rúbrica.', 'Escribe el nombre del criterio.']);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('enviar vacío lleva el foco al primer campo inválido', () => {
      component.newRubric();
      fixture.detectChanges();

      submit();

      expect(document.activeElement).toBe(root.querySelector('[formControlName="name"]'));
    });

    it('con el nombre correcto, el foco va al criterio inválido', () => {
      component.newRubric();
      component.form.patchValue({ name: 'Entrevista clínica' });
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre del criterio.']);
      expect(document.activeElement).toBe(root.querySelector('input[formControlName="title"]'));
    });

    // R1: el campo «Orden» ya no existe (el orden es la posición del criterio).
    it('explica versión vacía y peso fuera de rango', () => {
      component.newRubric();
      fillValid();
      component.form.patchValue({ version: '' });
      component.criteria.at(0).patchValue({ weight: 101 });
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe la versión.', 'El peso va de 0 a 100.']);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('el botón Guardar no se bloquea por un formulario inválido', () => {
      component.newRubric();
      fixture.detectChanges();

      expect(component.form.invalid).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('el botón Guardar queda bloqueado (aria-disabled, ocupado y con «Guardando…») solo mientras guarda', () => {
      component.saving.set(true);
      fixture.detectChanges();

      const save = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(save.getAttribute('aria-disabled')).toBe('true');
      expect(save.getAttribute('aria-busy')).toBe('true');
      expect((save.textContent ?? '')).toContain('Guardando…');
    });
  });

  describe('reinicio del estado «enviado»', () => {
    it('«Nueva rúbrica» tras un envío inválido deja el formulario en blanco sin errores', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      expect(formSubmitted()).toBe(true);

      component.newRubric();
      fixture.detectChanges();

      expect(errorTexts()).toEqual([]);
      expect(formSubmitted()).toBe(false);
    });

    it('abrir otra rúbrica tras un envío inválido no muestra errores', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);

      open(incompleta);

      expect(errorTexts()).toEqual([]);
      expect(formSubmitted()).toBe(false);
    });

    it('abrir una rúbrica con un dato vacío no muestra su error hasta que se envía', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);

      open(sinNombre);
      expect(errorTexts()).toEqual([]);

      submit();
      expect(errorTexts()).toEqual(['Escribe el nombre del criterio.']);
    });

    it('guardar con éxito tras un envío inválido no deja errores en el formulario recargado', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      fillValid();
      service.create.mockReturnValue(of(completa));

      submit();

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(errorTexts()).toEqual([]);
      expect(formSubmitted()).toBe(false);
    });

    it('después de reiniciar el formulario, un nuevo envío vacío vuelve a mostrar los errores', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      component.newRubric();
      fixture.detectChanges();
      expect(errorTexts()).toEqual([]);

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre de la rúbrica.', 'Escribe el nombre del criterio.']);
    });
  });

  describe('regla del 100 % de la ponderación', () => {
    it('con la ponderación en 100 no hay pista y los botones no la referencian', () => {
      open(completa);

      expect(hint()).toBeNull();
      expect(actionButton('Activar').hasAttribute('aria-describedby')).toBe(false);
      expect(actionButton('Predeterminada').hasAttribute('aria-describedby')).toBe(false);
      expect(actionButton('Activar').getAttribute('aria-disabled')).toBeNull();
      expect(actionButton('Predeterminada').getAttribute('aria-disabled')).toBeNull();
    });

    it('con la ponderación distinta de 100 explica por qué Activar y Predeterminada están deshabilitados', () => {
      open(incompleta);

      expect(hint()).not.toBeNull();
      expect((hint()!.textContent ?? '').trim()).toBe('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
      expect(root.querySelectorAll('#rubric-weight-hint').length).toBe(1);
      for (const label of ['Activar', 'Predeterminada']) {
        expect(actionButton(label).getAttribute('aria-disabled'), label).toBe('true');
        expect(reasonOf(actionButton(label)), label).toBe('La ponderación debe sumar 100 %.');
      }
    });

    it('solo Activar y Predeterminada dependen de la ponderación: Desactivar y Duplicar no lo dicen', () => {
      open(incompleta);
      expect(actionButton('Duplicar').getAttribute('aria-disabled')).toBeNull();

      // «Desactivar» solo aparece con la rúbrica activa (nunca junto a «Activar»), y tampoco depende del peso.
      open({ ...incompleta, active: true });
      expect(actionButton('Desactivar').getAttribute('aria-disabled')).toBeNull();
    });

    it('la pista aparece y desaparece al cambiar la ponderación', () => {
      open(completa);
      expect(hint()).toBeNull();

      component.criteria.at(0).patchValue({ weight: 50 });
      fixture.detectChanges();
      expect(hint()).not.toBeNull();
      expect(reasonOf(actionButton('Activar'))).toBe('La ponderación debe sumar 100 %.');

      component.criteria.at(0).patchValue({ weight: 60 });
      fixture.detectChanges();
      expect(hint()).toBeNull();
      expect(actionButton('Activar').hasAttribute('aria-describedby')).toBe(false);
    });

    it('una rúbrica nueva sin ponderación también muestra la pista', () => {
      component.newRubric();
      fixture.detectChanges();

      expect(hint()).not.toBeNull();
    });
  });
});
