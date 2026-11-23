import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { SimulationCaseSummary } from '../models/simulation.model';

/**
 * Vigencia de la lista de casos publicados. Corta a propósito: a un estudiante se le pueden
 * asignar casos en cualquier momento y la lista se rehace sola pasado este plazo (o al volver
 * a entrar a la sesión, porque la clave incluye al usuario).
 */
export const CASE_LIST_TTL_MS = 30_000;

interface Entry {
  key: string;
  createdAt: number;
  source: Observable<SimulationCaseSummary[]>;
}

/**
 * Memoria de la última lista de casos publicados, para el proxy de caché (`CachedSimulationService`).
 * Guarda una sola entrada: la del usuario actual. Comparte la petición en curso entre quienes
 * la piden a la vez, no guarda errores y entrega a cada quien su propia copia de la lista.
 */
@Injectable({ providedIn: 'root' })
export class CaseListCache {
  private entry: Entry | null = null;

  /** Devuelve la lista guardada si es del mismo usuario y sigue vigente; si no, la pide con `load`. */
  get(key: string, load: () => Observable<SimulationCaseSummary[]>): Observable<SimulationCaseSummary[]> {
    const current = this.entry;
    if (current && current.key === key && Date.now() - current.createdAt < CASE_LIST_TTL_MS) {
      return current.source.pipe(map(copyOf));
    }
    // shareReplay reinicia solo si la petición falla (resetOnError por defecto): un error no queda guardado.
    const source = load().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.entry = { key, createdAt: Date.now(), source };
    return source.pipe(map(copyOf));
  }

  /** Olvida la lista guardada: la próxima petición vuelve al backend. */
  invalidate(): void {
    this.entry = null;
  }
}

const copyOf = (cases: SimulationCaseSummary[]): SimulationCaseSummary[] => cases.map(c => ({ ...c }));
