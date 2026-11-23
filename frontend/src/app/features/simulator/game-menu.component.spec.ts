// Phaser toca canvas/WebGL al importarse (jsdom no lo soporta). Solo se evalúa
// `extends Phaser.Scene` al cargar el módulo; estos tests de instancia nunca
// arrancan la escena (boot() requiere el template, que ts-jest no renderiza).
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
    Game: class {},
  },
}));

import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMPTY, NEVER, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { GameHelpComponent } from './game-help.component';
import Phaser from 'phaser';

import { ClinicMenuScene, GameMenuComponent, lobbyKeyboardHint } from './game-menu.component';
import { lobbyMotion } from './lobby-avatar.util';
import { ORIENTATION_COPY, SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import type { Mock } from 'vitest';

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    caseVersionId: 7,
    title: 'Caso demo',
    unlocked: true,
    completed: false,
    ...overrides,
  } as CatalogItem;
}

describe('GameMenuComponent — entrada fiable al caso (GAME-09)', () => {
  let component: GameMenuComponent;
  let router: { navigate: Mock };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GameMenuComponent],
      providers: [
        { provide: SimulationService, useValue: { getCatalog: vi.fn(() => EMPTY) } },
        { provide: Router, useValue: router },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
      ],
    });
    component = TestBed.createComponent(GameMenuComponent).componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RF-16, CU-07 (F10-1: la puerta lleva primero a la ficha del caso, que no crea el intento)
  it('una puerta disponible navega exactamente UNA vez, a la ficha del caso', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    expect(component.entering()).toBe('Caso demo');
    vi.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador', 7, 'ficha']);
  });

  // req: RNF-04 (plan visual F5-3: sin la espera ficticia de 900 ms)
  it('entrar navega al instante, sin espera ficticia', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador', 7, 'ficha']);
  });

  it('una puerta bloqueada nunca navega', () => {
    component.catalog.set([makeItem({ unlocked: false })]);
    component.enter(7);
    expect(component.entering()).toBe('');
    vi.advanceTimersByTime(1000);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('dobles entradas durante la transición no duplican la navegación', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    component.enter(7); // E + click casi simultáneos
    vi.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('enterFocused (tecla E DOM) entra a la puerta enfocada disponible', () => {
    component.catalog.set([makeItem()]);
    component.focused.set(makeItem());
    const event = new KeyboardEvent('keydown', { key: 'e', cancelable: true });
    component.enterFocused(event);
    expect(event.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('enterFocused no hace nada sin puerta cerca o con puerta bloqueada', () => {
    component.catalog.set([makeItem({ unlocked: false })]);
    component.enterFocused(new KeyboardEvent('keydown', { key: 'e' }));
    component.focused.set(makeItem({ unlocked: false }));
    component.enterFocused(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
    vi.advanceTimersByTime(1000);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

/** Doble de la pantalla de ayuda: ts-jest no compila las entradas con `input()` del componente real. */
@Component({
  selector: 'app-game-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<button type="button" class="stub-close" (click)="closed.emit()">Cerrar ayuda</button>',
})
class GameHelpStubComponent {
  @Input() view = 'card';
  @Input() modality = 'keyboard';
  @Input() compact = false;
  @Input() safeExitPromise = false;
  @Output() closed = new EventEmitter<void>();
}

describe('GameMenuComponent: ayuda y textos de teclado en el lobby (T7.4)', () => {
  const source = readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8');
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const catalogItem = makeItem();

  function mount(coarse: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)' ? coarse : false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    TestBed.configureTestingModule({
      imports: [GameMenuComponent],
      providers: [
        { provide: SimulationService, useValue: { getCatalog: vi.fn(() => EMPTY) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
      ],
    });
    TestBed.overrideComponent(GameMenuComponent, {
      remove: { imports: [GameHelpComponent] },
      add: { imports: [GameHelpStubComponent] },
    });
    const fixture = TestBed.createComponent(GameMenuComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router) as unknown as { navigate: Mock };
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, router };
  }

  const helpButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button.menu-help-btn');
  const helpLayer = (root: HTMLElement) => root.querySelector<HTMLElement>('.menu-help-layer');
  const helpStub = (fixture: ComponentFixture<GameMenuComponent>): GameHelpStubComponent | undefined =>
    fixture.debugElement.query(By.directive(GameHelpStubComponent))?.componentInstance;

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('texto de teclado', () => {
    // req: BLOQUE-H (H-07), WCAG 2.1.4
    it('A, D y E del lobby solo con el ajuste activo y con el foco en la sala; flechas, Enter y Espacio no dependen', () => {
      expect(source).toContain('const letters = (this.cb.shortcutsEnabled?.() ?? true) && isShortcutContext(focus);');
      expect(source).toContain('e: justE && letters,');
      expect(source).toContain('shortcutsEnabled: () => this.shortcuts.enabled(),');
      expect(source).toMatch(/\(letters && this\.keys\['A'\]\?\.isDown\)/);
      expect(source).toMatch(/\(letters && this\.keys\['D'\]\?\.isDown\)/);
    });

    it('lobbyKeyboardHint: con puntero fino devuelve el recordatorio y con puntero grueso nada', () => {
      expect(lobbyKeyboardHint(false)).toBe('← → / A D  mover · E entrar');
      expect(lobbyKeyboardHint(true)).toBeNull();
    });

    // req: BLOQUE-H (H-07), WCAG 2.1.4
    it('sin los atajos de una tecla la pista del lobby promete flechas y Enter, no A, D ni E', () => {
      expect(lobbyKeyboardHint(false, false)).toBe('← →  mover · Enter entrar');
      expect(lobbyKeyboardHint(true, false)).toBeNull();
    });

    it('la pista del lobby es DOM (no texto de Phaser) y solo sale si lobbyKeyboardHint la devuelve', () => {
      expect(source).toMatch(/readonly keyboardHint = computed\(\(\) => lobbyKeyboardHint\(this\.coarsePointer\(\), this\.shortcuts\.enabled\(\)\)\);/);
      expect(source).toContain('@if (keyboardHint(); as hint) { <p class="lobby-help" aria-hidden="true">{{ hint }}</p> }');
      expect(source).not.toMatch(/add\.text\(12, 12, '← →/);
    });

    it('con puntero fino el lobby pinta el recordatorio de teclado y con puntero grueso no pinta nada', () => {
      for (const [coarse, expected] of [[true, null], [false, lobbyKeyboardHint(false)]] as const) {
        const { fixture, root } = mount(coarse);
        fixture.detectChanges();
        expect(root.querySelector('.lobby-help')?.textContent?.trim() ?? null).toBe(expected);
        TestBed.resetTestingModule();
      }
    });

    it('el botón de entrada lleva «(E)» solo con puntero fino', () => {
      for (const [coarse, label] of [[false, 'Entrar al caso (E)'], [true, 'Entrar al caso']] as const) {
        const { fixture, component, root } = mount(coarse);
        component.catalog.set([catalogItem]);
        component.focused.set(catalogItem);
        fixture.detectChanges();
        expect(root.querySelector('.banner-enter')?.textContent?.trim()).toBe(label);
        TestBed.resetTestingModule();
      }
    });

    it('el nombre accesible del escenario no promete teclas con puntero grueso', () => {
      const fine = mount(false).root.querySelector('.phaser-host')?.getAttribute('aria-label') ?? '';
      expect(fine).toContain('Flechas o A/D');
      TestBed.resetTestingModule();
      const coarse = mount(true).root.querySelector('.phaser-host')?.getAttribute('aria-label') ?? '';
      expect(coarse).toContain('Toca el suelo');
      expect(coarse).not.toMatch(/Flechas|A\/D|E para entrar/);
    });
  });

  describe('botón «Cómo se juega»', () => {
    it('es un botón DOM visible con nombre accesible igual al texto visible y cerrado al inicio', () => {
      const { root } = mount(false);
      const button = helpButton(root);
      expect(button?.textContent).toContain(ORIENTATION_COPY.ui.helpTitle);
      expect(button?.hasAttribute('aria-label')).toBe(false);
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(helpLayer(root)).toBeNull();
    });

    it('al pulsarlo abre la pantalla «Cómo se juega» del juego (view=screen) con la modalidad de puntero', () => {
      for (const [coarse, modality] of [[false, 'keyboard'], [true, 'touch']] as const) {
        const { fixture, root } = mount(coarse);
        helpButton(root)!.click();
        fixture.detectChanges();
        expect(helpLayer(root)).not.toBeNull();
        const help = helpStub(fixture);
        expect(help?.view).toBe('screen');
        expect(help?.modality).toBe(modality);
        expect(help?.safeExitPromise).toBe(SAFE_EXIT_ALWAYS_REACHABLE);
        expect(helpButton(root)?.getAttribute('aria-expanded')).toBe('true');
        TestBed.resetTestingModule();
      }
    });

    it('«Cerrar ayuda» (closed) la cierra y devuelve el foco al botón', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      root.querySelector<HTMLButtonElement>('.stub-close')!.click();
      fixture.detectChanges();
      expect(helpLayer(root)).toBeNull();
      expect(document.activeElement).toBe(helpButton(root));
    });

    it('Esc la cierra y un toque en la capa también, pero no uno dentro de la pantalla', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      root.querySelector('.stub-close')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(helpLayer(root)).toBeNull();

      helpButton(root)!.click();
      fixture.detectChanges();
      helpStub(fixture); // la pantalla sigue abierta
      root.querySelector('app-game-help')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(helpLayer(root)).not.toBeNull();
      helpLayer(root)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(helpLayer(root)).toBeNull();
    });

    it('con la ayuda abierta la E del juego no entra al caso (quien lee no debe ser llevado)', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const { fixture, component, root, router } = mount(false);
      component.catalog.set([catalogItem]);
      helpButton(root)!.click();
      fixture.detectChanges();
      component.enter(7);
      component.focused.set(catalogItem);
      component.enterFocused(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
      vi.advanceTimersByTime(2000);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.entering()).toBe('');

      component.closeHelp();
      component.enter(7);
      vi.advanceTimersByTime(2000);
      expect(router.navigate).toHaveBeenCalledTimes(1);
    });

    it('no escribe copy propio: el texto sale de app-game-help y la bandera de salida segura es la del juego', () => {
      expect(source).toContain('<app-game-help view="screen"');
      expect(source).toContain("import { SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';");
      expect(source).not.toMatch(/Acércate a una puerta|Toca el suelo para caminar hasta ese punto/);
    });

    it('no registra oyentes globales: el teclado se escucha solo dentro de la capa de ayuda', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      // El detector de modalidad del CDK (oyente pasivo en captura) que usan los botones del sistema (F5-3) no reacciona
      // a ninguna tecla: no cuenta. Lo que se vigila es que la sala no escuche el teclado de toda la página.
      const own = add.mock.calls.filter(([type, , options]) =>
        String(type).startsWith('key') && !(typeof options === 'object' && options?.capture && options?.passive));
      expect(own).toEqual([]);
      expect(source).not.toMatch(/HostListener\('document:/);
      add.mockRestore();
    });

    it('la capa cubre el lobby y el botón mide al menos 44 px de alto', () => {
      expect(source).toMatch(/\.menu-help-layer \{\s*position: absolute; inset: 0;/);
      expect(source).toMatch(/\.menu-help-btn \{[^}]*min-height: 44px;/);
    });
  });
});

/**
 * Sala (plan visual F5-3), en DOM: la salida al panel siempre visible (la barra está oculta en la sala), UNA señal de
 * carga hasta que la sala está lista y el error con «Reintentar» que vuelve a pedir el catálogo.
 */
// req: BLOQUE-H, RNF-04
describe('GameMenuComponent: salida, carga y error de la sala (F5-3)', () => {
  function mountWith(getCatalog: () => unknown) {
    TestBed.configureTestingModule({
      imports: [GameMenuComponent],
      providers: [
        { provide: SimulationService, useValue: { getCatalog: vi.fn(getCatalog) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
      ],
    });
    TestBed.overrideComponent(GameMenuComponent, {
      remove: { imports: [GameHelpComponent] },
      add: { imports: [GameHelpStubComponent] },
    });
    const fixture = TestBed.createComponent(GameMenuComponent);
    fixture.detectChanges();
    const service = TestBed.inject(SimulationService) as unknown as { getCatalog: Mock };
    const router = TestBed.inject(Router) as unknown as { navigate: Mock };
    return { fixture, root: fixture.nativeElement as HTMLElement, service, router };
  }
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Lo que se lee de un enlace: sin la ligadura del icono (aria-hidden).
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return text(copy);
  };

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('«Volver al panel» es un enlace visible al panel, también mientras carga', () => {
    const { root, router } = mountWith(() => NEVER);
    const exit = [...root.querySelectorAll('a')].find(link => spoken(link) === 'Volver al panel')!;
    expect(exit.getAttribute('href')).toBe('/portal/dashboard');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    exit.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/portal/dashboard']);
  });

  // Síncrona a propósito: en este archivo (con vi.mock) una función async hace que el builder reescriba el módulo y
  // Vitest ya no encuentre el vi.mock en el nivel superior.
  it('carga unificada: una sola señal («Preparando la sala…») pasado el umbral, sin barra de progreso', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { fixture, root } = mountWith(() => NEVER);
    expect(root.querySelector('.menu-loading')).toBeNull();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(root.querySelectorAll('.menu-loading')).toHaveLength(1);
    expect(text(root.querySelector('[role="status"]'))).toBe('Preparando la sala…');
    expect(root.querySelector('mat-progress-bar')).toBeNull();
  });

  // req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H (plan visual F5-5)
  it('F5-5: la puerta bloqueada nombra el caso anterior y su botón queda deshabilitado CON motivo', () => {
    const { fixture, root } = mountWith(() => NEVER);
    const first = makeItem({ caseVersionId: 7, title: 'Caso uno', order: 1 } as Partial<CatalogItem>);
    const second = makeItem({ caseVersionId: 8, title: 'Caso dos', order: 2, unlocked: false } as Partial<CatalogItem>);
    fixture.componentInstance.catalog.set([first, second]);
    fixture.componentInstance.focused.set(second);
    fixture.detectChanges();
    expect(text(root.querySelector('.case-banner span'))).toBe('Bloqueado: completa «Caso uno» para abrirlo.');
    const button = root.querySelector<HTMLButtonElement>('.banner-enter')!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('F5-5: sin casos asignados, la sala lo dice (sin pasillo vacío) y la salida sigue a mano', () => {
    const { fixture, root } = mountWith(() => of([]));
    fixture.detectChanges();
    const empty = root.querySelector('ui-empty-state')!;
    expect(text(empty)).toContain('Aún no tienes casos asignados');
    expect(root.querySelector('.menu-loading')).toBeNull();
    expect([...root.querySelectorAll('a')].some(link => spoken(link) === 'Volver al panel')).toBe(true);
  });

  // Revisión de F5 (WCAG 2.4.11): bajo una capa que se queda, el lienzo no puede recibir un foco que nadie vería.
  it('el lienzo sale del orden de foco bajo el error y bajo «sin casos»; cargando, no', () => {
    const host = (root: HTMLElement) => root.querySelector('.phaser-host')!;
    let mounted = mountWith(() => throwError(() => ({ status: 500 })));
    mounted.fixture.detectChanges();
    expect(host(mounted.root).hasAttribute('inert')).toBe(true);
    TestBed.resetTestingModule();
    mounted = mountWith(() => of([]));
    mounted.fixture.detectChanges();
    expect(host(mounted.root).hasAttribute('inert')).toBe(true);
    TestBed.resetTestingModule();
    mounted = mountWith(() => NEVER);
    expect(host(mounted.root).hasAttribute('inert')).toBe(false);
  });

  // Sin async a propósito (vi.mock en el archivo): la prueba devuelve la promesa.
  it('si la navegación no se completa, la tarjeta «Entrando al caso» se retira y la sala vuelve a estar a mano', () => {
    const { fixture, router } = mountWith(() => NEVER);
    router.navigate.mockResolvedValue(false);
    fixture.componentInstance.catalog.set([makeItem()]);
    fixture.componentInstance.enter(7);
    expect(fixture.componentInstance.entering()).toBe('Caso demo');
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(fixture.componentInstance.entering()).toBe('');
    });
  });

  it('si falla el catálogo: error con «Reintentar» que vuelve a pedirlo, y la salida sigue a mano', () => {
    let calls = 0;
    const { fixture, root, service } = mountWith(() => (++calls === 1 ? throwError(() => ({ status: 500 })) : NEVER));
    fixture.detectChanges();
    const error = root.querySelector('ui-error-state')!;
    expect(text(error)).toContain('No pudimos cargar la sala.');
    expect([...root.querySelectorAll('a')].some(link => spoken(link) === 'Volver al panel')).toBe(true);
    (error.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.getCatalog).toHaveBeenCalledTimes(2);
    expect(root.querySelector('ui-error-state')).toBeNull();
  });
});

describe('GameMenuComponent: el observador del contenedor', () => {
  it('ngOnDestroy lo suelta antes de destruir Phaser (si no, un resize posterior lanzaría sobre un lienzo destruido), y una sola vez', () => {
    const order: string[] = [];
    const detach = vi.fn(() => { order.push('detach'); });
    const destroy = vi.fn(() => { order.push('destroy'); });
    const component = Object.create(GameMenuComponent.prototype) as { detachHostWatch?: () => void; game?: unknown; ngOnDestroy(): void };
    component.detachHostWatch = detach;
    component.game = { destroy };
    component.ngOnDestroy();
    expect(order).toEqual(['detach', 'destroy']);
    component.ngOnDestroy();
    expect(detach).toHaveBeenCalledTimes(1);
  });
});

// req: BLOQUE-H (H-22: movimiento reducido; revisión de F5)
describe('lobby: la sacudida ante una puerta bloqueada respeta el movimiento reducido', () => {
  const justDown = Phaser.Input.Keyboard.JustDown;
  afterEach(() => { (Phaser.Input.Keyboard as { JustDown: unknown }).JustDown = justDown; });

  function sceneAtLockedDoor(reduceMotion: boolean) {
    // La tecla E «acaba de bajar» en este cuadro.
    (Phaser.Input.Keyboard as { JustDown: unknown }).JustDown = () => true;
    const shake = vi.fn();
    const key = { isDown: false };
    const scene = Object.create(ClinicMenuScene.prototype) as Record<string, unknown> & { update(t: number, dt: number): void };
    Object.assign(scene, {
      player: { x: 220, y: 382, setPosition: vi.fn() },
      keys: { A: key, D: key, E: key, SPACE: key, ENTER: key },
      cursors: undefined,
      pointerTargetX: null,
      doors: [{ item: makeItem({ unlocked: false }), x: 220 }],
      nearestId: null,
      worldW: 960,
      view: 'right',
      walking: false,
      cb: { onEnter: vi.fn(), onFocus: vi.fn(), onReady: vi.fn() },
      motion: lobbyMotion(reduceMotion),
      cameras: { main: { shake } },
    });
    scene.update(0, 16);
    return { shake, onEnter: (scene['cb'] as { onEnter: Mock }).onEnter };
  }

  it('sin «reducir movimiento», E ante la puerta bloqueada sacude la cámara y no entra', () => {
    const { shake, onEnter } = sceneAtLockedDoor(false);
    expect(shake).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('con «reducir movimiento», no hay sacudida (y tampoco entra)', () => {
    const { shake, onEnter } = sceneAtLockedDoor(true);
    expect(shake).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });
});

// req: REGLA-009 (F0-8, PHA-2: rótulos nítidos con zoom de cámara)
describe('lobby: rótulos de Phaser nítidos con zoom (PHA-2)', () => {
  it('al fijar el zoom entero, los textos de la sala toman la resolución de ese zoom', () => {
    const scene = Object.create(ClinicMenuScene.prototype) as {
      cameras: { main: Record<string, unknown> };
      worldW: number;
      pixelRender: { refreshTexts: ReturnType<typeof vi.fn> };
      applyCamera(): void;
    };
    const cam = { width: 1920, height: 1080, zoom: 1, setZoom: vi.fn((k: number) => { cam.zoom = k; }), setBounds: vi.fn() };
    scene.cameras = { main: cam };
    scene.worldW = 960;
    scene.pixelRender = { refreshTexts: vi.fn() };
    scene.applyCamera();
    expect(cam.setZoom).toHaveBeenCalledWith(2);
    expect(scene.pixelRender.refreshTexts).toHaveBeenCalledWith(2);
  });
});
