import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SesionDetalleComponent } from './sesion-detalle.component';
import { SesionListaComponent } from './sesion-lista.component';
import { SesionesPageComponent } from './sesiones-page.component';

@Component({ selector: 'app-sesion-lista', template: '' })
class ListaPrueba { readonly compacta = input(false); }

@Component({ selector: 'app-sesion-detalle', template: '' })
class DetallePrueba { readonly sesionId = input.required<number>(); }

describe('SesionesPageComponent', () => {
  it('con una sesión abierta conserva la lista para la vista dividida', async () => {
    await TestBed.configureTestingModule({ imports: [SesionesPageComponent] })
      .overrideComponent(SesionesPageComponent, {
        remove: { imports: [SesionListaComponent, SesionDetalleComponent] },
        add: { imports: [ListaPrueba, DetallePrueba] },
      }).compileComponents();
    const fixture = TestBed.createComponent(SesionesPageComponent);
    fixture.componentRef.setInput('sesionId', '4');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-sesion-lista')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-sesion-detalle')).not.toBeNull();
  });
});
