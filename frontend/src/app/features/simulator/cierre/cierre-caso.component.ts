import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, of } from 'rxjs';

import { SimulationService } from '../../../core/api/simulation.service';
import { AttemptCompletionReport, CaseBrief, DecisionReviewItem, OwnerEvaluation, StudentAttemptSummary } from '../../../core/models/simulation.model';
import { UiButton } from '../../../shared/ui/button/ui-button';
import { UiCard } from '../../../shared/ui/card/ui-card';
import { UiCabeceraIlustrada } from '../../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiScopeNotice } from '../../../shared/ui/scope-notice/ui-scope-notice';
import { UiSection } from '../../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus } from '../../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../../shared/ui/state/ui-error-state';
import { DRAFT_COPY } from '../draft-copy';
import { levelWord, milestoneMark, missedFactsText, responseClassWord } from '../outcome-text.util';
import { RECONSIDERED_LABEL } from '../reconsidered.util';
import { ValoracionDocenteComponent } from '../valoracion-docente.component';
import { CIERRE_COPY } from './cierre-copy';

/** Una escena con las decisiones que se tomaron en ella (el reporte las trae en orden, una por decisión). */
interface EscenaDeDecisiones {
  nodeId: number;
  titulo: string;
  decisiones: DecisionReviewItem[];
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });

/** «3 de marzo de 2026»; nada si la fecha no es válida (un reporte sin fecha no inventa una). */
function fechaEnPalabras(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : FORMATO_FECHA.format(fecha);
}

/**
 * Cierre del caso (DISENO §4.5, DP-13, DP-27): `/portal/simulador/:caseVersionId/cierre/:attemptId`. Es el momento de
 * «análisis» del debriefing: a ritmo propio, en la piel del portal y sin cifras ni tiempos (P6). El orden es el cuidado:
 * primero el apoyo, luego qué buscaba el caso, el recorrido, la retroalimentación docente y qué sigue.
 *
 * **Cada fuente falla por separado.** Cuatro peticiones en paralelo, cada una con su propio estado:
 * el reporte (`studentReport`, el mismo que usa el resultado del juego), la ficha para los objetivos, la valoración del
 * docente (BK-5) y el historial solo para la fecha. Si falla una, esa sección dice qué pasó y se puede reintentar; las
 * demás siguen vivas. La única que bloquea la página es el reporte con 403 o 404: un intento que no es tuyo no muestra
 * nada más (ni siquiera la ficha), solo explica.
 *
 * La retroalimentación la pinta `app-valoracion-docente`, la misma pieza que la docente ve en «Ver cómo lo leerá» (R3).
 */
