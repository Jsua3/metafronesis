import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output,
  signal, untracked, viewChild,
} from '@angular/core';

import { DRAFT_COPY } from './draft-copy';
import { HELP_TEXT, HelpModality, firstTimeHelpLines, helpSections } from './game-help.content';

let nextHelpId = 0;

/**
 * Ayuda «Cómo se juega» (F§5.8, F§6.4). Presentacional: no lee ni escribe la memoria de ayuda
 * (`siep.ayuda.v1`); quien la aloja decide cuándo mostrarla y registra que se vio.
 *
 * Dos vistas del mismo componente:
 * - `card`: tarjeta de primera vez. NO modal: sin trampa de foco ni foco inicial, sin temporizador,
 *   sin manejo de teclado. No consume Esc, así que Esc sigue llegando a la cadena de la pantalla
 *   de juego (ayuda -> bitácora -> diálogo -> pausa).
 * - `screen`: pantalla permanente. El foco entra y queda dentro mientras está abierta
 *   (`cdkTrapFocus`), pero tampoco escucha Esc: «Cerrar ayuda» emite `closed` y la pantalla de
 *   juego cierra la ayuda con Esc antes de pausar. No hay ningún botón «Salida segura»: el pie
 *   del juego sigue operable con ratón y toque.
 *
 * La promesa de pausa y de la tecla Esc solo se escribe con `safeExitPromise`.
 * Los botones miden 44 px como mínimo y su nombre accesible es su texto visible (WCAG 2.5.3).
 * Sin animación ni desenfoque: no hay nada que apagar con movimiento reducido.
 */
