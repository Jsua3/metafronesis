import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiSegmentado, UiSegmento } from './ui-segmentado';

/**
 * ui-segmentado (DISENO C5): grupo de opciones con una sola parada de Tab. Las flechas eligen y mueven el foco (y dan
 * la vuelta), Inicio y Fin van a los extremos, el clic elige; la cuenta se escribe como texto.
 */
// req: RNF-004 (teclado del patrón radiogroup del APG)
@Component({
  imports: [UiSegmentado],
  template: `<ui-segmentado etiqueta="Estado del caso" [opciones]="opciones" [(valor)]="valor" />`,
})
class Host {
  readonly opciones: UiSegmento[] = [
    { valor: 'todos', etiqueta: 'Todos', cuenta: 6 },
    { valor: 'sin-empezar', etiqueta: 'Sin empezar', cuenta: 2 },
    { valor: 'en-curso', etiqueta: 'En curso', cuenta: 1 },
    { valor: 'terminados', etiqueta: 'Terminados' },
  ];
  readonly valor = signal('todos');
}

describe('ui-segmentado', () => {
  let fixture: ComponentFixture<Host>;
  const radios = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const pulsar = async (tecla: string) => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('es un grupo de opciones con nombre, la elegida marcada y una sola parada de Tab', () => {
    const grupo = (fixture.nativeElement as HTMLElement).querySelector('[role="radiogroup"]')!;
    expect(grupo.getAttribute('aria-label')).toBe('Estado del caso');
    expect(radios().map(radio => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(radios().map(radio => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
  });

  it('escribe la cuenta como texto junto a la etiqueta', () => {
    expect(radios()[1].textContent?.replace(/\s+/g, ' ').trim()).toBe('Sin empezar · 2');
    expect(radios()[3].textContent?.trim()).toBe('Terminados');
  });

  it('el clic elige y actualiza el modelo', async () => {
    radios()[2].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.valor()).toBe('en-curso');
    expect(radios()[2].getAttribute('aria-checked')).toBe('true');
    expect(radios()[2].getAttribute('tabindex')).toBe('0');
  });

  it('las flechas eligen la vecina, dan la vuelta y llevan el foco; Inicio y Fin van a los extremos', async () => {
    radios()[0].focus();
    await pulsar('ArrowRight');
    expect(fixture.componentInstance.valor()).toBe('sin-empezar');
    expect(document.activeElement).toBe(radios()[1]);
    await pulsar('ArrowLeft');
    await pulsar('ArrowLeft');
    expect(fixture.componentInstance.valor()).toBe('terminados');
    expect(document.activeElement).toBe(radios()[3]);
    await pulsar('Home');
    expect(fixture.componentInstance.valor()).toBe('todos');
    await pulsar('End');
    expect(fixture.componentInstance.valor()).toBe('terminados');
  });

  it('si el valor no está entre las opciones, la primera recibe el Tab', async () => {
    fixture.componentInstance.valor.set('archivados');
    await fixture.whenStable();
    expect(radios().map(radio => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    expect(radios().every(radio => radio.getAttribute('aria-checked') === 'false')).toBe(true);
  });
});

// el indicador se vuelve a medir cuando cambia el ancho de una OPCIÓN (una cuenta que crece, una
// fuente que carga), no solo el de la pista.
describe('ui-segmentado · observa la pista y cada opción', () => {
  const real = globalThis.ResizeObserver;
  const observados: Element[] = [];

  beforeEach(() => {
    observados.length = 0;
    globalThis.ResizeObserver = class {
      observe(elemento: Element) { observados.push(elemento); }
      unobserve() { /* sin uso en la prueba */ }
      disconnect() { /* sin uso en la prueba */ }
    } as unknown as typeof ResizeObserver;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => (globalThis.ResizeObserver = real));

  it('observa la pista y los cuatro segmentos', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;
    expect(observados).toContain(raiz.querySelector('.ui-segmentado__pista'));
    for (const radio of raiz.querySelectorAll('[role="radio"]')) expect(observados).toContain(radio);
  });
});
