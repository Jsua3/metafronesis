import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FirmaProgresoComponent } from './firma-progreso.component';

/** El indicador de tres píxeles (C16): determinado, una barra de progreso de 0 a 3 con el paso en palabras. */
// req: DP-09, RNF-004, WCAG 4.1.2
describe('app-firma-progreso', () => {
  async function crear(pasos: number, texto = 'Cargando la sala…') {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(FirmaProgresoComponent);
    fixture.componentRef.setInput('pasos', pasos);
    fixture.componentRef.setInput('texto', texto);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('es una barra de progreso de 0 a 3 con el paso en palabras', async () => {
    const host = await crear(1);
    expect(host.getAttribute('role')).toBe('progressbar');
    expect(host.getAttribute('aria-valuemin')).toBe('0');
    expect(host.getAttribute('aria-valuemax')).toBe('3');
    expect(host.getAttribute('aria-valuenow')).toBe('1');
    expect(host.getAttribute('aria-valuetext')).toBe('Cargando la sala…');
    expect(host.getAttribute('aria-label')).toBeTruthy();
  });

  it('enciende un cuadro por fase cumplida, en el orden de la firma (cian, azul, violeta)', async () => {
    const host = await crear(2);
    const cuadros = [...host.querySelectorAll('.firma-progreso__cuadro')];
    expect(cuadros.map(c => c.getAttribute('data-cuadro'))).toEqual(['cian', 'azul', 'violeta']);
    expect(cuadros.map(c => c.classList.contains('firma-progreso__cuadro--hecho'))).toEqual([true, true, false]);
  });

  it('nunca pasa de 3 ni baja de 0', async () => {
    expect((await crear(7)).getAttribute('aria-valuenow')).toBe('3');
    TestBed.resetTestingModule();
    expect((await crear(-2)).getAttribute('aria-valuenow')).toBe('0');
  });
});
