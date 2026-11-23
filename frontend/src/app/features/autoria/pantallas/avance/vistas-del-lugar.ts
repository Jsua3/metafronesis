import { Injectable, Injector, inject, signal } from '@angular/core';

import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escenario } from '../../modelo/escenario';
import { PintorDeVistas } from '../lugar/pintor-de-vistas.service';

/**
 * Patrón Facade: junta la biblioteca y el pintor para dar a la pantalla de avance el escenario de un lugar y la imagen de cada
 * sala como señales. Se provee por componente. Las dependencias se piden al cargar y no al construir: si la biblioteca no
 * está (pruebas sin red) o falla, la maqueta sigue con sus huecos y el avance funciona igual.
 */
@Injectable()
export class VistasDelLugar {
  private readonly injector = inject(Injector);
  private pedido: string | null = null;
  readonly escenario = signal<Escenario | null>(null);
  readonly vistas = signal<Record<string, string | null>>({});

  /** Lee el lugar una sola vez y pinta sus salas una por una. */
  async cargar(lugarId: string): Promise<void> {
    if (!lugarId || this.pedido === lugarId) return;
    this.pedido = lugarId;
    try {
      const e = await this.injector.get(BibliotecaService).escenario(lugarId);
      this.escenario.set(e);
      const pintor = this.injector.get(PintorDeVistas);
      for (const s of e.salas) {
        const src = await pintor.vista(lugarId, s);
        this.vistas.update((v) => ({ ...v, [s.id]: src }));
      }
    } catch {
      // Sin el lugar, la maqueta muestra las escenas con su nombre y un hueco en vez del cuarto.
    }
  }
}
