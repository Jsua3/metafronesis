import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { UI_TOOLTIP_SHOW_DELAY_MS, UI_TOOLTIP_TAP_VISIBLE_MS } from '../tooltip/ui-tooltip';
import { UI_BUTTON_SPINNER_DELAY_MS, UiButton, UiButtonSize, UiButtonVariant } from './ui-button';

/**
 * ui-button (plan visual F2-1; §2.5 y §2.6): atributo sobre <button>/<a> que conserva la semántica nativa. Con
 * motivo de deshabilitado o cargando, el control se ve deshabilitado, sigue enfocable y explica el motivo, pero no
 * dispara el (click) del consumidor ni envía el formulario.
 */
// req: RNF-004 (nombre y estado accesibles de los controles)
@Component({
  imports: [UiButton],
  template: `
    <form (submit)="$event.preventDefault(); submitted = submitted + 1">
      <button ui-button type="submit" [variant]="variant()" [size]="size()" [loading]="loading()"
        [disabledReason]="reason()" [icon]="icon()" iconEnd="arrow_forward" (click)="clicks = clicks + 1">Guardar</button>
    </form>
    <a ui-button variant="ghost" href="/destino" [disabledReason]="linkReason()">Ir</a>
  `,
})
class Host {
  variant = signal<UiButtonVariant>('primary');
  size = signal<UiButtonSize>('md');
  loading = signal(false);
  reason = signal<string | null>(null);
  icon = signal<string | undefined>('save');
  linkReason = signal<string | null>(null);
  clicks = 0;
  submitted = 0;
}

