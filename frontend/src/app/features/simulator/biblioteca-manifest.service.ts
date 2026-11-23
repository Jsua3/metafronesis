import { Injectable, inject } from '@angular/core';
import { GameAssetsApi } from '../../core/api/game-assets.api';
import { firstValueFrom, timeout } from 'rxjs';

import { BIBLIOTECA_MANIFEST_URL, BibliotecaManifest, isBibliotecaManifest } from './object-sprite.util';

/** Lo máximo que el arranque del juego espera al manifiesto: pasado el plazo se sigue sin él (los objetos quedan en su reposo). */
export const BIBLIOTECA_MANIFEST_TIMEOUT_MS = 8000;

/**
 * Manifiesto del arte de la biblioteca (`/assets/biblioteca/manifiesto.json`), pedido una sola vez por sesión de
 * juego. Si no carga, no llega a tiempo (`BIBLIOTECA_MANIFEST_TIMEOUT_MS`) o no es de esta versión, `load()` devuelve `null`
 * y el juego sigue sin animaciones de cercanía (cada objeto queda en su reposo); el siguiente `load()` vuelve a intentarlo.
 */
@Injectable({ providedIn: 'root' })
export class BibliotecaManifestService {
  private readonly assets = inject(GameAssetsApi);
  private ready: BibliotecaManifest | null = null;
  private request: Promise<BibliotecaManifest | null> | null = null;

  load(): Promise<BibliotecaManifest | null> {
    if (this.ready) return Promise.resolve(this.ready);
    this.request ??= firstValueFrom(this.assets.getJson(BIBLIOTECA_MANIFEST_URL).pipe(timeout(BIBLIOTECA_MANIFEST_TIMEOUT_MS)))
      .then(manifest => {
        if (!isBibliotecaManifest(manifest)) throw new Error('manifiesto.json no es de esta versión');
        this.ready = manifest;
        return manifest;
      })
      .catch(() => {
        this.request = null;
        return null;
      });
    return this.request;
  }
}
