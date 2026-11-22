import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiSpinner } from './ui-spinner';

/**
 * ui-spinner (plan visual F2-1 y F2-4): indicador indeterminado. Decorativo por defecto (quien lo usa anuncia el
 * estado, p. ej. el aria-busy del botón); con `label` se anuncia como estado.
 */
describe('ui-spinner', () => {
  const render = async (inputs: Record<string, unknown> = {}) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiSpinner);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('sin label es decorativo: oculto al lector y sin role', async () => {
    const spinner = await render();
    expect(spinner.getAttribute('aria-hidden')).toBe('true');
    expect(spinner.hasAttribute('role')).toBe(false);
  });

  it('con label se anuncia como estado con ese nombre', async () => {
    const spinner = await render({ label: 'Cargando casos' });
    expect(spinner.getAttribute('role')).toBe('status');
    expect(spinner.getAttribute('aria-label')).toBe('Cargando casos');
    expect(spinner.hasAttribute('aria-hidden')).toBe(false);
  });

  it('el tamaño llega como propiedad CSS (sin atributo style en la plantilla)', async () => {
    const spinner = await render({ size: 16 });
    expect(spinner.style.getPropertyValue('--_size')).toBe('16px');
    expect(spinner.classList).toContain('ds-motion');
  });
});
