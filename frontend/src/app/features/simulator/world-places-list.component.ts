import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, inject, input, output } from '@angular/core';

import { DRAFT_COPY } from './draft-copy';
import { SafeExitButtonComponent } from './safe-exit-button.component';
import { PlaceCandidate, PlaceKind } from './world-places.util';

const KIND_LABELS: Record<PlaceKind, string> = { person: 'Persona', door: 'Puerta', object: 'Objeto' };

/**
 * «Ir a…» (plan visual F6-11; VD-19, borrador de Psicología): la lista de personas y puertas de la sala y de lo ya
 * examinado, para llegar a ellas SIN mirar el lienzo y sin ratón (H-06). Es modal: el resto del juego queda inerte.
 * Como el panel de diálogo y la bitácora lleva SU «Salida segura» (REGLA-004: un solo botón operable en cada estado) y
 * Esc la cierra y consume la pulsación, así que no llega a la cadena del juego que pausa. Presentacional: solo emite;
 * quien la aloja camina hasta el destino y anuncia la llegada.
 */
@Component({
  selector: 'app-world-places-list',
  standalone: true,
  imports: [A11yModule, SafeExitButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="places u-placa u-sombra" role="dialog" aria-modal="true" aria-labelledby="places-title" cdkTrapFocus>
      <header class="places__head">
        <h2 id="places-title">{{ copy.title }}</h2>
      </header>

      @if (places().length > 0) {
        <p class="places__hint">{{ copy.hint }}</p>
        <ul class="places__list">
          @for (place of places(); track place.key) {
            <li>
              <button type="button" class="places__item u-ficha" (click)="choose.emit(place)">
                <span class="places__kind">{{ kindLabel(place.kind) }}</span>{{ ' ' }}<span class="places__name">{{ place.label }}</span>@if (place.note) {
                  {{ ' ' }}<span class="places__note">{{ place.note }}</span>
                }
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="places__empty">{{ emptyText }}</p>
      }

      <footer class="places__foot">
        <app-safe-exit-button data-hide-key variante="placa" [pausing]="pausing()" (pause)="safeExit.emit()" />
        <button type="button" class="places__close u-boton" (click)="closed.emit()">Cerrar</button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: contents; }
    /* Placa de pixel de la hoja común (bloque U1): sin esquinas redondeadas ni sombras difusas. */
    .places {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: var(--ds-z-modal);
      transform: translate(-50%, -50%);
      width: min(720px, calc(100% - 2 * var(--pixel-borde)));
      max-height: min(560px, calc(100% - 2 * var(--pixel-borde)));
      box-sizing: border-box;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: calc(5 * var(--pixel-px));
      padding: calc(7 * var(--pixel-px)) calc(9 * var(--pixel-px)) calc(8 * var(--pixel-px));
      font-family: var(--pixel-f-texto);
    }
    /* El título es el kicker de la capa: mono, mayúsculas y con la luz del momento. */
    .places__head h2 {
      margin: 0; font-family: var(--pixel-f-nombre); font-weight: 700; font-size: max(var(--pixel-letra-minima), calc(var(--pixel-tam) * 0.82));
      letter-spacing: .06em; text-transform: uppercase; color: var(--luz);
    }
    .places__hint, .places__empty { margin: 0; color: var(--pixel-tinta-suave); line-height: 1.5; }
    .places__list {
      display: grid;
      gap: calc(2 * var(--pixel-px));
      margin: 0;
      padding: 0;
      list-style: none;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .places__item {
      display: grid;
      grid-template-columns: 7em minmax(0, 1fr) auto;
      align-items: center;
      gap: calc(4 * var(--pixel-px));
      width: 100%;
      min-height: 48px;
      padding: 0 calc(5 * var(--pixel-px)) calc(2 * var(--pixel-px)) calc(4 * var(--pixel-px));
      text-align: left;
    }
    .places__kind {
      font-family: var(--pixel-f-nombre);
      font-weight: 700;
      font-size: var(--pixel-letra-chica);
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--pixel-tinta-suave);
    }
    .places__name { min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
    /* Aviso junto al nombre (persona a atender o lugar cerrado): texto, no solo color. */
    .places__note { font-weight: 400; font-size: var(--pixel-letra-media); color: var(--pixel-tinta-suave); }
    .places__foot { display: flex; align-items: center; justify-content: space-between; gap: calc(4 * var(--pixel-px)); flex-wrap: wrap; }
    @media (max-width: 560px) {
      /* Teléfono (V7): la lista entra sin desplazarse; las fichas bajan al piso del dedo (44 px) y los huecos se acortan. */
      .places { gap: calc(3 * var(--pixel-px)); padding: calc(5 * var(--pixel-px)) calc(5 * var(--pixel-px)) calc(6 * var(--pixel-px)); }
      .places__item { grid-template-columns: 5.6em minmax(0, 1fr); min-height: 44px; }
      .places__note { grid-column: 2; }
    }
    /* Poco alto (V6): la lista no se desplaza; las fichas van en dos columnas y, con ratón, más bajas (piso de 24 px;
       con dedo siguen en 48). */
    @media (max-height: 760px) and (min-width: 561px) {
      .places__list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; }
      .places__item { grid-template-columns: 5.6em minmax(0, 1fr); }
      .places__note { grid-column: 2; }
    }
    @media (max-height: 560px) and (pointer: fine) {
      .places__item { min-height: 36px; }
    }
  `],
})
export class WorldPlacesListComponent {
  /** Lo que se ofrece (ya filtrado por `selectPlaces`: personas, puertas y objetos examinados). */
  readonly places = input<readonly PlaceCandidate[]>([]);
  /** Hay una salida segura pedida que espera: el botón «Salida segura» dice «Pausando…». */
  readonly pausing = input(false);
  readonly choose = output<PlaceCandidate>();
  readonly closed = output<void>();
  /** Pausa reanudable pedida desde aquí (REGLA-004): quien la aloja llama a la salida segura real. */
  readonly safeExit = output<void>();

  protected readonly copy = { title: DRAFT_COPY.placesDialog.title ?? 'Ir a…', hint: DRAFT_COPY.placesDialog.text };
  protected readonly emptyText = DRAFT_COPY.placesEmpty.text;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // El foco entra a la lista: el primer lugar (o «Cerrar» si no hay ninguno). El CDK ya atrapa el foco dentro.
    afterNextRender(() => {
      const first = this.host.nativeElement.querySelector<HTMLElement>('.places__item, .places__close');
      first?.focus();
    }, { injector: inject(Injector) });
  }

  protected kindLabel(kind: PlaceKind): string {
    return KIND_LABELS[kind];
  }

  /**
   * Esc la cierra y consume la pulsación: `document` la recibe antes que el `window:keydown` de la pantalla de juego,
   * que ve `defaultPrevented` y no pausa (el segundo Esc, ya sin lista, sí).
   */
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.closed.emit();
  }
}
