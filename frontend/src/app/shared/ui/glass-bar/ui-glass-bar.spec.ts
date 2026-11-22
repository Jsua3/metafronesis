import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiGlassBar } from './ui-glass-bar';

/**
 * ui-glass-bar (plan visual F3): el `<header>` de la barra de vidrio modular. Cablea los eventos del navegador a la
 * máquina y pinta `data-estado` y `data-modalidad`; los módulos los proyecta el consumidor como hijos directos de
 * la píldora (invariante 1 de la skill). Criterios E1, E3 y S1/S3 de medicion.md, en DOM.
 */
@Component({
  imports: [UiGlassBar],
  template: `
    @if (shown()) {
      <header ui-glass-bar label="Navegación principal">
        <a class="modulo modulo-logo" href="/inicio">SIEP</a>
        <div class="modulo modulo-principal">
          <a class="nav-enlace" href="/a">A</a>
          <a class="nav-enlace control-plegable" href="/b">B</a>
        </div>
        <div class="modulo modulo-cuenta"><span>Cuenta</span></div>
        <nav class="pestanas" aria-label="Pestañas">fijo</nav>
      </header>
    }
  `,
})
class Host {
  shown = signal(true);
}

@Component({
  imports: [UiGlassBar],
  template: `
    <header ui-glass-bar label="Navegación principal" navSkip>
      <a class="modulo modulo-logo" href="/inicio">SIEP</a>
      <div class="modulo modulo-principal"><a class="nav-enlace" href="/a">A</a><a class="nav-enlace" href="/b">B</a></div>
      <div class="modulo modulo-cuenta"><span>Cuenta</span></div>
    </header>
  `,
})
class SkipHost {}

