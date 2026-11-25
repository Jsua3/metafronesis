import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnChanges, OnInit, ViewChild, afterNextRender,
  computed, inject, input, output, signal,
} from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { CompetencyCatalogItem, RubricAdmin, RubricCriterionAdmin, RubricService } from '../../core/api/rubric.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { FormativeLevel, SimulationCaseSummary } from '../../core/models/revision.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiBarraAcciones } from '../../shared/ui/barra-acciones/ui-barra-acciones';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { AvisoDescriptor, TEXTO_AVISO_DESCRIPTOR, avisosDeDescriptor } from './descriptor-avisos.util';
import { UiAyudaBreve } from '../../shared/ui/ayuda-breve/ui-ayuda-breve';
import { GLOSARIO } from '../autoria/modelo/glosario';

/** E2-2: una rúbrica ajena (la global o la de otra persona) es de solo lectura para el docente. */
export const RUBRIC_READ_ONLY_MESSAGE = 'Esta rúbrica es de solo lectura: no la creaste tú. Duplícala para personalizarla.';
export const RUBRIC_GONE_MESSAGE = 'Esta rúbrica ya no está disponible.';
export const RUBRIC_CASE_NOT_OWNED_MESSAGE = 'Solo quien creó el caso puede asignarle una rúbrica.';

/** Por qué no se activa: la usan el botón de «Más», la pista de la cabecera y las pruebas. */
const MOTIVO_PESO = 'La ponderación debe sumar 100 %.';
const MOTIVO_SIN_GUARDAR = 'Guarda la rúbrica primero.';

export interface NivelRubrica {
  clave: FormativeLevel;
  nombre: string;
  /** El descriptor general del nivel: lo que se aplica si la celda del criterio queda vacía. */
  general: string;
}

/**
 * Los cuatro niveles del sistema (RN-09: no se agregan ni se renombran) con su descriptor general. Es el espejo de
 * `LEVELS` en `rubric_service.py`: la vista de detalle de una rúbrica no los manda y la matriz los necesita para pintar
 * en gris lo que se aplicará en cada celda vacía. Si el servidor los cambia, se cambian aquí.
 */
export const NIVELES_RUBRICA: readonly NivelRubrica[] = [
  // BORRADOR: texto del servidor, pendiente de la aprobación de Psicología (VD-23).
  { clave: 'EN_INICIO', nombre: 'En inicio', general: 'Muestra los primeros acercamientos al criterio; necesita acompañamiento para sostenerlo.' },
  { clave: 'EN_PROCESO', nombre: 'En proceso', general: 'Aplica el criterio de forma parcial: acierta en algunos momentos y se le escapan otros.' },
  { clave: 'LOGRADO', nombre: 'Logrado', general: 'Aplica el criterio con solidez y justifica lo que decide.' },
  { clave: 'DESTACADO', nombre: 'Destacado', general: 'Aplica el criterio con criterio propio y anticipa lo que la situación pide.' },
];

/** Cómo empieza una rúbrica nueva: en blanco o con un criterio por competencia activa del catálogo. */
export type ComienzoRubrica = 'blanco' | 'competencias';

/**
 * El peso repartido por igual entre `cuantos` criterios, en centésimas: todos reciben lo mismo y el último absorbe el
 * redondeo, así la suma es exactamente 100,00 (con 3: 33,33 + 33,33 + 33,34).
 */
export function pesosIguales(cuantos: number): number[] {
  if (cuantos < 1) return [];
  const base = Math.floor(10000 / cuantos);
  return Array.from({ length: cuantos }, (_, i) => (i === cuantos - 1 ? 10000 - base * (cuantos - 1) : base) / 100);
}

/** El criterio tal como lo manda el detalle (el servidor ya devuelve `competencyId`; el tipo compartido no lo declara). */
type CriterioLeido = RubricCriterionAdmin & { competencyId?: number | null };

/**
 * Editor de UNA rúbrica analítica (EDITOR.md §5.2): la matriz criterio × nivel. Es independiente de la biblioteca para
 * poder abrirse también desde el editor de casos: entra `rubricId` (nulo = rúbrica nueva) y sale `guardada` cada vez
 * que el servidor devuelve una versión nueva (guardar, activar, duplicar…), para que quien lo aloja refresque su lista.
 *
 * - Un criterio abierto a la vez (acordeón): cerrados, ocho caben en una pantalla de 1440 × 900.
 * - El orden es la posición: se arrastra por el asa o se cambia con «Subir» y «Bajar» del menú de la fila (teclado).
 * - Celda vacía = descriptor general (se ve en gris y así se aplica): la rúbrica sirve desde el primer minuto.
 * - Pie fijo con una sola acción primaria («Guardar»: guardar es explícito porque activar exige sumar 100) y «Más».
 *
 * OnPush: los errores salen de `control.touched`, que no es una señal; `form.events` (valor, estado, tocado) mueve
 * `formTick` y las funciones de la plantilla lo leen, así la vista se repinta con cada cambio del formulario.
 */
