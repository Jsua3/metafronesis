import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
  const usuario = signal<{role: string; id?: number} | null>({ role: 'PROFESOR' });
  const api = { listAuthoringCases: vi.fn(), cloneCaseVersion: vi.fn() };
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
  beforeEach(() => { usuario.set({ role: 'PROFESOR' }); api.listAuthoringCases.mockReset(); api.cloneCaseVersion.mockReset(); });
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
  describe('autoría compartida', () => {
    const ana = { id: 1, nombre: 'Ana Docente' };
    const beto = { id: 2, nombre: 'Beto Docente' };
    const carla = { id: 3, nombre: 'Carla Docente' };
    const tarjetas = () => [...host().querySelectorAll('ui-card')] as HTMLElement[];

    it('cada tarjeta dice el autor y, si los hay, quiénes más lo editaron', async () => {
      usuario.set({ role: 'PROFESOR', id: 1 });
      api.listAuthoringCases.mockReturnValue(of([
        { ...caso(1, 'PUBLISHED'), autor: ana, editadoPor: [beto, carla], puedeCrearVersion: true },
        { ...caso(2, 'DRAFT'), autor: ana, editadoPor: [], puedeEditar: true },
      ])); await render();
      const [primera, segunda] = tarjetas();
      expect(primera.querySelector('.hub-card__autor')?.textContent).toBe('Autor: Ana Docente');
      expect(primera.querySelector('.hub-card__editores')?.textContent).toBe('Editado por: Beto Docente, Carla Docente');
      expect(segunda.querySelector('.hub-card__autor')?.textContent).toBe('Autor: Ana Docente');
      expect(segunda.querySelector('.hub-card__editores')).toBeNull();
    });

    it('la publicada de un caso ajeno ofrece «Crear nueva versión» y el borrador propio sigue editándose', async () => {
      usuario.set({ role: 'PROFESOR', id: 2 });
      api.listAuthoringCases.mockReturnValue(of([
        { ...caso(1, 'PUBLISHED'), autor: ana, editadoPor: [], puedeEditar: false, puedeCrearVersion: true },
        { ...caso(2, 'DRAFT'), autor: beto, puedeEditar: true, puedeCrearVersion: false },
        { ...caso(3, 'PUBLISHED'), autor: beto, puedeEditar: false, puedeCrearVersion: true },
      ])); await render();
      const [ajena, propio, propia] = tarjetas();
      expect(ajena.querySelector('.hub-card__crear-version')?.textContent).toContain('Crear nueva versión');
      expect(ajena.textContent).not.toContain('Abrir en el editor');
      expect(propio.querySelector('.hub-card__crear-version')).toBeNull();
      expect(propio.querySelector('a[href="/portal/casos/2/editor"]')?.textContent).toContain('Seguir editando');
      // En su propio caso publicado la acción es la de siempre: el editor ofrece ahí crear la versión.
      expect(propia.querySelector('.hub-card__crear-version')).toBeNull();
      expect(propia.textContent).toContain('Abrir en el editor');
    });

    it('sin permiso de crear versiones (lo dice el servidor) no se ofrece', async () => {
      usuario.set({ role: 'PROFESOR', id: 2 });
      api.listAuthoringCases.mockReturnValue(of([{ ...caso(1, 'PUBLISHED'), autor: ana, puedeEditar: false, puedeCrearVersion: false }]));
      await render();
      expect(host().querySelector('.hub-card__crear-version')).toBeNull();
      expect(host().textContent).toContain('Abrir en el editor');
    });

    it('«Crear nueva versión» clona la publicada y abre el borrador nuevo en el editor', async () => {
      usuario.set({ role: 'PROFESOR', id: 2 });
      api.listAuthoringCases.mockReturnValue(of([{ ...caso(7, 'PUBLISHED'), autor: ana, puedeEditar: false, puedeCrearVersion: true }]));
      api.cloneCaseVersion.mockReturnValue(of({ caseVersionId: 11 }));
      await render();
      const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      (host().querySelector('.hub-card__crear-version') as HTMLButtonElement).click();
      expect(api.cloneCaseVersion).toHaveBeenCalledWith(7);
      expect(navegar).toHaveBeenCalledWith(['/portal/casos', 11, 'editor']);
    });

    it('si no se puede crear la versión lo dice y deja volver a intentarlo', async () => {
      usuario.set({ role: 'PROFESOR', id: 2 });
      api.listAuthoringCases.mockReturnValue(of([{ ...caso(7, 'PUBLISHED'), autor: ana, puedeEditar: false, puedeCrearVersion: true }]));
      api.cloneCaseVersion.mockReturnValue(throwError(() => ({ error: { message: 'No tiene permiso para crear o editar casos.' } })));
      await render();
      const boton = host().querySelector('.hub-card__crear-version') as HTMLButtonElement;
      boton.click(); fixture.detectChanges();
      expect(host().querySelector('.hub-error')?.textContent).toContain('No tiene permiso para crear o editar casos.');
      expect(boton.disabled).toBe(false);
    });

    it('agrupa las versiones de un mismo caso también para el docente', async () => {
      usuario.set({ role: 'PROFESOR', id: 2 });
      api.listAuthoringCases.mockReturnValue(of([
        { ...caso(1, 'PUBLISHED', 8), autor: ana, puedeCrearVersion: true }, { ...caso(2, 'DRAFT', 8), autor: ana, puedeEditar: true },
      ])); await render();
      expect(fixture.componentInstance.grupos()).toHaveLength(1);
      expect(host().querySelector('summary')?.textContent).toContain('Otras versiones (1)');
    });
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
