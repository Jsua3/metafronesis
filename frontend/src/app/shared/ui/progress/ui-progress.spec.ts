import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiProgress } from './ui-progress';

/**
 * ui-progress (plan visual F2-4): barra de progreso con role="progressbar", nombre y valores ARIA. Sin valor es
 * indeterminada (sin aria-valuenow). El valor se acota a [0, max].
 */
// req: RNF-004 (estado de progreso expuesto a tecnologías de apoyo)
describe('ui-progress', () => {
  const render = async (inputs: Record<string, unknown>) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiProgress);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('expone rol, nombre, mínimo, máximo, valor y un texto legible', async () => {
    const bar = await render({ label: 'Escenas completadas', value: 3, max: 5 });
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('Escenas completadas');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuetext')).toBe('3 de 5');
    expect(bar.style.getPropertyValue('--_ratio')).toBe('0.6');
  });

  it('acota el valor a [0, max]', async () => {
    const over = await render({ label: 'Avance', value: 12, max: 10 });
    expect(over.getAttribute('aria-valuenow')).toBe('10');
    expect(over.style.getPropertyValue('--_ratio')).toBe('1');
    TestBed.resetTestingModule();
    const under = await render({ label: 'Avance', value: -2, max: 10 });
    expect(under.getAttribute('aria-valuenow')).toBe('0');
  });

  it('sin valor es indeterminada', async () => {
    const bar = await render({ label: 'Cargando el caso', value: null });
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.hasAttribute('aria-valuetext')).toBe(false);
    expect(bar.classList).toContain('ui-progress--indeterminate');
  });
});
