import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiPageActions, UiPageHeader } from './ui-page-header';

/**
 * ui-page-header (plan visual F2-3 y contrato F3 → F4…F8): la cabecera de cada pantalla y su ÚNICO h1. El antetítulo
 * y la descripción son párrafos (no títulos); las acciones van al final, en el orden en que se declaran.
 */
// req: RNF-004 (un único h1 por pantalla, §2.9)
@Component({
  imports: [UiPageHeader, UiPageActions],
  template: `
    <ui-page-header eyebrow="Docencia" title="Grupos" description="Crea grupos y comparte su código con tus estudiantes.">
      <button uiPageActions type="button">Nuevo grupo</button>
    </ui-page-header>
  `,
})
class Host {}

describe('ui-page-header', () => {
  it('pinta un único h1 con el título y deja antetítulo y descripción como párrafos', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('ui-page-header')!;
    const headings = header.querySelectorAll('h1, h2, h3, h4, h5, h6');
    expect(headings.length).toBe(1);
    expect(headings[0].tagName).toBe('H1');
    expect(headings[0].textContent?.trim()).toBe('Grupos');
    expect(header.querySelector('p.ui-page-header__eyebrow')?.textContent?.trim()).toBe('Docencia');
    expect(header.querySelector('p.ui-page-header__description')?.textContent?.trim()).toBe('Crea grupos y comparte su código con tus estudiantes.');
    expect(header.querySelector('.ui-page-header__actions button')?.textContent?.trim()).toBe('Nuevo grupo');
    expect(header.hasAttribute('title')).toBe(false);
  });

  it('sin antetítulo ni descripción no deja párrafos vacíos', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiPageHeader);
    fixture.componentRef.setInput('title', 'Reportes');
    await fixture.whenStable();
    const header = fixture.nativeElement as HTMLElement;
    expect(header.querySelectorAll('p').length).toBe(0);
    expect(header.querySelector('h1')?.textContent?.trim()).toBe('Reportes');
  });

  // req: DISENO C1 (enlace de regreso en las pantallas que cuelgan de otra; firma decorativa)
  it('con volverA pinta un enlace de regreso que dice adónde vuelve, y la firma de la marca es decorativa', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const fixture = TestBed.createComponent(UiPageHeader);
    fixture.componentRef.setInput('title', 'Grupo PSI-2026-1');
    fixture.componentRef.setInput('eyebrow', 'Docencia');
    fixture.componentRef.setInput('volverA', '/portal/grupos');
    fixture.componentRef.setInput('volverEtiqueta', 'Tus grupos');
    await fixture.whenStable();
    const header = fixture.nativeElement as HTMLElement;
    const volver = header.querySelector<HTMLAnchorElement>('a.ui-page-header__volver')!;
    expect(volver.getAttribute('href')).toBe('/portal/grupos');
    expect(volver.textContent?.replace('arrow_back', '').trim()).toBe('Tus grupos');
    expect(volver.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
    // El regreso va antes del título, y sigue habiendo un solo h1.
    expect(volver.compareDocumentPosition(header.querySelector('h1')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.querySelectorAll('h1')).toHaveLength(1);
    const firma = header.querySelector('.ui-page-header__eyebrow .ui-page-header__firma')!;
    expect(firma.getAttribute('aria-hidden')).toBe('true');
    expect(header.querySelector('.ui-page-header__eyebrow')?.textContent?.trim()).toBe('Docencia');
  });

  it('sin volverA no hay enlace de regreso (ni hace falta el router)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiPageHeader);
    fixture.componentRef.setInput('title', 'Casos');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('a')).toBeNull();
  });
});