function pointer(type: string, pointerType: string): Event {
  const event = new MouseEvent(type, { bubbles: type === 'pointerdown', cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

function scrollTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

/** Simula un teléfono: ninguna media de escritorio ni de puntero fino casa, y hay viewport visual. */
function mockPhone(): { viewport: EventTarget & { height: number }; restore: () => void } {
  const originalMatchMedia = window.matchMedia;
  const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  const viewport = Object.assign(new EventTarget(), { height: 800 });
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  return {
    viewport,
    restore: () => {
      window.matchMedia = originalMatchMedia;
      if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    },
  };
}

@Component({
  imports: [UiGlassBar],
  template: `
    <header ui-glass-bar label="Navegación principal" navSkip>
      <a class="modulo modulo-logo" href="/inicio">SIEP</a>
      <div class="modulo modulo-principal"><a class="nav-enlace" href="/a">A</a></div>
      <div class="modulo modulo-cuenta"><span>Cuenta</span></div>
      <nav class="modulo-inferior" aria-label="Navegación principal"><a class="pestana" href="/a">A</a><a class="pestana" href="/b">B</a></nav>
    </header>
    <input type="text" aria-label="Buscar" />
  `,
})
class PhoneHost {}

// req: BLOQUE-H (barra móvil del plan visual F3-5)
describe('ui-glass-bar en un teléfono', () => {
  let phone: ReturnType<typeof mockPhone>;

  beforeEach(() => {
    phone = mockPhone();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => phone.restore());

  it('la navegación de arriba se llama «Marca y cuenta» (la principal es la barra inferior) y el header dice data-ancho="movil"', async () => {
    const fixture = TestBed.createComponent(PhoneHost);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('nav.bandeja').getAttribute('aria-label')).toBe('Marca y cuenta');
    expect(fixture.nativeElement.querySelector('header').getAttribute('data-ancho')).toBe('movil');
  });

  it('al destruirse suelta también los oyentes del viewport visual y de las medias', async () => {
    const shown = signal(true);
    @Component({
      imports: [UiGlassBar],
      template: `@if (shown()) { <header ui-glass-bar label="Navegación principal"><a class="modulo modulo-logo" href="/">S</a></header> }`,
    })
    class Toggle { shown = shown; }
    const removedFromViewport = vi.spyOn(phone.viewport, 'removeEventListener');
    const fixture = TestBed.createComponent(Toggle);
    await fixture.whenStable();
    shown.set(false);
    await fixture.whenStable();
    expect(removedFromViewport.mock.calls.map(call => call[0])).toContain('resize');
  });

  it('«Saltar a la navegación» lleva el foco a la primera pestaña de abajo (la navegación principal en el teléfono)', async () => {
    const fixture = TestBed.createComponent(PhoneHost);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('header > a.psy-skip-link').click();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.modulo-inferior a.pestana'));
  });

  it('con el foco en un campo y el viewport visual 150 px más bajo, marca data-teclado="abierto"; al salir, se quita', async () => {
    const fixture = TestBed.createComponent(PhoneHost);
    await fixture.whenStable();
    const header = fixture.nativeElement.querySelector('header') as HTMLElement;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await fixture.whenStable();
    expect(header.hasAttribute('data-teclado')).toBe(false);
    phone.viewport.height = 500;
    phone.viewport.dispatchEvent(new Event('resize'));
    await fixture.whenStable();
    expect(header.getAttribute('data-teclado')).toBe('abierto');
    input.blur();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    await Promise.resolve(); // el oyente de foco escribe en una microtarea (nunca en plena pintura: NG0600)
    await fixture.whenStable();
    expect(header.hasAttribute('data-teclado')).toBe(false);
  });
});

// req: BLOQUE-H (barra de navegación del plan visual F3)
describe('ui-glass-bar', () => {
  let fixture: ComponentFixture<Host>;
  const header = () => fixture.nativeElement.querySelector('header') as HTMLElement | null;

  beforeEach(async () => {
    scrollTo(0);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  afterEach(() => scrollTo(0));

  it('el anfitrión es header.cromo y sirve data-estado="inicial", data-vidrio="pseudo" y data-ancho="escritorio"', () => {
    expect(header()!.classList).toContain('cromo');
    expect(header()!.dataset['estado']).toBe('inicial');
    expect(header()!.dataset['vidrio']).toBe('pseudo');
    expect(header()!.dataset['ancho']).toBe('escritorio');
  });

  it('los tres módulos son hijos DIRECTOS de nav.bandeja y lo fijo es hijo directo del header (E1, E7)', () => {
    const bandeja = header()!.querySelector(':scope > nav.bandeja') as HTMLElement;
    expect(bandeja.getAttribute('aria-label')).toBe('Navegación principal');
    expect([...bandeja.querySelectorAll(':scope > .modulo')].map(el => el.classList[1])).toEqual(['modulo-logo', 'modulo-principal', 'modulo-cuenta']);
    expect(header()!.querySelector(':scope > nav.pestanas')).not.toBeNull();
  });

  it('al desplazarse más de 8 px pasa a «scroll» y vuelve a «inicial» arriba (S1)', async () => {
    scrollTo(400);
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('scroll');
    scrollTo(0);
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('inicial');
  });

  it('el ratón en la franja abre la atención; un pointerenter táctil no (S3, S11)', async () => {
    scrollTo(400);
    header()!.dispatchEvent(pointer('pointerenter', 'touch'));
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('scroll');
    header()!.dispatchEvent(pointer('pointerenter', 'mouse'));
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('atencion');
  });

  it('marca la modalidad: Tab → «teclado», pointerdown → «puntero»', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await fixture.whenStable();
    expect(header()!.dataset['modalidad']).toBe('teclado');
    document.body.dispatchEvent(pointer('pointerdown', 'mouse'));
    await fixture.whenStable();
    expect(header()!.dataset['modalidad']).toBe('puntero');
  });

  it('la modalidad llega al DOM en el MISMO keydown/pointerdown, antes de que Tab mueva el foco (invariante 7)', () => {
    // Sin esperar a la detección de cambios: el navegador decide adónde va Tab justo después del keydown, y los
    // plegados solo son enfocables con data-modalidad="teclado".
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(header()!.dataset['modalidad']).toBe('teclado');
    document.body.dispatchEvent(pointer('pointerdown', 'mouse'));
    expect(header()!.dataset['modalidad']).toBe('puntero');
  });

  it('ningún nodo entra ni sale al cambiar de estado (E3)', async () => {
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver(records => changes.push(...records));
    observer.observe(header()!, { childList: true, subtree: true });
    scrollTo(400);
    header()!.dispatchEvent(pointer('pointerenter', 'mouse'));
    await fixture.whenStable();
    scrollTo(0);
    await fixture.whenStable();
    observer.disconnect();
    expect(changes.filter(record => record.type === 'childList')).toHaveLength(0);
  });

  it('cada plegable recibe su ancho natural como techo (--asb-ancho-natural): crecen en proporción, sin balanceo', async () => {
    const fold = header()!.querySelector('a.control-plegable') as HTMLElement;
    Object.defineProperty(fold, 'scrollWidth', { value: 90, configurable: true });
    fixture.componentInstance.shown.update(value => value); // nada cambia en la plantilla…
    scrollTo(400); // …pero el cambio de estado vuelve a pintar y a medir
    await fixture.whenStable();
    expect(fold.style.getPropertyValue('--asb-ancho-natural')).toBe('calc(90px + 1.5rem)');
  });

  it('un plegable sin caja (oculto en móvil, scrollWidth 0) conserva su techo anterior', async () => {
    const fold = header()!.querySelector('a.control-plegable') as HTMLElement;
    Object.defineProperty(fold, 'scrollWidth', { value: 90, configurable: true });
    scrollTo(400);
    await fixture.whenStable();
    Object.defineProperty(fold, 'scrollWidth', { value: 0, configurable: true });
    scrollTo(0);
    await fixture.whenStable();
    expect(fold.style.getPropertyValue('--asb-ancho-natural')).toBe('calc(90px + 1.5rem)');
  });

  it('sin navSkip no hay enlace de salto (p. ej. el acceso, que no tiene navegación)', () => {
    expect(header()!.querySelector('a.psy-skip-link')).toBeNull();
  });

  it('con navSkip, el primer hijo del header es «Saltar a la navegación» y lleva el foco al primer destino de la píldora', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const phoneless = TestBed.createComponent(SkipHost);
    await phoneless.whenStable();
    const host = phoneless.nativeElement.querySelector('header') as HTMLElement;
    const skip = host.firstElementChild as HTMLAnchorElement;
    expect(skip.matches('a.psy-skip-link')).toBe(true);
    expect(skip.textContent!.trim()).toBe('Saltar a la navegación');
    skip.click();
    expect(document.activeElement).toBe(host.querySelector('.modulo-principal a.nav-enlace'));
  });

  it('el header y la píldora llevan .ds-motion (su reloj no colapsa con movimiento reducido; invariante 12)', () => {
    expect(header()!.classList).toContain('ds-motion');
    expect(header()!.querySelector('nav.bandeja')!.classList).toContain('ds-motion');
  });

  it('al destruirse suelta sus oyentes de window y document', async () => {
    const removedFromWindow = vi.spyOn(window, 'removeEventListener');
    const removedFromDocument = vi.spyOn(document, 'removeEventListener');
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    expect(removedFromWindow.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['scroll', 'keydown', 'focusin', 'focusout']));
    expect(removedFromDocument.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'click']));
    removedFromWindow.mockRestore();
    removedFromDocument.mockRestore();
  });
});

@Component({
  imports: [UiGlassBar],
  template: `
    <header ui-glass-bar label="Editor de casos" [congelada]="congelada()">
      <a class="modulo modulo-logo" href="/inicio">S</a>
      <div class="modulo modulo-principal"><a class="nav-enlace" href="/a">A</a></div>
      <div class="modulo modulo-cuenta"><span>Cuenta</span></div>
    </header>
  `,
})
class CongeladaHost {
  congelada = signal(false);
}

// req: BLOQUE-H (editor de casos, DG-9: la barra no cambia de estado con una ayuda abierta)
describe('ui-glass-bar congelada', () => {
  afterEach(() => scrollTo(0));

  it('con [congelada] no cambia de estado al desplazarse, y al soltarla cae al que le toca', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(CongeladaHost);
    await fixture.whenStable();
    const header = fixture.nativeElement.querySelector('header') as HTMLElement;
    fixture.componentInstance.congelada.set(true);
    await fixture.whenStable();
    scrollTo(400);
    await fixture.whenStable();
    expect(header.dataset['estado']).toBe('inicial');
    fixture.componentInstance.congelada.set(false);
    await fixture.whenStable();
    expect(header.dataset['estado']).toBe('scroll');
  });
});
