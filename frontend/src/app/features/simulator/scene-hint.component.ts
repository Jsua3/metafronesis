import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { CONSENT_REQUIRED } from '../../core/api/api-error.util';
import { SimulationService } from '../../core/api/simulation.service';
import { HintReason, HintState } from '../../core/models/simulation.model';
import { UiButton } from '../../shared/ui/button/ui-button';
import { plural } from '../../shared/ui/labels';
import { DRAFT_COPY } from './draft-copy';

type HintError = { status?: number; error?: { code?: string } | null };

/** El intento al que pertenecen las pistas: lo que el juego le pasa al panel de diálogo. */
export interface HintAttemptRef {
  attemptId: string;
}

const REASONS: Readonly<Record<HintReason, string>> = {
  NONE_FOR_SCENE: 'En esta escena no hay pistas.',
  ALL_SHOWN: 'Ya viste todas las pistas de esta escena.',
};

/**
 * Cuánto espera «Ver pista» tras revelar una pista (ms). Es la ventana de duplicado del servidor (`DUPLICATE_WINDOW_SECONDS`, 2 s):
 * una segunda orden dentro de ella no revela otra, así que el botón lo dice en vez de parecer roto. Las pruebas la acortan.
 */
export const HINT_COOLDOWN_MS = new InjectionToken<number>('HINT_COOLDOWN_MS', { factory: () => 2000 });

/** Clave de idempotencia de una orden (C9): un doble clic o un reintento no revela dos pistas. 8 a 64 caracteres. */
function newRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `pista-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Pistas de la escena sobre las opciones de una decisión (plan visual F10-2; RF-18, CU-09; contrato C9). «Ver pista» pide
 * la siguiente, con cuántas quedan; las que el intento ya pidió se quedan a la vista y la nueva se anuncia por la región
 * viva. Pedirlas **no cuesta puntaje** (decisión 13): el servidor no las cuenta en el reporte, y la nota lo dice. Sin
 * pistas o con todas vistas, el botón queda deshabilitado con su motivo. Es un complemento: si no carga, la decisión sigue.
 */
@Component({
  selector: 'app-scene-hint',
  imports: [UiButton],
  templateUrl: './scene-hint.component.html',
  styleUrl: './scene-hint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneHintComponent implements OnInit {
  private readonly simulationService = inject(SimulationService);
  private readonly announcer = inject(LiveRegionAnnouncer);
  private readonly cooldownMs = inject(HINT_COOLDOWN_MS);
  private readonly destroyRef = inject(DestroyRef);
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  readonly attemptId = input.required<string>();
  /** Rótulo del botón que pide la pista: el panel de diálogo conserva «Ver pista»; la ficha del objetivo pone el suyo. */
  readonly buttonLabel = input('Ver pista');
  /** Aspecto: «placa» es la placa de pixel del cuadro de diálogo del juego (bloque I1); fuera del cuadro, el de siempre. */
  readonly variante = input<'base' | 'placa'>('base');
  /**
   * El servidor respondió 403 `CONSENT_REQUIRED` (S3-2b, ETH-01): el consentimiento al aviso de contenido se retiró o el aviso
   * cambió. No es un fallo de pistas: se lo dice a la pantalla de juego, que vuelve al aviso previo como con cualquier otra orden.
   */
  readonly consentRequired = output<void>();

  protected readonly state = signal<HintState | null>(null);
  protected readonly loading = signal(true);
  protected readonly revealing = signal(false);
  protected readonly cooling = signal(false);
  private readonly loadFailed = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly busy = computed(() => this.loading() || this.revealing());
  protected readonly counter = computed(() => {
    const available = this.state()?.available ?? 0;
    return available > 0 ? `${plural(available, 'pista')} por ver · ${DRAFT_COPY.hintNoCostNote.text}` : null;
  });
  /** Por qué «Ver pista» no se puede usar ahora, o null si se puede. Cargando no hay motivo: el botón muestra su indicador. */
  protected readonly blockedReason = computed<string | null>(() => {
    const state = this.state();
    if (this.loadFailed()) return 'No pudimos cargar las pistas.';
    if (!state) return null;
    if (state.available <= 0) return REASONS[state.reason ?? 'ALL_SHOWN'];
    return this.cooling() ? 'Lee la pista antes de pedir la siguiente.' : null;
  });
  protected readonly message = computed(() => (this.loadFailed() ? 'No pudimos cargar las pistas.' : this.problem()));

  constructor() {
    this.destroyRef.onDestroy(() => { if (this.cooldownTimer) clearTimeout(this.cooldownTimer); });
  }

  /** Un fallo se pinta y también se anuncia: quien usa lector de pantalla no ve el renglón. */
  private fail(text: string, politeness: 'polite' | 'assertive' = 'assertive'): void {
    this.problem.set(text);
    this.announcer.announce(text, politeness);
  }

  /** ¿El servidor exige el consentimiento? Entonces no es un fallo de pistas: lo avisa a la pantalla de juego y no se anuncia nada. */
  private serverRequiresConsent(error: HintError): boolean {
    if (error?.status !== 403 || error.error?.code !== CONSENT_REQUIRED) return false;
    this.consentRequired.emit();
    return true;
  }

  /** Respira tras revelar o tras una respuesta sin pista nueva: la ventana de duplicado del servidor. */
  private startCooldown(): void {
    this.cooling.set(true);
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => this.cooling.set(false), this.cooldownMs);
  }

  /** Los datos del intento llegan por entradas: no existen todavía en el constructor. */
  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.problem.set(null);
    // Una respuesta que llega con el panel ya cerrado (el diálogo siguiente) no se aplica ni se anuncia.
    this.simulationService.getHints(this.attemptId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: state => {
        this.state.set(state);
        this.loading.set(false);
      },
      error: (error: HintError) => {
        this.loading.set(false);
        if (this.serverRequiresConsent(error)) return;
        this.loadFailed.set(true);
        this.announcer.announce('No pudimos cargar las pistas.', 'assertive');
      },
    });
  }

  protected ask(): void {
    if (this.busy() || this.blockedReason()) return;
    this.revealing.set(true);
    this.problem.set(null);
    const before = this.state()?.shown.length ?? 0;
    this.simulationService.revealNextHint(this.attemptId(), newRequestId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: state => {
        this.state.set(state);
        this.revealing.set(false);
        const added = state.shown.length > before ? state.shown[state.shown.length - 1] : null;
        if (added) {
          // El número es el lugar entre las que ya vio, no el de orden de la autoría (que puede ser 0 o 7).
          this.announcer.announce(`Pista ${state.shown.length}: ${added.text}`, 'polite');
        } else {
          // El servidor no reveló otra (su ventana de duplicado, otra pestaña): se dice y se espera, el botón no parece roto.
          this.problem.set('Esa pista ya estaba a la vista.');
          this.announcer.announce('Esa pista ya estaba a la vista.', 'polite');
        }
        this.startCooldown();
      },
      error: (error: HintError) => {
        this.revealing.set(false);
        if (this.serverRequiresConsent(error)) return;
        const code = error?.error?.code;
        if (code === 'NO_MORE_HINTS') {
          // Otra pestaña ya las pidió: se lee el estado real en vez de mostrar un error que no lo es.
          this.load();
        } else if (code === 'ATTEMPT_NOT_PLAYING') {
          this.fail('El intento está en pausa: reanúdalo para pedir pistas.');
        } else {
          this.fail('No pudimos pedir la pista. Inténtalo de nuevo.');
        }
      },
    });
  }
}
