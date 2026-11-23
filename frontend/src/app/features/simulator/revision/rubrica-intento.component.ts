import { DIALOG_DATA } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal, output, signal, untracked,
} from '@angular/core';
import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { InstructorApi, esValoracionYaEntregada } from '../../../core/api/instructor.api';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  CompetencyEvidence, CompetencyEvidenceItem, CompetencyLevelEntry, FormativeLevel, OwnerEvaluationEntry,
  RubricCriterionView, RubricEvaluationView, RubricLevelOption, descriptorDelNivel,
} from '../../../core/models/revision.model';
import { UiBadge, UiBadgeTone } from '../../../shared/ui/badge/ui-badge';
import { UiBarraAcciones } from '../../../shared/ui/barra-acciones/ui-barra-acciones';
import { UiButton } from '../../../shared/ui/button/ui-button';
import { UiDialog, UiDialogFrame } from '../../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../../shared/ui/field/ui-field';
import { UiTooltip } from '../../../shared/ui/tooltip/ui-tooltip';
import { DRAFT_COPY } from '../draft-copy';
import { cleanText, formativeLevelLabel, formativeLevelTone, responseClassAccent } from '../trace-labels.util';
import { ValoracionDocenteComponent } from '../valoracion-docente.component';
import {
  FormSnapshot, ScoreEnviado, accionDeTecla, conservarEdiciones, esGuardarConTeclado, evidenciaDe, marcaDeTiempo, sameSnapshot, sistemaDe,
  snapshotOf, textoDeAvance, vistaDelEstudiante,
} from './rubrica-intento.modelo';

/** Los cuatro niveles con su nombre, para cuando el servidor no manda los descriptores. */
const DEFAULT_LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: DRAFT_COPY.levelEnInicio.text, descriptor: '' },
  { value: 'EN_PROCESO', label: DRAFT_COPY.levelEnProceso.text, descriptor: '' },
  { value: 'LOGRADO', label: DRAFT_COPY.levelLogrado.text, descriptor: '' },
  { value: 'DESTACADO', label: DRAFT_COPY.levelDestacado.text, descriptor: '' },
];

/** Los cuatro peldaños del escalón de píxeles que acompaña a cada nivel (decorativo: orienta sin pedir lectura). */
const PELDANOS = [0, 1, 2, 3] as const;

/** BORRADOR (VD-23): textos de la valoración, pendientes de la aprobación de Psicología. Los de B5b se conservan. */
const COPY = {
  levelHint: 'Elige el nivel que mejor describe la evidencia de este criterio.',
  levelRequired: 'Elige un nivel para este criterio.',
  levelsMissing: 'Elige un nivel en cada criterio para guardar la valoración.',
  levelOrComment: 'Elige un nivel o escribe una retroalimentación para guardar.',
  saveFailed: 'No fue posible guardar la evaluación. Intenta nuevamente o verifica tus permisos.',
  saved: 'Evaluación guardada correctamente.',
  // Hoy guardar una valoración completa la entrega: la pantalla lo dice antes de que pase (EDITOR §5.4).
  deliveryNote: 'Al guardarla, tu estudiante la verá en el cierre del caso.',
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (idea de Kimi-c, EDITOR §5.4).
  correctionNote: 'Ya la entregaste. Si guardas cambios, tu estudiante verá la versión nueva.',
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (RK-5).
  draftSaved: 'Guardada sin entregar. Tu estudiante todavía no la ve.',
  alreadyDelivered: 'Esta valoración ya se entregó a tu estudiante. Para corregirla, usa «Guardar evaluación»: lo que escribiste sigue aquí.',
  commentNeedsLevel: 'Elige un nivel para guardar esta observación.',
  commentsNeedLevel: 'Las observaciones se guardan con su nivel: elige el nivel de los criterios marcados.',
  missingReason: 'Elige el nivel de los criterios marcados para guardar.',
  previewDescription: 'Así verá tu estudiante esta valoración en el cierre del caso, con lo que tienes en pantalla. El nivel global se calcula al guardarla.',
  noEvidence: 'Ninguna decisión del intento tocó esta competencia.',
} as const;

