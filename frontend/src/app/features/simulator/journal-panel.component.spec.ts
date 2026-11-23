import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from '../../../styles/contrast.util';

import { AudioDirectorService } from './audio-director.service';
import { JournalPanelComponent } from './journal-panel.component';
import type { Mock } from 'vitest';

const source = readFileSync(join(__dirname, 'journal-panel.component.ts'), 'utf-8');

// ts-jest no aplica la transformación JIT de Angular a los inputs con signals: se escribe el nodo interno.
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

describe('JournalPanelComponent: salida segura en la bitácora (T12.2, REGLA-004)', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;
  let playSfx: Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const safeExitButton = () =>
    host().querySelector<HTMLButtonElement>('.sheet-footer app-safe-exit-button button');

  beforeEach(() => {
    playSfx = vi.fn();
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx } }],
    });
    fixture = TestBed.createComponent(JournalPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('el pie de la bitácora ofrece «Salida segura» junto a «Continuar simulación»', () => {
    const button = safeExitButton();
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Salida segura');
    const footerButtons = Array.from(host().querySelectorAll('.sheet-footer button')).map(b => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(footerButtons.some(text => text?.includes('Continuar simulación'))).toBe(true);
  });

  it('el botón de salida segura reenvía su evento pause como la salida safeExit de la bitácora', () => {
    // ts-jest no aplica la transformación JIT de Angular a `output()`: un `(pause)` de la plantilla
    // se trata como evento DOM y no se dispara desde aquí. El cableado se fija sobre el fuente
    // y se comprueba jugando; la emisión del propio botón la cubre safe-exit-button.component.spec.ts.
    expect(source).toMatch(/<app-safe-exit-button\s+data-hide-key\s+\[pausing\]="pausing\(\)"\s+\(pause\)="safeExit\.emit\(\)"\s*\/>/);
    expect(source).toMatch(/readonly safeExit = output<void>\(\);/);
    // En la bitácora Esc la cierra: el botón no promete Esc.
    expect(host().querySelector('.sheet-footer app-safe-exit-button')?.hasAttribute('data-hide-key')).toBe(true);
    const safeExit = vi.fn();
    fixture.componentInstance.safeExit.subscribe(safeExit);
    fixture.componentInstance.safeExit.emit();
    expect(safeExit).toHaveBeenCalledTimes(1);
  });

  it('el botón de salida no es el botón de cerrar (cada uno conserva su salida)', () => {
    const safeExit = vi.fn();
    const closeSheet = vi.fn();
    fixture.componentInstance.safeExit.subscribe(safeExit);
    fixture.componentInstance.closeSheet.subscribe(closeSheet);

    host().querySelector<HTMLButtonElement>('.continue-btn')?.click();

    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(safeExit).not.toHaveBeenCalled();
  });

  it('la salida segura sigue activa con el guardado deshabilitado (intento no en curso o ocupado)', () => {
    // `disabled` apaga el textarea y «Guardar»; la salida segura nunca depende de él.
    const button = safeExitButton();
    expect(button?.disabled).toBe(false);
  });

  it('en pantallas bajas las columnas se desplazan por dentro y el pie con la salida segura no se solapa', () => {
    expect(source).toMatch(/@media \(max-height: 520px\) \{[^}]*\.journal-modal \{[^}]*\}\s*\.journal-columns \{ overflow-y: auto; \}/);
    // El pie no se parte en dos filas con los dos botones y la nota cede ancho.
    expect(source).toMatch(/\.footer-actions \{[^}]*flex-shrink: 0;/);
    expect(source).toMatch(/\.encrypt-note \{[^}]*flex: 1 1 0; min-width: 0;/);
  });
});

