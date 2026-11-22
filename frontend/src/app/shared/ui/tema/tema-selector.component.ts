import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChildren,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PreferenciaTema, TemaService } from '../../../core/tema/tema.service';

interface OpcionTema { valor: PreferenciaTema; nombre: string; titulo: string; icono: string; }

/**
 * Selector de tema (pedido del usuario, 2026-11-20 y 21): plegado es solo el icono de lo elegido; al pasar el ratón (o
 * con el foco del teclado, o con un toque) se EXPANDE dentro de la barra, como un enlace más: el selector abre margen a
 * sus lados, el módulo crece con él y su propio vidrio lo cubre (sin un recuadro aparte, sin segundo vidrio). La opción
 * elegida NO se mueve bajo el cursor: en un módulo centrado (la portada) queda en medio, porque el módulo crece igual a
 * ambos lados; en el módulo de cuenta, anclado a la derecha (acceso, portal), queda al final. El orden se fija al abrir
 * y no salta mientras se elige. Es un grupo de radios: Tab entra en la elegida, las flechas cambian, Escape pliega.
 */
@Component({
  selector: 'app-tema-selector',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tema-selector',
    '[class.abierto]': 'abierto()',
    '[attr.data-fijo]': 'fijo()',
    '[attr.data-ancla]': 'ancla()',
    '(pointerenter)': 'alEntrar($event)',
    '(pointerleave)': 'alSalir($event)',
    '(focusin)': 'abrir()',
    '(focusout)': 'alSalirFoco($event)',
    '(keydown)': 'alTeclear($event)',
  },
  template: `
    <div class="capsula" role="radiogroup" aria-label="Tema de la página">
      @for (o of opciones; track o.valor; let i = $index) {
        <button #opcion type="button" role="radio" class="opcion ds-motion" [attr.aria-checked]="o.valor === tema.preferencia()"
          [attr.aria-label]="o.nombre" [attr.title]="o.titulo" [attr.tabindex]="o.valor === tema.preferencia() ? 0 : -1"
          (click)="alPulsar(o.valor)">
          <mat-icon aria-hidden="true">{{ o.icono }}</mat-icon>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      --lado: 2.875rem;
      --radio: 0.875rem;
      --resorte: var(--duracion-rebote, 520ms) var(--ease-rebote-vivo, cubic-bezier(0.32, 0.72, 0, 1));
      position: relative;
      display: inline-block;
      inline-size: var(--lado);
      block-size: var(--lado);
      flex: none;
      margin-inline: 0;
      vertical-align: middle;
      transition: margin var(--resorte);
    }

    /* Abierto, el selector abre su sitio en el flujo: el módulo crece y su vidrio cubre las tres opciones.
       Centro: un lado a cada mano (el módulo centrado crece igual a ambos lados y el selector no se mueve).
       Fin: los dos lados a la izquierda (el módulo anclado a la derecha crece hacia la izquierda). */
    :host(.abierto) { margin-inline: var(--lado); }
    :host(.abierto[data-ancla='fin']) { margin-inline: calc(var(--lado) * 2) 0; }

    .capsula {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: calc(var(--lado) * -1);
      display: flex;
      inline-size: calc(var(--lado) * 3);
      block-size: var(--lado);
      border-radius: var(--radio);
      /* Plegado se ve solo la casilla de en medio (la elegida); abierto, las tres. */
      clip-path: inset(0 var(--lado) 0 var(--lado) round var(--radio));
      transition: clip-path var(--resorte);
    }

    :host([data-ancla='fin']) .capsula {
      inset-inline-start: calc(var(--lado) * -2);
      clip-path: inset(0 0 0 calc(var(--lado) * 2) round var(--radio));
    }

    :host(.abierto) .capsula,
    :host(.abierto[data-ancla='fin']) .capsula {
      clip-path: inset(0 0 0 0 round var(--radio));
    }

    /* Orden visual fijado al abrir (data-fijo = la elegida en ese momento): en medio (centro) o al final (fin). Las
       otras dos guardan su orden de siempre: Claro, Oscuro, Automático. */
    .opcion:nth-child(1) { order: 1; }
    .opcion:nth-child(2) { order: 2; }
    .opcion:nth-child(3) { order: 3; }
    :host([data-fijo='0']) .opcion:nth-child(1) { order: 2; }
    :host([data-fijo='0']) .opcion:nth-child(2) { order: 1; }
    :host([data-fijo='2']) .opcion:nth-child(3) { order: 2; }
    :host([data-fijo='2']) .opcion:nth-child(2) { order: 3; }
    :host([data-ancla='fin'][data-fijo='0']) .opcion:nth-child(1) { order: 3; }
    :host([data-ancla='fin'][data-fijo='0']) .opcion:nth-child(2) { order: 1; }
    :host([data-ancla='fin'][data-fijo='0']) .opcion:nth-child(3) { order: 2; }
    :host([data-ancla='fin'][data-fijo='1']) .opcion:nth-child(1) { order: 1; }
    :host([data-ancla='fin'][data-fijo='1']) .opcion:nth-child(2) { order: 3; }
    :host([data-ancla='fin'][data-fijo='1']) .opcion:nth-child(3) { order: 2; }
    :host([data-ancla='fin'][data-fijo='2']) .opcion:nth-child(2) { order: 2; }
    :host([data-ancla='fin'][data-fijo='2']) .opcion:nth-child(3) { order: 3; }

    .opcion {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: var(--lado);
      block-size: var(--lado);
      padding: 0;
      border: 0;
      border-radius: var(--radio);
      background: transparent;
      color: var(--asb-cromo-tinta, var(--ds-text-1));
      cursor: pointer;
      /* Igual que un enlace de la barra (_glass-bar.scss §8): sin fondo; cambia el color y el press baja la opacidad. */
      transition:
        color var(--duracion-boton, 140ms) var(--ease-color, ease),
        opacity var(--duracion-instante, 100ms) var(--ease-out, ease-out);
    }

    .opcion mat-icon {
      font-size: 1.25rem;
      inline-size: 1.25rem;
      block-size: 1.25rem;
    }

    /* El subrayado de 1 px de los enlaces de la barra: nace al 40 % y se estira al posarse; el elegido lo lleva fijo. */
    .opcion::after {
      content: '';
      position: absolute;
      inset-inline: 0.75rem;
      inset-block-end: 0.45rem;
      block-size: 1px;
      border-radius: 999px;
      background-color: currentColor;
      opacity: 0;
      transform: scaleX(0.4);
      transition:
        opacity var(--duracion-boton, 140ms) var(--ease-color, ease),
        transform var(--duracion-boton, 140ms) var(--ease-out, ease-out);
    }

    /* Abierto, la elegida va como el destino actual de la barra: color de acento y subrayado. Plegado, como
       cualquier icono. */
    :host(.abierto) .opcion[aria-checked='true'] {
      color: var(--asb-acento, var(--l-acento-tinta, var(--ds-primary, #004876)));
    }

    :host(.abierto) .opcion[aria-checked='true']::after {
      opacity: 0.45;
      transform: scaleX(1);
    }

    @media (hover: hover) and (pointer: fine) {
      :host(.abierto) .opcion:not([aria-checked='true']):hover {
        color: var(--asb-fuerte, var(--ds-text-1));
      }

      :host(.abierto) .opcion:hover::after {
        opacity: 0.42;
        transform: scaleX(1);
      }
    }

    .opcion:focus-visible {
      outline: 2px solid var(--ds-focus, currentColor);
      outline-offset: -2px;
    }

    .opcion:active {
      opacity: 0.55;
      transition-duration: 0ms;
    }

    @media (prefers-reduced-motion: reduce) {
      :host, .capsula { transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1); }
    }

    @media (forced-colors: active) {
      .opcion::after { background-color: CanvasText; }
      :host(.abierto) .opcion[aria-checked='true'] { color: Highlight; }
    }
  `,
})
export class TemaSelectorComponent {
  protected readonly tema = inject(TemaService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly botones = viewChildren<ElementRef<HTMLButtonElement>>('opcion');

  // Nombres sueltos con «icon» para que scripts/ui/icon-names.mjs los meta en el subconjunto de la fuente de iconos.
  private readonly iconClaro = 'light_mode';
  private readonly iconOscuro = 'dark_mode';
  private readonly iconSistema = 'brightness_auto';
  protected readonly opciones: readonly OpcionTema[] = [
    { valor: 'claro', nombre: 'Claro', titulo: 'Claro', icono: this.iconClaro },
    { valor: 'oscuro', nombre: 'Oscuro', titulo: 'Oscuro', icono: this.iconOscuro },
    { valor: 'sistema', nombre: 'Automático', titulo: 'Automático (como tu sistema)', icono: this.iconSistema },
  ];

  readonly abierto = signal(false);
  protected readonly indiceActivo = computed(() => this.opciones.findIndex(o => o.valor === this.tema.preferencia()));
  /** Índice de la elegida al abrir: fija el orden visual para que nada salte mientras se elige. */
  protected readonly fijo = signal(this.indiceActivo());
  /** «fin» dentro del módulo de cuenta (anclado a la derecha); «centro» en un módulo centrado. */
  protected readonly ancla = signal<'centro' | 'fin'>('centro');
  /** Índices (Claro 0, Oscuro 1, Automático 2) en el orden en que se ven; el mismo que fijan las reglas `order` del CSS. */
  readonly ordenVisual = computed<readonly number[]>(() => {
    const centro = [[1, 0, 2], [0, 1, 2], [0, 2, 1]];
    const fin = [[1, 2, 0], [0, 2, 1], [0, 1, 2]];
    return (this.ancla() === 'fin' ? fin : centro)[this.fijo()] ?? [0, 1, 2];
  });

  private gracia = 0;

  constructor() {
    // Un toque o un clic fuera pliega el selector (con dedo no hay «salir del ratón»).
    const fuera = (ev: PointerEvent) => { if (this.abierto() && !this.host.contains(ev.target as Node)) this.cerrar(); };
    document.addEventListener('pointerdown', fuera, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', fuera, true);
      clearTimeout(this.gracia);
    });
    afterNextRender(() => { if (this.host.closest('.modulo-cuenta')) this.ancla.set('fin'); });
  }

