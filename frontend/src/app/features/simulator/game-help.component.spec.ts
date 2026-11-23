import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from '../../../styles/contrast.util';
import { DRAFT_COPY } from './draft-copy';
import { GameHelpComponent } from './game-help.component';
import { HelpModality, firstTimeHelpLines, helpSections } from './game-help.content';

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

/** Nombre accesible aproximado de un botón: aria-label o su texto sin lo oculto a las tecnologías de apoyo. */
function accessibleName(button: HTMLElement): string {
  const explicit = button.getAttribute('aria-label');
  if (explicit) return explicit.trim();
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement) || node.getAttribute('aria-hidden') === 'true') return '';
    return Array.from(node.childNodes).map(walk).join('');
  };
  return walk(button).replace(/\s+/g, ' ').trim();
}

/** Cuerpo de la PRIMERA regla cuyo selector es exactamente `selector`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

const source = readFileSync(join(__dirname, 'game-help.component.ts'), 'utf-8');

describe('GameHelpComponent: nota sobre los atajos fuera del bloque validado (F6-10, VD-18)', () => {
  let fixture: ComponentFixture<GameHelpComponent>;
  const host = () => fixture.nativeElement as HTMLElement;

  function create(view: 'card' | 'screen', modality: HelpModality = 'keyboard'): void {
    TestBed.configureTestingModule({ imports: [GameHelpComponent] });
    fixture = TestBed.createComponent(GameHelpComponent);
    writeInputSignal(fixture.componentInstance.view, view);
    writeInputSignal(fixture.componentInstance.modality, modality);
    writeInputSignal(fixture.componentInstance.safeExitPromise, true);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  // req: BLOQUE-H (H-07), RNF-04, WCAG 2.1.4
  it('la pantalla de ayuda trae la nota marcada «Borrador», fuera de toda sección validada', () => {
    create('screen');
    const note = host().querySelector('[data-help-draft="shortcuts"]');
    expect(note).not.toBeNull();
    expect(note?.closest('[data-help-section]')).toBeNull();
    expect(note?.querySelector('.help-draft__tag')?.textContent?.trim()).toBe('Borrador');
    expect(note?.textContent).toContain(DRAFT_COPY.shortcutsHelpNote.text);
  });

  it('las secciones validadas siguen siendo exactamente las de siempre, sin ninguna nueva', () => {
    create('screen');
    const rendered = Array.from(host().querySelectorAll('[data-help-section]')).map(section => section.getAttribute('data-help-section'));
    expect(rendered).toEqual(helpSections({ modality: 'keyboard', safeExitPromise: true }).map(section => section.id));
  });

  it('el ajuste «Atajos de una tecla» llega a la ayuda: apagado, la pantalla y la tarjeta no prometen WASD, E ni J', () => {
    create('screen');
    expect(host().textContent).toMatch(/WASD/);
    fixture.destroy();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GameHelpComponent] });
    fixture = TestBed.createComponent(GameHelpComponent);
    writeInputSignal(fixture.componentInstance.view, 'screen');
    writeInputSignal(fixture.componentInstance.safeExitPromise, true);
    writeInputSignal(fixture.componentInstance.shortcuts, false);
    fixture.detectChanges();
    const sections = Array.from(host().querySelectorAll('[data-help-section]')).map(section => section.textContent ?? '').join(' | ');
    expect(sections).not.toMatch(/WASD|\bE\b|\bJ\b/);
    expect(sections).toMatch(/flechas/i);
  });

  it('la tarjeta de primera vez no lleva la nota', () => {
    create('card');
    expect(host().querySelector('[data-help-draft]')).toBeNull();
  });

  it('la nota es un borrador registrado con su decisión y responsable', () => {
    expect(DRAFT_COPY.shortcutsHelpNote.decision).toBe('VD-18');
    expect(DRAFT_COPY.shortcutsHelpNote.owner).toBe('Psicología');
  });
});

describe('GameHelpComponent (T3.2)', () => {
  let fixture: ComponentFixture<GameHelpComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(host().querySelectorAll<HTMLButtonElement>('button'));
  const buttonByName = (name: string) => buttons().find(button => accessibleName(button) === name);

  function create(
    inputs: Partial<{ view: 'card' | 'screen'; modality: HelpModality; compact: boolean; safeExitPromise: boolean }> = {},
  ): void {
    // Cada llamada parte de cero: así los bucles sobre combinaciones no arrastran estado.
    fixture?.destroy();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GameHelpComponent] });
    fixture = TestBed.createComponent(GameHelpComponent);
    const component = fixture.componentInstance;
    if (inputs.view) writeInputSignal(component.view, inputs.view);
    if (inputs.modality) writeInputSignal(component.modality, inputs.modality);
    if (inputs.compact !== undefined) writeInputSignal(component.compact, inputs.compact);
    if (inputs.safeExitPromise !== undefined) writeInputSignal(component.safeExitPromise, inputs.safeExitPromise);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  describe('tarjeta de primera vez', () => {
    it('es la vista por defecto: una región «Cómo se juega» con las líneas del teclado y dos botones', () => {
      create({ safeExitPromise: true });
      const card = host().querySelector('section.help-card') as HTMLElement;
      expect(card).not.toBeNull();
      expect(card.getAttribute('role')).toBeNull();
      const titleId = card.getAttribute('aria-labelledby') as string;
      expect(host().querySelector(`#${titleId}`)?.textContent?.trim()).toBe('Cómo se juega');
      const lines = Array.from(card.querySelectorAll('.help-card__lines p')).map(p => p.textContent?.trim());
      expect(lines).toEqual(firstTimeHelpLines({ modality: 'keyboard', compact: false, safeExitPromise: true }));
      expect(buttons().map(accessibleName)).toEqual(['Entendido', 'Más ayuda']);
    });

    it('«Entendido» emite dismissed y «Más ayuda» emite openFull, una vez cada uno', () => {
      create();
      const dismissed = vi.fn();
      const openFull = vi.fn();
      const closed = vi.fn();
      fixture.componentInstance.dismissed.subscribe(dismissed);
      fixture.componentInstance.openFull.subscribe(openFull);
      fixture.componentInstance.closed.subscribe(closed);
      buttonByName('Entendido')?.click();
      expect(dismissed).toHaveBeenCalledTimes(1);
      expect(openFull).not.toHaveBeenCalled();
      buttonByName('Más ayuda')?.click();
      expect(openFull).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();
    });

    it('táctil: explica «Interactuar» y no menciona teclas', () => {
      create({ modality: 'touch', safeExitPromise: true });
      const text = host().textContent ?? '';
      expect(text).toContain('toca «Interactuar»');
      expect(text).not.toMatch(/WASD|\bEsc\b|\bEnter\b|pulsa E\b/);
      expect(text).toContain('Puedes pausar el caso en cualquier momento con «Salida segura». Tu avance se guarda.');
    });

    it('compacto: una sola frase y la clase compacta', () => {
      create({ modality: 'touch', compact: true, safeExitPromise: true });
      const lines = host().querySelectorAll('.help-card__lines p');
      expect(lines).toHaveLength(1);
      expect(lines[0].textContent?.trim()).toBe(
        'Mantén pulsada una flecha para caminar. Toca «Interactuar» cuando veas un nombre abajo.',
      );
      expect(host().querySelector('.help-card')?.classList).toContain('help-card--compact');
    });

    it('no roba el foco: nada dentro de la tarjeta tiene el foco al mostrarse', () => {
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      create();
      expect(document.activeElement).toBe(outside);
      expect(host().contains(document.activeElement)).toBe(false);
      expect(host().querySelector('[autofocus], [cdkFocusInitial], [cdktrapfocus]')).toBeNull();
      outside.remove();
    });

    it('no consume Esc: el evento llega al documento sin cancelar ni detener la propagación', () => {
      create();
      const seen: KeyboardEvent[] = [];
      const listener = (event: Event) => seen.push(event as KeyboardEvent);
      document.addEventListener('keydown', listener);
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      buttonByName('Entendido')?.dispatchEvent(event);
      document.removeEventListener('keydown', listener);
      expect(seen).toHaveLength(1);
      expect(event.defaultPrevented).toBe(false);
    });

    it('sin la promesa de salida segura no hay ni rastro de ella en ninguna variante', () => {
      for (const modality of ['keyboard', 'touch'] as const) {
        for (const compact of [false, true]) {
          create({ modality, compact, safeExitPromise: false });
          expect(host().textContent).not.toMatch(/salida segura|pausar|\bEsc\b/i);
        }
      }
    });

    it('nunca hay un botón llamado «Salida segura» (los e2e buscan uno solo, en el pie)', () => {
      for (const safeExitPromise of [true, false]) {
        for (const view of ['card', 'screen'] as const) {
          create({ view, safeExitPromise });
          expect(buttons().some(button => /salida segura/i.test(accessibleName(button)))).toBe(false);
        }
      }
    });
  });

  describe('pantalla permanente', () => {
    it('es un diálogo con nombre y trampa de foco, con una sección por entrada del contenido', () => {
      create({ view: 'screen', safeExitPromise: true });
      const dialog = host().querySelector('section.help-screen') as HTMLElement;
      expect(dialog.getAttribute('role')).toBe('dialog');
      const titleId = dialog.getAttribute('aria-labelledby') as string;
      expect(host().querySelector(`#${titleId}`)?.textContent?.trim()).toBe('Cómo se juega');
      const ids = Array.from(host().querySelectorAll('[data-help-section]')).map(s => s.getAttribute('data-help-section'));
      expect(ids).toEqual(helpSections({ modality: 'keyboard', safeExitPromise: true }).map(s => s.id));
      expect(host().querySelector('.help-card')).toBeNull();
    });

    it('«Cerrar ayuda» emite closed y es el único botón', () => {
      create({ view: 'screen' });
      const closed = vi.fn();
      fixture.componentInstance.closed.subscribe(closed);
      expect(buttons().map(accessibleName)).toEqual(['Cerrar ayuda']);
      buttonByName('Cerrar ayuda')?.click();
      expect(closed).toHaveBeenCalledTimes(1);
    });

    it('la trampa de foco captura al abrir y el primer elemento enfocable es «Cerrar ayuda»', () => {
      // jsdom no calcula layout, así que CDK no puede mover el foco aquí: se fija el contrato.
      create({ view: 'screen' });
      const screen = source.slice(source.indexOf('} @else {'), source.indexOf('styles: ['));
      expect(screen).toMatch(/cdkTrapFocus\s+\[cdkTrapFocusAutoCapture\]="true"/);
      const focusable = host().querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"]):not(.cdk-focus-trap-anchor)');
      expect(accessibleName(focusable[0])).toBe('Cerrar ayuda');
    });

    it('no escucha Esc: no emite closed ni cancela el evento (la cadena de Esc es de la pantalla de juego)', () => {
      create({ view: 'screen' });
      const closed = vi.fn();
      fixture.componentInstance.closed.subscribe(closed);
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      (host().querySelector('.help-screen') as HTMLElement).dispatchEvent(event);
      expect(closed).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('el cuerpo se desplaza y se alcanza con teclado (región enfocable con nombre)', () => {
      create({ view: 'screen' });
      const body = host().querySelector('.help-screen__body') as HTMLElement;
      expect(body.getAttribute('tabindex')).toBe('0');
      expect(body.getAttribute('role')).toBe('region');
      expect(body.getAttribute('aria-label')).toBe('Contenido de la ayuda');
    });

    it('si todo cabe, una sola página y sin pie de páginas (V6)', async () => {
      create({ view: 'screen' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host().querySelector('.help-screen__pie')).toBeNull();
      expect(host().querySelectorAll('.help-screen__body > [hidden]').length).toBe(0);
    });

    it('sin sitio, va en páginas de secciones enteras con «N de M» y nunca se desplaza (V6)', async () => {
      create({ view: 'screen' });
      await fixture.whenStable();
      const body = host().querySelector('.help-screen__body') as HTMLElement;
      const piezas = Array.from(body.children) as HTMLElement[];
      // jsdom no maqueta: el cuerpo deja 220 px y cada pieza mide 60 (con el hueco de 12), así caben tres por página.
      Object.defineProperty(body, 'clientHeight', { configurable: true, value: 220 });
      Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 60 * piezas.length });
      piezas.forEach(pieza => Object.defineProperty(pieza, 'offsetHeight', { configurable: true, value: 60 }));
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const total = Math.ceil(piezas.length / 3);
      const cuenta = () => host().querySelector('.help-screen__cuenta')?.textContent?.trim();
      const visibles = () => piezas.filter(pieza => !pieza.hidden);
      expect(cuenta()).toBe(`1 de ${total}`);
      expect(visibles()).toEqual(piezas.slice(0, 3));
      expect(buttonByName('Anterior')?.getAttribute('aria-disabled')).toBe('true');
      buttonByName('Siguiente')!.click();
      fixture.detectChanges();
      expect(cuenta()).toBe(`2 de ${total}`);
      expect(visibles()).toEqual(piezas.slice(3, 6));
      buttonByName('Anterior')!.click();
      fixture.detectChanges();
      expect(cuenta()).toBe(`1 de ${total}`);
    });

    it('táctil: sin sección de teclas; teclado: con ella', () => {
      create({ view: 'screen', modality: 'touch' });
      expect(host().querySelector('[data-help-section="teclas"]')).toBeNull();
      create({ view: 'screen', modality: 'keyboard' });
      expect(host().querySelector('[data-help-section="teclas"]')).not.toBeNull();
    });

    it('jamás promete «1 a 5» en ninguna vista, modalidad ni promesa', () => {
      for (const view of ['card', 'screen'] as const) {
        for (const modality of ['keyboard', 'touch'] as const) {
          for (const safeExitPromise of [true, false]) {
            create({ view, modality, safeExitPromise });
            expect(host().textContent).not.toMatch(/1\s*(a|-|–|al)\s*5/);
          }
        }
      }
    });
  });

  describe('contrato de fuente (accesibilidad y rendimiento)', () => {
    it('sin temporizadores, sin animación, sin desenfoque, sin manejo de teclado', () => {
      expect(source).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
      expect(source).not.toMatch(/animation\s*:|@keyframes|backdrop-filter/);
      expect(source).not.toMatch(/HostListener|keydown|keyup|Escape|stopPropagation|preventDefault/);
    });

    it('la tarjeta no atrapa el foco y solo la pantalla lo hace', () => {
      const card = source.slice(source.indexOf("@if (view() === 'card')"), source.indexOf('} @else {'));
      const screen = source.slice(source.indexOf('} @else {'), source.indexOf('styles: ['));
      expect(card).not.toMatch(/cdkTrapFocus|cdkFocusInitial|autofocus/);
      expect(screen).toContain('cdkTrapFocus');
    });

    it('no usa la clase close-btn (los e2e la pulsan para avanzar diálogos)', () => {
      expect(source).not.toContain('close-btn');
    });

    it('los botones miden 44 px como mínimo y tienen anillo de foco visible', () => {
      const css = source.slice(source.indexOf('styles: ['));
      const body = ruleBody(css, '.help-btn');
      expect(body).toMatch(/min-height:\s*44px;/);
      expect(body).toMatch(/min-width:\s*44px;/);
      expect(ruleBody(css, '.help-btn:focus-visible')).toMatch(/outline:\s*3px solid #c9b3ff;/);
    });

    it('el texto contrasta con el fondo de la tarjeta (AA) incluso sobre el peor mapa', () => {
      // Peor caso: el panel (alfa .96) sobre un mapa blanco.
      const surface = blend('#080c12', 0.96, '#ffffff');
      const text = blend('#e8f0f4', 0.92, surface);
      expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio('#cdbcff', surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#0b0f1a', '#b69cff')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#e8f0f4', surface)).toBeGreaterThanOrEqual(4.5);
      // Y los valores del CSS son los que se miden aquí.
      const css = source.slice(source.indexOf('styles: ['));
      expect(ruleBody(css, '.help-card')).toContain('background: rgba(8,12,18,.96);');
      expect(ruleBody(css, '.help-card')).toContain('color: rgba(232,240,244,.92);');
      expect(ruleBody(css, '.help-btn--primary')).toContain('background: #b69cff; color: #0b0f1a;');
    });

    it('el texto informativo no baja de 12 px (0,75 rem)', () => {
      const css = source.slice(source.indexOf('styles: ['));
      const sizes = Array.from(css.matchAll(/font-size:\s*([\d.]+)rem/g)).map(match => Number(match[1]));
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
    });

    it('no lee la clasificación de las opciones', () => {
      expect(source).not.toMatch(/classification|prohibitedConduct|isRecommended|isProhibited/);
    });
  });
});