describe('JournalPanelComponent: «Guardar» con motivo y campo legible (F6-5)', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const save = () => host().querySelector<HTMLButtonElement>('.journal-write button[ui-button]')!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    });
    fixture = TestBed.createComponent(JournalPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  // req: BLOQUE-H, RNF-04
  it('sin texto «Guardar bitácora» no se deshabilita: queda aria-disabled y dice por qué', () => {
    expect(save().hasAttribute('disabled')).toBe(false);
    expect(save().getAttribute('aria-disabled')).toBe('true');
    const reasonId = save().getAttribute('aria-describedby')!;
    expect(host().querySelector('#' + reasonId)?.textContent?.trim()).toBe('Escribe tu reflexión para guardar');
  });

  it('con texto se puede guardar y emite lo escrito', () => {
    const saved = vi.fn();
    fixture.componentInstance.save.subscribe(saved);
    fixture.componentInstance.text = 'Observé señales de riesgo';
    fixture.detectChanges();
    expect(save().getAttribute('aria-disabled')).toBeNull();
    save().click();
    expect(saved).toHaveBeenCalledWith('Observé señales de riesgo');
  });

  it('guardando muestra su estado, queda ocupado y no envía dos veces', () => {
    const saved = vi.fn();
    fixture.componentInstance.save.subscribe(saved);
    fixture.componentInstance.text = 'Observé señales de riesgo';
    writeInputSignal(fixture.componentInstance.saveState, 'saving');
    fixture.detectChanges();
    expect(save().getAttribute('aria-busy')).toBe('true');
    expect(save().textContent).toContain('Guardando…');
    save().click();
    expect(saved).not.toHaveBeenCalled();
  });

  it('el borde del campo es el token de borde fuerte de la piel del juego y llega a 3:1', () => {
    expect(source).toMatch(/textarea \{[^}]*border: 1px solid var\(--ds-border-strong\);/);
    const tokens = readFileSync(join(__dirname, '../../../styles/tokens/_color.scss'), 'utf-8');
    const border = tokens.match(/\$game: \([\s\S]*?border-strong: (#[0-9A-Fa-f]{6})/)?.[1] ?? '';
    expect(border).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // Peor caso: el fondo de la bitácora (rgba(13,18,32,.96)) sobre un píxel blanco del mapa.
    expect(contrastRatio(border, blend('#0D1220', 0.96, '#FFFFFF'))).toBeGreaterThanOrEqual(3);
  });

  it('ningún texto de la bitácora baja de 12 px (0,75 rem)', () => {
    const styles = source.slice(source.indexOf('styles: [`'));
    const small: string[] = [];
    for (const chunk of styles.split('}')) {
      const [selector, body] = chunk.split('{');
      if (!body) continue;
      for (const match of body.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
        const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
        if (px < 12) small.push(selector.trim().split('\n').pop() + ' → ' + match[0]);
      }
    }
    expect(small).toEqual([]);
  });
});

describe('JournalPanelComponent: «Trazabilidad» con los títulos completos', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    });
    fixture = TestBed.createComponent(JournalPanelComponent);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('lista cada etapa visitada con su título completo, sin recortes ni elipsis', () => {
    // Antes la API los recortaba a 14 caracteres y ambos quedaban «Consultorio: …».
    const stages = ['Consultorio: protección y marco', 'Consultorio: acción técnica y ética'];
    writeInputSignal(fixture.componentInstance.timeline, stages);
    fixture.detectChanges();

    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.journal-context ol li'))
      .map(item => item.textContent?.trim());
    expect(items).toEqual(stages);
  });

  it('un título largo sin espacios se parte en lugar de desbordar la columna', () => {
    expect(source).toMatch(/\.journal-context li \{[^}]*overflow-wrap: anywhere;/);
  });
});

// req: RNF-004, WCAG 2.4.3 (plan visual F9-2: al cerrar la bitácora el foco no se pierde)
describe('JournalPanelComponent: el foco vuelve a donde estaba al cerrarse', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;
  let opener: HTMLButtonElement;
  const added: HTMLElement[] = [];

  /** Un botón fuera del panel que tiene el foco, como el de la bitácora en la cabecera del juego. */
  function addFocusable(tag: 'button' | 'div' = 'button', id?: string): HTMLButtonElement {
    const element = document.createElement(tag) as HTMLButtonElement;
    if (id) element.id = id;
    if (tag === 'div') element.tabIndex = -1;
    document.body.appendChild(element);
    added.push(element);
    return element;
  }

  async function setOpen(open: boolean): Promise<void> {
    writeInputSignal(fixture.componentInstance.open, open);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    });
    fixture = TestBed.createComponent(JournalPanelComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    opener = addFocusable();
    opener.focus();
  });

  afterEach(() => {
    fixture.destroy();
    added.splice(0).forEach(element => element.remove());
    TestBed.resetTestingModule();
  });

  it('vuelve al botón que la abrió', async () => {
    await setOpen(true);
    // El foco entró al panel (su botón de cerrar o el primer control).
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('button')?.focus();
    expect(document.activeElement).not.toBe(opener);

    await setOpen(false);

    expect(document.activeElement, 'el foco regresó al botón que abrió la bitácora').toBe(opener);
  });

  it('si quien la abrió ya no existe (un menú que se cerró) el foco va al contenedor del juego, no a <body>', async () => {
    const game = addFocusable('div', 'game-area');
    await setOpen(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('button')?.focus();
    opener.remove();

    await setOpen(false);

    expect(document.activeElement).toBe(game);
  });

  it('si otra capa tomó el foco al cerrarse (la pausa) no se lo quita', async () => {
    const other = addFocusable();
    await setOpen(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('button')?.focus();
    writeInputSignal(fixture.componentInstance.open, false);
    other.focus();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(other);
  });

  it('abierta sin que nada tuviera el foco (tecla J con el foco en <body>) no inventa un destino al abrir', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await setOpen(true);
    await setOpen(false);

    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});
