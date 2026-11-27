import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DRAFT_COPY } from './draft-copy';
import { WorldPlacesListComponent } from './world-places-list.component';
import type { PlaceCandidate } from './world-places.util';

/**
 * «Ir a…» (plan visual F6-11; VD-19): la lista de personas y puertas de la sala y de lo ya examinado, para llegar a
 * ellas sin mirar el lienzo ni usar el ratón. Modal (el resto del juego queda inerte), con SU «Salida segura» (un solo
 * botón operable, REGLA-004) y Esc que la cierra sin llegar a la cadena de pausa.
 */

type InputSignalNodeLike<T> = { applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void };

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

const PLACES: PlaceCandidate[] = [
  { key: 'npc:enfermera', label: 'Enfermera de urgencias', kind: 'person' },
  { key: 'npc:familia', label: 'Familia en crisis', kind: 'person' },
  { key: 'puerta-sala-escucha', label: 'Sala de escucha familiar', kind: 'door' },
  { key: 'historia-clinica', label: 'Historia clínica', kind: 'object' },
];

describe('WorldPlacesListComponent', () => {
  let fixture: ComponentFixture<WorldPlacesListComponent>;
  let component: WorldPlacesListComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const items = () => Array.from(host().querySelectorAll<HTMLButtonElement>('.places__item'));
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function mount(places: PlaceCandidate[] = PLACES): void {
    TestBed.configureTestingModule({ imports: [WorldPlacesListComponent] });
    fixture = TestBed.createComponent(WorldPlacesListComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.places, places);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  // req: BLOQUE-H H-06, RNF-04 (VD-19)
  it('es un diálogo modal con nombre «Ir a…»', () => {
    mount();
    const dialog = host().querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby')!;
    expect(text(host().querySelector('#' + labelId))).toBe(DRAFT_COPY.placesDialog.title);
  });

  it('lista cada lugar con su tipo y en el orden recibido', () => {
    mount();
    expect(items().map(item => text(item))).toEqual([
      'Hablar con Enfermera de urgencias Opcional: puede servirte más adelante',
      'Hablar con Familia en crisis Opcional: puede servirte más adelante',
      'Pasar a Sala de escucha familiar Opcional: puede servirte más adelante',
      'Ir a Historia clínica Opcional: puede servirte más adelante',
    ]);
  });

  it('nombra la caminata a una puerta sin duplicar el verbo de la etiqueta', () => {
    mount([{ key: 'puerta', label: 'Pasar a la sala de espera', kind: 'door' }]);
    expect(text(items()[0])).toContain('Pasar a la sala de espera');
    expect(text(items()[0])).not.toContain('Ir a Pasar');
  });

  it('conserva los botones al recibir listas equivalentes', () => {
    mount();
    const initial = items();
    const observer = new MutationObserver(() => {});
    observer.observe(host().querySelector('.places__list')!, { childList: true, subtree: true });
    for (let i = 0; i < 10; i++) {
      writeInputSignal(component.places, PLACES.map(p => ({ ...p })));
      fixture.detectChanges();
    }
    expect(items().every((button, i) => button === initial[i])).toBe(true);
    expect(observer.takeRecords().flatMap(r => Array.from(r.removedNodes)).filter(n => n instanceof Element && (n.matches('button') || n.querySelector('button')))).toHaveLength(0);
    observer.disconnect();
  });

  it('elegir un lugar lo emite', () => {
    mount();
    const chosen = vi.fn();
    component.choose.subscribe(chosen);
    items()[2].click();
    expect(chosen).toHaveBeenCalledWith(PLACES[2]);
  });

  it('el primer lugar recibe el foco al abrir', () => {
    mount();
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(document.activeElement).toBe(items()[0]);
  });

  // Bloque U1: «Cerrar» es una placa-botón u-boton (ya no UiButton), así que se localiza por su clase propia.
  it('sin lugares dice por qué en vez de quedar vacía y conserva «Cerrar» y «Salida segura»', () => {
    mount([]);
    expect(items()).toHaveLength(0);
    expect(text(host().querySelector('.places__empty'))).toBe(DRAFT_COPY.placesEmpty.text);
    expect(text(host().querySelector('.places__close'))).toBe('Cerrar');
    expect(host().querySelectorAll('app-safe-exit-button button')).toHaveLength(1);
  });

  it('lleva SU «Salida segura»: un solo botón operable, que reenvía la pausa', () => {
    mount();
    const buttons = host().querySelectorAll('app-safe-exit-button button');
    expect(buttons).toHaveLength(1);
    expect(text(buttons[0])).toContain('Salida segura');
    // La tecla Esc no se promete: aquí Esc cierra la lista (la pausa es solo con ratón o con un segundo Esc).
    expect(host().querySelector('app-safe-exit-button')?.hasAttribute('data-hide-key')).toBe(true);
  });

  it('Esc la cierra y consume la pulsación: no llega a la cadena que pausa el caso', () => {
    mount();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('«Cerrar» la cierra', () => {
    mount();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    host().querySelector<HTMLButtonElement>('.places__close')!.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('WorldPlacesListComponent: el siguiente paso (P9)', () => {
  it('el lugar del siguiente paso lleva la etiqueta «Siguiente paso» en texto y va primero', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [WorldPlacesListComponent] });
    const fixture = TestBed.createComponent(WorldPlacesListComponent);
    writeInputSignal(fixture.componentInstance.places, [{ ...PLACES[1], siguiente: true }, PLACES[0]] as PlaceCandidate[]);
    fixture.detectChanges();
    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.places__item'));
    expect(items[0].textContent).toContain(PLACES[1].label);
    expect(items[0].querySelector('[data-places-next]')!.textContent!.trim()).toBe('Siguiente paso');
    expect(items[1].querySelector('[data-places-next]')).toBeNull();
  });
});
