import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, untracked, viewChild,
} from '@angular/core';

import { CasoStore } from './estado/caso.store';
import { FALTA_CLASE } from './estado/persistir';

/** Cómo va el guardado, por la forma de su marca, y en dos largos de texto. */
type FormaGuardado = 'guardando' | 'guardado' | 'sin-guardar' | 'aviso';

/**
 * Lo que el docente tiene que saber de cómo va el guardado, en sus palabras. El editor es UN formulario con UN modelo de
 * guardado, el automático (la excepción declarada a P8 de DISENO.md, EDITOR.md §3.3): todo viaja por la cola de
 * `caso.store.ts` y aquí se dice cómo va. Tiene dos partes, cada una en su sitio:
 *
 * - `estado` (en la barra, junto a «Probar»): «Guardando…», «Guardado», cuántas respuestas solo están en esta pantalla, o
 *   «No se guardó» con «Ver el aviso». Vive dentro de la barra para no flotar sin ancla sobre el contenido.
 * - `avisos` (arriba del contenido, en el flujo): el conflicto (otra persona cambió el caso: sus cambios siguen a la vista,
 *   nada se pierde, y decide cuándo recargar), el cambio rechazado (se deshizo solo ese cambio) y, tras recargar, lo que no
 *   se alcanzó a guardar para volver a escribirlo.
 *
 * Los avisos de conflicto y de error se traen a la vista y reciben el foco cuando aparecen (no en cada guardado). Sus
 * títulos no son encabezados: el de la pantalla viene después y los avisos no deben desordenar los niveles.
 */
@Component({
  selector: 'app-avisos-guardado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.en-barra]': "parte() === 'estado'" },
  template: `
    @if (parte() === 'estado') {
      <p class="estado-guardado" role="status" data-estado-guardado [attr.data-forma]="forma()" [attr.title]="estado()">
        <span class="estado-guardado__marca" aria-hidden="true"></span>
        <span class="estado-guardado__corto" aria-hidden="true">{{ corto() }}</span>
        <span class="solo-lector">{{ estado() }}</span>
      </p>
      @if (hayAviso()) {
        <button type="button" class="estado-guardado__ver" (click)="verAviso()">Ver el aviso</button>
      }
    } @else {
      <div id="avisos-de-guardado" class="avisos" tabindex="-1">
        @if (store.conflicto(); as conflicto) {
          <section #conflictoAviso class="aviso aviso-conflicto" role="alert" tabindex="-1" aria-labelledby="conflicto-titulo">
            <p class="aviso-titulo" id="conflicto-titulo"><strong>Este caso cambió mientras lo editabas</strong></p>
            <p>{{ conflicto.mensaje }}</p>
            @if (conflicto.sinGuardar.length) {
              <p>Esto es lo que hiciste y falta guardar:</p>
              <ul>
                @for (texto of conflicto.sinGuardar; track $index) { <li>{{ texto }}</li> }
              </ul>
            }
            <p class="texto-secundario">Lo que escribiste sigue en pantalla. Al recargar el caso verás la versión guardada: estos cambios no se aplicarán, pero la lista se queda aquí para que puedas volver a escribirlos.</p>
            <button type="button" class="boton boton-primario" data-accion="recargar-caso" (click)="recargar()">Recargar el caso</button>
          </section>
        }

        @if (store.error(); as error) {
          <section #errorAviso class="aviso aviso-error" role="alert" tabindex="-1">
            <p>{{ error }}</p>
            @if (store.descartado().length) {
              <p>Esto es lo que habías hecho y no se guardó:</p>
              <ul>
                @for (texto of store.descartado(); track $index) { <li>{{ texto }}</li> }
              </ul>
            }
            <button type="button" class="boton" (click)="store.descartarError()">Entendido</button>
          </section>
        }

        @if (store.recuperado().length) {
          <section class="aviso aviso-recuperado" role="status" aria-labelledby="recuperado-titulo">
            <p class="aviso-titulo" id="recuperado-titulo"><strong>Esto no se alcanzó a guardar</strong></p>
            <p>Recargaste el caso y estos cambios tuyos no entraron. Puedes copiarlos y volver a escribirlos donde correspondan.</p>
            <ul>
              @for (texto of store.recuperado(); track $index) { <li>{{ texto }}</li> }
            </ul>
            <button type="button" class="boton" (click)="store.descartarRecuperado()">Ya lo copié</button>
          </section>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    :host(.en-barra) { display: inline-flex; align-items: center; gap: 0.375rem; min-inline-size: 0; }
    .estado-guardado {
      display: inline-flex; align-items: center; gap: 0.375rem; margin: 0; min-block-size: 2.75rem;
      color: var(--asb-cromo-tinta-tenue); font-size: var(--autoria-texto-14); font-weight: 600; line-height: 1.25rem; white-space: nowrap;
    }
    /* La marca dice el estado con forma: punto lleno (guardado), anillo vacío (guardando), triángulo (falta algo). */
    .estado-guardado__marca { inline-size: 0.625rem; block-size: 0.625rem; border-radius: 50%; background: var(--ds-success); flex: none; }
    .estado-guardado[data-forma='guardando'] .estado-guardado__marca { background: transparent; box-shadow: inset 0 0 0 2px var(--ds-primary); }
    .estado-guardado[data-forma='sin-guardar'] .estado-guardado__marca,
    .estado-guardado[data-forma='aviso'] .estado-guardado__marca {
      inline-size: 0.75rem; block-size: 0.625rem; border-radius: 0; background: var(--ds-warning-text);
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
    }
    .estado-guardado[data-forma='aviso'] { color: var(--ds-warning-text); }
    .estado-guardado__ver {
      min-block-size: 2.75rem; padding-inline: 0.625rem; border: 1px solid var(--l-filo-fuerte); border-radius: 999px;
      background: transparent; color: var(--asb-cromo-tinta); font: inherit; font-size: var(--autoria-texto-14); font-weight: 700;
      white-space: nowrap; cursor: pointer;
    }
    .estado-guardado__ver:active { scale: 0.97; }
    @media (forced-colors: active) {
      .estado-guardado__marca { forced-color-adjust: none; background: CanvasText; box-shadow: none; }
    }

    .avisos { display: flex; flex-direction: column; gap: 0.5rem; outline: none; }
    .avisos:empty { display: none; }
    .aviso {
      margin: 1rem 1.5rem 0; padding: 0.75rem 1rem; border-radius: var(--radio-control); border: 1px solid var(--aviso);
      background: var(--aviso-tinte); color: var(--tinta);
    }
    .aviso-titulo { font-size: var(--autoria-texto-18); }
    .aviso p { margin: 0 0 0.5rem; }
    .aviso ul { margin: 0 0 0.5rem; padding-left: 1.5rem; }
    .aviso-error { border-color: var(--peligro); background: var(--peligro-tinte); }
    .aviso-recuperado { border-color: var(--primario); background: var(--primario-tinte); }
  `,
})
export class AvisosGuardadoComponent {
  /** Qué parte pinta esta instancia: el estado (en la barra) o los avisos (arriba del contenido). */
  readonly parte = input<'estado' | 'avisos'>('avisos');
  protected readonly store = inject(CasoStore);
  private readonly injector = inject(Injector);
  private readonly conflictoAviso = viewChild<ElementRef<HTMLElement>>('conflictoAviso');
  private readonly errorAviso = viewChild<ElementRef<HTMLElement>>('errorAviso');
  private visto = { conflicto: false, error: null as string | null };

