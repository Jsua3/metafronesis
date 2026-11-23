import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { AuthService } from '../../core/auth/auth.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { RubricaEditorComponent } from './rubrica-editor.component';
import type { Mock } from 'vitest';

/**
 * Cada fila de criterio debe seguir a su propio grupo del `FormArray`.
 *
 * Con `track $index`, al reemplazar los grupos (abrir otra rúbrica, «Nueva rúbrica») o quitar uno de en medio,
 * Angular reutilizaba las filas del DOM pero las directivas seguían enlazadas a los controles anteriores, ya
 * desconectados del formulario: la pantalla mostraba campos vacíos o datos de otro criterio, y lo que se escribía no
 * llegaba al formulario. R1: los criterios son un acordeón (uno abierto a la vez), así que cada prueba abre la fila que
 * mira; lo que se comprueba es lo mismo.
 */
function rubric(id: number, name: string, criteria: Array<[string, number]>): RubricAdmin {
  return {
    id,
    name,
    description: null,
    active: false,
    version: '1.0',
    isDefault: false,
    totalWeight: criteria.reduce((sum, [, weight]) => sum + weight, 0),
    criteriaCount: criteria.length,
    criteria: criteria.map(([title, weight], index) => ({ id: id * 10 + index, title, weight, displayOrder: index + 1, active: true })),
  } as RubricAdmin;
}

const primera = rubric(4, 'Primera', [['Escucha', 60], ['Empatía', 40]]);
const segunda = rubric(5, 'Segunda', [['Encuadre', 10], ['Cierre', 90]]);

describe('rúbricas: criterios enlazados a su control (DOM del editor)', () => {
  let fixture: ComponentFixture<RubricaEditorComponent>;
  let component: RubricaEditorComponent;
  let root: HTMLElement;
  let service: { detail: Mock; competencies: Mock };

  /** Nombre y peso de la fila abierta. */
  const shown = () => Array.from(root.querySelectorAll<HTMLInputElement>('li.criterion input')).map(input => input.value);
  /** Lo que se ve en el resumen de cada fila (cerrada o abierta). */
  const summaries = () => Array.from(root.querySelectorAll('.criterion__titulo')).map(node => (node.textContent ?? '').trim());
  /** Lo que el formulario guarda de cada criterio. */
  const held = () => component.criteria.controls.map(group => [group.get('title')!.value, group.get('weight')!.value]);
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const openRow = (index: number) => {
    component.criterioAbierto.set(index);
    fixture.detectChanges();
  };
  const open = (item: RubricAdmin) => {
    service.detail.mockReturnValue(of(item));
    component.openRubric(item.id);
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = { detail: vi.fn(() => of(primera)), competencies: vi.fn(() => of([])) };
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

  it('abrir una rúbrica muestra sus criterios', () => {
    open(primera);

    expect(summaries()).toEqual(['Escucha', 'Empatía']);
    openRow(1);
    expect(shown()).toEqual(['Empatía', '40']);
  });

  it('abrir otra rúbrica reemplaza los criterios que se ven, no los deja en blanco', () => {
    open(primera);
    openRow(0);

    open(segunda);
    openRow(0);

    expect(summaries()).toEqual(['Encuadre', 'Cierre']);
    expect(shown()).toEqual(['Encuadre', '10']);
    expect(held()).toEqual([['Encuadre', 10], ['Cierre', 90]]);
  });

  it('lo que se escribe tras abrir otra rúbrica llega al formulario', () => {
    open(primera);
    open(segunda);
    openRow(0);

    type(root.querySelectorAll<HTMLInputElement>('li.criterion input')[1], '25');

    expect(held()[0]).toEqual(['Encuadre', 25]);
    expect(component.totalWeight()).toBe(115);
  });

  it('«Nueva rúbrica» tras abrir una con criterios deja un criterio en blanco, abierto y con peso 0', () => {
    open(primera);

    component.newRubric();
    fixture.detectChanges();

    expect(shown()).toEqual(['', '0']);
  });

  it('lo que se escribe en el criterio de una rúbrica nueva llega al formulario', () => {
    open(primera);
    component.newRubric();
    fixture.detectChanges();

    const [title, weight] = Array.from(root.querySelectorAll<HTMLInputElement>('li.criterion input'));
    type(title, 'Alianza');
    type(weight, '55');

    expect(held()).toEqual([['Alianza', 55]]);
    expect(component.totalWeight()).toBe(55);
    expect(summaries()).toEqual(['Alianza']);
  });

  it('eliminar el primer criterio deja en pantalla el segundo y editarlo actualiza el formulario', () => {
    open(primera);
    openRow(0);

    root.querySelector<HTMLButtonElement>('li.criterion button[aria-label^="Eliminar criterio"]')!.click();
    fixture.detectChanges();

    expect(summaries()).toEqual(['Empatía']);
    expect(held()).toEqual([['Empatía', 40]]);

    openRow(0);
    type(root.querySelectorAll<HTMLInputElement>('li.criterion input')[1], '35');
    expect(held()).toEqual([['Empatía', 35]]);
  });

  it('agregar un criterio muestra una fila nueva, abierta y enlazada al formulario', () => {
    open(primera);

    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(candidate => (candidate.textContent ?? '').includes('Agregar criterio'))!.click();
    fixture.detectChanges();

    expect(summaries()).toEqual(['Escucha', 'Empatía', 'Criterio sin nombre']);
    expect(shown()).toEqual(['', '0']);
    type(root.querySelectorAll<HTMLInputElement>('li.criterion input')[1], '12');
    expect(held()[2]).toEqual(['', 12]);
  });
});
