import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { CaseCatalogApi } from '../../../core/api/case-catalog.api';
import { AuthService } from '../../../core/auth/auth.service';
import { SimulationCaseSummary } from '../../../core/models/simulation.model';
import { NavBadgesService } from '../../../shared/layout/nav-badges.service';

/** Los casos que esperan la decisión de la administración: las versiones enviadas a revisión de Psicología. */
export function casosPorAprobar(todos: readonly SimulationCaseSummary[]): SimulationCaseSummary[] {
  return todos.filter(caso => caso.status === 'IN_REVIEW');
}

/**
 * LA fuente de «Casos por aprobar» (administración; `case.publish` es solo del ADMIN en la matriz de políticas): la cifra
 * de la insignia de «Revisión» en el menú, el título de la sección de la pantalla «Revisión» y el aviso del Inicio salen
 * de aquí, y por eso nunca dicen números distintos. Quien ya leyó la lista completa de casos (el Inicio) la entrega con
 * `registrarDesde`; quien no, la pide con `cargar`. Una lectura que falla no deja cifra (`null`): una cifra vieja o a
 * medias parecería exacta.
 */
@Injectable({ providedIn: 'root' })
export class CasosPorAprobarService {
  private readonly catalogo = inject(CaseCatalogApi);
  private readonly badges = inject(NavBadgesService);
  private readonly auth = inject(AuthService);

  /** Los casos por aprobar, o `null` mientras no se hayan podido leer. */
  readonly casos = signal<SimulationCaseSummary[] | null>(null);
  readonly cuenta = computed(() => this.casos()?.length ?? null);

  /** Pide la lista, deja la cifra en el menú y entrega los casos por aprobar. */
  cargar(): Observable<SimulationCaseSummary[]> {
    return this.catalogo.listAll().pipe(
      map(casosPorAprobar),
      tap({ next: lista => this.registrar(lista), error: () => this.registrar(null) }),
    );
  }

  /** Para quien ya leyó todos los casos: `null` si no se pudieron leer. */
  registrarDesde(todos: readonly SimulationCaseSummary[] | null): void {
    this.registrar(todos ? casosPorAprobar(todos) : null);
  }

  private registrar(lista: SimulationCaseSummary[] | null): void {
    this.casos.set(lista);
    // Solo la administración aprueba: para el docente, «Revisión» cuenta intentos por valorar (otro dato, otra fuente).
    if (this.auth.hasRole('ADMIN')) this.badges.fijar('trazabilidad', lista?.length ?? 0);
  }
}
