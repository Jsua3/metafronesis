import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { AuthService } from '../../core/auth/auth.service';
import { PROGRESO_INICIAL, guardarProgreso } from '../autoria/tutorial/progreso-tutorial';
import { CaseAuthoringHubComponent } from './case-authoring-hub.component';

async function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CaseAuthoringHubComponent],
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthoringApi, useValue: { listAuthoringCases: () => of([]) } },
      { provide: AuthService, useValue: { currentUser: signal({ id: 7, role: 'PROFESOR' }) } },
    ],
  });
  const fixture = TestBed.createComponent(CaseAuthoringHubComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Casos: tarjeta del tutorial', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  it('sin progreso ofrece Empezar', async () => {
    const raiz = await montar();
    expect(raiz.querySelector('.hub-tutorial')!.textContent).toContain('Aprende a crear un caso');
    expect(raiz.querySelector('.hub-tutorial__accion')!.textContent).toContain('Empezar');
    expect(raiz.querySelector('.hub-tutorial a[href="/portal/casos/nuevo"]')?.textContent).toContain('Crear mi primer caso');
  });

  it('con progreso ofrece Continuar y dice cuántos capítulos van', async () => {
    guardarProgreso(7, { ...PROGRESO_INICIAL, casoId: '41', capitulo: 3, completados: ['bienvenida', 'datos', 'lugar'] });
    const raiz = await montar();
    expect(raiz.querySelector('.hub-tutorial')!.textContent).toContain('3 de 8 capítulos');
    expect(raiz.querySelector('.hub-tutorial__accion')!.textContent).toContain('Continuar');
  });

  it('terminado ofrece Repetir', async () => {
    guardarProgreso(7, { ...PROGRESO_INICIAL, casoId: '41', terminado: true, completados: ['bienvenida', 'datos', 'lugar', 'escenas', 'sala', 'guion', 'evaluacion', 'enviar'] });
    const raiz = await montar();
    expect(raiz.querySelector('.hub-tutorial__accion')!.textContent).toContain('Repetir');
  });
});
