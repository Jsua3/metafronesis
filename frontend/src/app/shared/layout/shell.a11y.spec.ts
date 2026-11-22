import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class Screen {}

/**
 * Accesibilidad de la barra del portal (plan visual F3-3 y F3-5), en DOM y no sobre el texto de la plantilla. El
 * antiguo menú móvil (inerte cerrado, aria-expanded/controls, Esc devuelve el foco) lo sustituyen las pestañas
 * inferiores de F3-5 (bottom-tabs.component.spec.ts y la hoja «Más» de UiDialog).
 */
// req: BLOQUE-H, RNF-004 (nombres accesibles y puntos de referencia de la navegación)
describe('shell: barra accesible', () => {
  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { currentUser: signal<User>({ id: 1, nombre: 'Ana', apellido: 'Ruiz', email: 'a@b.co', role: 'ADMIN' }), logout: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('la barra es la cabecera de la página (banner) y su navegación está nombrada; en escritorio la barra inferior no existe para nadie', async () => {
    const host = await render();
    const header = host.querySelector('header')!;
    expect(header.closest('main, article, aside, nav, section')).toBeNull();
    expect(host.querySelectorAll('nav[aria-label="Navegación principal"]:not([hidden])')).toHaveLength(1);
    expect(host.querySelector('nav.bandeja')!.getAttribute('aria-label')).toBe('Navegación principal');
    expect(host.querySelector('nav.modulo-inferior')!.hasAttribute('hidden')).toBe(true);
  });

  it('en un teléfono la navegación principal es la barra inferior y la de arriba se llama «Marca y cuenta»', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const host = await render();
      expect(host.querySelectorAll('nav[aria-label="Navegación principal"]:not([hidden])')).toHaveLength(1);
      expect(host.querySelector('nav.modulo-inferior')!.getAttribute('aria-label')).toBe('Navegación principal');
      expect(host.querySelector('nav.modulo-inferior')!.hasAttribute('hidden')).toBe(false);
      expect(host.querySelector('nav.bandeja')!.getAttribute('aria-label')).toBe('Marca y cuenta');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('el logo es la marca de Metafrónesis, decorativa, dentro de un enlace con nombre propio (DP-06; WCAG 2.5.3)', async () => {
    const host = await render();
    const logo = host.querySelector('a.modulo-logo')!;
    expect(logo.getAttribute('aria-label')).toBe('Metafrónesis · SIEP: ir al inicio');
    expect(logo.querySelector('app-marca')).not.toBeNull();
    for (const svg of logo.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
    // Axe mide el texto VISIBLE del DOM: la palabra de la marca es un dibujo, así que el enlace no tiene texto que
    // pueda contradecir su nombre.
    expect((logo.textContent ?? '').trim()).toBe('');
  });

  it('la cápsula de tema está en el módulo de cuenta y es un grupo de radios nombrado', async () => {
    const host = await render();
    const cuenta = host.querySelector('.modulo-cuenta')!;
    const grupo = cuenta.querySelector('app-tema-selector [role="radiogroup"]')!;
    expect(grupo.getAttribute('aria-label')).toBe('Tema de la página');
    expect(grupo.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  it('el «···» es decorativo y los plegados siguen en el árbol accesible (los alcanza Tab)', async () => {
    const host = await render();
    expect(host.querySelector('.indicador-mas')!.getAttribute('aria-hidden')).toBe('true');
    for (const fold of host.querySelectorAll('a.control-plegable')) {
      expect(fold.hasAttribute('aria-hidden')).toBe(false);
      expect(fold.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('el menú de cuenta tiene nombre y el rol se lee como texto', async () => {
    const host = await render();
    const trigger = host.querySelector('.modulo-cuenta ui-menu button')!;
    expect(trigger.getAttribute('aria-label') ?? trigger.textContent).toMatch(/cuenta/i);
    expect(host.querySelector('.cuenta-chip__rol')!.textContent!.trim()).toBe('Administrador');
  });
});
