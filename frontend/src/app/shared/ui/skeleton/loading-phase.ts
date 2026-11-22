import { DestroyRef, Signal, effect, inject, signal, untracked } from '@angular/core';

export type LoadingPhase = 'pending' | 'skeleton' | 'ready';

export interface LoadingPhaseOptions {
  /** Umbral antes de mostrar el esqueleto (ms). */
  delayMs?: number;
  /** Permanencia mínima del esqueleto una vez visible (ms). */
  minMs?: number;
}

/**
 * Fase visible de una carga (plan visual §2.5, F2-4): `pending` mientras no se sabe si la respuesta será rápida (no
 * se pinta nada especial), `skeleton` si pasa del umbral (150 ms) y se mantiene al menos 300 ms aunque los datos
 * lleguen antes, y `ready` al terminar. Así una respuesta rápida no parpadea y una lenta no destella el esqueleto.
 * Llamar en un contexto de inyección (constructor o campo de un componente).
 */
export function loadingPhase(loading: Signal<boolean>, options: LoadingPhaseOptions = {}): Signal<LoadingPhase> {
  const delayMs = options.delayMs ?? 150;
  const minMs = options.minMs ?? 300;
  const phase = signal<LoadingPhase>(untracked(loading) ? 'pending' : 'ready');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = 0;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  effect(() => {
    const isLoading = loading();
    untracked(() => {
      const current = phase();
      if (isLoading) {
        clear();
        if (current === 'skeleton') return;
        phase.set('pending');
        timer = setTimeout(() => {
          timer = undefined;
          shownAt = Date.now();
          phase.set('skeleton');
        }, delayMs);
        return;
      }
      clear();
      if (current !== 'skeleton') {
        phase.set('ready');
        return;
      }
      const remaining = minMs - (Date.now() - shownAt);
      if (remaining <= 0) {
        phase.set('ready');
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        phase.set('ready');
      }, remaining);
    });
  });
  inject(DestroyRef).onDestroy(clear);
  return phase.asReadonly();
}
