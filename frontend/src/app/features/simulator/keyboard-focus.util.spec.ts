import {
  attachScrollKeyGuard,
  isActivatableTarget,
  isScrollRegionTarget,
  isShortcutContext,
  isTextEntryTarget,
  OutsideAngularRunner,
  resolveInteractPress,
  shouldBlockScrollKey,
} from './keyboard-focus.util';

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

function keydown(key: string, init: KeyboardEventInit = {}, target: Element | null = null): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  if (target) {
    document.body.appendChild(target);
    target.dispatchEvent(event);
    target.remove();
  }
  return event;
}

describe('keyboard-focus.util', () => {
  describe('isTextEntryTarget', () => {
    it('es true para textarea, select e inputs de texto', () => {
      expect(isTextEntryTarget(el('<textarea></textarea>'))).toBe(true);
      expect(isTextEntryTarget(el('<select><option>a</option></select>'))).toBe(true);
      expect(isTextEntryTarget(el('<input type="text">'))).toBe(true);
      expect(isTextEntryTarget(el('<input>'))).toBe(true);
      expect(isTextEntryTarget(el('<input type="search">'))).toBe(true);
      expect(isTextEntryTarget(el('<input type="number">'))).toBe(true);
    });

    it('es false para inputs que se activan en vez de escribirse', () => {
      for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color']) {
        expect(isTextEntryTarget(el(`<input type="${type}">`))).toBe(false);
      }
    });

    it('es true para un elemento editable', () => {
      const editable = el('<div contenteditable="true"></div>');
      // jsdom no implementa isContentEditable: se declara como lo haría un navegador.
      Object.defineProperty(editable, 'isContentEditable', { value: true });
      expect(isTextEntryTarget(editable)).toBe(true);
    });

    it('es false para botones, enlaces, div enfocable, body y null', () => {
      expect(isTextEntryTarget(el('<button></button>'))).toBe(false);
      expect(isTextEntryTarget(el('<a href="/x"></a>'))).toBe(false);
      expect(isTextEntryTarget(el('<div tabindex="0"></div>'))).toBe(false);
      expect(isTextEntryTarget(document.body)).toBe(false);
      expect(isTextEntryTarget(null)).toBe(false);
    });
  });

  describe('isActivatableTarget', () => {
    it('es true para botones y enlaces con href', () => {
      expect(isActivatableTarget(el('<button></button>'))).toBe(true);
      expect(isActivatableTarget(el('<a href="/x"></a>'))).toBe(true);
    });

    it('es false para un enlace sin href', () => {
      expect(isActivatableTarget(el('<a>ancla</a>'))).toBe(false);
    });

    it('es true para inputs que se activan', () => {
      for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset']) {
        expect(isActivatableTarget(el(`<input type="${type}">`))).toBe(true);
      }
    });

    it('es false para inputs de texto, range y color', () => {
      for (const type of ['text', 'range', 'color']) {
        expect(isActivatableTarget(el(`<input type="${type}">`))).toBe(false);
      }
      expect(isActivatableTarget(el('<textarea></textarea>'))).toBe(false);
    });

    it('es true para los roles interactivos de ARIA', () => {
      for (const role of ['button', 'switch', 'checkbox', 'menuitem', 'tab', 'option']) {
        expect(isActivatableTarget(el(`<div role="${role}" tabindex="0"></div>`))).toBe(true);
      }
    });

    it('es false para div con tabindex, role application, body y null', () => {
      expect(isActivatableTarget(el('<div tabindex="0"></div>'))).toBe(false);
      expect(isActivatableTarget(el('<div role="application" tabindex="0"></div>'))).toBe(false);
      expect(isActivatableTarget(document.body)).toBe(false);
      expect(isActivatableTarget(null)).toBe(false);
    });
  });

  describe('isScrollRegionTarget (F6-5, H-12)', () => {
    /** jsdom no calcula el diseño: el desborde se declara como lo mediría un navegador. */
    function region(html: string, overflowing: boolean): Element {
      const element = el(html);
      Object.defineProperty(element, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(element, 'scrollHeight', { configurable: true, value: overflowing ? 400 : 100 });
      return element;
    }

    it('es true para una región enfocable que de verdad se desplaza', () => {
      expect(isScrollRegionTarget(region('<div tabindex="0" role="region"></div>', true))).toBe(true);
    });

    it('el host del juego (role="application") nunca es una región de lectura, aunque desborde', () => {
      expect(isScrollRegionTarget(region('<div tabindex="0" role="application"></div>', true))).toBe(false);
    });

    it('es false sin desborde, sin tabindex, con tabindex -1, en el cuerpo y en null', () => {
      expect(isScrollRegionTarget(region('<div tabindex="0"></div>', false))).toBe(false);
      expect(isScrollRegionTarget(region('<div></div>', true))).toBe(false);
      expect(isScrollRegionTarget(region('<div tabindex="-1"></div>', true))).toBe(false);
      expect(isScrollRegionTarget(document.body)).toBe(false);
      expect(isScrollRegionTarget(null)).toBe(false);
    });
  });

  describe('isShortcutContext (F6-10, WCAG 2.1.4)', () => {
    // req: BLOQUE-H (H-07), RNF-04
    it('el cuerpo, el documento y nada enfocado son el juego: los atajos actúan', () => {
      expect(isShortcutContext(null)).toBe(true);
      expect(isShortcutContext(document.body)).toBe(true);
      expect(isShortcutContext(document.documentElement)).toBe(true);
    });

    it('el host del juego (role="application", tabindex 0, aunque desborde) es el juego', () => {
      const host = el('<div role="application" tabindex="0"></div>');
      Object.defineProperty(host, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 120 });
      expect(isShortcutContext(host)).toBe(true);
    });

    it('un contenedor del propio juego (tabindex -1, sin rol) también es el juego', () => {
      expect(isShortcutContext(el('<div id="main-content" tabindex="-1"></div>'))).toBe(true);
      expect(isShortcutContext(el('<canvas></canvas>'))).toBe(true);
    });

    it('con el foco en un campo, una casilla, un botón de formulario o una opción no actúan', () => {
      for (const html of [
        '<textarea></textarea>', '<input type="text">', '<select></select>', '<input type="checkbox">',
        '<input type="submit">', '<div role="option" tabindex="-1"></div>', '<div role="switch" tabindex="0"></div>',
      ]) {
        expect(isShortcutContext(el(html)), html).toBe(false);
      }
    });

    // req: BLOQUE-H (H-07), RNF-04 (revisión de F6: tras cerrar Ajustes o «Ir a…» el foco vuelve a un botón del HUD)
    it('con el foco en un botón o un enlace de la propia interfaz SÍ actúan: ninguna letra los activa', () => {
      for (const html of ['<button></button>', '<a href="/x"></a>', '<div role="button" tabindex="0"></div>']) {
        expect(isShortcutContext(el(html)), html).toBe(true);
      }
    });

    it('pero un botón dentro de un diálogo, un menú o una barra de herramientas sigue sin disparar el juego', () => {
      for (const wrapper of ['<div role="dialog">', '<div role="alertdialog">', '<div role="menu">', '<div role="toolbar">']) {
        const host = el(wrapper + '<button id="inner"></button></div>');
        expect(isShortcutContext(host.querySelector('#inner')), wrapper).toBe(false);
      }
    });

    it('con el foco dentro de un diálogo, un menú, una barra de herramientas o un popover no actúan', () => {
      for (const wrapper of ['<div role="dialog">', '<div role="alertdialog">', '<div role="menu">', '<div role="toolbar">', '<div popover>']) {
        const host = el(wrapper + '<span tabindex="-1" id="inner"></span></div>');
        expect(isShortcutContext(host.querySelector('#inner')), wrapper).toBe(false);
      }
    });

    it('con el foco en una región con scroll no actúan (las flechas y las teclas son suyas)', () => {
      const area = el('<div tabindex="0"></div>');
      Object.defineProperty(area, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 400 });
      expect(isShortcutContext(area)).toBe(false);
    });
  });
  describe('shouldBlockScrollKey', () => {
    it('no bloquea las flechas con el foco en una región con scroll: la desplazan (H-12)', () => {
      const area = document.createElement('div');
      area.tabIndex = 0;
      Object.defineProperty(area, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 400 });
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        expect(shouldBlockScrollKey(keydown(key, {}, area))).toBe(false);
      }
    });

    it('bloquea flechas y Espacio cuando el foco está en el cuerpo de la página', () => {
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']) {
        const event = keydown(key, {}, document.createElement('div'));
        expect(shouldBlockScrollKey(event)).toBe(true);
      }
    });

    it('no bloquea otras teclas (WASD, E, Enter, Tab)', () => {
      for (const key of ['w', 'a', 's', 'd', 'e', 'Enter', 'Tab', 'PageDown']) {
        expect(shouldBlockScrollKey(keydown(key, {}, document.createElement('div')))).toBe(false);
      }
    });

    it('no bloquea con ctrl, meta o alt', () => {
      for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        expect(shouldBlockScrollKey(keydown('ArrowDown', init, document.createElement('div')))).toBe(false);
      }
    });

    it('no bloquea si el destino es de entrada de texto', () => {
      expect(shouldBlockScrollKey(keydown('ArrowLeft', {}, document.createElement('textarea')))).toBe(false);
      expect(shouldBlockScrollKey(keydown(' ', {}, document.createElement('input')))).toBe(false);
    });

    it('no bloquea si el destino se activa con teclado', () => {
      expect(shouldBlockScrollKey(keydown(' ', {}, document.createElement('button')))).toBe(false);
      const toggle = document.createElement('div');
      toggle.setAttribute('role', 'switch');
      expect(shouldBlockScrollKey(keydown(' ', {}, toggle))).toBe(false);
    });

    it('bloquea con el destino en un div enfocable (el host de Phaser)', () => {
      const host = document.createElement('div');
      host.tabIndex = 0;
      expect(shouldBlockScrollKey(keydown('ArrowDown', {}, host))).toBe(true);
    });

    it('tolera un evento sin destino', () => {
      expect(shouldBlockScrollKey(new KeyboardEvent('keydown', { key: ' ' }))).toBe(true);
    });
  });

  describe('resolveInteractPress', () => {
    const none = { e: false, space: false, enter: false };

    it('sin foco especial, E, Espacio y Enter interactúan', () => {
      expect(resolveInteractPress(document.body, { ...none, e: true })).toBe(true);
      expect(resolveInteractPress(document.body, { ...none, space: true })).toBe(true);
      expect(resolveInteractPress(document.body, { ...none, enter: true })).toBe(true);
      expect(resolveInteractPress(document.body, none)).toBe(false);
    });

    it('con foco en un campo de texto no interactúa nada', () => {
      const field = el('<textarea></textarea>');
      expect(resolveInteractPress(field, { e: true, space: true, enter: true })).toBe(false);
    });

    it('con foco en un botón, Espacio y Enter los activa el navegador pero E sigue valiendo', () => {
      const button = el('<button></button>');
      expect(resolveInteractPress(button, { ...none, space: true })).toBe(false);
      expect(resolveInteractPress(button, { ...none, enter: true })).toBe(false);
      expect(resolveInteractPress(button, { ...none, e: true })).toBe(true);
    });

    it('con foco en el host enfocable de Phaser todo interactúa', () => {
      const host = el('<div role="application" tabindex="0"></div>');
      expect(resolveInteractPress(host, { ...none, space: true })).toBe(true);
      expect(resolveInteractPress(host, { ...none, enter: true })).toBe(true);
    });
  });

  describe('attachScrollKeyGuard', () => {
    // `zone` se crea de nuevo en cada beforeEach, no una vez a nivel de describe: un vi.fn()
    // construido en la recolección del describe y luego invocado (vía attachScrollKeyGuard)
    // dentro de un it() rompe en runtime ("... is not a function") bajo el runner de Vitest
    // de @angular/build con zone.js. Recreándolo en beforeEach queda en el mismo contexto de
    // ejecución que el it() y funciona igual que el jest.fn() compartido de antes.
    let zone: { runOutsideAngular: ReturnType<typeof vi.fn> };

    function pressOnBody(key: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event;
    }

    beforeEach(() => {
      zone = { runOutsideAngular: vi.fn((callback: () => unknown) => callback()) };
    });

    it('registra el oyente fuera de la zona y cancela flechas y Espacio', () => {
      const detach = attachScrollKeyGuard(zone as unknown as OutsideAngularRunner);
      expect(zone.runOutsideAngular).toHaveBeenCalledTimes(1);
      expect(pressOnBody('ArrowDown').defaultPrevented).toBe(true);
      expect(pressOnBody(' ').defaultPrevented).toBe(true);
      expect(pressOnBody('e').defaultPrevented).toBe(false);
      detach();
    });

    it('no cancela lo que un campo de texto o un botón necesitan', () => {
      const detach = attachScrollKeyGuard(zone as unknown as OutsideAngularRunner);
      for (const tag of ['textarea', 'button']) {
        const target = document.createElement(tag);
        document.body.appendChild(target);
        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        target.remove();
        expect(event.defaultPrevented).toBe(false);
      }
      detach();
    });

    it('al retirarlo deja de cancelar', () => {
      const detach = attachScrollKeyGuard(zone as unknown as OutsideAngularRunner);
      detach();
      expect(pressOnBody('ArrowUp').defaultPrevented).toBe(false);
    });

    it('un oyente registrado antes (el de Phaser) ve la tecla sin cancelar', () => {
      // Phaser descarta los keydown con defaultPrevented: por eso el bloqueo se arma después.
      const seen: boolean[] = [];
      const phaserLike = (event: KeyboardEvent) => seen.push(event.defaultPrevented);
      window.addEventListener('keydown', phaserLike);
      const detach = attachScrollKeyGuard(zone as unknown as OutsideAngularRunner);
      pressOnBody('ArrowLeft');
      detach();
      window.removeEventListener('keydown', phaserLike);
      expect(seen).toEqual([false]);
    });
  });
});
