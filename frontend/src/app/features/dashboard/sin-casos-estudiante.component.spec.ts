import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
import { SinCasosEstudianteComponent } from './sin-casos-estudiante.component';

const invitacion = (extra: Partial<Invitation> = {}): Invitation => ({
  id: 1, groupId: 1, groupName: 'Grupo A', teacherName: 'Paula Ríos', invitedAt: null, status: 'ACTIVE', casesCount: 0, ...extra,
});

describe('SinCasosEstudianteComponent: el vacío «sin casos» orienta según la situación', () => {
  async function render(entrada: readonly Invitation[] | null | undefined, list: () => Observable<Invitation[]> = () => of([])) {
    const api = { list: vi.fn(list) };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: InvitationsApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(SinCasosEstudianteComponent);
    if (entrada !== undefined) fixture.componentRef.setInput('invitaciones', entrada);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return {
      api,
      host,
      motivo: () => host.querySelector('ui-vacio-ilustrado')?.getAttribute('data-motivo'),
      titulo: () => host.querySelector('.ui-vacio-ilustrado__titulo')?.textContent?.trim(),
      enlace: () => host.querySelector('a'),
    };
  }

  it('sin estar en ningún grupo: lo dice y el botón lleva a Grupos', async () => {
    const vista = await render([]);
    expect(vista.motivo()).toBe('sin-grupo');
    expect(vista.titulo()).toBe('Todavía no estás en ningún grupo');
    expect(vista.enlace()?.getAttribute('href')).toBe('/portal/invitaciones');
    expect(vista.enlace()?.textContent).toContain('Ir a Grupos');
  });

  it('con una invitación esperando: es la acción principal', async () => {
    const vista = await render([invitacion({ status: 'INVITED', casesCount: null })]);
    expect(vista.motivo()).toBe('invitacion-pendiente');
    expect(vista.enlace()?.classList).toContain('ui-button--primary');
  });

  it('en un grupo sin casos: la acción es secundaria (no hay nada que aceptar)', async () => {
    const vista = await render([invitacion()]);
    expect(vista.motivo()).toBe('grupo-sin-casos');
    expect(vista.titulo()).toBe('Tu grupo todavía no tiene casos');
    expect(vista.enlace()?.classList).toContain('ui-button--secondary');
  });

  it('con la lista que da la pantalla no vuelve a pedirla', async () => {
    const vista = await render([]);
    expect(vista.api.list).not.toHaveBeenCalled();
  });

  it('sin lista (`undefined`) la pide una sola vez y se orienta con ella', async () => {
    const vista = await render(undefined, () => of([invitacion()]));
    expect(vista.api.list).toHaveBeenCalledTimes(1);
    expect(vista.motivo()).toBe('grupo-sin-casos');
  });

  it('si la lista no carga, no inventa el motivo: dice lo cierto y deja el camino a Grupos', async () => {
    const vista = await render(undefined, () => throwError(() => ({ status: 500 })));
    expect(vista.motivo()).toBe('sin-saber');
    expect(vista.titulo()).toBe('Aún no tienes casos asignados');
    expect(vista.enlace()?.getAttribute('href')).toBe('/portal/invitaciones');
  });

  it('`null` (la pantalla no pudo cargarlas) tampoco afirma nada', async () => {
    const vista = await render(null);
    expect(vista.motivo()).toBe('sin-saber');
    expect(vista.api.list).not.toHaveBeenCalled();
  });
});
