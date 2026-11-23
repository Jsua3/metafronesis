import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, defer, forkJoin, map, of, timeout } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';

/** Ni el catálogo ni el historial pueden dejar a nadie esperando a la puerta: pasado esto, decide el servidor. */
export const CASE_UNLOCK_CHECK_MS = 3000;

/**
 * Abrir por dirección un caso bloqueado (plan visual F5-5): el estudiante vuelve al catálogo con `?bloqueado=<id>` y
 * el catálogo dice cuál y por qué. Solo informa: el desbloqueo lineal lo debe exigir el servidor (SIEP-RF-12,
 * estructural), así que si el catálogo falla, tarda o no conoce el caso, deja pasar y decide el servidor. Un intento
 * abierto en ese caso se puede continuar aunque haya quedado bloqueado (RN-07: continuar, pausar o terminar).
 * Docencia y administración ven todo abierto: no se mira.
 *
 * DISENO §4.4 (pieza 1): primero mira `CaseAccessCache` (lo que Inicio, Casos y la Ficha ya trajeron, con dueño de sesión
 * y 60 s de vida). Fresco, decide sin red y el umbral aparece en el acto; si no, pregunta como siempre y guarda lo que
 * llegue. Lo que guarda es solo lo que el servidor respondió de verdad: un respaldo por fallo o plazo no se guarda.
 */
export const caseUnlockedGuard: CanActivateFn = route => {
  if (!inject(AuthService).hasRole('ESTUDIANTE')) return true;
  const router = inject(Router);
  const simulation = inject(SimulationService);
  const cache = inject(CaseAccessCache);
  const caseVersionId = Number(route.paramMap.get('caseVersionId'));

  // `history` en null = no se sabe (falló o tardó): no se puede afirmar que no haya un intento abierto que continuar, así
  // que un caso bloqueado deja pasar y decide el servidor (Codex B4b, hallazgo 4). Nunca se cierra la puerta a ciegas.
  const decidir = (catalog: CatalogItem[] | null, history: StudentAttemptSummary[] | null): boolean | UrlTree => {
    const item = catalog?.find(entry => entry.caseVersionId === caseVersionId);
    if (!item || item.unlocked || history === null) return true;
    const open = history.some(attempt => attempt.caseVersionId === caseVersionId
      && (attempt.status === 'IN_PROGRESS' || attempt.status === 'PAUSED'));
    return open || router.createUrlTree(['/portal/simulador'], { queryParams: { bloqueado: caseVersionId } });
  };

  const fresco = cache.acceso();
  if (fresco) return decidir(fresco.catalogo, fresco.historial);

  return defer(() => {
    // El permiso para guardar se toma cuando la petición SALE: una respuesta que llega tras un cambio de cuenta se tira.
    const ticket = cache.ticket();
    return forkJoin({
      catalog: simulation.getCatalog().pipe(timeout(CASE_UNLOCK_CHECK_MS), catchError(() => of(null as CatalogItem[] | null))),
      history: simulation.attemptHistory().pipe(timeout(CASE_UNLOCK_CHECK_MS), catchError(() => of(null as StudentAttemptSummary[] | null))),
    }).pipe(map(({ catalog, history }) => {
      if (catalog && history) cache.guardarAcceso(ticket, { catalogo: catalog, historial: history });
      return decidir(catalog, history);
    }));
  });
};
