import { Signal, computed } from '@angular/core';

import { LoadingPhaseOptions, loadingPhase } from '../skeleton/loading-phase';
import { UiErrorKind } from './state-copy';

export type UiDataStateValue = 'pending' | 'loading' | 'error' | 'empty' | 'ready';

export interface UiDataStateSource {
  loading: Signal<boolean>;
  /** Cualquier valor verdadero es un error (un HttpErrorResponse, un mensaje…). */
  error: Signal<unknown>;
  isEmpty: Signal<boolean>;
}

/**
 * Estado ÚNICO de un bloque de datos (plan visual §2.5, F2-5) con la regla de tiempos del esqueleto integrada
 * (`loadingPhase`, revisión de F2): `pending` mientras la respuesta pueda ser rápida (< 150 ms: se sigue viendo lo
 * que había, sin vacío ni esqueleto), `loading` pasado el umbral y al menos 300 ms, y luego `error` → `empty` →
 * `ready`, en ese orden. El vacío y el error nunca coexisten; mientras se reintenta (carga con el error anterior aún
 * puesto) se ve la carga. Llamar en un contexto de inyección.
 */
export function uiDataState(source: UiDataStateSource, options: LoadingPhaseOptions = {}): Signal<UiDataStateValue> {
  const phase = loadingPhase(source.loading, options);
  return computed(() => {
    const current = phase();
    if (current === 'skeleton') return 'loading';
    if (current === 'pending') return 'pending';
    if (source.error()) return 'error';
    return source.isEmpty() ? 'empty' : 'ready';
  });
}

/** Clase de error que se muestra según el código HTTP (0 = sin respuesta del servidor). */
export function errorKindFromStatus(status: number | null | undefined): UiErrorKind {
  if (status === 0) return 'network';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'server';
}
