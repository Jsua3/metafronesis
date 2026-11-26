import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { CaseCatalogApi } from '../../../core/api/case-catalog.api';
import { AuthService } from '../../../core/auth/auth.service';
import { SimulationCaseSummary } from '../../../core/models/simulation.model';
import { NavBadgesService } from '../../../shared/layout/nav-badges.service';
import { CasosPorAprobarComponent } from './casos-por-aprobar.component';
import { CasosPorAprobarService, casosPorAprobar } from './casos-por-aprobar.service';

const caso = (id: number, status: string): SimulationCaseSummary => ({
  caseVersionId: id, status, title: `Caso ${id}`, code: `COD-${id}`, description: '', semanticVersion: '1', nodeCount: 0,
});

/**
 * F2 · «Casos por aprobar» en la pantalla «Revisión» de la administración: la prueba de uso mostró que «Revisión» abría la
 * valoración de intentos y los casos enviados estaban escondidos en «Casos → Ver revisión». Una sola fuente para la cifra.
 */
// req: RN-07, RNF-04
describe('Casos por aprobar', () => {
  const usuario = signal<{ id: number; role: string } | null>({ id: 1, role: 'ADMIN' });
  const catalogo = { listAll: vi.fn() };

  beforeEach(() => {
    usuario.set({ id: 1, role: 'ADMIN' });
    catalogo.listAll.mockReset();
    TestBed.configureTestingModule({
      imports: [CasosPorAprobarComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: usuario, hasRole: (rol: string) => usuario()?.role === rol } },
        { provide: CaseCatalogApi, useValue: catalogo },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  const montar = async () => {
    const fixture = TestBed.createComponent(CasosPorAprobarComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('solo cuenta los casos enviados a revisión', () => {
    expect(casosPorAprobar([caso(1, 'DRAFT'), caso(2, 'IN_REVIEW'), caso(3, 'PUBLISHED'), caso(4, 'IN_REVIEW')]).map(c => c.caseVersionId)).toEqual([2, 4]);
  });

  it('arriba dice «Casos por aprobar (N)» y cada caso lleva su acción hacia su revisión', async () => {
    catalogo.listAll.mockReturnValue(of([caso(1, 'DRAFT'), caso(2, 'IN_REVIEW'), caso(3, 'IN_REVIEW')]));
    const raiz = await montar();
    expect(raiz.querySelector('h2')?.textContent).toContain('Casos por aprobar (2)');
    const acciones = Array.from(raiz.querySelectorAll<HTMLAnchorElement>('a'));
    expect(acciones.map(a => a.getAttribute('href'))).toEqual(['/portal/casos/2/editor/revision', '/portal/casos/3/editor/revision']);
    expect(acciones[0].textContent).toContain('Revisar y aprobar');
    expect(raiz.textContent).toContain('Caso 2');
  });

  it('sin casos por aprobar lo dice, con la cifra 0', async () => {
    catalogo.listAll.mockReturnValue(of([caso(1, 'DRAFT')]));
    const raiz = await montar();
    expect(raiz.querySelector('h2')?.textContent).toContain('Casos por aprobar (0)');
    expect(raiz.textContent).toContain('No hay casos esperando tu aprobación.');
  });

  it('la insignia de «Revisión» del menú dice la misma cifra que la pantalla', async () => {
    catalogo.listAll.mockReturnValue(of([caso(2, 'IN_REVIEW'), caso(3, 'IN_REVIEW'), caso(5, 'IN_REVIEW')]));
    const raiz = await montar();
    expect(raiz.querySelector('h2')?.textContent).toContain('(3)');
    expect(TestBed.inject(NavBadgesService).cuenta('trazabilidad')).toBe(3);
  });

  it('si la lista no carga lo dice con «Reintentar» y no deja una cifra en el menú', async () => {
    catalogo.listAll.mockReturnValueOnce(throwError(() => new Error('red'))).mockReturnValueOnce(of([caso(2, 'IN_REVIEW')]));
    const fixture = TestBed.createComponent(CasosPorAprobarComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('ui-error-state')).not.toBeNull();
    expect(TestBed.inject(NavBadgesService).cuenta('trazabilidad')).toBe(0);
    raiz.querySelector<HTMLButtonElement>('ui-error-state button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(catalogo.listAll).toHaveBeenCalledTimes(2);
    expect(raiz.querySelector('h2')?.textContent).toContain('Casos por aprobar (1)');
  });

  it('mientras carga no dice una cifra', async () => {
    catalogo.listAll.mockReturnValue(new Subject<SimulationCaseSummary[]>());
    const raiz = await montar();
    expect(raiz.querySelector('h2')?.textContent).toBe('Casos por aprobar');
    expect(raiz.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('para un docente no pinta nada ni pide nada: aprobar es solo de la administración', async () => {
    usuario.set({ id: 2, role: 'PROFESOR' });
    const raiz = await montar();
    expect(raiz.textContent?.trim()).toBe('');
    expect(catalogo.listAll).not.toHaveBeenCalled();
  });
});

describe('CasosPorAprobarService', () => {
  const usuario = signal<{ id: number; role: string } | null>({ id: 1, role: 'ADMIN' });
  beforeEach(() => {
    usuario.set({ id: 1, role: 'ADMIN' });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { currentUser: usuario, hasRole: (rol: string) => usuario()?.role === rol } },
        { provide: CaseCatalogApi, useValue: { listAll: () => of([]) } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('quien ya leyó todos los casos (el Inicio) deja la misma cifra, y una lectura fallida la quita', () => {
    const servicio = TestBed.inject(CasosPorAprobarService);
    const insignias = TestBed.inject(NavBadgesService);
    servicio.registrarDesde([caso(1, 'IN_REVIEW'), caso(2, 'DRAFT')]);
    expect(servicio.cuenta()).toBe(1);
    expect(insignias.cuenta('trazabilidad')).toBe(1);
    servicio.registrarDesde(null);
    expect(servicio.cuenta()).toBeNull();
    expect(insignias.cuenta('trazabilidad')).toBe(0);
  });

  it('para un docente no toca la insignia de «Revisión» (ahí cuenta intentos por valorar)', () => {
    usuario.set({ id: 2, role: 'PROFESOR' });
    const insignias = TestBed.inject(NavBadgesService);
    insignias.fijar('trazabilidad', 4);
    TestBed.inject(CasosPorAprobarService).registrarDesde([caso(1, 'IN_REVIEW')]);
    expect(insignias.cuenta('trazabilidad')).toBe(4);
  });
});
