import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { VOLUME_STEPS, clampVolumeLevel } from './volume-settings.service';

let nextId = 0;

/**
 * Barra de volumen de un canal (Ajustes del juego): diez barras en escalera, como un ecualizador de pixel art. Se
 * arrastra, se toca o se lleva con el teclado (rol `slider`: flechas, Re Pág / Av Pág, Inicio y Fin). Al subir, cada
 * barra que se enciende salta en cascada y una chispa marca el tope; al bajar, las que se apagan caen. Mientras se
 * usa, las barras encendidas laten. El botón de la izquierda silencia el canal sin perder el nivel; en silencio las
 * barras se hunden, se apagan y quedan tachadas. Con movimiento reducido (del sistema o del juego) no se mueve nada.
 */
@Component({
  selector: 'app-volume-bars',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vol" [class.vol--silencio]="silent()" [class.vol--quieto]="reduceMotion()"
      [class.vol--vivo]="live()" [class.vol--arrastre]="dragging()">
      <button type="button" class="vol__mute u-boton u-boton--icono" [attr.aria-pressed]="silent()"
        [attr.aria-label]="muteLabel()" (click)="toggleMute.emit()">
        <mat-icon aria-hidden="true">{{ silent() ? iconOff() : iconOn() }}</mat-icon>
      </button>
      <span class="vol__nombre" [id]="labelId">{{ label() }}</span>
      <strong class="vol__valor" aria-hidden="true">{{ silent() ? 'Mudo' : percent() + ' %' }}</strong>
      <div #track class="vol__pista" role="slider" tabindex="0" aria-orientation="horizontal"
        [attr.aria-labelledby]="labelId" aria-valuemin="0" [attr.aria-valuemax]="steps.length"
        [attr.aria-valuenow]="level()" [attr.aria-valuetext]="valueText()"
        (keydown)="onKeydown($event)" (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)"
        (pointerup)="endDrag($event)" (pointercancel)="endDrag($event)" (lostpointercapture)="dragging.set(false)">
        @for (i of steps; track i) {
          <span class="vol__barra" [class.vol__barra--llena]="i < level()" [class.vol__barra--pico]="i === level() - 1"
            [style.--i]="i" [style.--retraso]="delay(i)"></span>
        }
        @for (k of [beat()]; track k) {
          @if (live() && !silent() && level() > 0) {
            <span class="vol__chispa" aria-hidden="true" [style.--pico]="level()"></span>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .vol {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      column-gap: calc(4 * var(--pixel-px));
      align-items: center;
      padding: calc(2 * var(--pixel-px)) calc(2 * var(--pixel-px)) var(--pixel-px);
    }
    .vol__mute { grid-row: 1 / 3; width: 44px; height: 44px; }
    .vol__mute mat-icon { color: var(--luz); }
    .vol__nombre {
      min-width: 0; color: var(--pixel-tinta); font-family: var(--pixel-f-texto); font-size: var(--pixel-letra-media);
      font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .vol__valor {
      min-width: 4ch; color: var(--luz); font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica);
      text-align: right; font-variant-numeric: tabular-nums;
    }

    /* La pista: 30 px de alto (más que los 24 mínimos), y toda la fila responde al dedo; las barras crecen de izquierda a derecha como una escalera. */
    .vol__pista {
      grid-column: 2 / 4;
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: calc(1 * var(--pixel-px));
      height: 30px;
      padding: calc(2 * var(--pixel-px)) 0 calc(1 * var(--pixel-px));
      cursor: pointer;
      touch-action: none;
      outline: none;
    }
    .vol__pista:focus-visible { outline: calc(2 * var(--pixel-px)) solid var(--luz); outline-offset: calc(1 * var(--pixel-px)); }
    .vol__barra {
      position: relative;
      flex: 1 1 0;
      height: calc(30% + var(--i) * 7.7%);
      background: var(--pixel-penumbra-hundida);
      box-shadow: inset 0 calc(-1 * var(--pixel-px)) 0 var(--pixel-separador);
      transform-origin: 50% 100%;
    }
    /* El relleno vive en ::after: la barra salta (transform propio) y el relleno late (transform del pseudo) sin pisarse. */
    .vol__barra::after {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--luz);
      box-shadow: inset 0 var(--pixel-px) 0 var(--pixel-crema), inset 0 calc(-1 * var(--pixel-px)) 0 var(--pixel-tinta-oscura);
      transform-origin: 50% 100%;
      transform: scaleY(0);
    }
    .vol__barra--llena::after { transform: scaleY(1); }
    .vol__barra--pico::after { background: var(--pixel-crema); }

    /* Todo el movimiento vive aquí: sin «movimiento reducido» (del sistema o del juego). Al subir, las barras que se
       encienden saltan en cascada; al bajar, las que se apagan caen un pixel. */
    @media (prefers-reduced-motion: no-preference) {
      .vol:not(.vol--quieto) .vol__barra::after { transition: transform 160ms steps(3), background-color 160ms steps(2); }
      .vol--vivo:not(.vol--quieto) .vol__barra--llena { animation: vol-sube 320ms steps(5) var(--retraso, 0ms) both; }
      .vol--vivo:not(.vol--quieto) .vol__barra:not(.vol__barra--llena) { animation: vol-cae 220ms steps(3) var(--retraso, 0ms) both; }
      /* Mientras se usa (foco de teclado o arrastre; con ratón, también encima), las encendidas laten como un
         ecualizador unos segundos y se quedan quietas. */
      .vol:not(.vol--quieto):not(.vol--silencio) .vol__pista:focus-visible .vol__barra--llena::after,
      .vol--arrastre:not(.vol--quieto):not(.vol--silencio) .vol__barra--llena::after {
        animation: vol-late calc(380ms + var(--i) * 37ms) steps(2) 6 alternate;
      }
      .vol:not(.vol--quieto) .vol__chispa { display: block; animation: vol-chispa 420ms steps(6) both; }
    }
    @media (prefers-reduced-motion: no-preference) and (hover: hover) {
      .vol:not(.vol--quieto):not(.vol--silencio):hover .vol__barra--llena::after {
        animation: vol-late calc(380ms + var(--i) * 37ms) steps(2) 6 alternate;
      }
    }
    @keyframes vol-sube {
      0% { transform: scaleY(.55); }
      55% { transform: scaleY(1.22); }
      100% { transform: scaleY(1); }
    }
    @keyframes vol-cae {
      0% { transform: translateY(calc(-2 * var(--pixel-px))); }
      100% { transform: none; }
    }
    @keyframes vol-late {
      from { transform: scaleY(1); }
      to { transform: scaleY(.78); }
    }

    /* La chispa nace sobre la barra del tope y sube apagándose: se recrea con cada cambio. */
    .vol__chispa {
      position: absolute;
      left: calc((var(--pico) - .5) / 10 * 100% - var(--pixel-px));
      bottom: calc(30% + (var(--pico) - 1) * 7.7% + 2 * var(--pixel-px));
      width: calc(2 * var(--pixel-px));
      height: calc(2 * var(--pixel-px));
      background: var(--pixel-crema);
      box-shadow: calc(-2 * var(--pixel-px)) calc(2 * var(--pixel-px)) 0 var(--luz), calc(2 * var(--pixel-px)) calc(2 * var(--pixel-px)) 0 var(--luz);
      pointer-events: none;
      display: none;
    }
    @keyframes vol-chispa {
      0% { transform: translateY(0) scale(1); opacity: 1; }
      100% { transform: translateY(calc(-6 * var(--pixel-px))) scale(.5); opacity: 0; }
    }

    /* En silencio el nivel se conserva, pero se ve apagado: las barras se hunden, pierden el color y quedan tachadas. */
    .vol--silencio .vol__barra::after { background: var(--pixel-tinta-apagada); box-shadow: none; }
    .vol--silencio .vol__barra--llena::after { transform: scaleY(.4); }
    .vol--silencio .vol__valor { color: var(--pixel-tinta-apagada); }
    /* ::after se pinta sobre las barras sin capa propia. */
    .vol--silencio .vol__pista::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 55%;
      height: calc(1 * var(--pixel-px));
      background: var(--pixel-tinta-apagada);
      transform: rotate(-6deg);
    }

  `],
})
export class VolumeBarsComponent {
  readonly label = input.required<string>();
  readonly muteLabel = input.required<string>();
  /** Nivel 0–10 del canal. */
  readonly level = input(0);
  readonly muted = input(false);
  readonly reduceMotion = input(false);
  readonly iconOn = input('volume_up');
  readonly iconOff = input('volume_off');
  readonly levelChange = output<number>();
  readonly toggleMute = output<void>();

  protected readonly steps = Array.from({ length: VOLUME_STEPS }, (_, i) => i);
  protected readonly labelId = `vol-nombre-${++nextId}`;
  /** Silencio visible: el botón de silencio o la barra en cero. */
  readonly silent = computed(() => this.muted() || this.level() === 0);
  protected readonly percent = computed(() => this.level() * 10);
  protected readonly valueText = computed(() => {
    if (this.muted()) return `Silenciado (nivel guardado: ${this.percent()} %)`;
    return this.level() === 0 ? '0 %, sin sonido' : `${this.percent()} %`;
  });
  /** Las animaciones de cambio solo existen tras la primera interacción: al abrir Ajustes nada salta. */
  protected readonly live = signal(false);
  protected readonly dragging = signal(false);
  /** Recrea la chispa en cada cambio. */
  protected readonly beat = signal(0);
  /** Nivel desde el que se cambió: la cascada empieza junto a él. */
  private readonly from = signal(0);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  protected delay(i: number): string {
    const from = this.from();
    const to = this.level();
    if (to > from) return i >= from && i < to ? `${(i - from) * 30}ms` : '0ms';
    return i >= to && i < from ? `${(from - 1 - i) * 24}ms` : '0ms';
  }

  protected onKeydown(event: KeyboardEvent): void {
    const level = this.level();
    const next = ({
      ArrowRight: level + 1, ArrowUp: level + 1, ArrowLeft: level - 1, ArrowDown: level - 1,
      PageUp: level + 3, PageDown: level - 3, Home: 0, End: VOLUME_STEPS,
    } as Record<string, number>)[event.key];
    if (next === undefined) return;
    // Las flechas también mueven al personaje: la tecla se queda en la barra.
    event.preventDefault();
    event.stopPropagation();
    this.change(next);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const track = this.track().nativeElement;
    track.focus({ preventScroll: true });
    try { track.setPointerCapture(event.pointerId); } catch { /* sin captura: el arrastre sigue mientras el puntero esté encima */ }
    this.dragging.set(true);
    this.change(this.levelAt(event.clientX));
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.change(this.levelAt(event.clientX));
  }

  protected endDrag(event: PointerEvent): void {
    this.dragging.set(false);
    try { this.track().nativeElement.releasePointerCapture(event.pointerId); } catch { /* ya liberada */ }
  }

  /** El centro de cada barra la enciende; el primer cuarto de la primera deja el canal en cero. */
  private levelAt(clientX: number): number {
    const rect = this.track().nativeElement.getBoundingClientRect();
    if (rect.width <= 0) return this.level();
    const ratio = (clientX - rect.left) / rect.width;
    return clampVolumeLevel(Math.ceil(ratio * VOLUME_STEPS - 0.25));
  }

  private change(next: number): void {
    const level = clampVolumeLevel(next);
    if (level === this.level()) return;
    this.from.set(this.level());
    this.live.set(true);
    this.beat.update(n => n + 1);
    this.levelChange.emit(level);
  }
}
