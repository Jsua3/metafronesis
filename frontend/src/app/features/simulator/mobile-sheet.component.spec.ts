import { TestBed } from '@angular/core/testing';
import { MobileSheetComponent } from './mobile-sheet.component';

describe('hoja móvil del simulador', () => {
  it('ofrece todos los destinos y emite la acción elegida', () => {
    const fixture = TestBed.createComponent(MobileSheetComponent);
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-mobile-action]')];
    expect(buttons.map(b => b.textContent?.trim())).toEqual([
      'Ir a…', 'Plano', 'Vista cercana', 'Controles', 'Ayuda', 'Bitácora', 'Ajustes', 'Contenido sensible', 'Volver al catálogo',
    ]);
    buttons[1].click();
    expect(action).toHaveBeenCalledWith('plan');
    expect(root.textContent).toContain('Salida segura');
    expect(root.querySelectorAll('app-volume-bars')).toHaveLength(2);
  });

  it('la hoja de herramientas conserva cerrar y salida segura', () => {
    const fixture = TestBed.createComponent(MobileSheetComponent);
    fixture.componentRef.setInput('kind', 'tools');
    const close = vi.fn();
    fixture.componentInstance.closed.subscribe(close);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-mobile-action]')).toBeNull();
    expect(root.textContent).toContain('Herramientas');
    expect(root.textContent).toContain('Salida segura');
    root.querySelector<HTMLButtonElement>('[data-mobile-close]')!.click();
    expect(close).toHaveBeenCalledOnce();
  });
});