@Component({
  selector: 'app-cierre-caso',
  imports: [
    MatIconModule, RouterLink, UiButton, UiCard, UiCabeceraIlustrada, UiErrorState, UiScopeNotice, UiSection, UiSkeleton,
    ValoracionDocenteComponent,
  ],
  templateUrl: './cierre-caso.component.html',
  styleUrl: './cierre-caso.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CierreCasoComponent {
  private readonly simulation = inject(SimulationService);

  /** Por `withComponentInputBinding`, desde la ruta. */
  readonly caseVersionId = input<string>();
  readonly attemptId = input<string>();

  protected readonly copy = CIERRE_COPY;
  protected readonly draft = DRAFT_COPY;
  protected readonly reconsideradoEtiqueta = RECONSIDERED_LABEL;

  // Las cuatro fuentes. Cada `rxResource` se vuelve a pedir si cambia la ruta y cancela la petición anterior.
  protected readonly reporte = rxResource<AttemptCompletionReport, string | undefined>({
    params: () => this.attemptId(),
    stream: ({ params }) => (params === undefined ? EMPTY : this.simulation.studentReport(params)),
  });
  /**
   * El reporte respondió: el intento es de quien mira (Codex B4d, hallazgo 6). Hasta entonces no se pide ni se pinta
   * ninguna otra fuente, así un 403 o 404 que llega tarde nunca deja ver la valoración o la ficha un instante.
   */
  private readonly autorizado = computed(() => this.reporte.hasValue());
  protected readonly ficha = rxResource<CaseBrief, number | undefined>({
    // La ficha es la del caso DEL INTENTO, no la del número de la URL (Codex B4d, hallazgo 5): una URL con el intento del
    // caso A y el número del caso B no mezcla el recorrido de A con los objetivos de B.
    params: () => this.casoDelIntento() ?? undefined,
    stream: ({ params }) => (params === undefined ? EMPTY : this.simulation.getCaseBrief(params)),
  });
  protected readonly valoracion = rxResource<OwnerEvaluation, string | undefined>({
    params: () => (this.autorizado() ? this.attemptId() : undefined),
    stream: ({ params }) => (params === undefined ? EMPTY : this.simulation.getOwnerEvaluation(params)),
  });
  /** Solo para la fecha: si falla o no la trae, el encabezado no dice fecha y ya. */
  private readonly historial = rxResource<StudentAttemptSummary[], string | undefined>({
    params: () => (this.autorizado() ? this.attemptId() : undefined),
    stream: ({ params }) => (params === undefined ? EMPTY : this.simulation.attemptHistory().pipe(catchError(() => of([])))),
  });

  private estado(recurso: { error(): unknown }): number | null {
    // Angular envuelve en un Error lo que no lo es (un HttpErrorResponse no lo es): el estado HTTP vive en `cause`.
    const error = recurso.error() as { status?: number; cause?: { status?: number } } | undefined;
    return error ? (error.status ?? error.cause?.status ?? 0) : null;
  }

  /** El caso al que pertenece el intento, según el historial del propio estudiante; `null` mientras no se sabe. */
  private readonly casoDelIntento = computed<number | null>(() => {
    if (!this.historial.hasValue()) return null;
    const id = this.attemptId();
    return this.historial.value().find(a => String(a.attemptId) === id)?.caseVersionId ?? null;
  });
  /** A dónde lleva «Intentar de nuevo»: el caso del intento si se sabe; si no, el de la URL. */
  protected readonly casoParaEnlaces = computed(() => this.casoDelIntento() ?? Number(this.caseVersionId()));

  protected readonly estadoReporte = computed(() => this.estado(this.reporte));
  /** Intento ajeno (403) o inexistente (404): ninguna sección se pide ni se pinta. */
  protected readonly bloqueado = computed(() => {
    const status = this.estadoReporte();
    return status === 403 || status === 404;
  });
  protected readonly mensajeBloqueo = computed(() => (this.estadoReporte() === 404 ? CIERRE_COPY.noEncontrado : CIERRE_COPY.sinPermiso));
  protected readonly tipoBloqueo = computed(() => errorKindFromStatus(this.estadoReporte()));

  protected readonly r = computed<AttemptCompletionReport | null>(() => (this.reporte.hasValue() ? this.reporte.value() : null));
  /** Falló el reporte por algo que reintentar puede arreglar (red, servidor). */
  protected readonly errorRecorrido = computed(() => this.estadoReporte() !== null && !this.bloqueado());
  protected readonly cargandoRecorrido = computed(() => this.reporte.isLoading() && !this.r());

  protected readonly objetivos = computed(() => (this.ficha.hasValue() ? this.ficha.value().learningObjectives : []).map(o => o.trim()).filter(Boolean));
  /** 403 o 404 de la ficha: la sección se omite sin ruido (caso que ya no es de este estudiante o ya no está publicado). Otro fallo sí se dice. */
  protected readonly estadoFicha = computed(() => this.estado(this.ficha));
  protected readonly errorFicha = computed(() => {
    const status = this.estadoFicha();
    return status !== null && status !== 403 && status !== 404;
  });
  protected readonly cargandoFicha = computed(() => this.ficha.isLoading() && !this.ficha.hasValue());

  /** La primera valoración concluida del docente; las del sistema no se le muestran al estudiante aquí. */
  protected readonly valoracionDocente = computed(() => {
    if (!this.valoracion.hasValue()) return null;
    return this.valoracion.value().evaluations.find(e => e.origin === 'DOCENTE') ?? null;
  });
  protected readonly estadoValoracion = computed(() => this.estado(this.valoracion));
  protected readonly errorValoracion = computed(() => this.estadoValoracion() !== null);
  protected readonly cargandoValoracion = computed(() => this.valoracion.isLoading() && !this.valoracion.hasValue());

  protected readonly titulo = computed(() => this.r()?.caseTitle || CIERRE_COPY.tituloSinCargar);
  protected readonly salioSeguro = computed(() => this.r()?.status === 'SAFE_EXITED');
  protected readonly descripcion = computed<string | null>(() => {
    if (!this.r()) return null;
    const id = this.attemptId();
    const terminado = this.historial.hasValue() ? this.historial.value().find(a => String(a.attemptId) === id)?.endedAt : null;
    const fecha = fechaEnPalabras(terminado);
    if (this.salioSeguro()) return fecha ? CIERRE_COPY.salidaSegura(fecha) : CIERRE_COPY.salidaSeguraSinFecha;
    return fecha ? CIERRE_COPY.terminado(fecha) : CIERRE_COPY.terminadoSinFecha;
  });

  protected readonly apoyo = CIERRE_COPY.apoyoTexto(CIERRE_COPY.apoyoRecursoPorDefecto);

  /** La persona al cerrar, salvo que una razón del final ya la nombre (entonces no se repite). */
  protected readonly persona = computed(() => {
    const reporte = this.r();
    const label = reporte?.persona?.label;
    if (!reporte || !label) return null;
    const frase = `${DRAFT_COPY.endingPersonaPrefix.text} ${label}`.trim().replace(/\.$/, '');
    const yaLaDice = (reporte.ending?.reason ?? []).some(razon => razon.trim().replace(/\.$/, '') === frase);
    return yaLaDice ? null : label;
  });

  /** Las decisiones, agrupadas por escena y en el orden en que se tomaron. */
  protected readonly escenas = computed<EscenaDeDecisiones[]>(() => {
    const grupos = new Map<number, EscenaDeDecisiones>();
    for (const decision of [...(this.r()?.decisionReview ?? [])].sort((a, b) => a.order - b.order)) {
      const grupo = grupos.get(decision.nodeId) ?? { nodeId: decision.nodeId, titulo: decision.nodeTitle, decisiones: [] };
      grupo.decisiones.push(decision);
      grupos.set(decision.nodeId, grupo);
    }
    return [...grupos.values()];
  });

  protected readonly competencias = computed(() => {
    const reporte = this.r();
    if (!reporte || reporte.competenciesDeclared === false) return [];
    const niveles = reporte.competencyLevels ?? [];
    // Cuatro «Sin evidencia» seguidos no dicen nada: sin ningún nivel, la sección se omite.
    return niveles.some(c => c.level) ? niveles : [];
  });

  protected readonly recomendaciones = computed(() => (this.r()?.recommendations ?? []).filter(texto => texto.trim()));

  protected readonly claseEnPalabras = responseClassWord;
  protected readonly nivelEnPalabras = levelWord;
  protected readonly marcaDelHito = milestoneMark;

  /** «Te faltó: …» con lo que había que explorar; el respaldo si la opción dependía del rumbo del caso. */
  protected faltoPara(opcion: NonNullable<DecisionReviewItem['missed']>[number]): string {
    return opcion.missing.length ? `${DRAFT_COPY.missedNeeded.text} ${missedFactsText(opcion.missing)}` : DRAFT_COPY.missedNoFacts.text;
  }

  protected reintentarRecorrido(): void { this.reporte.reload(); }
  protected reintentarFicha(): void { this.ficha.reload(); }
  protected reintentarValoracion(): void { this.valoracion.reload(); }

  protected readonly tipoError = errorKindFromStatus;
}
