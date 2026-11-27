import { reducedMotionQuery } from '../../../core/a11y/reduced-motion';
import { addAriaReferencedId, removeAriaReferencedId } from '@angular/cdk/a11y';
import { DIALOG_DATA, Dialog, DialogConfig, DialogRef } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, Injectable, Injector, ViewEncapsulation,
  afterNextRender, booleanAttribute, effect, inject, input,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { encabezadoPrincipal, enfocarPorPrograma, focoPerdido } from '../../../core/a11y/foco.util';
import { TemaService } from '../../../core/tema/tema.service';
import { uniqueUiId } from '../button/click-guard';
import { UiButton } from '../button/ui-button';
import { UiIconButton } from '../button/ui-icon-button';
import { UiPiel, contenedorDePiel, pielDe } from '../piel';

export type { UiPiel } from '../piel';
export { contenedorDePiel } from '../piel';

/**
 * Duración de la salida (DISENO §2.6): el diálogo se va en 160 ms y la hoja en 200 ms, siempre más rápido que su
 * entrada (200 y 300 ms). Tienen que coincidir con `ui-dialog-frame.scss`.
 */
const UI_DIALOG_LEAVE_MS = 160;
const UI_SHEET_LEAVE_MS = 200;

/**
 * De dónde toma su piel una capa (DISENO C13, revisado): fija, la de un contenedor vivo (que puede cambiar
 * mientras la capa está abierta: el shell sigue al tema) o el tema de la persona.
 */
type FuentePiel = { tipo: 'fija'; piel: UiPiel } | { tipo: 'contenedor'; contenedor: Element } | { tipo: 'tema' };

/**
 * Foco inicial por PRIORIDAD (no por orden del documento): primero `[data-autofocus]`, luego el primer control
 * habilitado del cuerpo y luego el de las acciones; nunca el botón de cerrar del encabezado. Sin candidatos queda en
 * el propio diálogo (el CDK lo enfoca antes).
 */
const AUTOFOCUS_PRIORITY = [
  '[data-autofocus]',
  '.ui-dialog-frame__body :is(input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"]))',
  '.ui-dialog-frame__actions :is(button, a[href])',
];

function focusByPriority(pane: HTMLElement | null): void {
  const container = pane?.querySelector<HTMLElement>('.cdk-dialog-container');
  if (!pane || !container) return;
  // Si el contenido ya movió el foco por su cuenta, se respeta.
  if (document.activeElement !== container && pane.contains(document.activeElement)) return;
  for (const selector of AUTOFOCUS_PRIORITY) {
    // Se prueban los candidatos en orden hasta que uno ACEPTE el foco. Los ocultos a la vista (`type="hidden"`, dentro
    // de `[hidden]`) se saltan de entrada; uno con `display: none` heredado pasa el filtro, pero `focus()` no lo mueve
    // y entonces se sigue con el siguiente en vez de quedarse sin foco inicial.
    for (const target of pane.querySelectorAll<HTMLElement>(selector)) {
      if (target.matches(':disabled, input[type="hidden"]')) continue;
      if (target.closest('[inert], [aria-hidden="true"], [hidden]')) continue;
      target.focus();
      if (document.activeElement === target) return;
    }
  }
}

export type UiDialogSize = 'sm' | 'md' | 'lg';

export interface UiDialogOptions<D = unknown> {
  data?: D;
  /** Solo si el diálogo no usa `ui-dialog-frame` (que lo nombra con su título). */
  ariaLabel?: string;
  size?: UiDialogSize;
  /** Impide cerrar con Esc o con el fondo (guardado en curso, formulario sin guardar). */
  disableClose?: boolean;
  /** Selector del elemento que recibe el foco inicial (por defecto: [data-autofocus] y luego el primer control habilitado). */
  autoFocus?: string;
  /** Devolver el foco al disparador al cerrar (por defecto, sí). */
  restoreFocus?: boolean;
  /**
   * Piel de la capa (DISENO C13). `game` o `portal` la fijan (el juego pasa `game`); `tema` sigue al tema de la persona
   * aunque cambie con la capa abierta. Sin ella se hereda: de `origen`, luego del foco (si no está en `body`) y, si
   * nada de eso tiene piel, del tema.
   */
  piel?: UiPiel | 'tema';
  /** Quién abre la capa (su botón o su anfitrión): la capa toma la piel del contenedor de ese elemento. */
  origen?: Element | null;
}

