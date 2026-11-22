import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { UI_FILTROS_ANUNCIO_MS, UiFiltros } from './ui-filtros';

/**
 * ui-filtros (DISENO C6): búsqueda con nombre, recuento «Mostrando N de M», «Limpiar filtros» solo con algo puesto, el
 * recuento anunciado en cortesía tras 400 ms sin cambios y, con cero resultados, el vacío con su acción SIN esconder
 * los controles.
 */
// req: RNF-004 (estado anunciado sin mover el foco), NN/g (los filtros siguen a la vista)
@Component({
  imports: [UiFiltros],
  template: `
    <ui-filtros etiquetaBusqueda="Buscar casos" [(busqueda)]="busqueda" [total]="12" [visibles]="visibles()"
      [hayFiltros]="hayFiltros()" (limpiar)="limpiados = limpiados + 1">
      <select class="filtro-proyectado"><option>Todos</option></select>
    </ui-filtros>
  `,
})
class Host {
  readonly busqueda = signal('');
  readonly visibles = signal(12);
  readonly hayFiltros = signal(false);
  limpiados = 0;
}

describe('ui-filtros', () => {
  let fixture: ComponentFixture<Host>;
  let announce: ReturnType<typeof vi.fn>;
  const root = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    announce = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('pinta la búsqueda con su nombre, lo proyectado y el recuento', () => {
    const input = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(root().querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBe('Buscar casos');
    expect(root().querySelector('.ui-filtros__controles .filtro-proyectado')).not.toBeNull();
    expect(root().querySelector('.ui-filtros__recuento')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Mostrando 12 de 12');
    expect(root().querySelector('.ui-filtros__limpiar')).toBeNull();
  });

  it('escribir actualiza el modelo y muestra «Limpiar filtros»; limpiar vacía la búsqueda y avisa', () => {
    const input = root().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'urgencias';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.busqueda()).toBe('urgencias');
    root().querySelector<HTMLButtonElement>('.ui-filtros__limpiar')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.busqueda()).toBe('');
    expect(fixture.componentInstance.limpiados).toBe(1);
  });

  it('anuncia el recuento en cortesía solo tras 400 ms sin cambios, y no al llegar', () => {
    vi.advanceTimersByTime(UI_FILTROS_ANUNCIO_MS * 2);
    expect(announce).not.toHaveBeenCalled();
    fixture.componentInstance.visibles.set(8);
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    fixture.componentInstance.visibles.set(4);
    fixture.detectChanges();
    vi.advanceTimersByTime(UI_FILTROS_ANUNCIO_MS - 1);
    expect(announce).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Mostrando 4 de 12.', 'polite');
  });

  it('con cero resultados los controles siguen y aparece el vacío con «Limpiar filtros»', () => {
    fixture.componentInstance.hayFiltros.set(true);
    fixture.componentInstance.visibles.set(0);
    fixture.detectChanges();
    expect(root().querySelector('input[type="search"]')).not.toBeNull();
    expect(root().querySelector('.filtro-proyectado')).not.toBeNull();
    const vacio = root().querySelector('ui-empty-state.ui-filtros__vacio')!;
    expect(vacio.getAttribute('role')).toBe('status');
    vacio.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.limpiados).toBe(1);
  });
});
