import { ApproveTeachersDialogComponent } from './approve-teachers-dialog.component';
import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, from, of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { UiSegmentado } from '../../shared/ui/segmentado/ui-segmentado';
import { UiFiltros } from '../../shared/ui/filtros/ui-filtros';
import { catchError, concatMap, map, reduce, toArray } from 'rxjs/operators';
import { APPROVE_BATCH_SIZE, AdminUser, ApproveUsersResult, UserAdminService, UserRole } from '../../core/api/user-admin.service';
import { PASSWORD_MIN_LENGTH } from '../../core/auth/password-change';
import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { mensajeDeCarga, mensajeDeError } from '../../core/api/mensaje-de-error.util';
import { NavBadgesService, pendientesDeUsuarios } from '../../shared/layout/nav-badges.service';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { roleLabel } from '../../shared/ui/labels';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiSection } from '../../shared/ui/section/ui-section';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableEmpty, UiTableError, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { UserFormSheetComponent, UserFormSheetData } from './user-form-sheet.component';

const NO_APPROVALS: ApproveUsersResult = { approved: 0, approvedIds: [], skipped: [], emailed: 0, failed: [] };

const accounts = (count: number) => (count === 1 ? '1 cuenta' : `${count} cuentas`);

/** Resumen de una aprobación (E2-9): lo que se aprobó, a quién no le llegó el correo y lo que ya no estaba pendiente. */
export function approvalSummary(result: ApproveUsersResult): string {
  const parts: string[] = [];
  if (result.approved) {
    parts.push(`${result.approved === 1 ? 'Se aprobó' : 'Se aprobaron'} ${accounts(result.approved)}: cada persona recibió por correo su contraseña temporal.`);
  }
  if (result.failed.length) {
    parts.push(`No se pudo enviar el correo a ${accounts(result.failed.length)}: ${result.failed.length === 1 ? 'sigue pendiente' : 'siguen pendientes'}.`);
  }
  if (result.skipped.length) {
    parts.push(`${accounts(result.skipped.length)} ya no ${result.skipped.length === 1 ? 'estaba pendiente' : 'estaban pendientes'}.`);
  }
  return parts.join(' ') || 'No había cuentas pendientes que aprobar.';
}

interface UserFormValue {
  nombre: string;
  apellido: string;
  email: string;
  role: UserRole;
  password: string;
}

