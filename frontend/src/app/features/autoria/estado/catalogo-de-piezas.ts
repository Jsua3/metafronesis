import { Injectable, inject, signal } from '@angular/core';

import type { ManifiestoDePiezas } from '../../simulator/sala/catalogo';
import { AutoriaApiService } from '../api/autoria-api.service';
import { catalogoDeReglas, type CatalogoDeReglas } from '../modelo/reglas-de-sala';

export interface CategoriaDePaleta {
  clave: 'puertas' | 'ventanas' | 'muro' | 'lamparas' | 'objetos';
  nombre: string;
  modelos: { tipo: string; modelo: string; nombre: string; muros: readonly string[] }[];
}

@Injectable({ providedIn: 'root' })
export class CatalogoDePiezas {
  private readonly api = inject(AutoriaApiService);
  private readonly manifiestoEstado = signal<ManifiestoDePiezas | null>(null);
  private readonly reglasEstado = signal<CatalogoDeReglas | null>(null);
  private readonly errorEstado = signal(false);
  readonly manifiesto = this.manifiestoEstado.asReadonly();
  readonly reglas = this.reglasEstado.asReadonly();
  readonly error = this.errorEstado.asReadonly();

  constructor() {
    this.cargar();
  }

  reintentar(): void {
    if (!this.errorEstado()) return;
    this.errorEstado.set(false);
    this.cargar();
  }

  private cargar(): void {
    void this.api.manifiestoDePiezas().then((manifiesto) => {
      const reglas = catalogoDeReglas(manifiesto);
      this.manifiestoEstado.set(manifiesto);
      this.reglasEstado.set(reglas);
    }).catch(() => this.errorEstado.set(true));
  }

  paleta(): CategoriaDePaleta[] {
    const categorias: CategoriaDePaleta[] = [
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      { clave: 'puertas', nombre: 'Puertas', modelos: [] },
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      { clave: 'ventanas', nombre: 'Ventanas', modelos: [] },
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      { clave: 'muro', nombre: 'Muro', modelos: [] },
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      { clave: 'lamparas', nombre: 'Lámparas', modelos: [] },
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      { clave: 'objetos', nombre: 'Objetos', modelos: [] },
    ];
    for (const [clave, ficha] of Object.entries(this.manifiesto()?.piezas ?? {})) {
      const [tipo, modelo] = clave.split('/');
      if (!tipo || !modelo) continue;
      const categoria = tipo === 'puerta' ? categorias[0] : tipo === 'ventana' ? categorias[1]
        : tipo === 'lampara' ? categorias[3] : ficha.muros.some((muro) => muro !== 'suelo') ? categorias[2] : null;
      categoria?.modelos.push({ tipo, modelo, nombre: ficha.nombre, muros: ficha.muros });
    }
    return categorias;
  }

  acabados(): { pisos: { piso: string; variantes: string[] }[]; muros: { muro: string; paletas: string[] }[] } {
    const pisos = new Map<string, string[]>(), muros = new Map<string, string[]>();
    const agrupar = (tabla: Map<string, string[]>, clave: string, separador: string) => {
      const corte = clave.indexOf(separador);
      if (corte < 1 || corte === clave.length - 1) return;
      const nombre = clave.slice(0, corte), variante = clave.slice(corte + 1);
      const grupo = tabla.get(nombre) ?? [];
      grupo.push(variante);
      tabla.set(nombre, grupo);
    };
    for (const clave of Object.keys(this.manifiesto()?.pisos ?? {})) agrupar(pisos, clave, '-');
    for (const clave of Object.keys(this.manifiesto()?.muros ?? {})) agrupar(muros, clave, '/');
    return {
      pisos: Array.from(pisos, ([piso, variantes]) => ({ piso, variantes })),
      muros: Array.from(muros, ([muro, paletas]) => ({ muro, paletas })),
    };
  }
}
