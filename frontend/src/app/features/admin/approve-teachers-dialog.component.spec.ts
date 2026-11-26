import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ApproveTeachersDialogComponent } from './approve-teachers-dialog.component';
describe('aprobación de docentes', () => {
  it('permite elegir el permiso en la confirmación', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: DIALOG_DATA, useValue: 'Se enviará un correo.' }, { provide: DialogRef, useValue: { close } }] });
    const fixture = TestBed.createComponent(ApproveTeachersDialogComponent); fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelector('input'); checkbox.click(); fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find(b => b.textContent?.includes('Aprobar'))!.click();
    expect(close).toHaveBeenCalledWith(true);
  });
});
