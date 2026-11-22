import { TemplateRef, ViewContainerRef } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { Subject } from 'rxjs';

/**
 * Doble de `UiDialog.sheet` para las pruebas de Grupos: en vez de abrir la hoja lateral del CDK, pinta la plantilla que
 * la pantalla le pasa (`data.template`) junto al anfitrión, de modo que sus formularios y botones se pueden consultar
 * (están fuera del anfitrión: se buscan en `document.body`).
 *
 * `close()` avisa por `closed` pero NO destruye la vista: así una prueba puede mirar el estado del formulario después
 * de que la pantalla lo cerró (p. ej. «crear con éxito deja el formulario en blanco»). Una hoja nueva sí reemplaza a
 * la anterior (la real es modal: nunca hay dos a la vez).
 */
export function hojaFalsa(fixture: () => ComponentFixture<unknown>) {
  let anterior: { destroy(): void; rootNodes: Node[] } | undefined;
  const quitar = () => {
    if (!anterior) return;
    // Las pruebas siguientes buscan en `document.body`: sin esto quedarían formularios de la prueba anterior.
    for (const node of anterior.rootNodes) (node as ChildNode).remove?.();
    anterior.destroy();
    anterior = undefined;
  };
  const sheet = vi.fn((_component: unknown, options: { data: { title: string; template: TemplateRef<unknown> } }) => {
    quitar();
    const fx = fixture();
    const vcr = fx.debugElement.injector.get(ViewContainerRef);
    const view = vcr.createEmbeddedView(options.data.template);
    view.detectChanges();
    anterior = view;
    // La vista de la plantilla se declara en un componente OnPush y se inserta junto al anfitrión: `detectChanges()` del
    // fixture no la refresca sola. Se encadena para que cada ciclo de la prueba también pinte la hoja.
    const detectar = fx.detectChanges.bind(fx);
    fx.detectChanges = (...args: Parameters<typeof detectar>) => {
      detectar(...args);
      if (!view.destroyed) view.detectChanges();
    };
    const closed = new Subject<unknown>();
    return {
      title: options.data.title,
      view,
      closed,
      close: vi.fn(() => { closed.next(undefined); closed.complete(); }),
    };
  });
  /** Retira del documento lo que pintó la última hoja (se llama al terminar cada prueba). */
  return Object.assign(sheet, { limpiar: quitar });
}
