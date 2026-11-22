import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiFiguraPixel, escalaEntera, rutaFiguraKit } from './ui-figura-pixel';

/**
 * ui-figura-pixel (DISENO C8): un personaje del kit a escala entera. La ruta se compone bajo `assets/characters/kit/`
 * (y se descarta si trae algo que podría escaparse del `url()`), la escala siempre es un entero de 1 a 4 y la figura
 * es decorativa salvo que tenga nombre.
 */
// req: RNF-004 (imagen decorativa oculta al lector; con nombre si informa)
describe('ui-figura-pixel', () => {
  const crear = async (inputs: Record<string, unknown>) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiFiguraPixel);
    for (const [clave, valor] of Object.entries(inputs)) fixture.componentRef.setInput(clave, valor);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('compone la ruta del kit y la pone como variable de estilo del anfitrión', async () => {
    const host = await crear({ personaje: 'camila/bata' });
    expect(host.style.getPropertyValue('--figura')).toContain('/assets/characters/kit/camila/bata/idle.png');
    expect(rutaFiguraKit('docente-universidad')).toBe('/assets/characters/kit/docente-universidad/idle.png');
  });

  it('descarta rutas que no son de un personaje del kit', () => {
    expect(rutaFiguraKit('../../secreto')).toBeNull();
    expect(rutaFiguraKit("camila') ; background:red")).toBeNull();
    expect(rutaFiguraKit('')).toBeNull();
    expect(rutaFiguraKit('a/b/c')).toBeNull();
  });

  it('la escala siempre es entera, entre 1 y 4', async () => {
    expect([escalaEntera(2.6), escalaEntera(0), escalaEntera(9), escalaEntera('x'), escalaEntera('3')]).toEqual([3, 1, 4, 2, 3]);
    const host = await crear({ personaje: 'supervisor-clinico', escala: 2.4 });
    expect(host.classList).toContain('ui-figura-pixel--x2');
  });

  it('el fotograma se limita a las cuatro columnas del reposo', async () => {
    const host = await crear({ personaje: 'camila', fotograma: 7 });
    expect(host.style.getPropertyValue('--fotograma')).toBe('3');
  });

  it('sin etiqueta es decorativa; con etiqueta es una imagen con nombre', async () => {
    const decorativa = await crear({ personaje: 'camila' });
    expect(decorativa.getAttribute('aria-hidden')).toBe('true');
    expect(decorativa.hasAttribute('role')).toBe(false);
    TestBed.resetTestingModule();
    const conNombre = await crear({ personaje: 'camila', etiqueta: 'Camila, estudiante en práctica' });
    expect(conNombre.getAttribute('role')).toBe('img');
    expect(conNombre.getAttribute('aria-label')).toBe('Camila, estudiante en práctica');
    expect(conNombre.hasAttribute('aria-hidden')).toBe(false);
  });
});
