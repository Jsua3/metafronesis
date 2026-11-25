import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AssignmentService } from '../../core/api/assignment.service';
import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AssignmentDialogData, AssignmentDialogResult } from './assignment-dialog.component';
import { GroupAssignmentsComponent } from './group-assignments.component';

const caso12 = { caseVersionId: 12, code: 'CASO-12', title: 'Caso doce', semanticVersion: '1.0.0' } as SimulationCaseSummary;
const caso13 = { caseVersionId: 13, code: 'CASO-13', title: 'Caso trece', semanticVersion: '2.0.0' } as SimulationCaseSummary;

const row = (partial: Partial<Assignment> = {}): Assignment => ({
  id: 5, caseVersionId: 12, target: { type: 'GROUP', groupId: 3 }, state: 'OPEN', active: true, sortOrder: 0, ...partial,
});

const backendError = (status: number, message: string) => throwError(() => new HttpErrorResponse({ status, error: { message } }));

interface Api {
  list: (groupId: number) => Observable<Assignment[]>;
  create: (body: unknown) => Observable<Assignment>;
  update: (id: number, changes: unknown) => Observable<Assignment>;
  remove: (id: number) => Observable<{ id: number }>;
}

/**
 * «Casos asignados» de un grupo (plan visual F10-5†; C7, RF-14, RF-15, CU-06, RN-04): cada asignación con su caso, su estado
 * (abierto, aún no abre, ya cerró, en pausa) y su ventana con palabras; asignar y cambiar las fechas en un diálogo; pausar y
 * retirar pidiendo confirmar lo que le pasa al grupo. Cada acción avisa su resultado, y un error del servidor se dice con
 * su mensaje sin cambiar la lista.
 */
