/**
 * El reloj de la cinemática: en qué plano va, cuánto lleva de él y si está en pausa. Puro (sin DOM ni temporizadores):
 * el componente le pasa el tiempo de cada cuadro con `avanzar(dt)` y él dice si cambió de plano o si terminó. Así el ritmo
 * (duraciones, saltos, pausa) se prueba sin pintar nada.
 */
export type Paso = 'sigue' | 'cambio' | 'fin';

export class RelojDeCinematica {
  private i = 0;
  private ms = 0;
  private enPausa = false;
  private acabada = false;

  constructor(private readonly duraciones: readonly number[]) {}

  get indice(): number { return this.i; }
  /** Milisegundos del plano actual. */
  get transcurrido(): number { return this.ms; }
  get pausada(): boolean { return this.enPausa; }
  get terminada(): boolean { return this.acabada; }
  get total(): number { return this.duraciones.length; }
  /** Lo que dura el plano actual. */
  get duracion(): number { return this.duraciones[this.i] ?? 0; }
  /** De 0 a 1: cuánto va del plano actual. */
  get progreso(): number { return this.duracion > 0 ? Math.min(1, this.ms / this.duracion) : 1; }

  /** Suma `dt` ms al plano (nada si está en pausa o terminada). Un `dt` enorme (pestaña dormida) cambia de a un plano. */
  avanzar(dt: number): Paso {
    if (this.acabada || !this.duraciones.length) return this.terminar();
    if (this.enPausa || !(dt > 0)) return 'sigue';
    this.ms += dt;
    if (this.ms < this.duracion) return 'sigue';
    return this.siguiente();
  }

  /** Pasa al plano siguiente; en el último, termina. */
  siguiente(): Paso {
    if (this.acabada) return 'fin';
    if (this.i + 1 >= this.duraciones.length) return this.terminar();
    this.i++;
    this.ms = 0;
    return 'cambio';
  }

  /** Vuelve al comienzo del plano anterior (o al del primero). */
  anterior(): Paso {
    if (this.acabada) return 'fin';
    this.i = Math.max(0, this.i - 1);
    this.ms = 0;
    return 'cambio';
  }

  pausar(): void { if (!this.acabada) this.enPausa = true; }
  reanudar(): void { this.enPausa = false; }
  alternarPausa(): boolean {
    if (this.enPausa) this.reanudar();
    else this.pausar();
    return this.enPausa;
  }

  private terminar(): Paso {
    this.acabada = true;
    this.enPausa = false;
    return 'fin';
  }
}
