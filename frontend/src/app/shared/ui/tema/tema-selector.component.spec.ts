import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemaService } from '../../../core/tema/tema.service';
import { TemaSelectorComponent } from './tema-selector.component';

/**
 * Selector de tema (pedido del usuario, 2026-11-20): una cápsula que se expande al pasar el ratón con Claro · Oscuro ·
 * Automático. Aquí se prueba el comportamiento: grupo de radios con tabindex itinerante, el primer toque abre (con dedo
 * no hay hover), abierto el toque elige, las flechas cambian y Escape pliega; y que no deja estilos en línea.
 */
describe('TemaSelectorComponent', () => {
  let fixture: ComponentFixture<TemaSelectorComponent>;
  let tema: TemaService;
  const host = () => fixture.nativeElement as HTMLElement;
  const radios = () => [...host().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const marcadas = () => radios().map(r => r.getAttribute('aria-checked'));
  const comp = () => fixture.componentInstance;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    tema = TestBed.inject(TemaService);
    tema.fijar('sistema');
    fixture = TestBed.createComponent(TemaSelectorComponent);
    await fixture.whenStable();
  });

  afterEach(() => tema.fijar('sistema'));

  it('es un grupo de radios con nombre, y solo la opción elegida entra con Tab', () => {
    expect(host().querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Tema de la página');
    expect(radios().map(r => r.getAttribute('aria-label'))).toEqual(['Claro', 'Oscuro', 'Automático']);
    expect(marcadas()).toEqual(['false', 'false', 'true']);
    expect(radios().map(r => r.tabIndex)).toEqual([-1, -1, 0]);
    expect(host().getAttribute('data-fijo')).toBe('2');
  });

  it('plegado, el primer toque abre; abierto, el toque elige y la cápsula se recoloca sobre la elegida', async () => {
    radios()[1].click();
    await fixture.whenStable();
    expect(host().classList.contains('abierto')).toBe(true);
    expect(tema.preferencia()).toBe('sistema');
    radios()[1].click();
    await fixture.whenStable();
    expect(tema.preferencia()).toBe('oscuro');
    expect(marcadas()).toEqual(['false', 'true', 'false']);
    expect(host().getAttribute('data-fijo')).toBe('2'); // abierto, el orden sigue fijado
  });

  it('con el teclado: las flechas siguen el orden que se VE (fijado al abrir) y Escape pliega', async () => {
    // Elegido «Automático» en un módulo centrado: se ve Claro · Automático · Oscuro (la elegida en medio).
    expect(comp().ordenVisual()).toEqual([0, 2, 1]);
    radios()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(tema.preferencia()).toBe('oscuro');
    expect(host().classList.contains('abierto')).toBe(true);
    // El orden no salta mientras está abierto.
    expect(host().getAttribute('data-fijo')).toBe('2');
    radios()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();
    expect(tema.preferencia()).toBe('sistema');
    radios()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(host().classList.contains('abierto')).toBe(false);
  });

  it('un toque fuera pliega la cápsula', async () => {
    radios()[2].click();
    await fixture.whenStable();
    expect(host().classList.contains('abierto')).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(host().classList.contains('abierto')).toBe(false);
  });

  it('sin recuadro propio ni rótulo con caja: cada opción tiene nombre accesible y un title corto; sin estilos en línea', () => {
    expect(host().querySelector('.rotulo')).toBeNull();
    expect(radios().map(r => r.getAttribute('title'))).toEqual(['Claro', 'Oscuro', 'Automático (como tu sistema)']);
    expect(host().hasAttribute('style')).toBe(false);
    expect(host().querySelectorAll('[style]')).toHaveLength(0);
  });

  it('al cerrar, el orden se fija sobre la nueva elegida (en medio en un módulo centrado)', async () => {
    radios()[0].click();
    await fixture.whenStable();
    radios()[0].click();
    await fixture.whenStable();
    expect(host().getAttribute('data-fijo')).toBe('2');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(host().getAttribute('data-fijo')).toBe('0');
    expect(comp().ordenVisual()).toEqual([1, 0, 2]);
    expect(host().getAttribute('data-ancla')).toBe('centro');
  });
});
