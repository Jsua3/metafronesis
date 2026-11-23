import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';

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
      providers: [{ provide: DialogRef, useValue: { close } }, { provide: DIALOG_DATA, useValue: data }],
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
});
