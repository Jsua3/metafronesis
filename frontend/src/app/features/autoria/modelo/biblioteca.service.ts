import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AutoriaApiService } from '../api/autoria-api.service';
import type { Escenario, LugarResumen } from './escenario';

/**
 * La dirección de una imagen de un lugar. El servidor ya entrega las imágenes con su dirección pública
 * (`/assets/biblioteca/…`), así que casi siempre se devuelve igual; una ruta relativa al lugar (`arte/salas/…`)
 * se completa con la carpeta del lugar, y una de la biblioteca de piezas (`piezas/…`, esquema 3) cuelga de la biblioteca,
 * que la comparten todos los lugares (como `url_de_arte` del servidor, contrato x-siep 2.2).
 */
export function rutaArte(lugarId: string | null, ruta: string): string {
  if (!ruta || ruta.startsWith('/') || /^https?:\/\//.test(ruta)) return ruta;
  if (ruta.startsWith('piezas/')) return `/assets/biblioteca/${ruta}`;
  return lugarId ? `/assets/biblioteca/escenarios/${lugarId}/${ruta}` : ruta;
}

/** Dirección de la hoja de un personaje del kit (idle.png: cuatro filas, según hacia dónde mira). */
export function rutaSpriteKit(recipeId: string): string {
  return `/assets/characters/kit/${recipeId}/idle.png`;
}

/** Dirección del retrato de un personaje del kit con una expresión. */
export function rutaRetrato(recipeId: string, expresion: string): string {
  return `/assets/characters/kit/${recipeId}/portrait-${expresion}.png`;
}

/** Lee la biblioteca de lugares del servidor (`/api/biblioteca/lugares`). Un lugar leído se recuerda mientras dure la sesión. */
@Injectable({ providedIn: 'root' })
export class BibliotecaService {
  private readonly api = inject(AutoriaApiService);
  private readonly cache = new Map<string, Promise<Escenario>>();

  lugares(): Promise<LugarResumen[]> {
    return firstValueFrom(this.api.lugares());
  }

  escenario(id: string): Promise<Escenario> {
    let pendiente = this.cache.get(id);
    if (!pendiente) {
      pendiente = firstValueFrom(this.api.lugar(id));
      pendiente.catch(() => this.cache.delete(id));
      this.cache.set(id, pendiente);
    }
    return pendiente;
  }
}
