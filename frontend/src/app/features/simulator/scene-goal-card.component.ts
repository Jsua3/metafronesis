import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';

import type { ElementoSala, GuiaEscena } from './caso/guia';
import { DRAFT_COPY } from './draft-copy';
import { type HintAttemptRef, SceneHintComponent } from './scene-hint.component';
import { actionForPlace } from './world-places.util';

let nextGoalCardId = 0;

/**
 * La ficha del objetivo de la escena (4.2): reemplaza la lista «Qué hacer». Plegada es un solo botón con el objetivo que
 * escribió la docente (o un texto de respaldo si la escena no trae); abierta suma «En esta sala» —quién está y qué ya
 * se revisó, con la marca en texto, nunca solo color— y el botón «Pedir una pista».
 *
 * Presentacional: pinta una `GuiaEscena` ya armada y no calcula nada del mundo. Va DENTRO del envoltorio
 * `.objective-card` de la pantalla de juego (que aporta posición, borde y fondo casi opaco). No tiene región viva propia
 * (los anuncios salen por `LiveRegionAnnouncer`) y Esc no la cierra: la cadena de Esc del juego no cambia. Arranca
 * plegada también en compacto: la sala ocupa la pantalla y quien quiere ver la lista la abre.
 */
@Component({
  selector: 'app-scene-goal-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SceneHintComponent],
  host: {
    '[attr.data-goal]': 'guia().objetivo',
    '[attr.data-collapsed]': '!open()',
  },
  template: `
    <section class="goal-card" [attr.aria-label]="copy.goalCardTitle.text" [class.goal-card--compact]="compact()"
      [class.goal-card--pulso]="pulso()" (animationend)="pulso.set(false)">
      <button type="button" class="goal-card__toggle u-boton u-sombra" [attr.aria-expanded]="open()" [attr.aria-controls]="open() ? bodyId : null" (click)="toggle()">
        <span class="goal-card__kicker">{{ guia().pestana || copy.goalCardTitle.text }}</span>
        <span class="goal-card__goal">{{ visibleGoal() }}</span>
<i class="goal-card__chevron u-seguir" [class.goal-card__chevron--open]="open()" aria-hidden="true"></i>
      </button>

      <!-- El cuerpo se crea al abrir por primera vez y después solo se oculta: así «Pedir una pista» conserva su enfriamiento y sus pistas. -->
      @if (everOpened()) {
        <div class="goal-card__body u-placa" [id]="bodyId" [hidden]="!open()">
          <!-- El siguiente paso (V7): qué hacer, con quién o con qué, y dónde; con la cuenta de la sala. Con la guía escrita en
               el caso, el paso actual va DENTRO de la lista (resaltado, con su «Ir allí»): repetirlo arriba duplicaba la ficha. -->
          @if (guia().pasos) {
            <p class="goal-card__paso-cuenta goal-card__paso-cuenta--sola">{{ cuentaDePasos() }}</p>
          } @else if (guia().siguiente; as paso) {
            <p class="goal-card__paso" data-guia-paso>
              <span class="goal-card__paso-cuenta">{{ cuentaDePasos() }}</span>
              <span class="goal-card__paso-texto">{{ paso }}</span>
            </p>
            <!-- «Siguiente paso» conectado con «Ir a…» (P9): el mismo camino automático, sin abrir la lista. -->
            @if (guia().siguienteLugar; as lugar) {
              <!-- BORRADOR: texto pendiente de Psicología. -->
              <button type="button" class="goal-card__ir u-boton" data-guia-ir (click)="goToStep.emit(lugar.key)">
                {{ actionForPlace(lugar.tipo === 'persona' ? 'person' : 'object', lugar.label) }} <span aria-hidden="true">▶</span></button>
            }
          }
          <!-- La guía escrita en el caso: la lista de pasos con su marca en texto (nunca solo color). -->
          @if (guia().pasos; as pasos) {
            <ol class="goal-card__pasos" data-guia-pasos [attr.aria-label]="guia().pestana">
              @for (p of pasos; track $index) {
                <li class="goal-card__pasoitem" [class.goal-card__pasoitem--hecho]="p.hecho" [class.goal-card__pasoitem--actual]="$index === pasoActual()"
                  [attr.data-hecho]="p.hecho" [attr.aria-current]="$index === pasoActual() ? 'step' : null">
                  <span class="goal-card__pasomarca" aria-hidden="true">{{ p.hecho ? '✓' : $index === pasoActual() ? '▸' : p.informativo ? '·' : '○' }}</span>
                  <span class="goal-card__pasotexto">{{ p.texto }}<span class="goal-card__sr"> · {{ p.hecho ? 'hecho' : $index === pasoActual() ? 'tu siguiente paso' : p.informativo ? 'información' : 'pendiente' }}</span></span>
                  @if ($index === pasoActual() && !guia().textoSalida && guia().siguienteLugar; as lugar) {
                    <!-- BORRADOR: texto pendiente de Psicología. -->
                    <button type="button" class="goal-card__ir goal-card__ir--en-paso u-boton" data-guia-ir (click)="goToStep.emit(lugar.key)">
                      {{ actionForPlace(lugar.tipo === 'persona' ? 'person' : 'object', lugar.label) }} <span aria-hidden="true">▶</span></button>
                  }
                </li>
              }
            </ol>
            @if (guia().textoSalida) {
              <p class="goal-card__paso">{{ guia().textoSalida }}</p>
              @if (guia().siguienteLugar; as salida) {
                <button type="button" class="goal-card__ir u-boton" data-guia-ir (click)="goToStep.emit(salida.key)">
                  {{ actionForPlace('object', salida.label) }} <span aria-hidden="true">▶</span></button>
              }
            }
          }
          @if (guia().enEstaSala.length) {
            <!-- Con la guía escrita, los pasos ya dicen con quién hablar: «En esta sala» queda plegada (la ficha no tapa la sala). -->
            @if (guia().pasos) {
              <details class="goal-card__sala">
                <summary class="goal-card__list-title goal-card__sala-titulo">{{ copy.roomListTitle.text }} · {{ guia().enEstaSala.length }}</summary>
                <ul class="goal-card__list">
                  @for (el of guia().enEstaSala; track el.key) {
                    <li class="goal-card__item">{{ el.label }} · <span class="goal-card__mark" [class.goal-card__mark--hecha]="el.visto">{{ mark(el) }}</span></li>
                  }
                </ul>
              </details>
            } @else {
              <h3 class="goal-card__list-title">{{ copy.roomListTitle.text }}</h3>
              <ul class="goal-card__list">
                @for (el of guia().enEstaSala; track el.key) {
                  <li class="goal-card__item">{{ el.label }} · <span class="goal-card__mark" [class.goal-card__mark--hecha]="el.visto">{{ mark(el) }}</span></li>
                }
              </ul>
            }
          }
          <!-- La pista se arma solo cuando la persona abre la ficha a mano: abierta sola (al empezar o al cambiar el objetivo)
               no pide nada al servidor, que con una respuesta buena retiraría un aviso de conexión pendiente. -->
          @if (abiertaAMano() && hintAttempt(); as attempt) {
            <app-scene-hint variante="placa" [attemptId]="attempt.attemptId"
              [buttonLabel]="copy.hintAskLabel.text" (consentRequired)="consentRequired.emit()" />
          }
        </div>
      }
    </section>
  `,
  styles: [`
    /* Bloque U1: la ficha en las piezas del cuadro de diálogo (hoja común). Plegada es una placa-botón con el kicker en la
       letra de las pestañas y la flecha de seguir; abierta suma una placa con «En esta sala» y «Pedir una pista» (la placa
       de la pista de I1). Objetivo táctil de 44 px con cualquier puntero; ningún texto baja de 12 px. */
    :host { display: block; min-width: 0; }
    .goal-card { position: relative; display: grid; min-width: 0; color: var(--pixel-tinta); font-family: var(--pixel-f-texto); font-size: var(--pixel-tam); }
    .goal-card__toggle {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'kicker chevron' 'goal chevron';
      align-items: center;
      gap: 1px calc(5 * var(--pixel-px));
      width: 100%;
      min-height: 44px;
      padding: calc(2 * var(--pixel-px)) calc(5 * var(--pixel-px)) calc(3 * var(--pixel-px));
      text-align: left;
      white-space: normal;
    }
    .goal-card__kicker { grid-area: kicker; font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica); font-weight: 700; letter-spacing: .02em; color: var(--pixel-tinta-suave); }
    .goal-card__goal { grid-area: goal; min-width: 0; font-weight: 600; line-height: 1.35; color: var(--pixel-tinta); overflow-wrap: anywhere; }
    .goal-card__chevron { grid-area: chevron; }
    .goal-card__chevron--open { transform: scaleY(-1); }
    @media (hover: hover) and (pointer: fine) {
      .goal-card__toggle:hover .goal-card__kicker { color: var(--luz); }
      .goal-card__toggle:hover .goal-card__goal { color: var(--pixel-tinta); }
    }

    /* Teléfono (≤ 560 px): más sala a la vista. Sin el kicker, y plegada la ficha lleva el objetivo en una línea con puntos
       suspensivos (el texto sigue entero en el DOM y la ficha se abre al tocar; abierta lo muestra completo). */
    @media (max-width: 560px) {
      .goal-card__kicker { display: none; }
      .goal-card__toggle { grid-template-areas: 'goal chevron'; }
      :host([data-collapsed='true']) .goal-card__goal { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }

    .goal-card__body { display: grid; gap: calc(3 * var(--pixel-px)); min-width: 0; margin-top: calc(-1 * var(--pixel-px)); padding: calc(3 * var(--pixel-px)) calc(5 * var(--pixel-px)) calc(4 * var(--pixel-px)); }
    /* «display: grid» pisa el estilo de «hidden»: plegada, el cuerpo sigue vivo (conserva el enfriamiento de la pista) pero no se ve. */
    .goal-card__body[hidden] { display: none; }
    /* El siguiente paso (V7): la cuenta con la letra de las pestañas y el paso con la tinta clara. */
    .goal-card__paso { display: grid; gap: var(--pixel-px); margin: 0; }
    .goal-card__paso-cuenta { font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica); font-weight: 700; letter-spacing: .04em; color: var(--luz); }
    .goal-card__paso-texto { font-weight: 600; line-height: 1.35; }
    .goal-card__ir { justify-self: start; min-height: 44px; font-size: var(--pixel-letra-media); }
    /* Al cambiar el objetivo la ficha se vuelve a abrir con un pulso suave, una vez; nada con movimiento reducido. */
    .goal-card--pulso .goal-card__toggle { animation: goal-pulso 1.2s steps(6, jump-none) 1; }
    @keyframes goal-pulso { 50% { box-shadow: 0 0 0 calc(2 * var(--pixel-px)) var(--luz); } }
    @media (prefers-reduced-motion: reduce) { .goal-card--pulso .goal-card__toggle { animation: none; } }
    .goal-card__list-title { margin: 0; font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica); font-weight: 700; color: var(--luz); }
    .goal-card__list { display: grid; gap: var(--pixel-px); margin: 0; padding: 0; list-style: none; }
    .goal-card__item { line-height: 1.35; color: var(--pixel-tinta); overflow-wrap: anywhere; }
    .goal-card__mark { font-family: var(--pixel-f-nombre); font-size: var(--pixel-letra-chica); color: var(--pixel-tinta-suave); }
    .goal-card__mark--hecha { color: var(--pixel-hecho); }
    app-scene-hint { display: block; }
    .goal-card__pasos { display: grid; gap: calc(2 * var(--pixel-px)); margin: 0; padding: 0; list-style: none; }
    .goal-card__pasoitem { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: calc(2 * var(--pixel-px)); line-height: 1.35; overflow-wrap: anywhere; }
    .goal-card__pasoitem--hecho { color: var(--pixel-tinta-suave); text-decoration: line-through; }
    /* El paso actual: la marca de seguir y una regla de luz a la izquierda (no solo color: también la marca «▸»). */
    .goal-card__pasoitem--actual {
      margin-inline-start: calc(-3 * var(--pixel-px)); padding-inline-start: calc(2 * var(--pixel-px));
      border-inline-start: var(--pixel-px) solid var(--luz); font-weight: 600;
    }
    .goal-card__pasoitem--actual .goal-card__pasomarca { color: var(--luz); }
    .goal-card__ir--en-paso { grid-column: 2; margin-top: var(--pixel-px); }
    .goal-card__paso-cuenta--sola { margin: 0; }
    .goal-card__sala-titulo { cursor: pointer; list-style: none; min-height: 32px; display: flex; align-items: center; gap: var(--pixel-px); }
    .goal-card__sala-titulo::-webkit-details-marker { display: none; }
    .goal-card__sala-titulo::before { content: '▸'; display: inline-block; }
    .goal-card__sala[open] > .goal-card__sala-titulo::before { content: '▾'; }
    .goal-card__sala > .goal-card__list { margin-top: var(--pixel-px); }
    .goal-card__pasomarca { font-family: var(--pixel-f-nombre); font-weight: 700; }
    .goal-card__pasoitem--hecho .goal-card__pasomarca { color: var(--pixel-hecho); }
    .goal-card__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `],
})
export class SceneGoalCardComponent {
  protected readonly actionForPlace = actionForPlace;
  protected readonly copy = DRAFT_COPY;
  /** Id propio de cada ficha: `aria-controls` apunta a un cuerpo que existe y que no choca con el de otra instancia. */
  protected readonly bodyId = `goal-card-body-${nextGoalCardId++}`;

