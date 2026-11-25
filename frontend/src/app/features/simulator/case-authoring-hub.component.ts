import { AsignarDesdeCasoComponent } from '../grupos/asignar-desde-caso.component';
import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { forkJoin } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { CasoStore } from '../autoria/estado/caso.store';
import { BibliotecaService } from '../autoria/modelo/biblioteca.service';
import { CAPITULOS } from '../autoria/tutorial/capitulos';
import { asegurarCasoDePractica } from '../autoria/tutorial/caso-de-practica';
import { guardarProgreso, leerProgreso } from '../autoria/tutorial/progreso-tutorial';
import { AuthService } from '../../core/auth/auth.service';
import { AssignmentService } from '../../core/api/assignment.service';
import { AuthoringApi } from '../../core/api/authoring.api';
import { GrupoService } from '../../core/api/grupo.service';
import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { statusLabel } from '../../shared/ui/labels';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiFiltros } from '../../shared/ui/filtros/ui-filtros';
import { UiSegmentado } from '../../shared/ui/segmentado/ui-segmentado';
import { UiPortadaCaso } from '../../shared/ui/portada-caso/ui-portada-caso';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';

/**
 * Hub de edición de casos (plan visual F7-7): estados de la lista de a uno (esqueleto, error con «Reintentar», primer
 * uso con su acción) y el estado de cada caso con su etiqueta humana («Borrador», no `DRAFT`). Todo caso nuevo empieza
 * eligiendo un lugar (`casos/nuevo`): ya no hay formulario de caso en blanco.
 */
