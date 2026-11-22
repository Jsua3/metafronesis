import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { NotFoundComponent } from './not-found.component';

/**
 * 404 (plan visual F3-6): un h1, el estado «no encontrado» del lenguaje (ui-error-state) y «Volver al panel». Dentro
 * del portal el <main> lo pone el shell; fuera, la página trae su barra pública y su propio <main id="main-content">.
 */
// req: BLOQUE-H (estructura de página), RNF-004
describe('NotFoundComponent', () => {
  async function render(url: string, fueraDelPortal: boolean): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(fueraDelPortal
          ? [{ path: '**', component: NotFoundComponent, data: { fueraDelPortal: true } }]
          : [{ path: 'portal', children: [{ path: '**', component: NotFoundComponent }] }]),
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  it('dentro del portal: un título y regreso al inicio', async () => {
    const host = await render('/portal/no-existe', false);
    expect([...host.querySelectorAll('h1')].map(h1 => h1.textContent!.trim())).toEqual(['No encontramos esta página']);
    expect(host.querySelector('a[href="/portal/dashboard"]')).not.toBeNull();
    expect(host.querySelector('main')).toBeNull();
  });

  it('fuera del portal: piel pública, barra y regreso a la portada', async () => {
    const host = await render('/no-existe', true);
    expect(host.querySelector('header.cromo')).not.toBeNull();
    expect(host.querySelector('.publico')!.getAttribute('data-skin')).toMatch(/^(game|portal)$/);
    expect(host.querySelectorAll('main#main-content h1')).toHaveLength(1);
    expect(host.querySelector('main a[href="/"]')!.textContent).toContain('Volver a la portada');
  });
});
