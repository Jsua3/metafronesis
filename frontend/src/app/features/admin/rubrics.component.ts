import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialog, UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiFiltros } from '../../shared/ui/filtros/ui-filtros';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSegmentado, UiSegmento } from '../../shared/ui/segmentado/ui-segmentado';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { FIGURAS_VACIO } from '../../shared/ui/state/state-copy';
import { ComienzoRubrica, RUBRIC_GONE_MESSAGE, RUBRIC_READ_ONLY_MESSAGE, RubricaEditorComponent } from './rubrica-editor.component';

// Las constantes de mensaje viven con el editor (es quien las dice); se reexportan para quien las importaba de aquí.
export { RUBRIC_CASE_NOT_OWNED_MESSAGE, RUBRIC_GONE_MESSAGE, RUBRIC_READ_ONLY_MESSAGE } from './rubrica-editor.component';

/** Lo que devuelve el diálogo «Nueva rúbrica». */
export type NuevaRubricaEleccion = { comienzo: ComienzoRubrica } | { copiar: number };

interface NuevaRubricaDatos {
  rubricas: readonly RubricAdmin[];
}

/**
 * «Nueva rúbrica» (EDITOR.md §5.2): tres comienzos, de más a menos recomendado. La primera es la única plantilla que no
 * inventa contenido: sale del catálogo de competencias que fijó Psicología. No se traen plantillas con criterios
 * redactados por nosotros (serían texto clínico sin validar puesto como modelo).
 */
