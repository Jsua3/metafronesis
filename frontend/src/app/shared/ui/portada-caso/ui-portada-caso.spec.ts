import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PORTADA_MEDIDAS, UiPortadaCaso } from './ui-portada-caso';

/**
 * ui-portada-caso (DISENO C9): con portada pinta la imagen de la primera sala a una división entera de 960 × 528; sin
 * portada, o si la imagen falla, la puerta cerrada que espera (nunca un recuadro roto). Siempre decorativa. El nombre
 * de la transición al umbral solo va con `umbral`.
 */
// req: RNF-004 (imagen decorativa), DP-10 (transición al umbral)
describe('ui-portada-caso', () => {
  const crear = async (inputs: Record<string, unknown>) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiPortadaCaso);
    fixture.componentRef.setInput('titulo', 'Primera atención');
    for (const [clave, valor] of Object.entries(inputs)) fixture.componentRef.setInput(clave, valor);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };

  it('los tres tamaños son divisiones enteras de la imagen fuente', () => {
    for (const { ancho, alto } of Object.values(PORTADA_MEDIDAS)) {
      expect(Number.isInteger(960 / ancho)).toBe(true);
      expect(Number.isInteger(528 / alto)).toBe(true);
    }
  });

  it('con portada pinta la imagen decorativa a su medida', async () => {
    const { host } = await crear({ portada: '/media/portadas/sala-1.png', tamano: 'heroe' });
    const img = host.querySelector<HTMLImageElement>('img.ui-portada-caso__imagen')!;
    expect(img.getAttribute('src')).toBe('/media/portadas/sala-1.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('width')).toBe('480');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.classList).not.toContain('ui-portada-caso--respaldo');
  });

  it('sin portada pinta la puerta de respaldo, nunca un img sin src', async () => {
    const { host } = await crear({ portada: '  ' });
    expect(host.classList).toContain('ui-portada-caso--respaldo');
    expect(host.querySelector('img.ui-portada-caso__puerta')?.getAttribute('src')).toBe('/assets/game/doors/door_consultorio.png');
    expect([...host.querySelectorAll('img')].every(img => !!img.getAttribute('src'))).toBe(true);
  });

  it('si la imagen falla al cargar, pasa al respaldo; una portada nueva lo vuelve a intentar', async () => {
    const { fixture, host } = await crear({ portada: '/media/rota.png' });
    host.querySelector('img.ui-portada-caso__imagen')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(host.classList).toContain('ui-portada-caso--respaldo');
    fixture.componentRef.setInput('portada', '/media/otra.png');
    await fixture.whenStable();
    expect(host.querySelector('img.ui-portada-caso__imagen')?.getAttribute('src')).toBe('/media/otra.png');
  });

  it('solo con umbral lleva la clase de la transición de vistas', async () => {
    const { fixture, host } = await crear({});
    expect(host.classList).not.toContain('vt-portada');
    fixture.componentRef.setInput('umbral', true);
    await fixture.whenStable();
    expect(host.classList).toContain('vt-portada');
  });
});
