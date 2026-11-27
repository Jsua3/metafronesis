import { TestBed } from '@angular/core/testing';
import { UiAyudaBreve } from './ui-ayuda-breve';

/**
 * Ayuda breve: botón de vidrio con glifo de pixel art y explicación en un popover anclado
 * (capa superior: no empuja el texto de alrededor ni lo corta un overflow).
 */
describe('UiAyudaBreve', () => {
  async function crear(termino = 'Sala', explicacion = 'Un espacio del caso.') {
    await TestBed.configureTestingModule({ imports: [UiAyudaBreve] }).compileComponents();
    const f = TestBed.createComponent(UiAyudaBreve);
    f.componentRef.setInput('termino', termino);
    f.componentRef.setInput('explicacion', explicacion);
    f.detectChanges();
    return f;
  }
  const boton = (el: HTMLElement) => el.querySelector('button')!;
  const panel = (el: HTMLElement) => el.querySelector<HTMLElement>('[popover]')!;

  it('ofrece un botón accesible con el nombre de siempre', async () => {
    const f = await crear();
    const b = boton(f.nativeElement);
    expect(b).toBeTruthy();
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Ayuda: Sala');
  });

  it('no usa details ni summary', async () => {
    const f = await crear();
    expect(f.nativeElement.querySelector('details, summary')).toBeNull();
  });

  it('el panel es un popover auto y su id coincide con aria-controls', async () => {
    const f = await crear();
    const p = panel(f.nativeElement);
    expect(p.getAttribute('popover')).toBe('auto');
    expect(p.id).toBeTruthy();
    expect(boton(f.nativeElement).getAttribute('aria-controls')).toBe(p.id);
  });

  it('la explicación y el término están en el DOM', async () => {
    const f = await crear();
    const p = panel(f.nativeElement);
    expect(p.textContent).toContain('Un espacio del caso.');
    expect(p.textContent).toContain('Sala');
  });

  it('aria-expanded sigue al evento toggle del popover', async () => {
    const f = await crear();
    const b = boton(f.nativeElement);
    const p = panel(f.nativeElement);
    expect(b.getAttribute('aria-expanded')).toBe('false');
    const toggle = (newState: string) => {
      const e = new Event('toggle');
      Object.assign(e, { newState });
      p.dispatchEvent(e);
      f.detectChanges();
    };
    toggle('open');
    expect(b.getAttribute('aria-expanded')).toBe('true');
    toggle('closed');
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('el glifo es decorativo', async () => {
    const f = await crear();
    const svg = boton(f.nativeElement).querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('dos instancias tienen ids distintos', async () => {
    const a = await crear('A', 'a');
    const b = TestBed.createComponent(UiAyudaBreve);
    b.componentRef.setInput('termino', 'B');
    b.componentRef.setInput('explicacion', 'b');
    b.detectChanges();
    expect(panel(a.nativeElement).id).not.toBe(panel(b.nativeElement).id);
  });
});