@Component({
  selector: 'app-rubrica-editor',
  imports: [
    ReactiveFormsModule, MatIconModule,
    UiAyudaBreve, UiBadge, UiBarraAcciones, UiButton, UiControl, UiErrorState, UiField, UiMenu, UiSkeleton,
  ],
  templateUrl: './rubrica-editor.component.html',
  styleUrl: './rubrica-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'rb-form',
    '(window:beforeunload)': 'alCerrarPestana($event)',
    '(document:pointerdown)': 'cerrarMasSiFuera($event)',
  },
})
export class RubricaEditorComponent implements OnChanges, OnInit {
  protected readonly glosario = GLOSARIO;
  private readonly rubricService = inject(RubricService);
  private readonly casosApi = inject(CaseCatalogApi);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly announcer = inject(LiveRegionAnnouncer, { optional: true });
  private readonly dialog = inject(UiDialog, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly formTick = signal(0);
  // @ViewChild y no viewChild(): las pruebas que instancian el componente sin plantilla no tienen la consulta.
  @ViewChild(FormGroupDirective) private formDirective?: FormGroupDirective;

  /** La rúbrica a abrir; nula para una nueva. */
  readonly rubricId = input<number | null>(null);
  /** Con qué empieza una rúbrica nueva. */
  readonly comienzo = input<ComienzoRubrica>('blanco');
  /** El servidor devolvió una versión nueva de la rúbrica (guardada, activada, duplicada…). */
  readonly guardada = output<RubricAdmin>();
  /** La rúbrica pedida ya no existe (404): quien aloja el editor vuelve a su lista. */
  readonly perdida = output<void>();

  /** E2-2: solo el administrador fija la rúbrica predeterminada (al docente el servidor le responde 403). */
  protected readonly canSetDefault = inject(AuthService).hasRole('ADMIN');
  /** E2-2: la rúbrica abierta resultó ajena (403 al modificarla): se dice y se ofrece duplicarla con lo escrito. */
  readonly readOnly = signal(false);

  readonly niveles = NIVELES_RUBRICA;
  protected readonly mensajeSoloLectura = RUBRIC_READ_ONLY_MESSAGE;
  readonly selected = signal<RubricAdmin | null>(null);
  readonly competencias = signal<CompetencyCatalogItem[]>([]);
  readonly competenciasFallaron = signal(false);
  readonly cases = signal<SimulationCaseSummary[]>([]);
  readonly caseVersionId = signal(0);
  readonly criterioAbierto = signal<number | null>(null);
  readonly saving = signal(false);
  /**
   * El formulario solo se muestra con datos que corresponden a lo pedido: mientras llega el
   * detalle o la plantilla de competencias, un esqueleto; si el detalle falla, un error con «Reintentar». Así no se
   * edita ni se guarda una rúbrica vacía o la anterior en lugar de la pedida.
   */
  readonly carga = signal<'lista' | 'cargando' | 'error'>('lista');
  /** El guardado en camino: la guardia de salida lo espera en vez de dejar salir sin saber si falló. */
  private guardadoEnCurso: Promise<void> | null = null;
  readonly message = signal('');
  readonly messageIsError = signal(false);
  /** El panel «Más» del pie. */
  readonly masAbierto = signal(false);
  /** La fila sobre la que se suelta lo que se arrastra (para pintar la ranura). */
  readonly destinoArrastre = signal<number | null>(null);
  private arrastrado: number | null = null;

  /** Rúbrica ajena conocida de antemano (el detalle dice `editable: false`): la matriz entera, sin campos. */
  readonly soloLectura = computed(() => this.selected()?.editable === false);
  /** Título para la cabecera de quien aloja el editor. */
  readonly titulo = computed(() => this.selected()?.name || 'Nueva rúbrica');

  form = this.fb.group({
    name: ['', Validators.required],
    description: [''],
    version: ['1.0', Validators.required],
    criteria: this.fb.array<FormGroup>([]),
  });

  /** Región de estado siempre presente: el aviso de no poder abrir la rúbrica (una región que nace con su texto no se lee). */
  protected readonly statusText = computed(() => (this.messageIsError() && !this.readOnly() ? this.message() : ''));

  /** La última apertura pedida: el detalle de una anterior que llega tarde no pisa lo que ya se eligió. */
  private openRequest = 0;

  /** Si la entrada ya se aplicó (con enlaces, `ngOnChanges` llega antes que `ngOnInit`). */
  private entradaAplicada = false;

  constructor() {
    this.form.events.subscribe(() => this.formTick.update(v => v + 1));
    inject(DestroyRef).onDestroy(() => (this.openRequest += 1));
  }

  ngOnInit(): void {
    this.rubricService.competencies().subscribe({
      next: items => {
        // «Con las competencias del programa» pudo llenarla antes: no se pisa con la misma lista.
        if (!this.competencias().length) this.competencias.set(items.filter(item => item.active).sort((a, b) => a.sortOrder - b.sortOrder));
      },
      error: () => this.competenciasFallaron.set(true),
    });
    this.casosApi.listDrafts().subscribe({
      next: cases => this.cases.set(cases),
      error: () => this.cases.set([]),
    });
    if (!this.entradaAplicada) this.aplicarEntrada();
  }

  /** La entrada manda: abrir la rúbrica pedida o empezar una nueva. Si ya está abierta la misma, no se vuelve a pedir. */
  ngOnChanges(): void {
    this.aplicarEntrada();
  }

  private aplicarEntrada(): void {
    this.entradaAplicada = true;
    const id = this.rubricId();
    if (id === null) {
      if (this.comienzo() === 'competencias') this.desdeCompetencias();
      else this.newRubric();
    } else if (this.selected()?.id !== id) {
      this.openRubric(id);
    }
  }

  get criteria(): FormArray<FormGroup> {
    return this.form.controls.criteria;
  }

  /** Suma de los pesos de los criterios que cuentan, en centésimas para no arrastrar errores de coma flotante. */
  totalWeight(): number {
    this.formTick();
    return this.criteria.controls.reduce((sum, control) => sum + (control.get('active')?.value ? Math.round(Number(control.get('weight')?.value || 0) * 100) : 0), 0) / 100;
  }

  /** El total en palabras, como en la cabecera de la matriz: «Suma 100 %», «Faltan 10 %» o «Sobran 5 %». */
  resumenPeso(): string {
    // BORRADOR: pendiente de aprobación de Psicología.
    return `Suman ${this.numero(this.totalWeight())} % de 100 %`;
  }

  /** Un número con coma decimal y sin ceros sobrantes (33,33; 25; 12,5). */
  numero(valor: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor);
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    this.formTick();
    return control.touched && control.invalid ? message : null;
  }

