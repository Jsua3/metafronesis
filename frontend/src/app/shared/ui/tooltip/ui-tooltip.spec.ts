import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UI_TOOLTIP_HIDE_GRACE_MS, UI_TOOLTIP_SHOW_DELAY_MS, UI_TOOLTIP_WARM_MS, UiTooltip } from './ui-tooltip';

/**
 * uiTooltip (plan visual §2.6, F2-6; Review Focus 5): aparece a los 400 ms con el ratón, sin retardo si otro estuvo
 * abierto hace menos de 300 ms, al instante con el foco de TECLADO, nunca con un toque; Esc lo cierra sin mover el
 * foco (WCAG 1.4.13) y su texto se lee como descripción del disparador.
 */
// req: RNF-004 (la información del hover también llega por teclado y lector)
@Component({
  imports: [UiTooltip],
  template: `
    <button type="button" class="a" [uiTooltip]="text()">Exportar</button>
    <button type="button" class="b" uiTooltip="Descarga el reporte en PDF">Descargar</button>
    <button type="button" class="c" [uiTooltip]="null">Sin ayuda</button>
  `,
})
class Host {
  text = signal<string | null>('Exporta el grupo a CSV');
}

describe('uiTooltip', () => {
  let fixture: ComponentFixture<Host>;
  const button = (name: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`.${name}`)!;
  const tooltip = () => document.querySelector<HTMLElement>('.ui-tooltip');
  const mouse = (target: Element, type: string) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter' && type !== 'mouseleave', buttons: 1, detail: 1 }));
  const key = (target: EventTarget, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  const touch = (target: Element) => target.dispatchEvent(new Event('touchstart', { bubbles: true }));

  beforeEach(async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    vi.advanceTimersByTime(UI_TOOLTIP_WARM_MS + 50);
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
    vi.useRealTimers();
  });

  it('con el ratón aparece a los 400 ms con role="tooltip" y su texto', () => {
    mouse(button('a'), 'mouseenter');
    vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS - 1);
    expect(tooltip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tooltip()?.getAttribute('role')).toBe('tooltip');
    expect(tooltip()?.textContent?.trim()).toBe('Exporta el grupo a CSV');
  });

  // req: DP-24 (el globo vive en la capa del CDK, fuera de la piel de su disparador)
  it('el globo lleva la piel del contenedor de su disparador, y la sigue si cambia', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.setAttribute('data-skin', 'game');
    mouse(button('a'), 'mouseenter');
    vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS);
    const capa = () => tooltip()!.closest('.cdk-overlay-pane')!;
    expect(capa().getAttribute('data-skin')).toBe('game');
    mouse(button('a'), 'mouseleave');
    vi.advanceTimersByTime(UI_TOOLTIP_HIDE_GRACE_MS + 200);
    host.setAttribute('data-skin', 'portal');
    mouse(button('a'), 'mouseenter');
    vi.advanceTimersByTime(UI_TOOLTIP_WARM_MS + UI_TOOLTIP_SHOW_DELAY_MS);
    expect(capa().getAttribute('data-skin')).toBe('portal');
    expect(document.body.hasAttribute('data-skin')).toBe(false);
  });

  it('se va al salir el puntero (tras una gracia que deja pasar al globo)', () => {
    mouse(button('a'), 'mouseenter');
    vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS);
    mouse(button('a'), 'mouseleave');
    expect(tooltip()).not.toBeNull();
    vi.advanceTimersByTime(UI_TOOLTIP_HIDE_GRACE_MS + 200);
    expect(tooltip()).toBeNull();
  });

  it('pasar a un vecino antes de 300 ms lo muestra sin retardo', () => {
    mouse(button('a'), 'mouseenter');
    vi.advanceTimersByTime(UI_TOOLTIP_SHOW_DELAY_MS);
    mouse(button('a'), 'mouseleave');
    mouse(button('b'), 'mouseenter');
    vi.advanceTimersByTime(0);
    expect(tooltip()?.textContent?.trim()).toBe('Descarga el reporte en PDF');
    expect(document.querySelectorAll('.ui-tooltip').length).toBe(1);
  });

  it('con el foco de teclado aparece al instante; con un clic de ratón, no', () => {
    key(document, 'Tab');
    button('a').focus();
    expect(tooltip()?.textContent?.trim()).toBe('Exporta el grupo a CSV');
    button('a').blur();
    vi.advanceTimersByTime(UI_TOOLTIP_HIDE_GRACE_MS + 200);
    expect(tooltip()).toBeNull();

    vi.advanceTimersByTime(UI_TOOLTIP_WARM_MS + 50);
    mouse(button('b'), 'mousedown');
    button('b').focus();
    expect(tooltip()).toBeNull();
  });

  it('nunca aparece con un toque (ni por el mouseenter de compatibilidad)', () => {
    touch(button('a'));
    mouse(button('a'), 'mouseenter');
    button('a').focus();
    vi.advanceTimersByTime(1000);
    expect(tooltip()).toBeNull();
  });

  it('Esc lo cierra sin mover el foco', () => {
    key(document, 'Tab');
    button('a').focus();
    expect(tooltip()).not.toBeNull();
    key(button('a'), 'Escape');
    vi.advanceTimersByTime(200);
    expect(tooltip()).toBeNull();
    expect(document.activeElement).toBe(button('a'));
  });

  it('su texto describe al disparador (aria-describedby) y sin texto no hay globo', () => {
    const describedBy = button('b').getAttribute('aria-describedby') ?? '';
    const texts = describedBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim());
    expect(texts).toContain('Descarga el reporte en PDF');

    mouse(button('c'), 'mouseenter');
    vi.advanceTimersByTime(1000);
    expect(tooltip()).toBeNull();
  });
});
