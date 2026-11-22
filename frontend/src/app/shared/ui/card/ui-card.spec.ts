import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiCard } from './ui-card';

/**
 * ui-card (plan visual F2-3; §2.6): una tarjeta inerte es solo superficie; una tarjeta clicable es un `<a>` o un
 * `<button>` de verdad (foco, teclado y lector correctos), con cursor de mano y respuesta al presionar. Nunca un
 * `div` con (click).
 */
// req: RNF-004 (lo clicable es un control nativo con nombre)
@Component({
  imports: [UiCard],
  template: `
    <ui-card><p>Resumen del grupo</p></ui-card>
    <a ui-card href="/portal/casos/3"><h3>Caso 3</h3><p>Crisis en urgencias</p></a>
    <button ui-card type="button" (click)="opened = opened + 1">Abrir intento</button>
  `,
})
class Host {
  opened = 0;
}

describe('ui-card', () => {
  const render = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { host: fixture.componentInstance, cards: [...root.querySelectorAll<HTMLElement>('.ui-card')] };
  };

  it('la tarjeta inerte no es interactiva: sin rol, sin tabindex y sin la clase de clicable', async () => {
    const { cards: [inert] } = await render();
    expect(inert.tagName).toBe('UI-CARD');
    expect(inert.hasAttribute('role')).toBe(false);
    expect(inert.hasAttribute('tabindex')).toBe(false);
    expect(inert.classList).not.toContain('ui-card--interactive');
  });

  it('como enlace conserva el href y se marca clicable', async () => {
    const { cards: [, link] } = await render();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/portal/casos/3');
    expect(link.classList).toContain('ui-card--interactive');
  });

  it('como botón es un botón nativo que responde al clic', async () => {
    const { host, cards: [, , button] } = await render();
    expect(button.tagName).toBe('BUTTON');
    expect(button.classList).toContain('ui-card--interactive');
    button.click();
    expect(host.opened).toBe(1);
  });

  // req: DISENO C2 (superficies opaca, hundida y tinte)
  it('la superficie es opaca por defecto y se elige con `superficie`', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiCard);
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;
    expect(card.classList).toContain('ui-card--opaca');
    for (const superficie of ['hundida', 'tinte'] as const) {
      fixture.componentRef.setInput('superficie', superficie);
      await fixture.whenStable();
      expect(card.classList).toContain(`ui-card--${superficie}`);
      expect(card.classList).not.toContain('ui-card--opaca');
    }
  });
});