@Component({
  selector: 'app-nueva-rubrica-dialogo',
  imports: [MatIconModule, UiButton, UiControl, UiDialogActions, UiDialogFrame, UiField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Estilos propios y cortos: el diálogo vive en una capa fuera de la página (no hereda los de la biblioteca).
  styles: `
    .rb-comienzos { display: grid; gap: var(--ds-space-3); }
    .rb-comienzo {
      display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--ds-space-3); align-items: start;
      inline-size: 100%; min-block-size: var(--ds-target-min); padding: var(--ds-space-4);
      border: 1px solid var(--l-filo, var(--ds-border)); border-radius: var(--l-radio-control, var(--ds-radius-md));
      background: var(--l-superficie, var(--ds-surface-1)); color: var(--ds-text-1); font: inherit; text-align: start;
    }
    button.rb-comienzo { cursor: pointer; transition: border-color var(--ds-dur-fast) var(--ds-ease-out), background-color var(--ds-dur-fast) var(--ds-ease-out); }
    @media (hover: hover) and (pointer: fine) { button.rb-comienzo:hover { border-color: var(--l-tinte-filo, var(--ds-border-strong)); background: var(--l-fila-encima, var(--ds-surface-2)); } }
    .rb-comienzo--recomendado { border-color: var(--l-tinte-filo, var(--ds-primary)); background: var(--l-tinte, var(--ds-primary-subtle)); }
    .rb-comienzo__icono { color: var(--l-acento-tinta, var(--ds-primary)); }
    .rb-comienzo__texto { display: grid; gap: var(--ds-space-1); min-inline-size: 0; }
    .rb-comienzo__texto > span { color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
    .rb-comienzo__copiar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ds-space-2); align-items: end; }
    @media (forced-colors: active) { .rb-comienzo { border-color: CanvasText; } }
  `,
  template: `
    <ui-dialog-frame title="Nueva rúbrica" description="Elige cómo empezar. Todo se puede cambiar después.">
      <div class="rb-comienzos">
        <button type="button" class="rb-comienzo rb-comienzo--recomendado" (click)="ref.close({ comienzo: 'competencias' })">
          <mat-icon class="rb-comienzo__icono" aria-hidden="true">school</mat-icon>
          <span class="rb-comienzo__texto">
            <strong>Con las competencias del programa</strong>
            <span>Un criterio por competencia, enlazado a ella y con el peso repartido. Recomendada.</span>
          </span>
        </button>
        <div class="rb-comienzo rb-comienzo--copiar">
          <mat-icon class="rb-comienzo__icono" aria-hidden="true">content_copy</mat-icon>
          <div class="rb-comienzo__texto">
            <strong id="rb-copiar-titulo">Copiar una rúbrica</strong>
            @if (data.rubricas.length) {
              <div class="rb-comienzo__copiar">
                <ui-field label="Rúbrica que se copia">
                  <select uiControl [value]="copia()" (change)="copia.set(+$any($event.target).value)">
                    @for (rubrica of data.rubricas; track rubrica.id) {
                      <option [value]="rubrica.id">{{ rubrica.name }}</option>
                    }
                  </select>
                </ui-field>
                <button ui-button type="button" variant="secondary" (click)="ref.close({ copiar: copia() })">Copiar</button>
              </div>
            } @else {
              <span>Todavía no hay rúbricas para copiar.</span>
            }
          </div>
        </div>
        <button type="button" class="rb-comienzo" (click)="ref.close({ comienzo: 'blanco' })">
          <mat-icon class="rb-comienzo__icono" aria-hidden="true">edit_note</mat-icon>
          <span class="rb-comienzo__texto">
            <strong>En blanco</strong>
            <span>Un criterio vacío para escribir desde cero.</span>
          </span>
        </button>
      </div>
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cancelar</button>
    </ui-dialog-frame>
  `,
})
export class NuevaRubricaDialogo {
  protected readonly ref = inject<DialogRef<NuevaRubricaEleccion>>(DialogRef);
  protected readonly data = inject<NuevaRubricaDatos>(DIALOG_DATA);
  protected readonly copia = signal(this.data.rubricas[0]?.id ?? 0);
}

type Grupo = { id: 'mias' | 'otras' | 'casos'; titulo: string; descripcion: string; rubricas: RubricAdmin[] };

/**
 * Rúbricas (EDITOR.md §5.2, bloque R1): dos niveles en la misma ruta. Sin `?rubrica=` es la BIBLIOTECA (agrupada en
 * «Mis rúbricas», «De la institución» y «De un caso» cuando el servidor dice de qué caso es cada una); con
 * `?rubrica=<id>` o `?rubrica=nueva` es el EDITOR de una rúbrica (`app-rubrica-editor`), que se puede enlazar desde el
 * editor de casos. La ruta corre su guardia de salida también al cambiar `?rubrica=` (`runGuardsAndResolvers`): ir a la
 * biblioteca o a otra rúbrica con cambios sin guardar pregunta antes, como salir del portal.
 */
@Component({
  selector: 'app-rubrics',
  imports: [
    MatIconModule, RouterLink,
    UiBadge, UiButton, UiFiltros, UiMenu, UiCabeceraIlustrada, UiPageHeader, UiSection, UiSegmentado, UiSkeleton,
    UiEmptyState, UiErrorState, RubricaEditorComponent,
  ],
  templateUrl: './rubrics.component.html',
  styleUrl: './rubrics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.rb--editor]': 'enEditor()' },
})
export class RubricsComponent {
  private readonly rubricService = inject(RubricService);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(UiDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** E2-2: solo el administrador fija la rúbrica predeterminada (al docente el servidor le responde 403). */
  protected readonly canSetDefault = this.auth.hasRole('ADMIN');
  protected readonly figura = FIGURAS_VACIO.docente;
  readonly editor = viewChild(RubricaEditorComponent);

  /** Lo que pide la dirección: `null` (biblioteca), `'nueva'` o el id. */
  readonly parametro = signal<string | null>(null);
  readonly desde = signal<ComienzoRubrica>('blanco');
  readonly enEditor = computed(() => this.parametro() !== null);
  /** La rúbrica que abre el editor (nula = una nueva). */
  readonly idEditor = computed(() => {
    const valor = Number(this.parametro());
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  });

  rubrics = signal<RubricAdmin[]>([]);
  query = signal('');
  statusFilter = signal('ALL');
  loading = signal(false);
  message = signal('');
  messageIsError = signal(false);
  /** La LISTA no pudo cargarse. */
  listError = signal(false);

  /** Estado de la lista (esqueleto, error con «Reintentar», primer uso o lista): una sola señal, de a uno. */
  readonly listState = uiDataState({
    loading: this.loading,
    error: this.listError,
    isEmpty: computed(() => this.rubrics().length === 0),
  });
  /** Región de estado SIEMPRE presente: la carga de la lista y los avisos que no se ven como cambio en pantalla. */
  protected readonly statusText = computed(() => {
    if (this.listState() === 'loading') return 'Cargando rúbricas…';
    return this.messageIsError() && this.listState() !== 'error' ? this.message() : '';
  });

  readonly filtrosEstado = computed<UiSegmento[]>(() => {
    const todas = this.rubrics();
    return [
      { valor: 'ALL', etiqueta: 'Todas', cuenta: todas.length },
      { valor: 'ACTIVE', etiqueta: 'Activas', cuenta: todas.filter(r => r.active).length },
      { valor: 'INACTIVE', etiqueta: 'Borradores', cuenta: todas.filter(r => !r.active).length },
    ];
  });

  readonly filtradas = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    const status = this.statusFilter();
    return this.rubrics().filter(rubric => {
      const matchesQuery = !query || rubric.name.toLocaleLowerCase('es').includes(query);
      const matchesStatus = status === 'ALL' || (status === 'ACTIVE' ? rubric.active : !rubric.active);
      return matchesQuery && matchesStatus;
    });
  });

  /**
   * Los grupos de la biblioteca. Solo se agrupa si el servidor manda `caseVersion` (RK-3): sin él no se sabe cuáles son
   * de un caso y un grupo «Mis rúbricas» mentiría. Para el administrador, las ajenas son de docentes, no «de la institución».
   */
  readonly grupos = computed<Grupo[]>(() => {
    const filas = this.filtradas();
    const conCaso = this.rubrics().some(r => r.caseVersion !== undefined);
    if (!conCaso) return [{ id: 'mias', titulo: '', descripcion: '', rubricas: filas }];
    const yo = this.auth.currentUser()?.id ?? null;
    const admin = this.canSetDefault;
    const grupos: Grupo[] = [
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología.
      { id: 'mias', titulo: 'Mis rúbricas', descripcion: 'Las que creaste. Son tus plantillas.', rubricas: [] },
      admin
        ? { id: 'otras', titulo: 'De docentes', descripcion: 'Las que crearon las docentes.', rubricas: [] }
        : { id: 'otras', titulo: 'De la institución', descripcion: 'Solo lectura. Duplícalas para personalizarlas.', rubricas: [] },
      { id: 'casos', titulo: 'De un caso', descripcion: 'Cada una pertenece a una versión de un caso.', rubricas: [] },
    ];
    for (const rubrica of filas) {
      const grupo = rubrica.caseVersion ? grupos[2] : (rubrica.ownerId != null && rubrica.ownerId === yo ? grupos[0] : grupos[1]);
      grupo.rubricas.push(rubrica);
    }
    return grupos.filter(grupo => grupo.rubricas.length);
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params => {
      this.parametro.set(params.get('rubrica'));
      this.desde.set(params.get('desde') === 'competencias' ? 'competencias' : 'blanco');
    });
    this.load();
  }

  /** Salir con cambios sin guardar pregunta antes (la ruta lleva `canLeaveGuard`). */
  canLeave(): boolean | Promise<boolean> {
    return this.editor()?.canLeave() ?? true;
  }

  /** Carga la lista. Con `keepMessage` (tras un 404) conserva el aviso que explica por qué se recargó. */
  load(keepMessage = false): void {
    this.loading.set(true);
    this.listError.set(false);
    this.rubricService.list().subscribe({
      next: rubrics => {
        this.rubrics.set(rubrics);
        if (!keepMessage) this.clearMessage();
        this.loading.set(false);
      },
      error: () => {
        this.message.set('No fue posible cargar las rúbricas.');
        this.messageIsError.set(true);
        this.listError.set(true);
        this.loading.set(false);
      },
    });
  }

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('ALL');
  }

  rowLabel(rubric: RubricAdmin): string {
    return rubric.isDefault ? 'Predeterminada' : (rubric.active ? 'Activa' : 'Borrador');
  }

  rowTone(rubric: RubricAdmin): UiBadgeTone {
    return rubric.isDefault ? 'success' : (rubric.active ? 'info' : 'neutral');
  }

  /** La línea de datos de una fila: criterios, suma, uso y caso. */
  rowMeta(rubric: RubricAdmin): string {
    const partes = [`${rubric.criteriaCount} ${rubric.criteriaCount === 1 ? 'criterio' : 'criterios'} · ${this.numero(rubric.totalWeight)} %`];
    const caso = rubric.caseVersion;
    if (caso) partes.push(`${caso.title} · v${caso.semanticVersion}`);
    const uso = rubric.usage;
    if (uso && (uso.caseVersions || uso.evaluations)) {
      partes.push(`En ${uso.caseVersions} ${uso.caseVersions === 1 ? 'caso' : 'casos'} · ${uso.evaluations} ${uso.evaluations === 1 ? 'valoración' : 'valoraciones'}`);
    }
    return partes.join(' · ');
  }

  rowFecha(rubric: RubricAdmin): string | null {
    const fecha = rubric.updatedAt ?? rubric.createdAt;
    if (!fecha) return null;
    const momento = new Date(fecha);
    if (Number.isNaN(momento.getTime())) return null;
    return `Actualizada el ${new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(momento)}`;
  }

  numero(valor: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor);
  }

  /** Las acciones del menú de una fila: Abrir, Duplicar, Activar o Desactivar (la que aplica) y Predeterminada. */
  rowItems(rubric: RubricAdmin): UiMenuItem[] {
    const items: UiMenuItem[] = [
      { value: 'abrir', label: rubric.editable === false ? 'Ver' : 'Abrir', icon: 'open_in_new' },
      { value: 'duplicar', label: 'Duplicar', icon: 'content_copy' },
    ];
    if (rubric.editable !== false) {
      items.push(rubric.active
        ? { value: 'desactivar', label: 'Desactivar', icon: 'do_not_disturb_on' }
        : { value: 'activar', label: 'Activar', icon: 'check_circle' });
    }
    if (this.canSetDefault && !rubric.isDefault) items.push({ value: 'predeterminada', label: 'Hacer predeterminada', icon: 'star' });
    return items;
  }

  rowAction(rubric: RubricAdmin, accion: string | undefined): void {
    if (accion === 'abrir') { this.abrir(rubric.id); return; }
    if (accion === 'duplicar') { this.duplicar(rubric.id); return; }
    // Activar y la predeterminada exigen que los pesos sumen 100: se dice por qué en vez de llamar a un 400.
    if ((accion === 'activar' || accion === 'predeterminada') && rubric.totalWeight !== 100) {
      this.notify.warning(`Para activarla, la ponderación debe sumar 100 % (hoy suma ${this.numero(rubric.totalWeight)} %). Ábrela y ajusta los pesos.`);
      return;
    }
    const orden = accion === 'activar' ? this.rubricService.activate(rubric.id)
      : accion === 'desactivar' ? this.rubricService.deactivate(rubric.id)
        : accion === 'predeterminada' ? this.rubricService.setDefault(rubric.id) : null;
    if (!orden) return;
    const exito = accion === 'activar' ? 'Rúbrica activada.' : accion === 'desactivar' ? 'Rúbrica desactivada.' : 'Rúbrica predeterminada actualizada.';
    orden.subscribe({
      next: () => { this.notify.success(exito); this.load(); },
      error: (err: unknown) => this.avisarError(err, 'No fue posible actualizar la rúbrica.'),
    });
  }

  abrir(id: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { rubrica: id } });
  }

  /** «Nueva rúbrica»: el diálogo con los tres comienzos. */
  nueva(): void {
    const ref = this.dialog.open<NuevaRubricaEleccion, NuevaRubricaDatos>(NuevaRubricaDialogo, {
      data: { rubricas: this.rubrics() },
    });
    ref.closed.subscribe(eleccion => {
      if (!eleccion) return;
      if ('copiar' in eleccion) {
        this.duplicar(eleccion.copiar);
        return;
      }
      const queryParams = eleccion.comienzo === 'competencias' ? { rubrica: 'nueva', desde: 'competencias' } : { rubrica: 'nueva' };
      void this.router.navigate([], { relativeTo: this.route, queryParams });
    });
  }

  /** Duplica en el servidor y abre la copia para personalizarla. */
  duplicar(id: number): void {
    this.rubricService.duplicate(id).subscribe({
      next: copia => {
        this.notify.success('Rúbrica duplicada.');
        this.load();
        this.abrir(copia.id);
      },
      error: (err: unknown) => this.avisarError(err, 'No fue posible duplicar la rúbrica.'),
    });
  }

  /** El editor guardó una versión: la lista se refresca y la dirección apunta a esa rúbrica (una nueva ya tiene id). */
  alGuardar(rubric: RubricAdmin): void {
    this.load();
    if (this.parametro() !== String(rubric.id)) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { rubrica: rubric.id }, replaceUrl: this.parametro() === 'nueva' });
    }
  }

  /** La rúbrica abierta ya no existe (404): se dice y se vuelve a la biblioteca con la lista recién pedida. */
  alPerderse(): void {
    this.message.set(RUBRIC_GONE_MESSAGE);
    this.messageIsError.set(true);
    this.notify.warning(RUBRIC_GONE_MESSAGE);
    this.load(true);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  private clearMessage(): void {
    this.message.set('');
    this.messageIsError.set(false);
  }

  private avisarError(err: unknown, respaldo: string): void {
    if (err instanceof HttpErrorResponse && err.status === 404) {
      this.notify.warning(RUBRIC_GONE_MESSAGE);
      this.load(true);
      return;
    }
    const texto = err instanceof HttpErrorResponse && err.status === 403
      ? RUBRIC_READ_ONLY_MESSAGE
      : apiErrorMessage(err, respaldo);
    if (texto) this.notify.error(texto);
  }
}