export interface UiSheetOptions<D = unknown> extends UiDialogOptions<D> {
  side: 'bottom' | 'end';
}

export interface UiConsequenceOptions {
  /** Ver `UiDialogOptions.piel`: el juego pasa `'game'`. */
  piel?: UiPiel | 'tema';
  origen?: Element | null;
  title: string;
  /** Qué se pierde si se sigue adelante, dicho sin rodeos. */
  consequence: string;
  /** La acción segura y por defecto («Continuar mi intento»). */
  continueLabel: string;
  /** La acción que asume la consecuencia («Iniciar uno nuevo»). */
  proceedLabel: string;
}

export type UiConsequenceAnswer = 'continue' | 'proceed';

export interface UiConfirmOptions {
  /** Ver `UiDialogOptions.piel`. */
  piel?: UiPiel | 'tema';
  origen?: Element | null;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

/** Contrato interno del contenedor del CDK para nombrar el diálogo por su título. */
interface LabelledContainer {
  _addAriaLabelledBy?(id: string): void;
  _removeAriaLabelledBy?(id: string): void;
}

/** Marca las acciones del pie del marco: `<button ui-button uiDialogActions …>`. */
@Directive({ selector: '[uiDialogActions]' })
export class UiDialogActions {}

/**
 * Marco de diálogo y hoja (plan visual F2-7): título (`h2`, nombra el diálogo), descripción opcional (lo describe),
 * botón de cerrar opcional, cuerpo y acciones al pie. Se registra en el contenedor del CDK, así el contenido no tiene
 * que conocer ids.
 *
 * Sin encapsular (C13): sus estilos también visten la capa que lo contiene (`.ui-overlay-materiales`, con la piel y
 * los materiales de quien la abre), y esa capa vive en el contenedor del CDK, fuera de cualquier componente.
 */
@Component({
  selector: 'ui-dialog-frame',
  imports: [UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ui-dialog-frame', '[attr.title]': 'null' },
  template: `
    <div class="ui-dialog-frame__handle" aria-hidden="true" (pointerdown)="startDrag($event)"
      (pointermove)="moveDrag($event)" (pointerup)="endDrag($event)" (pointercancel)="cancelDrag()"></div>
    <header class="ui-dialog-frame__header">
      <h2 class="ui-dialog-frame__title" [id]="titleId">{{ title() }}</h2>
      @if (dismissible()) {
        <button ui-icon-button class="ui-dialog-frame__close" icon="close" label="Cerrar" (click)="close()"></button>
      }
    </header>
    @if (description()) {
      <p class="ui-dialog-frame__description" [id]="descriptionId">{{ description() }}</p>
    }
    <div class="ui-dialog-frame__body"><ng-content /></div>
    <footer class="ui-dialog-frame__actions"><ng-content select="[uiDialogActions]" /></footer>
  `,
  styleUrl: './ui-dialog-frame.scss',
})
export class UiDialogFrame {
  readonly title = input.required<string>();
  readonly description = input<string | null | undefined>(null);
  readonly dismissible = input(true, { transform: booleanAttribute });

  protected readonly titleId = uniqueUiId('ui-dialog-title');
  protected readonly descriptionId = uniqueUiId('ui-dialog-description');
  private readonly ref = inject(DialogRef, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private drag: { pointer: number; start: number; distance: number } | null = null;

  constructor() {
    const container = this.ref?.containerInstance as LabelledContainer | undefined;
    container?._addAriaLabelledBy?.(this.titleId);
    inject(DestroyRef).onDestroy(() => container?._removeAriaLabelledBy?.(this.titleId));
    // La descripción va directo al atributo del contenedor: su enlace (config.ariaDescribedBy) sigue en null y no la
    // pisa; cambiar la configuración en plena detección de cambios daría NG0100.
    effect(onCleanup => {
      const container = this.description() ? this.host.closest('.cdk-dialog-container') : null;
      if (!container) return;
      addAriaReferencedId(container, 'aria-describedby', this.descriptionId);
      onCleanup(() => removeAriaReferencedId(container, 'aria-describedby', this.descriptionId));
    });
  }

  protected close(): void {
    this.ref?.close();
  }

  protected startDrag(event: PointerEvent): void {
    const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 599px) and (min-height: 500px)').matches;
    const body = this.host.querySelector<HTMLElement>('.ui-dialog-frame__body');
    if (!phone || event.pointerType !== 'touch' || !event.isPrimary || !this.dismissible() || this.ref?.disableClose || (body?.scrollTop ?? 0) > 0) return;
    this.drag = { pointer: event.pointerId, start: event.clientY, distance: 0 };
    try { (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); } catch { /* Sin captura no se impide cerrar con el botón. */ }
  }

  protected moveDrag(event: PointerEvent): void {
    if (!this.drag || this.drag.pointer !== event.pointerId) return;
    this.drag.distance = Math.max(0, event.clientY - this.drag.start);
    const container = this.host.closest<HTMLElement>('.cdk-dialog-container');
    if (container) container.style.translate = `0 ${this.drag.distance}px`;
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.drag || this.drag.pointer !== event.pointerId) return;
    const distance = Math.max(this.drag.distance, event.clientY - this.drag.start);
    this.cancelDrag();
    const body = this.host.querySelector<HTMLElement>('.ui-dialog-frame__body');
    if (distance >= 80 && (body?.scrollTop ?? 0) <= 0 && this.dismissible() && !this.ref?.disableClose) this.ref?.close();
  }

  protected cancelDrag(): void {
    this.drag = null;
    this.host.closest<HTMLElement>('.cdk-dialog-container')?.style.removeProperty('translate');
  }
}

/** Confirmación (plan visual F2-7): `alertdialog`; en peligro el botón es rojo y el foco empieza en «Cancelar». */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="data.title" [description]="data.message" [dismissible]="false">
      <button ui-button uiDialogActions type="button" variant="secondary" class="ui-confirm__cancel"
        (click)="ref.close(false)">{{ data.cancelLabel ?? 'Cancelar' }}</button>
      <button ui-button uiDialogActions type="button" class="ui-confirm__confirm"
        [variant]="data.tone === 'danger' ? 'danger' : 'primary'" (click)="ref.close(true)">{{ data.confirmLabel }}</button>
    </ui-dialog-frame>
  `,
})
export class UiConfirmDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<UiConfirmOptions>(DIALOG_DATA);
}

/**
 * Confirmación que nombra la consecuencia (plan visual F2-11; RN-07): «Continuar» es primaria, tiene el foco y es
 * lo que devuelven Esc y el fondo; la otra acción asume la pérdida que se describe. NO se usa para la Salida segura
 * (REGLA-004: salir nunca pide confirmación).
 */
@Component({
  selector: 'ui-consequence-dialog',
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="data.title" [description]="data.consequence" [dismissible]="false">
      <button ui-button uiDialogActions type="button" variant="secondary" class="ui-consequence__proceed"
        (click)="ref.close('proceed')">{{ data.proceedLabel }}</button>
      <button ui-button uiDialogActions type="button" class="ui-consequence__continue"
        (click)="ref.close('continue')">{{ data.continueLabel }}</button>
    </ui-dialog-frame>
  `,
})
export class UiConsequenceDialog {
  protected readonly ref = inject<DialogRef<UiConsequenceAnswer>>(DialogRef);
  protected readonly data = inject<UiConsequenceOptions>(DIALOG_DATA);
}

