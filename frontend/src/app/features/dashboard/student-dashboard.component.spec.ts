import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { InvitationsApi } from '../../core/api/invitations.api';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { StudentDashboardComponent } from './student-dashboard.component';

const caso = (id: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  caseVersionId: id, code: `C${id}`, title: `Caso ${id}`, description: '', order: id, unlocked: true, completed: false, locked: false, escenas: 8, ...extra,
});
const intento = (extra: Partial<StudentAttemptSummary> = {}): StudentAttemptSummary => ({
  attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso 1', status: 'PAUSED', totalDurationSeconds: null, activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null, ...extra,
});

describe('Inicio del estudiante', () => {
  interface Opciones {
    historial?: StudentAttemptSummary[] | null;
    catalogo?: CatalogItem[];
    invitadas?: number;
    escena?: string | null;
    sinNombre?: boolean;
  }

  async function render({ historial = [intento()], catalogo = [caso(1)], invitadas = 1, escena = 'La sala de espera', sinNombre = false }: Opciones = {}) {
    const fijar = vi.fn();
    const getActiveAttempt = vi.fn(() => of(escena ? { currentNode: { title: escena } } : null));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 1, nombre: sinNombre ? '' : 'Ana Pérez' }) } },
        { provide: NavBadgesService, useValue: { fijar } },
        {
          provide: CaseAccessCache,
          useValue: { acceso: () => null, guardandoAcceso: () => (fuente: unknown) => fuente, intentoAbierto: () => undefined, guardandoIntentoAbierto: () => (fuente: unknown) => fuente },
        },
        { provide: SimulationService, useValue: { getCatalog: () => of(catalogo), attemptHistory: () => (historial === null ? throwError(() => ({})) : of(historial)), getActiveAttempt } },
        { provide: InvitationsApi, useValue: { list: () => of(Array.from({ length: invitadas }, () => ({ status: 'INVITED' }))) } },
      ],
    });
    const fixture = TestBed.createComponent(StudentDashboardComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, fijar, getActiveAttempt };
  }

  it('con un intento en pausa hay UNA sola primaria, dice dónde se retoma y no hay tarjetas de cifras', async () => {
    const { host, fijar, getActiveAttempt } = await render();
    expect(host.querySelector('h1')?.textContent).toContain('Hola, Ana');
    const primarias = Array.from(host.querySelectorAll('.ui-button--primary'));
    expect(primarias).toHaveLength(1);
    expect(primarias[0].textContent).toContain('Continuar');
    expect(host.textContent).toContain('En pausa');
    expect(host.textContent).toContain('Retomas en La sala de espera.');
    expect(getActiveAttempt).toHaveBeenCalledWith(1);
    expect(host.querySelector('ui-stat')).toBeNull();
    expect(host.textContent).not.toContain('Tiempo activo');
    expect(host.textContent).not.toContain('Intentos completados');
    expect(fijar).toHaveBeenCalledWith('invitaciones', 1);
  });

  it('expresa el número exacto de intentos completados sin convertirlo en puntaje', async () => {
    const { host } = await render({ historial: [intento(), intento({ attemptId: 'b', status: 'COMPLETED' }), intento({ attemptId: 'c', status: 'SAFE_EXITED' })] });
    expect(host.textContent).toContain('1 de 3 intentos completados');
    expect(host.textContent).not.toMatch(/puntaje|puntos|%/i);
  });

  it('si la escena no se conoce, la línea es genérica y nunca dice «null»', async () => {
    const { host } = await render({ escena: null });
    expect(host.textContent).toContain('Retomas donde lo dejaste.');
    expect(host.textContent).not.toContain('null');
  });

  it('sin intentos ofrece la ficha del primer caso desbloqueado, con el número de escenas', async () => {
    const { host } = await render({ historial: [], invitadas: 0 });
    expect(host.textContent).toContain('Ver ficha del caso');
    expect(host.textContent).toContain('Sin empezar · 8 escenas');
    expect(host.textContent).toContain('Tu siguiente caso está listo.');
    expect(host.querySelector('.sd-invitacion')).toBeNull();
  });

  it('el caso del siguiente paso no se repite en la lista; el resto dice su estado en palabras', async () => {
    const { host } = await render({
      catalogo: [caso(1), caso(2, { unlocked: false, locked: true })],
      historial: [],
      invitadas: 0,
    });
    const filas = host.querySelectorAll('.sd-fila');
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain('Caso 2');
    expect(filas[0].textContent).toContain('Bloqueado');
    expect(filas[0].textContent).toContain('Se abre al terminar «Caso 1»');
    // Un caso bloqueado no es un enlace.
    expect(filas[0].tagName).not.toBe('A');
  });

  it('con todo terminado no hay primaria: solo «Ver tu recorrido» como acción secundaria, y los cierres', async () => {
    const { host } = await render({
      catalogo: [caso(1, { completed: true })],
      historial: [intento({ status: 'COMPLETED', attemptId: 'fin' })],
      invitadas: 0,
    });
    expect(host.textContent).toContain('Terminaste los casos asignados.');
    expect(host.querySelector('.ui-button--primary')).toBeNull();
    expect(host.querySelector('a[href="/portal/simulador/1/cierre/fin"]')).not.toBeNull();
    expect(host.textContent).toContain('Tus cierres');
    // La fila del cierre entera es el enlace (blanco grande), no un botón chico al costado.
    expect(host.querySelector('a.sd-fila--cierre')?.getAttribute('href')).toBe('/portal/simulador/1/cierre/fin');
  });

  it('en un teléfono estrecho la portada del siguiente paso va en tamaño tarjeta, para que la puerta no se corte', async () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: true, media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined }));
    try {
      const { host } = await render({});
      const portada = host.querySelector('.sd-protagonista ui-portada-caso');
      expect(portada?.classList).toContain('ui-portada-caso--tarjeta');
      expect(portada?.classList).toContain('sd-protagonista__portada--compacta');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sin casos asignados muestra el vacío y, con invitaciones, la acción para verlas', async () => {
    const { host } = await render({ historial: [], catalogo: [], invitadas: 2 });
    expect(host.textContent).toContain('Aún no tienes casos asignados');
    expect(host.textContent).toContain('Tienes 2 invitaciones a grupos');
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (host.querySelector('ui-empty-state button') as HTMLButtonElement).click();
    expect(navegar).toHaveBeenCalledWith(['/portal/invitaciones']);
  });

  it('sin nombre en la sesión el título no inventa uno', async () => {
    const { host } = await render({ sinNombre: true });
    expect(host.querySelector('h1')?.textContent).toContain('Tu entrenamiento');
  });

  it('muestra el error con «Reintentar» si no puede conocer el acceso', async () => {
    const { host } = await render({ historial: null });
    expect(host.querySelector('ui-error-state')).not.toBeNull();
  });
});
