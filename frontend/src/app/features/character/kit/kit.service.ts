import { Injectable, inject, signal } from '@angular/core';
import { GameAssetsApi } from '../../../core/api/game-assets.api';
import { firstValueFrom } from 'rxjs';

import { type KitBundle, VIEW_ROWS } from './kit-engine';

export const KIT_BUNDLE_URL = '/assets/characters/kit/kit.json';

/**
 * ¿Es un paquete que este código sabe leer? Uno de otra versión, o a medias (caché vieja, un
 * despliegue a mitad), cuenta como carga fallida: cada pantalla usa su respaldo y se reintenta.
 */
function isKitBundle(x: unknown): x is KitBundle {
  const bundle = x as Partial<KitBundle> | null;
  if (!bundle || typeof bundle !== 'object' || bundle.schemaVersion !== 1) return false;
  const { catalog, recipes, complexions } = bundle;
  if (!catalog || !recipes || !recipes[catalog.defaultRecipe] || !recipes[catalog.extras]) return false;
  // Un paquete de antes de las diagonales trae 4 vistas por complexión: con él las filas de las hojas no coinciden.
  const bodies = Object.values(complexions ?? {});
  return bodies.length > 0 && bodies.every(views => !!views && VIEW_ROWS.every(view => !!views[view]));
}

/**
 * Paquete del kit (spec §5.3), pedido una sola vez por sesión. Si la carga falla,
 * el siguiente `load()` vuelve a intentarlo; mientras tanto `bundle()` es null y
 * cada pantalla muestra su respaldo.
 */
@Injectable({ providedIn: 'root' })
export class KitService {
  private readonly assets = inject(GameAssetsApi);
  private readonly state = signal<KitBundle | null>(null);
  readonly bundle = this.state.asReadonly();
  private request: Promise<KitBundle> | null = null;

  load(): Promise<KitBundle> {
    const ready = this.state();
    if (ready) return Promise.resolve(ready);
    this.request ??= firstValueFrom(this.assets.getJson(KIT_BUNDLE_URL))
      .then(bundle => {
        if (!isKitBundle(bundle)) throw new Error('kit.json no es un paquete de esta versión del kit');
        this.state.set(bundle);
        return bundle;
      })
      .catch(error => {
        this.request = null;
        throw error;
      });
    return this.request;
  }
}
