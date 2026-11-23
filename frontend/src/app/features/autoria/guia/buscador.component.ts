import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';

import { IaService } from '../ia/ia.service';
import { ACCIONES, type Accion, buscarAcciones } from './acciones';
import { GuiaService } from './guia.service';

/**
 * «Ayuda» del editor (Ctrl+K): un solo diálogo con dos pestañas, «Buscar una acción» y «Preguntar a la guía» (EDITOR.md
 * §4.1: antes eran dos botones que abrían casi el mismo diálogo con las mismas acciones). Sin IA o sin conexión, preguntar
 * lleva al mismo lugar que buscar: el docente escribe con sus palabras («cara») y elige.
 */
@Component({
  selector: 'app-buscador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fondo" (click)="cerrar.emit()"></div>
    <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="bq-titulo" (keydown)="tecla($event)">
      <h2 id="bq-titulo">Ayuda</h2>
      <div class="pestanas" role="tablist" aria-label="Cómo quieres buscar" (keydown)="teclaPestana($event)">
        @for (p of pestanas; track p.modo) {
          <button type="button" role="tab" class="pestana" [id]="'bq-pestana-' + p.modo" aria-controls="bq-panel"
                  [attr.aria-selected]="modoActual() === p.modo" [attr.tabindex]="modoActual() === p.modo ? 0 : -1"
                  (click)="cambiarModo(p.modo)">{{ p.nombre }}</button>
        }
      </div>
      <div id="bq-panel" role="tabpanel" class="panel" [attr.aria-labelledby]="'bq-pestana-' + modoActual()">
      <label for="bq" class="etiqueta">{{ modoActual() === 'preguntar' ? '¿Dónde está o cómo se hace?' : '¿Qué quieres hacer?' }}</label>
      <input id="bq" #campo type="text" role="combobox" class="campo" autocomplete="off"
             aria-autocomplete="list" aria-controls="bq-lista" [attr.aria-expanded]="resultados().length > 0"
             [attr.aria-activedescendant]="resultados().length ? 'bq-' + activo() : null"
             [value]="consulta()" (input)="escribir($any($event.target).value)"
             [placeholder]="modoActual() === 'preguntar' ? 'Por ejemplo: ¿dónde cambio la cara de un personaje?' : 'Por ejemplo: cara, final, mover'" />
      <p role="status" class="texto-secundario estado">{{ estado() }}</p>
      @if (modoActual() === 'preguntar') {
        <div class="acciones">
          <button type="button" class="boton boton-guia" [attr.aria-disabled]="!consulta().trim() || preguntando()" (click)="preguntar()">
            {{ preguntando() ? 'Buscando…' : 'Preguntar' }}
          </button>
        </div>
      }
      <ul id="bq-lista" role="listbox" aria-label="Resultados" class="lista">
        @for (a of resultados(); track a.id; let i = $index) {
          <li role="option" [id]="'bq-' + i" [attr.aria-selected]="i === activo()" (click)="elegir(a)" (mousemove)="activo.set(i)">
            <strong>{{ a.nombre }}</strong>
            <span class="texto-secundario">En: {{ a.pantalla }}{{ a.pasos ? ' · recorrido de ' + a.pasos.length + ' pasos' : '' }}</span>
          </li>
        }
      </ul>
      </div>
      <div class="acciones pie">
        <span class="texto-secundario"><kbd>↑</kbd> <kbd>↓</kbd> para moverte, <kbd>Enter</kbd> para ir, <kbd>Esc</kbd> para cerrar.</span>
        <button type="button" class="boton" (click)="cerrar.emit()">Cerrar</button>
      </div>
    </div>
  `,
  styles: `
    .fondo { position: fixed; inset: 0; z-index: var(--autoria-capa-40); background: var(--velo); }
    .dialogo {
      position: fixed; z-index: var(--autoria-capa-41); top: 10vh; left: 50%; transform: translateX(-50%); width: min(640px, calc(100vw - 32px));
      max-height: 80vh; overflow: auto; box-sizing: border-box; padding: 20px; background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--radio-tarjeta); color: var(--tinta);
      display: flex; flex-direction: column; gap: 10px; box-shadow: var(--sombra-buscador);
    }
    h2 { margin: 0; font-size: var(--autoria-texto-22); line-height: 30px; }
    /* Las dos pestañas, como un control segmentado: la elegida, en superficie con filo (forma, no solo color). */
    .pestanas { display: flex; gap: 0.25rem; padding: 0.25rem; border-radius: var(--radio-control); background: var(--fondo-hundido); }
    .pestana {
      flex: 1 1 0; min-block-size: 2.75rem; padding-inline: 0.75rem; border: 1px solid transparent; border-radius: calc(var(--radio-control) - 0.25rem);
      background: transparent; color: var(--texto-secundario); font: inherit; font-size: var(--autoria-texto-16); font-weight: 700; cursor: pointer;
    }
    .pestana[aria-selected='true'] { border-color: var(--borde-control); background: var(--superficie); color: var(--tinta); }
    .pestana:active { scale: 0.98; }
    .panel { display: flex; flex-direction: column; gap: 10px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo {
      min-height: 48px; padding: 0 12px; font: inherit; font-size: var(--autoria-texto-18); border: 1px solid var(--borde-control);
      border-radius: var(--radio-control); background: var(--superficie); color: var(--tinta);
    }
    .estado { margin: 0; font-size: var(--autoria-texto-16); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .lista li { display: flex; flex-direction: column; gap: 2px; min-height: 48px; padding: 8px 12px; border-radius: 10px; cursor: pointer; justify-content: center; }
    .lista li span { font-size: var(--autoria-texto-16); }
    /* El resultado activo: tinte y filo discontinuo de la guía (forma y color, como su anillo). */
    .lista li[aria-selected='true'] { background: var(--guia-tinte); outline: 2px dashed var(--guia); outline-offset: -2px; }
    .boton-guia { background: var(--guia); border-color: var(--guia); color: var(--sobre-primario); }
    .pie { justify-content: space-between; align-items: center; }
    .pie span { font-size: var(--autoria-texto-16); }
  `,
})
export class BuscadorComponent {
  readonly modo = input<'buscar' | 'preguntar'>('buscar');
  /** La pestaña elegida: empieza en la que pidió quien abrió la ayuda y se cambia dentro del diálogo. */
  protected readonly modoActual = linkedSignal(() => this.modo());
  protected readonly pestanas = [
    { modo: 'buscar' as const, nombre: 'Buscar una acción' },
    { modo: 'preguntar' as const, nombre: 'Preguntar a la guía' },
  ];
  readonly cerrar = output<void>();

  private readonly guia = inject(GuiaService);
  private readonly ia = inject(IaService);
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly consulta = signal('');
  protected readonly activo = signal(0);
  protected readonly preguntando = signal(false);
  protected readonly aviso = signal('');

  protected readonly resultados = computed(() => buscarAcciones(this.consulta()).slice(0, 8));
  protected readonly estado = computed(() => {
    if (this.aviso()) return this.aviso();
    const q = this.consulta().trim();
    const n = this.resultados().length;
    if (!q) return `${ACCIONES.length} acciones. Escribe para filtrar.`;
    return n ? `${n} ${n === 1 ? 'resultado' : 'resultados'} para «${q}»` : `Nada coincide con «${q}». Prueba con otras palabras.`;
  });

  constructor() {
    effect(() => {
      const el = this.campo()?.nativeElement;
      if (el) queueMicrotask(() => el.focus());
    });
  }

  protected escribir(valor: string): void {
    this.consulta.set(valor);
    this.activo.set(0);
    this.aviso.set('');
  }

  protected tecla(e: KeyboardEvent): void {
    const n = this.resultados().length;
    if (e.key === 'Tab') {
      const dialogo = e.currentTarget as HTMLElement;
      // La pestaña no elegida (tabindex -1) no está en el orden del tabulador: se llega a ella con las flechas.
      const foco = [...dialogo.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex="0"]')];
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (primero && ultimo) {
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cerrar.emit();
    } else if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.activo.update((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.activo.update((i) => (i - 1 + n) % n);
    } else if (e.key === 'Enter' && (e.target as HTMLElement).id === 'bq') {
      e.preventDefault();
      if (this.modoActual() === 'preguntar' && this.consulta().trim()) void this.preguntar();
      else if (n) this.elegir(this.resultados()[this.activo()]);
    }
  }

  protected cambiarModo(modo: 'buscar' | 'preguntar'): void {
    this.modoActual.set(modo);
    this.aviso.set('');
  }

  /** Flechas, Inicio y Fin entre las pestañas (patrón de pestañas de WAI-ARIA), con activación automática. */
  protected teclaPestana(e: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const otro = this.modoActual() === 'buscar' ? 'preguntar' : 'buscar';
    const destino = e.key === 'Home' ? 'buscar' : e.key === 'End' ? 'preguntar' : otro;
    this.cambiarModo(destino);
    queueMicrotask(() => document.getElementById('bq-pestana-' + destino)?.focus());
  }

  protected elegir(a: Accion): void {
    this.cerrar.emit();
    void this.guia.mostrar(a.id, a.pasos ? 'recorrido' : 'foco');
  }

  /** Con IA, la guía elige la acción; sin IA (o si no sabe), se usa el mejor resultado del buscador. */
  protected async preguntar(): Promise<void> {
    const pregunta = this.consulta().trim();
    if (!pregunta || this.preguntando()) return;
    this.preguntando.set(true);
    try {
      const respuesta = await this.ia.guia(pregunta, ACCIONES.map((a) => ({ id: a.id, nombre: a.nombre, pantalla: a.pantalla })));
      if (respuesta?.accionId) {
        this.cerrar.emit();
        await this.guia.mostrar(respuesta.accionId, respuesta.modo);
        return;
      }
      const mejor = this.resultados()[0];
      if (mejor) this.elegir(mejor);
      else this.aviso.set('No encontré esa acción. Prueba con otras palabras.');
    } finally {
      this.preguntando.set(false);
    }
  }
}
