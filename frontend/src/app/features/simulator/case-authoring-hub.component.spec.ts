import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AuthoringApi } from '../../core/api/authoring.api';
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
  const host = () => fixture.nativeElement as HTMLElement;
  async function render(esperar = true) {
    TestBed.configureTestingModule({ imports: [CaseAuthoringHubComponent], providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthoringApi, useValue: api }, { provide: AuthService, useValue: { currentUser: usuario } },
    ] });
    fixture = TestBed.createComponent(CaseAuthoringHubComponent);
    if (esperar) await fixture.whenStable();
    fixture.detectChanges();
  }
  beforeEach(() => { usuario.set({ role: 'PROFESOR' }); api.listAuthoringCases.mockReset(); });
  afterEach(() => TestBed.resetTestingModule());

  it('conserva una sola entrada de creación también en el vacío', async () => {
    api.listAuthoringCases.mockReturnValue(of([])); await render();
    expect(host().querySelectorAll('a[href="/portal/casos/nuevo"]')).toHaveLength(1);
    expect(host().textContent).toContain('Aún no tienes casos');
    expect(host().querySelector('ui-vacio-ilustrado button')).toBeNull();
  });
  it('ofrece la acción correspondiente a cada estado y el ensayo en otra pestaña', async () => {
    api.listAuthoringCases.mockReturnValue(of([caso(1, 'DRAFT'), caso(2, 'IN_REVIEW'), caso(3, 'PUBLISHED'), caso(4, 'ARCHIVED')])); await render();
    const texto = host().textContent ?? '';
    for (const accion of ['Seguir editando', 'Ver revisión', 'Abrir en el editor', 'Probar', 'Ver']) expect(texto).toContain(accion);
    expect(host().querySelector('a[href="/portal/casos/2/editor/revision"]')).not.toBeNull();
    expect(host().querySelector('a[href="/portal/casos/3/ensayo"]')?.getAttribute('target')).toBe('_blank');
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
});
