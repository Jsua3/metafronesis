import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { ClinicalToolState } from '../../core/models/simulation.model';
import { ORIENTATION_COPY } from './orientation.config';
import { ToolInventoryComponent } from './tool-inventory.component';

const source = readFileSync(join(__dirname, 'tool-inventory.component.ts'), 'utf-8');

const TOOLS: ClinicalToolState[] = [
  { code: 'PAP', label: 'Primeros Auxilios Psicológicos', icon: 'healing', category: 'A', description: 'Apoyo inicial en crisis.', active: true },
  { code: 'SPIKES', label: 'Protocolo EPICEE', icon: 'campaign', category: 'B', description: 'Comunicar noticias difíciles.', active: true },
  { code: 'RISK_METER', label: 'Valoración de riesgo', icon: 'speed', category: 'C', description: 'Estimar el riesgo.', active: true },
  { code: 'SAFETY_ROUTE', label: 'Ruta de seguridad', icon: 'alt_route', category: 'D', description: 'Activar la ruta.', active: true },
  { code: 'REFLECTION_JOURNAL', label: 'Bitácora reflexiva', icon: 'menu_book', category: 'E', description: 'Escribir lo vivido.', active: true },
];

type InputSignalNodeLike<T> = { applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void };

/** ts-jest no compila las entradas con `input()`: se escribe el valor en el nodo interno. */
function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

