import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';

import { UI_ROUTE_PROGRESS_DELAY_MS, UiRouteProgress } from './ui-route-progress';

/**
 * ui-route-progress (plan visual §2.5, F2-4): la línea de 2 px del cambio de ruta aparece solo si la navegación
 * tarda más de 120 ms y se va al terminar, cancelarse o fallar.
 */
describe('ui-route-progress', () => {
  let events: Subject<RouterEvent>;
  let fixture: ComponentFixture<UiRouteProgress>;
  const active = () => (fixture.nativeElement as HTMLElement).classList.contains('ui-route-progress--active');
  const flush = () => fixture.detectChanges();

  beforeEach(() => {
    vi.useFakeTimers();
    events = new Subject<RouterEvent>();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Router, useValue: { events } }],
    });
    fixture = TestBed.createComponent(UiRouteProgress);
    flush();
  });

  afterEach(() => vi.useRealTimers());

  it('es decorativa para el lector (el cambio de página se anuncia con el título)', () => {
    expect((fixture.nativeElement as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });

  it('una navegación rápida (< 120 ms) no la muestra', () => {
    events.next(new NavigationStart(1, '/portal'));
    vi.advanceTimersByTime(UI_ROUTE_PROGRESS_DELAY_MS - 1);
    flush();
    expect(active()).toBe(false);
    events.next(new NavigationEnd(1, '/portal', '/portal'));
    vi.advanceTimersByTime(500);
    flush();
    expect(active()).toBe(false);
  });

  it('una navegación lenta la muestra a los 120 ms y la quita al terminar', () => {
    events.next(new NavigationStart(1, '/portal'));
    vi.advanceTimersByTime(UI_ROUTE_PROGRESS_DELAY_MS);
    flush();
    expect(active()).toBe(true);
    events.next(new NavigationEnd(1, '/portal', '/portal'));
    flush();
    expect(active()).toBe(false);
  });

  it('también se va si la navegación se cancela o falla', () => {
    for (const end of [new NavigationCancel(1, '/x', 'guard'), new NavigationError(2, '/y', new Error('500'))]) {
      events.next(new NavigationStart(1, '/x'));
      vi.advanceTimersByTime(UI_ROUTE_PROGRESS_DELAY_MS);
      flush();
      expect(active()).toBe(true);
      events.next(end);
      flush();
      expect(active()).toBe(false);
    }
  });
});
