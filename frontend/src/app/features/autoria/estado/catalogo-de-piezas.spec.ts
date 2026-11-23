import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MANIFIESTO_DE_PIEZAS_URL, type FichaDePieza, type ManifiestoDePiezas } from '../../simulator/sala/catalogo';
import { AutoriaApiService } from '../api/autoria-api.service';
import { CatalogoDePiezas } from './catalogo-de-piezas';

const ficha = (nombre: string, muros: string[]): FichaDePieza => ({
  nombre, muros, ocupa: 20, cuadros: 1, franja: [0, 20], vistas: {},
});
const manifiesto: ManifiestoDePiezas = {
  esquema: 2,
  piezas: {
    'puerta/madera': ficha('Puerta de madera', ['fondo']),
    'ventana/alta': ficha('Ventana alta', ['izquierda']),
    'cuadro/flor': ficha('Cuadro de flor', ['derecha']),
    'lampara/tubo': ficha('Tubo', ['fondo']),
    'lampara/pie': ficha('Lámpara de pie', ['suelo']),
    'otro/suelo': ficha('Pieza de suelo', ['suelo']),
  },
  pisos: { 'baldosa-a': {} as never, 'baldosa-casa-cocina': {} as never, 'madera-b': {} as never },
  muros: { 'zocalo-alto/casa': {} as never, 'zocalo-alto/casa-sala': {} as never },
  muebles: {}, propios: [], lugares: [],
};

describe('CatalogoDePiezas', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('pide el manifiesto una vez', async () => {
    const api = TestBed.inject(AutoriaApiService);
    const catalogo = TestBed.inject(CatalogoDePiezas);
    const primera = api.manifiestoDePiezas();
    const segunda = api.manifiestoDePiezas();
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush(manifiesto);
    await Promise.all([primera, segunda]);
    expect(catalogo.manifiesto()).toEqual(manifiesto);
    expect(catalogo.reglas()?.clavesDePisos).toEqual(Object.keys(manifiesto.pisos));
    await api.manifiestoDePiezas();
    http.expectNone(MANIFIESTO_DE_PIEZAS_URL);
  });

  it('tras un fallo, la siguiente llamada vuelve a pedir el manifiesto', async () => {
    const api = TestBed.inject(AutoriaApiService);
    const primera = api.manifiestoDePiezas();
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush('Error', { status: 503, statusText: 'No disponible' });
    await expect(primera).rejects.toBeDefined();
    const segunda = api.manifiestoDePiezas();
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush(manifiesto);
    await expect(segunda).resolves.toEqual(manifiesto);
    await api.manifiestoDePiezas();
    http.expectNone(MANIFIESTO_DE_PIEZAS_URL);
  });

  it('reintentar después de un fallo carga el catálogo y apaga el error', async () => {
    const catalogo = TestBed.inject(CatalogoDePiezas);
    const primera = TestBed.inject(AutoriaApiService).manifiestoDePiezas();
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush('Error', { status: 503, statusText: 'No disponible' });
    await primera.catch(() => undefined);
    await Promise.resolve();
    expect(catalogo.error()).toBe(true);
    expect(catalogo.reglas()).toBeNull();
    catalogo.reintentar();
    expect(catalogo.error()).toBe(false);
    const segunda = TestBed.inject(AutoriaApiService).manifiestoDePiezas();
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush(manifiesto);
    await segunda;
    await Promise.resolve();
    expect(catalogo.error()).toBe(false);
    expect(catalogo.manifiesto()).toEqual(manifiesto);
    expect(catalogo.reglas()?.clavesDePisos).toEqual(Object.keys(manifiesto.pisos));
    catalogo.reintentar();
    http.expectNone(MANIFIESTO_DE_PIEZAS_URL);
  });

  it('arma las cinco categorías con los nombres del manifiesto', async () => {
    const catalogo = TestBed.inject(CatalogoDePiezas);
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush(manifiesto);
    await TestBed.inject(AutoriaApiService).manifiestoDePiezas();
    expect(catalogo.paleta()).toEqual([
      { clave: 'puertas', nombre: 'Puertas', modelos: [
        { tipo: 'puerta', modelo: 'madera', nombre: 'Puerta de madera', muros: ['fondo'] },
      ] },
      { clave: 'ventanas', nombre: 'Ventanas', modelos: [
        { tipo: 'ventana', modelo: 'alta', nombre: 'Ventana alta', muros: ['izquierda'] },
      ] },
      { clave: 'muro', nombre: 'Muro', modelos: [{ tipo: 'cuadro', modelo: 'flor', nombre: 'Cuadro de flor', muros: ['derecha'] }] },
      { clave: 'lamparas', nombre: 'Lámparas', modelos: [
        { tipo: 'lampara', modelo: 'tubo', nombre: 'Tubo', muros: ['fondo'] },
        { tipo: 'lampara', modelo: 'pie', nombre: 'Lámpara de pie', muros: ['suelo'] },
      ] },
      { clave: 'objetos', nombre: 'Objetos', modelos: [] },
    ]);
  });

  it('saca variantes y paletas de las claves', async () => {
    const catalogo = TestBed.inject(CatalogoDePiezas);
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush(manifiesto);
    await TestBed.inject(AutoriaApiService).manifiestoDePiezas();
    expect(catalogo.acabados()).toEqual({
      pisos: [{ piso: 'baldosa', variantes: ['a', 'casa-cocina'] }, { piso: 'madera', variantes: ['b'] }],
      muros: [{ muro: 'zocalo-alto', paletas: ['casa', 'casa-sala'] }],
    });
  });

  it('un manifiesto que no valida deja error en true y reglas en null', async () => {
    const catalogo = TestBed.inject(CatalogoDePiezas);
    const solicitud = TestBed.inject(AutoriaApiService).manifiestoDePiezas();
    http.expectOne(MANIFIESTO_DE_PIEZAS_URL).flush({ esquema: 1 });
    await solicitud.catch(() => undefined);
    await Promise.resolve();
    expect(catalogo.error()).toBe(true);
    expect(catalogo.manifiesto()).toBeNull();
    expect(catalogo.reglas()).toBeNull();
  });
});
