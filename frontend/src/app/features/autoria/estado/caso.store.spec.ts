import { TestBed } from '@angular/core/testing';

import type { CasoBorrador } from '../modelo/caso';
import { CasoStore } from './caso.store';

function casoDePrueba(): CasoBorrador {
  return {
    id: 'caso-1',
    revision: 0,
    hitos: [],
    nivelRiesgo: null,
    titulo: 'Primera escucha en Bienestar',
    lugarId: 'universidad',
    salas: [],
    escenas: [],
    inicioId: null,
    modoFinales: 'automatico',
    finales: [],
    personajes: [],
    catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

/** Un caso que no viene del servidor (`fijar`) vive solo en memoria; el que se abre del servidor está en `caso.store.api.spec.ts`. */
describe('CasoStore · borrador en memoria', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.restoreAllMocks());

  it('fijar deja el caso a la vista y cerrar lo quita', () => {
    const store = TestBed.inject(CasoStore);
    expect(store.caso()).toBeNull();
    store.fijar(casoDePrueba());
    expect(store.caso()).toEqual(casoDePrueba());
    store.cerrar();
    expect(store.caso()).toBeNull();
  });

  it('el caso ya no se guarda en el navegador: lo que vale es lo que está en el servidor', () => {
    const escribir = vi.spyOn(Storage.prototype, 'setItem');
    const store = TestBed.inject(CasoStore);
    store.fijar(casoDePrueba());
    store.fijarModoFinales('propio');
    TestBed.tick();
    expect(escribir).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('cambiar de caso borra el historial de la sala', () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(casoDePrueba());
    store.fijar({ ...casoDePrueba(), id: 'caso-2' });
    expect(store.puedeDeshacer()).toBe(false);
  });
});
