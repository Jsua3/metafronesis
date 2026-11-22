import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiBarraAcciones, UiBarraAccionesPosicion } from './ui-barra-acciones';

/**
 * ui-barra-acciones (DISENO C7): las acciones proyectadas, en orden; con nota es un grupo nombrado por ella; la
 * posición `pie` lleva el vidrio y la `columna` no.
 */
// req: RNF-004 (grupo de controles con nombre)
@Component({
  imports: [UiBarraAcciones],
  template: `
    <ui-barra-acciones [nota]="nota()" [posicion]="posicion()">
      <button type="button" class="volver">Volver</button>
      <button type="button" class="comenzar">Comenzar</button>
    </ui-barra-acciones>
  `,
})
class Host {
  readonly nota = signal<string | null>('Al comenzar aceptas el aviso de contenido.');
  readonly posicion = signal<UiBarraAccionesPosicion>('pie');
}

describe('ui-barra-acciones', () => {
  let fixture: ComponentFixture<Host>;
  const barra = () => (fixture.nativeElement as HTMLElement).querySelector('ui-barra-acciones') as HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('con nota es un grupo nombrado por ella y proyecta las acciones en orden', () => {
    expect(barra().getAttribute('role')).toBe('group');
    const nota = document.getElementById(barra().getAttribute('aria-labelledby')!) ?? barra().querySelector('.ui-barra-acciones__nota');
    expect(nota?.textContent?.trim()).toBe('Al comenzar aceptas el aviso de contenido.');
    expect([...barra().querySelectorAll('.ui-barra-acciones__botones button')].map(boton => boton.className)).toEqual(['volver', 'comenzar']);
  });

  it('sin nota es una fila sin rol ni párrafo vacío', async () => {
    fixture.componentInstance.nota.set(null);
    await fixture.whenStable();
    expect(barra().hasAttribute('role')).toBe(false);
    expect(barra().querySelector('.ui-barra-acciones__nota')).toBeNull();
  });

  it('el pie lleva vidrio y la columna no', async () => {
    expect(barra().classList).toContain('ui-barra-acciones--pie');
    expect(barra().querySelector('.ui-barra-acciones__bandeja--vidrio')).not.toBeNull();
    fixture.componentInstance.posicion.set('columna');
    await fixture.whenStable();
    expect(barra().classList).toContain('ui-barra-acciones--columna');
    expect(barra().querySelector('.ui-barra-acciones__bandeja--vidrio')).toBeNull();
  });
});
