import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { GrupoService } from '../../core/api/grupo.service';
import { SesionesApi } from '../../core/api/sesiones.api';
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

  async function montar(data: SesionDialogData, respuestaCrear = of({ id: 5 })) {
    close = vi.fn();
    crear = vi.fn(() => respuestaCrear);
    await TestBed.configureTestingModule({
      imports: [SesionDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
        { provide: SesionesApi, useValue: { casos: () => of(casos), crear, editar: vi.fn(() => of({ id: 5 })) } },
        { provide: GrupoService, useValue: { listar: () => of(grupos) } },
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
    escribir('[name=espacioAcademico]', 'Clínica');
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
});
