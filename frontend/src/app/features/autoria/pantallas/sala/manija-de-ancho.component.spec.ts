import { TestBed } from '@angular/core/testing';

import { CasoStore } from '../../estado/caso.store';
import { faltasPorSala } from '../../modelo/salas-a-documento';
import { CASOS_DE_REGLAS_DE_SALA } from '../../modelo/reglas-salas-casos.fixture';
import { CASO_HOSPITAL } from '../../testing/hospital';
import { ManijaDeAnchoComponent } from './manija-de-ancho.component';

describe('ManijaDeAnchoComponent', () => {
  it('la manija recorre 960 → 1200 → … → 1920 con flechas', () => {
    const fixture = TestBed.createComponent(ManijaDeAnchoComponent);
    const cambios: number[] = [];
    fixture.componentRef.setInput('ancho', 960);
    fixture.componentInstance.cambio.subscribe(valor => cambios.push(valor));
    fixture.detectChanges();
    const control = fixture.nativeElement.querySelector('[role="slider"]') as HTMLElement;
    expect(control.tagName).toBe('DIV');
    expect(control.tabIndex).toBe(0);
    for (const ancho of [1200, 1440, 1680, 1920]) {
      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(cambios.at(-1)).toBe(ancho);
      fixture.componentRef.setInput('ancho', ancho); fixture.detectChanges();
      expect(control.getAttribute('aria-valuetext')).toBe(`${ancho} px`);
    }
  });
  it('achicar el ancho marca las piezas que quedan fuera y no borra ninguna', () => {
    const store = TestBed.inject(CasoStore);
    const caso = structuredClone(CASO_HOSPITAL);
    store.fijar(caso);
    const sala = caso.salas[0];
    const ids = sala.estructura!.piezas!.map(p => p.id);
    const fixture = TestBed.createComponent(ManijaDeAnchoComponent);
    fixture.componentRef.setInput('ancho', sala.estructura!.ancho);
    fixture.componentInstance.cambio.subscribe(ancho => store.cambiarEstructura(sala.id, 'Ancho', e => { e.ancho = ancho; }));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.componentRef.setInput('ancho', 1200); fixture.detectChanges();
    fixture.nativeElement.querySelector('[role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    const actual = store.caso()!;
    expect(actual.salas[0].estructura!.piezas!.map(p => p.id)).toEqual(ids);
    expect(faltasPorSala(actual, CASOS_DE_REGLAS_DE_SALA.catalogo).get(sala.id)?.some(f => f.regla === 'OCL-13')).toBe(true);
  });

});
