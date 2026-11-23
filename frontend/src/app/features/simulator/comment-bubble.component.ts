/**
 * Burbuja de comentario (bloque B, 4.6): lo que dice un personaje al acercarse el estudiante, sobre su cabeza. No es
 * modal, no toma el foco ni consume teclas (Enter abre la conversación por el camino de siempre) y no detiene a
 * nadie. Se anuncia una vez por comentario por `LiveRegionAnnouncer`. Con movimiento reducido entra sin animación.
 */
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import type { Persona, WorldComment } from '../../core/models/simulation.model';
import type { PortraitState } from '../character/kit/kit-engine';
import type { CharacterVisual } from '../character/kit/character-visual.resolver';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { caraDeReaccion } from './caso/reaccion';
import { variablesDeArte } from './dialogo-arte';
import { DRAFT_COPY } from './draft-copy';

/** Si la pantalla no pasa el estado de la persona, la cara sale solo de la emoción escrita (o neutra). */
const PERSONA_NEUTRA: Pick<Persona, 'bond' | 'activation'> = { bond: 'GUARDED', activation: 'CALM' };

@Component({
  selector: 'app-comment-bubble',
  imports: [KitFigureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (comment(); as c) {
      <div class="bubble-layer" [style]="arte">
        <div class="bubble" role="group" [attr.data-comment]="c.id" [attr.aria-label]="label()"
          [class.bubble--enter]="!reduceMotion()" [class.bubble--floor]="!anchor()"
          [style.left.px]="anchor()?.x ?? null" [style.top.px]="anchor()?.y ?? null">
          @if (speaker()?.visual; as visual) {
            <app-kit-figure class="bubble-face" [visual]="visual" [portrait]="portrait()" [scale]="2" />
          }
          <div class="bubble-text">
            @if (speaker()?.nombre; as nombre) {
              <span class="bubble-name" aria-hidden="true">{{ nombre }}</span>
            }
            <p class="bubble-line">{{ c.line }}</p>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Bloque I1: papel con marco de pixel art (assets/game/dialogo), cola de pixel y el nombre de quien comenta. */
    :host { display: contents; }
    /* Capa de la burbuja: sobre el mundo y bajo la franja de la reacción (--capa-reaccion: 60). */
    .bubble-layer { --capa-burbuja: 55; position: absolute; inset: 0; z-index: var(--capa-burbuja); pointer-events: none; overflow: hidden; --px: 2px; }
    @media (min-width: 1800px) { .bubble-layer { --px: 3px; } }
    .bubble {
      position: absolute; max-width: min(21em, 78%); width: max-content; display: flex; align-items: center; gap: calc(3 * var(--px));
      padding: var(--px) calc(4 * var(--px)) calc(2 * var(--px)) calc(2 * var(--px));
      border-style: solid; border-width: calc(4 * var(--px)); border-image: var(--marco-burbuja) 4 / calc(4 * var(--px)) stretch;
      background: #f0eadc var(--trama-burbuja) 0 0 / calc(8 * var(--px)) padding-box; image-rendering: pixelated;
      color: #241b2c; font-family: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
      /* La cola cuelga de la base y apunta a la cabeza: el ancla es la punta. */
      transform: translate(-50%, calc(-100% - 8 * var(--px)));
    }
    .bubble::after {
      content: ''; position: absolute; left: 50%; bottom: calc(-8 * var(--px)); width: calc(7 * var(--px)); height: calc(4 * var(--px));
      margin-left: calc(-3.5 * var(--px)); background: var(--cola) 0 0 / 100% 100% no-repeat; image-rendering: pixelated;
    }
    .bubble--floor { left: 50%; top: auto; bottom: 16px; transform: translateX(-50%); }
    .bubble--floor::after { display: none; }
    .bubble-face { flex: none; margin: calc(-2 * var(--px)) 0 calc(-1 * var(--px)); }
    .bubble-text { min-width: 0; display: grid; gap: 1px; }
    .bubble-name { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; font-size: .78rem; color: #5b3d86; }
    .bubble-line { margin: 0; font-size: 0.95rem; line-height: 1.35; }
    @media (prefers-reduced-motion: no-preference) {
      .bubble--enter { animation: bubble-in 140ms steps(2, jump-none) both; }
    }
    @keyframes bubble-in { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class CommentBubbleComponent {
  private readonly announcer = inject(LiveRegionAnnouncer);
  /** El arte de pixel de la interfaz (los comentarios ocurren de noche o de día: el papel no cambia; la cola y el marco sí lo leen). */
  protected readonly arte = variablesDeArte('noche');

  readonly comment = input<WorldComment | null>(null);
  readonly speaker = input<{ nombre: string; visual: CharacterVisual | null } | null>(null);
  readonly anchor = input<{ x: number; y: number } | null>(null);
  readonly persona = input<Pick<Persona, 'bond' | 'activation'> | null>(null);
  readonly reduceMotion = input(false);

  protected readonly label = computed(() => DRAFT_COPY.commentBubbleLabel.text.replace('{nombre}', this.speaker()?.nombre ?? ''));
  /** La cara pedida si el personaje la tiene; si no, la neutra. */
  protected readonly portrait = computed<PortraitState>(() => {
    const c = this.comment();
    const cara = c ? caraDeReaccion(c.emotion, this.persona() ?? PERSONA_NEUTRA) : 'neutral';
    const visual = this.speaker()?.visual;
    return visual && !(cara in visual.portraits) ? 'neutral' : cara;
  });

  private anunciado: string | null = null;

  constructor() {
    // Una vez por comentario: mover la burbuja (el ancla cambia por cuadro) no vuelve a anunciar.
    effect(() => {
      const c = this.comment();
      if (!c) { this.anunciado = null; return; }
      if (c.id === this.anunciado) return;
      this.anunciado = c.id;
      const nombre = untracked(() => this.speaker()?.nombre);
      this.announcer.announce(nombre ? `${nombre}: ${c.line}` : c.line, 'polite');
    });
  }
}
