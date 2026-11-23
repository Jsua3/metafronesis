import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { CASE_UNLOCK_CHECK_MS, caseUnlockedGuard } from './case-unlocked.guard';

function item(caseVersionId: number, order: number, unlocked: boolean): CatalogItem {
  return { caseVersionId, code: `C${caseVersionId}`, title: `Caso ${caseVersionId}`, description: '', order, unlocked, completed: false, locked: !unlocked };
}

/**
 * Abrir por dirección un caso bloqueado (plan visual F5-5): el estudiante vuelve al catálogo con el motivo. Solo
 * informa: el servidor sigue siendo quien decide (SIEP-RF-12 es estructural), así que si el catálogo falla deja pasar.
 */
// req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H
describe('caseUnlockedGuard', () => {
  let getCatalog: ReturnType<typeof vi.fn>;
  /** La caché de acceso (DISENO §4.4): lo que devuelve `acceso()` y lo que se guardó. */
  let cache: { acceso: ReturnType<typeof vi.fn>; ticket: ReturnType<typeof vi.fn>; guardarAcceso: ReturnType<typeof vi.fn> };

  function setup(role: string, catalog: () => Observable<CatalogItem[]>, history: () => Observable<StudentAttemptSummary[]> = () => of([]),
    enCache: { catalogo: CatalogItem[]; historial: StudentAttemptSummary[]; en: number } | null = null) {
    getCatalog = vi.fn(catalog);
    cache = { acceso: vi.fn(() => enCache), ticket: vi.fn(() => ({ dueno: 1, epoca: 1 })), guardarAcceso: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: SimulationService, useValue: { getCatalog, attemptHistory: history } },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
        { provide: CaseAccessCache, useValue: cache },
      ],
    });
  }

  async function run(caseVersionId: string): Promise<boolean | UrlTree> {
    const route = { paramMap: convertToParamMap({ caseVersionId }) } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => caseUnlockedGuard(route, {} as RouterStateSnapshot));
    return isObservable(result) ? firstValueFrom(result as Observable<boolean | UrlTree>) : (result as boolean | UrlTree);
  }

  it('estudiante y caso bloqueado: vuelve al catálogo con ?bloqueado=<id>', async () => {
    setup('ESTUDIANTE', () => of([item(1, 1, true), item(2, 2, false)]));
    const result = await run('2');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/portal/simulador?bloqueado=2');
  });

  it('estudiante y caso abierto: pasa', async () => {
    setup('ESTUDIANTE', () => of([item(1, 1, true), item(2, 2, false)]));
    expect(await run('1')).toBe(true);
  });

  it('si el catálogo falla o el caso no está en él, pasa (decide el servidor)', async () => {
    setup('ESTUDIANTE', () => throwError(() => ({ status: 500 })));
    expect(await run('2')).toBe(true);
    TestBed.resetTestingModule();
    setup('ESTUDIANTE', () => of([item(1, 1, true)]));
    expect(await run('7')).toBe(true);
  });

  it('un intento abierto en un caso que quedó bloqueado se puede continuar (RN-07)', async () => {
    setup('ESTUDIANTE', () => of([item(1, 1, true), item(2, 2, false)]),
      () => of([{ attemptId: 'p', caseVersionId: 2, status: 'PAUSED' } as StudentAttemptSummary]));
    expect(await run('2')).toBe(true);
  });

  it('caso bloqueado con el historial caído: no afirma que no haya intento abierto, deja pasar y decide el servidor', async () => {
    setup('ESTUDIANTE', () => of([item(1, 1, true), item(2, 2, false)]), () => throwError(() => ({ status: 500 })));
    expect(await run('2')).toBe(true);
  });

  it('si el catálogo no responde, a los pocos segundos deja pasar (nadie se queda esperando a la puerta)', async () => {
    vi.useFakeTimers();
    setup('ESTUDIANTE', () => NEVER, () => NEVER);
    const pending = run('2');
    await vi.advanceTimersByTimeAsync(CASE_UNLOCK_CHECK_MS + 10);
    expect(await pending).toBe(true);
    vi.useRealTimers();
  });

  it('con el acceso fresco en la caché decide sin red (el umbral aparece en el acto)', async () => {
    const historial = [] as StudentAttemptSummary[];
    setup('ESTUDIANTE', () => NEVER, () => NEVER, { catalogo: [item(1, 1, true), item(2, 2, false)], historial, en: Date.now() });
    const libre = TestBed.runInInjectionContext(() => caseUnlockedGuard(
      { paramMap: convertToParamMap({ caseVersionId: '1' }) } as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(libre).toBe(true);   // síncrono: ni un observable que esperar
    expect(TestBed.inject(Router).serializeUrl(await run('2') as UrlTree)).toBe('/portal/simulador?bloqueado=2');
    expect(getCatalog).not.toHaveBeenCalled();
  });

  it('sin caché pregunta y guarda lo que el servidor respondió, con el permiso tomado al salir', async () => {
    const catalogo = [item(1, 1, true)];
    setup('ESTUDIANTE', () => of(catalogo), () => of([]));
    expect(await run('1')).toBe(true);
    expect(cache.guardarAcceso).toHaveBeenCalledWith({ dueno: 1, epoca: 1 }, { catalogo, historial: [] });
  });

  // Control negativo: guardar el respaldo de un fallo diría «sin intentos abiertos» durante 60 s, sin que nadie lo sepa.
  it('un catálogo o un historial que falla no se guarda en la caché', async () => {
    setup('ESTUDIANTE', () => throwError(() => ({ status: 500 })), () => of([]));
    expect(await run('1')).toBe(true);
    expect(cache.guardarAcceso).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    setup('ESTUDIANTE', () => of([item(1, 1, true)]), () => throwError(() => ({ status: 500 })));
    expect(await run('1')).toBe(true);
    expect(cache.guardarAcceso).not.toHaveBeenCalled();
  });

  it('docencia y administración no se miran (ven todo abierto) y no piden el catálogo', async () => {
    setup('ADMIN', () => of([item(2, 2, false)]));
    expect(await run('2')).toBe(true);
    expect(getCatalog).not.toHaveBeenCalled();
  });
});
