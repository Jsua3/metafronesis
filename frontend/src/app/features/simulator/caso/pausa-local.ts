/**
 * Pausa local y reintentos al volver la red (V3, REGLA-004): la salida segura saca a la persona en el acto, con o sin red;
 * registrarla en el servidor es un asunto aparte que se reintenta hasta lograrlo. Módulo puro: sin Angular ni Phaser; el
 * reloj y la red entran por `EntornoDeRed`, así las pruebas los mueven a mano. Nada de esto mira la clasificación.
 */
import { HttpErrorResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';

import type { AlmacenSimple } from './robustez';

/** Espera antes del reintento número `fallos` (1 = el primer fallo): 2, 4, 8, 16 s y, de ahí, 30 s. */
export function esperaDeSincronizacion(fallos: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, fallos - 1));
}

/** Qué hacer con una pausa que no se pudo registrar: volver a intentar, o consultar el intento (un 4xx no basta para darla por perdida). */
export type VeredictoDePausa = 'reintentar' | 'consultar';

export function veredictoDeFalloDePausa(err: unknown): VeredictoDePausa {
  return err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500 ? 'consultar' : 'reintentar';
}

/** El reloj y la red de la ventana, por la puerta de atrás para poder probarlos. */
export interface EntornoDeRed {
  /** Programa la acción; devuelve cómo cancelarla. */
  esperar(accion: () => void, ms: number): () => void;
  /** Escucha el regreso de la conexión; devuelve cómo dejar de escuchar. */
  alVolverLaRed(accion: () => void): () => void;
}

export const ENTORNO_DEL_NAVEGADOR: EntornoDeRed = {
  esperar: (accion, ms) => {
    const id = window.setTimeout(accion, ms);
    return () => window.clearTimeout(id);
  },
  alVolverLaRed: accion => {
    window.addEventListener('online', accion);
    return () => window.removeEventListener('online', accion);
  },
};

/** Una acción que se repite tras una espera o, antes, en cuanto vuelve la conexión. Se dispara una vez y se desarma. */
export class ReintentoAlVolver {
  private cancelarEspera: (() => void) | null = null;
  private soltarOyente: (() => void) | null = null;
  private cerrado = false;

  constructor(private readonly accion: () => void, private readonly entorno: EntornoDeRed = ENTORNO_DEL_NAVEGADOR) {}

  get armado(): boolean {
    return this.soltarOyente !== null;
  }

  /** Arma el reintento: tras `esperaMs` (si hay) o al volver la red, lo que ocurra primero. Rearmar reemplaza la espera. */
  armar(esperaMs: number | null): void {
    if (this.cerrado) return;
    this.cancelarEspera?.();
    this.cancelarEspera = esperaMs === null ? null : this.entorno.esperar(() => this.disparar(), esperaMs);
    this.soltarOyente ??= this.entorno.alVolverLaRed(() => this.disparar());
  }

  cancelar(): void {
    this.cancelarEspera?.();
    this.soltarOyente?.();
    this.cancelarEspera = null;
    this.soltarOyente = null;
  }

  /** Cierre definitivo (la pantalla se destruyó): nada puede volver a armarlo, ni siquiera un fallo en vuelo que llegue tarde. */
  cerrar(): void {
    this.cerrado = true;
    this.cancelar();
  }

  private disparar(): void {
    this.cancelar();
    this.accion();
  }
}

/** Lo que la pantalla le presta a la pausa pendiente. */
export interface PuertoDePausa<T extends { status: string }> {
  /** Pide la salida segura al servidor con el intento vigente. */
  enviar(): Observable<T>;
  /** Lee el intento tal como lo tiene el servidor. */
  consultar(): Observable<T>;
  /** Mientras una decisión viaja, la pausa espera su respuesta: así el servidor aplica la decisión y luego la pausa. */
  decisionEnVuelo(): boolean;
  /** El servidor ya tiene la pausa (o el estado que la reemplazó): se adopta. */
  alRegistrar(servidor: T): void;
  /** Un envío o una consulta falló. `seguir` continúa con el reintento; no llamarlo lo detiene (p. ej. el ensayo ya no existe). */
  alFallar(err: unknown, seguir: () => void): void;
  /** La pausa no se pudo registrar (cada fallo, con su número y su causa): la pantalla de pausa lo dice con una línea discreta. */
  alQuedarPendiente(fallos: number, err: unknown): void;
  /** El servidor rechaza la pausa de forma permanente (4xx que se repite tras consultar el intento): se deja de reintentar. */
  alRendirse(err: unknown): void;
}

/**
 * La pausa pedida por la persona y todavía sin registrar. Reintenta con espera creciente y, en el acto, al volver la red;
 * nunca la da por perdida. Un 4xx consulta el intento: si el servidor ya no lo tiene en curso se adopta lo que diga; si sigue
 * en curso se reenvía una vez.
 */
export class PausaPendiente<T extends { status: string }> {
  private pendiente = false;
  private enVuelo = false;
  private fallos = 0;
  private yaConsulto = false;
  private epoca = 0;
  private cerrada = false;
  private readonly reintento: ReintentoAlVolver;

