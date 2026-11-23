import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { isRehearsalGoneError } from '../../core/api/api-error.util';
import { RehearsalApi } from '../../core/api/rehearsal.api';
import type { Activation, Bond, Milestone, RehearsalAdjustBody, RehearsalBlock, SimulationWorldState } from '../../core/models/simulation.model';
import {
  ACTIVACIONES_EN_ORDEN, CasillaExplorado, VINCULOS_EN_ORDEN, armarPanel, cuerpoExplorado, palabraDeActivacion, palabraDeVinculo, veredictoDeLectura,
} from './caso/ensayo';
import { DRAFT_COPY } from './draft-copy';
import { missedFactsText } from './outcome-text.util';

/** Las secciones que pueden traer un error del servidor junto a su control (`field` del 400). */
type CampoError = 'irA' | 'explorado' | 'persona' | 'hitos' | 'general';
const SECCION_DE: Record<CampoError, string> = { irA: 'escena', explorado: 'explorado', persona: 'persona', hitos: 'hitos', general: 'general' };

/**
 * Panel de autora del ensayo (bloque B, tarea 24): a un lado del juego, deja marcar lo explorado, mover la escena, fijar la
 * persona y los hitos (cada cambio es un `PATCH` que el juego relee) y explica por qué una respuesta no aparece y qué
 * comentarios se dicen. Plegable con su botón y con Alt+A. Solo conducta y accesibilidad: el aspecto lo rediseña I1.
 */