  protected readonly hayAviso = computed(() => this.store.conflicto() !== null || this.store.error() !== null);

  protected readonly forma = computed<FormaGuardado>(() => {
    if (this.store.guardando()) return 'guardando';
    if (this.hayAviso()) return 'aviso';
    return this.store.sinGuardar().length ? 'sin-guardar' : 'guardado';
  });

  /** Cómo va el guardado, contando las respuestas que solo están en esta pantalla (la frase entera, para el lector). */
  protected readonly estado = computed(() => {
    if (this.store.guardando()) return 'Guardando tus cambios…';
    if (this.store.conflicto()) return 'Hay cambios sin guardar';
    if (this.store.error()) return 'Un cambio no se guardó';
    const pendientes = this.store.sinGuardar();
    const n = pendientes.length;
    if (n === 0) return 'Todo guardado';
    const respuestas = n === 1 ? '1 respuesta' : `${n} respuestas`;
    const donde = n === 1 ? 'solo está' : 'solo están';
    return pendientes.every((p) => p.mensaje === FALTA_CLASE)
      ? `Falta elegir la clase de ${respuestas}: ${donde} en esta pantalla`
      : `Falta completar ${respuestas}: ${donde} en esta pantalla`;
  });

  /** Lo que cabe en la barra (la frase entera queda en el globo y para el lector de pantalla). */
  protected readonly corto = computed(() => {
    switch (this.forma()) {
      case 'guardando': return 'Guardando…';
      case 'guardado': return 'Guardado';
      case 'aviso': return this.store.conflicto() ? 'Sin guardar' : 'No se guardó';
      default: return `${this.store.sinGuardar().length} sin guardar`;
    }
  });

  constructor() {
    effect(() => {
      if (this.parte() !== 'avisos') return;
      const conflicto = this.store.conflicto() !== null;
      const error = this.store.error();
      untracked(() => {
        const nuevoConflicto = conflicto && !this.visto.conflicto;
        const nuevoError = error !== null && error !== this.visto.error;
        this.visto = { conflicto, error };
        if (!nuevoConflicto && !nuevoError) return;
        afterNextRender(() => {
          const aviso = (nuevoConflicto ? this.conflictoAviso() : this.errorAviso())?.nativeElement;
          aviso?.focus();
          aviso?.scrollIntoView?.({ block: 'nearest' });
        }, { injector: this.injector });
      });
    });
  }

  /** «Ver el aviso»: lo trae a la vista y le da el foco (el aviso está arriba del contenido, en la zona que se desplaza). */
  protected verAviso(): void {
    const aviso = document.querySelector<HTMLElement>('#avisos-de-guardado [role="alert"]');
    aviso?.scrollIntoView?.({ block: 'nearest' });
    aviso?.focus();
  }

  protected recargar(): void {
    void this.store.recargar();
  }
}
