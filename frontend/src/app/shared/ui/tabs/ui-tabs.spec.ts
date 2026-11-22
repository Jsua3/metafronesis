import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiTab, UiTabs } from './ui-tabs';

/**
 * ui-tabs (plan visual F2-6, sobre @angular/aria): una sola parada de tabulación en la lista; flechas, Inicio y
 * Fin mueven foco y selección; cada panel se nombra por su pestaña y los ocultos quedan inertes. La selección es
 * de doble vía.
 */
// req: RNF-004 (pestañas operables con teclado)
@Component({
  imports: [UiTabs, UiTab],
  template: `
    <ui-tabs label="Secciones del caso" [(selected)]="selected">
      <ng-template uiTab="resumen" label="Resumen"><p class="contenido">Resumen del caso</p></ng-template>
      <ng-template uiTab="escenas" label="Escenas"><p class="contenido">Lista de escenas</p></ng-template>
      <ng-template uiTab="intentos" label="Intentos"><p class="contenido">Intentos del grupo</p></ng-template>
    </ui-tabs>
  `,
})
class Host {
  selected = signal<string | undefined>('resumen');
}

describe('ui-tabs', () => {
  let fixture: ComponentFixture<Host>;
  const root = () => fixture.nativeElement as HTMLElement;
  const tabs = () => [...root().querySelectorAll<HTMLElement>('[role="tab"]')];
  const panels = () => [...root().querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  const key = async (target: Element, name: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => root().remove());

  it('lista nombrada, pestañas con su texto y UNA sola parada de tabulación (la seleccionada)', () => {
    expect(root().querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Secciones del caso');
    expect(tabs().map(tab => tab.textContent?.trim())).toEqual(['Resumen', 'Escenas', 'Intentos']);
    expect(tabs().map(tab => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('cada panel se nombra por su pestaña; solo el seleccionado está vivo', () => {
    const [first, second] = panels();
    expect(first.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    expect(first.hasAttribute('inert')).toBe(false);
    expect(second.hasAttribute('inert')).toBe(true);
    expect(first.textContent).toContain('Resumen del caso');
  });

  it('las flechas, Inicio y Fin mueven foco y selección, y la selección sale por el modelo', async () => {
    tabs()[0].focus();
    await key(tabs()[0], 'ArrowRight');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.componentInstance.selected()).toBe('escenas');
    expect(tabs().map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);

    await key(tabs()[1], 'End');
    expect(document.activeElement).toBe(tabs()[2]);
    expect(panels()[2].textContent).toContain('Intentos del grupo');
    await key(tabs()[2], 'Home');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('cambiar el modelo desde fuera cambia la pestaña', async () => {
    fixture.componentInstance.selected.set('intentos');
    await fixture.whenStable();
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    expect(panels()[2].hasAttribute('inert')).toBe(false);
  });
});