/**
 * Diálogos del lenguaje visual (plan visual F2-7) sobre `@angular/cdk/dialog`: modales con trampa de foco, foco
 * inicial dentro, Esc y fondo cierran, el foco VUELVE al disparador, `aria-modal`, entrada y salida animadas
 * (interrumpibles; sin animación con movimiento reducido). `open` (diálogo centrado), `sheet` (hoja inferior o
 * lateral), `confirm` (promesa de sí o no) y `consequence` (continuar o asumir la pérdida, F2-11).
 */
@Injectable({ providedIn: 'root' })
export class UiDialog {
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tema = inject(TemaService);

  open<R = unknown, D = unknown, C = unknown>(component: ComponentType<C>, options: UiDialogOptions<D> = {}): DialogRef<R, C> {
    return this.launch<R, D, C>(component, options, {
      panelClass: ['ui-dialog-pane', `ui-dialog-pane--${options.size ?? 'md'}`],
    });
  }

  sheet<R = unknown, D = unknown, C = unknown>(component: ComponentType<C>, options: UiSheetOptions<D>): DialogRef<R, C> {
    const position = createGlobalPositionStrategy(this.injector);
    return this.launch<R, D, C>(component, options, {
      panelClass: ['ui-sheet-pane', `ui-sheet-pane--${options.side}`],
      positionStrategy: options.side === 'bottom'
        ? position.bottom('0').centerHorizontally()
        : position.top('0').end('0'),
    });
  }

