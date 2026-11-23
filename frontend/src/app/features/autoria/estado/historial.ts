/** Cuántos estados guarda el historial (el más viejo se olvida). */
export const MAXIMO_ESTADOS = 100;

/**
 * Historial lineal para deshacer y rehacer. Guarda estados completos (el caso es pequeño)
 * y descarta lo rehacible en cuanto se hace algo nuevo.
 */
export class Historial<T> {
  private estados: T[];
  private indice = 0;

  constructor(inicial: T) {
    this.estados = [inicial];
  }

  get actual(): T {
    return this.estados[this.indice];
  }

  get puedeDeshacer(): boolean {
    return this.indice > 0;
  }

  get puedeRehacer(): boolean {
    return this.indice < this.estados.length - 1;
  }

  /** Olvida todo y empieza desde este estado. */
  empezar(estado: T): void {
    this.estados = [estado];
    this.indice = 0;
  }

  hacer(estado: T): void {
    this.estados = this.estados.slice(0, this.indice + 1);
    this.estados.push(estado);
    if (this.estados.length > MAXIMO_ESTADOS) this.estados.splice(0, this.estados.length - MAXIMO_ESTADOS);
    this.indice = this.estados.length - 1;
  }

  deshacer(): T | null {
    if (!this.puedeDeshacer) return null;
    this.indice--;
    return this.actual;
  }

  rehacer(): T | null {
    if (!this.puedeRehacer) return null;
    this.indice++;
    return this.actual;
  }
}
