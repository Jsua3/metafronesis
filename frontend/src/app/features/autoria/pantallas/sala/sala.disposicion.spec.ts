import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { CasoStore } from '../../estado/caso.store';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { FABRICA_DE_JUEGO_DE_SALA } from './lienzo-de-sala.component';
import { SalaComponent } from './sala.component';

/**
 * E4 · Sala y plano: la disposición nueva (EDITOR.md §4.4 y §4.5). Las pruebas del lienzo (arrastre, flechas, Supr,
 * Ctrl+Z) siguen en `sala.component.spec.ts` sin cambios; aquí solo lo que cambia la presentación.
 */
async function montar(estrecha = false) {
  localStorage.clear();
  TestBed.resetTestingModule();
  // La pantalla angosta se simula con matchMedia: es lo que mira la sala para pasar a «solo mirar».
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: estrecha && consulta.includes('max-width'), media: consulta,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
  await TestBed.configureTestingModule({
    imports: [SalaComponent],
    providers: [
      { provide: CatalogoDePiezas, useValue: { manifiesto: signal(null), reglas: signal(null), error: signal(false) } },
      { provide: FABRICA_DE_JUEGO_DE_SALA, useValue: () => ({ destruir: () => {} }) },
      provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
      { provide: UiDialog, useValue: { consequence: vi.fn(async () => 'proceed') } },
    ],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(SalaComponent);
  fixture.componentRef.setInput('salaId', 'consultorio');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement };
}

const pestana = (raiz: HTMLElement) => raiz.querySelector('.panel__pestana[aria-selected="true"]')?.textContent?.trim();
const visible = (raiz: HTMLElement, id: string) => !raiz.querySelector<HTMLElement>(`#${id}`)!.hidden;

describe('E4 · la sala: el lienzo manda', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('CU-sala · al elegir algo en la sala, «Detalles» queda a la vista sin buscarlo', async () => {
    const { fixture, raiz } = await montar();
    expect(pestana(raiz)).toBe('Agregar');
    expect(visible(raiz, 'panel-agregar')).toBe(true);
    raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!.click();
    fixture.detectChanges();
    expect(pestana(raiz)).toBe('Detalles');
    expect(visible(raiz, 'panel-detalles')).toBe(true);
    expect(visible(raiz, 'panel-agregar')).toBe(false);
    expect(raiz.querySelector('#pmueve')).not.toBeNull();
  });

  it('agregar desde el catálogo deja lo agregado elegido y el catálogo a la vista', async () => {
    const { fixture, raiz, store } = await montar();
    const antes = store.caso()!.salas[0].muebles.length;
    raiz.querySelector<HTMLButtonElement>('button[aria-label^="Agregar a la sala: "]')!.click();
    fixture.detectChanges();
    expect(store.caso()!.salas[0].muebles.length).toBe(antes + 1);
    expect(pestana(raiz)).toBe('Agregar');
    // La pestaña «Detalles» avisa con un punto que hay algo elegido.
    expect(raiz.querySelector('#pestana-detalles')!.classList).toContain('panel__pestana--aviso');
  });

  it('la cabecera tiene a lo sumo dos botones y un menú, y la nota de que los cambios valen para todas las escenas', async () => {
    const { raiz } = await montar();
    const cabecera = raiz.querySelector('.sala__cabeza')!;
    expect(cabecera.querySelectorAll('.sala__acciones > button')).toHaveLength(2);
    expect(cabecera.querySelectorAll('ui-menu')).toHaveLength(1);
    expect(cabecera.querySelector('[data-accion~="volver-sala-original"]')).not.toBeNull();
    expect(cabecera.textContent).toContain('Los cambios valen para todas las escenas que pasan en esta sala.');
  });

  it('la lista «En esta sala» tiene una sola parada de Tab y las flechas, Inicio y Fin la recorren eligiendo', async () => {
    const { fixture, raiz } = await montar();
    document.body.appendChild(raiz); // el foco solo existe en un documento
    const opciones = () => [...raiz.querySelectorAll<HTMLElement>('ul[role="listbox"] [role="option"]')];
    expect(opciones().length).toBeGreaterThan(1);
    expect(opciones().filter((o) => o.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(opciones()[0].getAttribute('tabindex')).toBe('0');
    const tecla = async (key: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    opciones()[0].focus();
    await tecla('ArrowDown');
    expect(document.activeElement).toBe(opciones()[1]);
    expect(opciones()[1].getAttribute('aria-selected')).toBe('true');
    expect(opciones()[1].getAttribute('tabindex')).toBe('0');
    expect(opciones()[0].getAttribute('tabindex')).toBe('-1');
    await tecla('End');
    expect(document.activeElement).toBe(opciones().at(-1));
    await tecla('Home');
    expect(document.activeElement).toBe(opciones()[0]);
    await tecla('ArrowUp'); // en la primera se queda
    expect(document.activeElement).toBe(opciones()[0]);
    raiz.remove();
  });

  it('las flechas recorren las pestañas del panel y el foco las acompaña', async () => {
    const { fixture, raiz } = await montar();
    document.body.appendChild(raiz);
    try {
      const lista = raiz.querySelector<HTMLElement>('.panel__pestanas')!;
      raiz.querySelector<HTMLElement>('#pestana-agregar')!.focus();
      lista.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(pestana(raiz)).toBe('Detalles');
      expect(document.activeElement).toBe(raiz.querySelector('#pestana-detalles'));
    } finally { raiz.remove(); }
  });

  describe('por debajo de 1024 px la sala es de solo mirar y lo dice', () => {
    it('lo dice una vez, quita deshacer, agregar y mover, y deja elegir', async () => {
      const { fixture, raiz } = await montar(true);
      expect(raiz.querySelector('.sala__solo-mirar')!.textContent).toContain('pantalla más ancha');
      expect(raiz.querySelector('[data-accion="deshacer"]')).toBeNull();
      expect(raiz.querySelector('.panel__pestanas')).toBeNull();
      expect(raiz.querySelector('button[aria-label^="Agregar a la sala: "]')).toBeNull();
      // El lienzo es solo una vista (inert): lo que hay se elige en «En esta sala», que muestra sus detalles.
      expect(raiz.querySelector('.escenario')!.hasAttribute('inert')).toBe(true);
      raiz.querySelector<HTMLElement>('ul[aria-label="Cosas en la sala"] li[role="option"]')!.click();
      fixture.detectChanges();
      expect(raiz.querySelector('#detalles')!.textContent).not.toContain('Nada elegido');
      expect(raiz.querySelector('.quitar')).toBeNull();
      expect(raiz.querySelector<HTMLFieldSetElement>('.detalles__campos')!.disabled).toBe(true);
    });

    it('las flechas y Supr no mueven ni quitan nada', async () => {
      const { fixture, raiz, store } = await montar(true);
      const antes = structuredClone(store.caso()!.salas[0].personajes[0]);
      const pieza = raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!;
      pieza.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      pieza.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      fixture.detectChanges();
      expect(store.caso()!.salas[0].personajes[0]).toEqual(antes);
    });
  });
});
