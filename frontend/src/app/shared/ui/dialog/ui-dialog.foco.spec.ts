import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { UiButton } from '../button/ui-button';
import { UiDialog, UiDialogActions, UiDialogFrame } from './ui-dialog';

@Component({
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Quitar grupo">
      <button ui-button uiDialogActions type="button" class="aceptar">Aceptar</button>
    </ui-dialog-frame>
  `,
})
class QuitarDialog {}

/**
 * Retorno de foco al cerrar un diálogo (P10; WCAG 2.4.3). El CDK devuelve el foco al disparador; si el disparador ya no
 * existe (la fila se borró con el diálogo abierto), el foco debe ir al encabezado de la pantalla y no caer en `<body>`.
 */
// req: RNF-004 (el foco no se pierde al cerrar un diálogo)
describe('UiDialog: el foco no se pierde al cerrar', () => {
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    document.body.innerHTML = '<main id="main-content"><h1 id="titulo">Grupos</h1><button id="fila">Quitar</button></main>';
    document.getElementById('fila')!.focus();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  async function abrirYCerrar(antesDeCerrar: () => void): Promise<void> {
    const ref = TestBed.inject(UiDialog).open(QuitarDialog, {});
    await settle();
    antesDeCerrar();
    const cerrado = firstValueFrom(ref.closed);
    ref.close();
    await cerrado;
    await settle();
  }

  it('con el disparador vivo, el foco vuelve a él', async () => {
    await abrirYCerrar(() => undefined);
    expect(document.activeElement).toBe(document.getElementById('fila'));
  });

  it('si el disparador desapareció mientras el diálogo estaba abierto, el foco va al h1 de la pantalla', async () => {
    await abrirYCerrar(() => document.getElementById('fila')!.remove());
    expect(document.activeElement).toBe(document.getElementById('titulo'));
  });

  it('con restoreFocus: false no mueve el foco por su cuenta', async () => {
    const ref = TestBed.inject(UiDialog).open(QuitarDialog, { restoreFocus: false });
    await settle();
    document.getElementById('fila')!.remove();
    const cerrado = firstValueFrom(ref.closed);
    ref.close();
    await cerrado;
    await settle();
    expect(document.activeElement).not.toBe(document.getElementById('titulo'));
  });
});
