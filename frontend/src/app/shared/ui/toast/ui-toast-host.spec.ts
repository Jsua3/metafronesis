import { readFileSync } from 'fs';
import { join } from 'path';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { MAX_NOTIFICATIONS, NotificationService } from '../../../core/notifications/notification.service';
import { TemaService } from '../../../core/tema/tema.service';
import { UiToastHost } from './ui-toast-host';

/**
 * ui-toast-host (plan visual §2.5 y §2.7, F2-7): pinta los avisos de NotificationService con el lenguaje visual. El
 * servicio ya limita a 4, deduplica y deja los errores hasta que se cierran; el anfitrión NO roba el foco, anuncia
 * cada aviso una vez por las regiones vivas persistentes de la app (`LiveRegionAnnouncer`; los errores en modo
 * assertive: un role="alert" dentro de la app queda oculto cuando hay un diálogo abierto), vive en la capa superior y
 * pausa el cierre con el puntero o el foco.
 */
// req: RNF-004 (mensajes de estado anunciados sin mover el foco, WCAG 4.1.3)
describe('ui-toast-host', () => {
  let fixture: ComponentFixture<UiToastHost>;
  let service: NotificationService;
  let announce: ReturnType<typeof vi.fn>;
  const root = () => fixture.nativeElement as HTMLElement;
  const toasts = () => [...root().querySelectorAll<HTMLElement>('.ui-toast')];

  beforeEach(() => {
    vi.useFakeTimers();
    announce = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    service = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(UiToastHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    root().remove();
    vi.useRealTimers();
  });

  it('es una región con nombre y pinta cada aviso con su tono', () => {
    service.success('Guardado');
    service.warning('Tu sesión vence en 5 minutos');
    fixture.detectChanges();
    expect(root().querySelector('section')?.getAttribute('aria-label')).toBe('Mensajes del sistema');
    expect(toasts().map(toast => toast.querySelector('.ui-toast__text')?.textContent?.trim()))
      .toEqual(['Guardado', 'Tu sesión vence en 5 minutos']);
    expect(toasts()[0].classList).toContain('ui-toast--success');
  });

  it('no roba el foco al aparecer', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    service.error('No se pudo guardar');
    fixture.detectChanges();
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('los errores se anuncian en modo assertive y no se van solos; los demás, una vez y con cortesía', () => {
    service.error('No se pudo guardar');
    service.success('Guardado');
    fixture.detectChanges();
    expect(toasts().every(toast => !toast.hasAttribute('role'))).toBe(true);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith('No se pudo guardar', 'assertive');
    expect(announce).toHaveBeenCalledWith('Guardado', 'polite');
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(toasts().map(toast => toast.querySelector('.ui-toast__text')?.textContent?.trim())).toEqual(['No se pudo guardar']);
  });

  it('el puntero encima pausa el cierre automático; al salir, sigue', () => {
    service.success('Guardado');
    fixture.detectChanges();
    toasts()[0].dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();
    expect(toasts().length).toBe(1);
    toasts()[0].dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();
    expect(toasts().length).toBe(0);
  });

  it('el botón de cerrar es un ui-icon-button con nombre y quita el aviso', () => {
    service.error('No se pudo guardar');
    fixture.detectChanges();
    const close = toasts()[0].querySelector<HTMLButtonElement>('button[ui-icon-button]')!;
    expect(close.getAttribute('aria-label')).toBe('Cerrar aviso');
    close.click();
    fixture.detectChanges();
    expect(toasts().length).toBe(0);
  });

  it('nunca más de cuatro a la vez (lo garantiza el servicio)', () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 2; i++) service.info(`Aviso ${i}`);
    fixture.detectChanges();
    expect(toasts().length).toBe(MAX_NOTIFICATIONS);
  });

  // Garantías del anfitrión heredado (`app-notification-host`, retirado en F6-1) que pasan a este componente.
  describe('anuncio a lectores de pantalla', () => {
    it('info y advertencia se anuncian con cortesía, una vez cada una', () => {
      service.info('Aviso informativo');
      service.warning('Cuidado');
      fixture.detectChanges();
      expect(announce.mock.calls).toEqual([
        ['Aviso informativo', 'polite'],
        ['Cuidado', 'polite'],
      ]);
    });

    it('una nueva emisión no vuelve a anunciar los avisos que ya estaban', () => {
      service.success('Guardado');
      fixture.detectChanges();
      announce.mockClear();
      service.info('Otro');
      service.error('Falló');
      fixture.detectChanges();
      expect(announce.mock.calls).toEqual([
        ['Otro', 'polite'],
        ['Falló', 'assertive'],
      ]);
    });

    it('cerrar un aviso no dispara ningún anuncio', () => {
      service.success('Guardado');
      fixture.detectChanges();
      announce.mockClear();
      toasts()[0].querySelector<HTMLButtonElement>('button')!.click();
      fixture.detectChanges();
      expect(announce).not.toHaveBeenCalled();
    });
  });

  it('pausa con el puntero o el foco y reanuda al salir', () => {
    service.info('Hola');
    fixture.detectChanges();
    const pause = vi.spyOn(service, 'pause');
    const resume = vi.spyOn(service, 'resume');
    const item = toasts()[0];
    item.dispatchEvent(new MouseEvent('mouseenter'));
    item.dispatchEvent(new MouseEvent('mouseleave'));
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(pause).toHaveBeenCalledTimes(2);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  describe('la pausa es un booleano en el servicio: no se reanuda mientras quede puntero o foco', () => {
    it('al salir el foco no reanuda si el puntero sigue encima', () => {
      service.info('Hola');
      fixture.detectChanges();
      const resume = vi.spyOn(service, 'resume');
      const item = toasts()[0];

      // jsdom no calcula :hover, así que se simula que el puntero sigue sobre el aviso.
      const matches = item.matches.bind(item);
      const matchesSpy = vi.spyOn(item, 'matches').mockImplementation(selector =>
        selector === ':hover' ? true : matches(selector),
      );
      item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(resume).not.toHaveBeenCalled();

      matchesSpy.mockRestore();
      item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(resume).toHaveBeenCalledTimes(1);
    });

    it('al mover el foco a otro punto del mismo aviso no reanuda', () => {
      service.info('Hola');
      fixture.detectChanges();
      const resume = vi.spyOn(service, 'resume');
      const item = toasts()[0];
      const button = item.querySelector('button') as HTMLButtonElement;

      item.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
      expect(resume).not.toHaveBeenCalled();
    });
  });

  it('la colocación del juego es una clase del anfitrión (arriba a la izquierda), no otro componente', () => {
    fixture.componentRef.setInput('placement', 'game');
    fixture.detectChanges();
    expect(root().classList).toContain('ui-toast-host--game');
    fixture.componentRef.setInput('placement', 'portal');
    fixture.detectChanges();
    expect(root().classList).not.toContain('ui-toast-host--game');
  });

  // req: DP-24 (los avisos llevan la piel de donde se muestran; nunca en body: REGLA-010)
  it('la piel va en el anfitrión: en el juego siempre oscura; en el portal, la del tema', () => {
    const tema = TestBed.inject(TemaService);
    tema.fijar('claro');
    fixture.detectChanges();
    expect(root().getAttribute('data-skin')).toBe('portal');
    tema.fijar('oscuro');
    fixture.detectChanges();
    expect(root().getAttribute('data-skin')).toBe('game');
    tema.fijar('claro');
    fixture.componentRef.setInput('placement', 'game');
    fixture.detectChanges();
    expect(root().getAttribute('data-skin')).toBe('game');
    expect(document.body.hasAttribute('data-skin')).toBe(false);
    tema.fijar('sistema');
  });

  // req: REGLA-004 (revisión de F6: cuatro avisos persistentes a 844×390 llegaban al pie y tapaban «Salida segura»)
  it('en el juego solo se ven los dos avisos más recientes: la pila no llega al pie de «Salida segura»', () => {
    const scss = readFileSync(join(__dirname, 'ui-toast-host.scss'), 'utf-8');
    expect(scss).toMatch(/:host\(\.ui-toast-host--game\) \.ui-toast:nth-last-child\(n \+ 3\) \{\s*display: none;\s*\}/);
  });
});

describe('ui-toast-host: capa superior y retorno del foco (revisión de F2, I7)', () => {
  let fixture: ComponentFixture<UiToastHost>;
  let service: NotificationService;
  const shown: string[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const original = { show: proto['showPopover'], hide: proto['hidePopover'] };

  beforeEach(() => {
    shown.length = 0;
    proto['showPopover'] = function (this: HTMLElement) { shown.push('show'); this.dataset['open'] = 'true'; };
    proto['hidePopover'] = function (this: HTMLElement) { shown.push('hide'); delete this.dataset['open']; };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } }],
    });
    service = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(UiToastHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
    proto['showPopover'] = original.show;
    proto['hidePopover'] = original.hide;
  });

  it('la región es un popover que se muestra con el primer aviso y se oculta con el último', async () => {
    const region = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ui-toast-host__region')!;
    expect(region.getAttribute('popover')).toBe('manual');
    service.error('No se pudo guardar');
    await fixture.whenStable();
    expect(region.dataset['open']).toBe('true');
    service.clear();
    await fixture.whenStable();
    expect(region.dataset['open']).toBeUndefined();
  });

  it('al salir el puntero no reanuda si el foco sigue dentro del aviso (y reanuda al perder el foco)', async () => {
    service.info('Hola');
    await fixture.whenStable();
    const resume = vi.spyOn(service, 'resume');
    const item = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ui-toast')!;
    const button = item.querySelector('button') as HTMLButtonElement;

    // jsdom no mueve el foco dentro de una región que no está abierta en la capa superior: se simula que lo tiene.
    const focused = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(button);
    item.dispatchEvent(new MouseEvent('mouseenter'));
    item.dispatchEvent(new MouseEvent('mouseleave'));
    expect(resume).not.toHaveBeenCalled();

    // Al perder el foco (el puntero ya salió) sí se reanuda, una sola vez.
    focused.mockRestore();
    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('cerrar un aviso con el teclado devuelve el foco a donde estaba', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    service.error('No se pudo guardar');
    await fixture.whenStable();
    const close = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ui-toast button')!;
    close.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: before }));
    close.focus();
    close.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(before);
    before.remove();
  });
});
