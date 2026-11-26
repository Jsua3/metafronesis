import { TestBed } from '@angular/core/testing';
import { UiAyudaBreve } from './ui-ayuda-breve';

describe('UiAyudaBreve', () => {
  it('ofrece una explicación con un control nativo accesible', async () => {
    await TestBed.configureTestingModule({ imports: [UiAyudaBreve] }).compileComponents();
    const f = TestBed.createComponent(UiAyudaBreve);
    f.componentRef.setInput('termino', 'Sala');
    f.componentRef.setInput('explicacion', 'Un espacio del caso.');
    f.detectChanges();
    const summary = f.nativeElement.querySelector('summary') as HTMLElement;
    expect(summary.getAttribute('aria-label')).toBe('Ayuda: Sala');
    expect(f.nativeElement.textContent).toContain('Un espacio del caso.');
  });
});
