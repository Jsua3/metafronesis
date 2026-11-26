import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { InstructorApi } from '../../core/api/instructor.api';
import { AuthService } from '../../core/auth/auth.service';
import { AttemptTrace, RecentAttempt } from '../../core/models/revision.model';
import { InstructorTraceComponent } from './instructor-trace.component';

/**
 * F7-1: «Ver detalle» del panel docente abre la traza en el intento elegido (`?intento=<id>`), no en el más
 * reciente. Sin el parámetro, o con un id que no está en la lista, la traza abre el más reciente como siempre.
 */
const attempt = (attemptId: string): RecentAttempt => ({
  attemptId, studentAlias: `Alias ${attemptId}`, caseTitle: `Caso ${attemptId}`, status: 'COMPLETED',
  startedAt: '2026-10-10T10:00:00Z',
});

function openTrace(intento: string | null, filtro: Record<string, string> = {}) {
  const attemptTrace = vi.fn((id: string) => of({ attemptId: id } as unknown as AttemptTrace));
  const recentAttempts = vi.fn(() => of([attempt('a-1'), attempt('a-2'), attempt('a-3')]));
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { currentUser: () => ({ role: 'PROFESOR' }) } },
      {
        provide: InstructorApi,
        useValue: {
          recentAttempts,
          attemptTrace,
          rubric: () => of({} as never),
        },
      },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ ...filtro, ...(intento ? { intento } : {}) }) } } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new InstructorTraceComponent());
  component.ngOnInit();
  return { component, attemptTrace, recentAttempts };
}

describe('traza del docente: intento elegido desde el panel (F7-1)', () => {
  it('solicita al servidor solo los intentos del grupo y caso enlazados', () => {
    const { recentAttempts } = openTrace(null, { grupo: '3', caseVersionId: '12' });
    expect(recentAttempts).toHaveBeenCalledWith({ groupId: 3, caseVersionId: 12 });
  });
  // req: RQ-NEG-006
  it('con ?intento=<id> abre ese intento y no el más reciente', () => {
    const { component, attemptTrace } = openTrace('a-2');

    expect(component.selectedAttemptId()).toBe('a-2');
    expect(attemptTrace).toHaveBeenCalledTimes(1);
    expect(attemptTrace).toHaveBeenCalledWith('a-2');
  });

  // req: RQ-NEG-006
  it('sin el parámetro abre el más reciente (el primero de la lista)', () => {
    const { component, attemptTrace } = openTrace(null);

    expect(component.selectedAttemptId()).toBe('a-1');
    expect(attemptTrace).toHaveBeenCalledWith('a-1');
  });

  // req: RQ-NEG-006
  it('con un id fuera de la lista (p. ej. de un caso republicado) pide ESE intento y no abre el de otra persona', () => {
    const { component, attemptTrace } = openTrace('a-fuera-de-la-lista');

    expect(component.selectedAttemptId()).toBe('a-fuera-de-la-lista');
    expect(attemptTrace).toHaveBeenCalledTimes(1);
    expect(attemptTrace).toHaveBeenCalledWith('a-fuera-de-la-lista');
  });
});
