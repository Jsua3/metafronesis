import { DIALOG_DATA, Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { TemaService } from '../../../core/tema/tema.service';
import { UiButton } from '../button/ui-button';
import { UiDialog, UiDialogActions, UiDialogFrame } from './ui-dialog';

/**
 * UiDialog (plan visual §2.7, F2-7; Review Focus 2): diálogo modal sobre @angular/cdk/dialog con el marco del
 * lenguaje visual. Trampa de foco, foco inicial dentro, Esc cierra, el foco VUELVE al disparador, aria-modal y
 * nombre por su título. confirm() con variante de peligro (el foco empieza en «Cancelar») y sheet() lateral o
 * inferior.
 */
// req: RNF-004 (diálogos operables con teclado; foco que vuelve, WCAG 2.4.3)
@Component({
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Editar grupo" description="Cambia el nombre que ven tus estudiantes.">
      <label>Nombre <input class="nombre" /></label>
      <button ui-button uiDialogActions type="button" variant="secondary" class="cerrar">Cerrar</button>
    </ui-dialog-frame>
  `,
})
class EditGroupDialog {
  readonly data = inject<{ group: string }>(DIALOG_DATA);
}

describe('UiDialog', () => {
  let trigger: HTMLButtonElement;
  const dialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')];
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  };
  const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    trigger = document.createElement('button');
    trigger.textContent = 'Abrir';
    document.body.appendChild(trigger);
    trigger.focus();
  });

  afterEach(() => trigger.remove());

  it('abre un diálogo modal nombrado por su título, con su descripción y los datos', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, { data: { group: 'PSI-1' } });
    await settle();
    const [dialog] = dialogs();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Editar grupo');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent?.trim())
      .toBe('Cambia el nombre que ven tus estudiantes.');
    expect(ref.componentInstance?.data.group).toBe('PSI-1');
    expect(dialog.querySelector('h2')?.textContent?.trim()).toBe('Editar grupo');
    ref.close();
    await settle();
  });

  it('el foco entra al diálogo, queda atrapado y vuelve al disparador al cerrar con Esc', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    const [dialog] = dialogs();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // La trampa del CDK está montada: anclas enfocables antes y después del diálogo. Que el Tab cicle dentro lo
    // prueba el e2e de estados (F2-9) en Chromium: en jsdom no hay maquetación y el CDK no ve nada «visible».
    const anchors = [...dialog.parentElement!.querySelectorAll<HTMLElement>('.cdk-focus-trap-anchor')];
    expect(anchors.length).toBe(2);
    expect(anchors.every(anchor => anchor.getAttribute('tabindex') === '0')).toBe(true);
    expect(anchors[0].nextElementSibling).toBe(dialog);

    const closed = firstValueFrom(ref.closed);
    escape();
    await closed;
    await settle();
    expect(dialogs().length).toBe(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('el botón de cerrar del marco cierra sin resultado', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    const closed = firstValueFrom(ref.closed);
    dialogs()[0].querySelector<HTMLButtonElement>('.ui-dialog-frame__close')!.click();
    expect(await closed).toBeUndefined();
  });

  it('la hoja solo se cierra por arrastre si el cuerpo está arriba y el cierre está permitido', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
    try {
      const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
      await settle();
      const dialog = dialogs()[0];
      const body = dialog.querySelector<HTMLElement>('.ui-dialog-frame__body')!;
      const handle = dialog.querySelector<HTMLElement>('.ui-dialog-frame__handle')!;
      expect(handle).not.toBeNull();
      const gesture = () => {
        for (const [type, y] of [['pointerdown', 10], ['pointerup', 110]] as const) {
          const e = new Event(type, { bubbles: true });
          Object.assign(e, { pointerType: 'touch', pointerId: 1, clientY: y, isPrimary: true });
          handle.dispatchEvent(e);
        }
      };
      body.scrollTop = 30;
      gesture();
      expect(dialogs()).toHaveLength(1);
      body.scrollTop = 0;
      ref.disableClose = true;
      gesture();
      expect(dialogs()).toHaveLength(1);
      ref.disableClose = false;
      const closed = firstValueFrom(ref.closed);
      gesture();
      await closed;
      expect(dialogs()).toHaveLength(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it('confirm(): alertdialog; «Confirmar» resuelve true y «Cancelar» o Esc resuelven false', async () => {
    const dialog = TestBed.inject(UiDialog);
    let answer = dialog.confirm({ title: 'Publicar caso', message: 'Lo verán tus estudiantes.', confirmLabel: 'Publicar' });
    await settle();
    expect(dialogs()[0].getAttribute('role')).toBe('alertdialog');
    const confirm = dialogs()[0].querySelector<HTMLButtonElement>('.ui-confirm__confirm')!;
    expect(confirm.textContent?.trim()).toBe('Publicar');
    expect(document.activeElement).toBe(confirm);
    confirm.click();
    expect(await answer).toBe(true);
    await settle();

    answer = dialog.confirm({ title: 'Publicar caso', message: 'x', confirmLabel: 'Publicar' });
    await settle();
    dialogs()[0].querySelector<HTMLButtonElement>('.ui-confirm__cancel')!.click();
    expect(await answer).toBe(false);
    await settle();

    answer = dialog.confirm({ title: 'Publicar caso', message: 'x', confirmLabel: 'Publicar' });
    await settle();
    escape();
    expect(await answer).toBe(false);
  });

  it('confirm() de peligro: botón rojo y el foco empieza en «Cancelar» (la opción segura)', async () => {
    const answer = TestBed.inject(UiDialog).confirm({
      title: 'Borrar grupo', message: 'Se borran también sus códigos.', confirmLabel: 'Borrar', tone: 'danger',
    });
    await settle();
    const [dialog] = dialogs();
    expect(dialog.querySelector('.ui-confirm__confirm')?.classList).toContain('ui-button--danger');
    expect(document.activeElement).toBe(dialog.querySelector('.ui-confirm__cancel'));
    escape();
    expect(await answer).toBe(false);
  });

  it('sheet(): hoja inferior o lateral con la misma accesibilidad', async () => {
    const dialog = TestBed.inject(UiDialog);
    for (const side of ['bottom', 'end'] as const) {
      const ref = dialog.sheet(EditGroupDialog, { side });
      await settle();
      expect(document.querySelector(`.ui-sheet-pane--${side}`)).not.toBeNull();
      expect(dialogs()[0].getAttribute('aria-modal')).toBe('true');
      const closed = firstValueFrom(ref.closed);
      escape();
      await closed;
      await settle();
    }
  });
});

/**
 * UiDialog.consequence() (plan visual F2-11; RN-07): la confirmación NOMBRA lo que se pierde y deja «Continuar» como
 * acción por defecto (primaria, con el foco, y lo que devuelven Esc o el fondo). No es para la Salida segura
 * (REGLA-004: salir nunca pide confirmación).
 */
// req: RN-07 (continuar el intento abierto es la opción por defecto)
describe('UiDialog.consequence', () => {
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  };
  const options = {
    title: '¿Iniciar un intento nuevo?',
    consequence: 'Se cerrará el intento que tienes abierto y perderás su avance.',
    continueLabel: 'Continuar mi intento',
    proceedLabel: 'Iniciar uno nuevo',
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('alertdialog que describe la consecuencia; el foco empieza en «Continuar», primario', async () => {
    const answer = TestBed.inject(UiDialog).consequence(options);
    await settle();
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent?.trim()).toBe(options.consequence);
    const keep = dialog.querySelector<HTMLButtonElement>('.ui-consequence__continue')!;
    expect(keep.textContent?.trim()).toBe('Continuar mi intento');
    expect(keep.classList).toContain('ui-button--primary');
    expect(document.activeElement).toBe(keep);
    keep.click();
    expect(await answer).toBe('continue');
  });

  it('solo «proceder» devuelve proceed; Esc devuelve continue', async () => {
    const dialog = TestBed.inject(UiDialog);
    let answer = dialog.consequence(options);
    await settle();
    document.querySelector<HTMLButtonElement>('.ui-consequence__proceed')!.click();
    expect(await answer).toBe('proceed');
    await settle();

    answer = dialog.consequence(options);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    expect(await answer).toBe('continue');
  });
});

// Revisión de F2 (C1, I8): la ruta ANIMADA de la salida (jsdom no tiene matchMedia y siempre tomaba la reducida).
@Component({
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Prioridad del foco">
      <input class="primero" disabled />
      <input class="segundo" />
      <button ui-button uiDialogActions type="button" class="elegido" data-autofocus>Elegido</button>
    </ui-dialog-frame>
  `,
})
class AutofocusDialog {}

@Component({
  imports: [UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-dialog-frame title="Sin marca"><input class="primero" disabled /><input class="segundo" /></ui-dialog-frame>`,
})
class FirstEnabledDialog {}

// un control oculto pasa los selectores, pero no recibe el foco; se salta y se sigue buscando.
@Component({
  imports: [UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-dialog-frame title="Con ocultos">
    <input type="hidden" class="oculto" /><div hidden><input class="plegado" /></div><input class="visible" />
  </ui-dialog-frame>`,
})
class HiddenCandidatesDialog {}

describe('UiDialog con salida animada y opciones (revisión de F2)', () => {
  const realMatchMedia = window.matchMedia;
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  };
  const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

  beforeEach(() => {
    (window as unknown as { matchMedia: unknown }).matchMedia = (media: string) =>
      ({ matches: false, media, addEventListener: () => undefined, removeEventListener: () => undefined });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    (window as unknown as { matchMedia: unknown }).matchMedia = realMatchMedia;
  });

  it('C1: si la navegación destruye la capa (Atrás), el diálogo se cierra sin error y la app deja de estar oculta', async () => {
    const app = document.createElement('div');
    document.body.appendChild(app);
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    expect(app.getAttribute('aria-hidden')).toBe('true');
    const closed = firstValueFrom(ref.closed);
    ref.overlayRef.dispose();
    expect(await closed).toBeUndefined();
    expect(TestBed.inject(Dialog).openDialogs.length).toBe(0);
    expect(app.hasAttribute('aria-hidden')).toBe(false);
    app.remove();
  });

  it('I8: durante la salida el diálogo queda inerte (sin doble disparo) y se cierra al terminar', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    const closed = firstValueFrom(ref.closed);
    ref.close('primero');
    expect(ref.overlayRef.overlayElement.hasAttribute('inert')).toBe(true);
    ref.close('segundo');
    expect(await closed).toBe('primero');
  });

  it('I8: disableClose impide que Esc lo cierre', async () => {
    const ref = TestBed.inject(UiDialog).open(EditGroupDialog, { disableClose: true });
    await settle();
    escape();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(TestBed.inject(Dialog).openDialogs.length).toBe(1);
    const closed = firstValueFrom(ref.closed);
    ref.close();
    await closed;
  });

  it('I8: el foco inicial va a [data-autofocus] aunque haya controles antes, y salta los deshabilitados', async () => {
    const dialog = TestBed.inject(UiDialog);
    let ref = dialog.open(AutofocusDialog, {});
    await settle();
    await settle();
    expect(document.activeElement?.classList).toContain('elegido');
    let closed = firstValueFrom(ref.closed);
    ref.close();
    await closed;
    await settle();

    ref = dialog.open(FirstEnabledDialog, {});
    await settle();
    await settle();
    expect(document.activeElement?.classList).toContain('segundo');
    closed = firstValueFrom(ref.closed);
    ref.close();
    await closed;
  });

  it('el foco inicial salta los controles ocultos (type="hidden" o dentro de [hidden]) y llega al primero visible', async () => {
    const ref = TestBed.inject(UiDialog).open(HiddenCandidatesDialog, {});
    await settle();
    await settle();
    expect(document.activeElement?.classList).toContain('visible');
    const closed = firstValueFrom(ref.closed);
    ref.close();
    await closed;
  });
});

