import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiCheck, UiSwitch } from './ui-check';

/**
 * ui-check y uiSwitch (plan visual F2-2): casillas, opciones e interruptores NATIVOS. La etiqueta envuelve al control
 * (toda la fila es el objetivo de 44 px y el nombre accesible es el texto); el interruptor es una casilla con
 * role="switch", así conserva el teclado (Espacio) y el estado nativos.
 */
// req: RNF-004 (controles con nombre y estado)
@Component({
  imports: [UiCheck, UiSwitch],
  template: `
    <label ui-check><input type="checkbox" name="acepto" /> Acepto las condiciones</label>
    <label ui-check><input type="radio" name="modo" value="guiado" /> Guiado</label>
    <label ui-check><input type="checkbox" uiSwitch name="sonido" /> Sonido</label>
  `,
})
class Host {}

describe('ui-check y uiSwitch', () => {
  const render = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>('label[ui-check]')];
  };

  it('la etiqueta envuelve al control nativo y su texto es el nombre', async () => {
    const [check, radio] = await render();
    expect(check.classList).toContain('ui-check');
    const box = check.querySelector('input')!;
    expect(box.type).toBe('checkbox');
    expect(box.labels?.[0]).toBe(check);
    expect(check.textContent?.trim()).toBe('Acepto las condiciones');
    expect(radio.querySelector('input')!.type).toBe('radio');
  });

  it('pulsar el texto marca la casilla (toda la fila es el objetivo)', async () => {
    const [check] = await render();
    check.querySelector<HTMLElement>('.ui-check__label')!.click();
    expect(check.querySelector('input')!.checked).toBe(true);
  });

  it('el interruptor es una casilla con role="switch" y estado nativo', async () => {
    const [, , row] = await render();
    const toggle = row.querySelector('input')!;
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.classList).toContain('ui-switch');
    expect(toggle.type).toBe('checkbox');
    toggle.click();
    expect(toggle.checked).toBe(true);
  });
});
