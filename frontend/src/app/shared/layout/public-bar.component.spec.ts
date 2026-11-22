import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TemaService } from '../../core/tema/tema.service';
import { UiDialog } from '../ui/dialog/ui-dialog';
import { PUBLIC_ANCHORS, PublicBarComponent } from './public-bar.component';

@Component({
  imports: [PublicBarComponent],
  template: `
    <app-public-bar [anchors]="anchors" />
    @for (anchor of anchors; track anchor.id) { <section [id]="anchor.id">{{ anchor.label }}</section> }
  `,
})
class LandingHost {
  anchors = PUBLIC_ANCHORS;
}

@Component({ imports: [PublicBarComponent], template: '<app-public-bar mode="acceso" />' })
class LoginHost {}

/**
 * Cabecera pública (plan visual F3-4): la portada y el acceso usan la MISMA barra de vidrio que el portal. En la
 * portada, anclas a sus secciones y «Ingresar»; en el acceso, el regreso a la portada.
 */
// req: BLOQUE-H (navegación pública con la barra del lenguaje)
describe('app-public-bar', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: UiDialog, useValue: { sheet: vi.fn() } }],
  }));

  // Que la portada REAL tenga esas secciones lo comprueba el e2e @estructura (aquí las secciones son del anfitrión).
  it('la portada: barra de vidrio nombrada, anclas #id a las secciones del anfitrión e «Ingresar»', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const header = host.querySelector('header.cromo')!;
    expect(header.querySelector('nav.bandeja')!.getAttribute('aria-label')).toBe('Navegación pública');
    const anchors = [...header.querySelectorAll<HTMLAnchorElement>('.modulo-principal a.nav-enlace')];
    expect(anchors.map(anchor => anchor.textContent!.trim())).toEqual(['Simulador', 'Casos', 'Cómo funciona', 'Roles', 'Ética']);
    for (const anchor of anchors) expect(host.querySelector(anchor.getAttribute('href')!)).not.toBeNull();
    const login = header.querySelector<HTMLAnchorElement>('a.modulo-cuenta')!;
    expect(login.querySelector('.cta-modulo__rotulo')!.textContent!.trim()).toBe('Ingresar');
    expect(login.getAttribute('href')).toBe('/login');
    expect(header.firstElementChild!.textContent!.trim()).toBe('Saltar a la navegación');
  });

  it('en móvil, las mismas anclas son las pestañas inferiores (hija directa del header), con icono y sin «Más»', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const bottom = (fixture.nativeElement as HTMLElement).querySelector('header.cromo > nav.modulo-inferior')!;
    expect(bottom.getAttribute('aria-label')).toBe('Navegación pública');
    const tabs = [...bottom.querySelectorAll<HTMLAnchorElement>('a.pestana')];
    expect(tabs.map(tab => tab.querySelector('.pestana__rotulo')!.textContent!.trim())).toEqual(['Simulador', 'Casos', 'Cómo funciona', 'Roles', 'Ética']);
    expect(tabs.map(tab => tab.getAttribute('href'))).toEqual(['#simulador', '#casos', '#como-funciona', '#roles', '#etica']);
    for (const tab of tabs) expect(tab.querySelector('mat-icon')!.textContent!.trim()).not.toBe('');
    expect(bottom.querySelector('button.pestana')).toBeNull();
  });

  it('el acceso: la misma barra, sin anclas ni pestañas, con el regreso a la portada', async () => {
    const fixture = TestBed.createComponent(LoginHost);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('header.cromo')!;
    expect(header.querySelectorAll('.modulo-principal a.nav-enlace')).toHaveLength(0);
    expect(header.querySelector('nav.modulo-inferior')).toBeNull();
    expect(header.querySelector('a.psy-skip-link')).toBeNull(); // sin navegación no hay salto a ella
    const back = header.querySelector<HTMLAnchorElement>('.modulo-cuenta a')!;
    expect(back.textContent!.trim()).toBe('Volver al inicio');
    expect(back.hasAttribute('aria-label')).toBe(false); // el nombre es el texto visible (WCAG 2.5.3)
    expect(back.getAttribute('href')).toBe('/');
  });

  it('el logo es un enlace con nombre a la portada', async () => {
    const fixture = TestBed.createComponent(LoginHost);
    await fixture.whenStable();
    const logo = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.modulo-logo')!;
    // Marca principal: Metafrónesis (SIEP es el simulador). La barra pública es una sola píldora («unida»).
    expect(logo.getAttribute('aria-label')).toBe('Metafrónesis: ir al inicio');
    expect(logo.getAttribute('href')).toBe('/');
    expect(logo.querySelector('app-marca')).not.toBeNull();
    // Receta de la barra de vidrio modular: estados servidos (inicial al cargar). El logo es la marca completa siempre
    // (no cede al isotipo al hacer scroll; pedido del usuario 2026-11-20).
    const cromo = (fixture.nativeElement as HTMLElement).querySelector('header.cromo')!;
    expect(cromo.getAttribute('data-estado')).toBe('inicial');
    expect(logo.querySelectorAll('app-marca')).toHaveLength(1);
    expect(logo.querySelector('.logo-doble')).toBeNull();
  });

  // Pedido del usuario (2026-11-20): sin «cuadro morado» dentro del módulo; el módulo de cuenta ENTERO es «Ingresar».
  it('en la portada el módulo de cuenta ES el enlace «Ingresar» (sin nada dentro que se pulse) y dice «Ingresar aquí»', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const bandeja = (fixture.nativeElement as HTMLElement).querySelector('header.cromo > nav.bandeja')!;
    const modulo = bandeja.querySelector<HTMLAnchorElement>(':scope > a.modulo.modulo-cuenta.cta-modulo')!;
    expect(modulo).not.toBeNull(); // hijo directo de la píldora: toda la cápsula es el área de clic
    expect(modulo.getAttribute('href')).toBe('/login');
    expect(modulo.querySelectorAll('a, button')).toHaveLength(0);
    expect(bandeja.querySelector('.cta-vivo')).toBeNull();
    // Nombre accesible estable = su texto, que contiene lo visible en reposo («Ingresar»; WCAG 2.5.3): « aquí» está
    // siempre en el DOM (se recorta a ancho 0), no oculto al lector; la flecha es decorativa.
    expect(modulo.hasAttribute('aria-label')).toBe(false);
    expect(modulo.textContent!.replace(/\s+/g, ' ').trim()).toBe('Ingresar aquí');
    const mas = modulo.querySelector('.cta-modulo__mas')!;
    expect(mas.closest('[aria-hidden="true"], [hidden]')).toBeNull();
    expect(modulo.querySelector('svg.cta-modulo__flecha')!.getAttribute('aria-hidden')).toBe('true');
    expect(modulo.querySelector('.cta-modulo__alcance')!.getAttribute('aria-hidden')).toBe('true');
    expect(modulo.querySelector('.cta-modulo__alcance')!.textContent).toBe('');
  });

  it('en la portada el tema sale del módulo «Ingresar»: va al final del principal, tras un filete decorativo', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('header.cromo')!;
    expect(header.querySelector('.modulo-cuenta .tema')).toBeNull();
    const principal = header.querySelector('.modulo-principal')!;
    expect(principal.classList.contains('con-tema')).toBe(true);
    const ultimos = [...principal.children].slice(-2);
    expect(ultimos[0].classList.contains('filete-tema')).toBe(true);
    expect(ultimos[0].getAttribute('aria-hidden')).toBe('true');
    expect(ultimos[1].matches('app-tema-selector.tema')).toBe(true);
    expect(ultimos[1].querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Tema de la página');
    // En la portada el orden de tabulación es: logo, destinos, tema (solo la opción elegida entra con Tab), «Ingresar aquí».
    const orden = [...header.querySelectorAll<HTMLElement>('nav.bandeja a, nav.bandeja button')].filter(el => el.tabIndex !== -1);
    expect(orden.at(-2)!.closest('app-tema-selector')).not.toBeNull();
    expect(orden.at(-1)!.matches('a.cta-modulo')).toBe(true);
  });

  it('en el acceso el módulo de cuenta no es violeta: el tema y «Volver al inicio», sin enlace a /login', async () => {
    const fixture = TestBed.createComponent(LoginHost);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('header.cromo')!;
    expect(header.querySelector('.cta-modulo')).toBeNull();
    expect(header.querySelector('a[href="/login"]')).toBeNull();
    expect(header.querySelector('.modulo-principal')!.classList.contains('con-tema')).toBe(false);
    expect(header.querySelector('.modulo-principal .tema')).toBeNull();
    expect(header.querySelector('div.modulo-cuenta > app-tema-selector.tema')).not.toBeNull();
  });

  it('Roles y Ética se pliegan en «scroll» y el indicador ··· es decorativo', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const plegables = [...host.querySelectorAll('.modulo-principal a.control-plegable')].map(a => a.textContent!.trim());
    expect(plegables).toEqual(['Roles', 'Ética']);
    expect(host.querySelector('.modulo-principal .indicador-mas')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('la portada no escribe estilos en línea en jsdom (la medida de «Ingresar aquí» solo corre en un navegador)', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('header.cromo [style]')).toBeNull();
  });

  it('el tema se elige en una cápsula Claro · Oscuro · Automático (pedido del usuario, 2026-11-20)', async () => {
    TestBed.inject(TemaService).fijar('sistema');
    const fixture = TestBed.createComponent(LoginHost);
    await fixture.whenStable();
    const radios = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.modulo-cuenta app-tema-selector [role="radio"]')];
    expect(radios().map(r => r.getAttribute('aria-label'))).toEqual(['Claro', 'Oscuro', 'Automático']);
    expect(radios().map(r => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    // Plegada, el primer toque abre; abierta, el toque elige.
    radios()[0].click();
    await fixture.whenStable();
    radios()[0].click();
    await fixture.whenStable();
    expect(radios().map(r => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    TestBed.inject(TemaService).fijar('sistema');
  });
});
