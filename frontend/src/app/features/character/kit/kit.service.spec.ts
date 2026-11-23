import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { KIT_BUNDLE_URL, KitService } from './kit.service';
import { testKitBundle } from './testing/kit-testing';

/** Paquete como los de antes de las ocho vistas: cada complexión solo trae abajo, izquierda, derecha y arriba. */
function sinDiagonales(): object {
  const bundle = testKitBundle();
  const complexions = Object.fromEntries(Object.entries(bundle.complexions).map(([id, views]) => {
    const { down, left, right, up } = views;
    return [id, { down, left, right, up }];
  }));
  return { ...bundle, complexions };
}

describe('KitService', () => {
  let service: KitService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(KitService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide kit.json una sola vez y publica el paquete en la señal', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    const bundle = await first;
    expect(await second).toBe(bundle);
    expect(service.bundle()).toBe(bundle);
    expect(await service.load()).toBe(bundle);
  });

  it('si la carga falla, el siguiente load vuelve a intentarlo', async () => {
    const failed = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush('caído', { status: 500, statusText: 'Error' });
    await expect(failed).rejects.toBeTruthy();
    expect(service.bundle()).toBeNull();
    const retry = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    await expect(retry).resolves.toBeTruthy();
  });

  it.each([
    ['de otra versión', { ...testKitBundle(), schemaVersion: 2 }],
    ['sin su receta por defecto', { ...testKitBundle(), recipes: {} }],
    ['que no es un paquete', { ok: true }],
    ['de antes de las diagonales (4 vistas por complexión)', sinDiagonales()],
  ])('un kit.json %s cuenta como carga fallida: nada se publica y el siguiente load reintenta', async (_name, body) => {
    const failed = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(body);
    await expect(failed).rejects.toThrow('kit.json');
    expect(service.bundle()).toBeNull();
    const retry = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    await expect(retry).resolves.toBeTruthy();
  });
});
