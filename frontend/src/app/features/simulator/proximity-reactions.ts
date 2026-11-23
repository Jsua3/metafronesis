/**
 * Reacciones al acercarse y al explorar (4.3.7 y 4.6 del plan del bloque B): cuando el estudiante llega junto a una persona
 * ella lo mira (la consultante, según su activación, se aparta o se agita) y, si el documento trae un comentario pendiente
 * para ella, lo dice en una burbuja; al revisar un objeto, quienes están cerca lo miran. Clase sin Angular ni Phaser: la
 * pantalla la cablea con el mundo real y esta prueba la ejerce con un reloj falso.
 */
import type { Activation, WorldComment } from '../../core/models/simulation.model';
import { ESPERA_REPETIR_MS, conComentario, reaccionAlAcercarse } from './caso/cercania';
import { DURACION_BURBUJA_MS, MemoriaComentarios, siguienteComentario } from './caso/comentarios';
import type { Gesto } from './caso/vocabulario';

/** Las personas a esta distancia (px de sala) de un objeto revisado lo miran. */
export const RADIO_MIRAR_PX = 160;
/** Primera fila del orden de recorte (6): con `false` las personas no miran lo que el estudiante revisa. */
export const MIRAR_LO_REVISADO = true;

/** Lo que esta clase necesita del mundo del juego (lo cumple `GameWorldComponent` más `isPerson`). */
export interface MundoCercania {
  faceTowards(key: string, target: 'player' | string): void;
  /** El gesto automático al acercarse pasa `{ mark: false }`: `data-reaction` es solo de la reacción a una decisión. */
  playGesture(key: string, gesto: Gesto, options?: { mark?: boolean }): Promise<void>;
  peopleNear(key: string, r: number): string[];
  isKeyPerson(key: string): boolean;
  /** ¿Es una persona (marcador PERSON o `npc:`)? Los objetos no reaccionan. */
  isPerson(key: string): boolean;
}

export interface BurbujaVisible { comment: WorldComment; objectKey: string }

export interface RelojReacciones {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(h: number): void;
}

/** El reloj de la ventana (para la pantalla; las pruebas pasan uno falso). */
export const RELOJ_DE_VENTANA: RelojReacciones = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: h => window.clearTimeout(h),
};

const NPC_PREFIX = 'npc:';

export class ProximityReactions {
  private comments: readonly WorldComment[] = [];
  private activation: Activation = 'CALM';
  private blocked = false;
  /** La persona junto a la que está el estudiante ahora (o `null`). */
  private cercano: string | null = null;
  /** La persona que ya reaccionó en este acercamiento: los eventos de cercanía llegan muchas veces por segundo. */
  private atendido: string | null = null;
  private burbuja: BurbujaVisible | null = null;
  private temporizador: number | null = null;
  /** Cuándo reaccionó (o se le fue la burbuja) cada persona por última vez. */
  private readonly ultima = new Map<string, number>();

  constructor(
    private readonly mundo: MundoCercania,
    private readonly memoria: MemoriaComentarios,
    private readonly reloj: RelojReacciones,
    private readonly alCambiar: (b: BurbujaVisible | null) => void,
  ) {}

  setComments(comments: readonly WorldComment[]): void { this.comments = comments; }

  setActivation(a: Activation): void { this.activation = a; }

  /** Con el panel de respuestas, la secuencia o una superposición abierta no reacciona nadie; al bloquearse, la burbuja se va. */
  setBlocked(blocked: boolean): void {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    if (blocked) this.cerrarBurbuja();
    else this.intentar();   // lo que esperaba (un comentario pendiente) se dice al cerrarse el panel
  }

  onProximity(key: string | null): void {
    if (key !== this.cercano) {
      this.cerrarBurbuja();
      this.cercano = key;
      this.atendido = null;
    }
    this.intentar();
  }

  /** Quienes están cerca de un objeto revisado lo miran. */
  onInspected(objectKey: string): void {
    if (!MIRAR_LO_REVISADO) return;
    for (const persona of this.mundo.peopleNear(objectKey, RADIO_MIRAR_PX)) this.mundo.faceTowards(persona, objectKey);
  }

  dispose(): void {
    if (this.temporizador !== null) this.reloj.clearTimeout(this.temporizador);
    this.temporizador = null;
    if (!this.burbuja) return;
    this.burbuja = null;
    this.alCambiar(null);   // quien la pintaba (la señal de la pantalla) no puede quedarse con la vieja
  }

  private intentar(): void {
    const key = this.cercano;
    if (key === null || this.blocked || this.atendido === key) return;
    if (!key.startsWith(NPC_PREFIX) && !this.mundo.isPerson(key)) return;
    this.atendido = key;
    const base = reaccionAlAcercarse({ esConsultante: this.mundo.isKeyPerson(key), activation: this.activation });
    const comentario = siguienteComentario(this.comments, key, this.memoria.dichos());
    if (comentario) {
      this.memoria.marcar(comentario.id);
      this.abrirBurbuja({ comment: comentario, objectKey: key });
    } else {
      const ahora = this.reloj.now();
      const antes = this.ultima.get(key);
      if (antes !== undefined && ahora - antes < ESPERA_REPETIR_MS) return;
      this.ultima.set(key, ahora);
    }
    const reaccion = comentario ? conComentario(base, comentario) : base;
    if (reaccion.mirar) this.mundo.faceTowards(key, 'player');
    if (reaccion.gesto) void this.mundo.playGesture(key, reaccion.gesto, { mark: false });
  }

  private abrirBurbuja(b: BurbujaVisible): void {
    this.burbuja = b;
    this.alCambiar(b);
    this.temporizador = this.reloj.setTimeout(() => this.cerrarBurbuja(), DURACION_BURBUJA_MS);
  }

  private cerrarBurbuja(): void {
    if (this.temporizador !== null) this.reloj.clearTimeout(this.temporizador);
    this.temporizador = null;
    const b = this.burbuja;
    if (!b) return;
    this.burbuja = null;
    this.ultima.set(b.objectKey, this.reloj.now());   // la espera para repetir cuenta desde que la persona terminó
    this.alCambiar(null);
  }
}

/** Mitad del ancho máximo de la burbuja (260 px) y su alto con la cola: lo que hay que dejar libre en cada borde. */
const BURBUJA_MEDIO_ANCHO_PX = 135;
const BURBUJA_ALTO_PX = 100;
const BURBUJA_MARGEN_PX = 8;

/**
 * Acota el ancla de la burbuja (la punta bajo ella, sobre la cabeza) para que no se recorte en los bordes del lienzo.
 * Un ancho menor que la burbuja la deja centrada. Sin tamaño conocido (0), no toca nada.
 */
export function acotarAncla(
  ancla: { x: number; y: number }, lienzo: { ancho: number; alto: number },
): { x: number; y: number } {
  if (lienzo.ancho <= 0 || lienzo.alto <= 0) return ancla;
  const medio = Math.min(BURBUJA_MEDIO_ANCHO_PX, lienzo.ancho / 2);
  const x = Math.min(Math.max(ancla.x, medio), lienzo.ancho - medio);
  const y = Math.min(Math.max(ancla.y, BURBUJA_ALTO_PX), lienzo.alto - BURBUJA_MARGEN_PX);
  return { x, y };
}
