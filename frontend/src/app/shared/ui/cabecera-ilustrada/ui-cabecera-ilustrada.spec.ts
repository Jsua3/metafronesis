import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiCabeceraIlustrada } from './ui-cabecera-ilustrada';

/**
 * Cabecera ilustrada (ronda 3): el armazón común de los inicios de los tres roles. Un solo h1 (el de ui-page-header),
 * la viñeta del rol y los doodles limitados a la banda por su propio id.
 */
// req: RNF-04; gancho RF-01 (cada rol entra a su inicio)
describe('UiCabeceraIlustrada', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] }));

  const crear = async (extra: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(UiCabeceraIlustrada);
    fixture.componentRef.setInput('title', 'Hola, Profesora');
    for (const [k, v] of Object.entries(extra)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('un h1, la viñeta de la escena y los doodles suaves limitados a su propio id, sin luz', async () => {
    const host = await crear({ eyebrow: 'Docencia', escena: 'orientadora' });
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('ui-vineta')?.getAttribute('data-escena')).toBe('orientadora');
    const doodles = host.querySelector('app-doodles')!;
    expect(host.id).toMatch(/^cabecera-ilustrada-\d+$/);
    expect(doodles.classList).toContain('doodles--suave');
    expect(doodles.classList).toContain('doodles--borde-corto');
    expect(doodles.classList).toContain('doodles--hacia-fin');
  });

  it('dos cabeceras no comparten id; sin escena no hay viñeta; los doodles se pueden quitar', async () => {
    const a = await crear();
    const b = await crear({ doodles: false });
    expect(a.id).not.toBe(b.id);
    expect(a.querySelector('ui-vineta')).toBeNull();
    expect(b.querySelector('app-doodles')).toBeNull();
  });
});
