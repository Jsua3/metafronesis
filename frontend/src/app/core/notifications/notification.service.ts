import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationMessage {
  id: number;
  type: NotificationType;
  text: string;
}

/** Máximo de avisos visibles a la vez; al superarlo se descarta el más antiguo. */
export const MAX_NOTIFICATIONS = 4;

/** Duración por tipo. Los errores (0) esperan a que el usuario los cierre (WCAG 2.2.1). */
const AUTO_CLOSE_MS: Record<NotificationType, number> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: 0,
};

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();
  private readonly messagesSubject = new BehaviorSubject<NotificationMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  /** Un aviso igual (mismo tipo y mismo texto) ya visible absorbe al nuevo: con el servidor caído
   *  varias peticiones en paralelo fallan con el mismo error y no deben apilar tarjetas idénticas
   *  que no se van solas. Un aviso cerrado deja de contar. Devuelve el id del aviso (el del que ya estaba, si es
   *  un repetido) para que quien lo emitió pueda retirarlo cuando deja de valer; `autoCloseMs` en 0 lo deja hasta
   *  que se cierre. */
  show(type: NotificationType, text: string, autoCloseMs = AUTO_CLOSE_MS[type]): number {
    const existing = this.messagesSubject.value.find(visible => visible.type === type && visible.text === text);
    if (existing) return existing.id;
    const message: NotificationMessage = { id: this.nextId++, type, text };
    const next = [...this.messagesSubject.value, message];
    while (next.length > MAX_NOTIFICATIONS) {
      const dropped = next.shift()!;
      this.clearTimer(dropped.id);
    }
    this.messagesSubject.next(next);

    if (autoCloseMs > 0) {
      this.timers.set(message.id, { handle: null, remaining: autoCloseMs, startedAt: 0 });
      this.resume(message.id);
    }
    return message.id;
  }

  success(text: string): void {
    this.show('success', text);
  }

  error(text: string): void {
    this.show('error', text);
  }

  warning(text: string): void {
    this.show('warning', text);
  }

  info(text: string): void {
    this.show('info', text);
  }

  /** Detiene el cierre automático (cursor o foco sobre el aviso). */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }

  /** Retoma el cierre automático con el tiempo que quedaba. */
  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.messagesSubject.next(this.messagesSubject.value.filter(message => message.id !== id));
  }

  /** Retira los avisos visibles de ese tipo y texto (p. ej. el de conexión cuando vuelve la red). Sin coincidencias no hace nada. */
  dismissMatching(type: NotificationType, text: string): void {
    for (const message of this.messagesSubject.value) {
      if (message.type === type && message.text === text) this.dismiss(message.id);
    }
  }

  clear(): void {
    for (const id of this.timers.keys()) this.clearTimer(id);
    this.messagesSubject.next([]);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    this.timers.delete(id);
  }
}
