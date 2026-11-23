import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';

import { SafeExitButtonComponent } from '../safe-exit-button.component';
import { PixelIconoComponent } from '../pixel/pixel-icono.component';
import { PlanoDelLugarComponent } from './plano-del-lugar.component';
import { PlanoDelLugar, textoDeLaSala } from './plano';

/** Ocultar el minimapa se recuerda por navegador, sin identificadores de persona. */
export const MINIMAPA_STORAGE_KEY = 'siep.minimapa.v1';

function leerOculto(): boolean {
  try {
    return localStorage.getItem(MINIMAPA_STORAGE_KEY) === 'oculto';
  } catch {
    return false;
  }
}

/**
 * Minimapa del lugar (bloque M1, §5.3): en la esquina del mundo, un botón con el plano en pequeño que abre el plano
 * completo (también con M). Su nombre accesible es la alternativa en texto («Estás en: … Puertas: …»). Se puede
 * ocultar y la preferencia se recuerda. Sin `layout` (casos del legado) no pinta nada.
 */
@Component({
  selector: 'app-minimapa',
  standalone: true,
  imports: [PlanoDelLugarComponent, PixelIconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (plano(); as p) {
      <!-- Bloque U1: la pestaña del plano dice dónde estás (el lugar dejó la cabecera), como el nombre sobre una placa. -->
      @if (lugar() || actual()) {
        <p class="minimapa__lugar u-rotulo" aria-hidden="true"><app-pixel-icono nombre="lugar" /><span class="u-rotulo__texto">{{ lugar() || actual() }}</span></p>
      }
      @if (!oculto()) {
        <button type="button" class="minimapa__abrir u-boton u-sombra" data-minimapa-abrir [attr.aria-label]="nombre()" (click)="abrir.emit()">
          <app-plano-del-lugar aria-hidden="true" [plano]="p" [actual]="actual()" [visitadas]="visitadas()" modo="mini" />
        </button>
      }
      <button type="button" class="minimapa__alternar u-boton" data-minimapa-alternar (click)="alternar()">
        <app-pixel-icono nombre="plano" /><span class="minimapa__texto">{{ oculto() ? 'Mostrar plano' : 'Ocultar plano' }}</span>
      </button>
    }
    <!-- Vista cercana (Z) también con botón, para quien no usa teclado o usa lector de pantalla. -->
    <button type="button" class="minimapa__alternar u-boton" data-vista-cercana [attr.aria-pressed]="cercana()"
      (click)="alternarCercana.emit()"><app-pixel-icono nombre="lupa" /><span class="minimapa__texto">Vista cercana (Z)</span></button>
  `,
  styles: [`
    /* Bloque U1: piezas de la hoja común. El sitio lo da la pantalla (bajo el grupo de la derecha, variante B). */
    :host { display: grid; justify-items: end; gap: calc(2 * var(--pixel-px)); pointer-events: none; font-size: var(--pixel-tam); }
    button { pointer-events: auto; }
    .minimapa__lugar { margin: 0 calc(6 * var(--pixel-px)) calc(-1 * var(--pixel-px)) 0; max-width: 100%; }
    .minimapa__lugar + .minimapa__abrir { margin-top: calc(-2 * var(--pixel-px)); }
    .minimapa__abrir { display: block; width: clamp(160px, 15vw, 230px); aspect-ratio: 16 / 9; padding: calc(2 * var(--pixel-px)); overflow: hidden; }
    /* El plano llena el botón y su SVG (meet) encaja el dibujo: un lugar más alto que ancho (casa, universidad: salas en
       cuatro filas) tomaba el alto del dibujo y la fila de abajo, la sala actual, se salía del marco sobre «Vista cercana». */
    .minimapa__abrir app-plano-del-lugar { display: block; height: 100%; }
    .minimapa__alternar { font-size: var(--pixel-letra-media); }
    .minimapa__alternar[aria-pressed='true'] { --m: var(--marco-placa-foco); background-color: var(--pixel-penumbra-alzada); color: var(--luz); }
  `],
})
export class MinimapaComponent {
  readonly plano = input<PlanoDelLugar | null>(null);
  /** El lugar en palabras («Hospital — Sala de espera»), para la pestaña del plano (U1). Sin él, la sala actual. */
  readonly lugar = input('');
  readonly actual = input('');
  readonly visitadas = input<ReadonlySet<string>>(new Set());
  /** La vista cercana está puesta (su botón lo anuncia con `aria-pressed`). */
  readonly cercana = input(false);
  readonly abrir = output<void>();
  readonly alternarCercana = output<void>();

  protected readonly oculto = signal(leerOculto());
  protected readonly nombre = computed(() => {
    const plano = this.plano();
    return plano ? `Abrir plano (M). ${textoDeLaSala(plano, this.actual())}` : '';
  });

  protected alternar(): void {
    const next = !this.oculto();
    this.oculto.set(next);
    try {
      localStorage.setItem(MINIMAPA_STORAGE_KEY, next ? 'oculto' : 'visible');
    } catch {
      // Sin almacenamiento vale solo en esta sesión.
    }
  }
}

/**
 * Plano completo del lugar (bloque M1, §5.3): modal como «Ir a…», con el foco atrapado, su «Salida segura» (REGLA-004)
 * y la lista legible de las salas. Esc y M lo cierran y consumen la tecla, así que no llegan a la cadena del juego.
 * Quien lo aloja pausa el mundo, congela la cámara y devuelve el foco al minimapa.
 */
@Component({
  selector: 'app-plano-completo',
  standalone: true,
  imports: [A11yModule, PlanoDelLugarComponent, SafeExitButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="plano-dialogo u-placa" role="dialog" aria-modal="true" aria-labelledby="plano-titulo" cdkTrapFocus>
      <h2 id="plano-titulo">Plano del lugar</h2>
      <app-plano-del-lugar class="plano-dialogo__plano" [plano]="plano()" [actual]="actual()" [visitadas]="visitadas()" modo="completo" />
      <footer class="plano-dialogo__pie">
        <app-safe-exit-button data-hide-key variante="placa" [pausing]="pausing()" (pause)="safeExit.emit()" />
        <button type="button" class="u-boton" data-plano-cerrar (click)="closed.emit()">Cerrar</button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: contents; }
    .plano-dialogo {
      position: absolute; top: 50%; left: 50%; z-index: var(--ds-z-modal); transform: translate(-50%, -50%);
      width: min(880px, 94vw); max-height: min(680px, 88vh);
      display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: calc(5 * var(--pixel-px));
      padding: calc(6 * var(--pixel-px)) calc(8 * var(--pixel-px)) calc(7 * var(--pixel-px));
      color: var(--pixel-tinta); font-family: var(--pixel-f-texto); font-size: var(--pixel-tam);
    }
    /* El color va explícito: el estilo global de h2 no es el de la piel del juego (como en «Ir a…»). */
    h2 { margin: 0; font-family: var(--pixel-f-nombre); font-size: calc(var(--pixel-tam) * 1.15); letter-spacing: .04em; color: var(--luz); }
    /* El dibujo se encoge al alto que queda (su viewBox lo mantiene entero) y la lista de salas va debajo: el plano no
       se desplaza (V6). La barra solo queda de red si la lista sola no cupiera. */
    .plano-dialogo__plano { min-height: 0; grid-template-rows: minmax(0, 1fr) auto; overflow-y: auto; overscroll-behavior: contain; }
    .plano-dialogo__pie { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-3); flex-wrap: wrap; }
  `],
})
export class PlanoCompletoComponent {
  readonly plano = input.required<PlanoDelLugar>();
  readonly actual = input('');
  readonly visitadas = input<ReadonlySet<string>>(new Set());
  /** Hay una salida segura pedida que espera: el botón dice «Pausando…». */
  readonly pausing = input(false);
  readonly closed = output<void>();
  readonly safeExit = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-plano-cerrar]')?.focus(), { injector: inject(Injector) });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const letraM = (event.key === 'm' || event.key === 'M') && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key !== 'Escape' && !letraM) return;
    event.preventDefault();
    if (!event.repeat) this.closed.emit();
  }
}
