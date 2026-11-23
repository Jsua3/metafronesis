import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { TonoFinal } from '../../modelo/caso';

/** Cómo se dice el tono de un final: con forma (símbolo) y palabra, nunca solo con color. */
export const TONO_DEL_FINAL: Record<TonoFinal, { simbolo: string; palabra: string }> = {
  positive: { simbolo: '✓', palabra: 'Final favorable' },
  neutral: { simbolo: '●', palabra: 'Final intermedio' },
  warning: { simbolo: '▲', palabra: 'Final con riesgo' },
  // «!» y no «✕»: dentro de una vista que solo se lee, una equis parece un botón de cerrar.
  critical: { simbolo: '!', palabra: 'Final crítico' },
};

/**
 * «Así lo lee el estudiante» de un final (EDITOR.md §3.5): el nombre y el mensaje del final dentro del cuadro del juego,
 * que es oscuro en las dos pieles, con el borde de píxel de su caja de diálogo. El tono va como medallón con símbolo y
 * palabra; el filo de color solo lo refuerza.
 *
 * Patrón: pieza de presentación pura (entradas, sin servicios), para cada final propio y para los cuatro de plantilla.
 */
@Component({
  selector: 'app-vista-del-final',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="vista">
      <figcaption class="vista__rotulo">Así lo lee el estudiante</figcaption>
      <div class="juego" [attr.data-tono]="tono()">
        <p class="juego__tono"><span class="juego__medallon" aria-hidden="true">{{ forma().simbolo }}</span>{{ forma().palabra }}</p>
        <p class="juego__nombre">{{ nombre().trim() || 'Final sin nombre' }}</p>
        <p class="juego__texto" [class.vacio]="!texto().trim()">{{ texto().trim() || 'Todavía no escribiste lo que lee el estudiante al terminar.' }}</p>
      </div>
    </figure>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .vista { display: flex; flex-direction: column; gap: 0.375rem; margin: 0; min-inline-size: 0; }
    .vista__rotulo { color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700; }
    .juego {
      --tono: var(--juego-acento-claro);
      display: flex; flex-direction: column; gap: 0.375rem; padding: 0.75rem 0.875rem; border-radius: 0.5rem;
      background: var(--juego-fondo); color: var(--juego-texto);
      box-shadow: inset 0 0 0 2px var(--juego-borde), inset 0 0 0 4px var(--juego-hundido), inset 6px 0 0 var(--tono), 0 6px 0 -2px var(--juego-hundido);
    }
    .juego[data-tono='positive'] { --tono: color-mix(in oklab, var(--ds-success) 55%, var(--juego-texto)); }
    .juego[data-tono='warning'] { --tono: var(--juego-salida); }
    .juego[data-tono='critical'] { --tono: color-mix(in oklab, var(--ds-danger) 55%, var(--juego-texto)); }
    .juego p { margin: 0; overflow-wrap: anywhere; }
    .juego__tono {
      display: inline-flex; align-items: center; gap: 0.5rem; color: var(--juego-texto-suave); font-size: var(--autoria-texto-14);
      font-weight: 700; letter-spacing: 0.02em;
    }
    .juego__medallon {
      display: inline-grid; place-items: center; inline-size: 1.5rem; block-size: 1.5rem; border-radius: 0.25rem;
      background: var(--juego-hundido); color: var(--tono); box-shadow: 0 0 0 1px var(--juego-borde); font-weight: 800;
    }
    .juego__nombre { color: var(--juego-texto); font-size: var(--autoria-texto-18); font-weight: 800; line-height: 1.5rem; }
    .juego__texto { color: var(--juego-texto-suave); font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .juego__texto.vacio { font-style: italic; }
    @media (forced-colors: active) { .juego { border: 2px solid CanvasText; } }
  `,
})
export class VistaDelFinalComponent {
  readonly nombre = input.required<string>();
  readonly texto = input.required<string>();
  readonly tono = input<TonoFinal>('neutral');
  protected readonly forma = computed(() => TONO_DEL_FINAL[this.tono()] ?? TONO_DEL_FINAL.neutral);
}
