import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { UI_TOOLTIP_SHOW_DELAY_MS } from '../tooltip/ui-tooltip';
import { UiIconButton } from './ui-icon-button';

/**
 * ui-icon-button (plan visual F2-1; «Cumple en esta fase»: un botón de solo icono exige su nombre accesible). El
 * `label` es obligatorio: en una plantilla falta y no compila (NG8008 con plantillas estrictas); en tiempo de
 * ejecución, leerlo sin valor lanza NG0950.
 */
// req: RNF-004 (etiquetas y alternativas textuales)
@Component({
  imports: [UiIconButton],
  template: `<button ui-icon-button icon="close" label="Cerrar el aviso" [disabledReason]="reason()"
    (click)="clicks = clicks + 1"></button>`,
})
class Host {
  reason = signal<string | null>(null);
  clicks = 0;
}

describe('ui-icon-button', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const button = () => fixture.debugElement.query(By.css('button[ui-icon-button]')).nativeElement as HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('su nombre accesible es el label y el icono es decorativo', () => {
    expect(button().getAttribute('aria-label')).toBe('Cerrar el aviso');
    const icon = button().querySelector('mat-icon')!;
    expect(icon.textContent?.trim()).toBe('close');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(button().classList).toContain('ui-icon-button');
    expect(button().classList).toContain('ui-icon-button--ghost');
    expect(button().type).toBe('button');
  });

  it('con motivo: aria-disabled, enfocable, motivo en aria-describedby y sin click para el consumidor', async () => {
    host.reason.set('No hay nada que deshacer');
    await fixture.whenStable();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    button().focus();
    expect(document.activeElement).toBe(button());
    expect(document.getElementById(button().getAttribute('aria-describedby')!)?.textContent?.trim()).toBe('No hay nada que deshacer');
    button().click();
    expect(host.clicks).toBe(0);
  });

  it('el globo muestra el label con el ratón y el motivo si está deshabilitado', async () => {
    document.body.appendChild(fixture.nativeElement);
    vi.useFakeTimers();
    try {
      button().dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS);
      expect(document.querySelector('.ui-tooltip')?.textContent?.trim()).toBe('Cerrar el aviso');
      button().dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(1000);
      host.reason.set('No hay nada que cerrar');
      fixture.detectChanges();
      button().dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS);
      expect(document.querySelector('.ui-tooltip')?.textContent?.trim()).toBe('No hay nada que cerrar');
    } finally {
      vi.useRealTimers();
      (fixture.nativeElement as HTMLElement).remove();
    }
  });

  it('sin label no se puede pintar (NG0950)', () => {
    const bare = TestBed.createComponent(UiIconButton);
    bare.componentRef.setInput('icon', 'close');
    expect(() => bare.detectChanges()).toThrowError(/NG0950/);
  });
});

@Component({
  imports: [UiIconButton],
  template: `<button ui-icon-button icon="undo" label="Deshacer" aria-describedby="ayuda" [disabledReason]="reason()"></button>`,
})
class DescribedHost {
  reason = signal<string | null>('Nada que deshacer');
}

describe('ui-icon-button con otras descripciones', () => {
  it('suma el motivo a aria-describedby sin borrar las ajenas', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(DescribedHost);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    const ids = () => (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids()).toContain('ayuda');
    expect(ids().length).toBe(2);
    fixture.componentInstance.reason.set(null);
    await fixture.whenStable();
    expect(ids()).toEqual(['ayuda']);
  });
});

describe('ui-icon-button bloqueado al pulsar (revisión de F2, I1)', () => {
  it('un toque muestra el motivo al instante', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.reason.set('No hay nada que cerrar');
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    button.dispatchEvent(new Event('touchstart', { bubbles: true }));
    button.click();
    expect(document.querySelector('.ui-tooltip')?.textContent?.trim()).toBe('No hay nada que cerrar');
    (fixture.nativeElement as HTMLElement).remove();
  });

  // req: BLOQUE-H (H-09), RNF-004 (F6-12: una sola fuente de anuncios, con deduplicado entre componentes)
  it('el motivo se anuncia por las regiones vivas de la app, con cortesía', async () => {
    const announce = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.reason.set('No hay nada que cerrar');
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(announce).toHaveBeenCalledWith('No hay nada que cerrar', 'polite');
    (fixture.nativeElement as HTMLElement).remove();
  });
});