  /** Por qué no se puede activar ni marcar como predeterminada la rúbrica abierta (null si se puede). */
  activateReason(): string | null {
    if (!this.selected()) return MOTIVO_SIN_GUARDAR;
    return this.totalWeight() !== 100 ? MOTIVO_PESO : null;
  }

  /** Por qué no se puede actuar sobre la rúbrica abierta (null si hay una guardada). */
  selectedReason(): string | null {
    return this.selected() ? null : MOTIVO_SIN_GUARDAR;
  }

  assignReason(): string | null {
    if (!this.selected()) return MOTIVO_SIN_GUARDAR;
    return this.caseVersionId() ? null : 'Elige un caso en borrador.';
  }

  /** La nota del pie: lo que pasa con la rúbrica ahora mismo, en una línea. */
  notaPie(): string {
    this.formTick();
    if (this.saving()) return 'Guardando…';
    if (this.form.dirty) return 'Tienes cambios sin guardar.';
    if (!this.selected()) return 'Rúbrica nueva, todavía sin guardar.';
    return 'Todo guardado.';
  }

  estadoEtiqueta(rubric: RubricAdmin | null): string {
    if (!rubric) return 'Sin guardar';
    return rubric.isDefault ? 'Predeterminada' : (rubric.active ? 'Activa' : 'Borrador');
  }

  estadoTono(rubric: RubricAdmin | null): UiBadgeTone {
    if (!rubric) return 'neutral';
    return rubric.isDefault ? 'success' : (rubric.active ? 'info' : 'neutral');
  }

  /** «En 2 casos · 12 valoraciones», o null si el servidor no manda el uso (RK-3). */
  usoTexto(): string | null {
    const uso = this.selected()?.usage;
    if (!uso) return null;
    if (!uso.caseVersions && !uso.evaluations) return 'Todavía no se usa en ningún caso.';
    const casos = `En ${uso.caseVersions} ${uso.caseVersions === 1 ? 'caso' : 'casos'}`;
    return `${casos} · ${uso.evaluations} ${uso.evaluations === 1 ? 'valoración' : 'valoraciones'}`;
  }

