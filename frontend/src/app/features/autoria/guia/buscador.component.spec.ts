import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BuscadorComponent } from './buscador.component';

describe('BuscadorComponent', () => {
  it('Tab no saca el foco del diálogo: del último control vuelve al primero y Mayús+Tab al revés', async () => {
    await TestBed.configureTestingModule({ imports: [BuscadorComponent], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(BuscadorComponent);
    fixture.componentRef.setInput('modo', 'buscar');
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    fixture.detectChanges();
    const dialogo = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const foco = [...dialogo.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter((e) => !e.hasAttribute('disabled'));
    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    ultimo.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ultimo.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(primero);
    const atras = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    primero.dispatchEvent(atras);
    expect(atras.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ultimo);
    fixture.nativeElement.remove();
  });
});
