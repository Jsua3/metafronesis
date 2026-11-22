import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiSection } from './ui-section';

/**
 * ui-section (plan visual F2-3): bloque de una pantalla con su título. Es una región con nombre (aria-labelledby a
 * su título) y su nivel de título sigue al h1 de la cabecera: h2 por defecto, h3 si va anidada.
 */
// req: RNF-004 (estructura de títulos y regiones, §2.9)
describe('ui-section', () => {
  const render = async (inputs: Record<string, unknown>) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiSection);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('es una región nombrada por su h2', async () => {
    const host = await render({ title: 'Intentos recientes' });
    const section = host.querySelector('section')!;
    const heading = host.querySelector('h2')!;
    expect(heading.textContent?.trim()).toBe('Intentos recientes');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.id).not.toBe('');
  });

  it('anidada usa h3', async () => {
    const host = await render({ title: 'Detalle', level: 3 });
    expect(host.querySelector('h2')).toBeNull();
    expect(host.querySelector('h3')?.textContent?.trim()).toBe('Detalle');
  });
});