  /** De qué caso es esta rúbrica, si es la propia de una versión («Violencia familiar · v2.1.0 · Publicado»). */
  casoTexto(): string | null {
    const caso = this.selected()?.caseVersion;
    if (!caso) return null;
    const estados: Record<string, string> = { DRAFT: 'Borrador', IN_REVIEW: 'En revisión', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado' };
    return `${caso.title} · v${caso.semanticVersion} · ${estados[caso.status] ?? caso.status}`;
  }

  // ── Criterios: resumen de la fila cerrada ─────────────────────────────────────────────────────────────────────

  pesoDe(control: AbstractControl): number {
    this.formTick();
    return Number(control.get('weight')?.value || 0);
  }

  /** El ancho de la barra fina del peso (0 a 100). */
  barraDe(control: AbstractControl): number {
    return Math.max(0, Math.min(100, this.pesoDe(control)));
  }

  /** Cuántas de las cuatro celdas tienen texto propio. */
  descriptoresEscritos(control: AbstractControl): number {
    this.formTick();
    return this.niveles.filter(nivel => String(control.get(['levelDescriptors', nivel.clave])?.value ?? '').trim()).length;
  }

  /** La competencia del programa a la que apunta el criterio, por su nombre del catálogo. */
  competenciaDe(control: AbstractControl): string | null {
    this.formTick();
    const id = control.get('competencyId')?.value;
    if (!id) return null;
    return this.competencias().find(item => item.id === Number(id))?.name ?? (control.get('competency')?.value || null);
  }

  /**
   * La línea de abajo de la fila cerrada: competencia y descriptores. Si el criterio se llama como su competencia (lo
   * que deja la plantilla del catálogo), no se repite el nombre: basta decir que está enlazado.
   */
  metaDe(control: AbstractControl): string {
    const escritos = this.descriptoresEscritos(control);
    const descriptores = escritos ? `${escritos} de 4 descriptores propios` : 'descriptores generales';
    const competencia = this.competenciaDe(control);
    const titulo = String(control.get('title')?.value ?? '').trim().toLocaleLowerCase('es');
    const enlace = !competencia ? 'Sin competencia del programa'
      : competencia.trim().toLocaleLowerCase('es') === titulo ? 'Competencia del programa' : `Competencia: ${competencia}`;
    return `${enlace} · ${descriptores}`;
  }

  /** La nota de redacción de una celda, solo después de salir de ella (no interrumpe mientras se escribe). */
  avisoCelda(control: AbstractControl, nivel: FormativeLevel): string | null {
    this.formTick();
    const celda = control.get(['levelDescriptors', nivel]);
    if (!celda?.touched) return null;
    const avisos: AvisoDescriptor[] = avisosDeDescriptor(celda.value);
    return avisos.length ? TEXTO_AVISO_DESCRIPTOR[avisos[0]] : null;
  }

  /** El texto que se aplica en un nivel: el propio del criterio o, si no tiene, el general (vista de solo lectura). */
  descriptorAplicado(criterio: CriterioLeido, nivel: NivelRubrica): { texto: string; general: boolean } {
    const propio = criterio.levelDescriptors?.[nivel.clave]?.trim();
    return propio ? { texto: propio, general: false } : { texto: nivel.general, general: true };
  }

  /** La competencia de un criterio en la vista de solo lectura (sin repetir el nombre si coincide con el título). */
  nombreCompetencia(criterio: CriterioLeido): string {
    const nombre = criterio.competencyId ? this.competencias().find(item => item.id === criterio.competencyId)?.name : null;
    if (!nombre) return 'Sin competencia del programa';
    return nombre.trim().toLocaleLowerCase('es') === criterio.title.trim().toLocaleLowerCase('es') ? 'Competencia del programa' : `Competencia: ${nombre}`;
  }

  // ── Acordeón y orden ──────────────────────────────────────────────────────────────────────────────────────────

  alternarCriterio(indice: number): void {
    this.criterioAbierto.set(this.criterioAbierto() === indice ? null : indice);
  }

  accionesCriterio(indice: number): UiMenuItem[] {
    const ultimo = this.criteria.length - 1;
    return [
      { value: 'subir', label: 'Subir', icon: 'keyboard_arrow_up', disabled: indice === 0 },
      { value: 'bajar', label: 'Bajar', icon: 'keyboard_arrow_down', disabled: indice === ultimo },
      { value: 'quitar', label: 'Eliminar criterio', icon: 'delete_outline', tone: 'danger' },
    ];
  }

  accionCriterio(indice: number, accion: string | undefined): void {
    if (accion === 'subir') this.moverCriterio(indice, indice - 1);
    else if (accion === 'bajar') this.moverCriterio(indice, indice + 1);
    else if (accion === 'quitar') this.removeCriterion(indice);
  }

  addCriterion(): void {
    this.criteria.push(this.grupoCriterio());
    // Al crear uno, nace abierto: es lo que se va a escribir.
    this.criterioAbierto.set(this.criteria.length - 1);
    this.form.markAsDirty();
  }

  removeCriterion(index: number): void {
    const titulo = this.criteria.at(index)?.get('title')?.value || `Criterio ${index + 1}`;
    this.criteria.removeAt(index);
    this.criterioAbierto.set(null);
    this.form.markAsDirty();
    this.announcer?.announce(`Se quitó «${titulo}». Se borra del todo al guardar.`);
  }

  /** «Repartir el peso por igual» entre los criterios que cuentan; el último absorbe el redondeo (suma 100,00). */
  repartirPeso(): void {
    const activos = this.criteria.controls.filter(c => c.get('active')?.value);
    const pesos = pesosIguales(activos.length);
    activos.forEach((c, i) => c.get('weight')?.setValue(pesos[i]));
    if (activos.length) {
      this.form.markAsDirty();
      this.announcer?.announce(`Peso repartido: ${activos.length} criterios, suma 100 %.`);
    }
  }

  /** Mueve un criterio de lugar. El orden que se guarda es la posición (`displayOrder` = índice + 1). */
  moverCriterio(origen: number, destino: number): void {
    if (destino < 0 || destino >= this.criteria.length || origen === destino) return;
    const control = this.criteria.at(origen);
    // El criterio abierto sigue abierto aunque cambie de posición (el suyo o el de otro).
    const abierto = this.criterioAbierto();
    const controlAbierto = abierto === null ? null : this.criteria.at(abierto);
    this.criteria.removeAt(origen, { emitEvent: false });
    this.criteria.insert(destino, control);
    this.criterioAbierto.set(controlAbierto ? this.criteria.controls.indexOf(controlAbierto) : null);
    this.form.markAsDirty();
    const titulo = control.get('title')?.value || 'El criterio';
    this.announcer?.announce(`«${titulo}» quedó en la posición ${destino + 1} de ${this.criteria.length}.`);
  }

  /** El asa arma el arrastre de su fila: solo desde el asa, para que seleccionar texto en un campo no arrastre nada. */
  tomarAsa(evento: PointerEvent): void {
    const fila = (evento.currentTarget as HTMLElement | null)?.closest('li');
    if (fila) fila.draggable = true;
  }

  soltarAsa(evento: Event): void {
    const fila = (evento.currentTarget as HTMLElement | null)?.closest('li');
    if (fila) fila.draggable = false;
  }

  iniciarArrastre(indice: number, evento: DragEvent): void {
    this.arrastrado = indice;
    if (evento.dataTransfer) {
      evento.dataTransfer.effectAllowed = 'move';
      // Firefox no arrastra sin datos.
      evento.dataTransfer.setData('text/plain', String(indice));
    }
  }

  sobreCriterio(indice: number, evento: DragEvent): void {
    if (this.arrastrado === null) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    if (this.destinoArrastre() !== indice) this.destinoArrastre.set(indice);
  }

  soltarCriterio(evento: DragEvent, indice: number): void {
    evento.preventDefault();
    if (this.arrastrado !== null) this.moverCriterio(this.arrastrado, indice);
    this.terminarArrastre(evento);
  }

  terminarArrastre(evento?: Event): void {
    this.arrastrado = null;
    this.destinoArrastre.set(null);
    const fila = (evento?.target as HTMLElement | null)?.closest?.('li');
    if (fila) fila.draggable = false;
  }

  /** Al cambiar la competencia, su texto sigue al catálogo (el código), o vuelve al nombre del criterio si es «Ninguna». */
  cambioCompetencia(control: AbstractControl): void {
    const id = Number(control.get('competencyId')?.value || 0);
    const item = this.competencias().find(c => c.id === id);
    control.get('competency')?.setValue(item ? item.code : '');
  }

  // ── Panel «Más» del pie ───────────────────────────────────────────────────────────────────────────────────────

  alternarMas(): void {
    this.masAbierto.update(abierto => !abierto);
  }

  /** Esc cierra el panel y devuelve el foco a su botón. */
  cerrarMas(devolverFoco = false): void {
    if (!this.masAbierto()) return;
    this.masAbierto.set(false);
    if (devolverFoco) this.host.nativeElement.querySelector<HTMLElement>('.re-mas__boton')?.focus();
  }

  cerrarMasSiFuera(evento: Event): void {
    if (!this.masAbierto()) return;
    const dentro = (evento.target as Element | null)?.closest?.('.re-mas');
    if (!dentro) this.masAbierto.set(false);
  }

  /** Una acción del panel «Más»: se ejecuta y el panel se cierra. */
  accionMas(accion: 'activar' | 'desactivar' | 'duplicar' | 'predeterminada'): void {
    this.masAbierto.set(false);
    if (accion === 'activar') this.activate();
    else if (accion === 'desactivar') this.deactivate();
    else if (accion === 'duplicar') this.duplicate();
    else this.setDefault();
  }

  // ── Apertura, plantillas y salida ─────────────────────────────────────────────────────────────────────────────

  /** Abre una rúbrica. Elegir otra retira el aviso de la anterior. */
  openRubric(id: number): void {
    this.criterioAbierto.set(null);
    this.readOnly.set(false);
    this.clearMessage();
    this.carga.set('cargando');
    const request = ++this.openRequest;
    this.rubricService.detail(id).subscribe({
      next: rubric => {
        if (request !== this.openRequest) return;
        this.selected.set(rubric);
        this.populate(rubric);
        this.carga.set('lista');
      },
      error: (err: unknown) => {
        if (request !== this.openRequest) return;
        this.carga.set('error');
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.explainError(err, '');
          return;
        }
        this.message.set('No fue posible abrir la rúbrica.');
        this.messageIsError.set(true);
      },
    });
  }