/**
 * Valoración de un intento con la rúbrica del caso: el panel de la tercera columna de Revisión (EDITOR §5.4, bloque
 * R2, sobre la extracción de B5b). Cada criterio es una fila de la matriz criterio × nivel girada para caber en 26rem:
 * los cuatro niveles son botones de opción nativos en una fila (2 × 2 si la columna es estrecha), con su significado
 * debajo; la evidencia (RK-4) en fichas que llevan a la decisión; la observación, plegada. Nunca un número (RN-09).
 *
 * Guardar es un acto (P8): «Guardar evaluación» exige un nivel por criterio y la entrega; «Guardar sin entregar»
 * (RK-5) solo existe antes de la primera entrega y con un servidor que lo entiende. Se teclea entera: 1-4 eligen el
 * nivel y pasan al siguiente criterio, 0 lo quita, ↑/↓ cambian de criterio, C abre la observación y Ctrl+Enter guarda.
 *
 * Patrones: el estado del formulario es State con señales enlazadas (`linkedSignal`: se reinicia solo al cambiar la
 * entrada); la lógica sin pantalla vive en `rubrica-intento.modelo.ts` (funciones puras); la API se toca únicamente por
 * el adaptador `InstructorApi`; la pantalla se entera por salidas (Observer), sin que este panel sepa qué hace ella.
 */
@Component({
  selector: 'app-rubrica-intento',
  imports: [UiBadge, UiBarraAcciones, UiButton, UiControl, UiField, UiTooltip],
  templateUrl: './rubrica-intento.component.html',
  styleUrl: './rubrica-intento.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `tr-rubric` es el nombre que usan las pruebas de extremo a extremo (EDITOR §6.2): se conserva junto al de B5b.
  host: { class: 'ri tr-rubric', '(keydown)': 'onTeclaPanel($event)' },
})
export class RubricaIntentoComponent {
  private static siguienteId = 0;