  abrir(): void {
    clearTimeout(this.gracia);
    this.abierto.set(true);
  }

  cerrar(): void {
    clearTimeout(this.gracia);
    this.abierto.set(false);
    this.fijo.set(this.indiceActivo());
  }

  protected alEntrar(ev: PointerEvent): void {
    if (ev.pointerType === 'mouse') this.abrir();
  }

  /** Al irse el ratón se pliega con una gracia corta (como la atención de la barra): volver a entrar la cancela. */
  protected alSalir(ev: PointerEvent): void {
    if (ev.pointerType !== 'mouse' || this.host.contains(document.activeElement)) return;
    clearTimeout(this.gracia);
    this.gracia = window.setTimeout(() => this.cerrar(), 280);
  }

  protected alSalirFoco(ev: FocusEvent): void {
    if (!this.host.contains(ev.relatedTarget as Node | null)) this.cerrar();
  }

  /** Plegado, pulsar la opción visible abre (con dedo es la única forma); abierto, pulsar elige. */
  protected alPulsar(valor: PreferenciaTema): void {
    if (!this.abierto()) {
      this.abrir();
      return;
    }
    this.tema.fijar(valor);
  }

  protected alTeclear(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.abierto()) {
      ev.stopPropagation();
      this.cerrar();
      return;
    }
    const paso = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[ev.key];
    if (!paso) return;
    ev.preventDefault();
    // Las flechas siguen el orden que se VE (el fijado al abrir), no el del DOM.
    const orden = this.ordenVisual();
    const siguiente = orden[(orden.indexOf(this.indiceActivo()) + paso + orden.length) % orden.length];
    this.abrir();
    this.tema.fijar(this.opciones[siguiente].valor);
    // El foco sigue a la elegida (patrón de radios con tabindex itinerante).
    queueMicrotask(() => this.botones()[siguiente]?.nativeElement.focus());
  }
}
