import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiVacioIlustrado } from './ui-vacio-ilustrado';

@Component({
  imports: [UiVacioIlustrado],
  template: `
    <ui-vacio-ilustrado escena="perdido" titulo="No encontramos esta página" frase="Puede que el enlace haya cambiado."
      nivel="h1"><a href="/portal">Volver al inicio</a></ui-vacio-ilustrado>
  `,
})
class ConAccion {}

/** Vacío ilustrado: viñeta + título + frase + acciones proyectadas (ronda 3 de la personalidad visual). */
// req: RNF-04
describe('UiVacioIlustrado', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('compone la viñeta decorativa, el título como encabezado y la acción proyectada', async () => {
    const fixture = TestBed.createComponent(ConAccion);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('ui-vineta')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('No encontramos esta página');
    expect(host.querySelector('.ui-vacio-ilustrado__frase')?.textContent).toContain('enlace');
    expect(host.querySelector('.ui-vacio-ilustrado__acciones a')?.getAttribute('href')).toBe('/portal');
  });

  it('por defecto el título es un párrafo, sin frase si no se da, y sin role salvo que se anuncie', async () => {
    const fixture = TestBed.createComponent(UiVacioIlustrado);
    fixture.componentRef.setInput('escena', 'casos');
    fixture.componentRef.setInput('titulo', 'Aún no hay casos');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('p.ui-vacio-ilustrado__titulo')).not.toBeNull();
    expect(host.querySelector('.ui-vacio-ilustrado__frase')).toBeNull();
    expect(host.getAttribute('role')).toBeNull();
    fixture.componentRef.setInput('anunciar', true);
    await fixture.whenStable();
    expect(host.getAttribute('role')).toBe('status');
  });
});
