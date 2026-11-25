import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { AssignmentDialogComponent, AssignmentDialogData } from './assignment-dialog.component';
import { fromWindowIso } from './assignment-window.util';

const cases = [
  { caseVersionId: 12, code: 'CASO-12', title: 'Caso doce', semanticVersion: '1.0.0' },
  { caseVersionId: 13, code: 'CASO-13', title: 'Caso trece', semanticVersion: '2.0.0' },
] as SimulationCaseSummary[];

const existing: Assignment = {
  id: 5, caseVersionId: 12, target: { type: 'GROUP', groupId: 3 }, state: 'SCHEDULED', active: true, sortOrder: 0,
  opensAt: new Date(2026, 9, 20, 8, 0).toISOString(), closesAt: new Date(2026, 10, 5, 23, 59).toISOString(),
};

/**
 * Diálogo para asignar un caso a un grupo o cambiar su ventana (plan visual F10-5†; C7, RF-14, RF-15, CU-06): el caso, desde
 * cuándo y hasta cuándo. Las fechas son opcionales (sin ellas, abierto desde ya y sin cierre), llevan su ayuda y su error en
 * el campo, y el cierre debe ser posterior a la apertura. Cerrar sin guardar no devuelve nada.
 */
// req: RF-14, RF-15, CU-06, RNF-04
describe('AssignmentDialogComponent', () => {
  let fixture: ComponentFixture<AssignmentDialogComponent>;
  let close: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const setup = (data: AssignmentDialogData) => {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [AssignmentDialogComponent],
      providers: [provideRouter([]), { provide: DialogRef, useValue: { close } }, { provide: DIALOG_DATA, useValue: data }],
    });
    fixture = TestBed.createComponent(AssignmentDialogComponent);
    fixture.detectChanges();
  };
  const control = (label: string) => {
    const found = Array.from(el().querySelectorAll<HTMLLabelElement>('label')).find(item => (item.textContent ?? '').includes(label));
    if (!found) throw new Error(`No hay un campo «${label}»`);
    return el().querySelector<HTMLInputElement | HTMLSelectElement>(`#${found.htmlFor}`)!;
  };
  const write = (label: string, value: string) => {
    const target = control(label);
    target.value = value;
    target.dispatchEvent(new Event(target instanceof HTMLSelectElement ? 'change' : 'input'));
  };
  const submit = () => {
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const errors = () => Array.from(el().querySelectorAll('.ui-field__message--error')).map(item => (item.textContent ?? '').trim()).filter(Boolean);
  const button = (name: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(item => (item.textContent ?? '').includes(name));

  describe('asignar', () => {
    beforeEach(() => setup({ mode: 'create', cases }));

    it('pide el caso entre los que se pueden asignar y las dos fechas, con su ayuda', () => {
      expect(el().textContent).toContain('Asignar un caso al grupo');
      expect(Array.from(control('Caso').querySelectorAll('option')).map(option => (option.textContent ?? '').trim())).toEqual([
        'Elige un caso', 'Caso doce · v1.0.0', 'Caso trece · v2.0.0',
      ]);
      expect(control('Abre').type).toBe('datetime-local');
      expect(control('Cierra').type).toBe('datetime-local');
      expect(el().textContent).toContain('Déjalo vacío para que se abra desde ya.');
      expect(el().textContent).toContain('Después del cierre nadie puede empezar el caso; quien ya lo empezó puede terminarlo.');
      expect(el().textContent).toContain('La hora es la de tu navegador.');
    });

    it('sin elegir un caso dice que falta, en el campo, y no cierra', () => {
      submit();
      expect(errors()).toEqual(['Elige un caso.']);
      expect(close).not.toHaveBeenCalled();
    });

    it('con el caso y sin fechas devuelve el caso con ambas fechas en null (abierto desde ya y sin cierre)', () => {
      write('Caso', '13');
      submit();
      expect(close).toHaveBeenCalledWith({ caseVersionId: 13, opensAt: null, closesAt: null });
    });

    it('con fechas las devuelve como instantes ISO 8601', () => {
      write('Caso', '12');
      write('Abre', '2026-10-20T08:00');
      write('Cierra', '2026-11-05T23:59');
      submit();
      expect(close).toHaveBeenCalledWith({
        caseVersionId: 12,
        opensAt: new Date('2026-10-20T08:00').toISOString(),
        closesAt: new Date('2026-11-05T23:59').toISOString(),
      });
    });

    it('un cierre que no es posterior a la apertura lo dice en el campo del cierre y no cierra', () => {
      write('Caso', '12');
      write('Abre', '2026-10-20T08:00');
      write('Cierra', '2026-10-20T08:00');
      submit();
      expect(errors()).toEqual(['El cierre debe ser posterior a la apertura.']);
      expect(control('Cierra').getAttribute('aria-invalid')).toBe('true');
      expect(close).not.toHaveBeenCalled();
    });

    it('«Cancelar» cierra sin devolver nada', () => {
      button('Cancelar')!.click();
      expect(close).toHaveBeenCalledWith();
    });

    // El control de fecha a medio escribir entrega valor vacío (con `validity.badInput`): no es «sin fecha».
    const halfTyped = (label: string) => {
      const input = control(label) as HTMLInputElement;
      Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true } });
      input.value = '';
      input.dispatchEvent(new Event('input'));
    };

    it('una fecha a medio escribir no se guarda como «sin fecha»: lo dice en su campo y no cierra', () => {
      write('Caso', '12');
      halfTyped('Cierra');
      submit();

      expect(errors()).toEqual(['Escribe la fecha y la hora completas, o borra lo escrito para dejarla vacía.']);
      expect(control('Cierra').getAttribute('aria-invalid')).toBe('true');
      expect(close).not.toHaveBeenCalled();
    });

    it('lo mismo con la apertura, y los dos campos a medias dan un error cada uno', () => {
      write('Caso', '12');
      halfTyped('Abre');
      halfTyped('Cierra');
      submit();

      expect(errors()).toHaveLength(2);
      expect(close).not.toHaveBeenCalled();
    });

    it('al corregir el campo (completarlo o vaciarlo) el error se va al instante, sin esperar al siguiente envío', () => {
      write('Caso', '12');
      halfTyped('Cierra');
      submit();
      expect(errors()).toHaveLength(1);

      Object.defineProperty(control('Cierra'), 'validity', { configurable: true, value: { badInput: false } });
      write('Cierra', '2030-03-04T08:00');
      fixture.detectChanges();

      expect(errors()).toEqual([]);
      submit();
      expect(close).toHaveBeenCalledWith(expect.objectContaining({ caseVersionId: 12, closesAt: new Date('2030-03-04T08:00').toISOString() }));
    });

    it('el error de «el cierre debe ser posterior» se va al cambiar cualquiera de las dos fechas', () => {
      write('Caso', '12');
      write('Abre', '2026-10-20T08:00');
      write('Cierra', '2026-10-19T08:00');
      submit();
      expect(errors()).toEqual(['El cierre debe ser posterior a la apertura.']);

      write('Cierra', '2026-10-21T08:00');
      fixture.detectChanges();

      expect(errors()).toEqual([]);
    });
  });

  describe('cambiar las fechas', () => {
    beforeEach(() => setup({ mode: 'edit', cases: [], assignment: existing, title: 'Caso doce' }));

    it('nombra el caso, no pide otro y trae las fechas de la asignación en la hora del navegador', () => {
      expect(el().textContent).toContain('Fechas de «Caso doce»');
      expect(Array.from(el().querySelectorAll('label')).some(item => (item.textContent ?? '').includes('Caso'))).toBe(false);
      expect(control('Abre').value).toBe(fromWindowIso(existing.opensAt));
      expect(control('Cierra').value).toBe(fromWindowIso(existing.closesAt));
    });

    it('guarda solo las fechas y, si se vacía una, la devuelve como null para borrarla', () => {
      write('Cierra', '');
      submit();
      expect(close).toHaveBeenCalledWith({ opensAt: existing.opensAt, closesAt: null });
    });

    it('la fecha que no se tocó se devuelve tal cual llegó (con sus segundos), aunque el control solo muestre minutos', () => {
      TestBed.resetTestingModule();
      const withSeconds: Assignment = { ...existing, closesAt: new Date(2026, 10, 5, 23, 59, 59).toISOString() };
      setup({ mode: 'edit', cases: [], assignment: withSeconds, title: 'Caso doce' });

      write('Abre', '2026-10-21T09:30');
      submit();

      expect(close).toHaveBeenCalledWith({ opensAt: new Date('2026-10-21T09:30').toISOString(), closesAt: withSeconds.closesAt });
    });
  });

  // P6: el botón apagado dice por qué.
  it('al asignar desde el caso sin tener grupos, «Asignar» dice por qué no se puede y no envía', () => {
    setup({ mode: 'create', cases: [], fixedCaseId: 7, groups: [], title: 'Caso doce' });
    const boton = el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(boton.getAttribute('aria-describedby')!)?.textContent).toBe('Crea un grupo primero: sin grupos no hay a quién asignar el caso.');
    expect(el().textContent).toContain('No tienes grupos todavía');
  });

  // F2 · la docente se enteraba por el estudiante de que el caso nuevo le salía «Bloqueado» (RN-04).
  describe('cuándo lo podrán empezar los estudiantes', () => {
    const previa = (id: number, titulo: string, partial: Partial<Assignment> = {}): Assignment => ({
      id, caseVersionId: id + 100, caseTitle: titulo, target: { type: 'GROUP', groupId: 3 }, state: 'OPEN', active: true, sortOrder: id, ...partial,
    });
    const secuencia = () => (el().querySelector('.ad-secuencia')?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('desde la ficha del grupo: nombra el caso que deben terminar antes y lo devuelve a quien asigna', () => {
      setup({ mode: 'create', cases, groupAssignments: [previa(1, 'Violencia Familiar'), previa(2, 'Caso en Universidad')] });
      expect(secuencia()).toContain('Tus estudiantes lo harán después de terminar «Caso en Universidad».');
      write('Caso', '13');
      submit();
      expect(close).toHaveBeenCalledWith({ caseVersionId: 13, opensAt: null, closesAt: null, despuesDe: 'Caso en Universidad' });
    });

    it('sin casos que hagan esperar (grupo vacío, en pausa o ya cerrados) pueden empezarlo de inmediato', () => {
      setup({ mode: 'create', cases, groupAssignments: [previa(1, 'Uno', { active: false }), previa(2, 'Dos', { state: 'CLOSED' })] });
      expect(secuencia()).toContain('Tus estudiantes pueden empezarlo de inmediato.');
      write('Caso', '12');
      submit();
      expect(close).toHaveBeenCalledWith({ caseVersionId: 12, opensAt: null, closesAt: null, despuesDe: null });
    });

    it('con una apertura programada dice que podrán empezarlo cuando se abra', () => {
      setup({ mode: 'create', cases, groupAssignments: [] });
      write('Abre', '2099-01-01T08:00');
      fixture.detectChanges();
      expect(secuencia()).toContain('podrán empezarlo cuando se abra');
    });

    describe('asignando desde el caso', () => {
      const grupos = [{ id: 3, nombre: 'Grupo A', codigo: 'A', totalEstudiantes: 20 }, { id: 4, nombre: 'Grupo B', codigo: 'B', totalEstudiantes: 8 }];

      it('hasta elegir el grupo no dice nada; al elegirlo lo pide, lo muestra y lo devuelve', () => {
        const load = vi.fn((id: number) => of(id === 3 ? [previa(1, 'Violencia Familiar')] : []));
        setup({ mode: 'create', cases: [], fixedCaseId: 7, groups: grupos, title: 'Nuevo', loadGroupAssignments: load });
        expect(secuencia()).toBe('');
        write('Grupo', '3');
        fixture.detectChanges();
        expect(load).toHaveBeenCalledWith(3);
        expect(secuencia()).toContain('después de terminar «Violencia Familiar»');
        write('Grupo', '4');
        fixture.detectChanges();
        expect(secuencia()).toContain('pueden empezarlo de inmediato');
        submit();
        expect(close).toHaveBeenCalledWith({ caseVersionId: 7, groupId: 4, opensAt: null, closesAt: null, despuesDe: null });
      });

      it('mientras llega lo dice, y si no llega lo dice sin impedir asignar ni inventar la secuencia', () => {
        const respuesta = new Subject<Assignment[]>();
        setup({ mode: 'create', cases: [], fixedCaseId: 7, groups: grupos, title: 'Nuevo', loadGroupAssignments: () => respuesta });
        write('Grupo', '3');
        fixture.detectChanges();
        expect(secuencia()).toContain('Revisando el orden de los casos del grupo');
        respuesta.error(new Error('red'));
        fixture.detectChanges();
        expect(secuencia()).toContain('No pudimos revisar el orden del grupo');
        submit();
        expect(close).toHaveBeenCalledWith({ caseVersionId: 7, groupId: 3, opensAt: null, closesAt: null });
      });

      it('elegir «Elige un grupo» otra vez quita lo dicho', () => {
        setup({ mode: 'create', cases: [], fixedCaseId: 7, groups: grupos, title: 'Nuevo', loadGroupAssignments: () => of([]) });
        write('Grupo', '3');
        fixture.detectChanges();
        expect(secuencia()).not.toBe('');
        write('Grupo', '');
        fixture.detectChanges();
        expect(secuencia()).toBe('');
      });

      it('si falla la petición el error es de red, no un error del diálogo', () => {
        setup({ mode: 'create', cases: [], fixedCaseId: 7, groups: grupos, title: 'Nuevo', loadGroupAssignments: () => throwError(() => new Error('x')) });
        write('Grupo', '3');
        fixture.detectChanges();
        expect(errors()).toEqual([]);
      });
    });
  });
});
