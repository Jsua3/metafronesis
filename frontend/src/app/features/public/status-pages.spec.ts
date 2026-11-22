import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ForbiddenComponent } from './forbidden.component';
import { FULL_NAVIGATION, OfflineComponent } from './offline.component';
import { PaginaEstadoComponent } from '../../shared/layout/pagina-estado/pagina-estado.component';

/**
 * Páginas de estado (plan visual F4-3): «Sin permiso» (dentro del portal, con la sección pedida) y «Sin conexión»
 * (cargada sin red y mínima; «Reintentar» CARGA de nuevo la ruta pedida si es interna).
 */
// req: BLOQUE-H (estados), RNF-004; gancho RF-02/RNF-002 (lo que se ve al negar una sección)
describe('páginas de estado', () => {
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const fullNavigation = vi.fn();
  const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  beforeEach(() => fullNavigation.mockReset());
  afterEach(() => { if (online) Object.defineProperty(Navigator.prototype, 'onLine', online); });

  async function render(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'portal', children: [{ path: 'sin-permiso', component: ForbiddenComponent }] },
          { path: 'sin-conexion', component: OfflineComponent },
        ]),
        { provide: FULL_NAVIGATION, useValue: fullNavigation },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  const retry = (host: HTMLElement) => [...host.querySelectorAll('button')].find(button => text(button) === 'Reintentar')!.click();

  it('sin permiso: un h1, el estado «forbidden» nombrando la sección pedida y «Volver al panel», sin <main> propio', async () => {
    const host = await render('/portal/sin-permiso?seccion=usuarios');
    expect([...host.querySelectorAll('h1')].map(text)).toEqual(['Esta sección no es para tu rol']);
    expect(text(host)).toContain('«Usuarios»');
    expect(host.querySelector<HTMLAnchorElement>('a[href="/portal/dashboard"]')!.textContent!.trim()).toBe('Volver al inicio');
    expect(host.querySelector('main')).toBeNull();
  });

  it('sin permiso con una ruta desconocida: el mensaje general, sin inventar un nombre', async () => {
    const host = await render('/portal/sin-permiso?desde=%2Fportal%2Fnada');
    expect(text(host.querySelector('app-pagina-estado'))).toContain('No tienes permiso para abrir esta página.');
  });

  it('una subruta de una sección (simulador/<id>) no se nombra como la sección: el docente SÍ tiene «Simulador» (M-1)', async () => {
    // roleGuard('ESTUDIANTE','ADMIN') protege simulador/:id; nombrar «Simulador» contradiría el menú del docente.
    const host = await render('/portal/sin-permiso?desde=%2Fportal%2Fsimulador%2F5');
    expect(text(host.querySelector('app-pagina-estado'))).toContain('No tienes permiso para abrir esta página.');
  });

  it('sin permiso lleva la viñeta de la zona restringida (decorativa)', async () => {
    const host = await render('/portal/sin-permiso');
    const vineta = host.querySelector('app-pagina-estado ui-vineta');
    expect(vineta?.getAttribute('data-escena')).toBe('restringido');
    expect(vineta?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sin conexión: su propio <main>, un h1, el estado bloqueante y «Reintentar» CARGA de nuevo la ruta pedida', async () => {
    // El navegador guarda en su mapa de módulos la descarga fallida: un import() otra vez fallaría aunque ya haya
    // red; por eso «Reintentar» hace una carga completa (FULL_NAVIGATION), no una navegación del Router.
    const host = await render('/sin-conexion?desde=%2Fportal%2Fsimulador');
    expect(host.querySelector('main#main-content')).not.toBeNull();
    expect([...host.querySelectorAll('h1')].map(text)).toEqual(['Sin conexión']);
    expect(host.querySelector('img')).toBeNull();
    // Ni la hoja de estilos de la plantilla pide recursos por red (url()): la pantalla debe pintarse sin conexión.
    const hojas = (PaginaEstadoComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('');
    expect(hojas).not.toContain('url(');
    expect(text(host)).toContain('último guardado');
    retry(host);
    expect(fullNavigation).toHaveBeenCalledWith('/portal/simulador');
  });

  it('sin conexión con una ruta que saldría del sitio: «Reintentar» va al inicio', async () => {
    retry(await render('/sin-conexion?desde=%2F%2Fevil.example'));
    expect(fullNavigation).toHaveBeenCalledWith('/');
  });

  it('si al reintentar todavía no hay red, lo dice en una región SIEMPRE presente (y otra vez en cada intento) y no recarga', async () => {
    // Revisión de F4, I-4: una región viva que nace con su texto no se anuncia; esta existe vacía desde el principio.
    const host = await render('/sin-conexion?desde=%2Fportal%2Fsimulador');
    const status = () => host.querySelector('[role="status"].sin-red__aviso');
    expect(status()).not.toBeNull();
    expect(text(status())).toBe('');
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    const message = 'Todavía no hay conexión. Vuelve a intentarlo en un momento.';
    retry(host);
    await vi.waitFor(async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      expect(text(status())).toBe(message);
    });
    retry(host); // el segundo intento vacía la región y la vuelve a llenar: se anuncia otra vez
    await TestBed.inject(ApplicationRef).whenStable();
    expect(text(status())).toBe('');
    await vi.waitFor(async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      expect(text(status())).toBe(message);
    });
    expect(fullNavigation).not.toHaveBeenCalled();
  });
});
