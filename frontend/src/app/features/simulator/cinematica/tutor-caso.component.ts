import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { KIT_ASSETS } from '../../character/kit/character-visual.resolver';
import { conNombre } from '../caso/plantilla-nombre';
import { SafeExitButtonComponent } from '../safe-exit-button.component';
import { lineaDeLosPasos } from './lectura';
import type { TutorLeido } from './lectura';

/** Lado del retrato del kit en píxeles del arte. */
const RETRATO = 32;

/**
 * Píxeles CSS del retrato: un número ENTERO de píxeles físicos por píxel del arte (×3 en pantalla normal, ×2 en un
 * teléfono), así el retrato de 32 × 32 no se deforma con un devicePixelRatio fraccionario (1,25; 1,5). Pura.
 */
export function ladoDelRetrato(dpr: number, estrecha: boolean): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const k = Math.max(1, Math.round((estrecha ? 2 : 3) * d));
  return (RETRATO * k) / d;
}

/**
 * El tutor del caso (contrato del caso insignia, §2): una capa sobre el mundo, FUERA de la historia, con el retrato del kit,
 * su nombre y su rol. Las líneas avanzan con Enter, Espacio o un clic en la tarjeta; si trae pasos, la lista numerada se ve
 * junto a la penúltima línea. «Salida segura» está en la tarjeta (REGLA-004) y Esc la pide: lo atiende quien la aloja, como
 * en la tarjeta de entrada. No trae texto de ningún caso: todo llega en `tutor`, y `{nombre}` se pone aquí.
 */