// req: RF-14, RF-15, CU-06, RN-04, RNF-04
describe('GroupAssignmentsComponent', () => {
  let fixture: ComponentFixture<GroupAssignmentsComponent>;
  let api: Api;
  let open: ReturnType<typeof vi.fn>;
  let confirm: ReturnType<typeof vi.fn>;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(node => node.remove());
    return text(copy);
  };
  const items = () => Array.from(host().querySelectorAll('.ga-item'));
  const buttonIn = (root: Element | Document, name: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => spoken(button) === name || button.getAttribute('aria-label') === name);

  async function render(options: { api?: Partial<Api>; cases?: SimulationCaseSummary[]; dialog?: AssignmentDialogResult | undefined; confirmed?: boolean } = {}) {
    api = {
      list: vi.fn(() => of([row()])),
      create: vi.fn(() => of(row({ id: 6, caseVersionId: 13 }))),
      update: vi.fn((_id: number, changes: unknown) => of(row({ ...(changes as object) }))),
      remove: vi.fn(() => of({ id: 5 })),
      ...options.api,
    };
    open = vi.fn((_component: unknown, _config: { data: AssignmentDialogData }) => ({ closed: of(options.dialog) }));
    confirm = vi.fn(async () => options.confirmed ?? true);
    notify = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AssignmentService, useValue: api },
        { provide: UiDialog, useValue: { open, confirm } },
        { provide: NotificationService, useValue: notify },
      ],
    });
    fixture = TestBed.createComponent(GroupAssignmentsComponent);
    fixture.componentRef.setInput('grupoId', 3);
    fixture.componentRef.setInput('cases', options.cases ?? [caso12, caso13]);
    await fixture.whenStable();
  }

  it('lista las asignaciones del grupo con su caso, su estado y su ventana con palabras', async () => {
    await render({ api: { list: vi.fn(() => of([
      row({ id: 5, caseVersionId: 12, state: 'OPEN' }),
      row({ id: 6, caseVersionId: 13, state: 'SCHEDULED', opensAt: '2030-03-04T08:00:00-05:00', closesAt: '2030-04-01T23:59:00-05:00' }),
    ])) } });
    expect(api.list).toHaveBeenCalledWith(3);
    expect(items()).toHaveLength(2);
    expect(text(items()[0].querySelector('strong'))).toBe('Caso doce');
    expect(text(items()[0])).toContain('CASO-12 · v1.0.0');
    expect(text(items()[0].querySelector('ui-badge'))).toBe('Abierto');
    expect(text(items()[0].querySelector('.ga-window'))).toBe('Sin fechas: abierto desde ya y sin cierre.');
    expect(text(items()[1].querySelector('ui-badge'))).toBe('Aún no abre');
    expect(text(items()[1].querySelector('.ga-window'))).toMatch(/Abre el .* · Cierra el .*\./);
  });

  it('un caso cerrado se rotula «Ya cerró» y uno en pausa «En pausa», aunque su ventana esté abierta', async () => {
    await render({ api: { list: vi.fn(() => of([row({ id: 5, state: 'CLOSED' }), row({ id: 6, caseVersionId: 13, state: 'OPEN', active: false })])) } });
    expect(items().map(item => text(item.querySelector('ui-badge')))).toEqual(['Ya cerró', 'En pausa']);
  });

  it('sin asignaciones dice lo que pasa y deja asignar', async () => {
    await render({ api: { list: vi.fn(() => of([])) } });
    expect(text(host())).toContain('No hay casos asignados. Los estudiantes no verán casos hasta que asignes uno.');
    expect(buttonIn(host(), 'Asignar un caso')).toBeDefined();
  });

  it('si no se pueden leer, un error con «Reintentar» —no «sin casos»— y el reintento las vuelve a pedir', async () => {
    let calls = 0;
    await render({ api: { list: vi.fn(() => (++calls === 1 ? throwError(() => ({ status: 500 })) : of([row()]))) } });
    expect(host().querySelector('ui-error-state')).not.toBeNull();
    expect(text(host())).not.toContain('No hay casos asignados');
    (host().querySelector('ui-error-state button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(items()).toHaveLength(1);
  });

  describe('asignar', () => {
    it('abre el diálogo con los casos publicados que el grupo aún no tiene y, al aceptar, crea la asignación y avisa', async () => {
      await render({ dialog: { caseVersionId: 13, opensAt: '2030-03-04T13:00:00.000Z', closesAt: null } });
      buttonIn(host(), 'Asignar un caso')!.click();
      await fixture.whenStable();
      const config = open.mock.calls[0][1] as { data: AssignmentDialogData };
      expect(config.data.mode).toBe('create');
      expect(config.data.cases.map(item => item.caseVersionId)).toEqual([13]);
      expect(api.create).toHaveBeenCalledWith({
        caseVersionId: 13, target: { type: 'GROUP', groupId: 3 }, opensAt: '2030-03-04T13:00:00.000Z', closesAt: null,
      });
      expect(notify.success).toHaveBeenCalledWith('Caso asignado al grupo.');
      expect(items()).toHaveLength(2);
    });

    it('cerrar el diálogo sin guardar no asigna nada', async () => {
      await render({ dialog: undefined });
      buttonIn(host(), 'Asignar un caso')!.click();
      await fixture.whenStable();
      expect(api.create).not.toHaveBeenCalled();
      expect(notify.success).not.toHaveBeenCalled();
    });

    it('si ya están asignados todos los casos publicados, el botón queda deshabilitado con su motivo', async () => {
      await render({ cases: [caso12] });
      const button = buttonIn(host(), 'Asignar un caso')!;
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(text(document.getElementById(button.getAttribute('aria-describedby')!))).toBe('Ya asignaste a este grupo todos tus casos publicados. Para ofrecer otro, publícalo en «Casos».');
      button.click();
      expect(open).not.toHaveBeenCalled();
    });

    it('un error del servidor se avisa con su mensaje y la lista queda como estaba', async () => {
      await render({
        dialog: { caseVersionId: 13, opensAt: null, closesAt: null },
        api: { create: vi.fn(() => backendError(409, 'El caso ya está asignado a este grupo.')) },
      });
      buttonIn(host(), 'Asignar un caso')!.click();
      await fixture.whenStable();
      expect(notify.error).toHaveBeenCalledWith('El caso ya está asignado a este grupo.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(items()).toHaveLength(1);
    });
  });

  it('un error sin mensaje avisa el texto de respaldo de la acción', async () => {
    await render({
      dialog: { caseVersionId: 13, opensAt: null, closesAt: null },
      api: { create: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500, error: null }))), remove: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500, error: null }))) },
    });
    buttonIn(host(), 'Asignar un caso')!.click();
    await fixture.whenStable();
    expect(notify.error).toHaveBeenLastCalledWith('No fue posible asignar el caso al grupo.' + ' Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!.click();
    await fixture.whenStable();
    expect(notify.error).toHaveBeenLastCalledWith('No fue posible retirar el caso del grupo.' + ' Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
  });

  describe('cambiar las fechas', () => {
    it('abre el diálogo con la asignación y su caso, y guarda solo las fechas', async () => {
      await render({ dialog: { opensAt: null, closesAt: '2030-04-01T23:59:00.000Z' } });
      buttonIn(items()[0], 'Cambiar fechas')!.click();
      await fixture.whenStable();
      const config = open.mock.calls[0][1] as { data: AssignmentDialogData };
      expect(config.data).toMatchObject({ mode: 'edit', title: 'Caso doce', assignment: row() });
      expect(api.update).toHaveBeenCalledWith(5, { opensAt: null, closesAt: '2030-04-01T23:59:00.000Z' });
      expect(notify.success).toHaveBeenCalledWith('Fechas actualizadas.');
    });
  });

  describe('pausar y reanudar', () => {
    it('pausar pide confirmar lo que le pasa al grupo y, confirmado, apaga la asignación', async () => {
      await render();
      buttonIn(items()[0], 'Pausar')!.click();
      await fixture.whenStable();
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Pausar «Caso doce» para el grupo?', confirmLabel: 'Pausar' }));
      expect((confirm.mock.calls[0][0] as { message: string }).message).toContain('nadie del grupo podrá iniciar ni seguir este caso');
      expect(api.update).toHaveBeenCalledWith(5, { active: false });
      expect(notify.success).toHaveBeenCalledWith('Asignación en pausa.');
    });

    it('si no se confirma, no cambia nada', async () => {
      await render({ confirmed: false });
      buttonIn(items()[0], 'Pausar')!.click();
      await fixture.whenStable();
      expect(api.update).not.toHaveBeenCalled();
    });

    it('reanudar no pide confirmar: devuelve el acceso', async () => {
      await render({ api: { list: vi.fn(() => of([row({ active: false })])) } });
      buttonIn(items()[0], 'Reanudar')!.click();
      await fixture.whenStable();
      expect(confirm).not.toHaveBeenCalled();
      expect(api.update).toHaveBeenCalledWith(5, { active: true });
      expect(notify.success).toHaveBeenCalledWith('Asignación reanudada.');
    });
  });

  describe('retirar', () => {
    it('pide confirmar nombrando lo que pasa y, confirmado, retira el caso y avisa', async () => {
      await render();
      buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!.click();
      await fixture.whenStable();
      const options = confirm.mock.calls[0][0] as { title: string; message: string; tone: string };
      expect(options.title).toBe('¿Retirar «Caso doce» del grupo?');
      expect(options.message).toContain('incluso quienes ya lo empezaron');
      expect(options.tone).toBe('danger');
      expect(api.remove).toHaveBeenCalledWith(5);
      expect(notify.success).toHaveBeenCalledWith('Caso retirado del grupo.');
      expect(items()).toHaveLength(0);
    });

    it('si no se confirma, el caso sigue asignado', async () => {
      await render({ confirmed: false });
      buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!.click();
      await fixture.whenStable();
      expect(api.remove).not.toHaveBeenCalled();
      expect(items()).toHaveLength(1);
    });

    it('un error del servidor se avisa con su mensaje y el caso sigue en la lista', async () => {
      await render({ api: { remove: vi.fn(() => backendError(409, 'No se pudo retirar.')) } });
      buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!.click();
      await fixture.whenStable();
      expect(notify.error).toHaveBeenCalledWith('No se pudo retirar.');
      expect(items()).toHaveLength(1);
    });
  });

  it('avisa cuántos casos tiene asignados cuando carga y cada vez que cambian (el detalle del grupo los cuenta)', async () => {
    await render({ dialog: { caseVersionId: 13, opensAt: null, closesAt: null } });
    const counts: number[] = [];
    fixture.componentInstance.assignedChange.subscribe(count => counts.push(count));
    buttonIn(host(), 'Asignar un caso')!.click();
    await fixture.whenStable();
    expect(counts.at(-1)).toBe(2);
    buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!.click();
    await fixture.whenStable();
    expect(counts.at(-1)).toBe(1);
  });

  it('al cambiar de grupo vuelve a pedir las asignaciones del nuevo', async () => {
    await render();
    fixture.componentRef.setInput('grupoId', 4);
    await fixture.whenStable();
    expect(api.list).toHaveBeenLastCalledWith(4);
  });

  // req: RF-14, RN-04 (revisión de F10)
  describe('al cambiar de grupo con respuestas que llegan en otro orden', () => {
    const switchTo = async (groupId: number) => {
      fixture.componentRef.setInput('grupoId', groupId);
      await fixture.whenStable();
    };

    it('la respuesta lenta del grupo anterior no pisa la lista del nuevo', async () => {
      const slow = new Subject<Assignment[]>();
      const fast = new Subject<Assignment[]>();
      await render({ api: { list: vi.fn((groupId: number) => (groupId === 3 ? slow : fast)) } });
      await switchTo(4);

      fast.next([row({ id: 9, caseVersionId: 13, target: { type: 'GROUP', groupId: 4 } })]);
      await fixture.whenStable();
      slow.next([row({ id: 5, caseVersionId: 12 })]);
      await fixture.whenStable();

      expect(items().map(item => text(item.querySelector('strong')))).toEqual(['Caso trece']);
    });

    it('mientras carga el grupo nuevo no muestra las filas del anterior ni deja asignar (dice por qué)', async () => {
      const pending = new Subject<Assignment[]>();
      await render({ api: { list: vi.fn((groupId: number) => (groupId === 3 ? of([row()]) : pending)) } });
      expect(items()).toHaveLength(1);

      await switchTo(4);

      expect(items()).toHaveLength(0);
      expect(text(host()), 'cargando no es lo mismo que vacío').not.toContain('No hay casos asignados');
      const assign = buttonIn(host(), 'Asignar un caso')!;
      expect(assign.getAttribute('aria-disabled')).toBe('true');
      expect(text(assign.querySelector('[hidden]'))).toBe('Cargando los casos del grupo…');
    });

    it('si la carga del grupo nuevo falla, no quedan las filas ni el conteo del anterior: un error con «Reintentar»', async () => {
      const counts: number[] = [];
      await render({ api: { list: vi.fn((groupId: number) => (groupId === 3 ? of([row()]) : throwError(() => ({ status: 500 })))) } });
      fixture.componentInstance.assignedChange.subscribe(count => counts.push(count));

      await switchTo(4);

      expect(items()).toHaveLength(0);
      expect(host().querySelector('ui-error-state')).not.toBeNull();
      expect(counts, 'un conteo solo se avisa de un grupo que terminó de cargar').toEqual([]);
    });

    it('el conteo del grupo nuevo se avisa cuando ese grupo termina de cargar, no antes', async () => {
      const pending = new Subject<Assignment[]>();
      const counts: number[] = [];
      await render({ api: { list: vi.fn((groupId: number) => (groupId === 3 ? of([row()]) : pending)) } });
      fixture.componentInstance.assignedChange.subscribe(count => counts.push(count));

      await switchTo(4);
      expect(counts).toEqual([]);
      pending.next([row({ id: 8 }), row({ id: 9, caseVersionId: 13 })]);
      await fixture.whenStable();

      expect(counts).toEqual([2]);
    });

    it('una asignación creada para el grupo anterior no entra a la lista del nuevo', async () => {
      const created = new Subject<Assignment>();
      await render({
        dialog: { caseVersionId: 13, opensAt: null, closesAt: null },
        api: { list: vi.fn((groupId: number) => of(groupId === 3 ? [row()] : [])), create: vi.fn(() => created) },
      });
      buttonIn(host(), 'Asignar un caso')!.click();
      await fixture.whenStable();

      await switchTo(4);
      created.next(row({ id: 6, caseVersionId: 13 }));
      await fixture.whenStable();

      expect(items(), 'la asignación era del grupo 3').toHaveLength(0);
    });
  });

  // req: RF-14, RNF-04 (revisión de F10)
  describe('motivos y nombres', () => {
    it('«Asignar un caso» dice si los casos publicados aún cargan o fallaron (no «no hay más casos»)', async () => {
      await render();
      fixture.componentRef.setInput('casesStatus', 'loading');
      await fixture.whenStable();
      expect(text(buttonIn(host(), 'Asignar un caso')!.querySelector('[hidden]'))).toBe('Cargando los casos publicados…');

      fixture.componentRef.setInput('casesStatus', 'failed');
      await fixture.whenStable();
      expect(text(buttonIn(host(), 'Asignar un caso')!.querySelector('[hidden]'))).toBe('No pudimos cargar tus casos publicados. Reintenta para poder asignar.');
    });

    it('cada botón de una fila lleva el nombre de su caso, para distinguirlos en la lista de botones', async () => {
      await render({ api: { list: vi.fn(() => of([row({ id: 5, caseVersionId: 12 }), row({ id: 6, caseVersionId: 13, active: false })])) } });

      const names = items().map(item => Array.from(item.querySelectorAll('button')).map(button => button.getAttribute('aria-label') ?? text(button)));
      expect(names[0]).toEqual(['Cambiar fechas de «Caso doce»', 'Pausar «Caso doce»', 'Retirar «Caso doce» del grupo']);
      expect(names[1]).toEqual(['Cambiar fechas de «Caso trece»', 'Reanudar «Caso trece»', 'Retirar «Caso trece» del grupo']);
    });

    it('«Retirar» dice por qué espera mientras hay un cambio en curso (como los otros botones)', async () => {
      const pending = new Subject<Assignment>();
      await render({ api: { update: vi.fn(() => pending) }, confirmed: true });
      buttonIn(items()[0], 'Pausar «Caso doce»')!.click();
      await fixture.whenStable();
      await fixture.whenStable();

      const remove = buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!;
      expect(remove.getAttribute('aria-disabled')).toBe('true');
      expect(text(remove.querySelector('[hidden]'))).toBe('Hay un cambio en curso: espera un momento.');
    });

    it('tras retirar un caso el foco va a «Asignar un caso» (el botón que se pulsó desaparece)', async () => {
      await render();
      document.body.appendChild(host());
      try {
        buttonIn(items()[0], 'Retirar «Caso doce» del grupo')!.click();
        await fixture.whenStable();
        await new Promise<void>(resolve => setTimeout(resolve));

        expect(items()).toHaveLength(0);
        expect(document.activeElement).toBe(buttonIn(host(), 'Asignar un caso'));
      } finally {
        host().remove();
      }
    });
  });
  // P6: un botón apagado dice su causa a la vista (no solo en un globo) y, cuando la hay, ofrece la salida.
  describe('el motivo del botón apagado se ve junto a él', () => {
    const motivo = () => host().querySelector('[data-ga-reason]');
    const salida = () => host().querySelector('.ga-reason a, .ga-reason button');

    it('sin ningún caso publicado lo dice y lleva a «Casos»', async () => {
      await render({ cases: [], api: { list: vi.fn(() => of([])) } });
      expect(text(motivo())).toBe('Aún no tienes casos publicados. Publica uno en «Casos» y vuelve aquí para asignarlo.');
      expect(salida()?.getAttribute('href')).toBe('/portal/casos');
      expect(text(salida())).toBe('Ir a «Casos»');
      expect(buttonIn(host(), 'Asignar un caso')!.getAttribute('aria-disabled')).toBe('true');
    });

    it('con todos los publicados ya asignados dice cuál es la situación y también lleva a «Casos»', async () => {
      await render({ cases: [caso12] });
      expect(text(motivo())).toContain('Ya asignaste a este grupo todos tus casos publicados');
      expect(salida()?.getAttribute('href')).toBe('/portal/casos');
    });

    it('si los casos publicados no cargaron, ofrece «Reintentar» y lo avisa a quien los trae', async () => {
      await render();
      const reintentos = vi.fn();
      fixture.componentInstance.retryCases.subscribe(reintentos);
      fixture.componentRef.setInput('casesStatus', 'failed');
      await fixture.whenStable();
      expect(text(motivo())).toBe('No pudimos cargar tus casos publicados. Reintenta para poder asignar.');
      (salida() as HTMLButtonElement).click();
      expect(reintentos).toHaveBeenCalledTimes(1);
    });

    it('mientras cargan los casos del grupo o los publicados, lo dice sin ofrecer salidas', async () => {
      await render();
      fixture.componentRef.setInput('casesStatus', 'loading');
      await fixture.whenStable();
      expect(text(motivo())).toBe('Cargando los casos publicados…');
      expect(salida()).toBeNull();
    });

    it('con casos por asignar no hay motivo ni salida: el botón funciona', async () => {
      await render({ api: { list: vi.fn(() => of([])) } });
      expect(motivo()).toBeNull();
      expect(buttonIn(host(), 'Asignar un caso')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('mientras hay un cambio en curso lo dice junto al botón', async () => {
      const pending = new Subject<Assignment>();
      await render({ api: { update: vi.fn(() => pending) }, confirmed: true });
      buttonIn(items()[0], 'Pausar «Caso doce»')!.click();
      await fixture.whenStable();
      await fixture.whenStable();
      expect(text(motivo())).toBe('Hay un cambio en curso: espera un momento.');
    });

    it('si falla cargar los casos asignados, el error lo dice en palabras de persona con su acción', async () => {
      await render({ api: { list: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Traceback (most recent call last)' }))) } });
      const error = host().querySelector('ui-error-state')!;
      expect(text(error)).toContain('No pudimos cargar los casos asignados. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
      expect(text(error)).not.toContain('Traceback');
      expect(buttonIn(error, 'Reintentar')).toBeDefined();
    });
  });
});
