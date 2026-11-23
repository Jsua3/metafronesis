import { TestBed } from '@angular/core/testing';

import { CasoStore } from './estado/caso.store';
import { copiarEscenarioAlCaso } from './modelo/copiar';
import { RutasAutoria, rutaDelEditor } from './rutas';
import { universidad } from './testing/universidad';

describe('rutaDelEditor', () => {
  it('las pantallas del caso cuelgan de su editor en el programa', () => {
    expect(rutaDelEditor('/editor', '41')).toBe('/portal/casos/41/editor');
    expect(rutaDelEditor('/editor/escena/12', '41')).toBe('/portal/casos/41/editor/escena/12');
    expect(rutaDelEditor('/editor/sala/sala-espera', '41')).toBe('/portal/casos/41/editor/sala/sala-espera');
    expect(rutaDelEditor('/editor/finales', '41')).toBe('/portal/casos/41/editor/finales');
    expect(rutaDelEditor('/revision', '41')).toBe('/portal/casos/41/editor/revision');
  });

  it('«Mis casos» es la lista de casos y crear un caso son los dos pasos de casos/nuevo', () => {
    expect(rutaDelEditor('/', '41')).toBe('/portal/casos');
    expect(rutaDelEditor('/lugar', null)).toBe('/portal/casos/nuevo');
    expect(rutaDelEditor('/salas?lugar=universidad', null)).toBe('/portal/casos/nuevo/salas?lugar=universidad');
  });

  it('la pantalla de avance de la generación cuelga de crear un caso', () => {
    expect(rutaDelEditor('/generando/g-1', null)).toBe('/portal/casos/nuevo/generando/g-1');
    expect(rutaDelEditor('/generando/g-1', '41')).toBe('/portal/casos/nuevo/generando/g-1');
    expect(rutaDelEditor('/generando/g%201', null)).toBe('/portal/casos/nuevo/generando/g%201');
  });

  it('sin caso abierto, las direcciones del editor llevan a la lista; una desconocida también', () => {
    expect(rutaDelEditor('/editor/finales', null)).toBe('/portal/casos');
    expect(rutaDelEditor('/algo-raro', '41')).toBe('/portal/casos');
    expect(rutaDelEditor('/probar?desde=12', '41')).toBe('/portal/casos'); // «probar» ya no es una pantalla del editor
  });

  it('un caso con caracteres raros en su identificador no rompe la dirección', () => {
    expect(rutaDelEditor('/editor', 'caso 1/2')).toBe('/portal/casos/caso%201%2F2/editor');
  });
});

describe('RutasAutoria', () => {
  it('arma la dirección con el caso que está abierto y codifica lo que se le añade', () => {
    TestBed.resetTestingModule();
    const store = TestBed.inject(CasoStore);
    const rutas = TestBed.inject(RutasAutoria);
    expect(rutas.a('/editor')).toBe('/portal/casos');
    store.fijar({ ...copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso'), id: '41' });
    expect(rutas.a('/editor')).toBe('/portal/casos/41/editor');
    expect(rutas.a('/editor/escena', 'escena ab/1')).toBe('/portal/casos/41/editor/escena/escena%20ab%2F1');
    expect(rutas.a('/')).toBe('/portal/casos');
  });
});