  confirm(options: UiConfirmOptions): Promise<boolean> {
    const ref = this.launch<boolean, UiConfirmOptions, UiConfirmDialog>(UiConfirmDialog, { data: options, piel: options.piel, origen: options.origen }, {
      role: 'alertdialog',
      panelClass: ['ui-dialog-pane', 'ui-dialog-pane--sm'],
      autoFocus: options.tone === 'danger' ? '.ui-confirm__cancel' : '.ui-confirm__confirm',
    });
    return firstValueFrom(ref.closed).then(result => result === true);
  }

  consequence(options: UiConsequenceOptions): Promise<UiConsequenceAnswer> {
    const ref = this.launch<UiConsequenceAnswer, UiConsequenceOptions, UiConsequenceDialog>(UiConsequenceDialog, { data: options, piel: options.piel, origen: options.origen }, {
      role: 'alertdialog',
      panelClass: ['ui-dialog-pane', 'ui-dialog-pane--sm'],
      autoFocus: '.ui-consequence__continue',
    });
    return firstValueFrom(ref.closed).then(result => (result === 'proceed' ? 'proceed' : 'continue'));
  }

  private launch<R, D, C>(component: ComponentType<C>, options: UiDialogOptions<D>, extra: Partial<DialogConfig<D, DialogRef<R, C>>>): DialogRef<R, C> {
    const reduceMotion = reducedMotionQuery()?.matches ?? true;
    let leaving = false;
    let mayClose = reduceMotion;
    const priorityFocus = !options.autoFocus && !extra.autoFocus;
    // La piel se decide ANTES de abrir: después el CDK ya movió el foco a la capa nueva y se perdería el disparador.
    const fuente = this.fuentePiel(options);
    // Quién tenía el foco al abrir: a él vuelve al cerrar (el CDK lo restaura, salvo que ya no exista).
    const disparador = options.origen instanceof HTMLElement ? options.origen
      : (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const leaveMs = (extra.panelClass as string[] | undefined)?.includes('ui-sheet-pane') ? UI_SHEET_LEAVE_MS : UI_DIALOG_LEAVE_MS;
    const movil = typeof matchMedia === 'function' && matchMedia('(max-width: 599px), (max-width: 1023px) and (max-height: 499px)').matches;
    const anterior = movil ? this.dialog.openDialogs.at(-1) : undefined;
    const ref: DialogRef<R, C> = this.dialog.open<R, D, C>(component, {
      data: options.data,
      ariaLabel: options.ariaLabel ?? null,
      ariaModal: true,
      autoFocus: options.autoFocus ?? 'dialog',
      restoreFocus: options.restoreFocus ?? true,
      disableClose: options.disableClose ?? false,
      backdropClass: 'ui-dialog-backdrop',
      // Salida animada: el primer intento de cierre arranca la animación y el cierre real llega al terminar.
      closePredicate: (result: unknown) => {
        const pane = ref.overlayRef.overlayElement;
        // Sin capa (la navegación ya la destruyó, p. ej. Atrás): se cierra ya, o la promesa queda colgada y la app
        // sigue con aria-hidden.
        if (mayClose || !pane) return true;
        if (!leaving) {
          leaving = true;
          // Inerte durante la salida: un doble clic no dispara dos veces.
          pane.setAttribute('inert', '');
          pane.classList.add('ui-overlay--leaving');
          ref.overlayRef.backdropElement?.classList.add('ui-overlay--leaving');
          setTimeout(() => {
            mayClose = true;
            ref.close(result as R);
          }, leaveMs);
        }
        return false;
      },
      ...extra,
    });
    // La capa anterior conserva su estado para guardias de cambios, pero no queda otra hoja visible debajo.
    if (anterior) {
      anterior.overlayRef.overlayElement.classList.add('ui-overlay--debajo');
      anterior.overlayRef.backdropElement?.classList.add('ui-overlay--debajo');
      ref.closed.subscribe(() => {
        anterior.overlayRef.overlayElement?.classList.remove('ui-overlay--debajo');
        anterior.overlayRef.backdropElement?.classList.remove('ui-overlay--debajo');
      });
    }
    this.vestir(ref, fuente);
    if (options.restoreFocus !== false) this.garantizarFocoAlCerrar(ref, disparador);
    // Después del foco del CDK (que se registra al abrir): el foco por prioridad.
    if (priorityFocus) afterNextRender(() => focusByPriority(ref.overlayRef.overlayElement), { injector: this.injector });
    return ref;
  }

  /**
   * Red de seguridad del retorno de foco (WCAG 2.4.3): el CDK devuelve el foco al disparador, pero si este ya no existe
   * (la fila se borró, el menú que lo abrió se cerró, la pantalla cambió) el foco cae en `<body>` y quien navega con
   * teclado empieza otra vez desde arriba. Entonces va al encabezado de la pantalla, que es donde se está.
   */
  private garantizarFocoAlCerrar<R, C>(ref: DialogRef<R, C>, disparador: HTMLElement | null): void {
    ref.closed.subscribe(() => {
      // Al destruirse la aplicación el CDK cierra los diálogos abiertos: ya no hay pantalla a la que devolver el foco.
      if (this.destroyRef.destroyed) return;
      afterNextRender(() => {
        if (!focoPerdido()) return;
        if (disparador?.isConnected && !disparador.closest('[inert], [hidden]') && enfocarPorPrograma(disparador)) return;
        enfocarPorPrograma(encabezadoPrincipal());
      }, { injector: this.injector });
    });
  }

  /**
   * Orden de C13: piel explícita → contenedor de `origen` → contenedor del foco (si no está en `body`) → tema. Un
   * diálogo anidado cae en el foco y hereda la piel del padre, porque la capa del padre ya lleva `data-skin`.
   */
  private fuentePiel(options: UiDialogOptions<unknown>): FuentePiel {
    if (options.piel === 'game' || options.piel === 'portal') return { tipo: 'fija', piel: options.piel };
    if (options.piel === 'tema') return { tipo: 'tema' };
    const activo = typeof document === 'undefined' ? null : document.activeElement;
    const contenedor = contenedorDePiel(options.origen)
      ?? (activo && activo !== document.body ? contenedorDePiel(activo) : null);
    return contenedor ? { tipo: 'contenedor', contenedor } : { tipo: 'tema' };
  }

  /**
   * Pone la piel en la capa y en su velo (contenedores, nunca `body`: REGLA-010) con la clase que les da los materiales
   * de la portada (`ui-dialog-frame.scss`). La piel se pinta en el acto, sin esperar a un ciclo (así no destella la
   * otra), y se sigue mientras la capa esté abierta: el tema, con un efecto; un contenedor heredado, observando su
   * `data-skin` (el shell del portal cambia de piel si la persona o el sistema cambian el tema). Una piel fija no se
   * sigue: el juego es siempre oscuro.
   */
  private vestir<R, C>(ref: DialogRef<R, C>, fuente: FuentePiel): void {
    const pintar = (piel: UiPiel) => {
      for (const capa of [ref.overlayRef.overlayElement, ref.overlayRef.backdropElement]) {
        if (!capa) continue;
        capa.classList.add('ui-overlay-materiales');
        if (capa.getAttribute('data-skin') !== piel) capa.setAttribute('data-skin', piel);
      }
    };
    if (fuente.tipo === 'fija') {
      pintar(fuente.piel);
      return;
    }
    if (fuente.tipo === 'contenedor') {
      const { contenedor } = fuente;
      pintar(pielDe(contenedor));
      if (typeof MutationObserver === 'undefined') return;
      const observador = new MutationObserver(() => pintar(pielDe(contenedor)));
      observador.observe(contenedor, { attributes: true, attributeFilter: ['data-skin'] });
      ref.closed.subscribe(() => observador.disconnect());
      return;
    }
    pintar(this.tema.piel());
    const seguir = effect(() => pintar(this.tema.piel()), { injector: this.injector });
    ref.closed.subscribe(() => seguir.destroy());
  }
}
