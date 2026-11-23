import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, untracked } from '@angular/core';

import { HintEditorState, MapEditorState, NodeEditorState } from '../../core/models/simulation.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { plural } from '../../shared/ui/labels';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';

interface HintScene {
  map: MapEditorState;
  nodeTitle: string;
  hints: HintEditorState[];
  countLabel: string;
}

/**
 * «Ayudas» del editor de casos (plan visual F10-3†; E3-5, RF-11, CU-04): cada sala del caso con sus ayudas en el orden en
 * que aparecen, para agregar, editar y quitar. Una ayuda es una pista de texto plano que la persona puede pedir, de una
 * en una, mientras decide. La pantalla del editor abre la hoja y llama al servidor; este componente solo presenta la
 * lista y avisa qué se pidió. Una versión que no es borrador (`lockReason`) deja leerlas pero no cambiarlas.
 */
@Component({
  selector: 'app-case-hints',
  imports: [UiBadge, UiButton, UiCard, UiEmptyState, UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (scenes().length) {
      <p class="ch-lead">Una ayuda es una pista que la persona puede pedir, de una en una, mientras decide. Se muestran en el orden en que aparecen aquí.</p>
      <ul class="ch-grid">
        @for (scene of scenes(); track scene.map.id) {
          <li>
            <ui-card class="ch-card">
              <div class="ch-head">
                <h3 class="ch-title">{{ scene.map.title }}</h3>
                <ui-badge [tone]="scene.hints.length ? 'info' : 'neutral'">{{ scene.countLabel }}</ui-badge>
              </div>
              <p class="ch-meta">Escena «{{ scene.nodeTitle }}»</p>
              @if (scene.hints.length) {
                <ol class="ch-hints" [attr.aria-label]="'Ayudas de ' + scene.map.title">
                  @for (hint of scene.hints; track hint.id; let position = $index) {
                    <li class="ch-hint">
                      <span class="ch-text">{{ hint.text }}</span>
                      <span class="ch-actions">
                        <button ui-icon-button type="button" icon="edit" [disabledReason]="lockReason()"
                          [label]="'Editar ayuda ' + (position + 1) + ' de «' + scene.map.title + '»'" (click)="edit.emit(hint)"></button>
                        <button ui-icon-button type="button" icon="delete_outline" [disabledReason]="lockReason()"
                          [label]="'Eliminar ayuda ' + (position + 1) + ' de «' + scene.map.title + '»'" (click)="removeHint(hint)"></button>
                      </span>
                    </li>
                  }
                </ol>
              } @else {
                <p class="ch-empty">Esta sala aún no tiene ayudas.</p>
              }
              <button ui-button type="button" variant="secondary" icon="add" [attr.data-ch-add]="scene.map.id" [disabledReason]="lockReason()"
                (click)="create.emit(scene.map.id)">Agregar ayuda a «{{ scene.map.title }}»</button>
            </ui-card>
          </li>
        }
      </ul>
    } @else {
      <ui-empty-state kind="first-use" title="Este caso aún no tiene salas"
        description="Las ayudas viven en la sala de una escena: crea primero un mapa."
        actionLabel="Ir a Mapas" (action)="goToMaps.emit()" />
    }
  `,
  styles: [`
    :host { display: block; }
    .ch-lead { margin: 0 0 var(--ds-space-4); color: var(--ds-text-2); }
    .ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: var(--ds-space-4); margin: 0; padding: 0; list-style: none; }
    .ch-card { display: grid; gap: var(--ds-space-3); align-content: start; min-width: 0; }
    .ch-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-2); }
    .ch-title { margin: 0; font-size: var(--ds-type-h3-size); line-height: var(--ds-type-h3-line); overflow-wrap: anywhere; }
    .ch-meta, .ch-empty { margin: 0; color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
    .ch-hints { display: grid; gap: var(--ds-space-2); margin: 0; padding-inline-start: var(--ds-space-5); }
    .ch-hint { padding-inline-start: var(--ds-space-1); }
    .ch-hint::marker { color: var(--ds-text-2); font-variant-numeric: tabular-nums; }
    .ch-hint { display: list-item; }
    .ch-text { display: block; overflow-wrap: anywhere; }
    .ch-actions { display: flex; gap: var(--ds-space-1); margin-block-start: var(--ds-space-1); }
  `],
})
export class CaseHintsComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  /** La sala de la ayuda que se pidió quitar: cuando la lista se acorte, el foco va a su «Agregar ayuda» (la fila se va). */
  private removingMapId: number | null = null;

  readonly maps = input<MapEditorState[]>([]);
  readonly nodes = input<NodeEditorState[]>([]);
  readonly hints = input<HintEditorState[]>([]);
  /** Por qué el caso no se puede modificar (versión que no es borrador); null si se puede. */
  readonly lockReason = input<string | null>(null);
  /** Agregar una ayuda a la sala (id del mapa). */
  readonly create = output<number>();
  readonly edit = output<HintEditorState>();
  readonly remove = output<HintEditorState>();
  /** Sin salas no hay dónde poner ayudas: lleva a la pestaña de mapas. */
  readonly goToMaps = output<void>();

  constructor() {
    let known = this.hints().length;
    effect(() => {
      const count = this.hints().length;
      const mapId = untracked(() => this.removingMapId);
      const shrank = mapId !== null && count < known;
      known = count;
      if (!shrank) return;
      this.removingMapId = null;
      afterNextRender(() => this.host.querySelector<HTMLElement>(`[data-ch-add="${mapId}"]`)?.focus(), { injector: this.injector });
    });
  }

  protected removeHint(hint: HintEditorState): void {
    this.removingMapId = hint.mapId;
    this.remove.emit(hint);
  }

  protected readonly scenes = computed<HintScene[]>(() => {
    const titles = new Map(this.nodes().map(node => [node.id, node.title]));
    return this.maps().map(map => {
      const own = this.hints().filter(item => item.mapId === map.id).sort((a, b) => a.order - b.order || a.id - b.id);
      return {
        map,
        nodeTitle: titles.get(map.nodeId) ?? map.nodeKey,
        hints: own,
        countLabel: own.length ? plural(own.length, 'ayuda') : 'Sin ayudas',
      };
    });
  });
}
