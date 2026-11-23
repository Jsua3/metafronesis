import { Injectable, effect, inject, untracked } from '@angular/core';
import { MonoTypeOperatorFunction, defer, tap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { CatalogItem, SimulationAttemptState, StudentAttemptSummary } from '../models/simulation.model';
import { User } from '../models/user.model';

/**
 * Cuánto vale lo que se sabe del acceso a los casos. Pasado esto se vuelve a preguntar: el estudiante puede haber
 * terminado un caso en otra pestaña o la docente haber abierto una ventana de asignación.
 */
export const CASE_ACCESS_TTL_MS = 60_000;

/** El catálogo y el historial del estudiante, que juntos dicen si un caso está bloqueado y si tiene un intento abierto. */
export interface CaseAccessSnapshot {
  catalogo: CatalogItem[];
  historial: StudentAttemptSummary[];
}

/** Lo que la caché devuelve del acceso: lo guardado y cuándo llegó (`en`, en ms de `Date.now()`). */
export interface CachedCaseAccess extends CaseAccessSnapshot {
  en: number;
}

/**
 * El permiso para guardar lo que traiga una petición que sale AHORA: de quién es y en qué época de la caché salió. Una
 * respuesta que vuelve cuando la persona ya cambió (o la caché se vació) no se guarda.
 */
export interface CacheTicket {
  readonly dueno: number;
  readonly epoca: number;
}

interface Entry<T> {
  valor: T;
  en: number;
  dueno: number;
}

/**
 * Lo último que el servidor dijo del acceso del estudiante a sus casos, para no volver a preguntarlo en cada pantalla
 * (§4.4 de `DISENO.md`, pieza 1). Lo llenan Inicio, Casos y la Ficha; `caseUnlockedGuard` lo consulta antes de pedir
 * nada y, si está fresco, decide sin red. Guarda dos cosas, las dos con 60 s de vida:
 *
 * - el **acceso**: catálogo + historial (`acceso()`, `guardarAcceso`, `guardandoAcceso()`);
 * - el **intento abierto** por versión del caso (`intentoAbierto(id)`, `guardarIntentoAbierto`, `guardandoIntentoAbierto(id)`):
 *   `null` guardado significa «sé que no hay»; `undefined` al leer, «no sé».
 *
 * **Dueño de sesión** (Codex, hallazgo 4; D-16). `AuthService.logout()` navega sin recargar, así que este servicio raíz
 * sobrevive al cambio de cuenta: en un computador del aula, B heredaría durante 60 s el catálogo, el historial y el intento
 * abierto de A. Por eso cada entrada recuerda el `id` de quien la llenó y:
 *
 * 1. al leer, si la persona actual no es la dueña (o no hay sesión), se vacía todo y se responde «no sé»;
 * 2. un `effect` sobre `currentUser` vacía todo y sube la `epoca` al cerrar sesión o cambiar de cuenta, para no dejar en
 *    memoria lo de la persona anterior;
 * 3. una respuesta que salió antes de ese cambio no se guarda: su `CacheTicket` es de otra época o de otra persona.
 *
 * **Nunca decide nada destructivo.** Solo sirve para que la guarda informe sin esperar y para pintar antes; el servidor
 * sigue siendo la autoridad al empezar un intento. Reemplazar un intento lo decide `simulation-play` con una lectura fresca
 * de `getActiveAttempt` (DP-26), nunca con esto.
 */
@Injectable({ providedIn: 'root' })
export class CaseAccessCache {
  private readonly auth = inject(AuthService);

  private accesoGuardado: Entry<CaseAccessSnapshot> | null = null;
  private readonly intentos = new Map<number, Entry<SimulationAttemptState | null>>();
  /**
   * La sesión de lo guardado, por identidad del objeto `User` y no solo por su `id`: cerrar sesión y volver a entrar crea un
   * objeto nuevo, y así A → cierre → A se nota aunque el effect no haya corrido entre los dos cambios (las señales solo
   * entregan el último valor). Un cambio de datos del mismo usuario también vacía: solo cuesta volver a preguntar.
   * `undefined`: todavía no se miró quién es.
   */
  private sesion: User | null | undefined;
  /** Sube con cada vaciado: una respuesta que salió antes no es de quien mira ahora. */
  private epoca = 0;

  constructor() {
    // El effect sigue a la persona aunque nadie lea: sin él, lo de A quedaría en memoria hasta la próxima lectura.
    effect(() => {
      const usuario = this.auth.currentUser();
      untracked(() => this.seguirA(usuario));
    });
  }

  /**
   * El permiso para guardar lo que traiga una petición que sale ahora, o `null` sin sesión (no hay a quién guardárselo).
   * Se pide ANTES de lanzar la petición: así una respuesta que vuelve después de un cambio de cuenta se reconoce y se tira.
   */
  ticket(): CacheTicket | null {
    const id = this.personaActual();
    return id === null ? null : { dueno: id, epoca: this.epoca };
  }

  /** El catálogo y el historial, si son de la persona actual y tienen menos de 60 s; si no, `null` («no sé»). */
  acceso(): CachedCaseAccess | null {
    const persona = this.personaActual();
    const entry = this.accesoGuardado;
    if (!entry || persona === null || entry.dueno !== persona || this.vencida(entry)) return null;
    return { ...entry.valor, en: entry.en };
  }

  /** Guarda el catálogo y el historial que trajo una petición. Se descarta si su `ticket` ya no vale. */
  guardarAcceso(ticket: CacheTicket | null, acceso: CaseAccessSnapshot): void {
    if (!this.vigente(ticket)) return;
    this.accesoGuardado = { valor: acceso, en: Date.now(), dueno: ticket.dueno };
  }

  /**
   * Operador para la petición del acceso: toma el `ticket` al suscribirse (cuando la petición sale de verdad) y guarda la
   * respuesta al llegar. Ejemplo: `forkJoin({ catalogo, historial }).pipe(cache.guardandoAcceso())`.
   */
  guardandoAcceso(): MonoTypeOperatorFunction<CaseAccessSnapshot> {
    return fuente => defer(() => {
      const ticket = this.ticket();
      return fuente.pipe(tap(acceso => this.guardarAcceso(ticket, acceso)));
    });
  }

  /**
   * El intento abierto de esa versión del caso: `undefined` si no se sabe (nunca se preguntó, venció o es de otra persona),
   * `null` si se sabe que no hay y el intento si lo hay.
   */
  intentoAbierto(caseVersionId: number): SimulationAttemptState | null | undefined {
    const persona = this.personaActual();
    const entry = this.intentos.get(caseVersionId);
    if (!entry || persona === null || entry.dueno !== persona) return undefined;
    if (this.vencida(entry)) {
      this.intentos.delete(caseVersionId);
      return undefined;
    }
    return entry.valor;
  }

  /** Guarda lo que respondió `getActiveAttempt` (el intento o `null`). Se descarta si su `ticket` ya no vale. */
  guardarIntentoAbierto(ticket: CacheTicket | null, caseVersionId: number, intento: SimulationAttemptState | null): void {
    if (!this.vigente(ticket)) return;
    this.intentos.set(caseVersionId, { valor: intento, en: Date.now(), dueno: ticket.dueno });
  }

  /** Operador para `getActiveAttempt(caseVersionId)`, como `guardandoAcceso()`. */
  guardandoIntentoAbierto(caseVersionId: number): MonoTypeOperatorFunction<SimulationAttemptState | null> {
    return fuente => defer(() => {
      const ticket = this.ticket();
      return fuente.pipe(tap(intento => this.guardarIntentoAbierto(ticket, caseVersionId, intento)));
    });
  }

  /**
   * Olvida lo que se sabía de un caso: su intento abierto y el acceso (el catálogo dice «terminado» y el historial lista
   * intentos, así que los dos cambian). Lo llama quien acaba de empezar, terminar o pausar un intento de ese caso.
   */
  olvidarCaso(caseVersionId: number): void {
    this.intentos.delete(caseVersionId);
    this.accesoGuardado = null;
    // Lo que ya salió a preguntar traería el estado de ANTES del cambio: se sube la época para descartarlo (Codex, BK-1).
    // Es global y no por caso: descartar de más solo cuesta volver a preguntar.
    this.epoca += 1;
  }

  /** Olvida todo y descarta lo que esté en camino. La caché lo hace sola al cambiar la persona; es pública para las pruebas y el cierre de sesión explícito. */
  vaciar(): void {
    this.accesoGuardado = null;
    this.intentos.clear();
    this.epoca += 1;
  }

  /** La persona de la sesión ahora; si cambió respecto de la dueña de lo guardado, se vacía antes de contestar. */
  private personaActual(): number | null {
    const usuario = this.auth.currentUser();
    this.seguirA(usuario);
    return usuario?.id ?? null;
  }

  private seguirA(usuario: User | null): void {
    if (this.sesion === usuario) return;
    // La primera vez (`undefined`) no hay nada guardado, pero subir la época igual es inocuo.
    this.vaciar();
    this.sesion = usuario;
  }

  private vigente(ticket: CacheTicket | null): ticket is CacheTicket {
    if (!ticket) return false;
    // Se mira la persona AHORA (no solo la época): el effect puede no haber corrido todavía cuando llega la respuesta.
    return this.personaActual() === ticket.dueno && ticket.epoca === this.epoca;
  }

  private vencida(entry: Entry<unknown>): boolean {
    return Date.now() - entry.en >= CASE_ACCESS_TTL_MS;
  }
}
