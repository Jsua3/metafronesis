import { DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CuentasRecordadasDialogoComponent } from './cuentas-recordadas-dialogo.component';
import { CLAVE_CUENTAS_RECORDADAS, CuentasRecordadasService } from './cuentas-recordadas.service';

/** Diálogo «Quitar cuentas de esta lista» (SIEP-281): una fila por cuenta con su botón nombrado, y «Quitar todas». */
// req: RNF-004 (diálogo operable con teclado y lector de pantalla)
describe('CuentasRecordadasDialogoComponent', () => {
  let fixture: ComponentFixture<CuentasRecordadasDialogoComponent>;
  let servicio: CuentasRecordadasService;
  const close = vi.fn();
  const host = () => fixture.nativeElement as HTMLElement;
  const filas = () => [...host().querySelectorAll<HTMLElement>('.cuentas-dialogo__fila')];
  const botones = () => [...host().querySelectorAll<HTMLButtonElement>('.cuentas-dialogo__quitar')];

  beforeEach(async () => {
    localStorage.clear();
    close.mockReset();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: DialogRef, useValue: { close, containerInstance: null } }],
    });
    servicio = TestBed.inject(CuentasRecordadasService);
    const ahora = Date.now();
    servicio.recordar({ id: 1, nombre: 'Ana', apellido: 'Ríos', email: 'ana@cue.edu.co', rol: 'ADMIN', ultimaVez: new Date(ahora - 1000).toISOString() });
    servicio.recordar({ id: 2, nombre: 'Luis', apellido: 'Paz', email: 'luis@cue.edu.co', rol: 'PROFESOR', ultimaVez: new Date(ahora).toISOString() });
    fixture = TestBed.createComponent(CuentasRecordadasDialogoComponent);
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  it('lista cada cuenta con nombre, rol legible y correo, y un botón con el nombre de la cuenta en su nombre accesible', () => {
    expect(filas().map(f => f.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Luis Paz'), expect.stringContaining('Ana Ríos'),
    ]);
    expect(filas()[0].textContent).toContain('Docente');
    expect(filas()[0].textContent).toContain('luis@cue.edu.co');
    expect(botones().map(b => b.getAttribute('aria-label'))).toEqual([
      'Quitar de esta lista: Luis Paz', 'Quitar de esta lista: Ana Ríos',
    ]);
    expect(botones()[0].textContent!.trim()).toBe('Quitar');
  });

  it('«Quitar de esta lista» quita solo esa cuenta', async () => {
    botones()[0].click();
    await fixture.whenStable();
    expect(servicio.cuentas().map(c => c.id)).toEqual([1]);
    expect(filas()).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('quitar la última cuenta cierra el diálogo', async () => {
    botones()[0].click();
    await fixture.whenStable();
    botones()[0].click();
    await fixture.whenStable();
    expect(servicio.cuentas()).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('«Quitar todas» vacía la lista y cierra; incluye la cuenta actual', async () => {
    host().querySelector<HTMLButtonElement>('.cuentas-dialogo__todas')!.click();
    await fixture.whenStable();
    expect(servicio.cuentas()).toEqual([]);
    expect(localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