  /** «Reintentar» del error de apertura: vuelve a pedir la misma rúbrica. */
  reintentarApertura(): void {
    const id = this.rubricId();
    if (id !== null) this.openRubric(id);
  }

  newRubric(): void {
    this.openRequest += 1;
    this.carga.set('lista');
    this.readOnly.set(false);
    this.clearMessage();
    this.selected.set(null);
    this.resetRubricForm({ name: '', description: '', version: '1.0' });
    this.criteria.clear();
    this.criteria.push(this.grupoCriterio());
    this.criterioAbierto.set(0);
  }

  /**
   * «Con las competencias del programa»: un criterio por competencia activa del catálogo, con su nombre y descripción,
   * enlazado a ella y con el peso repartido por igual. Es la única plantilla que no inventa contenido (lo fijó Psicología).
   */
  desdeCompetencias(): void {
    this.newRubric();
    // Hasta que llegue la plantilla no hay formulario: lo que se escribiera antes lo pisaría el catálogo.
    this.carga.set('cargando');
    const request = this.openRequest;
    this.rubricService.competencies().subscribe({
      next: items => {
        if (request !== this.openRequest) return;
        this.carga.set('lista');
        const activas = items.filter(item => item.active).sort((a, b) => a.sortOrder - b.sortOrder);
        this.competencias.set(activas);
        if (!activas.length) {
          this.notify.warning('El programa todavía no tiene competencias activas: empieza en blanco.');
          return;
        }
        this.criteria.clear();
        const pesos = pesosIguales(activas.length);
        activas.forEach((item, i) => this.criteria.push(this.grupoCriterio({
          title: item.name, description: item.description, competency: item.code, competencyId: item.id, weight: pesos[i], active: true,
        })));
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología.
        this.form.patchValue({ name: 'Rúbrica con las competencias del programa' });
        this.criterioAbierto.set(null);
        this.form.markAsDirty();
      },
      error: () => {
        if (request !== this.openRequest) return;
        this.carga.set('lista');
        this.notify.error('No pudimos traer las competencias del programa. Empieza en blanco o vuelve a intentarlo.');
      },
    });
  }

