import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, TemplateRef, ViewChild, afterNextRender, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { GrupoService, Grupo, GrupoEstudiante, GrupoImportError, GrupoImportResult, GrupoImportSpec, MembershipStatus } from '../../core/api/grupo.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { mapAgregarEstudianteError, mapGrupoError } from '../../core/api/grupo-error.utils';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { mensajeDeError } from '../../core/api/mensaje-de-error.util';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { membershipLabel } from '../../shared/ui/labels';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiConfirmOptions, UiDialog, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiVacioIlustrado } from '../../shared/ui/vacio-ilustrado/ui-vacio-ilustrado';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { moverFocoEnLista } from './mover-foco-en-lista';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { UiCelda, UiCeldaAcciones, UiCeldaPrincipal } from '../../shared/ui/table/ui-table-celda';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiArchivo } from '../../shared/ui/archivo/ui-archivo';
import { UiTab, UiTabs } from '../../shared/ui/tabs/ui-tabs';
import { GroupAssignmentsComponent } from './group-assignments.component';
import { CampoInvitarEstudianteComponent, correoOUsuario } from './campo-invitar-estudiante.component';

@Component({ selector: 'app-grupo-hoja', standalone: true, imports: [NgTemplateOutlet, UiDialogFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-dialog-frame [title]="data.title"><ng-container [ngTemplateOutlet]="data.template" /></ui-dialog-frame>`, })
class GrupoHojaComponent { readonly data = inject<{ title: string; template: TemplateRef<unknown> }>(DIALOG_DATA); }

/** E2-10: un servidor anterior no mandaba `membershipStatus` (todas eran membresías activas). */
function membershipOf(student: GrupoEstudiante): MembershipStatus {
  return student.membershipStatus ?? 'ACTIVE';
}

/** De quien no aceptó, el servidor solo devuelve el correo (D-14): ese es su nombre en pantalla. */
function studentName(student: GrupoEstudiante): string {
  const name = `${student.nombre ?? ''} ${student.apellido ?? ''}`.trim();
  return name || student.email;
}

const MEMBERSHIP_TONES: Record<MembershipStatus, UiBadgeTone> = {
  ACTIVE: 'success', INVITED: 'info', DECLINED: 'neutral', REMOVED: 'neutral',
};

function membershipBadge(student: GrupoEstudiante): { label: string; tone: UiBadgeTone } {
  const status = membershipOf(student);
  return { label: membershipLabel(status), tone: MEMBERSHIP_TONES[status] ?? 'neutral' };
}

/** A un invitado se le cancela la invitación; a un miembro se le quita del grupo. */
function removeLabel(student: GrupoEstudiante): string {
  return membershipOf(student) === 'INVITED'
    ? `Cancelar la invitación a ${student.email}`
    : `Quitar a ${studentName(student)} del grupo`;
}

/**
 * Pantalla Grupos en maestro-detalle (rediseño B5c, DP-18): la lista de grupos a la izquierda y el grupo elegido a la
 * derecha, con su propia ruta (`/portal/grupos/:grupoId`) para que «atrás» funcione y el detalle se pueda enlazar. En
 * teléfono son dos pantallas: la lista, y al tocar un grupo, el detalle con su regreso. «Nuevo grupo», «Editar» e
 * «Importar desde Excel» abren una hoja (`UiDialog.sheet`) en vez de ocupar la mejor zona de la página.
 */
@Component({
  selector: 'app-grupo-list',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink, NgTemplateOutlet,
    UiBadge, UiButton, UiIconButton, UiCard, UiControl, UiField, UiMenu, UiPageHeader, UiCabeceraIlustrada, UiVacioIlustrado, UiArchivo, UiTab, UiTabs,
    UiSkeleton, UiTable, UiTableTable, UiTableRow, UiCelda, UiCeldaPrincipal, UiCeldaAcciones,
    UiEmptyState, UiErrorState, GroupAssignmentsComponent, CampoInvitarEstudianteComponent,
  ],
  templateUrl: './grupo-list.component.html',
  styleUrl: './grupo-list.component.scss',
  // Eager: los errores de los campos salen de `control.touched`, que no es una señal; cada evento de la plantilla
  // vuelve a evaluarla.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrupoListComponent implements OnInit {
  @ViewChild('formularioGrupo') formularioGrupo!: TemplateRef<unknown>;
  @ViewChild('formularioImportacion') formularioImportacion!: TemplateRef<unknown>;
  readonly grupoId = input<string>();
  private hoja?: DialogRef<unknown, GrupoHojaComponent>;
  constructor() {
    effect(() => {
      const id = this.grupoId();
      const grupos = this.grupos();
      const grupo = id ? grupos.find(g => String(g.id) === id) : grupos[0];
      if (!grupo) { this.grupoActivo.set(null); return; }
      if (untracked(this.grupoActivo)?.id !== grupo.id) untracked(() => this.gestionarGrupo(grupo));
      // Mismo grupo con cifras nuevas (p. ej. tras invitar): el detalle toma la copia fresca de la lista.
      else untracked(() => this.grupoActivo.set(grupo));
    });
  }
  nuevoGrupo(): void { this.cancelarEdicion(); this.abrirHoja('Nuevo grupo', this.formularioGrupo); }
  abrirImportacion(): void {
    const grupo = this.grupoActivo();
    if (grupo) this.abrirImportacionDe(grupo);
  }
  private abrirImportacionDe(grupo: Grupo): void {
    this.limpiarImportacion();
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.importacionAbierta.set(true);
    this.abrirHoja(`Importar estudiantes a ${grupo.nombre}`, this.formularioImportacion);
  }
  /**
   * Abre una hoja lateral con una plantilla de este componente. Al cerrarse (botón, Esc o fondo) se sueltan los estados
   * que solo tenían sentido con ella: la edición a medias y el aviso de importación.
   */
  private abrirHoja(title: string, template: TemplateRef<unknown>): void {
    // Una hoja a la vez: la anterior se suelta antes (su cierre ya no toca los estados de la nueva).
    const previa = this.hoja;
    this.hoja = undefined;
    previa?.close();
    const hoja = this.dialog.sheet(GrupoHojaComponent, { side: 'end', data: { title, template }, origen: this.host.nativeElement });
    this.hoja = hoja;
    hoja.closed?.subscribe(() => {
      if (this.hoja !== hoja) return;
      this.hoja = undefined;
      this.importacionAbierta.set(false);
      if (this.editandoGrupo()) { this.editandoGrupo.set(null); this.resetGroupForm(); }
    });
  }
  cerrarHoja(): void { this.hoja?.close(); }
  archivoElegido(archivo: File | null): void { this.elegirArchivo(archivo); }

  private grupoService = inject(GrupoService);
  private casosApi = inject(CaseCatalogApi);
  private fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(UiDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);

  grupos = signal<Grupo[]>([]);
  grupoActivo = signal<Grupo | null>(null);
  grupoSeleccionado = signal<number | null>(null);
  editandoGrupo = signal<Grupo | null>(null);
  estudiantes = signal<GrupoEstudiante[]>([]);
  busquedaGrupo = signal('');
  busquedaEstudiante = signal('');
  casosDisponibles = signal<SimulationCaseSummary[]>([]);
  /** Los casos publicados ya respondieron (una cifra de 0 solo es verdad después de que respondan). */
  casosCargados = signal(false);
  /** Los casos publicados no se pudieron leer (la sección de asignaciones lo dice en vez de «no hay más casos»). */
  casosFallaron = signal(false);
  protected readonly casosEstado = computed<'loading' | 'ready' | 'failed'>(() => (this.casosFallaron() ? 'failed' : this.casosCargados() ? 'ready' : 'loading'));
  /** Cuántos casos tiene asignados el grupo abierto: lo dice la sección de asignaciones cuando ese grupo termina de cargar. */
  casosAsignadosTotal = signal<number | null>(null);
  mensajeEstudiante = signal('');
  importSpec = signal<GrupoImportSpec | null>(null);
  archivoImportacion = signal<File | null>(null);
  resultadoImportacion = signal<GrupoImportResult | null>(null);
  erroresImportacion = signal<GrupoImportError[]>([]);
  mensajeEsError = signal(false);
  loading = signal(true);
  detailLoading = signal(false);
  saving = signal(false);
  agregandoEstudiante = signal(false);
  importandoEstudiantes = signal(false);
  error = signal('');
  /** Pestaña abierta del detalle (se conserva al pasar de un grupo a otro). */
  pestana = signal<string | undefined>('estudiantes');
  readonly solicitudAsignar = signal(0);
  /** La hoja de importación está abierta: el aviso se lee dentro de ella y no se repite en el detalle. */
  importacionAbierta = signal(false);

  /** Del grupo abierto: quienes aceptaron (miembros) y quienes tienen la invitación pendiente. */
  protected readonly miembros = computed(() => this.estudiantes().filter(student => membershipOf(student) === 'ACTIVE'));
  protected readonly invitados = computed(() => this.estudiantes().filter(student => membershipOf(student) === 'INVITED'));
  protected readonly detalleConteo = computed(() => {
    // Mientras llegan los estudiantes se dicen las cifras que ya trae el grupo, no un «0» que luego cambia.
    const grupo = this.grupoActivo();
    const cargando = this.detailLoading() && !!grupo;
    const miembros = cargando ? grupo.totalEstudiantes : this.miembros().length;
    const invitados = cargando ? (grupo.totalInvitados ?? 0) : this.invitados().length;
    const partes = [`${miembros} ${miembros === 1 ? 'estudiante' : 'estudiantes'}`];
    if (invitados) partes.push(`${invitados} ${invitados === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}`);
    const casos = this.casosAsignadosTotal();
    if (casos !== null) partes.push(`${casos} ${casos === 1 ? 'caso asignado' : 'casos asignados'}`);
    return partes.join(' · ');
  });
  /** «Invitaciones · 2»: el conteo va en el nombre de la pestaña para no abrirla a ciegas. */
  protected readonly etiquetaInvitaciones = computed(() => {
    const n = this.invitados().length;
    return n ? `Invitaciones · ${n}` : 'Invitaciones';
  });
  /** «12 estudiantes · 1 invitación pendiente», con singular y plural. */
  protected resumenGrupo(grupo: Grupo): string {
    const n = grupo.totalEstudiantes;
    const m = grupo.totalInvitados ?? 0;
    const partes = [`${n} ${n === 1 ? 'estudiante' : 'estudiantes'}`];
    partes.push(`${m} ${m === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}`);
    // BORRADOR: texto pendiente de Psicología.
    if (grupo.resumenCasos) {
      const r = grupo.resumenCasos;
      partes.push(`${r.asignados} ${r.asignados === 1 ? 'caso asignado' : 'casos asignados'}`);
      if (r.oportunidades) partes.push(`${r.terminados} de ${r.oportunidades} casos terminados por estudiantes`);
      else if (r.asignados) partes.push('Aún sin estudiantes que puedan avanzar');
    }
    return partes.join(' · ');
  }
  protected verTodos(): void { void this.router.navigate(['/portal/grupos']); }
  protected readonly membershipBadge = membershipBadge;
  protected readonly studentName = studentName;
  protected readonly removeLabel = removeLabel;
  protected readonly canRemove = (student: GrupoEstudiante) => ['ACTIVE', 'INVITED'].includes(membershipOf(student));
  gruposFiltrados = computed(() => {
    const query = this.busquedaGrupo().trim().toLowerCase();
    if (!query) return this.grupos();
    return this.grupos().filter(grupo =>
      `${grupo.nombre} ${grupo.codigo}`.toLowerCase().includes(query)
    );
  });
  estudiantesFiltrados = computed(() => {
    const query = this.busquedaEstudiante().trim().toLowerCase();
    if (!query) return this.estudiantes();
    return this.estudiantes().filter(student =>
      `${student.nombre} ${student.apellido} ${student.email}`.toLowerCase().includes(query)
    );
  });

  /** Estado de la lista de grupos (esqueleto, error, primer uso o listo): una sola señal, de a uno. */
  readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.grupos().length === 0),
  });
  /**
   * Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia): la carga de la lista y
   * el resultado de las acciones del detalle (importar, agregar, quitar).
   */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando grupos…' : this.mensajeEstudiante()));

  /** Acciones del menú «Más acciones» del grupo abierto (invitar e importar tienen su botón en la pestaña). */
  protected readonly rowActions: UiMenuItem[] = [
    { value: 'copiar', label: 'Copiar código', icon: 'content_copy' },
    { value: 'editar', label: 'Editar', icon: 'edit' },
    { value: 'borrar', label: 'Borrar', icon: 'delete', tone: 'danger' },
  ];

  form = this.fb.group({ nombre: ['', Validators.required], codigo: ['', Validators.required] });
  estudianteForm = this.fb.group({ email: ['', [Validators.required, correoOUsuario]] });

  ngOnInit() {
    this.cargar();
    this.cargarCasos();
    this.grupoService.importSpec().subscribe({
      next: spec => this.importSpec.set(spec),
      error: () => this.importSpec.set({
        requiredColumns: ['nombre', 'apellido', 'email'],
        optionalColumns: [],
        columns: ['nombre', 'apellido', 'email'],
        templateFilename: 'plantilla_importacion_estudiantes_siep.xlsx',
        acceptedExtensions: ['.xlsx']
      })
    });
  }

  /**
   * Los casos publicados que el docente puede asignar. Se piden otra vez cada vez que abre «Casos asignados» (`silencioso`):
   * un caso que acaba de publicar en otra pantalla tiene que aparecer sin recargar la página. Un refresco silencioso que
   * falla conserva la lista que ya había; el primero que falla lo dice (con «Reintentar» junto al botón de asignar).
   */
  cargarCasos(silencioso = false): void {
    if (!silencioso) { this.casosFallaron.set(false); this.casosCargados.set(false); }
    this.casosApi.listPublished().subscribe({
      next: cases => {
        this.casosDisponibles.set(cases);
        this.casosCargados.set(true);
        this.casosFallaron.set(false);
      },
      error: () => {
        if (silencioso && this.casosCargados()) return;
        this.casosDisponibles.set([]);
        this.casosFallaron.set(true);
      }
    });
  }

  /** Al abrir «Casos asignados» se vuelve a leer lo publicado (el docente pudo publicar un caso mientras tanto). */
  alCambiarPestana(valor: string | undefined): void {
    if (valor === 'casos') this.cargarCasos(true);
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  /**
   * Carga los grupos. Con `silencioso` (tras agregar un estudiante) no vuelve a mostrar el esqueleto: la lista sigue
   * a la vista y solo cambian sus cifras.
   */
  cargar(silencioso = false) {
    if (!silencioso) this.loading.set(true);
    this.error.set('');
    this.grupoService.listar().subscribe({
      next: g => {
        this.grupos.set(g);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        // Un refresco silencioso que falla no tira una lista válida: se conserva y se avisa.
        if (silencioso) {
          this.notify.warning('No pudimos actualizar la lista de grupos.');
          return;
        }
        this.error.set('No fue posible cargar la información.');
      }
    });
  }

  /** ↑/↓, Inicio y Fin recorren la lista de grupos (abrir sigue siendo Intro sobre el enlace). */
  protected recorrerGrupos(evento: KeyboardEvent): void {
    moverFocoEnLista(evento, '.gl-groups', '.gl-group');
  }

  limpiarBusqueda() {
    this.busquedaGrupo.set('');
  }

  /**
   * Reinicia los valores y lo «tocado» del formulario del grupo. El estado «enviado» no hace falta reiniciarlo: el
   * formulario vive en una hoja y cada vez que se abre nace uno nuevo (su directiva empieza sin enviar).
   */
  private resetGroupForm(value?: { nombre: string | null; codigo: string | null }): void {
    this.form.reset(value);
  }

  /**
   * true (y marca y enfoca) si el formulario del grupo tiene errores. El formulario está en una hoja, fuera de este
   * componente en el DOM: la plantilla pasa su elemento (un `@ViewChild` sobre una plantilla que se pinta en otro sitio
   * no se actualiza hasta que este componente vuelva a revisarse).
   */
  private invalidGroupForm(formEl?: HTMLElement): boolean {
    if (!this.form.invalid) return false;
    this.form.markAllAsTouched();
    focusFirstInvalid(formEl ?? this.host.nativeElement);
    return true;
  }

  crear(formEl?: HTMLElement) {
    if (this.saving() || this.invalidGroupForm(formEl)) return;
    const { nombre, codigo } = this.form.value;
    this.saving.set(true);
    this.grupoService.crear(nombre!, codigo!).subscribe({
      next: g => {
        this.grupos.update(list => [...list, g]);
        this.resetGroupForm();
        this.saving.set(false);
        this.hoja?.close();
        this.notify.success('Grupo creado.');
      },
      error: (err: unknown) => {
        const text = mensajeDeError(err, 'No fue posible crear el grupo.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
    });
  }

  editarGrupo(grupo: Grupo) {
    this.editandoGrupo.set(grupo);
    this.resetGroupForm({ nombre: grupo.nombre, codigo: grupo.codigo });
    this.error.set('');
    if (this.formularioGrupo) this.abrirHoja('Editar grupo', this.formularioGrupo);
  }

  cancelarEdicion() {
    this.editandoGrupo.set(null);
    this.resetGroupForm();
    this.hoja?.close();
  }

  actualizarGrupo(formEl?: HTMLElement) {
    const grupo = this.editandoGrupo();
    if (!grupo || this.saving() || this.invalidGroupForm(formEl)) return;
    const { nombre, codigo } = this.form.value;
    this.saving.set(true);
    this.error.set('');
    this.grupoService.actualizar(grupo.id, { nombre: nombre!, codigo: codigo! }).subscribe({
      next: actualizado => {
        this.grupos.update(list => list.map(g => g.id === actualizado.id ? actualizado : g));
        if (this.grupoActivo()?.id === actualizado.id) this.grupoActivo.set(actualizado);
        this.cancelarEdicion();
        this.saving.set(false);
        this.hoja?.close();
        this.notify.success('Grupo actualizado.');
      },
      error: (err: unknown) => {
        const text = err instanceof HttpErrorResponse && [400, 404].includes(err.status)
          ? mapGrupoError(err, 'No fue posible actualizar el grupo.') : mensajeDeError(err, 'No fue posible actualizar el grupo.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
    });
  }

  /** Lo que se elige en el menú de la fila de un grupo. */
  accionDeFila(grupo: Grupo, accion: string | undefined): void {
    switch (accion) {
      case 'agregar': this.agregarEstudiante(grupo); break;
      case 'copiar': this.copiarCodigo(grupo); break;
      case 'editar': this.editarGrupo(grupo); break;
      case 'borrar': void this.eliminarGrupo(grupo); break;
    }
  }

  /** true mientras hay un diálogo de confirmación abierto: un segundo gesto no abre otro ni repite la acción. */
  private confirmando = false;

  private async confirmar(options: UiConfirmOptions): Promise<boolean> {
    if (this.confirmando) return false;
    this.confirmando = true;
    try {
      return await this.dialog.confirm(options);
    } finally {
      this.confirmando = false;
    }
  }

  async eliminarGrupo(grupo: Grupo): Promise<void> {
    const confirmado = await this.confirmar({
      title: 'Borrar grupo',
      message: `¿Borrar el grupo "${grupo.nombre}"? Se quitarán sus estudiantes y casos asignados. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar',
      tone: 'danger',
    });
    if (confirmado) this.borrarGrupo(grupo);
  }

  private borrarGrupo(grupo: Grupo) {
    this.error.set('');
    this.grupoService.eliminar(grupo.id).subscribe({
      next: () => {
        this.grupos.update(list => list.filter(g => g.id !== grupo.id));
        if (this.grupoActivo()?.id === grupo.id) this.grupoActivo.set(null);
        if (this.editandoGrupo()?.id === grupo.id) this.cancelarEdicion();
        // La ruta del grupo borrado ya no lleva a nada: se vuelve a la lista.
        if (this.grupoId() === String(grupo.id)) this.verTodos();
        this.notify.success('Grupo eliminado.');
      },
      error: (err: unknown) => {
        const text = err instanceof HttpErrorResponse && [400, 404].includes(err.status)
          ? mapGrupoError(err, 'No fue posible borrar el grupo.') : mensajeDeError(err, 'No fue posible borrar el grupo.');
        if (text) this.notify.error(text);
      }
    });
  }

  async quitarEstudiante(grupo: Grupo, student: GrupoEstudiante): Promise<void> {
    const confirmado = await this.confirmar({
      // E2-10: a un invitado no se le quita: se le cancela la invitación (y de él solo se conoce el correo).
      ...(membershipOf(student) === 'INVITED'
        ? { title: 'Cancelar invitación', message: `¿Cancelar la invitación a ${student.email}?`, confirmLabel: 'Cancelar invitación' }
        : { title: 'Quitar estudiante', message: `¿Quitar a ${studentName(student)} del grupo?`, confirmLabel: 'Quitar' }),
    });
    if (confirmado) this.retirarEstudiante(grupo, student);
  }

  private retirarEstudiante(grupo: Grupo, student: GrupoEstudiante) {
    this.grupoService.quitarEstudiante(grupo.id, student.id).subscribe({
      next: actualizado => {
        this.estudiantes.update(list => list.filter(s => s.id !== student.id));
        this.grupos.update(list => list.map(g => g.id === actualizado.id ? actualizado : g));
        if (this.grupoActivo()?.id === actualizado.id) this.grupoActivo.set(actualizado);
        this.notify.success(membershipOf(student) === 'INVITED' ? 'Invitación cancelada.' : 'Estudiante retirado del grupo.');
      },
      error: (err: unknown) => {
        const text = err instanceof HttpErrorResponse && [400, 404].includes(err.status)
          ? mapGrupoError(err, 'No fue posible quitar al estudiante.') : mensajeDeError(err, 'No fue posible quitar al estudiante.');
        if (text) this.notify.error(text);
      }
    });
  }

  gestionarGrupo(grupo: Grupo) {
    this.abrirGrupo(grupo);
    this.grupoSeleccionado.set(null);
    this.busquedaEstudiante.set('');
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.limpiarImportacion();
    this.cargarDetalle(grupo.id);

  }

  irAAsignar(): void {
    this.pestana.set('casos');
    this.cargarCasos(true);
    this.solicitudAsignar.update(n => n + 1);
  }

  agregarEstudiante(grupo: Grupo) {
    this.pestana.set('estudiantes');
    this.abrirGrupo(grupo);
    this.grupoSeleccionado.set(grupo.id);
    this.busquedaEstudiante.set('');
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.estudianteForm.reset();
    this.limpiarImportacion();
    this.cargarDetalle(grupo.id);
    this.enfocar('.gl-add input');
  }

  /** Abre el detalle de un grupo; el conteo de casos asignados del grupo anterior no se arrastra al nuevo. */
  private abrirGrupo(grupo: Grupo) {
    if (this.grupoActivo()?.id !== grupo.id) {
      this.casosAsignadosTotal.set(null);
      this.solicitudAsignar.set(0);
    }
    this.grupoActivo.set(grupo);
  }

  /** Lleva el foco al destino de lo que el usuario acaba de abrir (el detalle queda debajo de la tabla). */
  private enfocar(selector: string): void {
    afterNextRender(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (!target) return;
      if (!target.matches('input, button, a, select, textarea')) target.setAttribute('tabindex', '-1');
      target.focus();
      target.scrollIntoView?.({ block: 'nearest' });
    }, { injector: this.injector });
  }

  copiarCodigo(grupo: Grupo): void {
    const done = () => {
      this.notify.success(`Código ${grupo.codigo} copiado al portapapeles.`);
    };
    const fail = () => {
      this.notify.info(`Código del grupo: ${grupo.codigo}`);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(grupo.codigo).then(done).catch(fail);
      return;
    }
    fail();
  }

  cargarDetalle(grupoId: number) {
    this.estudiantes.set([]);
    this.detailLoading.set(true);
    this.grupoService.listarEstudiantes(grupoId).subscribe({
      next: estudiantes => {
        if (this.grupoActivo()?.id !== grupoId) return;
        this.estudiantes.set(estudiantes);
        this.detailLoading.set(false);
      },
      error: () => {
        if (this.grupoActivo()?.id !== grupoId) return;
        this.estudiantes.set([]);
        this.detailLoading.set(false);
        this.mensajeEstudiante.set('No fue posible cargar los estudiantes.');
        this.mensajeEsError.set(true);
      }
    });
  }

  confirmarAgregar() {
    if (this.estudianteForm.invalid || this.agregandoEstudiante()) {
      if (this.estudianteForm.invalid) {
        this.estudianteForm.markAllAsTouched();
        this.mensajeEstudiante.set('Revisa el correo o el usuario del estudiante.');
        this.mensajeEsError.set(true);
        focusFirstInvalid(this.host.nativeElement.querySelector<HTMLElement>('.gl-add') ?? this.host.nativeElement);
      }
      return;
    }
    const { email } = this.estudianteForm.value;
    const destino = this.grupoSeleccionado()!;
    this.agregandoEstudiante.set(true);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.grupoService.agregarEstudiante(destino, email!.trim().toLowerCase()).subscribe({
      next: ({ grupo, message }) => {
        // E2-10: el docente invita; la persona entra al grupo cuando acepta (su bandeja de invitaciones).
        // D-14: el servidor responde lo mismo exista o no la cuenta, así que el texto tampoco afirma que se envió.
        this.mensajeEstudiante.set(message?.trim() || 'Si el correo o el usuario corresponde a un estudiante registrado, recibirá la invitación.');
        this.notify.success(this.mensajeEstudiante());
        this.grupos.update(list => list.map(g => g.id === grupo.id ? { ...g, ...grupo } : g));
        if (this.grupoActivo()?.id === grupo.id) this.grupoActivo.set(grupo);
        this.mensajeEsError.set(false);
        this.estudianteForm.reset();
        this.agregandoEstudiante.set(false);
        this.cargar(true);
        // Si ya se cambió de grupo mientras respondía el servidor, no se recarga el detalle de otro.
        if (this.grupoActivo()?.id === destino) this.cargarDetalle(destino);
      },
      error: (err: HttpErrorResponse) => {
        this.mensajeEstudiante.set(mapAgregarEstudianteError(err));
        this.mensajeEsError.set(true);
        this.agregandoEstudiante.set(false);
      }
    });
  }

  importFileName(): string {
    return this.archivoImportacion()?.name ?? '';
  }

  columnasRequeridasTexto(): string {
    return this.importSpec()?.requiredColumns.join(', ') || 'nombre, apellido, email';
  }

  /** Columnas opcionales de la plantilla del servidor; vacío si no hay (E2-9 retiró `password`). */
  columnasOpcionalesTexto(): string {
    return this.importSpec()?.optionalColumns.join(', ') ?? '';
  }

  /**
   * Qué pasa con las cuentas nuevas de la importación (gancho de RN-10; ÚNICO sitio donde la pantalla lo dice). Desde
   * E2-9 la importación no fija contraseñas: las cuentas nacen pendientes, el administrador las aprueba y cada
   * estudiante recibe por correo su contraseña temporal. null si no hubo cuentas nuevas.
   */
  cuentasNuevasNota(result: GrupoImportResult): string | null {
    const pending = result.pendingApproval ?? 0;
    if (!pending) return null;
    return pending === 1
      ? 'La cuenta nueva queda pendiente de aprobación: cuando el administrador la apruebe, la persona recibirá por correo su contraseña temporal.'
      : `Las ${pending} cuentas nuevas quedan pendientes de aprobación: cuando el administrador las apruebe, cada persona recibirá por correo su contraseña temporal.`;
  }

  /** Columnas del archivo que el servidor leyó y no usa (p. ej. `password` de una plantilla vieja). */
  columnasIgnoradasNota(result: GrupoImportResult): string | null {
    const columns = result.ignoredColumns ?? [];
    if (!columns.length) return null;
    const names = columns.map(column => `«${column}»`).join(', ');
    return columns.length === 1
      ? `Se ignoró la columna ${names}: ya no se usa al importar.`
      : `Se ignoraron las columnas ${names}: ya no se usan al importar.`;
  }

  descargarPlantilla(): void {
    this.grupoService.descargarPlantillaImportacion().subscribe({
      next: response => {
        const blob = response.body;
        if (!blob) return;
        const filename = this.importSpec()?.templateFilename || 'plantilla_importacion_estudiantes_siep.xlsx';
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.mensajeEstudiante.set('No fue posible descargar la plantilla Excel.');
        this.mensajeEsError.set(true);
      }
    });
  }

  /** Acepta el archivo si es .xlsx; si no, lo rechaza con un mensaje. true si quedó elegido (o se quitó). */
  private elegirArchivo(file: File | null): boolean {
    this.archivoImportacion.set(file);
    this.resultadoImportacion.set(null);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.erroresImportacion.set([]);
    if (file && !/\.xlsx$/i.test(file.name)) {
      this.mensajeEstudiante.set('Selecciona un archivo .xlsx.');
      this.mensajeEsError.set(true);
      this.archivoImportacion.set(null);
      return false;
    }
    return true;
  }

  importarEstudiantes(): void {
    const grupo = this.grupoActivo();
    const file = this.archivoImportacion();
    if (!grupo || !file || this.importandoEstudiantes()) return;

    this.importandoEstudiantes.set(true);
    this.mensajeEstudiante.set('');
    this.mensajeEsError.set(false);
    this.grupoService.importarEstudiantes(grupo.id, file).subscribe({
      next: result => {
        this.importandoEstudiantes.set(false);
        this.grupos.update(list => list.map(g => g.id === grupo.id ? result.grupo : g));
        if (this.grupoActivo()?.id !== grupo.id) return;
        this.resultadoImportacion.set(result);
        this.erroresImportacion.set(result.errors);
        this.archivoImportacion.set(null);
        this.grupoActivo.set(result.grupo);
        this.cargarDetalle(grupo.id);
        const warnings = result.errors.length ? ` ${result.errors.length} fila(s) con observaciones.` : '';
        this.mensajeEstudiante.set(
          `Importación completada: ${result.assigned} invitados, ${result.created} cuentas nuevas, ${result.existing} ya existían.${warnings}`
        );
        this.mensajeEsError.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.importandoEstudiantes.set(false);
        const result = err.error?.data as GrupoImportResult | undefined;
        if (result?.grupo) this.grupos.update(list => list.map(g => g.id === grupo.id ? result.grupo : g));
        if (this.grupoActivo()?.id !== grupo.id) return;
        if (result) {
          this.resultadoImportacion.set(result);
          this.erroresImportacion.set(result.errors ?? []);
        }
        this.mensajeEstudiante.set(this.mapImportError(err));
        this.mensajeEsError.set(true);
      }
    });
  }

  private mapImportError(err: HttpErrorResponse): string {
    if (err.status === 400 || err.status === 404 || err.status === 403) {
      return mapGrupoError(err, 'No fue posible importar el archivo. Verifica columnas nombre, apellido y email.');
    }
    const body = err.error;
    if (typeof body?.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    return 'No fue posible importar el archivo. Verifica columnas nombre, apellido y email.';
  }

  /** Vuelve a la zona de archivo para cargar otra lista (también al abrir la hoja). */
  limpiarImportacion(): void {
    this.archivoImportacion.set(null);
    this.resultadoImportacion.set(null);
    this.erroresImportacion.set([]);
  }
}
