import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { AdminAuditService } from '../../core/api/admin-audit.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { GrupoService } from '../../core/api/grupo.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { ReporteService } from '../../core/api/reporte.service';
import { UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { StaffDashboardComponent } from './staff-dashboard.component';

const caso = { caseVersionId: 7, title: 'Caso de prueba', status: 'IN_REVIEW' };
// Publicado: nombra las asignaciones que el docente no autoró (el 9 no está entre sus casos en edición).
const publicado = { caseVersionId: 9, title: 'Violencia en el aula', status: 'PUBLISHED' };
const pagina = { items: [{ attemptId: 'a1', studentAlias: 'Estudiante-123', caseTitle: 'Caso de prueba', endedAt: '2026-11-20T12:00:00Z' }], coverage: { shown: 1, total: 12 } };

describe('Inicio docente y administración', () => {
  let role: string;
  let todas: unknown[];
  let instructor: { listAttempts: ReturnType<typeof vi.fn> };
  let groups: { listar: ReturnType<typeof vi.fn> };
  let casos: { listAll: ReturnType<typeof vi.fn> };
  let audit: { list: ReturnType<typeof vi.fn> };
  let users: { list: ReturnType<typeof vi.fn> };
  let requests: { listPending: ReturnType<typeof vi.fn>; updateStatus: ReturnType<typeof vi.fn> };
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let badges: { fijar: ReturnType<typeof vi.fn>; fijarUsuarios: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    role = 'PROFESOR';
    todas = [{ id: 2, active: true, caseVersionId: 7 }, { id: 3, active: true, caseVersionId: 9 }];
    instructor = { listAttempts: vi.fn(() => of(pagina)) };
    groups = { listar: vi.fn(() => of([{ id: 1, nombre: 'Grupo A', totalEstudiantes: 3 }])) };
    casos = { listAll: vi.fn(() => of([caso, publicado])) };
    audit = { list: vi.fn(() => of({ items: [{ id: 1, actorId: 3, action: 'AUDIT_VIEWED', occurredAt: '2026-11-20T12:00:00-05:00' }], page: 1, pageSize: 50, coverage: { shown: 1, total: 1 } })) };
    users = { list: vi.fn(() => of([{ role: 'ESTUDIANTE', activo: true, pendingApproval: true }])) };
    requests = { listPending: vi.fn(() => of([{ id: 1, nombre: 'Ana', apellido: 'Ríos', email: 'ana@example.test', createdAt: '2026-11-20' }])), updateStatus: vi.fn(() => of({})) };
    notify = { success: vi.fn(), error: vi.fn() };
    badges = { fijar: vi.fn(), fijarUsuarios: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: AuthService, useValue: { currentUser: signal({ nombre: 'María' }), hasRole: (r: string) => role === r } },
      { provide: InstructorApi, useValue: instructor }, { provide: GrupoService, useValue: groups },
      { provide: ReporteService, useValue: { getReporteGrupo: () => of({ simulacion: { estudiantes: [{ intentosCompletados: 2 }, { intentosCompletados: 0 }] } }) } },
      { provide: CaseCatalogApi, useValue: casos }, { provide: AdminAuditService, useValue: audit }, { provide: UserAdminService, useValue: users },
      { provide: AccessRequestAdminService, useValue: requests }, { provide: NotificationService, useValue: notify }, { provide: NavBadgesService, useValue: badges },
      { provide: AssignmentService, useValue: { list: () => of([{ id: 2, active: true, caseVersionId: 7 }, { id: 3, active: true, caseVersionId: 9 }]), listAll: () => of(todas) } },
    ] });
  });
  it('muestra el resumen y pone Ver grupo antes de las acciones secundarias', () => {
    groups.listar.mockReturnValue(of([{ id: 1, nombre: 'Grupo A', totalEstudiantes: 3, totalInvitados: 2, resumenCasos: { asignados: 2, terminados: 1, oportunidades: 6 } }]));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.rejilla article') as HTMLElement;
    expect(card.textContent).toContain('2 invitaciones pendientes');
    expect(card.textContent).toContain('1 de 6 casos terminados');
    expect(card.querySelector('a')?.textContent).toContain('Ver grupo');
  });
  it('pide la bandeja filtrada y publica el total, no el tamaño de la página', () => {
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(instructor.listAttempts).toHaveBeenCalledWith({ evaluacion: 'pendiente', pageSize: 5 });
    expect(badges.fijar).toHaveBeenCalledWith('trazabilidad', 12);
    expect(fixture.componentInstance.grupos()[0].asignaciones).toHaveLength(2);
    expect(fixture.componentInstance.grupos()[0].avances[2]).toBe(1);
    expect(fixture.componentInstance.totalRevision()).toBe(12);
  });
  it('conserva errores parciales y los limpia al reintentar', () => {
    instructor.listAttempts.mockReturnValue(throwError(() => new Error('sin red')));
    groups.listar.mockReturnValue(throwError(() => new Error('sin red')));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect([...fixture.componentInstance.failedSources()]).toEqual(expect.arrayContaining(['revision', 'grupos']));
    expect(fixture.componentInstance.casosEdicion()).toHaveLength(1);
    instructor.listAttempts.mockReturnValue(of(pagina)); groups.listar.mockReturnValue(of([]));
    fixture.componentInstance.reload();
    expect(fixture.componentInstance.failedSources().size).toBe(0);
  });
  it('admin cuenta las tres fuentes y escribe solo solicitudes y cuentas en la insignia (la misma cifra que la pantalla de Usuarios)', () => {
    role = 'ADMIN'; const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.totalAdmin()).toBe(3);
    expect(badges.fijarUsuarios).toHaveBeenCalledWith(1, 1);
    expect(fixture.componentInstance.descripcion()).toContain('3 cosas');
  });
  it('admin deja en «Revisión» la cifra de casos por aprobar, la misma de la tarjeta; sin leer los casos no deja ninguna', () => {
    role = 'ADMIN'; casos.listAll.mockReturnValue(of([caso, publicado, { ...publicado, caseVersionId: 31, status: 'IN_REVIEW' }]));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.casosRevision()).toHaveLength(2);
    expect(badges.fijar).toHaveBeenCalledWith('trazabilidad', 2);
    badges.fijar.mockClear(); casos.listAll.mockReturnValue(throwError(() => new Error('sin red')));
    fixture.componentInstance.reload();
    expect(badges.fijar).toHaveBeenCalledWith('trazabilidad', 0);
  });
  it('no presenta un total parcial como insignia completa', () => {
    role = 'ADMIN'; requests.listPending.mockReturnValue(throwError(() => new Error('sin red')));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.failedSources().has('solicitudes')).toBe(true);
    expect(badges.fijarUsuarios).toHaveBeenCalledWith(null, 1);
    expect(fixture.componentInstance.descripcion()).toContain('fuentes disponibles');
  });
  it('nombra cada asignación con el título del caso publicado, no con «Caso N»', () => {
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.nombreCaso(9)).toBe('Violencia en el aula');
    expect(fixture.componentInstance.nombreCaso(7)).toBe('Caso de prueba');
    expect(fixture.componentInstance.nombreCaso(99)).toBe('Caso 99');
  });
  it('distingue los intentos de la misma persona en el mismo caso y siempre dice cuándo terminó', () => {
    instructor.listAttempts.mockReturnValue(of({ items: [
      { attemptId: 'b', studentAlias: 'Estudiante-1', caseVersionId: 7, caseTitle: 'Caso de prueba', startedAt: '2026-11-02', endedAt: null },
      { attemptId: 'a', studentAlias: 'Estudiante-1', caseVersionId: 7, caseTitle: 'Caso de prueba', startedAt: '2026-11-01', endedAt: '2026-11-01T12:00:00Z' },
      { attemptId: 'c', studentAlias: 'Estudiante-2', caseVersionId: 7, caseTitle: 'Caso de prueba', startedAt: '2026-11-01', endedAt: null },
    ], coverage: { shown: 3, total: 3 } }));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.numeroIntento()).toEqual({ a: 'Intento 1 de 2', b: 'Intento 2 de 2' });
    expect(c.terminoTexto(null)).toBe('Sin fecha de término registrada');
    const filas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.protagonista .fila')];
    expect(filas).toHaveLength(3);
    expect(filas.every(fila => !!fila.querySelector('small')?.textContent?.trim())).toBe(true);
    expect(c.descripcion()).toBe('Tienes 3 recorridos por revisar.');
  });
  it('un solo recorrido por revisar se dice en singular', () => {
    instructor.listAttempts.mockReturnValue(of({ ...pagina, coverage: { shown: 1, total: 1 } }));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(fixture.componentInstance.descripcion()).toBe('Tienes 1 recorrido por revisar.');
  });
  it('dice el avance del grupo en palabras y sin plural equivocado', () => {
    const c = TestBed.createComponent(StaffDashboardComponent).componentInstance;
    expect(c.avanceTexto(1, 1)).toBe('1 de 1 terminó');
    expect(c.avanceTexto(4, 12)).toBe('4 de 12 terminaron');
    expect(c.avanceTexto(0, 0)).toBe('Aún sin estudiantes en el grupo');
    expect(c.avanceTexto(null, 3)).toBe('Avance no disponible');
  });
  it('dice las cantidades con singular y plural', () => {
    const c = TestBed.createComponent(StaffDashboardComponent).componentInstance;
    expect(c.cantidad(1, 'estudiante', 'estudiantes')).toBe('1 estudiante');
    expect(c.cantidad(12, 'estudiante', 'estudiantes')).toBe('12 estudiantes');
  });
  it('admin ve la actividad reciente del registro de auditoría y, si falla, lo dice sin tumbar el inicio', () => {
    role = 'ADMIN'; const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(audit.list).toHaveBeenCalled();
    expect(fixture.componentInstance.actividad()).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('AUDIT_VIEWED');
    audit.list.mockReturnValue(throwError(() => new Error('sin red')));
    fixture.componentInstance.reload();
    expect(fixture.componentInstance.fallo('auditoria')).toBe(true);
    expect(fixture.componentInstance.totalAdmin()).toBe(3);
  });
  it('el docente no pide el registro de auditoría y enlaza al reporte de cada grupo', () => {
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    expect(audit.list).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href*="reportes"]')).not.toBeNull();
  });
  it('admin descarta una solicitud desde el inicio y la insignia baja', () => {
    role = 'ADMIN'; const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    fixture.componentInstance.descartar(fixture.componentInstance.solicitudes()[0]);
    expect(requests.updateStatus).toHaveBeenCalledWith(1, 'DISMISSED');
    expect(fixture.componentInstance.solicitudes()).toHaveLength(0);
    expect(badges.fijarUsuarios).toHaveBeenLastCalledWith(0, 1);
    expect(notify.success).toHaveBeenCalled();
  });
  it('si descartar falla, la solicitud sigue en la lista y se avisa', () => {
    role = 'ADMIN'; requests.updateStatus.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    fixture.componentInstance.descartar(fixture.componentInstance.solicitudes()[0]);
    expect(fixture.componentInstance.solicitudes()).toHaveLength(1);
    expect(notify.error).toHaveBeenCalled();
    expect(fixture.componentInstance.descartando()).toBeNull();
  });
  // P6: «Lo siguiente» del docente, con datos que la API ya da.
  describe('«Lo siguiente» del docente', () => {
    const seccion = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).querySelector('[data-lo-siguiente]') as HTMLElement;
    const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('dice que un caso publicado no está asignado a ningún grupo y ofrece asignarlo ahí mismo', () => {
      todas = [{ id: 2, active: true, caseVersionId: 7 }];
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      const pasos = [...seccion(fixture).querySelectorAll('[data-paso]')];
      expect(pasos.map(p => p.getAttribute('data-paso'))).toEqual(['revisar', 'asignar']);
      expect(texto(pasos[1])).toContain('Tu caso «Violencia en el aula» está publicado y no está asignado a ningún grupo.');
      expect(pasos[1].querySelector('app-asignar-desde-caso button')).not.toBeNull();
      expect(texto(pasos[0])).toContain('Hay 12 intentos terminados por revisar.');
      expect((pasos[0].querySelector('a') as HTMLAnchorElement).getAttribute('href')).toContain('/portal/docente/trazabilidad?evaluacion=pendiente');
    });

    it('con todo asignado y nada por revisar dice que no hay nada urgente', () => {
      instructor.listAttempts.mockReturnValue(of({ items: [], coverage: { shown: 0, total: 0 } }));
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      expect(seccion(fixture).querySelectorAll('[data-paso]')).toHaveLength(0);
      expect(texto(seccion(fixture))).toContain('Por ahora no hay nada urgente');
    });

    it('con una fuente caída no declara «todo al día»: lo dice y ofrece reintentar', () => {
      instructor.listAttempts.mockReturnValue(throwError(() => new Error('sin red')));
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      // Sin la bandeja, lo que sí se sabe (caso publicado) igual se dice.
      expect(seccion(fixture).querySelectorAll('[data-paso]')).toHaveLength(0);
      expect(texto(seccion(fixture))).not.toContain('nada urgente');
      expect(texto(seccion(fixture))).toContain('No pudimos revisar todo lo que sigue');
      expect([...seccion(fixture).querySelectorAll('button')].some(b => texto(b) === 'Reintentar')).toBe(true);
    });

    it('sin grupos lleva a crear el primero en vez de ofrecer asignar', () => {
      groups.listar.mockReturnValue(of([]));
      todas = [];
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      const paso = seccion(fixture).querySelector('[data-paso="crear-grupo"]')!;
      expect(texto(paso)).toContain('aún no tienes un grupo donde asignarlo');
      expect((paso.querySelector('a') as HTMLAnchorElement).getAttribute('href')).toBe('/portal/grupos');
    });

    it('lee las asignaciones de TODOS los grupos, no solo las de los cuatro que se pintan', () => {
      const asignaciones = TestBed.inject(AssignmentService) as unknown as { listAll: () => unknown };
      const espiar = vi.spyOn(asignaciones, 'listAll');
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      expect(espiar).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.todasAsignaciones()).toHaveLength(2);
    });

    it('tras asignar desde ahí vuelve a leer las asignaciones y la frase desaparece', () => {
      todas = [];
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      expect(seccion(fixture).querySelector('[data-paso="asignar"]')).not.toBeNull();
      todas = [{ id: 3, active: true, caseVersionId: 9 }, { id: 2, active: true, caseVersionId: 7 }];
      fixture.componentInstance.refrescarAsignaciones();
      fixture.detectChanges();
      expect(seccion(fixture).querySelector('[data-paso="asignar"]')).toBeNull();
    });

    it('el administrador no ve «Lo siguiente» del docente (su inicio tiene «Por atender»)', () => {
      role = 'ADMIN';
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      expect(seccion(fixture)).toBeNull();
    });

    it('el nombre de cada grupo es un enlace de verdad al grupo', () => {
      const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
      const enlace = (fixture.nativeElement as HTMLElement).querySelector('h3 a.nombre-grupo') as HTMLAnchorElement;
      expect(texto(enlace)).toBe('Grupo A');
      expect(enlace.getAttribute('href')).toBe('/portal/grupos/1');
    });
  });

  it('la solicitud de acceso dice «Aprobar y crear cuenta» y «Descartar» explica por qué espera mientras descarta otra', () => {
    role = 'ADMIN'; const fixture = TestBed.createComponent(StaffDashboardComponent); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Aprobar y crear cuenta');
    fixture.componentInstance.descartando.set(99); fixture.detectChanges();
    const descartar = [...host.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('Descartar'))!;
    expect(descartar.getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).toContain('Se está descartando otra solicitud: espera un momento.');
  });
});
