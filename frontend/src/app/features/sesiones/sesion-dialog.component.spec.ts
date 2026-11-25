import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { GrupoService } from '../../core/api/grupo.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SesionesApi } from '../../core/api/sesiones.api';
import { SesionDetalle } from '../../core/models/sesion.model';
import { SesionDialogComponent, SesionDialogData } from './sesion-dialog.component';

const casos = [{ caseVersionId: 9, titulo: 'La casa de Sofía', version: '1.0.0', autor: 'Ana', tiempoEstimadoMin: 40, descripcion: '' }];
const grupos = [{ id: 2, nombre: 'Psicología 1', codigo: 'P1', totalEstudiantes: 12 }];

describe('SesionDialogComponent', () => {
  let fixture: ComponentFixture<SesionDialogComponent>;
  let close: ReturnType<typeof vi.fn>;
  let crear: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const input = (sel: string) => el().querySelector<HTMLInputElement & HTMLSelectElement>(sel)!;
  const escribir = (sel: string, valor: string) => {
    const control = input(sel);
    control.value = valor;
    control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input'));
  };

  let editar: ReturnType<typeof vi.fn>;
  let error: ReturnType<typeof vi.fn>;

  async function montar(data: SesionDialogData, respuestaCrear = of({ id: 5 }), fuentes: { grupos?: unknown; casos?: unknown } = {}) {
    editar = vi.fn(() => of({ id: 5 }));
    error = vi.fn();
    close = vi.fn();
    crear = vi.fn(() => respuestaCrear);
    await TestBed.configureTestingModule({
      imports: [SesionDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
        { provide: SesionesApi, useValue: { casos: () => fuentes.casos ?? of(casos), crear, editar } },
        { provide: GrupoService, useValue: { listar: () => fuentes.grupos ?? of(grupos) } },
        { provide: NotificationService, useValue: { error } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SesionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function llenar() {
    escribir('[name=grupoId]', '2');
    escribir('[name=caseVersionId]', '9');
    escribir('[name=inicio]', '2026-11-25T08:00');
    escribir('[name=fin]', '2026-11-25T10:00');
    escribir('[name=tiempoMaximoMin]', '30');
    fixture.detectChanges();
  }

  it('ofrece los grupos con sus miembros y los casos de la biblioteca', async () => {
    await montar({ modo: 'crear' });
    expect(input('[name=grupoId]').textContent).toContain('Psicología 1 · 12 estudiantes');
    expect(input('[name=caseVersionId]').textContent).toContain('La casa de Sofía');
  });

  it('la opción del caso nombra a quienes lo editaron, si los hay', async () => {
    await montar({ modo: 'crear' }, of({ id: 5 }), { casos: of([
      ...casos, { caseVersionId: 10, titulo: 'El aula', version: '1.2.0', autor: 'Ana', editadoPor: ['Beto', 'Carla'], tiempoEstimadoMin: 30, descripcion: '' },
    ]) });
    const opciones = [...input('[name=caseVersionId]').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(opciones).toContain('La casa de Sofía · v1.0.0 · Ana');
    expect(opciones).toContain('El aula · v1.2.0 · Ana · editado por Beto, Carla');
  });

  it('valida antes de enviar', async () => {
    await montar({ modo: 'crear' });
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(crear).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Elige un grupo.');
  });

  it('el tiempo máximo no supera el estimado del caso', async () => {
    await montar({ modo: 'crear' });
    llenar();
    escribir('[name=tiempoMaximoMin]', '41');
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(crear).not.toHaveBeenCalled();
    expect(el().textContent).toContain('máximo 40 minutos');
  });

  it('guarda y devuelve la sesión', async () => {
    await montar({ modo: 'crear' });
    llenar();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ grupoId: 2, caseVersionId: 9, tiempoMaximoMin: 30 }));
    expect(close).toHaveBeenCalledWith({ id: 5 });
  });

  it('pone el error del servidor en su campo', async () => {
    const error = new HttpErrorResponse({ status: 400, error: { code: 'GROUP_EMPTY', field: 'grupoId', message: 'El grupo no tiene estudiantes activos.' } });
    await montar({ modo: 'crear' }, throwError(() => error));
    llenar();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el().textContent).toContain('El grupo no tiene estudiantes activos.');
    expect(close).not.toHaveBeenCalled();
  });

  const sesion = {
    id: 7, estado: 'PROGRAMADA', acciones: ['editar'], grupo: { id: 2, nombre: 'Psicología 1' },
    caso: { caseVersionId: 9, titulo: 'La casa de Sofía' },
    inicio: '2026-11-25T13:00:00Z', fin: '2026-11-25T15:00:00Z', tiempoMaximoMin: 30, lugar: 'Aula 3', mensaje: 'Hola',
    totalConvocados: 12, iniciadaEn: null, finalizadaEn: null, canceladaEn: null, convocados: [],
  } as unknown as SesionDetalle;

  it('en edición precarga los campos, aunque los grupos y casos lleguen después', async () => {
    const g = new Subject<unknown[]>();
    const c = new Subject<unknown[]>();
    await montar({ modo: 'editar', sesion }, of({ id: 5 }), { grupos: g, casos: c });
    g.next(grupos);
    c.next(casos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input('[name=grupoId]').selectedOptions[0].textContent).toContain('Psicología 1');
    expect(input('[name=caseVersionId]').selectedOptions[0].textContent).toContain('La casa de Sofía');
    expect(input('[name=lugar]').value).toBe('Aula 3');
    expect(input('[name=tiempoMaximoMin]').value).toBe('30');
    expect(el().textContent).toContain('Editar sesión');
    expect(el().textContent).toContain('Guardar cambios');
  });

  it('en edición guarda con editar y devuelve el resultado', async () => {
    await montar({ modo: 'editar', sesion });
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(editar).toHaveBeenCalledWith(7, expect.objectContaining({ grupoId: 2, caseVersionId: 9, tiempoMaximoMin: 30 }));
    expect(crear).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith({ id: 5 });
  });

  it('el fin debe ser posterior al inicio', async () => {
    await montar({ modo: 'crear' });
    llenar();
    escribir('[name=fin]', '2026-11-25T07:00');
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(crear).not.toHaveBeenCalled();
    expect(el().textContent).toContain('El fin debe ser posterior al inicio.');
  });

  it('avisa si no cargan los grupos o los casos', async () => {
    await montar({ modo: 'crear' }, of({ id: 5 }), { grupos: throwError(() => new Error('x')), casos: throwError(() => new Error('x')) });
    expect(error).toHaveBeenCalledWith('No pudimos cargar los grupos.');
    expect(error).toHaveBeenCalledWith('No pudimos cargar los casos de la biblioteca.');
  });

  it('no envía dos veces mientras guarda', async () => {
    await montar({ modo: 'crear' }, new Subject<never>() as never);
    llenar();
    const form = el().querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));
    expect(crear).toHaveBeenCalledTimes(1);
  });
});
