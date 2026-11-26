import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
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
    // El nombre accesible empieza por el texto visible (WCAG 2.5.3).
    expect(boton.getAttribute('aria-label')).toBe('Asignar a un grupo: «Caso de prueba»');
    expect(boton.getAttribute('aria-label')!.startsWith(boton.textContent!.trim())).toBe(true);
    boton.click(); await fixture.whenStable();
    expect(open).toHaveBeenCalledWith(expect.anything(), { data: expect.objectContaining({ fixedCaseId: 7, title: 'Caso de prueba' }) });
  });
  it('avisa que el caso quedó asignado, para que el Inicio refresque «Lo siguiente»', async () => {
    const open = vi.fn(() => ({ closed: of({ groupId: 4, opensAt: null, closesAt: null }) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([{ id: 4, nombre: 'Grupo A', totalEstudiantes: 24 }]) } },
      { provide: AssignmentService, useValue: { create: () => of({}) } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    const asignado = vi.fn();
    fixture.componentInstance.asignado.subscribe(asignado);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    expect(asignado).toHaveBeenCalledTimes(1);
  });
  it('un error técnico del servidor se dice en palabras de persona y no se avisa que se asignó', async () => {
    const error = vi.fn(); const asignado = vi.fn();
    const open = vi.fn(() => ({ closed: of({ groupId: 4, opensAt: null, closesAt: null }) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([{ id: 4, nombre: 'Grupo A', totalEstudiantes: 24 }]) } },
      { provide: AssignmentService, useValue: { create: () => throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Internal Server Error' } })) } },
      { provide: NotificationService, useValue: { success: vi.fn(), error } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentInstance.asignado.subscribe(asignado);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    expect(error).toHaveBeenCalledWith('No fue posible asignar el caso. Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.');
    expect(asignado).not.toHaveBeenCalled();
  });

  it('la confirmación dice cuándo podrán empezarlo los estudiantes (después de qué caso)', async () => {
    const success = vi.fn();
    const open = vi.fn(() => ({ closed: of({ groupId: 4, opensAt: null, closesAt: null, despuesDe: 'Violencia Familiar' }) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([{ id: 4, nombre: 'Grupo A', totalEstudiantes: 24 }]) } },
      { provide: AssignmentService, useValue: { create: () => of({}), list: () => of([]) } },
      { provide: NotificationService, useValue: { success, error: vi.fn() } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Tus estudiantes lo harán después de terminar «Violencia Familiar».'));
  });
  it('sin casos previos dice que lo pueden empezar de inmediato', async () => {
    const success = vi.fn();
    const open = vi.fn(() => ({ closed: of({ groupId: 4, opensAt: null, closesAt: null, despuesDe: null }) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([{ id: 4, nombre: 'Grupo A', totalEstudiantes: 24 }]) } },
      { provide: AssignmentService, useValue: { create: () => of({}) } },
      { provide: NotificationService, useValue: { success, error: vi.fn() } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Tus estudiantes pueden empezarlo de inmediato.'));
  });
  it('el diálogo recibe cómo pedir la secuencia del grupo elegido', async () => {
    const list = vi.fn(() => of([]));
    const open = vi.fn(() => ({ closed: of(undefined) }));
    TestBed.configureTestingModule({ providers: [
      { provide: GrupoService, useValue: { listar: () => of([]) } },
      { provide: AssignmentService, useValue: { create: vi.fn(), list } },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: UiDialog, useValue: { open } },
    ] });
    const fixture = TestBed.createComponent(AsignarDesdeCasoComponent);
    fixture.componentRef.setInput('caseId', 7); fixture.componentRef.setInput('publicado', true); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    const data = (open.mock.calls[0] as unknown as [unknown, { data: { loadGroupAssignments: (id: number) => unknown } }])[1].data;
    data.loadGroupAssignments(4);
    expect(list).toHaveBeenCalledWith(4);
  });
});