describe('ui-button', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const button = () => fixture.debugElement.query(By.css('button[ui-button]')).nativeElement as HTMLButtonElement;
  const link = () => fixture.debugElement.query(By.css('a[ui-button]')).nativeElement as HTMLAnchorElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('pinta variante y tamaño como clases y conserva el botón nativo con su tipo', async () => {
    host.variant.set('danger');
    host.size.set('lg');
    await fixture.whenStable();
    expect(button().classList).toContain('ui-button');
    expect(button().classList).toContain('ui-button--danger');
    expect(button().classList).toContain('ui-button--lg');
    expect(button().classList).not.toContain('ui-button--primary');
    expect(button().type).toBe('submit');
  });

  it('los iconos son decorativos: el nombre accesible es solo el texto', () => {
    const icons = [...button().querySelectorAll('mat-icon')];
    expect(icons.map(icon => icon.textContent?.trim())).toEqual(['save', 'arrow_forward']);
    expect(icons.every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(button().querySelector('.ui-button__label')?.textContent?.trim()).toBe('Guardar');
  });

  it('con un motivo queda aria-disabled, enfocable y con el motivo en aria-describedby', async () => {
    host.reason.set('Completa correo y contraseña');
    await fixture.whenStable();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().disabled).toBe(false);
    button().focus();
    expect(document.activeElement).toBe(button());
    const describedBy = button().getAttribute('aria-describedby')!;
    const reason = document.getElementById(describedBy);
    expect(reason?.textContent?.trim()).toBe('Completa correo y contraseña');
    // Oculto con `hidden`: aria-describedby lo lee igual, pero no se suma al nombre del botón (que se calcula
    // con su contenido y quedaría «Guardar Completa correo y contraseña»).
    expect(reason?.hidden).toBe(true);
  });

  it('con un motivo, el ratón lo muestra en un globo a los 400 ms (§2.6); sin motivo no hay globo', async () => {
    host.reason.set('Completa correo y contraseña');
    await fixture.whenStable();
    document.body.appendChild(fixture.nativeElement);
    vi.useFakeTimers();
    try {
      button().dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS);
      expect(document.querySelector('.ui-tooltip')?.textContent?.trim()).toBe('Completa correo y contraseña');
      button().dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(1000);
      host.reason.set(null);
      fixture.detectChanges();
      button().dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(1000);
      expect(document.querySelector('.ui-tooltip')).toBeNull();
    } finally {
      vi.useRealTimers();
      (fixture.nativeElement as HTMLElement).remove();
    }
  });

  it('sin motivo no queda rastro de aria-disabled ni de aria-describedby', async () => {
    host.reason.set('Sin cambios');
    await fixture.whenStable();
    host.reason.set(null);
    await fixture.whenStable();
    expect(button().hasAttribute('aria-disabled')).toBe(false);
    expect(button().hasAttribute('aria-describedby')).toBe(false);
  });

  it('con un motivo no dispara el (click) del consumidor ni envía el formulario', async () => {
    host.reason.set('Sin cambios');
    await fixture.whenStable();
    button().click();
    expect(host.clicks).toBe(0);
    expect(host.submitted).toBe(0);
  });

  it('sin motivo ni carga, el click llega al consumidor y envía el formulario', () => {
    button().click();
    expect(host.clicks).toBe(1);
    expect(host.submitted).toBe(1);
  });

  it('un enlace con motivo no navega (el evento queda cancelado) y sigue siendo enfocable', async () => {
    host.linkReason.set('Aún no hay casos');
    await fixture.whenStable();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(link().getAttribute('href')).toBe('/destino');
    expect(link().getAttribute('aria-disabled')).toBe('true');
    expect(link().classList).toContain('ui-button--ghost');
  });

  it('cargando: aria-busy al instante, sin doble envío, y el indicador ocupa el lugar del icono pasados 150 ms', () => {
    vi.useFakeTimers();
    try {
      button().focus();
      host.loading.set(true);
      fixture.detectChanges();
      expect(button().getAttribute('aria-busy')).toBe('true');
      button().click();
      expect(host.clicks).toBe(0);
      expect(host.submitted).toBe(0);
      expect(button().querySelector('ui-spinner')).toBeNull();

      vi.advanceTimersByTime(UI_BUTTON_SPINNER_DELAY_MS - 1);
      fixture.detectChanges();
      expect(button().querySelector('ui-spinner')).toBeNull();

      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      const slot = button().querySelector('.ui-button__icon-slot')!;
      expect(slot.querySelector('ui-spinner')).not.toBeNull();
      expect(slot.querySelector('mat-icon')).toBeNull();
      expect(button().querySelector('.ui-button__label')?.textContent).toContain('Guardar');
      expect(document.activeElement).toBe(button());
    } finally {
      vi.useRealTimers();
    }
  });

  it('cargando sin icono: el indicador se superpone y el texto conserva su sitio (ancho estable)', () => {
    vi.useFakeTimers();
    try {
      host.icon.set(undefined);
      host.loading.set(true);
      fixture.detectChanges();
      vi.advanceTimersByTime(UI_BUTTON_SPINNER_DELAY_MS);
      fixture.detectChanges();
      expect(button().querySelector('ui-spinner')?.classList).toContain('ui-button__spinner--overlay');
      expect(button().classList).toContain('ui-button--spinner-overlay');
      expect(button().querySelector('.ui-button__label')?.textContent).toContain('Guardar');
    } finally {
      vi.useRealTimers();
    }
  });

  it('una carga que termina antes de 150 ms nunca muestra el indicador', () => {
    vi.useFakeTimers();
    try {
      host.loading.set(true);
      fixture.detectChanges();
      vi.advanceTimersByTime(100);
      host.loading.set(false);
      fixture.detectChanges();
      vi.advanceTimersByTime(200);
      fixture.detectChanges();
      expect(button().querySelector('ui-spinner')).toBeNull();
      expect(button().hasAttribute('aria-busy')).toBe(false);
      button().click();
      expect(host.clicks).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Revisión de F2-6: el motivo se SUMA a aria-describedby; no borra otras descripciones (uiTooltip, ayudas propias).
@Component({
  imports: [UiButton],
  template: `<p id="ayuda-externa">Se guarda en tu perfil.</p>
    <button ui-button type="button" aria-describedby="ayuda-externa" [disabledReason]="reason()">Guardar</button>`,
})
class DescribedHost {
  reason = signal<string | null>(null);
}

describe('ui-button con otras descripciones', () => {
  it('conserva las descripciones ajenas y suma o quita la del motivo', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(DescribedHost);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    const ids = () => (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids()).toEqual(['ayuda-externa']);
    fixture.componentInstance.reason.set('Sin cambios');
    await fixture.whenStable();
    expect(ids()).toContain('ayuda-externa');
    expect(ids().length).toBe(2);
    fixture.componentInstance.reason.set(null);
    await fixture.whenStable();
    expect(ids()).toEqual(['ayuda-externa']);
  });
});

// Revisión de F2 (I1): el motivo también se ve al PULSAR (clic rápido o toque, donde no hay hover) y se anuncia.
@Component({
  imports: [UiButton],
  template: `<button ui-button type="button" [loading]="loading()" [disabledReason]="reason()">Publicar</button>
    <p class="fuera">Otro sitio</p>`,
})
class BlockedHost {
  reason = signal<string | null>('Completa al menos una escena');
  loading = signal(false);
}

describe('ui-button bloqueado al pulsar', () => {
  let fixture: ComponentFixture<BlockedHost>;
  let announce: ReturnType<typeof vi.fn>;
  const button = () => (fixture.nativeElement as HTMLElement).querySelector('button')!;
  const tooltip = () => document.querySelector('.ui-tooltip');

  beforeEach(() => {
    vi.useFakeTimers();
    announce = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    fixture = TestBed.createComponent(BlockedHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
    vi.useRealTimers();
  });

  it('un clic sin pasar antes el ratón muestra el motivo al instante y lo anuncia', () => {
    button().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1, detail: 1 }));
    button().click();
    expect(tooltip()?.textContent?.trim()).toBe('Completa al menos una escena');
    expect(announce).toHaveBeenCalledWith('Completa al menos una escena', 'polite');
  });

  it('con un toque también, y se va solo a los pocos segundos o al tocar fuera', () => {
    button().dispatchEvent(new Event('touchstart', { bubbles: true }));
    button().click();
    expect(tooltip()?.textContent?.trim()).toBe('Completa al menos una escena');
    vi.advanceTimersByTime(UI_TOOLTIP_TAP_VISIBLE_MS + 200);
    expect(tooltip()).toBeNull();

    button().click();
    expect(tooltip()).not.toBeNull();
    (fixture.nativeElement as HTMLElement).querySelector('.fuera')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(tooltip()).toBeNull();
  });

  it('cargando (sin motivo) no muestra globo ni anuncia al pulsar', () => {
    fixture.componentInstance.reason.set(null);
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    button().click();
    expect(tooltip()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });
});
