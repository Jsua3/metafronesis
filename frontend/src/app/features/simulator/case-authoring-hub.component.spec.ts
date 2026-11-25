import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AssignmentService } from '../../core/api/assignment.service';
import { AuthoringApi } from '../../core/api/authoring.api';
import { GrupoService } from '../../core/api/grupo.service';
import { Assignment } from '../../core/models/assignment.model';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { CaseAuthoringHubComponent } from './case-authoring-hub.component';

const caso = (id: number, status: string, caseId = id): SimulationCaseSummary => ({
  caseVersionId: id, caseId, status, title: `Caso ${id}`, code: `COD-${id}`,
  description: '', semanticVersion: '0.1.0', nodeCount: 5, escenasConGuion: 3,
});

describe('Lista de casos de autoría', () => {
  let fixture: ComponentFixture<CaseAuthoringHubComponent>;
  const usuario = signal<{role: string} | null>({ role: 'PROFESOR' });
  const api = { listAuthoringCases: vi.fn() };
  const asignaciones = { listAll: vi.fn() };
  const grupos = { listar: vi.fn() };
  const host = () => fixture.nativeElement as HTMLElement;
  async function render(esperar = true) {
    TestBed.configureTestingModule({ imports: [CaseAuthoringHubComponent], providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthoringApi, useValue: api }, { provide: AuthService, useValue: { currentUser: usuario } },
      { provide: AssignmentService, useValue: asignaciones }, { provide: GrupoService, useValue: grupos },
    ] });
    fixture = TestBed.createComponent(CaseAuthoringHubComponent);
    if (esperar) await fixture.whenStable();
    fixture.detectChanges();
  }
  beforeEach(() => {
    usuario.set({ role: 'PROFESOR' }); api.listAuthoringCases.mockReset();
    asignaciones.listAll.mockReset().mockReturnValue(of([])); grupos.listar.mockReset().mockReturnValue(of([]));
  });
  afterEach(() => TestBed.resetTestingModule());

  it('conserva una sola entrada de creación también en el vacío', async () => {
    api.listAuthoringCases.mockReturnValue(of([])); await render();
    expect(host().querySelectorAll('a[href="/portal/casos/nuevo"]')).toHaveLength(1);
    expect(host().textContent).toContain('Aún no tienes casos');
    expect(host().querySelector('ui-vacio-ilustrado button')).toBeNull();
  });
  it('ofrece la acción correspondiente a cada estado', async () => {
    api.listAuthoringCases.mockReturnValue(of([caso(1, 'DRAFT'), caso(2, 'IN_REVIEW'), caso(3, 'PUBLISHED'), caso(4, 'ARCHIVED')])); await render();
    const texto = host().textContent ?? '';
    for (const accion of ['Seguir editando', 'Ver revisión', 'Abrir en el editor', 'Ver']) expect(texto).toContain(accion);
    expect(host().querySelector('a[href="/portal/casos/2/editor/revision"]')).not.toBeNull();
    expect(host().querySelector('a[href="/portal/casos/3/ensayo"]')).toBeNull();
    expect(texto).toContain('3 de 5 escenas con guion');
    expect(texto).not.toContain('nodos'); expect(texto).not.toContain('v0.1.0');
  });
  it('agrupa para administración, prioriza la publicada y conserva versiones sin caseId', async () => {
    usuario.set({ role: 'ADMIN' });
    const sinId = { ...caso(3, 'DRAFT'), caseId: undefined };
    api.listAuthoringCases.mockReturnValue(of([caso(1, 'DRAFT', 8), caso(2, 'PUBLISHED', 8), sinId])); await render();
    expect(fixture.componentInstance.grupos()).toHaveLength(2);
    expect(fixture.componentInstance.grupos()[0][0].caseVersionId).toBe(2);
    expect(host().querySelector('summary')?.textContent).toContain('Otras versiones (1)');
  });
  it('filtra por estado y búsqueda y permite limpiar', async () => {
    api.listAuthoringCases.mockReturnValue(of(Array.from({length: 7}, (_, i) => caso(i + 1, i === 0 ? 'DRAFT' : 'PUBLISHED')))); await render();
    fixture.componentInstance.filtro.set('DRAFT'); fixture.componentInstance.busqueda.set('Caso 1'); fixture.detectChanges();
    expect(fixture.componentInstance.filtrados()).toHaveLength(1);
    expect(host().querySelector('input[type="search"]')).not.toBeNull();
    fixture.componentInstance.busqueda.set('inexistente'); fixture.detectChanges();
    expect(host().textContent).toContain('No hay resultados');
  });
  it('mantiene carga y error con reintento', async () => {
    const pendiente = new Subject<SimulationCaseSummary[]>();
    // El esqueleto y el error aparecen tras una pequeña espera (evita parpadeos): se adelanta el reloj.
    vi.useFakeTimers();
    try {
      api.listAuthoringCases.mockReturnValueOnce(pendiente).mockReturnValueOnce(of([caso(1, 'DRAFT')]));
      await render(false);
      await vi.advanceTimersByTimeAsync(400); fixture.detectChanges();
      expect(host().querySelector('[aria-busy="true"]')).not.toBeNull();
      pendiente.error(new Error('red'));
      await vi.advanceTimersByTimeAsync(400); fixture.detectChanges();
      expect(host().querySelector('ui-error-state')).not.toBeNull();
      (host().querySelector('ui-error-state button') as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(400); fixture.detectChanges();
    } finally { vi.useRealTimers(); }
    expect(host().querySelector('ui-error-state')).toBeNull();
    expect(host().textContent).toContain('Caso 1');
  });

  // F2 · tras asignar, la tarjeta no decía a qué grupo había ido: la docente no sabía si ya estaba asignado.
  describe('a qué grupos está asignado cada caso', () => {
    const asignacion = (id: number, versionId: number, groupId: number, active = true): Assignment =>
      ({ id, caseId: versionId, caseVersionId: versionId, target: { type: 'GROUP', groupId }, state: 'OPEN', active, sortOrder: id });
    const grupo = (id: number, nombre: string) => ({ id, nombre, codigo: `G${id}`, totalEstudiantes: 10 });
    const asignado = (version: number) => {
      const tarjeta = Array.from(host().querySelectorAll('ui-card')).find(t => (t.textContent ?? '').includes(`Caso ${version}`));
      return tarjeta?.querySelector('[data-hub-asignado]')?.textContent?.trim() ?? null;
    };

    it('un caso publicado dice «Asignado a: Grupo A» o «Sin asignar», y conserva «Asignar»', async () => {
      api.listAuthoringCases.mockReturnValue(of([caso(1, 'PUBLISHED'), caso(2, 'PUBLISHED')]));
      asignaciones.listAll.mockReturnValue(of([asignacion(1, 1, 10)]));
      grupos.listar.mockReturnValue(of([grupo(10, 'Grupo A')]));
      await render();
      expect(asignado(1)).toBe('Asignado a: Grupo A');
      expect(asignado(2)).toBe('Sin asignar');
      expect(host().querySelectorAll('app-asignar-desde-caso button')).toHaveLength(2);
    });

    it('nombra varios grupos, marca el que está en pausa y resume si son más de tres', async () => {
      api.listAuthoringCases.mockReturnValue(of([caso(1, 'PUBLISHED'), caso(2, 'PUBLISHED')]));
      asignaciones.listAll.mockReturnValue(of([
        asignacion(1, 1, 10), asignacion(2, 1, 11, false),
        asignacion(3, 2, 10), asignacion(4, 2, 11), asignacion(5, 2, 12), asignacion(6, 2, 13), asignacion(7, 2, 14),
      ]));
      grupos.listar.mockReturnValue(of([10, 11, 12, 13, 14].map(id => grupo(id, `Grupo ${id}`))));
      await render();
      expect(asignado(1)).toBe('Asignado a: Grupo 10, Grupo 11 (en pausa)');
      expect(asignado(2)).toBe('Asignado a: Grupo 10, Grupo 11, Grupo 12 y 2 más');
    });

    it('borradores y casos en revisión no dicen nada: no se pueden asignar todavía', async () => {
      api.listAuthoringCases.mockReturnValue(of([caso(1, 'DRAFT'), caso(2, 'IN_REVIEW'), caso(3, 'PUBLISHED')]));
      await render();
      expect(asignado(1)).toBeNull();
      expect(asignado(2)).toBeNull();
      expect(asignado(3)).toBe('Sin asignar');
    });

    it('si no se pueden leer las asignaciones no afirma «Sin asignar»', async () => {
      api.listAuthoringCases.mockReturnValue(of([caso(1, 'PUBLISHED')]));
      asignaciones.listAll.mockReturnValue(throwError(() => new Error('red')));
      await render();
      expect(asignado(1)).toBeNull();
      expect(host().textContent).not.toContain('Sin asignar');
    });

    it('sin casos publicados no pide las asignaciones', async () => {
      api.listAuthoringCases.mockReturnValue(of([caso(1, 'DRAFT')]));
      await render();
      expect(asignaciones.listAll).not.toHaveBeenCalled();
    });

    it('al asignar desde la tarjeta vuelve a leer a qué grupos está', async () => {
      api.listAuthoringCases.mockReturnValue(of([caso(1, 'PUBLISHED')]));
      grupos.listar.mockReturnValue(of([grupo(10, 'Grupo A')]));
      asignaciones.listAll.mockReturnValueOnce(of([])).mockReturnValueOnce(of([asignacion(1, 1, 10)]));
      await render();
      expect(asignado(1)).toBe('Sin asignar');
      fixture.componentInstance.loadAsignaciones();
      fixture.detectChanges();
      expect(asignado(1)).toBe('Asignado a: Grupo A');
    });
  });
});