  /** Salir con cambios sin guardar pregunta antes, con «Seguir editando» como acción segura por defecto. */
  async canLeave(): Promise<boolean> {
    // Con un guardado en camino se espera su respuesta: si falla, lo escrito sigue sin guardar y se pregunta.
    if (this.saving() && this.guardadoEnCurso) await this.guardadoEnCurso;
    if (!this.form.dirty) return true;
    if (!this.dialog) return window.confirm('Tienes cambios sin guardar. ¿Quieres salir de todos modos?');
    const answer = await this.dialog.consequence({
      title: 'Tienes cambios sin guardar',
      consequence: 'Si sales ahora, se pierden los cambios de esta rúbrica.',
      continueLabel: 'Seguir editando',
      proceedLabel: 'Salir sin guardar',
    });
    return answer === 'proceed';
  }

  /** Cerrar o recargar la pestaña con cambios sin guardar: el navegador pregunta. */
  alCerrarPestana(evento: BeforeUnloadEvent): void {
    if (this.form.dirty) evento.preventDefault();
  }

  // ── Órdenes al servidor ───────────────────────────────────────────────────────────────────────────────────────

  save(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Un criterio inválido cerrado no tendría dónde enfocar: se abre el primero que falla.
      const indiceInvalido = this.criteria.controls.findIndex(c => c.invalid);
      if (indiceInvalido >= 0 && this.form.controls.name.valid && this.form.controls.version.valid
        && this.criterioAbierto() !== indiceInvalido) {
        this.criterioAbierto.set(indiceInvalido);
        afterNextRender(() => focusFirstInvalid(this.host.nativeElement), { injector: this.injector });
      }
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
    const payload = this.payload();
    // Mientras guarda, los campos quedan inertes (plantilla): la respuesta repuebla el formulario y lo que se escribiera
    // en el entretanto se perdería sin aviso. El foco pasa al botón ocupado para no caer al body.
    if (this.host.nativeElement.querySelector('.re-marco')?.contains(document.activeElement)) {
      this.host.nativeElement.querySelector<HTMLElement>('.re-pie button[type="submit"]')?.focus();
    }
    this.saving.set(true);
    let terminar: () => void = () => undefined;
    this.guardadoEnCurso = new Promise<void>(resolve => (terminar = resolve));
    const actual = this.selected();
    const request = actual ? this.rubricService.update(actual.id, payload) : this.rubricService.create(payload);
    request.subscribe({
      next: rubric => {
        this.selected.set(rubric);
        this.populate(rubric);
        this.notify.success('Rúbrica guardada.');
        this.saving.set(false);
        terminar();
        this.guardada.emit(rubric);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        terminar();
        this.explainError(err, 'No fue posible guardar la rúbrica.');
      },
    });
  }