@Component({
  selector: 'app-case-authoring-hub',
  standalone: true,
  imports: [
    AsignarDesdeCasoComponent, RouterLink, NgTemplateOutlet, UiFiltros, UiSegmentado, UiPortadaCaso,
    UiBadge, UiButton, UiCard, UiCabeceraIlustrada, UiSection, UiSkeleton,
    UiVacioIlustrado, UiErrorState,
  ],
  templateUrl: './case-authoring-hub.component.html',
  styleUrl: './case-authoring-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseAuthoringHubComponent implements OnInit {
  private readonly authoringApi = inject(AuthoringApi);
  private readonly auth = inject(AuthService);

  readonly statusLabel = statusLabel;
  readonly filtro = signal('ALL');
  readonly busqueda = signal('');
  readonly opciones = computed(() => [
    ['ALL', 'Todos'], ['DRAFT', 'Borradores'], ['IN_REVIEW', 'En revisión'],
    ['PUBLISHED', 'Publicados'], ['ARCHIVED', 'Archivados'],
  ].map(([valor, etiqueta]) => ({ valor, etiqueta, cuenta: this.cases().filter(c => valor === 'ALL' || c.status === valor).length })));
  readonly filtrados = computed(() => {
    const texto = this.busqueda().trim().toLocaleLowerCase('es');
    return this.cases().filter(c => (this.filtro() === 'ALL' || c.status === this.filtro()) &&
      c.title.toLocaleLowerCase('es').includes(texto));
  });
  // Sin caseId no se agrupa: nunca se mezclan casos antiguos por accidente.
  readonly grupos = computed(() => {
    const grupos = new Map<string, SimulationCaseSummary[]>();
    const admin = this.auth.currentUser()?.role === 'ADMIN';
    for (const caso of this.filtrados()) {
      const clave = admin && caso.caseId != null ? `caso-${caso.caseId}` : `version-${caso.caseVersionId}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), caso]);
    }
    return [...grupos.values()].map(versiones => versiones.sort((a, b) =>
      Number(b.status === 'PUBLISHED') - Number(a.status === 'PUBLISHED') ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.caseVersionId - a.caseVersionId));
  });
  readonly cases = signal<SimulationCaseSummary[]>([]);
  /**
   * A qué grupos está asignado cada caso (tras asignar, la tarjeta no lo decía). `null` mientras no se haya podido leer:
   * sin el dato la tarjeta no dice nada, porque «Sin asignar» sería una afirmación falsa.
   */
  private readonly grupoDeCada = signal<{ asignaciones: Assignment[]; nombres: ReadonlyMap<number, string> } | null>(null);
  private readonly asignacionesApi = inject(AssignmentService);
  private readonly gruposApi = inject(GrupoService);
  readonly loading = signal(true);
  /** La LISTA no pudo cargarse (el texto va en el estado de error de la lista). */
  readonly error = signal('');

  /** Estado de la lista de casos: una sola señal, de a uno. */
  readonly listState = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.cases().length === 0),
  });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.listState() === 'loading' ? 'Cargando casos…' : ''));

  ngOnInit(): void {
    this.loadCases();
  }

  // ─── «Aprende a crear un caso» (tutorial del editor) ─────────────────────────
  private readonly router = inject(Router);
  /** El store y la biblioteca se piden al pulsar: necesitan el cliente HTTP, y la lista no los necesita para pintarse. */
  private readonly injector = inject(Injector);
  protected readonly totalCapitulos = CAPITULOS.length;
  /** El progreso del tutorial de esta docente (se lee al entrar a la pantalla). */
  protected readonly tutorial = signal(leerProgreso(this.auth.currentUser()?.id ?? null));
  protected readonly tutorialAccion = computed(() => {
    const p = this.tutorial();
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (p.terminado) return 'Repetir';
    return p.completados.length || p.paso || p.capitulo ? 'Continuar' : 'Empezar';
  });
  protected readonly tutorialAbriendo = signal(false);
  protected readonly tutorialError = signal('');

  async abrirTutorial(): Promise<void> {
    // Con la lista aún cargando no se sabe si el caso de práctica ya existe: se crearía otro.
    if (this.tutorialAbriendo() || this.loading()) return;
    this.tutorialAbriendo.set(true);
    this.tutorialError.set('');
    const usuario = this.auth.currentUser()?.id ?? null;
    try {
      const store = this.injector.get(CasoStore);
      const id = await asegurarCasoDePractica({
        existentes: this.cases(),
        casoGuardado: this.tutorial().casoId,
        biblioteca: this.injector.get(BibliotecaService),
        crear: (t, l, s, d) => store.crearCaso(t, l, s, d),
      });
      if (id !== this.tutorial().casoId) guardarProgreso(usuario, { ...this.tutorial(), casoId: id });
      const modo = this.tutorial().terminado ? 'repetir' : '1';
      await this.router.navigateByUrl(`/portal/casos/${encodeURIComponent(id)}/editor?tutorial=${modo}`);
    } catch (e) {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      this.tutorialError.set(e instanceof Error ? e.message : 'No se pudo preparar el caso de práctica.');
    } finally {
      this.tutorialAbriendo.set(false);
    }
  }

  /**
   * «Asignado a: Grupo A, Grupo B» o «Sin asignar», solo para un caso publicado (los demás no se pueden asignar). Un grupo
   * con la asignación en pausa lo dice. Con más de tres grupos se nombran tres y se cuenta el resto.
   */
  asignadoA(caseVersionId: number): string | null {
    const datos = this.grupoDeCada();
    if (!datos) return null;
    const grupos = datos.asignaciones
      .filter(a => a.caseVersionId === caseVersionId && a.target.type === 'GROUP')
      .flatMap(a => {
        const nombre = a.target.type === 'GROUP' ? datos.nombres.get(a.target.groupId) : undefined;
        return nombre ? [a.active ? nombre : `${nombre} (en pausa)`] : [];
      });
    if (!grupos.length) return 'Sin asignar';
    const vistos = grupos.slice(0, 3).join(', ');
    return `Asignado a: ${vistos}${grupos.length > 3 ? ` y ${grupos.length - 3} más` : ''}`;
  }

  /** Lee las asignaciones y los grupos; si no se pueden leer, la tarjeta calla en vez de afirmar «Sin asignar». */
  loadAsignaciones(): void {
    forkJoin({ asignaciones: this.asignacionesApi.listAll(), grupos: this.gruposApi.listar() }).subscribe({
      next: ({ asignaciones, grupos }) => this.grupoDeCada.set({ asignaciones, nombres: new Map(grupos.map(g => [g.id, g.nombre] as const)) }),
      error: () => this.grupoDeCada.set(null),
    });
  }

  statusTone(status: string | null | undefined): UiBadgeTone {
    const normalized = (status ?? '').toUpperCase();
    if (normalized === 'PUBLISHED') return 'success';
    if (normalized === 'IN_REVIEW') return 'info';
    return 'neutral';
  }

  accion(status: string): string {
    switch (status) {
      case 'DRAFT': return 'Seguir editando';
      case 'IN_REVIEW': return 'Ver revisión';
      case 'PUBLISHED': return 'Abrir en el editor';
      default: return 'Ver';
    }
  }

  fecha(valor: string | null | undefined): string | null {
    if (!valor) return null;
    // BK-4 entrega hora de Bogotá sin zona; no depende de la zona del navegador.
    const fecha = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(valor) ? valor : `${valor}-05:00`);
    if (Number.isNaN(fecha.getTime())) return null;
    const minutos = Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 60000));
    if (minutos < 1) return 'Editado hace un momento';
    if (minutos < 60) return `Editado hace ${minutos} min`;
    if (minutos < 1440) return `Editado hace ${Math.floor(minutos / 60)} h`;
    return `Editado hace ${Math.floor(minutos / 1440)} días`;
  }

  loadCases(): void {
    this.loading.set(true);
    this.error.set('');
    this.authoringApi.listAuthoringCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.loading.set(false);
        if (cases.some(c => c.status === 'PUBLISHED')) this.loadAsignaciones();
      },
      error: (err: { status?: number; error?: { code?: string } }) => {
        this.error.set(err?.status === 403 && err.error?.code === 'AUTHORING_NOT_ALLOWED'
          ? 'Para crear casos necesitas el permiso de autoría. Pídeselo a la administración de tu programa.'
          : 'No fue posible cargar los casos disponibles.');
        this.loading.set(false);
      },
    });
  }
}