  private readonly instructorApi = inject(InstructorApi);
  private readonly notify = inject(NotificationService);
  private readonly announcer = inject(LiveRegionAnnouncer);
  private readonly dialog = inject(UiDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly attemptId = input.required<string>();
  readonly evaluacion = input<RubricEvaluationView | null>(null);
  /** RK-4: las decisiones del intento por competencia. Sin el campo (servidor anterior) no se pintan las fichas. */
  readonly evidencia = input<readonly CompetencyEvidence[] | null | undefined>(null);
  /** Lo que calculó el sistema por competencia: el servidor solo lo manda después de que la docente guarda la suya. */
  readonly sistema = input<readonly CompetencyLevelEntry[] | null | undefined>(null);
  /** Hay otro intento por revisar en la bandeja: solo entonces se ofrece «Siguiente por revisar». */
  readonly haySiguiente = input(false);

  /** Se guardó; `entregada` dice si fue la entrega (la bandeja deja de contarlo «Por revisar») o un borrador. */
  readonly guardada = output<{ entregada: boolean }>();
  /** El código de competencia del criterio enfocado: la columna de evidencia resalta esas decisiones. */
  readonly criterioEnfocado = output<string | null>();
  /** El número de orden de una decisión: la columna de evidencia se desplaza hasta ella. */
  readonly irADecision = output<number>();
  /** La bandeja abre el siguiente intento por revisar. */
  readonly siguiente = output<void>();

  protected readonly copy = COPY;
  protected readonly peldanos = PELDANOS;
  /** Rótulo del total (RN-09): la valoración es formativa, no una nota oficial. */
  protected readonly valuationLabel = DRAFT_COPY.formativeValuationLabel.text;
  /** Prefijo de ids propio de cada panel: dos paneles en la misma página no comparten nombres de grupo. */
  protected readonly prefijo = `ri-${++RubricaIntentoComponent.siguienteId}`;

  /** Lo guardado: parte de la entrada y, tras guardar con éxito, pasa a ser lo que se envió. */
  private readonly base = linkedSignal<FormSnapshot>(() => snapshotOf(this.evaluacion()));
  /**
   * Lo que la docente tocó desde que pulsó guardar por última vez (niveles y observaciones por id de criterio; la
   * retroalimentación general aparte). Vuelve a vacío al cambiar de intento.
   */
  private readonly tocados = linkedSignal(() => (this.attemptId(), { levels: new Set<number>(), comments: new Set<number>(), comment: false }));
  /**
   * Lo que se ve y se edita. Cuando lo guardado cambia sin cambiar de intento (respuesta del guardado o recarga
   * silenciosa), lo tocado en el entretanto se conserva (`conservarEdiciones`); al cambiar de intento, se parte de cero.
   */
  private readonly fuente = computed(() => ({ attemptId: this.attemptId(), base: this.base() }));
  readonly levels = linkedSignal<{ attemptId: string; base: FormSnapshot }, Record<number, FormativeLevel | null>>({
    source: this.fuente,
    computation: (fuente, previo) => conservarEdiciones(fuente.base.levels,
      previo?.source.attemptId === fuente.attemptId ? previo.value : undefined, untracked(this.tocados).levels),
  });
  readonly comments = linkedSignal<{ attemptId: string; base: FormSnapshot }, Record<number, string>>({
    source: this.fuente,
    computation: (fuente, previo) => conservarEdiciones(fuente.base.comments,
      previo?.source.attemptId === fuente.attemptId ? previo.value : undefined, untracked(this.tocados).comments),
  });
  readonly comment = linkedSignal<{ attemptId: string; base: FormSnapshot }, string>({
    source: this.fuente,
    computation: (fuente, previo) => (previo?.source.attemptId === fuente.attemptId && untracked(this.tocados).comment
      ? previo.value : fuente.base.comment),
  });

  /** Qué se está guardando: la entrega o el borrador (cada botón muestra su propia carga). */
  readonly saving = signal<'entrega' | 'borrador' | null>(null);
  /** El aviso de la valoración (falta un nivel, el servidor la rechazó); vuelve a vacío al cambiar de intento. */
  readonly mensaje = linkedSignal<string>(() => (this.attemptId(), ''));
  readonly mensajeEsError = linkedSignal<boolean>(() => (this.attemptId(), false));
  readonly validationErrors = linkedSignal<Record<number, string>>(() => (this.evaluacion(), {}));
  /** La observación de un criterio está abierta si ya tiene texto; si no, tras «Observación». */
  private readonly observacionesAbiertas = linkedSignal<Record<number, boolean>>(() =>
    Object.fromEntries(Object.entries(this.base().comments).map(([id, text]) => [id, !!text.trim()])));
  /** El nivel con el foco del teclado, para leer su significado antes de elegirlo. */
  private readonly enfocado = signal<{ criterionId: number; level: FormativeLevel } | null>(null);
  /** El servidor dijo 409 (ya entregada) aunque la vista no lo supiera: no se vuelve a ofrecer el borrador. */
  private readonly entregadaAhora = linkedSignal<boolean>(() => (this.attemptId(), false));
  /** Se acaba de entregar en esta sesión: aparece «Siguiente por revisar». */
  private readonly recienEntregada = linkedSignal<boolean>(() => (this.attemptId(), false));
  /** El último código emitido a la columna de evidencia, para no repetir el mismo resaltado en cada foco. */
  private ultimoEnfocado: string | null = null;

  protected readonly criteria = computed(() => this.evaluacion()?.criteria ?? []);
  /** Los cuatro niveles con su descriptor general; si el servidor no los manda, solo sus nombres. */
  protected readonly rubricLevels = computed<RubricLevelOption[]>(() => {
    const served = this.evaluacion()?.levels;
    return served?.length ? served : DEFAULT_LEVELS;
  });
  protected readonly entregada = computed(() => this.evaluacion()?.status === 'EVALUATED' || this.entregadaAhora());
  /**
   * RK-5 llegó con R0 junto con RK-2, que siempre manda `levelDescriptors` en cada criterio (aunque sea `{}`): es la
   * señal de que el servidor entiende `deliver`. Un servidor anterior lo ignoraría y ENTREGARÍA una valoración
   * completa que la docente quiso dejar pendiente; por eso, sin esa señal, no se ofrece el botón.
   */
  protected readonly admiteBorrador = computed(() => this.criteria().some(item => item.levelDescriptors !== undefined));
  protected readonly puedeGuardarSinEntregar = computed(() => this.admiteBorrador() && !this.entregada());
  protected readonly cambios = computed(() =>
    !!this.evaluacion()
    && !sameSnapshot({ levels: this.levels(), comments: this.comments(), comment: this.comment() }, this.base()));
  protected readonly faltan = computed(() => this.criteria().filter(item => !this.levels()[item.id]).length);
  /** «Faltan dos criterios por valorar.»: en palabras, como pide RN-09 para todo el panel. */
  protected readonly avance = computed(() => textoDeAvance(this.faltan(), this.criteria().length));
  protected readonly notaEntrega = computed(() => (this.entregada() ? COPY.correctionNote : COPY.deliveryNote));
  protected readonly mostrarSiguiente = computed(() => this.recienEntregada() && this.haySiguiente() && !this.cambios());

  /** Hay algo escrito o elegido que no se ha guardado (para preguntar antes de salir o de cambiar de intento). */
  hayCambios(): boolean {
    return this.cambios();
  }

  // ── Lectura de cada criterio ─────────────────────────────────────────────────────────────────────────────────
  protected tituloId(criterion: RubricCriterionView): string {
    return `${this.prefijo}-titulo-${criterion.id}`;
  }

  protected descriptorId(criterion: RubricCriterionView): string {
    return `${this.prefijo}-significado-${criterion.id}`;
  }

  protected errorId(criterion: RubricCriterionView): string {
    return `${this.prefijo}-error-${criterion.id}`;
  }

  protected observacionId(criterion: RubricCriterionView): string {
    return `${this.prefijo}-observacion-${criterion.id}`;
  }

  protected grupo(criterion: RubricCriterionView): string {
    return `${this.prefijo}-nivel-${criterion.id}`;
  }

  protected describedBy(criterion: RubricCriterionView): string {
    return this.fieldError(criterion.id)
      ? `${this.descriptorId(criterion)} ${this.errorId(criterion)}`
      : this.descriptorId(criterion);
  }

  /** El nivel que se explica: el que tiene el foco del teclado o, si no, el elegido. */
  private nivelLeido(criterion: RubricCriterionView): FormativeLevel | null {
    const foco = this.enfocado();
    return foco?.criterionId === criterion.id ? foco.level : this.levels()[criterion.id] ?? null;
  }

  protected significadoNivel(criterion: RubricCriterionView): string | null {
    const level = this.nivelLeido(criterion);
    return level ? this.rubricLevels().find(option => option.value === level)?.label ?? null : null;
  }

  /** Qué significa ese nivel en ESTE criterio (RK-2) o, si no lo dice, el general; sin nivel, cómo elegir. */
  protected significado(criterion: RubricCriterionView): string {
    return descriptorDelNivel(criterion, this.nivelLeido(criterion), this.rubricLevels()) || COPY.levelHint;
  }

  protected tieneSignificado(criterion: RubricCriterionView): boolean {
    return !!descriptorDelNivel(criterion, this.nivelLeido(criterion), this.rubricLevels());
  }

  protected fieldError(criterionId: number): string | null {
    return this.validationErrors()[criterionId] ?? null;
  }

  protected hasErrors(): boolean {
    return Object.keys(this.validationErrors()).length > 0;
  }

  protected observacionAbierta(criterion: RubricCriterionView): boolean {
    return !!this.observacionesAbiertas()[criterion.id] || !!(this.comments()[criterion.id] ?? '').trim();
  }

  protected evidenciaDe(criterion: RubricCriterionView): CompetencyEvidence | null {
    return evidenciaDe(criterion, this.evidencia());
  }

  protected conEvidencia(): boolean {
    return Array.isArray(this.evidencia());
  }

  protected sistemaDe(criterion: RubricCriterionView): CompetencyLevelEntry | null {
    return sistemaDe(criterion, this.sistema());
  }

  protected marca(item: CompetencyEvidenceItem): string | null {
    return marcaDeTiempo(item.atSeconds);
  }

  protected acento(item: CompetencyEvidenceItem): string {
    return responseClassAccent(item.class);
  }

  /** Lo que se lee al pasar por la ficha: la decisión completa (en la ficha solo cabe dónde y cuándo). */
  protected nombreFicha(item: CompetencyEvidenceItem): string {
    const cuando = this.marca(item);
    return `Ir a la decisión en ${cleanText(item.nodeTitle, 'la escena')}${cuando ? `, minuto ${cuando}` : ''}: «${cleanText(item.optionText, 'sin texto')}»`;
  }

  // ── Elegir un nivel ──────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Clic (o Espacio) sobre un nivel. Elegir otra vez el que ya estaba lo quita, como en Canvas («Sin calificar»). El
   * clic llega antes que `change`, con el nivel anterior todavía en la señal: así se distingue «otra vez el mismo».
   */
  protected onNivelClick(criterion: RubricCriterionView, level: FormativeLevel): void {
    this.setLevel(criterion, this.levels()[criterion.id] === level ? null : level);
  }

  /** Las flechas ← → mueven la selección del grupo nativo: se refleja sin alternar. */
  protected onNivelChange(criterion: RubricCriterionView, level: FormativeLevel): void {
    if (this.levels()[criterion.id] !== level) this.setLevel(criterion, level);
  }

  protected onNivelFoco(criterion: RubricCriterionView, level: FormativeLevel): void {
    this.enfocado.set({ criterionId: criterion.id, level });
  }

  protected onEscalaSale(event: FocusEvent): void {
    const destino = event.relatedTarget as Node | null;
    if (!destino || !(event.currentTarget as HTMLElement).contains(destino)) this.enfocado.set(null);
  }

  /** La docente eligió (o quitó) el nivel de un criterio: se limpia el error de ESE criterio y se conservan los demás. */
  private setLevel(criterion: RubricCriterionView, level: FormativeLevel | null): void {
    this.levels.update(levels => ({ ...levels, [criterion.id]: level }));
    this.tocados.update(t => ({ ...t, levels: new Set(t.levels).add(criterion.id) }));
    const next = { ...this.validationErrors() };
    delete next[criterion.id];
    this.validationErrors.set(next);
    if (!Object.keys(next).length && this.mensajeEsError()) this.setMessage('', false);
  }

  // ── Teclado (EDITOR §5.4) ────────────────────────────────────────────────────────────────────────────────────
  /** Ctrl+Enter guarda desde cualquier lugar del panel, también desde un campo de texto. */
  protected onTeclaPanel(event: KeyboardEvent): void {
    if (!esGuardarConTeclado(event)) return;
    event.preventDefault();
    this.save();
  }

  /** Las teclas de una cifra o letra solo actúan aquí, con el foco en el grupo de niveles (WCAG 2.1.4). */
  protected onTeclaEscala(event: KeyboardEvent, index: number): void {
    const accion = accionDeTecla(event);
    const criterion = this.criteria()[index];
    if (!accion || !criterion) return;
    event.preventDefault();
    switch (accion.tipo) {
      case 'nivel':
        this.setLevel(criterion, accion.nivel);
        this.enfocarCriterio(index + 1);
        break;
      case 'quitar':
        this.setLevel(criterion, null);
        break;
      case 'anterior':
        this.enfocarCriterio(index - 1);
        break;
      case 'siguiente':
        this.enfocarCriterio(index + 1);
        break;
      case 'observacion':
        this.abrirObservacion(criterion);
        break;
    }
  }

  /** Lleva el foco al nivel elegido (o al primero) de un criterio; tras el último, a la retroalimentación. */
  private enfocarCriterio(index: number): void {
    const criteria = this.criteria();
    if (index < 0) return;
    if (index >= criteria.length) {
      this.host.querySelector<HTMLTextAreaElement>('.ri__general textarea')?.focus();
      return;
    }
    const criterion = criteria[index];
    const radios = [...this.host.querySelectorAll<HTMLInputElement>(`input[name="${this.grupo(criterion)}"]`)];
    const elegido = this.levels()[criterion.id];
    (radios.find(radio => radio.value === elegido) ?? radios[0])?.focus();
  }

  /** Esc cierra el globo «Teclas» y devuelve el foco a su botón (un `details` no lo hace solo). */
  protected cerrarGlobo(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement;
    if (!details.open) return;
    event.stopPropagation();
    details.open = false;
    details.querySelector<HTMLElement>('summary')?.focus();
  }

  // ── Observación y evidencia ──────────────────────────────────────────────────────────────────────────────────
  protected abrirObservacion(criterion: RubricCriterionView): void {
    this.observacionesAbiertas.update(abiertas => ({ ...abiertas, [criterion.id]: true }));
    // El campo nace en este mismo ciclo: se enfoca cuando ya está en el documento.
    queueMicrotask(() => this.host.querySelector<HTMLTextAreaElement>(`#${this.observacionId(criterion)}`)?.focus());
  }

  /** Entrar a un criterio resalta en la columna de evidencia las decisiones de su competencia. */
  protected onFocoCriterio(criterion: RubricCriterionView): void {
    const code = criterion.competency || null;
    if (code === this.ultimoEnfocado) return;
    this.ultimoEnfocado = code;
    this.criterioEnfocado.emit(code);
  }

  protected irA(item: CompetencyEvidenceItem): void {
    this.irADecision.emit(item.order);
  }

  protected onCriterionComment(criterionId: number, value: string): void {
    this.comments.update(comments => ({ ...comments, [criterionId]: value }));
    this.tocados.update(t => ({ ...t, comments: new Set(t.comments).add(criterionId) }));
    if (this.validationErrors()[criterionId] === COPY.commentNeedsLevel && !value.trim()) {
      const next = { ...this.validationErrors() };
      delete next[criterionId];
      this.validationErrors.set(next);
    }
  }

  protected onComment(value: string): void {
    this.comment.set(value);
    this.tocados.update(t => ({ ...t, comment: true }));
  }

  // ── Guardar ──────────────────────────────────────────────────────────────────────────────────────────────────
  save(): void {
    const rubric = this.evaluacion();
    if (!rubric || this.saving()) return;

    // Cada criterio necesita su nivel: la valoración formativa se guarda completa (un nivel por criterio).
    if (!this.validateRubricLevels(rubric)) {
      this.setMessage(COPY.levelsMissing, true);
      this.announcer.announce(COPY.levelsMissing, 'polite');
      this.enfocarPrimerError();
      return;
    }

    const scores = this.scoresOf(rubric);

    // Una rúbrica sin criterios no tiene niveles que enviar: sin ellos hace falta al menos la retroalimentación.
    if (!scores.length && !cleanText(this.comment(), '')) {
      this.setMessage(COPY.levelOrComment, true);
      this.announcer.announce(COPY.levelOrComment, 'assertive');
      return;
    }

    this.send(rubric, scores, true);
  }

  /**
   * «Guardar sin entregar» (RK-5): guarda lo que haya, completo o no, y lo deja pendiente. El servidor solo guarda la
   * observación de un criterio que tiene nivel: si alguna no lo tiene, se pide antes de enviar, para no perderla.
   */
  guardarSinEntregar(): void {
    const rubric = this.evaluacion();
    if (!rubric || this.saving() || !this.puedeGuardarSinEntregar()) return;

    const errors: Record<number, string> = {};
    for (const criterion of rubric.criteria) {
      if (!this.levels()[criterion.id] && (this.comments()[criterion.id] ?? '').trim()) errors[criterion.id] = COPY.commentNeedsLevel;
    }
    this.validationErrors.set(errors);
    if (Object.keys(errors).length) {
      this.setMessage(COPY.commentsNeedLevel, true);
      this.announcer.announce(COPY.commentsNeedLevel, 'polite');
      this.enfocarPrimerError();
      return;
    }

    const scores = this.scoresOf(rubric).filter(score => !!score.level);
    if (!scores.length && !cleanText(this.comment(), '')) {
      this.setMessage(COPY.levelOrComment, true);
      this.announcer.announce(COPY.levelOrComment, 'assertive');
      return;
    }
    this.send(rubric, scores, false);
  }

  /** «Ver cómo lo leerá»: la misma pieza que lee el estudiante en el cierre del caso, con lo que hay en pantalla. */
  verComoLoLeera(origen: HTMLElement): void {
    const rubric = this.evaluacion();
    if (!rubric) return;
    const actual: FormSnapshot = { levels: this.levels(), comments: this.comments(), comment: this.comment() };
    this.dialog.sheet(VistaDelEstudianteHoja, {
      side: 'end',
      origen,
      data: vistaDelEstudiante(rubric, actual, this.rubricLevels(), this.cambios()),
    });
  }

  /** Lo que viaja al servidor: un nivel y una observación por criterio, nunca un número. */
  private scoresOf(rubric: RubricEvaluationView): ScoreEnviado[] {
    const levels = this.levels();
    const comments = this.comments();
    return rubric.criteria.map(criterion => ({
      criterionId: criterion.id,
      level: levels[criterion.id] as FormativeLevel,
      comment: cleanText(comments[criterion.id], ''),
    }));
  }

  private send(rubric: RubricEvaluationView, scores: ScoreEnviado[], entregar: boolean): void {
    const attemptId = this.attemptId();
    const sent: FormSnapshot = { levels: { ...this.levels() }, comments: { ...this.comments() }, comment: this.comment() };
    this.saving.set(entregar ? 'entrega' : 'borrador');
    this.setMessage('', false);
    // Lo enviado deja de contar como tocado; lo que se toque desde aquí se conserva al llegar la respuesta.
    const tocadosAlEnviar = this.tocados();
    this.tocados.set({ levels: new Set(), comments: new Set(), comment: false });

    // Entregar viaja con el cuerpo de siempre (un servidor anterior a R0 no recibe nada nuevo); el borrador, con
    // `deliver: false`, que solo se ofrece si el servidor lo entiende (`admiteBorrador`).
    const request = entregar
      ? this.instructorApi.saveRubric(attemptId, rubric.rubricId, this.comment(), scores)
      : this.instructorApi.saveRubric(attemptId, rubric.rubricId, this.comment(), scores, { deliver: false });

    request.subscribe({
      next: () => {
        this.saving.set(null);
        this.notify.success(entregar ? COPY.saved : COPY.draftSaved);
        // Si en el entretanto se abrió otro intento, el resultado no se pinta sobre él.
        if (this.attemptId() !== attemptId) return;
        // Lo enviado pasa a ser lo guardado: ya no hay cambios que avisar mientras la pantalla recarga.
        this.base.set(sent);
        if (entregar) {
          this.entregadaAhora.set(true);
          this.recienEntregada.set(true);
        }
        this.guardada.emit({ entregada: entregar });
      },
      error: (error: unknown) => {
        this.saving.set(null);
        if (this.attemptId() !== attemptId) return;
        // No se guardó: lo enviado vuelve a contar como tocado, junto con lo tocado en el entretanto.
        const ahora = this.tocados();
        this.tocados.set({
          levels: new Set([...tocadosAlEnviar.levels, ...ahora.levels]),
          comments: new Set([...tocadosAlEnviar.comments, ...ahora.comments]),
          comment: tocadosAlEnviar.comment || ahora.comment,
        });
        // 409 de RK-5: alguien la entregó (otra pestaña). Lo escrito se queda y el borrador deja de ofrecerse.
        const yaEntregada = !entregar && esValoracionYaEntregada(error);
        if (yaEntregada) this.entregadaAhora.set(true);
        const texto = yaEntregada ? COPY.alreadyDelivered : COPY.saveFailed;
        this.setMessage(texto, true);
        // Es el único rastro del fallo (no hay aviso emergente): se anuncia como los demás errores de la pantalla (F6-12).
        this.announcer.announce(texto, 'assertive');
      },
    });
  }

  protected levelLabel(level: string | null | undefined): string {
    return formativeLevelLabel(level);
  }

  protected levelTone(level: string | null | undefined): UiBadgeTone {
    return formativeLevelTone(level);
  }

  protected clean(value: string | null | undefined, fallback: string): string {
    return cleanText(value, fallback);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private setMessage(text: string, isError: boolean): void {
    this.mensaje.set(text);
    this.mensajeEsError.set(isError);
  }

  private validateRubricLevels(rubric: RubricEvaluationView): boolean {
    const levels = this.levels();
    const errors: Record<number, string> = {};
    for (const criterion of rubric.criteria) {
      if (!levels[criterion.id]) errors[criterion.id] = COPY.levelRequired;
    }
    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  /** Tras un error de validación, el foco va al primer criterio marcado (quien teclea no tiene que buscarlo). */
  private enfocarPrimerError(): void {
    const index = this.criteria().findIndex(item => !!this.validationErrors()[item.id]);
    if (index >= 0) this.enfocarCriterio(index);
  }
}

/**
 * La hoja de «Ver cómo lo leerá»: monta `app-valoracion-docente` (R3), la MISMA pieza del cierre del estudiante, con
 * la forma `OwnerEvaluationEntry` armada desde el formulario. No pide datos ni guarda nada.
 */
@Component({
  selector: 'app-vista-del-estudiante-hoja',
  imports: [UiDialogFrame, ValoracionDocenteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame title="Así la leerá tu estudiante" [description]="descripcion">
      <app-valoracion-docente [valoracion]="data" />
    </ui-dialog-frame>
  `,
})
export class VistaDelEstudianteHoja {
  protected readonly data = inject<OwnerEvaluationEntry>(DIALOG_DATA);
  protected readonly descripcion = COPY.previewDescription;
}