@Component({
  selector: 'app-tutor-caso',
  standalone: true,
  imports: [A11yModule, SafeExitButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.tutor--reducido]': 'reduceMotion()' },
  template: `
    <div class="tutor-trampa" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
      <section class="tutor" role="dialog" aria-modal="true" aria-labelledby="tutor-nombre" aria-describedby="tutor-linea">
        <article class="tutor__tarjeta" (click)="clic($event)">
          <header class="tutor__cabeza">
            @if (retrato()) {
              <img class="tutor__retrato" [src]="retrato()" alt="" width="32" height="32"
                [style.width.px]="ladoRetrato" [style.height.px]="ladoRetrato" (error)="sinRetrato.set(true)" />
            }
            <div class="tutor__quien">
              <p class="tutor__nombre u-rotulo" id="tutor-nombre"><span class="u-rotulo__texto">{{ nombreTutor() }}</span></p>
              @if (rol()) { <p class="tutor__rol">{{ rol() }}</p> }
            </div>
            @if (total() > 1) {
              <p class="tutor__cuenta" aria-hidden="true">{{ indice() + 1 }} / {{ total() }}</p>
            }
          </header>

          <div class="tutor__cuerpo u-placa u-sombra">
            <!-- El desplazamiento va DENTRO de la placa: si fuera la placa la que se desplaza, sus bordes de píxel (pseudo-
                 elementos que salen de la caja) sacan barras de desplazamiento aunque el texto quepa. -->
            <div class="tutor__texto">
            @for (l of [indice()]; track l) {
              <p class="tutor__linea" id="tutor-linea">{{ linea() }}</p>
              @if (conPasos()) {
                <ol class="tutor__pasos" role="list">
                  @for (paso of pasos(); track $index) {
                    <li class="tutor__paso" [style.animation-delay.ms]="reduceMotion() ? 0 : 120 + $index * 70">
                      <span class="tutor__numero">{{ paso.numero }}</span>&ngsp;
                      <span><strong>{{ paso.titulo }}</strong>@if (paso.detalle) {<span class="tutor__detalle">{{ ' ' + paso.detalle }}</span>}</span>
                    </li>
                  }
                </ol>
              }
            }
            </div>
          </div>

          <footer class="tutor__acciones">
            <app-safe-exit-button variante="placa" [pausing]="pausing()" (pause)="salidaSegura.emit()" />
            <span class="tutor__hueco"></span>
            @if (indice() > 0) {
              <button type="button" class="u-boton tutor__boton" (click)="anterior()">Anterior</button>
            }
            <button type="button" class="u-ficha u-ficha--primaria tutor__boton tutor__seguir" cdkFocusInitial (click)="seguir()">
              {{ ultima() ? 'Continuar' : 'Seguir' }}
            </button>
          </footer>
        </article>
      </section>
    </div>
  `,
  styles: [`
    :host {
      position: fixed; inset: 0;
      /* Sobre el mundo y el umbral, bajo el aviso de contenido y «Reanudar» (como la tarjeta de entrada). Con tokens. */
      z-index: calc(var(--ds-z-modal) * 3 + var(--ds-z-cubierta) * 1.05);
      display: block;
      background: var(--pixel-velo);
      animation: tutor-funde var(--ds-dur-slow) var(--ds-ease-out) both;
    }
    .tutor-trampa, .tutor { position: absolute; inset: 0; }
    .tutor {
      display: grid; place-items: end center;
      padding: clamp(12px, 4vh, 48px) clamp(10px, 3vw, 32px);
    }
    .tutor__tarjeta {
      display: grid; gap: 0;
      width: min(760px, 100%);
      max-height: calc(100dvh - 24px);
      color: var(--pixel-tinta);
      font-family: var(--pixel-f-texto);
      animation: tutor-sube var(--ds-dur-slow) var(--ds-ease-out) both;
      cursor: pointer;
    }
    .tutor__cabeza { display: flex; align-items: flex-end; gap: 12px; padding: 0 4px; }
    .tutor__retrato {
      flex: none; display: block;
      image-rendering: pixelated; image-rendering: crisp-edges;
      margin-bottom: calc(-2 * var(--pixel-px));
      border: calc(2 * var(--pixel-px)) solid var(--pixel-contorno);
      background: var(--pixel-penumbra-alzada);
    }
    .tutor__quien { display: grid; gap: 2px; min-width: 0; padding-bottom: 2px; }
    .tutor__nombre { margin: 0; }
    .tutor__rol {
      margin: 0 0 6px calc(6 * var(--pixel-px));
      font-size: max(var(--pixel-letra-minima), calc(var(--pixel-tam) * 0.86));
      color: var(--pixel-tinta-suave);
    }
    .tutor__cuenta {
      margin: 0 0 8px auto; font-family: var(--pixel-f-nombre);
      font-size: var(--pixel-letra-minima); color: var(--pixel-tinta-apagada);
    }
    .tutor__cuerpo {
      padding: calc(7 * var(--pixel-px)) calc(10 * var(--pixel-px)) calc(8 * var(--pixel-px));
    }
    .tutor__texto {
      max-height: min(56dvh, 460px);
      overflow-x: hidden; overflow-y: auto;
      overscroll-behavior: contain;
    }
    .tutor__linea {
      margin: 0;
      font-size: max(16px, calc(var(--pixel-tam) * 1.22));
      line-height: 1.55;
      animation: tutor-funde 260ms var(--ds-ease-out) both;
    }
    .tutor__pasos { display: grid; gap: 8px; margin: 14px 0 2px; padding: 0; list-style: none; }
    .tutor__paso {
      display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 10px;
      font-size: max(var(--pixel-letra-minima), calc(var(--pixel-tam) * 1.02));
      line-height: 1.45;
      animation: tutor-sube 320ms var(--ds-ease-out) both;
    }
    .tutor__numero {
      display: inline-grid; place-items: center;
      min-width: calc(12 * var(--pixel-px)); height: calc(12 * var(--pixel-px));
      font-family: var(--pixel-f-nombre); font-weight: 700;
      color: var(--pixel-tinta-oscura); background: var(--luz);
    }
    .tutor__paso strong { color: var(--luz); font-weight: 700; }
    .tutor__detalle { color: var(--pixel-tinta); }
    .tutor__acciones {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      padding: 10px 2px 0;
    }
    .tutor__hueco { flex: 1; }
    .tutor__boton { min-height: 44px; font-size: max(var(--pixel-letra-minima), calc(var(--pixel-tam) * 0.98)); }
    .tutor__seguir { padding: 0 calc(10 * var(--pixel-px)); }
    :host(.tutor--reducido), :host(.tutor--reducido) .tutor__tarjeta, :host(.tutor--reducido) .tutor__linea,
    :host(.tutor--reducido) .tutor__paso { animation-duration: 1ms; }
    @keyframes tutor-funde { from { opacity: 0; } }
    @keyframes tutor-sube { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) {
      :host, .tutor__tarjeta, .tutor__linea, .tutor__paso { animation-duration: 1ms; }
    }
  `],
})
export class TutorCasoComponent {
  readonly tutor = input.required<TutorLeido>();
  /** El nombre de quien juega (o ''): reemplaza `{nombre}` en todo el texto del tutor. */
  readonly nombre = input('');
  readonly reduceMotion = input(false);
  readonly pausing = input(false);

