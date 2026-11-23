import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { existsSync } from 'fs';
import { join } from 'path';

import { universidad } from '../testing/universidad';
import { BibliotecaService, rutaArte, rutaRetrato, rutaSpriteKit } from './biblioteca.service';

describe('Biblioteca', () => {
  let servicio: BibliotecaService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(BibliotecaService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('la universidad de las pruebas tiene al menos 8 salas, hitos y nivel de riesgo (esquema 2)', () => {
    expect(universidad.salas.length).toBeGreaterThanOrEqual(8);
    expect(universidad.hitos?.length).toBeGreaterThan(0);
    expect(universidad.nivelRiesgoPorDefecto).toBe('MODERATE');
  });

  it('lugares lee la lista del servidor', async () => {
    const lista = [{ id: 'universidad', nombre: 'Universidad', completo: true, salas: 10 }];
    const pedido = servicio.lugares();
    http.expectOne('/api/biblioteca/lugares').flush({ data: lista });
    expect(await pedido).toEqual(lista);
  });

  it('escenario lee el lugar del servidor una sola vez', async () => {
    const primero = servicio.escenario('universidad');
    const segundo = servicio.escenario('universidad');
    http.expectOne('/api/biblioteca/lugares/universidad').flush({ data: universidad });
    expect((await primero).id).toBe('universidad');
    expect(await segundo).toBe(await primero);
  });

  it('si la lectura falla, se vuelve a pedir la próxima vez', async () => {
    const fallido = servicio.escenario('universidad');
    http.expectOne('/api/biblioteca/lugares/universidad').flush({ message: 'x' }, { status: 503, statusText: 'No disponible' });
    await expect(fallido).rejects.toBeTruthy();
    void servicio.escenario('universidad');
    http.expectOne('/api/biblioteca/lugares/universidad').flush({ data: universidad });
  });

  describe('rutas de imágenes', () => {
    it('una dirección pública se deja como está', () => {
      expect(rutaArte('universidad', '/assets/biblioteca/escenarios/universidad/arte/salas/pasillo.png'))
        .toBe('/assets/biblioteca/escenarios/universidad/arte/salas/pasillo.png');
    });

    it('una ruta relativa al lugar se completa con su carpeta; sin lugar no se inventa nada', () => {
      expect(rutaArte('universidad', 'arte/salas/pasillo.png')).toBe('/assets/biblioteca/escenarios/universidad/arte/salas/pasillo.png');
      expect(rutaArte(null, 'arte/salas/pasillo.png')).toBe('arte/salas/pasillo.png');
      expect(rutaArte('universidad', '')).toBe('');
    });

    it('una ruta de la biblioteca de piezas cuelga de la biblioteca, no del lugar (como el servidor)', () => {
      expect(rutaArte('comisaria', 'piezas/muebles/comisaria/escritorio.png')).toBe('/assets/biblioteca/piezas/muebles/comisaria/escritorio.png');
    });

    it('el retrato sale del kit de personajes del programa', () => {
      expect(rutaRetrato('camila', 'en-crisis')).toBe('/assets/characters/kit/camila/portrait-en-crisis.png');
    });
  });

  it('la hoja y los retratos de cada personaje del lugar apuntan a archivos que existen en el programa', () => {
    const assets = join(__dirname, '../../../../assets');
    expect(universidad.personajes.length).toBeGreaterThan(0);
    for (const p of universidad.personajes) {
      expect(rutaSpriteKit(p.recipeId).startsWith('/assets/characters/kit/')).toBe(true);
      for (const ruta of [rutaSpriteKit(p.recipeId), rutaRetrato(p.recipeId, 'neutral'), rutaRetrato(p.recipeId, 'en-crisis')]) {
        expect(existsSync(join(assets, ruta.replace('/assets/', ''))), ruta).toBe(true);
      }
    }
  });
});