/**
 * C13 revisado (DISENO §2.5, hallazgo 10 de la revisión): la capa del CDK vive en `body`, fuera de cualquier piel, así que
 * `UiDialog` le pone la de quien la abre, en la capa y en su velo (nunca en `body`: REGLA-010). Orden: piel explícita →
 * contenedor de `origen` → contenedor del foco (si no está en `body`) → tema. Una piel heredada o del tema se sigue
 * mientras la capa está abierta; una explícita queda fija.
 */
// req: DP-24 (los diálogos heredan la piel de quien los abre), REGLA-010
describe('UiDialog: la piel de la capa (C13)', () => {
  let tema: TemaService;
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
  };
  const capas = () => [...document.querySelectorAll<HTMLElement>('.cdk-overlay-pane')];
  const velos = () => [...document.querySelectorAll<HTMLElement>('.cdk-overlay-backdrop')];
  const pielDe = (el: Element | undefined) => el?.getAttribute('data-skin');
  const cerrarTodo = async () => {
    TestBed.inject(Dialog).closeAll();
    await new Promise(resolve => setTimeout(resolve, 250));
    await settle();
  };
  /** Un botón dentro de un contenedor con piel, como el del juego o el del shell del portal. */
  const botonEn = (piel: 'game' | 'portal') => {
    const contenedor = document.createElement('section');
    contenedor.setAttribute('data-skin', piel);
    const boton = document.createElement('button');
    boton.textContent = 'Abrir';
    contenedor.appendChild(boton);
    document.body.appendChild(contenedor);
    return { contenedor, boton };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    tema = TestBed.inject(TemaService);
    tema.fijar('claro');
  });

  afterEach(async () => {
    await cerrarTodo();
    tema.fijar('sistema');
    document.querySelectorAll('section[data-skin]').forEach(el => el.remove());
  });

  it('abierto por teclado desde un botón dentro de [data-skin="game"] sale oscuro, y desde el portal, claro', async () => {
    const juego = botonEn('game');
    juego.boton.focus();
    TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
    expect(pielDe(velos()[0])).toBe('game');
    expect(capas()[0].classList).toContain('ui-overlay-materiales');
    expect(velos()[0].classList).toContain('ui-overlay-materiales');
    await cerrarTodo();

    // Con el tema en oscuro, para que la piel salga del contenedor y no del tema.
    tema.fijar('oscuro');
    const portal = botonEn('portal');
    portal.boton.focus();
    void TestBed.inject(UiDialog).confirm({ title: 'Publicar caso', message: 'Lo verán tus estudiantes.', confirmLabel: 'Publicar' });
    await settle();
    expect(pielDe(capas()[0])).toBe('portal');
    // Nunca en body ni en html (REGLA-010).
    expect(document.body.hasAttribute('data-skin')).toBe(false);
    expect(document.documentElement.hasAttribute('data-skin')).toBe(false);
  });

  it('con `origen` toma la piel del contenedor de quien la abre aunque el foco esté en otra parte', async () => {
    const juego = botonEn('game');
    const portal = botonEn('portal');
    portal.boton.focus();
    void TestBed.inject(UiDialog).consequence({
      title: '¿Iniciar un intento nuevo?', consequence: 'Perderás el avance.', continueLabel: 'Continuar', proceedLabel: 'Iniciar',
      origen: juego.boton,
    });
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
  });

  it('apertura programática con el foco en body (tras una respuesta del servidor): la piel del tema', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    expect(pielDe(capas()[0])).toBe('portal');
    await cerrarTodo();

    tema.fijar('oscuro');
    (document.activeElement as HTMLElement | null)?.blur();
    TestBed.inject(UiDialog).sheet(EditGroupDialog, { side: 'end' });
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
  });

  it('un diálogo anidado hereda la piel del diálogo padre', async () => {
    const dialog = TestBed.inject(UiDialog);
    // Padre oscuro y fijo con el tema en claro: si el hijo cayera al tema, saldría claro.
    dialog.open(EditGroupDialog, { piel: 'game' });
    await settle();
    expect(capas()[0].contains(document.activeElement)).toBe(true);
    dialog.open(EditGroupDialog, {});
    await settle();
    expect(capas().map(pielDe)).toEqual(['game', 'game']);
  });

  it('con piel «tema», cambiar el tema con el diálogo abierto cambia la capa y el velo', async () => {
    TestBed.inject(UiDialog).open(EditGroupDialog, { piel: 'tema' });
    await settle();
    expect(pielDe(capas()[0])).toBe('portal');
    tema.fijar('oscuro');
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
    expect(pielDe(velos()[0])).toBe('game');
  });

  it('con piel explícita «game» la capa queda oscura aunque cambie el tema', async () => {
    TestBed.inject(UiDialog).open(EditGroupDialog, { piel: 'game' });
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
    tema.fijar('oscuro');
    await settle();
    tema.fijar('claro');
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
  });

  it('una piel heredada sigue a su contenedor: si el shell cambia de piel con el diálogo abierto, la capa también', async () => {
    const shell = botonEn('portal');
    shell.boton.focus();
    TestBed.inject(UiDialog).open(EditGroupDialog, {});
    await settle();
    expect(pielDe(capas()[0])).toBe('portal');
    shell.contenedor.setAttribute('data-skin', 'game');
    await settle();
    expect(pielDe(capas()[0])).toBe('game');
  });
});