  constructor(private readonly puerto: PuertoDePausa<T>, entorno: EntornoDeRed = ENTORNO_DEL_NAVEGADOR) {
    this.reintento = new ReintentoAlVolver(() => this.intentar(), entorno);
  }

  /** ¿Hay una pausa que el servidor todavía no vio? */
  get activa(): boolean {
    return this.pendiente;
  }

  iniciar(): void {
    if (this.cerrada) return;
    this.cancelar();
    this.pendiente = true;
    this.intentar();
  }

  /** Envía ya, si hay pausa pendiente, nada en vuelo y ninguna decisión viajando. Lo llaman el reintento, «Reanudar» y el fin de una decisión. */
  intentar(): void {
    if (!this.pendiente || this.enVuelo || this.puerto.decisionEnVuelo()) return;
    this.reintento.cancelar();
    const epoca = this.epoca;
    this.enVuelo = true;
    this.puerto.enviar().subscribe({
      next: servidor => { if (epoca === this.epoca) this.registrada(servidor); },
      error: err => { if (epoca === this.epoca) this.fallo(err); },
    });
  }

  cancelar(): void {
    this.epoca++;
    this.pendiente = false;
    this.enVuelo = false;
    this.fallos = 0;
    this.yaConsulto = false;
    this.reintento.cancelar();
  }

  /** Cierre definitivo al destruir la pantalla: apaga los reintentos y descarta toda respuesta posterior. */
  cerrar(): void {
    this.cerrada = true;
    this.cancelar();
    this.reintento.cerrar();
  }

  private registrada(servidor: T): void {
    this.cancelar();
    this.puerto.alRegistrar(servidor);
  }

  private fallo(err: unknown): void {
    this.enVuelo = false;
    this.fallos++;
    this.puerto.alFallar(err, () => {
      const consultar = veredictoDeFalloDePausa(err) === 'consultar';
      if (consultar && this.yaConsulto) { this.rendirse(err); return; }
      this.puerto.alQuedarPendiente(this.fallos, err);
      if (consultar) this.consultar();
      else this.esperar();
    });
  }

  private consultar(): void {
    this.yaConsulto = true;
    const epoca = this.epoca;
    this.enVuelo = true;
    this.puerto.consultar().subscribe({
      next: servidor => {
        if (epoca !== this.epoca) return;
        this.enVuelo = false;
        if (servidor.status === 'IN_PROGRESS') this.intentar();
        else this.registrada(servidor);
      },
      error: err => {
        if (epoca !== this.epoca) return;
        this.enVuelo = false;
        this.puerto.alFallar(err, () => (veredictoDeFalloDePausa(err) === 'consultar' ? this.rendirse(err) : this.esperar()));
      },
    });
  }

  /** Un 4xx permanente no se reintenta cada 30 s para siempre: se detiene y se dice. */
  private rendirse(err: unknown): void {
    this.cancelar();
    this.puerto.alRendirse(err);
  }

  private esperar(): void {
    this.reintento.armar(esperaDeSincronizacion(this.fallos));
  }
}

const claveMarca = (attemptId: string) => `siep_pausa_pendiente_${attemptId}`;

/** «Pausa sin registrar»: sobrevive a salir de la ruta, recargar o cerrar la pestaña. Lleva el id del intento, nunca el token. */
export function guardarMarcaDePausa(almacen: AlmacenSimple, attemptId: string): void {
  try { almacen.setItem(claveMarca(attemptId), JSON.stringify({ attemptId })); } catch { /* sin almacenamiento: el reintento en vivo sigue */ }
}

export function hayMarcaDePausa(almacen: AlmacenSimple, attemptId: string): boolean {
  try { return almacen.getItem(claveMarca(attemptId)) !== null; } catch { return false; }
}

export function borrarMarcaDePausa(almacen: AlmacenSimple, attemptId: string): void {
  try { almacen.removeItem(claveMarca(attemptId)); } catch { /* ídem */ }
}

/**
 * Al volver la red, ¿se reenvía sola la elección que no salió? Solo si la conversación de ESA elección sigue abierta, en el mismo
 * nodo, y la persona no abrió otra cosa: si no, se descarta en silencio (la intención queda para cuando vuelva a elegir). Con otra
 * petición en curso se espera.
 */
export function puedeReenviarEleccion(estado: {
  pendiente: { nodeId?: number; dialogueKey?: string } | null;
  intento: { status: string; nodeId: number } | null;
  dialogoAbierto: string | null;
  otraSuperposicion: boolean;
  ocupado: boolean;
}): 'reenviar' | 'esperar' | 'descartar' {
  const { pendiente, intento } = estado;
  if (!pendiente || !intento || intento.status !== 'IN_PROGRESS' || pendiente.nodeId !== intento.nodeId) return 'descartar';
  if (!pendiente.dialogueKey || estado.dialogoAbierto !== pendiente.dialogueKey || estado.otraSuperposicion) return 'descartar';
  return estado.ocupado ? 'esperar' : 'reenviar';
}
