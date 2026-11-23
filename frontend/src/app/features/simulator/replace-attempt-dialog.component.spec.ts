import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DRAFT_COPY, draftCopyList } from './draft-copy';
import { ReplaceAttemptDialogComponent } from './replace-attempt-dialog.component';

/**
 * El motivo del reemplazo docente (E1-2, RN-07): obligatorio, como mucho 500 caracteres (`ReplaceAttemptRequest`), y
 * queda registrado en el intento. El diálogo dice qué le pasa al intento antes de confirmar.
 */
// req: RN-07
describe('ReplaceAttemptDialogComponent', () => {
  let fixture: ComponentFixture<ReplaceAttemptDialogComponent>;
  const close = vi.fn();
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (label: string) => [...host().querySelectorAll('button')]
    .find(el => text(el.querySelector('.ui-button__label')) === label) as HTMLButtonElement;
  const reason = () => host().querySelector('textarea') as HTMLTextAreaElement;

  beforeEach(async () => {
    close.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: { studentAlias: 'Ana R.', caseTitle: 'Violencia familiar' } },
      ],
    });
    fixture = TestBed.createComponent(ReplaceAttemptDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('dice de quién es el intento y qué le pasa al reemplazarlo', () => {
    expect(text(host())).toContain('Reemplazar intento');
    expect(text(host())).toContain('Ana R.');
    expect(text(host())).toContain('Violencia familiar');
    expect(text(host())).toContain('Reemplazado por un intento nuevo');
  });

  it('el motivo es obligatorio: sin él no se cierra y lo dice en su campo', () => {
    button('Reemplazar intento').click();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(text(host().querySelector('.ui-field__message--error'))).toBe('Escribe el motivo del reemplazo.');
    expect(reason().getAttribute('aria-invalid')).toBe('true');
  });

  it('con motivo, devuelve el texto sin espacios de más; el campo no admite más de 500 caracteres', () => {
    expect(reason().getAttribute('maxlength')).toBe('500');
    reason().value = '  Se trabó el mundo  ';
    reason().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Reemplazar intento').click();
    expect(close).toHaveBeenCalledWith('Se trabó el mundo');
  });

  it('«Cancelar» cierra sin motivo', () => {
    button('Cancelar').click();
    expect(close).toHaveBeenCalledWith(undefined);
  });

  // Revisión de F7b: enviar sin motivo lleva el foco al campo (como los demás formularios), no lo deja a la deriva.
  // req: RNF-04, BLOQUE-H
  it('sin motivo, el foco va al campo del motivo', () => {
    document.body.appendChild(host());
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      button('Reemplazar intento').click();
      fixture.detectChanges();
      expect(document.activeElement).toBe(reason());
    } finally {
      host().remove();
    }
  });

  // Revisión de F7b: lo que se le dice al docente sobre la bitácora del estudiante es hermano de RN-07 y pasa por
  // Psicología: sale del registro de borradores, no de un texto suelto.
  // req: RN-07
  it('la consecuencia del reemplazo sale del registro de borradores', () => {
    expect(text(host())).toContain(DRAFT_COPY.replaceAttemptConsequence.text);
    expect(draftCopyList().find(entry => entry.key === 'replaceAttemptConsequence')).toMatchObject({
      decision: 'RN-07', owner: 'Psicología', review: 'validar',
    });
  });
});
