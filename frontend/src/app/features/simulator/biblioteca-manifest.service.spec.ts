import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BIBLIOTECA_MANIFEST_TIMEOUT_MS, BibliotecaManifestService } from './biblioteca-manifest.service';
import { BIBLIOTECA_MANIFEST_URL, BibliotecaManifest } from './object-sprite.util';

const MANIFEST: BibliotecaManifest = {
  esquema: 1,
  sprites: { 'modelos/arte/ventana-cerca.png': { ancho: 32, alto: 32, cuadros: 3, fps: 6, origen: 'modelo' } },
};

describe('BibliotecaManifestService', () => {
  let service: BibliotecaManifestService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BibliotecaManifestService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide el manifiesto en la ruta pública de la biblioteca', () => {
    expect(BIBLIOTECA_MANIFEST_URL).toBe('/assets/biblioteca/manifiesto.json');
  });

  it('load() comparte la promesa: dos llamadas simultáneas hacen una sola petición', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(MANIFEST);
    expect(await first).toEqual(MANIFEST);
    expect(await second).toBe(await first);
  });

  it('una vez cargado, los siguientes load() no vuelven a pedirlo', async () => {
    const first = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(MANIFEST);
    const manifest = await first;

    expect(await service.load()).toBe(manifest);
    http.expectNone(BIBLIOTECA_MANIFEST_URL);
  });

  it('ante un 404 devuelve null sin lanzar (el juego sigue sin animaciones)', async () => {
    const result = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush('no está', { status: 404, statusText: 'Not Found' });

    await expect(result).resolves.toBeNull();
  });

  it.each([
    ['un esquema distinto de 1', { esquema: 2, sprites: {} }],
    ['sin sprites', { esquema: 1 }],
    ['sprites que no es un objeto', { esquema: 1, sprites: [] }],
    ['algo que no es un manifiesto', 'hola'],
  ])('%s: devuelve null sin lanzar', async (_nombre, cuerpo) => {
    const result = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(cuerpo as never);

    await expect(result).resolves.toBeNull();
  });

  it('tras un fallo, el siguiente load() vuelve a intentarlo (el fallo no se queda guardado)', async () => {
    const failed = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush('caído', { status: 500, statusText: 'Error' });
    await expect(failed).resolves.toBeNull();

    const retry = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(MANIFEST);
    await expect(retry).resolves.toEqual(MANIFEST);
  });

  it('tras un esquema inválido, el siguiente load() también reintenta', async () => {
    const invalid = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush({ esquema: 2, sprites: {} });
    await expect(invalid).resolves.toBeNull();

    const retry = service.load();
    http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(MANIFEST);
    await expect(retry).resolves.toEqual(MANIFEST);
  });

  // Revisión final · C8: el arranque del juego espera este manifiesto; un servidor que no contesta no debe colgarlo.
  describe('con un servidor que no contesta', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('pasado el plazo devuelve null (el juego sigue sin animaciones) y cancela la petición', async () => {
      expect(BIBLIOTECA_MANIFEST_TIMEOUT_MS).toBe(8000);
      const result = service.load();
      const request = http.expectOne(BIBLIOTECA_MANIFEST_URL);
      vi.advanceTimersByTime(BIBLIOTECA_MANIFEST_TIMEOUT_MS - 1);
      expect(request.cancelled).toBe(false);
      vi.advanceTimersByTime(1);
      await expect(result).resolves.toBeNull();
      expect(request.cancelled).toBe(true);
    });

    it('y el siguiente load() vuelve a intentarlo', async () => {
      const lento = service.load();
      http.expectOne(BIBLIOTECA_MANIFEST_URL);
      vi.advanceTimersByTime(BIBLIOTECA_MANIFEST_TIMEOUT_MS);
      await expect(lento).resolves.toBeNull();

      const retry = service.load();
      http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(MANIFEST);
      await expect(retry).resolves.toEqual(MANIFEST);
    });

    it('una respuesta a tiempo no se ve afectada por el plazo', async () => {
      const result = service.load();
      vi.advanceTimersByTime(BIBLIOTECA_MANIFEST_TIMEOUT_MS - 1000);
      http.expectOne(BIBLIOTECA_MANIFEST_URL).flush(MANIFEST);
      await expect(result).resolves.toEqual(MANIFEST);
      vi.advanceTimersByTime(60_000);
      expect(await service.load()).toEqual(MANIFEST);
    });
  });
});