@Component({
  selector: 'app-rehearsal-panel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <aside class="rp" [attr.aria-label]="draft.rehearsalPanelTitle.text">
      <!-- El regreso va arriba y siempre a la vista (también con el panel plegado): antes estaba al final de un panel largo. -->
      <a class="rp__volver" [routerLink]="['/portal/casos', caseVersionId(), 'editor', 'escena', block().sceneId]">
        <span aria-hidden="true">‹</span> {{ draft.rehearsalBackToScript.text }}
      </a>
      <button type="button" class="rp__toggle" aria-keyshortcuts="Alt+A" aria-controls="rehearsal-panel-body"
        [attr.aria-expanded]="open()" (click)="toggle()">
        {{ draft.rehearsalPanelTitle.text }}
        <span class="sr-only">. {{ open() ? draft.rehearsalHide.text : draft.rehearsalShow.text }} (Alt+A)</span>
      </button>

      @if (open()) {
        <div id="rehearsal-panel-body" class="rp__body">
          @if (error(); as e) {
            @if (e.field === 'general') { <p class="rp__error">{{ e.message }}</p> }
          }
          <!-- Mientras un PATCH está en vuelo: aria-busy y un cambio a la vez (sin disabled, que haría perder el foco). -->
          <fieldset class="rp__all" [attr.aria-busy]="busy()">
            <legend class="sr-only">{{ draft.rehearsalPanelTitle.text }}</legend>

            <section data-section="escena">
              <h2>{{ draft.rehearsalScene.text }}</h2>
              <select data-field="irA" [attr.aria-label]="draft.rehearsalScene.text" (change)="destino.set(num($event))">
                @for (s of panel().escenas; track s.id) {
                  <option [value]="s.id" [selected]="s.id === destino()">{{ s.title }}</option>
                }
              </select>
              <button type="button" data-action="irA" (click)="send({ irA: destino() })">{{ draft.rehearsalGoTo.text }}</button>
              @if (errorOf('irA'); as message) { <p class="rp__error">{{ message }}</p> }
            </section>

            <section data-section="explorado">
              <h2>{{ draft.rehearsalExplored.text }}</h2>
              <ul class="rp__list">
                @for (c of sala(); track c.kind + c.key) {
                  <li><label><input type="checkbox" [value]="c.kind + ':' + c.key" [checked]="c.marcada" (change)="toggleExplorado(c, $event)"> {{ frase(c) }}</label></li>
                }
              </ul>
              <h3>{{ draft.rehearsalTools.text }}</h3>
              <ul class="rp__list">
                @for (c of herramientas(); track c.kind + c.key) {
                  <li><label><input type="checkbox" [value]="c.kind + ':' + c.key" [checked]="c.marcada" (change)="toggleExplorado(c, $event)"> {{ frase(c) }}</label></li>
                }
              </ul>
              @if (errorOf('explorado'); as message) { <p class="rp__error">{{ message }}</p> }
            </section>

            <section data-section="persona">
              <h2>{{ draft.rehearsalPersona.text }}</h2>
              <label>{{ draft.rehearsalBond.text }}
                <select data-field="bond" (change)="setPersona('bond', $event)">
                  @for (b of vinculos; track b) { <option [value]="b" [selected]="b === panel().persona.bond">{{ vinculoWord(b) }}</option> }
                </select>
              </label>
              <label>{{ draft.rehearsalActivation.text }}
                <select data-field="activation" (change)="setPersona('activation', $event)">
                  @for (a of activaciones; track a) { <option [value]="a" [selected]="a === panel().persona.activation">{{ activacionWord(a) }}</option> }
                </select>
              </label>
              <p class="rp__note">{{ panel().persona.label }}</p>
              @if (errorOf('persona'); as message) { <p class="rp__error">{{ message }}</p> }
            </section>

            <section data-section="hitos">
              <h2>{{ draft.rehearsalMilestones.text }}</h2>
              <ul class="rp__list">
                @for (h of panel().hitos; track h.key) {
                  <li><label><input type="checkbox" [value]="'hito:' + h.key" [checked]="h.cumplido" (change)="toggleHito(h.key, $event)"> {{ h.label }}</label></li>
                }
              </ul>
              @if (errorOf('hitos'); as message) { <p class="rp__error">{{ message }}</p> }
            </section>

            <section data-section="ocultas">
              <h2>{{ draft.rehearsalWhyHidden.text }}</h2>
              @for (o of panel().ocultas; track o.id) {
                <p class="rp__item"><strong>{{ o.text }}</strong><br>{{ o.porQue }}</p>
              } @empty {
                <p class="rp__note">{{ draft.rehearsalNoHidden.text }}</p>
              }
            </section>

            <section data-section="comentarios">
              <h2>{{ draft.rehearsalComments.text }}</h2>
              @for (c of panel().comentarios; track c.index) {
                <p class="rp__item"><strong>{{ c.personaje }}:</strong> «{{ c.line }}»<br>{{ c.estado }}</p>
              } @empty {
                <p class="rp__note">{{ draft.rehearsalNoComments.text }}</p>
              }
            </section>

            <section data-section="avisos">
              <h2>{{ draft.rehearsalWarnings.text }}</h2>
              @for (a of panel().avisos; track $index) { <p class="rp__item">{{ a }}</p> } @empty { <p class="rp__note">{{ draft.rehearsalNoWarnings.text }}</p> }
              @if (panel().camino.length) {
                <h3>{{ draft.rehearsalPath.text }}</h3>
                <p class="rp__note">{{ panel().camino.join(' → ') }}</p>
              }
            </section>

            <div class="rp__actions">
              <button type="button" data-action="reload" (click)="reload()">{{ draft.rehearsalReload.text }}</button>
            </div>
          </fieldset>
        </div>
      }
    </aside>
  `,
  styles: [`
    /* En la rejilla de la zona principal: siempre en la fila 1, a la derecha del mundo (y de la columna del diálogo, si hay). */
    :host { display: block; min-height: 0; grid-row: 1; grid-column: -2 / -1; max-block-size: 100%; }
    @media (max-width: 760px) {
      :host { grid-column: 1; z-index: 60; }
    }
    .rp { display: flex; flex-direction: column; max-block-size: 100%; inline-size: min(340px, 100%); color: var(--ds-text-1, #f4f7fb);
      background: var(--ds-surface-2, rgba(18,24,42,.96)); border: 1px solid var(--ds-border, rgba(182,156,255,.3)); border-radius: 12px; overflow: hidden; }
    .rp__toggle { text-align: start; padding: 8px 12px; background: transparent; color: inherit; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
    /* Respuesta al pulsar (ui-lint: todo clicable tiene :active); sin movimiento, solo un leve oscurecimiento. */
    button:active:not(:disabled), a:active { filter: brightness(.85); }
    .rp__body { overflow-y: auto; padding: 0 12px 12px; min-block-size: 0; }
    .rp__all { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
    .rp__all[aria-busy='true'] { opacity: .6; }
    /* Orden de títulos sin saltos (h1 oculto → h2 por sección → h3 por grupo; Axe heading-order). */
    h2 { margin: 12px 0 4px; font-size: .95rem; color: inherit; } h3 { margin: 8px 0 2px; font-size: .85rem; color: inherit; }
    /* Objetivos de al menos 24 px (WCAG 2.5.8): cada casilla con su texto y cada selector. */
    label { display: inline-flex; align-items: center; gap: 6px; min-block-size: 24px; }
    /* Botones, selectores y enlaces de 44 px, como en el resto del juego (también con dedo); las casillas, 44 px con dedo. */
    button, select, a { min-block-size: 44px; }
    @media (pointer: coarse) { label { min-block-size: 44px; } }
    .rp__list { list-style: none; margin: 0; padding: 0; } .rp__list li { padding: 2px 0; }
    .rp__item, .rp__note { margin: 4px 0; font-size: .85rem; } .rp__note { color: var(--ds-text-2, rgba(244,247,251,.8)); }
    .rp__error { margin: 4px 0; font-size: .85rem; color: var(--ds-danger-text, #ffb4b4); }
    .rp__actions { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .rp__volver { display: flex; align-items: center; gap: 6px; padding: 6px 12px; color: inherit; font-weight: 600; text-decoration: none;
      border-block-end: 1px solid var(--ds-border, rgba(182,156,255,.3)); }
    @media (hover: hover) and (pointer: fine) { .rp__volver:hover { text-decoration: underline; } }
    .rp__volver:focus-visible { outline: 2px solid var(--ds-focus, currentColor); outline-offset: -2px; }
    select, button:not(.rp__toggle) { font: inherit; min-block-size: 44px; }
    .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `],
})
export class RehearsalPanelComponent {
  readonly caseVersionId = input.required<number>();
  readonly attemptId = input.required<string>();
  readonly block = input.required<RehearsalBlock>();
  /** El mundo del juego (reservado: el panel ya lee `explored` y `explorable` del servidor). */
  readonly world = input<SimulationWorldState | null>(null);
  /** El servidor aceptó un cambio (o recargó): el bloque nuevo, para que el juego se relea. */
  readonly adjusted = output<RehearsalBlock>();
  /** El ensayo ya no existe (`REHEARSAL_GONE`). */
  readonly gone = output<'gone' | 'closed'>();

  private readonly rehearsal = inject(RehearsalApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly announcer = inject(LiveRegionAnnouncer);

  protected readonly draft = DRAFT_COPY;
  protected readonly vinculos = VINCULOS_EN_ORDEN;
  protected readonly activaciones = ACTIVACIONES_EN_ORDEN;
  protected readonly open = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<{ field: CampoError; message: string } | null>(null);
  /** Los hitos que declara el caso (rótulos de la sección de hitos); sin ellos se muestran las claves de los cumplidos. */
  readonly hitosDeclarados = input<readonly Milestone[]>([]);
  protected readonly panel = computed(() => armarPanel(this.block(), { hitosDeclarados: this.hitosDeclarados() }));
  protected readonly sala = computed(() => this.panel().explorado.filter(c => c.kind === 'talked' || c.kind === 'inspected'));
  protected readonly herramientas = computed(() => this.panel().explorado.filter(c => c.kind === 'has' || c.kind === 'used'));
  /** La escena elegida en el selector; vuelve a la actual cuando el bloque cambia. */
  protected readonly destino = linkedSignal(() => this.block().sceneId);

  protected vinculoWord(b: Bond): string { return palabraDeVinculo(b); }
  protected activacionWord(a: Activation): string { return palabraDeActivacion(a); }
  protected frase(c: CasillaExplorado): string { return missedFactsText([c]); }
  protected num(event: Event): number { return Number((event.target as HTMLSelectElement).value); }

  protected errorOf(field: CampoError): string | null {
    const e = this.error();
    return e && SECCION_DE[e.field] === SECCION_DE[field] ? e.message : null;
  }

  protected toggle(): void {
    // Solo si el foco estaba dentro del cuerpo que se va pasa al botón (nunca queda en <body>, WCAG 2.4.3); si estaba fuera, no se toca.
    const body = this.host.nativeElement.querySelector('.rp__body');
    if (this.open() && body?.contains(document.activeElement)) this.host.nativeElement.querySelector<HTMLElement>('.rp__toggle')?.focus();
    this.open.update(v => !v);
  }

  protected onKey(event: KeyboardEvent): void {
    if (!event.altKey || event.ctrlKey || event.metaKey || (event.key.toLowerCase() !== 'a' && event.code !== 'KeyA')) return;
    event.preventDefault();
    this.toggle();
  }

  protected toggleExplorado(c: CasillaExplorado, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.send({ explorado: cuerpoExplorado(this.panel(), { kind: c.kind, key: c.key, marcada: input.checked }) }, () => { input.checked = c.marcada; });
  }

  protected toggleHito(key: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const hitos = this.panel().hitos.filter(h => (h.key === key ? input.checked : h.cumplido)).map(h => h.key);
    this.send({ hitos }, () => { input.checked = !input.checked; });
  }

  /** Un cambio de persona; si el servidor lo rechaza o se descarta (hay otro en curso), el selector vuelve al valor que el bloque confirmó. */
  protected setPersona(campo: 'bond' | 'activation', event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.send({ persona: { [campo]: select.value } }, () => { select.value = this.panel().persona[campo]; });
  }

  protected reload(): void {
    this.run(this.rehearsal.read(this.caseVersionId(), this.attemptId()));
  }

  /** Un `PATCH` (un cambio a la vez). `undo` devuelve el control a su valor si el servidor lo rechaza. */
  protected send(body: RehearsalAdjustBody, undo?: () => void): void {
    this.run(this.rehearsal.adjust(this.caseVersionId(), this.attemptId(), body), undo);
  }

  private run(request: Observable<RehearsalBlock>, undo?: () => void): void {
    if (this.busy()) { undo?.(); return; }
    const sent = this.attemptId();
    this.busy.set(true);
    this.error.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: block => {
        this.busy.set(false);
        if (this.attemptId() !== sent) return;   // se abrió otro ensayo mientras tanto: este bloque ya no es suyo
        this.announcer.announce(DRAFT_COPY.rehearsalAdjusted.text, 'polite');
        this.adjusted.emit(block);
      },
      error: cause => {
        this.busy.set(false);
        undo?.();
        if (this.attemptId() !== sent) return;
        if (veredictoDeLectura(cause) === 'cerrado') { this.gone.emit('closed'); return; }
        if (isRehearsalGoneError(cause)) { this.gone.emit('gone'); return; }
        const body = (cause as { error?: { message?: unknown; field?: unknown } } | null)?.error;
        const field = (['irA', 'explorado', 'persona', 'hitos'] as const).find(f => f === body?.field) ?? 'general';
        const message = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : DRAFT_COPY.rehearsalAdjustFailed.text;
        this.error.set({ field, message });
        this.announcer.announce(message, 'polite');
      },
    });
  }
}
