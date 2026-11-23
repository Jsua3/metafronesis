import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

import { type Comando, filtrarComandos } from './atajos';

/** Cuántos resultados se listan a la vez: más no se leen, se escribe una letra más. */
const TOPE = 40;

interface Grupo { nombre: string; items: { c: Comando; i: number }[] }

/**
 * Paleta de comandos (Ctrl+K), EDITOR-PRO.md punto 4: saltar a una escena, a una etapa o correr una acción escribiendo.
 *
 * Patrón: componente de presentación + Command. Recibe la lista de comandos (cada uno trae su `ejecutar`) y solo elige;
 * el que la abre arma la lista con lo que registraron las pantallas (`EstudioService.comandos()`) y la cierra.
 *
 * Accesible como combobox con lista (APG): el foco se queda en el campo, ↑/↓ mueven la opción activa
 * (`aria-activedescendant`), Enter la corre, Esc cierra; el foco no sale del diálogo (cdkTrapFocus).
 *
 * ```html
 * @if (estudio.paletaAbierta()) {
 *   <app-estudio-paleta [comandos]="estudio.comandos()" (cerrar)="estudio.paletaAbierta.set(false)" />
 * }
 * ```
 */
@Component({
  selector: 'app-estudio-paleta',
  imports: [A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="velo" aria-hidden="true" (click)="cerrar.emit()"></div>
    <div class="paleta" role="dialog" aria-modal="true" aria-label="Paleta de comandos" cdkTrapFocus [cdkTrapFocusAutoCapture]="true"
         (keydown.escape)="$event.stopPropagation(); cerrar.emit()">
      <div class="campo-fila">
        <svg class="lupa" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
        <input #campo class="campo" type="text" role="combobox" aria-expanded="true" aria-controls="est-paleta-lista"
               aria-autocomplete="list" [attr.aria-activedescendant]="lista().length ? 'est-pc-' + activo() : null"
               [placeholder]="indicacion()" aria-label="Busca un comando" autocomplete="off" spellcheck="false" cdkFocusInitial
               (input)="escribir($any($event.target).value)" (keydown)="tecla($event)" />
        <kbd class="esc">Esc</kbd>
      </div>
      <div id="est-paleta-lista" class="lista" role="listbox" aria-label="Comandos">
        @for (g of grupos(); track g.nombre) {
          <div role="group" class="grupo" [attr.aria-label]="g.nombre">
            <div class="grupo__nombre" aria-hidden="true">{{ g.nombre }}</div>
            @for (x of g.items; track x.c.id) {
              <div role="option" class="opcion" [id]="'est-pc-' + x.i" [attr.aria-selected]="x.i === activo()"
                   (click)="correr(x.c)" (pointermove)="activo.set(x.i)">
                <span class="opcion__titulo">{{ x.c.titulo }}</span>
                @if (x.c.detalle) { <span class="opcion__detalle">{{ x.c.detalle }}</span> }
                @if (x.c.atajo) { <kbd class="opcion__atajo">{{ x.c.atajo }}</kbd> }
              </div>
            }
          </div>
        }
      </div>
      @if (!lista().length) { <p class="vacio" role="status">Nada coincide con «{{ consulta() }}».</p> }
      <p class="pie" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> elegir <kbd>Enter</kbd> abrir <kbd>Esc</kbd> cerrar</p>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: var(--autoria-capa-50); display: grid; justify-items: center; align-items: start; }
    .velo {
      position: absolute; inset: 0; background: color-mix(in oklab, var(--ds-text-1) 22%, transparent);
      animation: aparece var(--ds-dur-fast) var(--ds-ease-out);
    }
    .paleta {
      position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; inline-size: min(40rem, calc(100vw - 2rem));
      max-block-size: min(32rem, calc(100dvh - 6rem)); margin-block-start: 12vh; overflow: hidden;
      border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-tarjeta); background: var(--l-superficie);
      box-shadow: var(--l-sombra-alta); color: var(--ds-text-1);
      animation: entra var(--ds-dur-base) var(--ds-spring-soft);
    }
    .campo-fila { display: flex; align-items: center; gap: 0.625rem; padding: 0 0.875rem; border-block-end: 1px solid var(--l-filo); }
    .lupa { flex: none; inline-size: 1.125rem; block-size: 1.125rem; fill: none; stroke: var(--ds-text-2); stroke-width: 1.8; stroke-linecap: round; }
    .campo {
      flex: 1; min-inline-size: 0; min-block-size: 3.25rem; border: 0; background: transparent; color: inherit; font: inherit;
      font-size: var(--autoria-texto-16); outline: none;
    }
    .esc, .pie kbd, .opcion__atajo {
      padding: 0 0.3125rem; border-radius: 0.3125rem; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte); color: var(--ds-text-2);
      font: inherit; font-size: var(--autoria-texto-14); font-weight: 600; line-height: 1.375rem; background: transparent;
    }
    .lista { overflow: auto; overscroll-behavior: contain; padding: 0.375rem; }
    .grupo + .grupo { margin-block-start: 0.375rem; }
    .grupo__nombre {
      padding: 0.375rem 0.625rem 0.25rem; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700;
      font-variant-caps: all-small-caps; letter-spacing: 0.06em;
    }
    .opcion {
      display: flex; align-items: center; gap: 0.75rem; min-block-size: 2.75rem; padding: 0 0.625rem; border-radius: var(--l-radio-chico, 0.5rem);
      font-size: var(--autoria-texto-16); cursor: pointer;
    }
    .opcion[aria-selected='true'] { background: var(--l-fila-elegida); box-shadow: inset 2px 0 0 var(--ds-primary); }
    .opcion__titulo { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opcion__detalle { flex: none; max-inline-size: 40%; overflow: hidden; color: var(--ds-text-2); font-size: var(--autoria-texto-14);
      text-overflow: ellipsis; white-space: nowrap; }
    .vacio { margin: 0; padding: 1rem; color: var(--ds-text-2); font-size: var(--autoria-texto-16); }
    .pie {
      display: flex; align-items: center; gap: 0.375rem; margin: 0; padding: 0.5rem 0.875rem; border-block-start: 1px solid var(--l-filo);
      color: var(--ds-text-2); font-size: var(--autoria-texto-14);
    }
    .pie kbd + kbd { margin-inline-start: -0.125rem; }
    @keyframes aparece { from { opacity: 0; } }
    @keyframes entra { from { opacity: 0; translate: 0 -0.5rem; scale: 0.98; } }
    @media (prefers-reduced-motion: reduce) {
      .velo, .paleta { animation-duration: 1ms; }
    }
    @media (forced-colors: active) { .opcion[aria-selected='true'] { outline: 2px solid Highlight; } }
  `,
})
export class EstudioPaletaComponent {
  readonly comandos = input.required<readonly Comando[]>();
  readonly indicacion = input('Busca una escena, una etapa o una acción');
  readonly cerrar = output<void>();
  protected readonly consulta = signal('');
  protected readonly activo = signal(0);
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');

  protected readonly lista = computed(() => filtrarComandos(this.comandos(), this.consulta()).slice(0, TOPE));
  /** Sin consulta, por grupos en su orden; con consulta, también por grupos, en el orden de los mejores resultados. */
  protected readonly grupos = computed<Grupo[]>(() => {
    const grupos: Grupo[] = [];
    this.lista().forEach((c, i) => {
      let g = grupos.find((x) => x.nombre === c.grupo);
      if (!g) grupos.push((g = { nombre: c.grupo, items: [] }));
      g.items.push({ c, i: -1 });
    });
    // El índice de cada opción es su posición en pantalla (grupo tras grupo): así ↑/↓ recorren lo que se ve.
    let i = 0;
    for (const g of grupos) for (const x of g.items) x.i = i++;
    return grupos;
  });
  private readonly enPantalla = computed(() => this.grupos().flatMap((g) => g.items.map((x) => x.c)));

  protected escribir(valor: string): void {
    this.consulta.set(valor);
    this.activo.set(0);
  }

  protected tecla(e: KeyboardEvent): void {
    const n = this.enPantalla().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      this.activo.update((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
      queueMicrotask(() => this.campo().nativeElement.ownerDocument.getElementById(`est-pc-${this.activo()}`)?.scrollIntoView?.({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = this.enPantalla()[this.activo()];
      if (c) this.correr(c);
    }
  }

  /** Cierra primero (devuelve el foco) y después corre: el comando puede mover el foco a donde lleva. */
  protected correr(c: Comando): void {
    this.cerrar.emit();
    queueMicrotask(() => c.ejecutar());
  }
}