  readonly cerrado = output<void>();
  readonly salidaSegura = output<void>();

  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly indice = signal(0);
  readonly sinRetrato = signal(false);
  readonly ladoRetrato = ladoDelRetrato(
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    typeof window !== 'undefined' && window.innerWidth < 560,
  );

  private readonly con = (t: string | undefined) => conNombre(t ?? '', this.nombre());
  readonly nombreTutor = computed(() => this.con(this.tutor().nombre));
  readonly rol = computed(() => this.con(this.tutor().rol));
  readonly total = computed(() => this.tutor().lineas.length);
  readonly linea = computed(() => this.con(this.tutor().lineas[this.indice()]));
  readonly ultima = computed(() => this.indice() >= this.total() - 1);
  readonly pasos = computed(() => this.tutor().pasos.map(p => ({
    numero: p.numero, titulo: this.con(p.titulo), detalle: p.detalle ? this.con(p.detalle) : '',
  })));
  readonly conPasos = computed(() => this.pasos().length > 0 && this.indice() === lineaDeLosPasos(this.tutor()));
  readonly retrato = computed(() => {
    const receta = this.tutor().recipeId;
    return receta && !this.sinRetrato() ? `${KIT_ASSETS}/${receta}/portrait-neutral.png` : null;
  });

  constructor() {
    // Cada línea se anuncia (con la lista, si la trae): el foco se queda en «Seguir» y el lector no la leería solo.
    effect(() => {
      const linea = this.linea();
      const pasos = this.conPasos() ? this.pasos() : [];
      const nombre = untracked(() => this.nombreTutor());
      const lista = pasos.map(p => `${p.numero}. ${p.titulo}${p.detalle ? ` ${p.detalle}` : ''}`).join(' ');
      untracked(() => this.announcer.announce(`${this.indice() === 0 ? `${nombre}: ` : ''}${linea}${lista ? ` ${lista}` : ''}`));
    });
  }

  seguir(): void {
    if (this.ultima()) {
      this.cerrado.emit();
      return;
    }
    this.indice.update(i => i + 1);
  }

  anterior(): void {
    this.indice.update(i => Math.max(0, i - 1));
  }

  /** Un clic en la tarjeta (fuera de sus botones) pasa a la línea siguiente. */
  clic(event: MouseEvent): void {
    const destino = event.target as HTMLElement | null;
    if (destino?.closest?.('button, a, [role="button"]')) return;
    this.seguir();
  }

  /** Enter y Espacio pasan la línea también con el foco fuera de los botones (los botones se activan solos). */
  @HostListener('document:keydown', ['$event'])
  tecla(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const destino = event.target as HTMLElement | null;
    if (destino?.closest?.('button, a, input, textarea, select, [role="button"]')) return;
    event.preventDefault();
    this.seguir();
  }
}
