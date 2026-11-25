import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
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
    /** La lista completa de invitaciones (si se pasa, manda sobre `invitadas`). */
    invitaciones?: Invitation[];
    escena?: string | null;
    sinNombre?: boolean;
  }

  async function render({ historial = [intento()], catalogo = [caso(1)], invitadas = 1, invitaciones, escena = 'La sala de espera', sinNombre = false }: Opciones = {}) {
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
        { provide: InvitationsApi, useValue: { list: () => of(invitaciones ?? Array.from({ length: invitadas }, () => ({ status: 'INVITED' }))) } },
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
    const empezar = host.querySelector('.sd-protagonista a.ui-button--primary')!;
    expect(empezar.textContent).toContain('Empezar');
    expect(empezar.getAttribute('aria-label')).toBe('Empezar «Caso 1»');
    expect(empezar.getAttribute('href')).toBe('/portal/simulador/1/ficha');
    expect(host.textContent).toContain('Sin empezar · 8 escenas');
    // La tarjeta ya dice «Empezar»: «Lo siguiente» no la repite.
    expect(host.querySelector('.sd-siguiente')).toBeNull();
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

  it('con todo terminado no hay primaria: solo «Ver mi resultado» como acción secundaria, y los cierres', async () => {
    const { host } = await render({
      catalogo: [caso(1, { completed: true })],
      historial: [intento({ status: 'COMPLETED', attemptId: 'fin' })],
      invitadas: 0,
    });
    expect(host.querySelector('.sd-siguiente__frase')?.textContent).toContain('Terminaste los casos asignados.');
    expect(host.querySelector('.sd-protagonista a')?.textContent).toContain('Ver mi resultado');
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

  it('sin casos y con invitaciones esperando: el vacío las nombra y la acción lleva a Grupos', async () => {
    const { host } = await render({ historial: [], catalogo: [], invitadas: 2 });
    expect(host.querySelector('app-sin-casos-estudiante ui-vacio-ilustrado')?.getAttribute('data-motivo')).toBe('invitacion-pendiente');
    expect(host.textContent).toContain('Tienes 2 invitaciones esperando');
    expect(host.textContent).toContain('Tienes 2 invitaciones a grupos');
    expect(host.querySelector('app-sin-casos-estudiante a')?.getAttribute('href')).toBe('/portal/invitaciones');
  });

  describe('«Lo siguiente»: una frase que dice qué hacer ahora', () => {
    const grupo = (extra: Partial<Invitation> = {}): Invitation => ({
      id: 1, groupId: 1, groupName: 'Grupo A', teacherName: 'Paula Ríos', invitedAt: null, status: 'ACTIVE', casesCount: 0, ...extra,
    });
    const frase = (host: HTMLElement) => host.querySelector('.sd-siguiente__frase')?.textContent?.trim();

    it('con un intento a medias: continuar, con la escena donde se retoma', async () => {
      const { host } = await render({ invitaciones: [] });
      // La tarjeta del caso ya dice «Continuar» y dónde se retoma: la frase no se repite arriba.
      expect(host.querySelector('.sd-siguiente')).toBeNull();
      expect(host.textContent).toContain('La sala de espera');
    });

    it('con una invitación pendiente y nada que jugar: aceptarla; la invitación sigue arriba con su botón', async () => {
      const { host } = await render({ historial: [], catalogo: [], invitaciones: [grupo({ status: 'INVITED', casesCount: null })] });
      expect(frase(host)).toBe('Acepta la invitación de tu docente para ver los casos de tu grupo.');
      expect(host.querySelector('.sd-invitacion a')?.getAttribute('href')).toBe('/portal/invitaciones');
    });

    it('un caso listo gana a una invitación pendiente, pero la invitación no se esconde', async () => {
      const { host } = await render({ historial: [], invitaciones: [grupo({ status: 'INVITED', casesCount: null })] });
      expect(host.querySelector('.sd-siguiente')).toBeNull();
      expect(host.querySelector('.sd-protagonista')?.textContent).toContain('Caso 1');
      expect(host.querySelector('.sd-invitacion')).not.toBeNull();
    });

    it('sin grupo: dice que primero hace falta un grupo', async () => {
      const { host } = await render({ historial: [], catalogo: [], invitaciones: [] });
      expect(frase(host)).toBe('Todavía no tienes casos: primero necesitas estar en un grupo de tu docente.');
      expect(host.querySelector('app-sin-casos-estudiante ui-vacio-ilustrado')?.getAttribute('data-motivo')).toBe('sin-grupo');
    });

    it('en un grupo sin casos: lo dice y no culpa a la persona', async () => {
      const { host } = await render({ historial: [], catalogo: [], invitaciones: [grupo()] });
      expect(frase(host)).toBe('Todavía no tienes casos: tu docente aún no los asigna a tu grupo.');
      expect(host.textContent).toContain('«Grupo A» aún no tiene casos asignados');
    });

    it('con un caso que todavía no abre: nada pendiente, sin inventar una fecha', async () => {
      const { host } = await render({
        historial: [], invitaciones: [],
        catalogo: [caso(1, { unlocked: false, locked: true, access: { allowed: false, reason: 'NOT_YET_OPEN' } })],
      });
      expect(frase(host)).toContain('Por ahora no tienes nada pendiente: «Caso 1» todavía no está disponible.');
      expect(host.querySelector('.sd-protagonista a.ui-button--primary')).toBeNull();
    });

    it('mientras carga o si falla no se afirma nada', async () => {
      const { host } = await render({ historial: null });
      expect(host.querySelector('.sd-siguiente')).toBeNull();
    });
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