  readonly guia = input.required<GuiaEscena>();
  readonly hintAttempt = input<HintAttemptRef | null>(null);
  /** Pantalla baja o táctil horizontal: la ficha pide menos sitio y arranca plegada. */
  readonly compact = input(false);
  /** El ajuste «Reducir movimiento» del juego: sin pulso al cambiar el objetivo. */
  readonly reduceMotion = input(false);
  /** Se abrió: la pantalla refresca «En esta sala» antes de que se lea. */
  readonly opened = output<void>();
  /** La pista recibió 403 `CONSENT_REQUIRED`: la pantalla vuelve al aviso previo como con cualquier otra orden. */
  readonly consentRequired = output<void>();
  /** Pidió ir al siguiente paso (P9): quien aloja la ficha camina hasta esa clave como con «Ir a…». */
  readonly goToStep = output<string>();

  protected readonly open = signal(false);
  protected readonly everOpened = signal(false);
  /** La persona la abrió con su botón al menos una vez: recién entonces se arma «Pedir una pista». */
  protected readonly abiertaAMano = signal(false);
  protected readonly visibleGoal = computed(() => this.guia().objetivo || DRAFT_COPY.goalCardFallback.text);
  /** El pulso de una vez al cambiar el objetivo (la clase se quita al terminar la animación). */
  protected readonly pulso = signal(false);
  /** «Siguiente paso · 2 de 6» mientras queda algo en la sala; con todo hecho, «Todo hecho en esta sala». */
  protected readonly cuentaDePasos = computed(() => {
    const { hechos, total, pasos } = this.guia();
    if (total === 0) return 'Siguiente paso';
    if (pasos && hechos < total) return `${hechos} de ${total} hechos`;
    return hechos >= total ? `Todo hecho en esta sala · ${total} de ${total}` : `Siguiente paso · ${hechos + 1} de ${total}`;
  });
  protected readonly pasoActual = computed(() => this.guia().pasoActual ?? -1);
  /** Los pasos que se cumplen salen por el anunciador de la app (la ficha no tiene región viva propia). */
  private readonly anunciador = inject(LiveRegionAnnouncer);
  private hechosVistos: ReadonlySet<string> | null = null;
  private objetivoVisto: string | null = null;

