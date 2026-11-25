import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, describe, it, expect } from 'vitest';
import { GrupoService } from '../../core/api/grupo.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AsignarDesdeCasoComponent } from './asignar-desde-caso.component';

describe('Asignar desde el caso', () => {
  it('explica por qué no se puede asignar un borrador', () => {
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentRef.setInput('caseId', 1); fixture.componentRef.setInput('publicado', false); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Publica el caso para poder asignarlo');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });
  it('asigna al grupo elegido e informa su nombre y estudiantes', async () => {
    const create = vi.fn(() => of({})); const success = vi.fn();
    const open = vi.fn(() => ({ closed: of({ groupId: 4, opensAt: null, closesAt: null }) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([{ id: 4, nombre: 'Grupo A', totalEstudiantes: 24 }]) } },
      { provide: AssignmentService, useValue: { create } },
      { provide: NotificationService, useValue: { success, error: vi.fn() } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ caseVersionId: 7, target: { type: 'GROUP', groupId: 4 } }));
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Grupo A. Lo verán 24 estudiantes'));
  });
  it('en la barra dice una palabra, el lector oye qué caso se asigna y el diálogo lleva su nombre', async () => {
    const open = vi.fn(() => ({ closed: of(undefined) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([]) } },
      { provide: AssignmentService, useValue: { create: vi.fn() } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true);
    fixture.componentRef.setInput('titulo', 'Caso de prueba'); fixture.componentRef.setInput('compacto', true); fixture.detectChanges();
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(boton.textContent?.trim()).toBe('Asignar');
    expect(boton.getAttribute('aria-label')).toBe('Asignar «Caso de prueba» a un grupo');
    boton.click(); await fixture.whenStable();
    expect(open).toHaveBeenCalledWith(expect.anything(), { data: expect.objectContaining({ fixedCaseId: 7, title: 'Caso de prueba' }) });
  });
});
