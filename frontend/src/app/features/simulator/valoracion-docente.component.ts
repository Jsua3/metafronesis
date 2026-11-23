import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormativeLevel, OwnerEvaluation } from '../../core/models/simulation.model';

/**
 * La valoración del docente en palabras (R3): la MISMA pieza en el cierre del caso y en «Ver cómo lo leerá».
 * Pasada final: una sola tarjeta con divisores finos y rótulos de sección (no títulos de página), y cada nivel con su
 * escalón de píxeles —la misma forma que la escala de la rúbrica— además del color: el nivel se lee por el texto y por
 * la forma, nunca solo por el tono. Sin rojo: el tono es formativo.
 */
@Component({
  selector: 'app-valoracion-docente',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="valoracion" aria-label="Retroalimentación docente">
      @if (valoracion(); as actual) {
        <div class="valoracion__bloque valoracion__general">
          <h3 class="valoracion__rotulo">Comentario general</h3>
          <p class="valoracion__comentario">{{ actual.comment.trim() || 'Sin comentario general.' }}</p>
        </div>
        <div class="valoracion__bloque valoracion__global">
          <h3 class="valoracion__rotulo">Nivel global</h3>
          <ng-container *ngTemplateOutlet="nivel; context: { $implicit: actual.overallLevel, vacio: 'Sin nivel global' }" />
        </div>
        @if (actual.criteria.length) {
          <div class="valoracion__bloque valoracion__criterios">
            <h3 class="valoracion__rotulo">Por criterio</h3>
            <ul>
              @for (criterio of actual.criteria; track $index) {
                <li>
                  <div class="valoracion__cabecera">
                    <h4>{{ criterio.title }}</h4>
                    <ng-container *ngTemplateOutlet="nivel; context: { $implicit: criterio.level, vacio: 'Sin nivel' }" />
                  </div>
                  @if (criterio.descriptor?.trim()) {
                    <p class="valoracion__descriptor">{{ criterio.descriptor }}</p>
                  }
                  <p><strong>Observación:</strong> {{ criterio.comment.trim() || 'Sin observación para este criterio.' }}</p>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="valoracion__espera">Cuando tu docente revise tu recorrido, su retroalimentación aparecerá aquí.</p>
      }
    </section>

    <ng-template #nivel let-clave let-vacio="vacio">
      <span class="valoracion__nivel" [attr.data-nivel]="clave || null">
        @if (clave) {
          <span class="valoracion__escalon" aria-hidden="true">
            @for (p of peldanos; track p) { <span [class.lleno]="lleno(clave, p)"></span> }
          </span>
        }
        {{ nombre(clave, vacio) }}
      </span>
    </ng-template>
  `,
  styles: [`
    :host { display: block; min-inline-size: 0; }
    .valoracion {
      display: grid; min-inline-size: 0; color: var(--ds-text-1); overflow-wrap: anywhere;
      border: 1px solid var(--ds-border); border-radius: var(--l-radio-tarjeta, var(--ds-radius-md));
      background: var(--l-superficie, var(--ds-surface-1));
    }
    h3, h4, p { margin: 0; }
    p { line-height: 1.6; white-space: pre-wrap; }
    /* Cada parte es un bloque de la misma tarjeta, separado del anterior por un filo fino. */
    .valoracion__bloque { display: grid; gap: var(--ds-space-2); min-inline-size: 0; padding: var(--ds-space-4) var(--ds-space-5); }
    .valoracion__bloque + .valoracion__bloque { border-block-start: 1px solid var(--ds-border); }
    /* Rótulo de sección (como «ELIGE TU PERSONAJE»): pequeño, en mayúsculas espaciadas y suave; el título de la página manda. */
    .valoracion__rotulo {
      font-size: var(--ds-type-body-s-size); font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: var(--ds-text-2);
    }
    .valoracion__comentario { padding-inline-start: var(--ds-space-3); border-inline-start: var(--l-pixel, 2px) solid var(--l-acento, var(--ds-primary)); }
    h4 { font-size: inherit; font-weight: 600; color: var(--ds-text-1); }
    ul { display: grid; list-style: none; margin: 0; padding: 0; }
    li { display: grid; gap: var(--ds-space-2); min-inline-size: 0; padding-block: var(--ds-space-3); }
    li + li { border-block-start: 1px dashed var(--ds-border); }
    li:last-child { padding-block-end: 0; }
    .valoracion__cabecera { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-2) var(--ds-space-3); min-inline-size: 0; }
    .valoracion__descriptor { color: var(--ds-text-2); }

    /* El nivel: pastilla con escalón de cuatro peldaños (forma) y el tono semántico del sistema (color). */
    .valoracion__nivel {
      --tono: var(--ds-text-2); --fondo: var(--l-superficie-hundida, var(--ds-surface-2));
      display: inline-flex; align-items: center; gap: var(--ds-space-2);
      inline-size: fit-content; max-inline-size: 100%; padding: var(--ds-space-1) var(--ds-space-3);
      border: 1px solid color-mix(in srgb, var(--tono) 45%, transparent); border-radius: 999px;
      background: var(--fondo); color: var(--ds-text-1); font-weight: 600;
    }
    .valoracion__nivel[data-nivel='EN_PROCESO'] { --tono: var(--ds-info); --fondo: var(--ds-info-bg); }
    .valoracion__nivel[data-nivel='LOGRADO'] { --tono: var(--ds-success); --fondo: var(--ds-success-bg); }
    .valoracion__nivel[data-nivel='DESTACADO'] { --tono: var(--l-acento, var(--ds-primary)); --fondo: color-mix(in srgb, var(--l-acento, var(--ds-primary)) 14%, var(--ds-surface-1)); }
    .valoracion__escalon { display: inline-flex; align-items: flex-end; gap: 2px; block-size: .75rem; }
    .valoracion__escalon > span { inline-size: .25rem; background: color-mix(in srgb, var(--tono) 25%, transparent); }
    .valoracion__escalon > span:nth-child(1) { block-size: .25rem; }
    .valoracion__escalon > span:nth-child(2) { block-size: .4375rem; }
    .valoracion__escalon > span:nth-child(3) { block-size: .625rem; }
    .valoracion__escalon > span:nth-child(4) { block-size: .75rem; }
    .valoracion__escalon > span.lleno { background: var(--tono); }

    .valoracion__espera { padding: var(--ds-space-4) var(--ds-space-5); color: var(--ds-text-2); }
    @media (forced-colors: active) {
      .valoracion, .valoracion__nivel { border: 1px solid CanvasText; }
      .valoracion__escalon > span { background: GrayText; }
      .valoracion__escalon > span.lleno { background: CanvasText; }
    }
  `],
})
export class ValoracionDocenteComponent {
  readonly valoracion = input<OwnerEvaluation['evaluations'][number] | null>(null);

  // El contrato envía claves, pero la persona debe leer siempre palabras.
  protected readonly niveles: Record<FormativeLevel, string> = {
    EN_INICIO: 'En inicio', EN_PROCESO: 'En proceso', LOGRADO: 'Logrado', DESTACADO: 'Destacado',
  };
  /** Cuántos peldaños se llenan por nivel (decorativo: orienta sin pedir lectura, como en la rúbrica). */
  protected readonly orden: Record<FormativeLevel, number> = { EN_INICIO: 0, EN_PROCESO: 1, LOGRADO: 2, DESTACADO: 3 };
  protected readonly peldanos = [0, 1, 2, 3] as const;

  // El contexto de ng-template no lleva tipos: estas dos funciones lo acotan a un nivel (o a ninguno).
  protected nombre(clave: FormativeLevel | null | undefined, vacio: string): string {
    return clave ? this.niveles[clave] : vacio;
  }
  protected lleno(clave: FormativeLevel | null | undefined, peldano: number): boolean {
    return !!clave && peldano <= this.orden[clave];
  }
}