/**
 * Pantalla Usuarios (plan visual F7-6): una tabla con el error separado del vacío, un botón de editar con ayuda y un
 * menú por fila, el formulario en una hoja lateral (`UiDialog.sheet`) y las solicitudes de acceso con su error a la
 * vista (antes un fallo se tragaba y parecía «no hay solicitudes»). Activar o desactivar confirma con el diálogo de la
 * biblioteca.
 */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    ReactiveFormsModule, UiSegmentado, UiFiltros,
    UiBadge, UiButton, UiCard, UiIconButton, UiMenu, UiCabeceraIlustrada, UiSection,
    UiEmptyState, UiErrorState, UiTable, UiTableEmpty, UiTableError, UiTableRow, UiTableTable,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  // Eager: los errores de los campos de la hoja salen de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UsersComponent implements OnInit {
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly service = inject(UserAdminService);
  private readonly accessRequestsService = inject(AccessRequestAdminService);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly badges = inject(NavBadgesService);
  private readonly dialog = inject(UiDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** La hoja abierta con el formulario (null si no hay). */
  private sheet: DialogRef<void, UserFormSheetComponent> | null = null;
  /** true mientras hay una confirmación abierta: un segundo gesto no abre otra ni repite la acción. */
  private confirmando = false;

  private solicitudEnFormulario: number | null = null;
  readonly vista = signal('cuentas');
  readonly busqueda = signal('');
  readonly rol = signal('todos');
  readonly estadoFiltro = signal('todos');
  readonly orden = signal('nombre');
  readonly seleccion = signal<number[]>([]);
  readonly seleccionPendientes = signal<number[]>([]);
  readonly resumen = computed(() => `${this.resultadoLote()} ${this.actionStatus()}`.trim());
  readonly resultadoLote = signal('');
  readonly opcionesRol = [
    { valor: 'todos', etiqueta: 'Todos' }, { valor: 'ESTUDIANTE', etiqueta: 'Estudiantes' },
    { valor: 'PROFESOR', etiqueta: 'Docentes' }, { valor: 'ADMIN', etiqueta: 'Administradores' },
  ];
  /**
   * Las cifras de pendientes, de UNA sola fuente: salen de las mismas listas que pintan las pestañas, y de ellas sale
   * también la insignia del menú lateral (`fijarUsuarios`). Una fuente que no se pudo leer es `null`, no 0: un cero falso
   * diría «no hay nada por atender» justo cuando no se sabe.
   */
  readonly pendientes = computed(() => {
    const solicitudes = this.solicitudesCargadas() && !this.requestsError() ? this.accessRequests().length : null;
    const cuentas = this.usuariosCargados() && !this.error() ? this.pendingUsers().length : null;
    return { solicitudes, cuentas, total: pendientesDeUsuarios(solicitudes, cuentas) };
  });
  readonly vistas = computed(() => [
    { valor: 'cuentas', etiqueta: 'Cuentas', cuenta: this.usuariosCargados() && !this.error() ? this.users().length : null },
    { valor: 'solicitudes', etiqueta: 'Solicitudes', cuenta: this.pendientes().solicitudes },
    { valor: 'por-aprobar', etiqueta: 'Por aprobar', cuenta: this.pendientes().cuentas },
  ]);
  /** El resumen de arriba: cuántos pendientes hay (el mismo número del menú) y de qué son; o por qué no se sabe. */
  readonly resumenPendientes = computed<{ texto: string; tono: 'atencion' | 'aviso' | 'ok' } | null>(() => {
    const { solicitudes, cuentas, total } = this.pendientes();
    if (!this.solicitudesCargadas() && !this.usuariosCargados() && !this.requestsError() && !this.error()) return null;
    if (total === null) {
      // Solo se dice lo que falló de verdad; si una fuente aún carga, no hay nada que decir todavía.
      const fallas = [this.requestsError() ? 'las solicitudes de acceso' : '', this.error() ? 'las cuentas' : ''].filter(Boolean);
      return fallas.length ? { texto: `No pudimos contar los pendientes porque no cargaron ${fallas.join(' ni ')}. Reintenta en cada sección.`, tono: 'aviso' } : null;
    }
    if (!total) return { texto: 'Todo al día: no hay solicitudes de acceso ni cuentas por aprobar.', tono: 'ok' };
    const partes = [
      solicitudes ? `${solicitudes} ${solicitudes === 1 ? 'solicitud de acceso por revisar' : 'solicitudes de acceso por revisar'}` : '',
      cuentas ? `${cuentas} ${cuentas === 1 ? 'cuenta por aprobar' : 'cuentas por aprobar'}` : '',
    ].filter(Boolean);
    return { texto: `${total === 1 ? '1 pendiente' : `${total} pendientes`}: ${partes.join(' y ')}.`, tono: 'atencion' };
  });
  readonly filtrados = computed(() => {
    const q = this.busqueda().trim().toLocaleLowerCase('es');
    const estado = (u: AdminUser) => u.pendingApproval ? 'pendiente' : u.activo ? 'activa' : 'inactiva';
    return this.users().filter(u => (!q || `${u.nombre} ${u.apellido} ${u.email}`.toLocaleLowerCase('es').includes(q)) &&
      (this.rol() === 'todos' || u.role === this.rol()) &&
      (this.estadoFiltro() === 'todos' || estado(u) === this.estadoFiltro()))
      .sort((a, b) => (this.orden() === 'rol' ? roleLabel(a.role).localeCompare(roleLabel(b.role), 'es') :
        this.orden() === 'estado' ? estado(a).localeCompare(estado(b), 'es') : 0) ||
        `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'));
  });
  readonly limiteVisible = signal(25);
  readonly usuariosVisibles = computed(() => this.filtrados().slice(0, this.limiteVisible()));
  readonly todosVisibles = computed(() => this.usuariosVisibles().length > 0 && this.usuariosVisibles().every(u => this.seleccion().includes(u.id)));
  readonly algunosVisibles = computed(() => this.usuariosVisibles().some(u => this.seleccion().includes(u.id)) && !this.todosVisibles());

  constructor() {
    // La insignia de «Usuarios» en el menú dice lo mismo que el resumen y las pestañas de esta pantalla: la misma cifra.
    effect(() => {
      const { solicitudes, cuentas } = this.pendientes();
      // Hasta que las dos fuentes responden (con una lista o con un error) no se toca la insignia: no parpadea.
      if (!this.solicitudesCargadas() || !this.usuariosCargados()) return;
      untracked(() => this.badges.fijarUsuarios(solicitudes, cuentas));
    });
    this.route?.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const valor = params.get('vista');
      this.vista.set(valor === 'solicitudes' || valor === 'por-aprobar' ? valor : 'cuentas');
    });
  }

  cambiarVista(valor: string): void {
    this.vista.set(valor);
    void this.router?.navigate([], { relativeTo: this.route, queryParams: { vista: valor }, queryParamsHandling: 'merge' });
  }
  limpiarFiltros(): void { this.busqueda.set(''); this.rol.set('todos'); this.estadoFiltro.set('todos'); this.orden.set('nombre'); }
  seleccionar(id: number, marcado: boolean, pendientes = false): void {
    const destino = pendientes ? this.seleccionPendientes : this.seleccion;
    destino.update(ids => marcado ? [...new Set([...ids, id])] : ids.filter(x => x !== id));
  }
  seleccionarVisibles(marcado: boolean, pendientes = false): void {
    const lista = pendientes ? this.pendingUsers() : this.usuariosVisibles();
    for (const usuario of lista) this.seleccionar(usuario.id, marcado, pendientes);
  }

  async cambiarLote(activo: boolean): Promise<void> {
    const elegidos = this.users().filter(u => this.seleccion().includes(u.id));
    const propia = elegidos.filter(u => !activo && u.id === this.auth?.currentUser()?.id);
    const mismo = elegidos.filter(u => !propia.includes(u) && (u.activo === activo || !!u.pendingApproval));
    const admins = this.users().filter(u => u.role === 'ADMIN' && u.activo && !u.pendingApproval);
    // Se conserva al menos un administrador; el servidor resuelve cambios concurrentes.
    const candidatos = elegidos.filter(u => !propia.includes(u) && !mismo.includes(u));
    const adminsElegidos = candidatos.filter(u => !activo && u.role === 'ADMIN' && u.activo);
    const ultimo = admins.length && adminsElegidos.length >= admins.length ? adminsElegidos.slice(-1) : [];
    const ejecutar = candidatos.filter(u => !ultimo.includes(u));
    const nombres = (lista: AdminUser[]) => lista.map(u => `${u.nombre} ${u.apellido}`).join(', ');
    const verbo = activo ? 'activarán' : 'desactivarán';
    const aplicadas = ejecutar.length
      ? `Se ${verbo} ${ejecutar.length}: ${nombres(ejecutar.slice(0, 5))}${ejecutar.length > 5 ? ` y ${ejecutar.length - 5} más` : ''}.`
      : 'No hay ninguna cuenta a la que se pueda aplicar el cambio.';
    // Solo se nombran los motivos que sí aparecen: una lista de «ninguna» es ruido que el administrador tiene que leer.
    const omitidas = [
      propia.length ? `cuenta propia: ${nombres(propia)}` : '',
      mismo.length ? `ya en ese estado o pendiente de aprobación: ${nombres(mismo)}` : '',
      ultimo.length ? `último administrador activo: ${nombres(ultimo)}` : '',
    ].filter(Boolean);
    const confirmado = await this.confirmOnce({ title: activo ? 'Activar cuentas' : 'Desactivar cuentas',
      message: `${aplicadas}${omitidas.length ? ` Se omiten ${propia.length + mismo.length + ultimo.length} (${omitidas.join('; ')}).` : ''}` +
        (!activo && ejecutar.length ? ' Se cierran sus sesiones. Puedes reactivarlas cuando quieras.' : ''),
      confirmLabel: `${activo ? 'Activar' : 'Desactivar'} ${accounts(ejecutar.length)}` });
    if (!confirmado || !ejecutar.length) return;
    this.saving.set(true);
    // Un solo resultado a la vista: el de la acción en curso, no el de otra anterior.
    this.actionStatus.set('');
    this.resultadoLote.set('');
    from(ejecutar).pipe(concatMap(usuario => this.service.updateStatus(usuario.id, activo).pipe(
      map(saved => ({ usuario, saved, error: '' })),
      catchError((err: unknown) => of({ usuario, saved: null, error: mensajeDeError(err, 'No fue posible actualizar la cuenta.') || 'No fue posible actualizar la cuenta.' }))
    )), reduce((res, item) => [...res, item], [] as { usuario: AdminUser; saved: AdminUser | null; error: string }[])).subscribe({
      next: resultados => {
        for (const item of resultados) if (item.saved) this.users.update(users => users.map(u => u.id === item.saved!.id ? item.saved! : u));
        const fallos = resultados.filter(item => !item.saved);
        this.resultadoLote.set(`${resultados.length - fallos.length} ${activo ? 'activadas' : 'desactivadas'}. ${fallos.length} no se pudieron actualizar.${fallos.map(item => ` ${item.usuario.nombre} ${item.usuario.apellido}: ${item.error}`).join('')}`);
        this.seleccion.set(fallos.map(item => item.usuario.id));
      }, complete: () => this.saving.set(false),
    });
  }
  async aprobarSeleccion(): Promise<void> {
    const ids = this.pendingUsers().filter(u => this.seleccionPendientes().includes(u.id)).map(u => u.id);
    if (!ids.length) return;
    const decision = await this.confirmarAprobacion(ids);
    if (decision !== undefined) { this.seleccionPendientes.set([]); this.approveIds(ids, decision); }
  }

  readonly roles: UserRole[] = ['ADMIN', 'PROFESOR', 'ESTUDIANTE'];
  readonly roleLabel = roleLabel;
  /** Por qué las acciones sobre cuentas esperan: se dice junto al botón apagado (nunca un botón apagado sin causa). */
  readonly esperaPorCambio = computed(() => (this.saving() ? 'Hay un cambio en curso: espera un momento.' : null));
  /** Por qué «Aprobar» en lote todavía no se puede pulsar. */
  readonly motivoLote = computed(() => (this.esperaPorCambio() ?? (this.seleccionPendientes().length ? null : 'Marca al menos una cuenta de la lista para aprobarlas juntas.')));
  readonly accounts = accounts;
  readonly users = signal<AdminUser[]>([]);
  readonly accessRequests = signal<AccessRequest[]>([]);
  /** Las solicitudes ya respondieron (con una lista o con un error): antes de eso no hay cifra que decir. */
  readonly solicitudesCargadas = signal(false);
  private readonly usuariosCargados = signal(false);
  /** Las solicitudes no pudieron cargarse (distinto de «no hay solicitudes»). */
  readonly requestsError = signal(false);
  /** El texto con que se dice por qué no cargaron las solicitudes (y qué hacer). */
  readonly requestsErrorTexto = signal('No pudimos cargar las solicitudes de acceso. Inténtalo de nuevo.');
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  /** El fallo de la CARGA de la lista (solo `load()` lo toca: abrir un formulario o guardar no lo borra). */
  readonly error = signal('');
  readonly message = signal('');

  /** Estado de la tabla (esqueleto, error con «Reintentar», primer uso o lista): una sola señal, de a uno. */
  readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.users().length === 0),
  });
  /** El resultado de la última acción sobre varias cuentas (aprobar), para la región de estado. */
  readonly actionStatus = signal('');
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando usuarios…' : this.actionStatus()));
  /** E2-9: cuentas creadas por una importación que esperan la aprobación del administrador. */
  readonly pendingUsers = computed(() => this.users().filter(user => user.pendingApproval));
  protected readonly pendingText = computed(() => {
    const count = this.pendingUsers().length;
    return `${count === 1 ? 'Hay 1 cuenta' : `Hay ${count} cuentas`} de estudiantes importados esperando tu aprobación. ` +
      'Al aprobarlas, cada persona recibe por correo una contraseña temporal que deberá cambiar al entrar.';
  });

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['ESTUDIANTE' as UserRole, Validators.required],
    password: ['']
  });

  statusConfirmMessage(user: AdminUser): string {
    return user.activo
      ? `¿Desactivar a ${user.nombre} ${user.apellido}? No podrá iniciar sesión hasta reactivarlo.`
      : `¿Activar a ${user.nombre} ${user.apellido}?`;
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  /**
   * Reinicia valores y marca los campos como no tocados: un formulario recién abierto no hereda los errores del envío
   * fallido anterior (los errores de la hoja salen de `touched`; cada apertura trae además su propia directiva).
   */
  private resetUserForm(value: UserFormValue): void {
    this.form.reset(value);
  }

  /** Al crear, la contraseña es obligatoria; al editar, vacía significa «no cambiarla». */
  private setPasswordRules(creating: boolean): void {
    const password = this.form.controls.password;
    // E2-9: el servidor exige 10 caracteres (antes la interfaz pedía 8 y el servidor rechazaba lo que ella aceptaba).
    const min = Validators.minLength(PASSWORD_MIN_LENGTH);
    password.setValidators(creating ? [Validators.required, min] : [min]);
    password.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit() {
    this.setPasswordRules(true);
    this.load();
    this.loadAccessRequests();
  }

  loadAccessRequests() {
    this.requestsError.set(false);
    this.accessRequestsService.listPending().subscribe({
      next: requests => {
        this.accessRequests.set(requests);
        this.solicitudesCargadas.set(true);
      },
      error: (err: { status?: number } | null) => {
        this.accessRequests.set([]);
        this.requestsErrorTexto.set(mensajeDeCarga(err?.status, 'No pudimos cargar las solicitudes de acceso.'));
        this.requestsError.set(true);
        this.solicitudesCargadas.set(true);
      },
    });
  }

  attendRequest(request: AccessRequest) {
    this.solicitudEnFormulario = request.id;
    this.selectedUser.set(null);
    this.resetUserForm({
      nombre: request.nombre,
      apellido: request.apellido,
      email: request.email,
      role: request.rol,
      password: '',
    });
    this.setPasswordRules(true);
    this.message.set(`Solicitud de ${request.nombre} ${request.apellido} lista para crear usuario.`);
    this.openForm();
  }

  dismissRequest(request: AccessRequest) {
    if (this.saving()) return;
    this.saving.set(true);
    this.accessRequestsService.updateStatus(request.id, 'DISMISSED').subscribe({
      next: () => {
        this.accessRequests.update(items => items.filter(item => item.id !== request.id));
        this.notify.success('Solicitud descartada.');
        this.saving.set(false);
      },
      error: (err: unknown) => {
        const text = mensajeDeError(err, 'No fue posible actualizar la solicitud.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      },
    });
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Carga la lista. Con `silencioso` (tras aprobar) la tabla sigue a la vista y solo cambian sus filas. */
  load(silencioso = false) {
    if (!silencioso) this.loading.set(true);
    this.error.set('');
    this.service.list().subscribe({
      next: users => {
        this.users.set(users);
        this.usuariosCargados.set(true);
        this.loading.set(false);
      },
      error: (err: { status?: number } | null) => {
        this.loading.set(false);
        // Un refresco silencioso que falla no tira una lista válida: se conserva y se avisa.
        if (silencioso) {
          this.notify.warning('No pudimos actualizar la lista de usuarios.');
          return;
        }
        this.usuariosCargados.set(true);
        this.error.set(mensajeDeCarga(err?.status, 'No pudimos cargar los usuarios.'));
      }
    });
  }

  newUser() {
    this.solicitudEnFormulario = null;
    this.selectedUser.set(null);
    this.resetUserForm({
      nombre: '',
      apellido: '',
      email: '',
      role: 'ESTUDIANTE',
      password: ''
    });
    this.setPasswordRules(true);
    this.message.set('');
    this.openForm();
  }

  editUser(user: AdminUser) {
    this.solicitudEnFormulario = null;
    this.populateEdit(user);
    this.message.set('');
    this.openForm();
  }

  /** Deja el formulario con los datos del usuario (sin abrir la hoja). */
  private populateEdit(user: AdminUser): void {
    this.selectedUser.set(user);
    this.resetUserForm({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      role: user.role,
      password: ''
    });
    this.setPasswordRules(false);
  }

  /** Abre la hoja con el formulario (si ya estaba abierta, la conserva: el formulario es el mismo). */
  private openForm(): void {
    if (this.sheet) return;
    const ref = this.dialog.sheet<void, UserFormSheetData, UserFormSheetComponent>(UserFormSheetComponent, {
      side: 'end',
      data: { host: this },
    });
    this.sheet = ref;
    ref.closed?.subscribe(() => {
      if (this.sheet === ref) this.sheet = null;
    });
  }

  closeForm(): void {
    const ref = this.sheet;
    this.sheet = null;
    ref?.close();
  }

  save() {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // El foco va al primer campo inválido: la hoja vive en la capa superior, no dentro de esta pantalla.
      focusFirstInvalid(this.sheetElement() ?? this.host.nativeElement);
      return;
    }
    const selected = this.selectedUser();
    const value = this.form.getRawValue();
    const email = value.email.trim().toLowerCase();
    // La hoja desde la que se envía: al responder el servidor puede haberse cerrado o haber otra (formulario nuevo).
    const sheetAtSave = this.sheet;
    const solicitudAlGuardar = selected ? null : this.solicitudEnFormulario;
    this.saving.set(true);
    this.message.set('');

    const request$ = selected
      ? this.service.update(selected.id, {
          email,
          password: value.password || undefined,
          nombre: value.nombre,
          apellido: value.apellido,
          role: value.role
        })
      : this.service.create({
          email,
          password: value.password,
          nombre: value.nombre,
          apellido: value.apellido,
          role: value.role,
          activo: true
        });

    request$.subscribe({
      next: saved => {
        this.users.update(users => {
          const exists = users.some(user => user.id === saved.id);
          return exists ? users.map(user => user.id === saved.id ? saved : user) : [...users, saved];
        });
        this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');
        this.saving.set(false);
        // Solo se toca el formulario y la hoja si siguen siendo los del envío: una respuesta tardía no pisa otro formulario.
        if (this.sheet === sheetAtSave) {
          this.populateEdit(saved);
          this.closeForm();
        }
        if (solicitudAlGuardar !== null) {
          this.accessRequestsService.updateStatus(solicitudAlGuardar, 'REVIEWED').subscribe({
            next: () => this.loadAccessRequests(),
            error: () => { this.notify.warning('La cuenta se creó, pero no se pudo marcar la solicitud como revisada.'); this.loadAccessRequests(); },
          });
        } else this.loadAccessRequests();
      },
      error: (err: unknown) => {
        const text = mensajeDeError(err, 'No fue posible guardar los cambios.');
        if (text) this.notify.error(text);
        this.saving.set(false);
        // Si la hoja se cerró mientras se guardaba, vuelve con lo que se escribió (el formulario no se perdió).
        this.openForm();
      }
    });
  }

  /** La capa de la hoja abierta (donde viven los campos), para llevar el foco al primer campo inválido. */
  private sheetElement(): HTMLElement | null {
    return (this.sheet?.overlayRef?.overlayElement as HTMLElement | undefined) ?? null;
  }

  // ── Acciones de la fila ───────────────────────────────────────────────────────────────────────────────────────
  cambiarPermiso(user: AdminUser): void {
    if (this.saving()) return;
    this.saving.set(true);
    const permiso = !user.permisoAutoria;
    this.service.permisoAutoria(user.id, permiso).subscribe({
      next: () => {
        this.users.update(users => users.map(u => u.id === user.id ? { ...u, permisoAutoria: permiso } : u));
        this.notify.success(permiso ? 'Permiso de autoría concedido.' : 'Permiso de autoría retirado.');
        this.saving.set(false);
      },
      error: (err: unknown) => {
        const text = mensajeDeError(err, 'No fue posible cambiar el permiso de autoría.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      },
    });
  }

  rowActions(user: AdminUser): UiMenuItem[] {
    // E2-9: «Activar» una pendiente sería aprobarla; se dice así (y manda el correo con la contraseña temporal).
    const autoria: UiMenuItem[] = user.role === 'PROFESOR' ? [{ value: 'autoria', label: user.permisoAutoria ? 'Retirar permiso de crear casos' : 'Permitir crear casos', icon: 'edit' }] : [];
    if (user.pendingApproval) return [{ value: 'aprobar', label: 'Aprobar cuenta', icon: 'task_alt' }, ...autoria];
    return [...autoria, {
      value: 'estado',
      label: user.activo ? 'Desactivar usuario' : 'Activar usuario',
      icon: user.activo ? 'block' : 'check_circle',
      tone: user.activo ? 'danger' : 'default',
    }];
  }

  rowAction(user: AdminUser, action: string | undefined): void {
    if (action === 'autoria') this.cambiarPermiso(user);
    if (action === 'estado') void this.toggleStatus(user);
    if (action === 'aprobar') void this.approveUser(user);
  }

  /** La insignia del estado de la cuenta: una pendiente de aprobación no es una inactiva. */
  statusBadge(user: AdminUser): { label: string; tone: 'success' | 'neutral' | 'warning' } {
    if (user.pendingApproval) return { label: 'Pendiente de aprobación', tone: 'warning' };
    return user.activo ? { label: 'Activo', tone: 'success' } : { label: 'Inactivo', tone: 'neutral' };
  }

  async approvePending(): Promise<void> {
    const ids = this.pendingUsers().map(user => user.id);
    const decision = await this.confirmarAprobacion(ids);
    if (decision !== undefined) this.approveIds(ids, decision);
  }

  async approveUser(user: AdminUser): Promise<void> {
    const decision = await this.confirmarAprobacion([user.id]);
    if (decision !== undefined) this.approveIds([user.id], decision);
  }

  private async confirmarAprobacion(ids: number[]): Promise<boolean | undefined> {
    if (this.saving() || this.confirmando || !ids.length) return undefined;
    const persona = ids.length === 1 ? this.users().find(u => u.id === ids[0]) : undefined;
    const message = persona ? `¿Aprobar la cuenta de ${persona.nombre} ${persona.apellido}? Recibirá una contraseña temporal por correo.` : `Se enviará una contraseña temporal por correo a cada cuenta aprobada.`;
    if (!this.users().some(u => ids.includes(u.id) && u.role === 'PROFESOR')) {
      return await this.confirmOnce({ title: persona ? 'Aprobar cuenta' : 'Aprobar cuentas pendientes', message, confirmLabel: persona ? 'Aprobar' : `Aprobar ${accounts(ids.length)}` }) ? false : undefined;
    }
    this.confirmando = true;
    try {
      const ref = this.dialog.open<boolean | undefined, string>(ApproveTeachersDialogComponent, { data: message });
      return await firstValueFrom(ref.closed, { defaultValue: undefined });
    } finally { this.confirmando = false; }
  }

  /** Una sola confirmación a la vez: un segundo gesto no abre otra ni repite la acción. */
  private async confirmOnce(options: { title: string; message: string; confirmLabel: string }): Promise<boolean> {
    if (this.saving() || this.confirmando) return false;
    this.confirmando = true;
    try {
      return await this.dialog.confirm(options);
    } finally {
      this.confirmando = false;
    }
  }

  /** Aprueba en lotes de 100 (el máximo del servidor), uno tras otro, y resume el total. */
  private approveIds(ids: number[], darAutoria = false): void {
    if (this.saving() || !ids.length) return;
    this.saving.set(true);
    this.actionStatus.set('');
    this.resultadoLote.set('');
    const docentes = new Set(this.users().filter(u => u.role === 'PROFESOR').map(u => u.id));
    let fallosPermiso = 0;
    const batches: number[][] = [];
    for (let start = 0; start < ids.length; start += APPROVE_BATCH_SIZE) batches.push(ids.slice(start, start + APPROVE_BATCH_SIZE));
    from(batches).pipe(
      concatMap(batch => this.service.approve(batch)),
      concatMap(part => {
        const aprobados = darAutoria ? part.approvedIds.filter(id => docentes.has(id)) : [];
        return from(aprobados).pipe(concatMap(id => this.service.permisoAutoria(id, true).pipe(
          catchError(() => { fallosPermiso++; return of(null); }),
        )), toArray(), map(() => part));
      }),
      reduce((total, part) => ({
        approved: total.approved + part.approved,
        approvedIds: [...total.approvedIds, ...part.approvedIds],
        skipped: [...total.skipped, ...part.skipped],
        emailed: total.emailed + part.emailed,
        failed: [...total.failed, ...part.failed],
      }), NO_APPROVALS),
    ).subscribe({
      next: total => {
        const summary = approvalSummary(total) + (fallosPermiso ? ` No se pudo dar el permiso de autoría a ${fallosPermiso} docentes; inténtalo desde su fila.` : '');
        this.actionStatus.set(summary);
        if (total.failed.length || fallosPermiso) this.notify.warning(summary);
        else this.notify.success(summary);
      },
      error: (err: unknown) => {
        const text = mensajeDeError(err, 'No fue posible aprobar las cuentas.');
        if (text) {
          this.notify.error(text);
          this.actionStatus.set(text);
        }
        this.saving.set(false);
        this.load(true);
      },
      complete: () => {
        this.saving.set(false);
        this.load(true);
      },
    });
  }

  async toggleStatus(user: AdminUser): Promise<void> {
    if (this.saving() || this.confirmando) return;
    this.confirmando = true;
    let confirmed = false;
    try {
      confirmed = await this.dialog.confirm({
        title: user.activo ? 'Desactivar usuario' : 'Activar usuario',
        message: this.statusConfirmMessage(user),
        confirmLabel: user.activo ? 'Desactivar' : 'Activar',
        tone: user.activo ? 'danger' : 'default',
      });
    } finally {
      this.confirmando = false;
    }
    if (confirmed) this.applyStatus(user);
  }

  private applyStatus(user: AdminUser): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.message.set('');
    this.service.updateStatus(user.id, !user.activo).subscribe({
      next: saved => {
        this.users.update(users => users.map(item => item.id === saved.id ? saved : item));
        this.notify.success(saved.activo ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.');
        this.saving.set(false);
        if (this.selectedUser()?.id === saved.id) this.populateEdit(saved);
      },
      error: (err: unknown) => {
        const text = mensajeDeError(err, 'No fue posible actualizar el estado del usuario.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
    });
  }
}