describe('ToolInventoryComponent: dock de herramientas (T7.3)', () => {
  let fixture: ComponentFixture<ToolInventoryComponent>;
  let dock: ToolInventoryComponent;
  let root: HTMLElement;
  let announce: ReturnType<typeof vi.fn>;

  function mount(inventory: string[] = ['PAP'], selected: string | null = null): void {
    announce = vi.fn();
    TestBed.configureTestingModule({
      imports: [ToolInventoryComponent],
      providers: [{ provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    fixture = TestBed.createComponent(ToolInventoryComponent);
    dock = fixture.componentInstance;
    writeInputSignal(dock.tools, TOOLS);
    writeInputSignal(dock.inventory, inventory);
    writeInputSignal(dock.selectedToolCode, selected);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  const cards = (): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button.tool-card'));
  const card = (code: string): HTMLButtonElement => cards()[TOOLS.findIndex(t => t.code === code)];

  afterEach(() => TestBed.resetTestingModule());

  describe('contador', () => {
    it('el aria-label de la barra dice «Herramientas {n} de {m}»', () => {
      mount(['PAP']);
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toMatch(/^Herramientas 1 de 5\./);
    });

    it('cambia al conseguir otra herramienta', () => {
      mount(['PAP']);
      writeInputSignal(dock.inventory, ['PAP', 'SPIKES', 'RISK_METER']);
      fixture.detectChanges();
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toMatch(/^Herramientas 3 de 5\./);
      expect(root.querySelector('.tool-count strong')?.textContent?.trim()).toBe('3 de 5');
    });

    it('sin herramientas en el mundo no pinta contador y la barra no se rompe', () => {
      mount([]);
      writeInputSignal(dock.tools, []);
      fixture.detectChanges();
      expect(root.querySelector('.tool-count')).toBeNull();
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toMatch(/^Herramientas 0 de 0\./);
    });

    it('el texto del contador y el motivo de las bloqueadas son los de ORIENTATION_COPY (una sola fuente)', () => {
      mount(['PAP']);
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toContain(ORIENTATION_COPY.ui.dockTools(1, 5));
      expect(card('SPIKES').getAttribute('title')).toContain(ORIENTATION_COPY.ui.dockLocked);
      expect(source).toContain(`'${ORIENTATION_COPY.ui.dockLocked}'`);
    });

    it('el contador visible no es parte del orden de lectura (la barra ya lo anuncia)', () => {
      mount();
      expect(root.querySelector('.tool-count')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('sin insignias numéricas', () => {
    it('no hay insignias 1-5: no existe ningún atajo de teclado para las herramientas', () => {
      mount(['PAP', 'SPIKES']);
      expect(root.querySelector('.tool-key')).toBeNull();
      expect(source).not.toContain('tool-key');
      expect(root.textContent).not.toMatch(/(^|\s)[1-5](\s|$)/);
    });
  });

  describe('ranuras bloqueadas', () => {
    it('usan aria-disabled y siguen siendo enfocables (nunca disabled): se llega a ellas con las flechas', () => {
      mount(['PAP']);
      const locked = card('SPIKES');
      expect(locked.getAttribute('aria-disabled')).toBe('true');
      expect(locked.disabled).toBe(false);
      expect(locked.hasAttribute('disabled')).toBe(false);
      locked.focus();
      expect(document.activeElement).toBe(locked);
    });

    it('las poseídas no están deshabilitadas', () => {
      mount(['PAP']);
      expect(card('PAP').getAttribute('aria-disabled')).not.toBe('true');
      expect(card('PAP').hasAttribute('disabled')).toBe(false);
    });

    it('el title de una bloqueada trae el nombre completo y cómo se consigue', () => {
      mount(['PAP']);
      const title = card('SPIKES').getAttribute('title') ?? '';
      expect(title).toContain('Protocolo EPICEE');
      expect(title).toContain('Se consigue explorando las salas del caso.');
    });

    it('el title de una poseída trae el nombre completo y para qué sirve', () => {
      mount(['PAP']);
      expect(card('PAP').getAttribute('title')).toBe('Primeros Auxilios Psicológicos — Apoyo inicial en crisis.');
    });

    it('el nombre accesible empieza por el texto visible (2.5.3) y dice el estado', () => {
      mount(['PAP']);
      const locked = card('SPIKES');
      expect(locked.getAttribute('aria-label')).toMatch(/^Protocolo EPICEE: /);
      expect(locked.getAttribute('aria-label')).toContain('No disponible');
      expect(locked.getAttribute('aria-label')).toContain('Se consigue explorando las salas del caso.');
      expect(card('PAP').getAttribute('aria-label')).toMatch(/^Primeros Auxilios Psicológicos: .*Disponible\.$/);
    });

    it('tocar una bloqueada no emite select y explica por qué: lo ve y se anuncia por las regiones vivas', () => {
      mount(['PAP']);
      const selected = vi.fn();
      dock.select.subscribe(selected);
      card('SPIKES').click();
      fixture.detectChanges();
      expect(selected).not.toHaveBeenCalled();
      const notice = root.querySelector('.tool-notice');
      expect(notice?.textContent).toContain('Protocolo EPICEE');
      expect(notice?.textContent).toContain('Se consigue explorando las salas del caso.');
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce.mock.calls[0][0]).toBe('Protocolo EPICEE: Se consigue explorando las salas del caso.');
      expect(announce.mock.calls[0][1]).toBe('polite');
    });

    it('el aviso desaparece al conseguir la herramienta y al elegir otra', () => {
      mount(['PAP']);
      card('SPIKES').click();
      fixture.detectChanges();
      expect(root.querySelector('.tool-notice')).not.toBeNull();

      writeInputSignal(dock.inventory, ['PAP', 'SPIKES']);
      fixture.detectChanges();
      expect(root.querySelector('.tool-notice')).toBeNull();

      card('RISK_METER').click();
      fixture.detectChanges();
      expect(root.querySelector('.tool-notice')).not.toBeNull();
      card('PAP').click();
      fixture.detectChanges();
      expect(root.querySelector('.tool-notice')).toBeNull();
    });

    it('sin aviso no hay nada en pantalla ni nada que anunciar', () => {
      mount(['PAP']);
      expect(root.querySelector('.tool-notice')).toBeNull();
      expect(root.querySelector('[role="status"]')).toBeNull();
      expect(announce).not.toHaveBeenCalled();
    });
  });

  describe('aviso de herramienta bloqueada con cierre (F6-5)', () => {
    const escape = () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event;
    };

    // req: BLOQUE-H, RNF-04, VD-29
    it('permanece hasta cerrarlo: no se apaga solo', () => {
      vi.useFakeTimers();
      try {
        mount(['PAP']);
        card('SPIKES').click();
        fixture.detectChanges();
        vi.advanceTimersByTime(30_000);
        fixture.detectChanges();
        expect(root.querySelector('.tool-notice')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('el botón «Cerrar aviso» lo retira y devuelve el foco a la ranura que lo pidió', () => {
      mount(['PAP']);
      card('SPIKES').focus();
      card('SPIKES').click();
      fixture.detectChanges();
      const close = root.querySelector<HTMLButtonElement>('.tool-notice__close')!;
      expect(close.getAttribute('aria-label')).toBe('Cerrar aviso');
      close.focus();
      close.click();
      fixture.detectChanges();
      expect(root.querySelector('.tool-notice')).toBeNull();
      expect(document.activeElement).toBe(card('SPIKES'));
    });

    it('Esc cierra SOLO el aviso (la pulsación se consume) y sin aviso no se toca', () => {
      mount(['PAP']);
      card('SPIKES').click();
      fixture.detectChanges();
      const first = escape();
      fixture.detectChanges();
      expect(first.defaultPrevented).toBe(true);
      expect(root.querySelector('.tool-notice')).toBeNull();
      // Con el aviso cerrado el Esc le toca a la cadena del juego (ayuda → bitácora → diálogo → pausa).
      expect(escape().defaultPrevented).toBe(false);
    });

    // req: REGLA-004 (revisión de F6: la cadena Esc ayuda → bitácora → diálogo → pausa no pierde pulsaciones)
    it('con el dock fuera de alcance (una capa abierta lo vuelve inerte) el aviso no consume el Esc', () => {
      mount(['PAP']);
      card('SPIKES').click();
      fixture.detectChanges();
      const footer = document.createElement('footer');
      footer.setAttribute('inert', '');
      document.body.appendChild(footer);
      footer.appendChild(root);
      try {
        const event = escape();
        expect(event.defaultPrevented).toBe(false);
        expect(root.querySelector('.tool-notice')).not.toBeNull();
      } finally {
        footer.remove();
      }
    });

    it('con el dock oculto a los lectores (aria-hidden) tampoco consume el Esc', () => {
      mount(['PAP']);
      card('SPIKES').click();
      fixture.detectChanges();
      const wrapper = document.createElement('div');
      wrapper.setAttribute('aria-hidden', 'true');
      document.body.appendChild(wrapper);
      wrapper.appendChild(root);
      try {
        expect(escape().defaultPrevented).toBe(false);
        expect(root.querySelector('.tool-notice')).not.toBeNull();
      } finally {
        wrapper.remove();
      }
    });

    it('el botón de cierre es el botón de icono de la biblioteca (cuadrado de 44 px), sin CSS propio', () => {
      mount(['PAP']);
      card('SPIKES').click();
      fixture.detectChanges();
      expect(root.querySelector('.tool-notice__close')?.classList).toContain('ui-icon-button');
      expect(source).not.toMatch(/\.tool-notice__close \{/);
    });
  });

  describe('barra de herramientas con teclado (F6-5, H-12)', () => {
    const press = (key: string) => {
      const target = document.activeElement as HTMLElement;
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    const tabStops = () => cards().filter(item => item.getAttribute('tabindex') === '0');

    // req: BLOQUE-H (H-12), RNF-04
    it('es UNA parada de tabulación: una ranura con tabindex 0 y las demás -1', () => {
      mount(['PAP', 'SPIKES']);
      expect(tabStops()).toHaveLength(1);
      expect(cards().filter(item => item.getAttribute('tabindex') === '-1')).toHaveLength(TOOLS.length - 1);
    });

    it('las flechas recorren las ranuras (también las bloqueadas) y Inicio y Fin van a los extremos', () => {
      mount(['PAP']);
      cards()[0].focus();
      press('ArrowRight');
      expect(document.activeElement).toBe(cards()[1]);
      press('ArrowRight');
      expect(document.activeElement).toBe(cards()[2]);
      press('End');
      expect(document.activeElement).toBe(cards()[TOOLS.length - 1]);
      press('Home');
      expect(document.activeElement).toBe(cards()[0]);
      press('ArrowLeft');
      expect(document.activeElement).toBe(cards()[TOOLS.length - 1]);
    });

    it('las flechas del recorrido se consumen: el mundo no las lee como pasos', () => {
      mount(['PAP']);
      cards()[0].focus();
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      cards()[0].dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('la barra conserva su nombre accesible y su rol de barra de herramientas horizontal', () => {
      mount(['PAP']);
      const toolbar = root.querySelector('[role="toolbar"]')!;
      expect(toolbar.getAttribute('aria-label')).toMatch(/^Herramientas 1 de 5\./);
      expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    });

    it('sin ninguna herramienta conseguida la barra sigue siendo navegable (las bloqueadas explican por qué)', () => {
      mount([]);
      expect(tabStops()).toHaveLength(1);
      cards()[0].focus();
      press('ArrowRight');
      expect(document.activeElement).toBe(cards()[1]);
      expect(cards()[1].getAttribute('aria-disabled')).toBe('true');
    });

    it('el foco con el ratón también fija la parada de tabulación', () => {
      mount(['PAP']);
      cards()[3].focus();
      fixture.detectChanges();
      expect(tabStops()).toEqual([cards()[3]]);
    });
  });

  describe('ranuras poseídas', () => {
    it('al activarlas emiten el código de la herramienta', () => {
      mount(['PAP']);
      const selected = vi.fn();
      dock.select.subscribe(selected);
      card('PAP').click();
      expect(selected).toHaveBeenCalledWith('PAP');
    });

    it('marcan la seleccionada', () => {
      mount(['PAP'], 'PAP');
      expect(card('PAP').classList).toContain('tool-card--selected');
      expect(card('SPIKES').classList).not.toContain('tool-card--selected');
    });
  });

  describe('vocabulario educativo (VD-24, borrador de Psicología)', () => {
    // req: RNF-04, BLOQUE-H
    it('la barra se llama «Inventario», no «Inventario clínico»', () => {
      mount(['PAP']);
      const label = root.querySelector('[role="toolbar"]')?.getAttribute('aria-label') ?? '';
      expect(label).toContain('Inventario;');
      expect(label).not.toMatch(/clínico/i);
    });
  });

  describe('contratos de fuente (CSS)', () => {
    const styles = source.slice(source.indexOf('styles: [`'));

    it('ningún texto del dock baja de 12 px (los iconos de Material no cuentan)', () => {
      const sizes: { selector: string; px: number }[] = [];
      for (const chunk of styles.split('}')) {
        const [selector, body] = chunk.split('{');
        if (!body || /mat-icon|\.tool-lock|@keyframes|@media/.test(selector)) continue;
        const match = body.match(/font-size:\s*([\d.]+)(rem|px)/);
        if (match) sizes.push({ selector: selector.trim(), px: match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]) });
      }
      // Bloque U1: los textos ya no declaran tamaños literales (la pestaña y el aviso usan fichas de tamaño), así que se exige que ninguno literal baje de 12 px y que el aviso use la ficha.
      expect(sizes.filter(s => s.px < 12)).toEqual([]);
      expect(styles).toMatch(/\.tool-notice \{[^}]*font-size: var\(--pixel-tam\);/);
    });

    // req: RNF-04, BLOQUE-H
    it('cada ranura mide al menos 44 px con cualquier puntero, no solo con dedo', () => {
      const base = styles.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      expect(base).toMatch(/\.tool-card \{[^}]*min-height: 44px;/);
    });

    it('el foco de la ranura es el anillo global del juego, hacia adentro porque el dock recorta lo que sale', () => {
      expect(styles).not.toMatch(/\.tool-card:focus-visible \{[^}]*outline:\s*\d+px solid/);
      expect(styles).toMatch(/\.tool-card:focus-visible \{[^}]*outline-offset: -3px;/);
    });

    it('las ranuras son fichas cuadradas de pixel de la hoja común (56 px, más que los 44 px) y el nombre queda en title, aria-label y la pestaña', () => {
      // Bloque U1: el modo compacto ya no encoge la ranura a 44 px; la ficha u-ranura mide 28 puntos de mundo y el nombre sale de la ranura.
      mount(['PAP']);
      for (const item of cards()) {
        expect(item.classList).toContain('u-ranura');
        expect(item.classList).toContain('u-sombra');
      }
      expect(styles).not.toMatch(/@media \(max-height: 520px\)/);
      expect(styles).toMatch(/\.tool-name \{ display: none; \}/);
      expect(card('PAP').getAttribute('title')).toContain('Primeros Auxilios Psicológicos');
    });

    it('las herramientas de O1 llevan el icono de pixel de su tira (cuadro 0) y las demás conservan el de Material; las bloqueadas ponen el candado de pixel', () => {
      // Bloque U1: el mat-icon de la herramienta y el de candado pasan a icono de pixel; el código desconocido sigue con Material.
      mount(['PAP']);
      const pap = card('PAP');
      expect(pap.querySelector('mat-icon')).toBeNull();
      expect(pap.querySelector('i.tool-card__icono')?.getAttribute('aria-hidden')).toBe('true');
      expect((pap.querySelector('i.tool-card__icono') as HTMLElement).style.backgroundImage).toContain('iconos/pap-20.png');
      expect((card('RISK_METER').querySelector('i.tool-card__icono') as HTMLElement).style.backgroundImage).toContain('iconos/risk-meter-20.png');
      expect(pap.querySelector('app-pixel-icono.tool-lock')).toBeNull();
      expect(card('SPIKES').querySelector('app-pixel-icono.tool-lock')).not.toBeNull();
      expect(card('SPIKES').querySelector('mat-icon')).toBeNull();
    });

    it('la pestaña suma el nombre de la ranura con foco o elegida y sigue oculta al lector', () => {
      // Bloque U1: las ranuras ya no muestran su nombre; la pestaña de la cuenta lo lleva.
      mount(['PAP']);
      const tab = () => root.querySelector('.tool-count')!;
      expect(tab().textContent).not.toContain('Primeros Auxilios');
      card('PAP').focus();
      fixture.detectChanges();
      expect(tab().textContent).toContain('Primeros Auxilios Psicológicos');
      expect(tab().getAttribute('aria-hidden')).toBe('true');
      card('PAP').blur();
      fixture.detectChanges();
      expect(tab().textContent).not.toContain('Primeros Auxilios');
    });

    it('el dock no deshabilita de verdad ni oculta las bloqueadas al lector (soft-disabled del patrón)', () => {
      mount(['PAP']);
      const locked = cards().filter(item => item.getAttribute('aria-disabled') === 'true');
      expect(locked.length).toBeGreaterThan(0);
      for (const item of locked) {
        expect(item.hasAttribute('disabled')).toBe(false);
        expect(item.hasAttribute('inert')).toBe(false);
        expect(item.hasAttribute('aria-hidden')).toBe(false);
      }
      // Ni `[attr.disabled]` ni `softDisabled` en falso: sacarían las bloqueadas del recorrido por teclado.
      expect(source).not.toMatch(/\[attr\.disabled\]|\[softDisabled\]="false"|softDisabled="false"/);
    });
  });
});
