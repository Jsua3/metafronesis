import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SesionesApi } from './sesiones.api';

describe('SesionesApi', () => {
  let api: SesionesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(SesionesApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lista filtrando por varios estados', () => {
    let filas: unknown;
    api.listar(['EN_CURSO', 'PAUSADA']).subscribe(r => (filas = r));
    const req = http.expectOne(r => r.url === '/api/sesiones');
    expect(req.request.params.get('estado')).toBe('EN_CURSO,PAUSADA');
    req.flush({ data: [] });
    expect(filas).toEqual([]);
  });

  it('lista sin filtro no manda el parámetro', () => {
    api.listar().subscribe();
    const req = http.expectOne('/api/sesiones');
    expect(req.request.params.has('estado')).toBe(false);
    req.flush({ data: [] });
  });

  it('cada transición es un POST a su ruta', () => {
    api.transicionar(7, 'pausar').subscribe();
    const req = http.expectOne('/api/sesiones/7/pausar');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 7 } });
  });

  it('autoriza la repetición con el motivo', () => {
    api.autorizarRepeticion(7, 3, 'Otra vez').subscribe();
    const req = http.expectOne('/api/sesiones/7/convocados/3/repeticion');
    expect(req.request.body).toEqual({ motivo: 'Otra vez' });
    req.flush({ data: { id: 1 } });
  });
});
