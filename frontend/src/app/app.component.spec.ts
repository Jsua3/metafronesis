import { Component } from '@angular/core';
import { DeferBlockState, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent: enlaces de salto', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([])],
  }));

  afterEach(() => document.querySelectorAll('[data-test-target]').forEach(node => node.remove()));

  function render() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('lleva el foco al primer <main> sin navegar', () => {
    const main = document.createElement('main');
    main.setAttribute('data-test-target', '');
    document.body.appendChild(main);

    const link = render().nativeElement.querySelector('a.psy-skip-link') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(main);
  });

  it('prefiere #main-content cuando existe', () => {
    const main = document.createElement('main');
    main.setAttribute('data-test-target', '');
    const content = document.createElement('div');
    content.id = 'main-content';
    content.setAttribute('data-test-target', '');
    document.body.append(main, content);

    const link = render().nativeElement.querySelector('a.psy-skip-link') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(content);
  });

  it('solo ofrece «Saltar al juego» dentro de un caso', () => {
    const links = render().nativeElement.querySelectorAll('a.psy-skip-link');
    expect(links.length).toBe(1);
  });
});

// req: BLOQUE-H (H-09), RNF-004 (F6-12: las regiones vivas existen antes de que alguien anuncie)
describe('AppComponent: regiones vivas persistentes (F6-12)', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([])],
  }));

  it('monta las dos regiones al arrancar, sin esperar a un primer anuncio, y una sola vez', () => {
    TestBed.createComponent(AppComponent).detectChanges();

    const regions = [...document.querySelectorAll<HTMLElement>('[data-live-region]')];
    expect(regions.map(region => region.getAttribute('aria-live')).sort()).toEqual(['assertive', 'polite']);
    expect(regions.every(region => region.parentElement === document.body)).toBe(true);
    expect(regions.every(region => region.textContent === '')).toBe(true);
  });
});

@Component({ template: '' })
class Screen {}

// req: BLOQUE-H (H-19, H-34), REGLA-004 (F6-1: el destino del salto existe antes del consentimiento y los avisos no
// tapan el juego)
describe('AppComponent: dentro de un caso (F6-1)', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([
      { path: 'portal/simulador/:id', component: Screen, data: { chrome: 'hidden' } },
      { path: 'portal/dashboard', component: Screen },
    ])],
  }));

  afterEach(() => document.querySelectorAll('[data-test-target]').forEach(node => node.remove()));

  async function renderAt(url: string) {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    for (const block of await fixture.getDeferBlocks()) {
      await block.render(DeferBlockState.Complete);
    }
    fixture.detectChanges();
    return fixture;
  }

  function target(id: string): HTMLElement {
    const node = document.createElement('div');
    node.id = id;
    node.setAttribute('data-test-target', '');
    document.body.appendChild(node);
    return node;
  }

  it('«Saltar al juego» apunta a #main-content: ese destino existe aunque el mundo aún no (ETH-01)', async () => {
    const links = (await renderAt('/portal/simulador/7')).nativeElement.querySelectorAll('a.psy-skip-link');

    expect(links.length).toBe(2);
    expect(links[1].textContent.trim()).toBe('Saltar al juego');
    expect(links[1].getAttribute('href')).toBe('#main-content');
  });

  it('«Saltar al juego» enfoca #game-area cuando existe', async () => {
    const container = target('main-content');
    const area = target('game-area');
    const links = (await renderAt('/portal/simulador/7')).nativeElement.querySelectorAll('a.psy-skip-link');

    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(area);
    expect(container).not.toBe(document.activeElement);
  });

  it('«Saltar al juego» enfoca #main-content cuando el mundo aún no existe', async () => {
    const container = target('main-content');
    const links = (await renderAt('/portal/simulador/7')).nativeElement.querySelectorAll('a.psy-skip-link');

    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(container);
  });

  it('los avisos del sistema van arriba a la izquierda en el juego y abajo a la derecha en el portal', async () => {
    const inGame = await renderAt('/portal/simulador/7');
    await inGame.whenStable(); // el anfitrión es diferido (@defer on idle)
    inGame.detectChanges();
    expect(inGame.nativeElement.querySelector('ui-toast-host').classList).toContain('ui-toast-host--game');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([{ path: 'portal/dashboard', component: Screen }])],
    });
    const inPortal = await renderAt('/portal/dashboard');
    await inPortal.whenStable();
    inPortal.detectChanges();
    expect(inPortal.nativeElement.querySelector('ui-toast-host').classList).not.toContain('ui-toast-host--game');
  });

  it('no queda el anfitrión de avisos heredado y el nuevo se monta una sola vez', async () => {
    const fixture = await renderAt('/portal/dashboard');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-notification-host')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('ui-toast-host').length).toBe(1);
  });
});
