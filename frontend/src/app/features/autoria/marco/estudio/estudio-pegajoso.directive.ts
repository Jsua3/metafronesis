import { Directive, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

/** Pega una columna solo mientras cabe entre las dos barras del editor. */
@Directive({ selector: '[estudioPegajoso]' })
export class EstudioPegajosoDirective {
  private readonly columna = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destruir = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const ventana = this.columna.ownerDocument.defaultView;
      if (!ventana) return;
      const medir = () => {
        const documento = this.columna.ownerDocument;
        const barra = documento.querySelector<HTMLElement>('app-autoria-shell header[ui-glass-bar]');
        const estado = documento.querySelector<HTMLElement>('app-estudio-barra-estado');
        const altoBarra = barra?.getBoundingClientRect().height ?? 0;
        const altoEstado = estado?.getBoundingClientRect().height ?? 0;
        const cabe = ventana.innerWidth >= 1024 && this.columna.getBoundingClientRect().height <= ventana.innerHeight - altoBarra - altoEstado;
        this.columna.classList.toggle('esta-pegajoso', cabe);
      };
      const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
      observador?.observe(this.columna);
      const barra = this.columna.ownerDocument.querySelector('app-autoria-shell header[ui-glass-bar]');
      const estado = this.columna.ownerDocument.querySelector('app-estudio-barra-estado');
      if (barra) observador?.observe(barra);
      if (estado) observador?.observe(estado);
      ventana.addEventListener('resize', medir);
      medir();
      this.destruir.onDestroy(() => { observador?.disconnect(); ventana.removeEventListener('resize', medir); });
    });
  }
}
