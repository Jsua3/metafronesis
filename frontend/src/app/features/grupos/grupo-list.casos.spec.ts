import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AssignmentService } from '../../core/api/assignment.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { GrupoListComponent } from './grupo-list.component';

const grupoA = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 3 } as Grupo;
const caso = (id: number, title: string) => ({ caseVersionId: id, code: `C-${id}`, title, semanticVersion: '1', status: 'PUBLISHED' }) as SimulationCaseSummary;

/**
 * P6 · «Asignar un caso» en la pestaña «Casos asignados»: la lista de casos publicados que se ofrece no se queda vieja
 * (un caso publicado hace un momento aparece al abrir la pestaña) y, si no cargó, se puede reintentar desde ahí.
 */
describe('Grupos: los casos publicados que se ofrecen para asignar (P6)', () => {
  let fixture: ComponentFixture<GrupoListComponent>;
  let publicados: ReturnType<typeof vi.fn<() => Observable<SimulationCaseSummary[]>>>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const motivo = () => host().querySelector('[data-ga-reason]');

  async function render(primera: () => Observable<SimulationCaseSummary[]>) {
    publicados = vi.fn(primera);
    TestBed.configureTestingModule({
      imports: [GrupoListComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: GrupoService, useValue: {
          listar: () => of([grupoA]), listarEstudiantes: () => of([]),
          importSpec: () => of({ requiredColumns: [], optionalColumns: [], columns: [], templateFilename: 'p.xlsx', acceptedExtensions: ['.xlsx'] }),
        } },
        { provide: CaseCatalogApi, useValue: { listPublished: publicados } },
        { provide: AssignmentService, useValue: { list: () => of([]) } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
        { provide: UiDialog, useValue: { confirm: vi.fn(), sheet: vi.fn(), open: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GrupoListComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.gestionarGrupo(grupoA);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function abrirCasos() {
    fixture.componentInstance.pestana.set('casos');
    fixture.componentInstance.alCambiarPestana('casos');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('un caso publicado después de abrir la pantalla aparece al abrir «Casos asignados»', async () => {
    await render(() => of([]));
    await abrirCasos();
    expect(text(motivo())).toContain('Aún no tienes casos publicados');
    expect(publicados).toHaveBeenCalledTimes(2);

    publicados.mockReturnValue(of([caso(9, 'Violencia en el aula')]));
    await abrirCasos();

    expect(publicados).toHaveBeenCalledTimes(3);
    expect(fixture.componentInstance.casosDisponibles().map(item => item.title)).toEqual(['Violencia en el aula']);
    expect(motivo()).toBeNull();
    expect(host().querySelector('[data-ga-assign]')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('si los casos publicados no cargaron, «Reintentar» junto al botón los vuelve a pedir y habilita «Asignar un caso»', async () => {
    await render(() => throwError(() => new Error('sin red')));
    await abrirCasos();
    expect(text(motivo())).toBe('No pudimos cargar tus casos publicados. Reintenta para poder asignar.');
    expect(host().querySelector('[data-ga-assign]')!.getAttribute('aria-disabled')).toBe('true');

    publicados.mockReturnValue(of([caso(9, 'Violencia en el aula')]));
    const reintentar = [...host().querySelectorAll<HTMLButtonElement>('.ga-reason button')].find(b => text(b) === 'Reintentar')!;
    reintentar.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(motivo()).toBeNull();
    expect(host().querySelector('[data-ga-assign]')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('un refresco al abrir la pestaña que falla conserva la lista que ya había (no apaga el botón)', async () => {
    await render(() => of([caso(9, 'Violencia en el aula')]));
    publicados.mockReturnValue(throwError(() => new Error('sin red')));
    await abrirCasos();
    expect(fixture.componentInstance.casosDisponibles()).toHaveLength(1);
    expect(motivo()).toBeNull();
  });
});
