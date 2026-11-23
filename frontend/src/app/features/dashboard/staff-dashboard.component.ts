import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { AdminAuditService, AuditLogItem } from '../../core/api/admin-audit.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { InstructorApi } from '../../core/api/instructor.api';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { Assignment } from '../../core/models/assignment.model';
import { InstructorAttemptsPage, SimulationCaseSummary } from '../../core/models/revision.model';
import { haceCuanto } from '../simulator/trace-labels.util';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

type Source = 'revision' | 'grupos' | 'casos' | 'solicitudes' | 'usuarios' | 'auditoria';
interface GrupoVista { grupo: Grupo; asignaciones: Assignment[] | null; }

@Component({
  selector: 'app-staff-dashboard',
  imports: [RouterLink, UiButton, UiCabeceraIlustrada, UiSkeleton, UiEmptyState, UiErrorState],
  templateUrl: './staff-dashboard.component.html', styleUrl: './staff-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Inicio del docente y de la administración (`/portal/dashboard`). El del estudiante es otro componente: la ruta elige
 * por rol.
 */
export class StaffDashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly instructor = inject(InstructorApi);
  private readonly gruposApi = inject(GrupoService);
  private readonly asignacionesApi = inject(AssignmentService);
  /** Los casos que ve quien autora: nombran cada asignación de un grupo y alimentan «en edición» y «por aprobar». */
  private readonly casosApi = inject(CaseCatalogApi);
  private readonly auditoriaApi = inject(AdminAuditService);
  private readonly usuariosApi = inject(UserAdminService);
  private readonly solicitudesApi = inject(AccessRequestAdminService);
  private readonly badges = inject(NavBadgesService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  /** Solicitud que se está descartando, para no mandar dos veces el mismo cambio. */
  readonly descartando = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly failedSources = signal<ReadonlySet<Source>>(new Set());
  readonly revision = signal<InstructorAttemptsPage | null>(null);
  readonly grupos = signal<GrupoVista[]>([]);
  readonly casos = signal<SimulationCaseSummary[]>([]);
  readonly publicados = computed(() => this.casos().filter(c => c.status === 'PUBLISHED'));
  /** Lo último que quedó en el registro de auditoría (solo administración). */
  readonly actividad = signal<AuditLogItem[]>([]);
  readonly solicitudes = signal<AccessRequest[]>([]);
  readonly usuarios = signal<AdminUser[]>([]);
  readonly state = uiDataState({ loading: this.loading, error: this.error, isEmpty: computed(() => false) });
  readonly cuentasActivas = computed(() => this.usuarios().filter(u => u.activo));
  contarRol(rol: string): number { return this.cuentasActivas().filter(u => u.role === rol).length; }
  readonly pendientesCuentas = computed(() => this.usuarios().filter(u => u.pendingApproval).length);
  readonly casosRevision = computed(() => this.casos().filter(c => c.status === 'IN_REVIEW'));
  readonly casosEdicion = computed(() => this.casos().filter(c => c.status === 'DRAFT' || c.status === 'IN_REVIEW').slice(0, 3));
  readonly totalRevision = computed(() => this.revision()?.coverage.total ?? 0);
  readonly totalAdmin = computed(() => this.solicitudes().length + this.pendientesCuentas() + this.casosRevision().length);
  readonly titulo = computed(() => `Hola, ${this.auth.currentUser()?.nombre?.trim().split(/\s+/)[0] || 'bienvenido'}`);
  readonly descripcion = computed(() => {
    if (this.loading()) return 'Estamos preparando tu inicio.';
    if (this.isAdmin()) return this.failedSources().size ? 'Consulta las fuentes disponibles.' : this.totalAdmin() ? `Tienes ${this.totalAdmin()} cosas por atender.` : 'Todo al día.';
    return this.failedSources().has('revision') ? 'No pudimos consultar los recorridos pendientes.' : this.totalRevision() ? `Tienes ${this.cantidad(this.totalRevision(), 'recorrido', 'recorridos')} por revisar.` : 'No tienes nada pendiente por revisar.';
  });
  ngOnInit(): void { this.reload(); }
  isAdmin(): boolean { return this.auth.hasRole('ADMIN'); }
  fallo(source: Source): boolean { return this.failedSources().has(source); }
  private fallar<T>(source: Source, fallback: T) {
    this.failedSources.update(s => new Set(s).add(source));
    return of(fallback);
  }
  reload(): void {
    this.loading.set(true); this.error.set(false); this.failedSources.set(new Set());
    const casos = this.casosApi.listAll().pipe(catchError(() => this.fallar('casos', [] as SimulationCaseSummary[])));
    if (this.isAdmin()) {
      forkJoin({ casos, solicitudes: this.solicitudesApi.listPending().pipe(catchError(() => this.fallar('solicitudes', [] as AccessRequest[]))), usuarios: this.usuariosApi.list().pipe(catchError(() => this.fallar('usuarios', [] as AdminUser[]))), actividad: this.auditoriaApi.list().pipe(map(pagina => pagina.items.slice(0, 5)), catchError(() => this.fallar('auditoria', [] as AuditLogItem[]))) }).subscribe(({ casos, solicitudes, usuarios, actividad }) => {
        this.casos.set(casos); this.solicitudes.set(solicitudes); this.usuarios.set(usuarios); this.actividad.set(actividad);
        // Una insignia incompleta parecería un conteo exacto.
        this.badges.fijar('usuarios', this.fallo('solicitudes') || this.fallo('usuarios') ? 0 : solicitudes.length + usuarios.filter(u => u.pendingApproval).length);
        this.loading.set(false);
      });
    } else {
      // El avance de cada caso por grupo llega con el backend de reportes (`/portal/reportes`); mientras tanto el inicio
      // solo dice qué casos tiene asignados cada grupo.
      const grupos = this.gruposApi.listar().pipe(switchMap(items => {
        const primeros = items.slice(0, 4);
        if (!primeros.length) return of([] as GrupoVista[]);
        return forkJoin(primeros.map(grupo => this.asignacionesApi.list(grupo.id).pipe(
          switchMap(asignaciones => of({ grupo, asignaciones: asignaciones.filter(a => a.active) } as GrupoVista)),
          catchError(() => this.fallar('grupos', { grupo, asignaciones: null } as GrupoVista)),
        )));
      }), catchError(() => this.fallar('grupos', [] as GrupoVista[])));
      forkJoin({ casos, grupos, revision: this.instructor.listAttempts({ evaluacion: 'pendiente', pageSize: 5 }).pipe(catchError(() => this.fallar('revision', null as InstructorAttemptsPage | null))) }).subscribe(({ casos, grupos, revision }) => {
        this.casos.set(casos); this.grupos.set(grupos); this.revision.set(revision);
        this.badges.fijar('trazabilidad', revision?.coverage.total ?? 0); this.loading.set(false);
      });
    }
  }
  nombreCaso(id: number): string {
    // Publicados, luego los del docente y, por último, la bandeja (una versión retirada sigue nombrada en sus intentos).
    return this.publicados().find(c => c.caseVersionId === id)?.title ?? this.casos().find(c => c.caseVersionId === id)?.title
      ?? this.revision()?.items.find(item => item.caseVersionId === id)?.caseTitle
      ?? this.grupos().flatMap(g => g.asignaciones ?? []).find(a => a.caseVersionId === id)?.caseTitle ?? `Caso ${id}`;
  }
  /**
   * Varios intentos de la misma persona en el mismo caso se veían como filas idénticas: cada uno dice cuál es
   * («Intento 2 de 3», del más antiguo al más reciente dentro de lo que muestra la bandeja). Con uno solo, nada.
   */
  readonly numeroIntento = computed(() => {
    const items = this.revision()?.items ?? [];
    const grupos = new Map<string, string[]>();
    for (const item of [...items].sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))) {
      const clave = `${item.studentAlias}|${item.caseVersionId}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), item.attemptId]);
    }
    const numeros: Record<string, string> = {};
    for (const ids of grupos.values()) {
      if (ids.length > 1) ids.forEach((id, i) => (numeros[id] = `Intento ${i + 1} de ${ids.length}`));
    }
    return numeros;
  });
  /** La línea de tiempo de cada fila, siempre presente para que las filas no queden desparejas. */
  terminoTexto(valor: string | null | undefined): string {
    const hace = this.hace(valor);
    return hace ? `Terminó ${hace}` : 'Sin fecha de término registrada';
  }
  /** «terminó hace 2 días»; vacío si la fecha no llegó, para no escribir «fecha no disponible» en cada fila. */
  hace(valor: string | null | undefined): string { return haceCuanto(valor); }
  /** La ventana de la asignación en palabras: abierta, ya cerrada o sin fecha. */
  cierre(valor: string | null | undefined): string {
    if (!valor) return 'Sin fecha de cierre';
    const t = new Date(valor).getTime();
    return !Number.isNaN(t) && t < Date.now() ? `Cerró el ${this.fecha(valor)}` : `Abierto hasta el ${this.fecha(valor)}`;
  }
  /** Plural de la cantidad con su sustantivo: «1 estudiante», «12 estudiantes». */
  cantidad(n: number, uno: string, varios: string): string { return `${n} ${n === 1 ? uno : varios}`; }
  /** Descarta una solicitud desde el inicio (mismo cambio de estado que en Usuarios) y actualiza la insignia. */
  descartar(solicitud: AccessRequest): void {
    if (this.descartando() !== null) return;
    this.descartando.set(solicitud.id);
    this.solicitudesApi.updateStatus(solicitud.id, 'DISMISSED').subscribe({
      next: () => {
        this.solicitudes.update(items => items.filter(item => item.id !== solicitud.id));
        this.badges.fijar('usuarios', this.fallo('usuarios') ? 0 : this.solicitudes().length + this.pendientesCuentas());
        this.notify.success('Solicitud descartada.');
        this.descartando.set(null);
      },
      error: () => { this.notify.error('No pudimos descartar la solicitud. Inténtalo de nuevo.'); this.descartando.set(null); },
    });
  }
  fecha(valor: string | null | undefined): string { if (!valor) return 'Fecha no disponible'; const d = new Date(valor); return Number.isNaN(d.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(d); }
  fechaHora(valor: string | null | undefined): string { if (!valor) return 'Fecha no disponible'; const d = new Date(valor); return Number.isNaN(d.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d); }
  irGrupos(): void { void this.router.navigateByUrl('/portal/grupos'); }
}