  constructor() {
    // Pasos de la guía escrita que pasan a hechos: se anuncian los nuevos, nunca los que ya venían hechos.
    effect(() => {
      const pasos = this.guia().pasos;
      untracked(() => {
        if (!pasos) { this.hechosVistos = null; return; }
        const hechos = new Set(pasos.filter(p => p.hecho).map(p => p.texto));
        const nuevos = this.hechosVistos ? [...hechos].filter(t => !this.hechosVistos!.has(t)) : [];
        this.hechosVistos = hechos;
        if (nuevos.length) this.anunciador.announce(`Paso hecho: ${nuevos.join('. ')}`);
      });
    });
    // Guía para las primeras testers (V7): al empezar el caso la ficha está abierta; al cambiar el objetivo se vuelve a
    // abrir con un pulso. En compacto (pantalla baja o táctil horizontal) sigue plegada: la sala ocupa la pantalla.
    effect(() => {
      const objetivo = this.guia().objetivo;
      if (!objetivo) return;
      untracked(() => {
        if (objetivo === this.objetivoVisto) return;
        const primera = this.objetivoVisto === null;
        this.objetivoVisto = objetivo;
        if (this.compact()) return;
        this.open.set(true);
        this.everOpened.set(true);
        if (!primera && !this.reduceMotion()) this.pulso.set(true);
      });
    });
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.everOpened.set(true);
      this.abiertaAMano.set(true);
      this.opened.emit();
    }
  }

  /**
   * La marca va en texto: una persona se «habla», un objeto se «revisa». Lo que falta lo dice con palabras (P9: «aún no» se
   * leía como «no disponible»): la persona a la que apunta el siguiente paso es «tu siguiente paso»; las demás, «sin hablar todavía».
   */
  protected mark(el: ElementoSala): string {
    if (el.visto) return el.tipo === 'persona' ? DRAFT_COPY.roomMarkTalked.text : DRAFT_COPY.roomMarkReviewed.text;
    if (el.tipo === 'persona') return el.key === this.guia().siguienteLugar?.key ? DRAFT_COPY.roomMarkNextStep.text : DRAFT_COPY.roomMarkUntalked.text;
    return DRAFT_COPY.roomMarkNotYet.text;
  }
}
