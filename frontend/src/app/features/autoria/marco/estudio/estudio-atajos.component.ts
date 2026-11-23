import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { GrupoAtajos } from './atajos';

/**
 * Hoja de atajos («?»), EDITOR-PRO.md punto 4: todas las teclas del editor en un solo lugar, por grupos, en dos columnas.
 *
 * Patrón: componente de presentación. Recibe los grupos (el marco junta los suyos con los de la pantalla abierta).
 *
 * ```html
 * @if (estudio.atajosAbiertos()) { <app-estudio-atajos [grupos]="grupos()" (cerrar)="estudio.atajosAbiertos.set(false)" /> }
 * ```
 */
@Component({
  selector: 'app-estudio-atajos',
  imports: [A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="velo" aria-hidden="true" (click)="cerrar.emit()"></div>
    <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="est-atajos-t" cdkTrapFocus [cdkTrapFocusAutoCapture]="true"
         (keydown.escape)="$event.stopPropagation(); cerrar.emit()">
      <div class="cab">
        <h2 id="est-atajos-t">Atajos del teclado</h2>
        <button type="button" class="cerrar" cdkFocusInitial (click)="cerrar.emit()">Cerrar</button>
      </div>
      <div class="cuerpo">
        @for (g of grupos(); track g.titulo) {
          <section class="grupo" [attr.aria-label]="g.titulo">
            <h3>{{ g.titulo }}</h3>
            <dl>
              @for (a of g.atajos; track a.hace) {
                <div class="fila">
                  <dt>{{ a.hace }}</dt>
                  <dd>@for (t of a.teclas; track $index) { @if ($index) { <span class="mas" aria-hidden="true">+</span> }<kbd>{{ t }}</kbd> }</dd>
                </div>
              }
            </dl>
          </section>
        }
      </div>
      <p class="pie">Los atajos de una sola tecla no actúan mientras escribes en un campo.</p>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: var(--autoria-capa-50); display: grid; place-items: center; }
    .velo { position: absolute; inset: 0; background: color-mix(in oklab, var(--ds-text-1) 22%, transparent); animation: aparece var(--ds-dur-fast) var(--ds-ease-out); }
    .hoja {
      position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; inline-size: min(48rem, calc(100vw - 2rem));
      max-block-size: calc(100dvh - 4rem); overflow: hidden; border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-tarjeta);
      background: var(--l-superficie); box-shadow: var(--l-sombra-alta); color: var(--ds-text-1);
      animation: entra var(--ds-dur-base) var(--ds-spring-soft);
    }
    .cab { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0.75rem 0.75rem 1.25rem; border-block-end: 1px solid var(--l-filo); }
    h2 { margin: 0; font-size: var(--autoria-texto-18); line-height: 1.5rem; }
    .cerrar {
      min-block-size: 2.75rem; padding: 0 0.875rem; border: 0; border-radius: var(--l-radio-chico, 0.5rem); background: transparent;
      color: var(--ds-primary); font: inherit; font-weight: 700; cursor: pointer;
    }
    @media (hover: hover) and (pointer: fine) { .cerrar:hover { background: var(--l-superficie-hundida); } }
    .cuerpo { overflow: auto; padding: 0.75rem 1.25rem 1rem; columns: 2 20rem; column-gap: 2rem; }
    .grupo { break-inside: avoid; margin-block-end: 1rem; }
    h3 { margin: 0 0 0.25rem; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-variant-caps: all-small-caps; letter-spacing: 0.06em; }
    dl { margin: 0; }
    .fila { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-block-size: 2.25rem; border-block-end: 1px solid var(--l-filo); }
    dt { font-size: var(--autoria-texto-14); }
    dd { flex: none; display: flex; align-items: center; gap: 0.25rem; margin: 0; }
    kbd {
      min-inline-size: 1.5rem; padding: 0 0.375rem; border-radius: 0.3125rem; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte), 0 1px 0 var(--l-filo-fuerte);
      background: var(--l-superficie-hundida); font: inherit; font-size: var(--autoria-texto-14); font-weight: 700; line-height: 1.5rem; text-align: center;
    }
    .mas { color: var(--ds-text-2); font-size: var(--autoria-texto-14); }
    .pie { margin: 0; padding: 0.625rem 1.25rem; border-block-start: 1px solid var(--l-filo); color: var(--ds-text-2); font-size: var(--autoria-texto-14); }
    @keyframes aparece { from { opacity: 0; } }
    @keyframes entra { from { opacity: 0; scale: 0.98; } }
    @media (prefers-reduced-motion: reduce) { .velo, .hoja { animation-duration: 1ms; } }
  `,
})
export class EstudioAtajosComponent {
  readonly grupos = input.required<readonly GrupoAtajos[]>();
  readonly cerrar = output<void>();
}
