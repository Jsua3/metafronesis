import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SimulationCaseSummary } from '../models/simulation.model';
import { CaseListCache } from './case-list-cache';
import { SimulationService } from './simulation.service';

/**
 * Proxy de caché (patrón Proxy, GoF) de `SimulationService`: es un `SimulationService` más, así que
 * los componentes no cambian, pero `listCases` pasa primero por `CaseListCache`. Todo lo demás se
 * delega sin tocar en el servicio real. El backend arma esta lista con una consulta por caso y
 * varios componentes la piden al navegar (catálogo, dashboard, grupos, reportes, rúbricas).
 *
 * La clave incluye al usuario y su rol, porque la lista depende de ellos: un estudiante solo ve
 * los casos que le asignaron.
 */
@Injectable({ providedIn: 'root' })
export class CachedSimulationService extends SimulationService {
  private readonly auth = inject(AuthService);
  private readonly caseList = inject(CaseListCache);

  override listCases(): Observable<SimulationCaseSummary[]> {
    const user = this.auth.currentUser();
    const key = user ? `${user.id}:${user.role}` : 'sin-sesion';
    return this.caseList.get(key, () => super.listCases());
  }
}
