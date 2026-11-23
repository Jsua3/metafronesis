import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import type { CharacterVisual } from '../character/kit/character-visual.resolver';
import { ORIENTATION_COPY } from './orientation.config';
import { SimulationHudComponent } from './simulation-hud.component';

const hudSource = readFileSync(join(__dirname, 'simulation-hud.component.ts'), 'utf-8');

const ATTEMPT = {
  attemptId: 'a-1',
  caseTitle: 'Violencia familiar',
  persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
  currentNode: { key: 'hospital-urgencias', title: 'Urgencia vital y crisis', intensity: 'MEDIUM' },
} as unknown as SimulationAttemptState;

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

/** ts-jest no compila las entradas con `input()`: se escribe el valor en el nodo interno, como en el panel de diálogo. */
function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

function installMatchMedia(coarse: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe('HUD: cabecera (T7.1) y Ajustes (T7.2)', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let hud: SimulationHudComponent;
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  function mount(coarse = false, inputs: Record<string, unknown> = {}): HTMLElement {
    installMatchMedia(coarse);
    TestBed.configureTestingModule({ imports: [SimulationHudComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(SimulationHudComponent);
    hud = fixture.componentInstance;
    const signals = hud as unknown as Record<string, () => unknown>;
    writeInputSignal(signals['attempt'], ATTEMPT);
    for (const [name, value] of Object.entries(inputs)) writeInputSignal(signals[name], value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const button = (root: HTMLElement, name: string): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

  function openSettings(root: HTMLElement): void {
    hud.settingsOpen.set(true);
    fixture.detectChanges();
    expect(root.querySelector('#game-settings-menu')).not.toBeNull();
  }

  const settingsRow = (root: HTMLElement, text: string): HTMLButtonElement | undefined =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('#game-settings-menu > button'))
      .find(b => (b.textContent ?? '').includes(text));

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  });

  // Bloque U1, variante B (placas en las esquinas): el HUD es el grupo de la derecha (caso, persona y teclas); la etapa va
  // en la pestaña de la ficha del objetivo y la sala en la del plano (pruebas en simulation-play).
  describe('grupo de la derecha', () => {
    it('la etapa ya no se pinta aquí: la lleva la pestaña de la ficha del objetivo', () => {
      const root = mount(false, { stageLabel: 'Decisión 2 de 6' });
      expect(root.querySelector('.hud-stage-chip')).toBeNull();
      expect(root.textContent).not.toContain('Decisión 2 de 6');
    });

    it('el caso va en la pestaña de pixel sobre la placa de la persona y las teclas', () => {
      const root = mount();
      expect(root.querySelector('.hud-case.u-rotulo')).not.toBeNull();
      expect(root.querySelector('.hud-strip.u-placa .hud-persona')).not.toBeNull();
      expect(root.querySelectorAll('.hud-strip .hud-action.u-tecla--icono').length).toBe(5);
    });

    it('el contador antiguo «Paso k (k/6)» ya no existe: ni bloque ni cálculo', () => {
      const root = mount(false, { stageLabel: 'Decisión 1 de 6' });
      expect(root.querySelector('.hud-step')).toBeNull();
      expect(root.textContent).not.toMatch(/Paso\s+\d/);
      expect(hudSource).not.toContain('sceneProgress');
      expect(hudSource).not.toContain('hud-step');
    });

  });

  describe('atajos de una tecla (F6-10, WCAG 2.1.4)', () => {
    // req: BLOQUE-H (H-07), RNF-04
    it('activos y con puntero fino la bitácora anuncia (J) y Ajustes trae su fila «Atajos de una tecla» en Sí', () => {
      const root = mount(false);
      expect(button(root, 'Abrir bitácora reflexiva (J)')).not.toBeNull();
      openSettings(root);
      const row = settingsRow(root, 'Atajos de una tecla')!;
      expect(row.getAttribute('aria-pressed')).toBe('true');
      expect(row.querySelector('strong')?.textContent?.trim()).toBe('Sí');
    });

    it('apagados, ni el nombre accesible ni el título ni la fila de Ajustes prometen la J', () => {
      const root = mount(false, { shortcuts: false });
      const journal = button(root, 'Abrir bitácora reflexiva')!;
      expect(journal).not.toBeNull();
      expect(journal.getAttribute('title')).toBe('Bitácora');
      openSettings(root);
      expect(settingsRow(root, 'Bitácora')?.querySelector('strong')?.textContent?.trim()).toBe('');
      const row = settingsRow(root, 'Atajos de una tecla')!;
      expect(row.getAttribute('aria-pressed')).toBe('false');
      expect(row.querySelector('strong')?.textContent?.trim()).toBe('No');
      expect(root.innerHTML).not.toContain('(J)');
    });

    it('la fila de Ajustes pide alternar el ajuste', () => {
      const root = mount(false);
      const toggled = vi.fn();
      hud.toggleShortcuts.subscribe(toggled);
      openSettings(root);
      settingsRow(root, 'Atajos de una tecla')!.click();
      expect(toggled).toHaveBeenCalledTimes(1);
    });
  });

  describe('acceso a «Ir a…» (F6-11)', () => {
    // req: BLOQUE-H H-06, RNF-04
    it('hay un botón con nombre claro que pide la lista y no lleva atajo de teclado en el nombre', () => {
      const root = mount();
      const places = root.querySelector<HTMLButtonElement>('button[data-hud-places]')!;
      expect(places).not.toBeNull();
      expect(places.getAttribute('aria-label')).toBe('Ir a… personas y puertas de la sala');
      expect(places.getAttribute('title')).toBe('Ir a…');
      // Icono de pixel (U1): la flecha de «ir a», decorativa.
      expect(places.querySelector('app-pixel-icono[aria-hidden="true"]')).not.toBeNull();
      expect(hudSource).toContain('data-hud-places (click)="openPlaces.emit()"');
      expect(hudSource).toContain('<app-pixel-icono nombre="ir-a" />');
      expect(hudSource).toMatch(/readonly openPlaces = output<void>\(\);/);
    });
  });

  describe('botón de ayuda', () => {
    it('existe con el nombre accesible «Abrir cómo se juega» y emite openHelp', () => {
      const root = mount();
      const help = button(root, 'Abrir cómo se juega');
      expect(help).not.toBeNull();
      expect(help?.getAttribute('title')).toBe('Cómo se juega');
      expect(help?.querySelector('app-pixel-icono')).not.toBeNull();
      expect(hudSource).toContain('<app-pixel-icono nombre="ayuda" />');
      const emitted = vi.fn();
      hud.openHelp.subscribe(emitted);
      help!.click();
      expect(emitted).toHaveBeenCalledTimes(1);
    });
  });

  describe('una sola fuente del copy', () => {
    it('los textos de ayuda del HUD son los de ORIENTATION_COPY', () => {
      const root = mount();
      const help = button(root, ORIENTATION_COPY.ui.helpAriaLabel);
      expect(help).not.toBeNull();
      expect(help?.getAttribute('title')).toBe(ORIENTATION_COPY.ui.helpTitle);
      openSettings(root);
      expect(settingsRow(root, ORIENTATION_COPY.ui.settingsHelpRow)).toBeDefined();
      expect(settingsRow(root, ORIENTATION_COPY.ui.settingsHelpAgain)).toBeDefined();
    });
  });

  describe('atajos de teclado en el nombre accesible', () => {
    it('con puntero fino la bitácora anuncia (J)', () => {
      const root = mount(false);
      expect(button(root, 'Abrir bitácora reflexiva (J)')).not.toBeNull();
      expect(button(root, 'Abrir bitácora reflexiva (J)')?.getAttribute('title')).toBe('Bitácora (J)');
    });

    it('con puntero grueso (táctil) no hay (J) en el nombre ni en el título', () => {
      const root = mount(true);
      const journal = button(root, 'Abrir bitácora reflexiva');
      expect(journal).not.toBeNull();
      expect(journal?.getAttribute('title')).toBe('Bitácora');
      expect(root.innerHTML).not.toContain('(J)');
    });

    it('en Ajustes la fila «Bitácora» solo muestra la tecla J con puntero fino', () => {
      const fine = mount(false);
      openSettings(fine);
      expect(settingsRow(fine, 'Bitácora')?.querySelector('strong')?.textContent?.trim()).toBe('J');
      TestBed.resetTestingModule();

      const coarse = mount(true);
      openSettings(coarse);
      expect(settingsRow(coarse, 'Bitácora')?.querySelector('strong')?.textContent?.trim()).toBe('');
    });
  });

  describe('«Volver al catálogo» frente a la salida segura', () => {
    it('usa el icono de casa, no el de salida', () => {
      const root = mount();
      const home = root.querySelector('a[aria-label="Volver al catálogo de simulaciones"]');
      expect(home).not.toBeNull();
      // La casa de pixel (U1), no la puerta de «Salida segura».
      expect(home?.querySelector('app-pixel-icono')).not.toBeNull();
      expect(hudSource).toContain('<app-pixel-icono nombre="inicio" />');
      expect(hudSource).not.toContain('nombre="salida"');
      expect(root.textContent).not.toContain('logout');
      expect(root.textContent).not.toContain('exit_to_app');
    });
  });

  describe('filas nuevas de Ajustes', () => {
    it('«Cómo se juega» emite openHelp y cierra Ajustes', () => {
      const root = mount();
      openSettings(root);
      const emitted = vi.fn();
      hud.openHelp.subscribe(emitted);
      settingsRow(root, 'Cómo se juega')!.click();
      fixture.detectChanges();
      expect(emitted).toHaveBeenCalledTimes(1);
      expect(hud.settingsOpen()).toBe(false);
    });

    it('«Ver la ayuda otra vez» borra la clave siep.ayuda.v1 y avisa con helpReset', () => {
      localStorage.setItem('siep.ayuda.v1', JSON.stringify({ v: 1, vistas: ['primero'] }));
      localStorage.setItem('otra-clave', 'se conserva');
      const root = mount();
      openSettings(root);
      const reset = vi.fn();
      hud.helpReset.subscribe(reset);
      settingsRow(root, 'Ver la ayuda otra vez')!.click();
      fixture.detectChanges();
      expect(localStorage.getItem('siep.ayuda.v1')).toBeNull();
      expect(localStorage.getItem('otra-clave')).toBe('se conserva');
      expect(reset).toHaveBeenCalledTimes(1);
      // El menú sigue abierto y lo dice con una región viva (no depende solo del color o del icono).
      expect(root.querySelector('#game-settings-menu [role="status"]')?.textContent).toContain('volverá a mostrarse');
    });

    it('si el almacenamiento está bloqueado, borrar la ayuda no rompe nada', () => {
      const root = mount();
      openSettings(root);
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('bloqueado', 'SecurityError');
      });
      const reset = vi.fn();
      hud.helpReset.subscribe(reset);
      expect(() => settingsRow(root, 'Ver la ayuda otra vez')!.click()).not.toThrow();
      expect(reset).toHaveBeenCalledTimes(1);
      removeItem.mockRestore();
    });

    it('las filas nuevas no añaden oyentes globales', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const root = mount();
      openSettings(root);
      const keyboard = add.mock.calls.filter(([type]) => String(type).startsWith('key'));
      // Solo el de Escape de Ajustes (con filtro .escape) puede existir: ninguno genérico.
      for (const [type] of keyboard) expect(type).toBe('keydown');
      expect(hudSource).not.toMatch(/@HostListener\('document:keydown',/);
      expect(hudSource.match(/@HostListener\(/g)).toHaveLength(1);
      add.mockRestore();
    });
  });

  describe('avance formativo (F6-3; RN-08 y RN-09)', () => {
    // req: RN-08, RN-09, RNF-04
    it('por defecto no hay marcador: sin etiqueta de avance no queda nada, y nunca hay puntos', () => {
      const root = mount();
      expect(root.querySelector('.hud-score')).toBeNull();
      expect(root.textContent).not.toMatch(/puntos|Puntaje|Seguimiento formativo/i);
    });

    it("'hidden' no deja hueco: ni el marcador ni nada en su lugar", () => {
      const root = mount(false, { scoreMarker: 'hidden', progressLabel: 'Decisión 2 de 6' });
      expect(root.querySelector('.hud-score')).toBeNull();
    });

    it("'progress' dice el avance con su propio texto", () => {
      const root = mount(false, { scoreMarker: 'progress', progressLabel: 'Decisión 2 de 6' });
      const score = root.querySelector('.hud-score')!;
      expect(score.textContent).toContain('Decisión 2 de 6');
      expect(score.getAttribute('aria-label') ?? '').not.toMatch(/puntos/i);
    });

    it('la fuente ya no sabe de puntos ni de acumulado', () => {
      expect(hudSource).not.toMatch(/accumulatedScore|'points'/);
    });
  });

  describe('la persona en palabras (sin cifras)', () => {
    // req: RNF-04, BLOQUE-H
    const fakeVisual = {
      key: 'kit-sobreviviente', recipeId: 'sobreviviente',
      idle: { kind: 'url', url: 'idle.png' }, walk: { kind: 'url', url: 'walk.png' },
      portraits: {
        neutral: { kind: 'url', url: 'portrait-neutral.png' },
        preocupada: { kind: 'url', url: 'portrait-preocupada.png' },
        triste: { kind: 'url', url: 'portrait-triste.png' },
        alegre: { kind: 'url', url: 'portrait-alegre.png' },
      },
    } as unknown as CharacterVisual;

    it('muestra la frase de la persona como texto y como nombre accesible, sin ninguna cifra de métrica', () => {
      const root = mount();
      const block = root.querySelector('.hud-persona')!;
      expect(block.textContent).toContain('se muestra cautelosa y tensa');
      expect(block.getAttribute('aria-label')).toBe('se muestra cautelosa y tensa');
      expect(block.getAttribute('aria-label')).not.toMatch(/\d/);
    });

    it('el HUD entero no pinta ningún dígito de métrica: ni «N %», ni «Puntaje», ni «Estrés», ni medidores', () => {
      const root = mount(false, { stageLabel: 'Decisión 2 de 6', locationLabel: 'Urgencias' });
      const text = root.textContent ?? '';
      expect(text).not.toMatch(/\d+\s?%/);
      expect(text).not.toMatch(/Puntaje|Estrés|Confianza|Bienestar/i);
      expect(root.querySelector('[role="meter"]')).toBeNull();
      expect(root.querySelector('.heart, .hud-hearts, .stress-pct, .mini-track')).toBeNull();
    });

    it('sin retrato del kit queda solo con palabras', () => {
      const root = mount();
      expect(root.querySelector('app-kit-figure')).toBeNull();
      expect(root.querySelector('.hud-persona')!.classList.contains('hud-persona--text-only')).toBe(true);
    });

    it.each([
      ['WITHDRAWN', 'CALM', 'triste'],
      ['GUARDED', 'TENSE', 'preocupada'],
      ['OPEN', 'CALM', 'alegre'],
      ['GUARDED', 'CALM', 'preocupada'],
      ['OPEN', 'CRISIS', 'triste'],
    ] as const)('el retrato cambia de expresión con la persona (%s y %s → %s con el kit de cuatro estados)', (bond, activation, esperado) => {
      mount(false, {
        patientVisual: fakeVisual,
        attempt: { ...ATTEMPT, persona: { bond, activation, label: 'x' } },
      });
      expect(hud.portraitState()).toBe(esperado);
      const figure = (fixture.nativeElement as HTMLElement).querySelector('app-kit-figure .kit-figure') as HTMLElement | null;
      expect(figure?.style.backgroundImage ?? '').toContain(`portrait-${esperado}.png`);
    });

    it('el borde del HUD sigue a la activación y no a una cifra', () => {
      const root = mount(false, { attempt: { ...ATTEMPT, persona: { bond: 'GUARDED', activation: 'CRISIS', label: 'x' } } });
      expect(root.querySelector('.hud-shell')!.classList.contains('hud--crisis')).toBe(true);
      expect(hudSource).not.toMatch(/stress|accumulatedScore|trustLevel|emotionalState/i);
    });
  });

  describe('menú de Ajustes en la capa superior', () => {
    // ts-jest no compila las consultas con `viewChild()` (igual que las entradas con `input()`): el efecto que
    // abre el popover solo corre en el navegador, donde se comprobó jugando (`:popover-open` en 844x390).
    it('el menú es un popover manual y se abre con showPopover protegido por try/catch', () => {
      expect(hudSource).toMatch(/<div #settingsMenu id="game-settings-menu" class="settings-menu" popover="manual"/);
      expect(hudSource).toMatch(/try \{\s*menu\.showPopover\?\.\(\);\s*\} catch \{/);
    });

    it('sin soporte de popover el menú se abre igual (menú fijo con z-index)', () => {
      const root = mount();
      expect(() => openSettings(root)).not.toThrow();
      expect(hudSource).toMatch(/\.settings-menu \{\s*position: fixed;/);
    });

    it('la cabecera del menú queda fija al desplazarlo y el menú no pasa del alto de la pantalla', () => {
      expect(hudSource).toMatch(/\.settings-menu__header \{[^}]*position: sticky;/);
      expect(hudSource).toMatch(/\.settings-menu \{[^}]*max-height: calc\(100dvh - var\(--hud-menu-top, 53px\) - 12px\);[^}]*overflow-y: auto;/);
    });
  });

  describe('contratos de fuente (CSS)', () => {
    it('el nombre del caso solo se muestra con ancho de sobra: antes la sala se colapsaba a 35 px a 1200', () => {
      expect(hudSource).toMatch(/@media \(max-width: 1359px\) \{\s*\.hud-case \{ display: none; \}/);
    });

    // Bloque U1: los tamaños del HUD salen de las fichas de pixel (tokens/_pixel.scss), que no bajan de 12 px.
    it('ningún texto del HUD baja de 12 px', () => {
      const styles = hudSource.slice(hudSource.indexOf('styles: [`'), hudSource.indexOf('`]\n})'));
      const tamanos = [...styles.matchAll(/font-size:\s*([^;]+);/g)].map(m => m[1].trim())
        .filter(valor => !/^18px$/.test(valor)); // los iconos de Material de las filas de Ajustes
      expect(tamanos.length).toBeGreaterThan(4);
      expect(tamanos.filter(valor => !/^var\(--pixel-(tam|letra-chica|letra-media)\)$/.test(valor))).toEqual([]);
      const fichas = readFileSync(join(__dirname, '../../../styles/tokens/_pixel.scss'), 'utf-8');
      expect(fichas).toContain('--pixel-letra-chica: max(12px, 0.8em);');
      expect(fichas).toContain('--pixel-letra-media: max(12px, 0.88em);');
      // Escala única (V7): la letra base es continua, con piso de 12 px y techo de 16 px.
      expect(fichas).toMatch(/--pixel-tam: clamp\(12px, [^;]+, 16px\);/);
    });

    it('en compacto el grupo de la esquina mide lo que sus teclas de 44 px y su marco', () => {
      expect(hudSource).toMatch(
        /@media \(max-height: 520px\), \(pointer: coarse\) and \(orientation: landscape\) \{[\s\S]*?\.hud-strip \{ padding: 0; \}[\s\S]*?\.hud-case \{ display: none; \}/,
      );
    });

    /** El CSS del componente sin los bloques `@media`: lo que vale con cualquier puntero y cualquier tamaño. */
    function baseStyles(): string {
      const styles = hudSource.slice(hudSource.indexOf('styles: [`'), hudSource.indexOf('`]\n})'));
      return styles.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    }

    // req: RNF-04, BLOQUE-H. Escala única (U1, V7): las teclas de la cabecera miden tres veces la letra, entre 44 y 48 px con
    // cualquier puntero (la guarda de 44 px no se afloja); las filas de Ajustes siguen en 44 px.
    it('las teclas de la cabecera siguen la escala sin bajar de 44 px con cualquier puntero, y las de Ajustes miden 44 px', () => {
      const base = baseStyles();
      expect(base).toMatch(/\.hud-action \{[^}]*width: var\(--tecla-hud, 44px\);[^}]*height: var\(--tecla-hud, 44px\);/);
      const fichas = readFileSync(join(__dirname, '../../../styles/tokens/_pixel.scss'), 'utf-8');
      expect(fichas).toContain('--tecla-hud: clamp(44px, calc(var(--pixel-tam) * 3), 48px);');
      expect(fichas).not.toMatch(/--tecla-hud: [^;]*3[0-9]px/);
      expect(base).toMatch(/\.settings-menu__header button \{[^}]*width: 44px;[^}]*height: 44px;/);
      expect(base).toMatch(/\.settings-menu > button,\s*\.settings-menu > a \{[^}]*min-height: 44px;/);
    });

    it('nada del HUD anima width y ya no quedan barras ni pulsos de estrés', () => {
      expect(hudSource).not.toMatch(/transition:[^;]*\bwidth\b/);
      expect(hudSource).not.toMatch(/mini-track|stress-pulse|hud-hearts/);
    });

    it('el anillo de foco de los botones es el global de la piel del juego: sin anillo local con literales', () => {
      expect(hudSource).not.toMatch(/\.hud-action:focus-visible/);
    });

    it('en compacto Ajustes se reparte en dos columnas para caber sin desplazarse en 390 px de alto', () => {
      expect(hudSource).toMatch(
        /@media \(max-height: 520px\), \(pointer: coarse\) and \(orientation: landscape\) \{[\s\S]*?\.settings-menu \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
      );
      expect(hudSource).toMatch(/\.settings-menu__header \{ grid-column: 1 \/ -1; \}/);
    });

    // Bloque U1: sin zona central; lo único que puede crecer es la frase de la persona, que se recorta antes de empujar las teclas.
    it('nada del grupo de la derecha desborda sobre sus vecinos (HUD-10)', () => {
      expect(hudSource).toMatch(/\.hud-persona-label \{[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/);
      expect(hudSource).toMatch(/\.hud-persona \{[^}]*min-width: 0;/);
    });
  });
});
