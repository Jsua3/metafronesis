import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { SimulationService } from '../../core/api/simulation.service';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { CaseBrief, CaseBriefCharacter, SimulationAttemptState } from '../../core/models/simulation.model';
import { UiBarraAcciones } from '../../shared/ui/barra-acciones/ui-barra-acciones';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiPortadaCaso } from '../../shared/ui/portada-caso/ui-portada-caso';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { CharacterVisual, resolveCharacter, resolveRecipeId } from '../character/kit/character-visual.resolver';
import { KitBundle } from '../character/kit/kit-engine';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { KitService } from '../character/kit/kit.service';
import { accessNotice } from './case-access.util';
import { CONSENT_RECORDER, ConsentNoticeStaleError } from './consent-recorder';
import { CONTENT_NOTICE_TEXT, DRAFT_COPY } from './draft-copy';

type BriefError = { status?: number; error?: { code?: string } | null };

/** Qué entrada pidió la persona: lo que el botón pulsado muestra «cargando» y lo que «Reintentar» repite. */
type Entrada = 'comenzar' | 'continuar' | 'nuevo';

/** Lo que el umbral del juego pinta desde el primer cuadro (DISENO §4.4: `history.state.umbral`). */
export interface UmbralEstado {
  titulo: string;
  portada: string | null;
}

const NOT_ASSIGNED = accessNotice({ allowed: false, reason: 'NOT_ASSIGNED' })!;
const NOT_FOUND_MESSAGE = 'No encontramos este caso: puede que ya no esté publicado o que el enlace esté mal.';
/** A partir de aquí las dos columnas caben lado a lado (`.p-dividida`, `_portal.scss`). */
const AMPLIO = '(min-width: 64rem)';
const PUNTERO_GRUESO = '(pointer: coarse)';

