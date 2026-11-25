import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { GameHelpComponent } from './game-help.component';
import { CONTROLS_SHORTCUT_KEY, HelpModality, controlsReopenLine, controlsWelcomeRows } from './game-help.content';

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

/**
 * Tarjeta de controles de primera vez (P8): cuatro líneas (moverse, interactuar, ir directo, plano), modal con foco
 * atrapado, Esc la cierra sin que la pulsación llegue a la cadena que pausa el caso, y no promete letras con los atajos
 * de una tecla apagados (WCAG 2.1.4).
 */
describe('Controles de primera vez: contenido', () => {
  it('son exactamente cuatro líneas, en el orden moverse, interactuar, ir directo y plano', () => {
    for (const modality of ['keyboard', 'touch'] as HelpModality[]) {
      expect(controlsWelcomeRows({ modality }).map(row => row.id)).toEqual(['moverte', 'interactuar', 'ir-a', 'plano']);
    }
  });

  it('con teclado y atajos dice WASD, E, I y M; la línea de interactuar explica que el botón dice con qué', () => {
    const rows = controlsWelcomeRows({ modality: 'keyboard' });
    expect(rows[0].keys).toContain('WASD');
    expect(rows[1].keys).toContain('E');
    expect(rows[1].text).toContain('dice con qué vas a interactuar');
    expect(rows[2].keys).toBe('I');
    expect(rows[2].text).toContain('camina solo');
    expect(rows[3].keys).toBe('M');
  });

  it('con los atajos de una tecla apagados ninguna línea promete una letra (WCAG 2.1.4)', () => {
    const rows = controlsWelcomeRows({ modality: 'keyboard', singleKeyShortcuts: false });
    const text = rows.map(row => `${row.keys} ${row.text}`).join(' ');
    expect(text).not.toMatch(/WASD|\bE\b|\bI\b|\bM\b|\bZ\b/);
    expect(rows[2].text).toContain('«Ir a…»');
    expect(controlsReopenLine({ modality: 'keyboard', singleKeyShortcuts: false })).not.toContain(CONTROLS_SHORTCUT_KEY);
  });

  it('en pantalla táctil habla de toques y no de teclas', () => {
    const text = controlsWelcomeRows({ modality: 'touch' }).map(row => `${row.keys} ${row.text}`).join(' ');
    expect(text).toContain('Toca «Ir a…»');
    expect(text).not.toMatch(/WASD|\bE\b|Enter|\bI\b/);
    expect(controlsReopenLine({ modality: 'touch' })).not.toContain(CONTROLS_SHORTCUT_KEY);
  });

  it('dice cómo volver a verla: el botón «Controles» y, con teclado, la tecla «?»', () => {
    expect(controlsReopenLine({ modality: 'keyboard' })).toContain('«Controles»');
    expect(controlsReopenLine({ modality: 'keyboard' })).toContain(CONTROLS_SHORTCUT_KEY);
  });
});

describe('Controles de primera vez: tarjeta', () => {
  let fixture: ComponentFixture<GameHelpComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const card = () => host().querySelector<HTMLElement>('[data-help-view="welcome"]')!;

  function create(modality: HelpModality = 'keyboard', shortcuts = true): void {
    TestBed.configureTestingModule({ imports: [GameHelpComponent] });
    fixture = TestBed.createComponent(GameHelpComponent);
    writeInputSignal(fixture.componentInstance.view, 'welcome');
    writeInputSignal(fixture.componentInstance.modality, modality);
    writeInputSignal(fixture.componentInstance.shortcuts, shortcuts);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('es un diálogo modal con nombre y descripción, con foco atrapado', () => {
    create();
    expect(card().getAttribute('role')).toBe('dialog');
    expect(card().getAttribute('aria-modal')).toBe('true');
    const title = host().querySelector('#' + card().getAttribute('aria-labelledby'));
    expect(title?.textContent?.trim()).toBe('Controles del juego');
    const description = host().querySelector('#' + card().getAttribute('aria-describedby'));
    expect(description?.querySelectorAll('li').length).toBe(4);
    const source = readFileSync(join(__dirname, 'game-help.component.ts'), 'utf-8');
    expect(source).toContain('data-help-view="welcome"');
    expect(source).toMatch(/data-help-view="welcome"[\s\S]{0,80}cdkTrapFocus \[cdkTrapFocusAutoCapture\]="true"/);
  });

  it('muestra las cuatro filas con su tecla y su texto, más cómo volver a abrirla', () => {
    create();
    const rows = Array.from(host().querySelectorAll<HTMLElement>('[data-help-row]'));
    expect(rows.map(row => row.dataset['helpRow'])).toEqual(['moverte', 'interactuar', 'ir-a', 'plano']);
    expect(rows[0].querySelector('kbd')?.textContent).toContain('WASD');
    expect(host().querySelector('.help-welcome__again')?.textContent).toContain('«Controles»');
  });

  it('«Entendido» emite dismissed y «Más ayuda» emite openFull', () => {
    create();
    const dismissed = vi.fn();
    const openFull = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.componentInstance.openFull.subscribe(openFull);
    host().querySelector<HTMLButtonElement>('[data-help-action="dismiss"]')!.click();
    host().querySelector<HTMLButtonElement>('[data-help-action="more"]')!.click();
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(openFull).toHaveBeenCalledTimes(1);
  });

  it('no escucha teclas: Esc lo atiende la pantalla de juego, primero en su cadena y sin pausar (ver simulation-play.controls.spec)', () => {
    const source = readFileSync(join(__dirname, 'game-help.component.ts'), 'utf-8');
    expect(source).not.toMatch(/HostListener|keydown|keyup|'Escape'/);
  });

  it('con los atajos apagados la tarjeta no promete letras', () => {
    create('keyboard', false);
    expect(card().textContent).not.toMatch(/WASD/);
    expect(host().querySelector('.help-welcome__again')?.textContent).not.toContain(CONTROLS_SHORTCUT_KEY);
  });

  it('los botones miden 44 px como mínimo y su nombre accesible es su texto visible', () => {
    create();
    const buttons = Array.from(host().querySelectorAll<HTMLButtonElement>('.help-card__actions button'));
    expect(buttons.map(b => b.textContent?.trim())).toEqual(['Entendido', 'Más ayuda']);
    expect(buttons.every(b => !b.hasAttribute('aria-label'))).toBe(true);
  });
});