  activate(): void {
    this.withSelected(id => this.rubricService.activate(id), 'Rúbrica activada.');
  }

  deactivate(): void {
    this.withSelected(id => this.rubricService.deactivate(id), 'Rúbrica desactivada.');
  }

  setDefault(): void {
    this.withSelected(id => this.rubricService.setDefault(id), 'Rúbrica predeterminada actualizada.');
  }

  duplicate(): void {
    // Con cambios sin guardar (p. ej. tras el 403 de una rúbrica ajena, que es justo cuando la pantalla ofrece duplicar)
    // la copia lleva LO ESCRITO: duplicar la versión guardada descartaría el trabajo del docente.
    if (!this.form.dirty) {
      this.withSelected(id => this.rubricService.duplicate(id), 'Rúbrica duplicada.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
    const draft = this.payload();
    this.rubricService.create({
      ...draft,
      name: `Copia de ${draft.name}`,
      criteria: (draft.criteria ?? []).map(criterion => ({ ...criterion, id: undefined })),
    }).subscribe({
      next: copy => {
        this.readOnly.set(false);
        this.clearMessage();
        this.selected.set(copy);
        this.populate(copy);
        this.notify.success('Rúbrica duplicada con tus cambios.');
        this.guardada.emit(copy);
      },
      error: (err: unknown) => this.explainError(err, 'No fue posible duplicar la rúbrica.'),
    });
  }

  /** «Usar en un caso»: la misma asignación de hoy (`PUT /api/rubrics/case-versions/{id}`). */
  assign(): void {
    const rubric = this.selected();
    const caseVersionId = this.caseVersionId();
    if (!rubric || !caseVersionId) return;
    this.rubricService.assignToCaseVersion(caseVersionId, rubric.id).subscribe({
      next: () => {
        this.notify.success('Rúbrica asignada al caso.');
        // El uso cambió (un caso más): se vuelve a leer para que «Dónde se usa» diga la verdad.
        this.rubricService.detail(rubric.id).subscribe({ next: fresh => { if (this.selected()?.id === fresh.id) this.selected.set(fresh); }, error: () => undefined });
      },
      error: (err: unknown) => {
        // E2-2: solo quien autora el caso (o el administrador) le asigna rúbrica.
        const text = err instanceof HttpErrorResponse && err.status === 403
          ? RUBRIC_CASE_NOT_OWNED_MESSAGE
          : apiErrorMessage(err, 'No fue posible asignar la rúbrica.');
        if (text) this.notify.error(text);
      },
    });
  }

  selectCaseVersion(value: string): void {
    this.caseVersionId.set(Number(value || 0));
  }

  // ── Interno ───────────────────────────────────────────────────────────────────────────────────────────────────

  private grupoCriterio(item: Partial<CriterioLeido> = {}): FormGroup {
    const propios = item.levelDescriptors ?? {};
    return this.fb.group({
      id: [item.id ?? null],
      title: [item.title ?? '', Validators.required],
      competency: [item.competency ?? ''],
      competencyId: [item.competencyId ?? null],
      description: [item.description ?? ''],
      weight: [item.weight ?? 0, [Validators.required, Validators.min(0), Validators.max(100)]],
      active: [item.active ?? true],
      levelDescriptors: this.fb.group({
        EN_INICIO: [propios.EN_INICIO ?? '', Validators.maxLength(600)],
        EN_PROCESO: [propios.EN_PROCESO ?? '', Validators.maxLength(600)],
        LOGRADO: [propios.LOGRADO ?? '', Validators.maxLength(600)],
        DESTACADO: [propios.DESTACADO ?? '', Validators.maxLength(600)],
      }),
    });
  }

  /**
   * Reinicia valores Y el estado «enviado» del formulario (`form.reset()` deja `submitted` en true): así un formulario
   * recién abierto no hereda el envío fallido del anterior.
   */
  private resetRubricForm(value: { name: string; description: string; version: string }): void {
    if (this.formDirective) this.formDirective.resetForm(value);
    else this.form.reset(value);
  }

  private populate(rubric: RubricAdmin): void {
    this.resetRubricForm({ name: rubric.name, description: rubric.description || '', version: rubric.version || '1.0' });
    this.criteria.clear();
    const ordenados = [...(rubric.criteria || [])].sort((a, b) => a.displayOrder - b.displayOrder) as CriterioLeido[];
    ordenados.forEach(item => this.criteria.push(this.grupoCriterio(item)));
    this.form.markAsPristine();
  }

  private payload(): Partial<RubricAdmin> {
    return {
      name: this.form.value.name || '',
      description: this.form.value.description || '',
      version: this.form.value.version || '1.0',
      criteria: this.criteria.controls.map((control, index) => {
        const competencyId = control.get('competencyId')?.value ? Number(control.get('competencyId')?.value) : null;
        const descriptores = control.get('levelDescriptors')?.value as Record<FormativeLevel, string>;
        return {
          id: control.get('id')?.value || undefined,
          title: control.get('title')?.value || '',
          competency: control.get('competency')?.value || control.get('title')?.value || '',
          competencyId,
          // La matriz manda sus cuatro celdas: un nivel vacío vuelve al descriptor general (RK-2).
          levelDescriptors: Object.fromEntries(this.niveles.map(n => [n.clave, String(descriptores?.[n.clave] ?? '').trim()])),
          description: control.get('description')?.value || '',
          weight: Number(control.get('weight')?.value || 0),
          // El orden es la posición: el campo «Orden» ya no existe.
          displayOrder: index + 1,
          active: Boolean(control.get('active')?.value),
        } as RubricCriterionAdmin;
      }),
    };
  }

  /** El aviso de una rúbrica no acompaña a otra: se retira al abrir, crear o duplicar. */
  private clearMessage(): void {
    this.message.set('');
    this.messageIsError.set(false);
  }

  private withSelected(action: (id: number) => Observable<RubricAdmin>, success: string): void {
    const rubric = this.selected();
    if (!rubric) return;
    action(rubric.id).subscribe({
      next: updated => {
        this.readOnly.set(false);
        this.clearMessage();
        this.selected.set(updated);
        this.populate(updated);
        this.notify.success(success);
        this.guardada.emit(updated);
      },
      error: (err: unknown) => this.explainError(err, 'No fue posible actualizar la rúbrica.'),
    });
  }

  /**
   * E2-2: 403 = rúbrica ajena (solo lectura: se dice junto al formulario y se ofrece duplicarla); 404 = ya no está
   * disponible (se dice y quien aloja el editor vuelve a la lista); lo demás, el aviso de siempre.
   */
  private explainError(err: unknown, fallback: string): void {
    const status = err instanceof HttpErrorResponse ? err.status : null;
    if (status === 403) {
      this.readOnly.set(true);
      this.message.set(RUBRIC_READ_ONLY_MESSAGE);
      this.messageIsError.set(true);
      return;
    }
    if (status === 404) {
      this.message.set(RUBRIC_GONE_MESSAGE);
      this.messageIsError.set(true);
      this.selected.set(null);
      this.form.markAsPristine();
      this.perdida.emit();
      return;
    }
    const text = apiErrorMessage(err, fallback);
    if (text) this.notify.error(text);
  }
}