function coincide(consulta: string, porDefecto: boolean): boolean {
  try {
    return window.matchMedia?.(consulta).matches ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

/**
 * Ficha del caso antes de jugar: el prebriefing (INACSL) en una página (DISENO §4.3, DP-08; RF-16, CU-07; contrato C8).
 *
 * El ORDEN de la columna de lectura es la decisión de cuidado: primero el aviso de contenido (el mismo texto validado del
 * juego, `CONTENT_NOTICE_TEXT`), luego qué se practica y cómo funciona, y recién entonces el contexto (el contenido duro).
 * La columna «Tu entrada» dice en qué estado está el caso, recuerda la salida segura y lleva UNA acción principal.
 *
 * **Nunca crea el intento** (RN-07). Lo único que registra es el consentimiento (ETH-01), que es por versión del caso:
 * pulsar Comenzar o Continuar sin él lo registra en el servidor (`recordForCase`) y SOLO con la respuesta navega; si
 * falla, no se navega y se dice con «Reintentar». El juego conserva su diálogo como red de seguridad (URL directa, aviso
 * nuevo o consentimiento retirado en otra pestaña).
 *
 * «Empezar de nuevo» confirma la pérdida aquí (`UiDialog.consequence`, RN-07) y viaja con un permiso de un solo uso en el
 * estado de la navegación, ligado al intento que la persona vio y aceptó perder (DP-26): nunca por la URL.
 */
@Component({
  selector: 'app-case-brief',
  imports: [
    KitFigureComponent, MatIconModule, NgTemplateOutlet, RouterLink, UiBarraAcciones, UiButton, UiCard, UiErrorState,
    UiCabeceraIlustrada, UiPortadaCaso, UiScopeNotice, UiSection, UiSkeleton,
  ],
  templateUrl: './case-brief.component.html',
  styleUrl: './case-brief.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.p-con-barra-acciones]': "!amplio() && state() === 'ready'" },
})
export class CaseBriefComponent {
  protected irAlAviso(evento: Event): void {
    evento.preventDefault();
    document.getElementById('aviso')?.focus();
  }

  private readonly simulationService = inject(SimulationService);
  private readonly router = inject(Router);
  /**
   * La ficha ya se cerró (Codex B4b, hallazgo 7): una promesa que se resuelve después (el registro del consentimiento o el
   * diálogo de empezar de nuevo) no debe llevar al juego a quien ya está en otra pantalla.
   */
  private destruida = false;
  private readonly consent = inject(CONSENT_RECORDER);
  private readonly cache = inject(CaseAccessCache);
  private readonly dialog = inject(UiDialog);
  private readonly announcer = inject(LiveRegionAnnouncer);
  private readonly kit = inject(KitService);
  private readonly caseVersionId = Number(inject(ActivatedRoute).snapshot.paramMap.get('caseVersionId'));

  protected readonly noticeText = CONTENT_NOTICE_TEXT;
  protected readonly copy = DRAFT_COPY;

  protected readonly brief = signal<CaseBrief | null>(null);
  private readonly loading = signal(true);
  protected readonly error = signal<BriefError | null>(null);

  /** El intento abierto de este caso: `undefined` mientras no se sabe, `null` si no hay. Lo pinta antes la caché. */
  protected readonly intentoAbierto = signal<SimulationAttemptState | null | undefined>(undefined);
  /** El último intento terminado de este caso (para «Ver tu recorrido»), si lo hay. */
  protected readonly terminado = signal<string | null>(null);
  /** El servidor ya tiene el consentimiento de esta persona para esta versión del caso (`prime`). */
  protected readonly consentimientoDado = signal(false);
  /** La entrada en curso: deshabilita los botones (una doble pulsación no registra ni navega dos veces). */
  protected readonly entrando = signal<Entrada | null>(null);
  /** El registro del consentimiento falló (`fallo`) o el aviso cambió de versión (`aviso`, 409). */
  protected readonly errorEntrada = signal<'fallo' | 'aviso' | null>(null);
  private ultimaEntrada: (() => void) | null = null;

  /** Dos columnas (con «Tu entrada» pegajosa) o una sola, con las acciones en la barra del pie. */
  protected readonly amplio = signal(coincide(AMPLIO, true));
  /** Toque o ratón: «Cómo se juega» dice lo que de verdad hay que hacer en este aparato. */
  protected readonly punteroGrueso = signal(coincide(PUNTERO_GRUESO, false));

  protected readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.brief() === null),
  });
  protected readonly errorKind = computed(() => errorKindFromStatus(this.error()?.status));
  /** El texto propio de los dos errores que no son «algo falló»: el caso no es tuyo o no existe. */
  protected readonly errorMessage = computed<string | null>(() => {
    const error = this.error();
    if (error?.status === 403 && error.error?.code === 'ACCESS_NOT_ASSIGNED') return `${NOT_ASSIGNED.title}. ${NOT_ASSIGNED.detail}`;
    if (error?.status === 404) return NOT_FOUND_MESSAGE;
    return null;
  });

  protected readonly access = computed(() => {
    const brief = this.brief();
    return brief ? accessNotice(brief.access) : null;
  });
  /** Por qué no se puede empezar un intento (el servidor decide el acceso; aquí se dice con palabras). */
  protected readonly startBlockedReason = computed(() => {
    const notice = this.access();
    return notice ? `${notice.title}. ${notice.detail}` : null;
  });
  protected readonly characters = computed(() => {
    const bundle = this.kit.bundle();
    return (this.brief()?.characters ?? []).map(character => ({ ...character, visual: bundle ? this.visualOf(bundle, character) : null }));
  });
  protected readonly hasObjectives = computed(() => (this.brief()?.learningObjectives.length ?? 0) > 0);
  protected readonly hasContext = computed(() => !!this.brief()?.context.trim());
  protected readonly isPending = computed(() => !this.hasObjectives() && this.characters().length === 0);
  /** Los temas que el caso declara («En este caso aparecen:»); vacía si no declara ninguno o el servidor no los manda. */
  protected readonly temas = computed(() => (this.brief()?.temasSensibles ?? []).map(tema => tema.trim()).filter(Boolean));

  /** «5 escenas · Empiezas en la sala de urgencias · Puedes pausar cuando quieras» (BK-1; cada parte, si la hay). */
  protected readonly meta = computed(() => {
    const brief = this.brief();
    if (!brief) return null;
    const partes: string[] = [];
    if (brief.escenas) partes.push(`${brief.escenas} ${brief.escenas === 1 ? 'escena' : 'escenas'}`);
    const lugar = brief.inicio?.lugar?.trim();
    if (lugar) partes.push(`Empiezas en ${lugar}`);
    partes.push('Puedes pausar cuando quieras');
    return partes.join(' · ');
  });

  /** El estado del caso en palabras, para «Tu entrada». */
  protected readonly estado = computed(() => {
    const abierto = this.intentoAbierto();
    if (abierto) {
      const como = abierto.status === 'PAUSED' ? 'en pausa' : 'en curso';
      return { etiqueta: `Intento ${como}`, detalle: `Retomas en «${abierto.currentNode.title}».`, tono: 'curso' as const };
    }
    if (this.terminado()) return { etiqueta: 'Ya lo terminaste', detalle: 'Puedes revisar tu recorrido o practicarlo otra vez.', tono: 'hecho' as const };
    return { etiqueta: 'Sin empezar', detalle: 'Cuando quieras, entras al caso desde aquí.', tono: 'nuevo' as const };
  });

  /** La línea de consentimiento: solo mientras el servidor no lo tenga, con el nombre del botón que la persona pulsa. */
  protected readonly lineaConsentimiento = computed(() => {
    if (this.consentimientoDado()) return null;
    const boton = this.intentoAbierto() ? 'Continuar' : 'Comenzar';
    return DRAFT_COPY.briefConsentLine.text.replace('{boton}', boton);
  });

  protected readonly comoSeJuega = computed(() => [
    this.punteroGrueso()
      ? { icono: 'touch_app', texto: 'Toca la sala para moverte.' }
      : { icono: 'directions_walk', texto: 'Muévete con las flechas o con W, A, S y D.' },
    { icono: 'forum', texto: 'Acércate a las personas para hablar con ellas.' },
    { icono: 'alt_route', texto: 'Decide qué hacer: cada decisión cambia el curso de la atención.' },
    { icono: 'music_note', texto: DRAFT_COPY.briefSound.text },
  ]);

  private readonly umbral = computed<UmbralEstado>(() => ({ titulo: this.brief()?.title ?? '', portada: this.brief()?.portada ?? null }));

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destruida = true; });
    // El retrato es un complemento: si el kit no carga, cada personaje se queda con su nombre y su rol.
    this.kit.load().catch(() => undefined);
    this.load();
    this.seguirMedios();
    if (this.caseVersionId) {
      this.leerConsentimiento();
      this.leerIntentos();
    }
    // DP-11: el código del juego se descarga mientras se lee la ficha, en un momento ocioso; al pulsar Comenzar ya está.
    afterNextRender(() => this.precargarJuego());
  }

  protected load(): void {
    if (!this.caseVersionId) {
      this.error.set({ status: 404 });
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.simulationService.getCaseBrief(this.caseVersionId).subscribe({
      next: brief => {
        this.brief.set(brief);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (error: BriefError) => {
        this.error.set(error ?? {});
        this.loading.set(false);
      },
    });
  }

  /** Comenzar: sin intento abierto, el juego crea uno (`startAttempt(id, false)`); no hace falta parámetro. */
  protected comenzar(): void {
    if (this.startBlockedReason()) return;
    this.entrar('comenzar', () => this.router.navigate(['/portal/simulador', this.caseVersionId], { state: { umbral: this.umbral() } }));
  }

  /** Continuar donde quedaste: no destruye nada, así que puede ir en la URL (repetirla solo reabre el mismo intento). */
  protected continuar(): void {
    this.entrar('continuar', () => this.router.navigate(['/portal/simulador', this.caseVersionId], {
      queryParams: { intento: 'continuar' },
      state: { umbral: this.umbral() },
    }));
  }

  /**
   * Empezar de nuevo (RN-07): nombra lo que se pierde con el mismo texto del juego y, con «proceed», entra con un permiso
   * de un solo uso ligado a ESE intento (DP-26). El juego lo borra al llegar y solo reemplaza si el intento abierto sigue
   * siendo el mismo, así una recarga, el historial u otra pestaña no reemplazan nada sin que nadie lo haya visto.
   */
  protected async empezarDeNuevo(): Promise<void> {
    const abierto = this.intentoAbierto();
    if (!abierto || this.entrando() || this.startBlockedReason()) return;
    const copy = DRAFT_COPY.newAttemptConsequence;
    const respuesta = await this.dialog.consequence({
      title: copy.title,
      consequence: copy.text,
      continueLabel: 'Continuar',
      proceedLabel: 'Iniciar nuevo intento',
    });
    if (respuesta !== 'proceed' || this.destruida) return;
    this.entrar('nuevo', () => this.router.navigate(['/portal/simulador', this.caseVersionId], {
      state: { umbral: this.umbral(), reemplazar: { attemptId: abierto.attemptId } },
    }));
  }

  protected reintentarEntrada(): void {
    this.ultimaEntrada?.();
  }

  protected recargar(): void {
    window.location.reload();
  }

  /**
   * Registra el consentimiento si falta y SOLO entonces navega (ETH-01). Mientras espera, los botones quedan deshabilitados
   * y el pulsado muestra su indicador a los 150 ms (`ui-button`). Si el registro falla no se navega y no se da por dado.
   */
  private async entrar(tipo: Entrada, navegar: () => Promise<boolean>): Promise<void> {
    if (this.entrando()) return;
    this.ultimaEntrada = () => void this.entrar(tipo, navegar);
    this.entrando.set(tipo);
    this.errorEntrada.set(null);
    try {
      // Sin `recordForCase` (un registro de pruebas o antiguo) se entra igual: el juego pide el aviso como red de seguridad.
      if (!this.consentimientoDado() && this.consent.recordForCase) {
        await this.consent.recordForCase(this.caseVersionId);
        this.consentimientoDado.set(true);
      }
    } catch (cause) {
      if (this.destruida) return;
      const motivo = cause instanceof ConsentNoticeStaleError ? 'aviso' : 'fallo';
      this.errorEntrada.set(motivo);
      this.entrando.set(null);
      // El bloque del error no lleva `role`: una región que nace con su texto falla con los lectores de pantalla.
      this.announcer.announce((motivo === 'aviso' ? DRAFT_COPY.briefConsentStale : DRAFT_COPY.briefConsentError).text, 'assertive');
      return;
    }
    if (this.destruida) return;
    try {
      // Si la navegación no ocurre (una guarda la desvía), los botones vuelven a responder.
      if (!(await navegar())) this.entrando.set(null);
    } catch {
      this.entrando.set(null);
    }
  }

  /** `prime` pregunta al servidor; el registro sigue a la persona (S7-2), así que esto nunca muestra lo de otra cuenta. */
  private leerConsentimiento(): void {
    const leer = () => this.consentimientoDado.set(this.consent.isGivenForCase?.(this.caseVersionId) ?? false);
    leer();
    try {
      const pendiente = this.consent.prime?.(this.caseVersionId);
      pendiente?.then(leer, leer);
    } catch {
      // Una lectura que falla es «sin consentimiento»: la línea se muestra y Comenzar lo registra.
    }
  }

  /**
   * El intento abierto (de la caché si está fresca, para pintar sin esperar, y siempre confirmado con el servidor) y el
   * último terminado. Ninguno decide nada destructivo: reemplazar lo decide el juego con una lectura fresca (DP-26).
   */
  private leerIntentos(): void {
    const enCache = this.cache.intentoAbierto(this.caseVersionId);
    if (enCache !== undefined) this.intentoAbierto.set(abiertoDe(enCache));
    this.simulationService.getActiveAttempt(this.caseVersionId).pipe(this.cache.guardandoIntentoAbierto(this.caseVersionId)).subscribe({
      next: intento => this.intentoAbierto.set(abiertoDe(intento)),
      // Sin respuesta se ofrece Comenzar: si había uno abierto, el juego ofrece reanudarlo (su diálogo de siempre).
      error: () => this.intentoAbierto.set(this.intentoAbierto() ?? null),
    });
    this.simulationService.attemptHistory().subscribe({
      next: historial => {
        const ultimo = historial
          .filter(intento => intento.caseVersionId === this.caseVersionId && intento.status === 'COMPLETED')
          .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))[0];
        this.terminado.set(ultimo?.attemptId ?? null);
      },
      error: () => undefined,
    });
  }

  private seguirMedios(): void {
    const destroyRef = inject(DestroyRef);
    for (const [consulta, destino] of [[AMPLIO, this.amplio], [PUNTERO_GRUESO, this.punteroGrueso]] as const) {
      try {
        const lista = window.matchMedia?.(consulta);
        if (!lista?.addEventListener) continue;
        const alCambiar = (evento: MediaQueryListEvent) => destino.set(evento.matches);
        lista.addEventListener('change', alCambiar);
        destroyRef.onDestroy(() => lista.removeEventListener('change', alCambiar));
      } catch {
        // Sin matchMedia se queda la maqueta por defecto (dos columnas, ratón).
      }
    }
  }

  private precargarJuego(): void {
    const precargar = () => void import('./simulation-play.component').catch(() => undefined);
    const ocioso = (window as Window & { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ocioso) ocioso(precargar, { timeout: 2000 });
    else window.setTimeout(precargar, 300);
  }

  private visualOf(bundle: KitBundle, character: CaseBriefCharacter): CharacterVisual | null {
    const recipeId = resolveRecipeId(bundle, { actor: character.portraitKey, speaker: character.displayName });
    return recipeId ? resolveCharacter(bundle, { kind: 'receta', recipeId }) : null;
  }
}

/** Solo un intento en curso o en pausa es «abierto» (se puede continuar). */
function abiertoDe(intento: SimulationAttemptState | null | undefined): SimulationAttemptState | null {
  return intento && (intento.status === 'IN_PROGRESS' || intento.status === 'PAUSED') ? intento : null;
}
