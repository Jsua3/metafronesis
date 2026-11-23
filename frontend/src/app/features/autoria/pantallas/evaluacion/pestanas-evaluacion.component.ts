import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { dondeSeCumple } from '../../modelo/hitos';
import { RutasAutoria } from '../../rutas';

export type PestanaEvaluacion = 'pasos' | 'rubrica' | 'finales';

/**
 * Las tres pestañas de la etapa Evaluación (EDITOR.md §3.5): Pasos profesionales, Rúbrica y Finales, cada una con su
 * dirección. Son enlaces (no `role="tab"`): cambian de pantalla, así que «atrás» del navegador y abrir en otra pestaña
 * funcionan, y la actual se dice con `aria-current="page"`. La forma es la de un control segmentado de iOS: una pista
 * hundida con la pestaña actual en relieve.
 *
 * Patrón: pieza de presentación (Observer de las señales del store solo para la cifra «6/8» de Pasos). La comparten las
 * tres pantallas para no copiar la barra en cada una.
 */
@Component({
  selector: 'app-pestanas-evaluacion',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="pestanas" aria-label="Partes de la evaluación">
      @for (p of pestanas; track p.id) {
        <a class="pestana ds-motion" [routerLink]="rutas.a(p.ruta)" [attr.aria-current]="actual() === p.id ? 'page' : null">
          <!-- En un teléfono las tres caben en una fila con el nombre corto («Pasos»). -->
          <span>{{ p.nombre }}@if (p.resto) {<span class="pestana__resto">{{ p.resto }}</span>}</span>
          @if (p.id === 'pasos' && cifraPasos(); as cifra) {
            <span class="pestana__cifra" [attr.aria-label]="cifra.texto">{{ cifra.corta }}</span>
          }
        </a>
      }
    </nav>
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .pestanas {
      display: inline-flex; flex-wrap: wrap; gap: 0.125rem; max-inline-size: 100%; padding: 0.1875rem;
      border-radius: 999px; background: var(--l-superficie-hundida); box-shadow: inset 0 0 0 1px var(--l-filo);
    }
    .pestana {
      display: inline-flex; align-items: center; gap: 0.375rem; min-block-size: 2.75rem; padding-inline: 1rem;
      border-radius: 999px; color: var(--ds-text-2); font-size: var(--autoria-texto-16); font-weight: 650;
      text-decoration: none; white-space: nowrap;
      transition: background-color var(--ds-dur-fade) var(--ds-ease-out), color var(--ds-dur-fade) var(--ds-ease-out),
        scale var(--ds-dur-press) var(--ds-ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      .pestana:not([aria-current='page']):hover { color: var(--ds-text-1); background: color-mix(in oklab, var(--ds-primary) 8%, transparent); }
    }
    .pestana:active { scale: 0.97; }
    /* La actual: en relieve (superficie y sombra) y en negrita; la forma lo dice además del color. */
    .pestana[aria-current='page'] {
      background: var(--l-superficie); color: var(--ds-text-1); font-weight: 800;
      box-shadow: 0 0 0 1px var(--l-filo-fuerte), var(--l-sombra-trabajo);
    }
    .pestana:focus-visible { outline: 2px solid var(--ds-focus); outline-offset: 2px; }
    .pestana__cifra { color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700; font-variant-numeric: tabular-nums; }
    @media (max-width: 30rem) {
      :host { inline-size: 100%; }
      .pestanas { display: flex; flex-wrap: nowrap; }
      .pestana { flex: 1 1 0; justify-content: center; min-inline-size: 0; padding-inline: 0.5rem; }
      .pestana__resto { display: none; }
    }
    @media (forced-colors: active) {
      .pestana[aria-current='page'] { outline: 2px solid CanvasText; }
    }
  `,
})
export class PestanasEvaluacionComponent {
  readonly actual = input.required<PestanaEvaluacion>();
  protected readonly rutas = inject(RutasAutoria);
  private readonly store = inject(CasoStore);

  protected readonly pestanas = [
    { id: 'pasos', nombre: 'Pasos', resto: ' profesionales', ruta: '/editor/evaluacion' },
    { id: 'rubrica', nombre: 'Rúbrica', resto: '', ruta: '/editor/rubrica' },
    { id: 'finales', nombre: 'Finales', resto: '', ruta: '/editor/finales' },
  ] as const;

  /** «6/8» junto a Pasos: cuántos pasos tienen al menos una respuesta que los cumple (y la frase entera para el lector). */
  protected readonly cifraPasos = computed(() => {
    const caso = this.store.caso();
    if (!caso?.hitos.length) return null;
    const cubiertos = caso.hitos.filter((h) => dondeSeCumple(caso, h.clave).length > 0).length;
    return { corta: `${cubiertos}/${caso.hitos.length}`, texto: `${cubiertos} de ${caso.hitos.length} pasos con alguna respuesta` };
  });
}
