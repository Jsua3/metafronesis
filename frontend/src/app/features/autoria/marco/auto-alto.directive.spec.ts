import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AutoAltoDirective } from './auto-alto.directive';

@Component({
  imports: [AutoAltoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea autoAlto aria-label="Línea"></textarea>`,
})
class Anfitrion {}

// req: EDITOR.md §4.2, regla 2 (los campos de texto crecen con su contenido)
describe('AutoAltoDirective', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function montar() {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    const fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    const campo = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    return { fixture, campo };
  }

  it('sin `field-sizing` en el navegador, ajusta el alto al contenido al escribir (y lleva la clase con el tope)', async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const { campo } = await montar();
    expect(campo.classList).toContain('auto-alto');
    Object.defineProperty(campo, 'scrollHeight', { configurable: true, get: () => 132 });
    campo.value = 'Una línea larga\nque ocupa\nvarios renglones';
    campo.dispatchEvent(new Event('input'));
    expect(campo.style.getPropertyValue('--auto-alto')).toBe('132px');
  });

  it('si el navegador ya hace crecer los campos, no toca nada', async () => {
    vi.stubGlobal('CSS', { supports: (p: string, v: string) => p === 'field-sizing' && v === 'content' });
    const { campo } = await montar();
    campo.dispatchEvent(new Event('input'));
    expect(campo.style.getPropertyValue('--auto-alto')).toBe('');
  });
});