@Component({
  selector: 'app-game-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  template: `
    @if (view() === 'card') {
      <section class="help-card" data-help-view="card" [class.help-card--compact]="compact()"
        [attr.aria-labelledby]="titleId">
        <h2 class="help-card__title" [attr.id]="titleId">{{ text.title }}</h2>
        <div class="help-card__lines">
          @for (line of cardLines(); track line) {
            <p>{{ line }}</p>
          }
        </div>
        <div class="help-card__actions">
          <button type="button" class="help-btn help-btn--primary" data-help-action="dismiss"
            (click)="dismissed.emit()">{{ text.understood }}</button>
          <button type="button" class="help-btn" data-help-action="more"
            (click)="openFull.emit()">{{ text.moreHelp }}</button>
        </div>
      </section>
    } @else {
      <section class="help-screen" role="dialog" aria-modal="true" data-help-view="screen"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" [attr.aria-labelledby]="titleId">
        <header class="help-screen__head">
          <h2 class="help-screen__title" [attr.id]="titleId">{{ text.title }}</h2>
          <button type="button" class="help-btn" data-help-action="close"
            (click)="closed.emit()">{{ text.closeHelp }}</button>
        </header>
        <div #cuerpo class="help-screen__body" tabindex="0" role="region" aria-label="Contenido de la ayuda">
          @for (section of sections(); track section.id; let i = $index) {
            <section class="help-section" [attr.data-help-section]="section.id" [hidden]="!enPagina(i)">
              <h3 class="help-section__title">{{ section.title }}</h3>
              <p class="help-section__text">{{ section.text }}</p>
            </section>
          }
          <!-- Fuera del bloque validado (F6-10, VD-18): nota en borrador sobre los atajos de una tecla. -->
          <aside class="help-draft" data-help-draft="shortcuts" aria-label="Nota sobre los atajos de una tecla (borrador)"
            [hidden]="!enPagina(sections().length)">
            <p class="help-draft__tag">Borrador</p>
            <p class="help-section__text">{{ shortcutsNote }}</p>
          </aside>
        </div>
        <!-- Sin sitio para todo, la hoja va en páginas de secciones enteras, como el cuadro de diálogo (V6): nunca se
             desplaza. Mientras se mide (sin páginas aún) el pie está, así la medida ya cuenta su alto. -->
        @if (paginas().length !== 1) {
          <footer class="help-screen__pie">
            <span class="help-screen__cuenta" aria-live="polite">{{ cuenta() }}</span>
            <button type="button" class="help-btn" data-help-action="anterior" [attr.aria-disabled]="pagina() === 0"
              (click)="irA(-1)">Anterior</button>
            <button type="button" class="help-btn" data-help-action="siguiente" [attr.aria-disabled]="ultima()"
              (click)="irA(1)">Siguiente</button>
          </footer>
        }
      </section>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    .help-card {
      display: grid;
      gap: 8px;
      box-sizing: border-box;
      max-width: 560px;
      padding: 12px 14px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 12px;
      background: rgba(8,12,18,.96);
      /* Marco doble: línea interna oscura, igual que la tarjeta «Qué hacer». */
      box-shadow:
        inset 0 0 0 1px rgba(8,12,18,.95),
        0 12px 30px -22px rgba(124,77,255,.55);
      color: rgba(232,240,244,.92);
    }
    .help-card__title,
    .help-screen__title {
      margin: 0;
      font-size: .82rem;
      font-weight: 900;
      letter-spacing: .04em;
      color: #cdbcff;
    }
    .help-card__lines { display: grid; gap: 6px; }
    .help-card__lines p { margin: 0; font-size: .82rem; line-height: 1.45; }
    .help-card__actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .help-card--compact { gap: 6px; padding: 8px 10px; }
    .help-card--compact .help-card__title { font-size: .75rem; }
    .help-card--compact .help-card__lines p { font-size: .78rem; line-height: 1.4; }

    .help-btn {
      box-sizing: border-box;
      min-width: 44px;
      min-height: 44px;
      padding: 8px 16px;
      border: 1px solid rgba(182,156,255,.55);
      border-radius: 12px;
      background: transparent;
      color: #e8f0f4;
      font: inherit;
      font-size: .82rem;
      font-weight: 800;
      cursor: pointer;
    }
    .help-btn--primary { border-color: #b69cff; background: #b69cff; color: #0b0f1a; }
    .help-btn:focus-visible { outline: 3px solid #c9b3ff; outline-offset: 3px; }
    .help-btn:active { transform: translateY(1px); }

    /* Dentro de la pantalla del juego (U1, crítica r2): la tarjeta de primera vez y la hoja de ayuda en las placas de pixel
       del cuadro de diálogo, no en el vidrio morado; «Entendido» es la ficha encendida (crema) y el resto, placas-botón.
       Fuera del juego (el vestíbulo) siguen las reglas de arriba. */
    :host-context(.pixel-juego) .help-card,
    :host-context(.pixel-juego) .help-screen {
      border-style: solid; border-width: calc(4 * var(--pixel-px)); border-color: transparent; border-radius: 0;
      border-image: var(--marco-placa) 4 / calc(4 * var(--pixel-px)) stretch;
      background-color: var(--pixel-penumbra); background-image: var(--trama-placa);
      background-size: calc(8 * var(--pixel-px)); background-clip: padding-box;
      box-shadow: none; color: var(--pixel-tinta); font-family: var(--pixel-f-texto);
    }
    :host-context(.pixel-juego) .help-card__title,
    :host-context(.pixel-juego) .help-screen__title { font-family: var(--pixel-f-nombre); font-weight: 700; color: var(--luz); }
    :host-context(.pixel-juego) .help-screen__head { border-bottom-color: var(--pixel-separador); }
    :host-context(.pixel-juego) .help-btn {
      --m: var(--marco-placa); --t: var(--trama-placa);
      padding: 0 calc(6 * var(--pixel-px)) 1px;
      border-style: solid; border-width: calc(4 * var(--pixel-px)); border-color: transparent; border-radius: 0;
      border-image: var(--m) 4 / calc(4 * var(--pixel-px)) stretch;
      background-color: var(--pixel-penumbra); background-image: var(--t);
      background-size: calc(8 * var(--pixel-px)); background-clip: padding-box;
      color: var(--pixel-tinta); font-family: var(--pixel-f-texto); font-weight: 600;
    }
    :host-context(.pixel-juego) .help-btn--primary {
      --m: var(--marco-ficha-elegida); --t: var(--trama-ficha-elegida);
      background-color: var(--pixel-crema); color: var(--pixel-tinta-oscura); font-weight: 700;
    }
    :host-context(.pixel-juego) .help-btn:focus-visible { outline: var(--pixel-px) solid var(--luz); outline-offset: calc(2 * var(--pixel-px)); }
    :host-context(.pixel-juego) .help-btn:active { transform: translateY(var(--pixel-px)); }
    @media (hover: hover) and (pointer: fine) {
      :host-context(.pixel-juego) .help-btn:hover { outline: var(--pixel-px) solid var(--luz); outline-offset: calc(2 * var(--pixel-px)); }
    }

    .help-screen {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      max-width: 640px;
      max-height: min(78vh, 560px);
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 14px;
      background: rgba(8,12,18,.97);
      box-shadow:
        inset 0 0 0 1px rgba(8,12,18,.95),
        0 18px 48px -28px rgba(124,77,255,.6);
      color: rgba(232,240,244,.92);
    }
    .help-screen__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      padding: 8px 12px 8px 16px;
      border-bottom: 1px solid rgba(182,156,255,.22);
    }
    .help-screen__title { font-size: .95rem; }
    .help-screen__body {
      display: grid;
      gap: 12px;
      min-height: 0;
      padding: 12px 16px 16px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .help-screen__body:focus-visible { outline: 3px solid #c9b3ff; outline-offset: -3px; }
    .help-screen__body > [hidden] { display: none; }
    .help-screen__pie {
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
      padding: 8px 12px 8px 16px; border-top: 1px solid rgba(182,156,255,.22);
    }
    .help-screen__cuenta { margin-right: auto; font-size: max(12px, .78rem); font-weight: 700; }
    .help-btn[aria-disabled="true"] { opacity: .45; cursor: default; }
    :host-context(.pixel-juego) .help-screen__pie { border-top-color: var(--pixel-separador); }
    /* Fuera del bloque validado: borde discontinuo (la forma, no solo el color, dice «borrador»). */
    .help-draft {
      display: grid;
      gap: 4px;
      padding: 8px 12px;
      border: 1px dashed var(--ds-border-strong);
      border-radius: var(--ds-radius-md);
    }
    .help-draft__tag {
      margin: 0; font-size: var(--ds-type-caption-size); font-weight: 900; letter-spacing: .06em;
      text-transform: uppercase; color: var(--ds-primary);
    }
    .help-section__title { margin: 0 0 2px; font-size: .8rem; font-weight: 900; color: #cdbcff; }
    .help-section__text { margin: 0; font-size: .82rem; line-height: 1.5; }

    @media (max-height: 520px) {
      .help-screen { max-height: 92vh; }
    }
  `],
})
export class GameHelpComponent {
  /** `card`: tarjeta de primera vez (no modal). `screen`: pantalla permanente «Cómo se juega». */
  readonly view = input<'card' | 'screen'>('card');
  /** Teclado y ratón, o pantalla táctil (decide las teclas y los gestos que se explican). */
  readonly modality = input<HelpModality>('keyboard');
  /** Pantalla baja: la tarjeta se reduce a una frase y se compacta. */
  readonly compact = input(false);
  /** Verdadero solo cuando «Salida segura» es alcanzable en todos los estados (F§6.3). */
  readonly safeExitPromise = input(false);
  /** Ajuste «Atajos de una tecla» (F6-10): apagado, el texto de teclado no promete WASD, E, J ni los números. */
  readonly shortcuts = input(true);

  /** «Entendido» en la tarjeta de primera vez. */
  readonly dismissed = output<void>();
  /** «Más ayuda» en la tarjeta de primera vez: abrir la pantalla permanente. */
  readonly openFull = output<void>();
  /** «Cerrar ayuda» en la pantalla permanente (Esc lo gestiona la pantalla de juego). */
  readonly closed = output<void>();

  protected readonly text = HELP_TEXT;
  protected readonly shortcutsNote = DRAFT_COPY.shortcutsHelpNote.text;
  protected readonly titleId = `game-help-title-${nextHelpId++}`;

  protected readonly cardLines = computed(() =>
    firstTimeHelpLines({
      modality: this.modality(),
      compact: this.compact(),
      safeExitPromise: this.safeExitPromise(),
      singleKeyShortcuts: this.shortcuts(),
    }),
  );
  protected readonly sections = computed(() =>
    helpSections({
      modality: this.modality(),
      safeExitPromise: this.safeExitPromise(),
      singleKeyShortcuts: this.shortcuts(),
    }),
  );

  private readonly injector = inject(Injector);
  private readonly cuerpo = viewChild<ElementRef<HTMLElement>>('cuerpo');
  /**
   * Páginas de la hoja (V6, «ningún menú pide desplazar»): qué piezas del cuerpo (las secciones y, al final, la nota en
   * borrador) van en cada una. Vacío mientras se mide; una sola página cuando todo cabe.
   */
  protected readonly paginas = signal<number[][]>([]);
  protected readonly pagina = signal(0);
  protected readonly cuenta = computed(() => `${this.pagina() + 1} de ${Math.max(this.paginas().length, 1)}`);
  protected readonly ultima = computed(() => this.pagina() >= this.paginas().length - 1);

  constructor() {
    // Se vuelve a medir al abrir la hoja y cuando cambia su texto (modalidad, atajos).
    effect(() => {
      this.sections();
      if (this.view() === 'screen') untracked(() => this.remedir());
    });
    // Y cuando cambia el tamaño de la ventana (o el zoom): otro alto, otras páginas. No es manejo de teclado.
    const alCambiar = () => { if (this.view() === 'screen') this.remedir(); };
    window.addEventListener('resize', alCambiar);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', alCambiar));
  }

  protected enPagina(pieza: number): boolean {
    const paginas = this.paginas();
    return paginas.length === 0 || (paginas[this.pagina()]?.includes(pieza) ?? false);
  }

  protected irA(paso: number): void {
    const destino = this.pagina() + paso;
    if (destino >= 0 && destino < this.paginas().length) this.pagina.set(destino);
  }


  /** Muestra todas las piezas y, ya pintadas, las reparte en páginas que quepan en el alto del cuerpo. */
  private remedir(): void {
    this.paginas.set([]);
    afterNextRender(() => this.medir(), { injector: this.injector });
  }

  private medir(): void {
    const cuerpo = this.cuerpo()?.nativeElement;
    if (!cuerpo || this.paginas().length > 0) return;
    const piezas = Array.from(cuerpo.children) as HTMLElement[];
    if (cuerpo.scrollHeight <= cuerpo.clientHeight + 1) {
      this.paginas.set([piezas.map((_, i) => i)]);
      this.pagina.set(0);
      return;
    }
    const estilo = getComputedStyle(cuerpo);
    const hueco = parseFloat(estilo.rowGap) || 0;
    const util = cuerpo.clientHeight - (parseFloat(estilo.paddingTop) || 0) - (parseFloat(estilo.paddingBottom) || 0);
    const paginas: number[][] = [];
    let usado = 0;
    piezas.forEach((pieza, i) => {
      const alto = pieza.offsetHeight;
      const actual = paginas.at(-1);
      if (actual && usado + hueco + alto <= util) {
        actual.push(i);
        usado += hueco + alto;
      } else {
        paginas.push([i]);
        usado = alto;
      }
    });
    this.paginas.set(paginas);
    this.pagina.update(p => Math.min(p, paginas.length - 1));
  }
}
