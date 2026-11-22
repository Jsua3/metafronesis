import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiStat } from './ui-stat';

/**
 * ui-stat (plan visual F2-3): una cifra con su rótulo y, si hace falta, su aclaración. Se lee en ese orden
 * (rótulo → cifra → aclaración) y los números salen con el formato de Colombia.
 */
describe('ui-stat', () => {
  const render = async (inputs: Record<string, unknown>) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiStat);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('pinta rótulo, cifra y aclaración en orden de lectura', async () => {
    const stat = await render({ label: 'Intentos completados', value: 12, hint: 'Últimos 30 días' });
    const parts = [...stat.querySelectorAll('.ui-stat__label, .ui-stat__value, .ui-stat__hint')].map(el => el.className.split(' ')[0]);
    expect(parts).toEqual(['ui-stat__label', 'ui-stat__value', 'ui-stat__hint']);
    expect(stat.querySelector('.ui-stat__label')?.textContent?.trim()).toBe('Intentos completados');
    expect(stat.querySelector('.ui-stat__hint')?.textContent?.trim()).toBe('Últimos 30 días');
  });

  it('formatea los números con separador de miles de Colombia y deja el texto tal cual', async () => {
    expect((await render({ label: 'Estudiantes', value: 1234 })).querySelector('.ui-stat__value')?.textContent?.trim()).toBe('1.234');
    TestBed.resetTestingModule();
    expect((await render({ label: 'Mejor puntaje', value: '9,5 / 10' })).querySelector('.ui-stat__value')?.textContent?.trim()).toBe('9,5 / 10');
  });

  it('sin aclaración no deja un renglón vacío', async () => {
    const stat = await render({ label: 'Casos', value: 3 });
    expect(stat.querySelector('.ui-stat__hint')).toBeNull();
  });
});
