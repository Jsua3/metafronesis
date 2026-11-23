import { HttpErrorResponse } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Registro del consentimiento al aviso de contenido (ETH-01; plan visual F6-2). Desde S3-2b (F10-8†) el consentimiento
 * se registra en el SERVIDOR (`ServerConsentRecorder`, evidencia: ETH-01, SIEP-RF-05) detrás de esta misma interfaz: la
 * pantalla de juego no se rehízo. `SessionConsentRecorder` (solo la pestaña) sigue existiendo para las pruebas.
 *
 * La regla que no se negocia: un almacenamiento o una red que falla NUNCA da el consentimiento por registrado, y una
 * lectura que falla es «sin consentimiento» (se vuelve a pedir). Sin consentimiento no hay mundo, HUD ni audio.
 */
export interface ConsentRecorder {
  /** ¿Hay consentimiento registrado para esta clave? Síncrona. Una lectura que falla es «no». */
  isGiven(key: string): boolean;
  /** Lo mismo, por versión del caso y sin intento (la ficha). Opcional: un registro sin ella hace que la ficha lo pida. */
  isGivenForCase?(caseVersionId: number): boolean;
  /** Registra el consentimiento de la versión del caso, sin intento (la ficha). Se cumple y se rechaza como `record`. */
  recordForCase?(caseVersionId: number): PromiseLike<void>;
  /**
   * Registra el consentimiento. Se cumple cuando QUEDÓ guardado (el servidor respondió; el local, leyéndolo de vuelta) y
   * se rechaza si no se pudo: quien lo pide muestra el error con «Reintentar» y no arranca nada.
   */
  record(key: string): PromiseLike<void>;
  /**
   * OPCIONAL (S3-2b). Pregunta al servidor si la persona ya aceptó el aviso vigente de esa versión del caso, para llenar
   * lo que `isGiven` consulta de forma síncrona (otro navegador, otra sesión). NUNCA se rechaza. Antes de preguntar
   * OLVIDA lo que se sabía de ese caso (S7-2: podía ser de otra persona de la misma pestaña): una lectura que falla o que
   * tarda deja «no se sabe», o sea, se pide el aviso.
   */
  prime?(caseVersionId: number): PromiseLike<void>;
  /**
   * OPCIONAL (S3-2b). El servidor respondió 403 `CONSENT_REQUIRED` (consentimiento retirado en otra pestaña, o aviso de
   * otra versión): lo que se sabía de ese caso deja de valer y `isGiven` vuelve a ser «no» hasta aceptar de nuevo.
   */
  forget?(key: string): void;
}

/**
 * La versión del aviso de contenido que ESTE cliente muestra (S3-2b). La vigente la manda el servidor
 * (`SIEP_CONTENT_NOTICE_VERSION`): al aceptar se envía esta y, si no coincide, el servidor responde 409
 * `NOTICE_VERSION_STALE` y no se registra nada. Repite el valor por defecto del servidor
 * (`backend_django/psychosim/settings/base.py`): una prueba de contrato las compara, así que se cambian juntas. Es un
 * BORRADOR hasta que Psicología apruebe el texto del aviso.
 */
export const CONTENT_NOTICE_VERSION = '2026-10-borrador';

const KEY_PREFIX = 'siep_case_consent_';
const KEY_PATTERN = /^siep_case_consent_([1-9]\d*)_(.+)$/;

/** La clave de `sessionStorage` del consentimiento de un intento. La pantalla de juego la arma así desde siempre. */
export function consentStorageKey(caseVersionId: number, attemptId: string): string {
  return `${KEY_PREFIX}${caseVersionId}_${attemptId}`;
}

/** Inversa de {@link consentStorageKey}: de qué versión del caso y de qué intento es la clave, o `null` si no es de un intento. */
export function parseConsentStorageKey(key: string): { caseVersionId: number; attemptId: string } | null {
  const match = KEY_PATTERN.exec(key);
  return match ? { caseVersionId: Number(match[1]), attemptId: match[2] } : null;
}

/** Valor de la marca por intento que deja el registro en la pestaña. */
const GIVEN = 'given';
/** Código estable del 409 con el que el servidor dice que el aviso enviado no es el vigente. */
const NOTICE_VERSION_STALE = 'NOTICE_VERSION_STALE';

/**
 * El servidor tiene un aviso de otra versión (409 `NOTICE_VERSION_STALE`): no se registra el consentimiento a un aviso que
 * la persona no leyó. La pantalla de juego dice que hay una versión nueva y que se recargue la página.
 */
export class ConsentNoticeStaleError extends Error {
  constructor(readonly currentNoticeVersion: string | null) {
    super('El aviso de contenido cambió de versión en el servidor.');
    this.name = 'ConsentNoticeStaleError';
  }
}

/** Implementación local: `sessionStorage`, con cada acceso protegido (modo privado, política, cuota). */
export class SessionConsentRecorder implements ConsentRecorder {
  isGivenForCase(caseVersionId: number): boolean {
    return this.isGiven(consentStorageKey(caseVersionId, 'case'));
  }

  recordForCase(caseVersionId: number): Promise<void> {
    return this.record(consentStorageKey(caseVersionId, 'case'));
  }

  isGiven(key: string): boolean {
    try {
      return sessionStorage.getItem(key) === GIVEN;
    } catch {
      return false;
    }
  }

  async record(key: string): Promise<void> {
    sessionStorage.setItem(key, GIVEN);
    // Una escritura que se pierde en silencio (cuota, almacenamiento de solo lectura) no cuenta como registrada.
    if (sessionStorage.getItem(key) !== GIVEN) throw new Error('El consentimiento no quedó registrado.');
  }
}

/**
 * Quién es la persona de la sesión: su id, o `null` sin sesión. Lo entrega quien arma el registro (el token
 * `CONSENT_RECORDER` lo lee de `AuthService`): este archivo no obliga a `core/auth` a saber que el simulador existe.
 */
export type CurrentPersonId = () => number | null;

/**
 * Implementación en el servidor (S3-2b): `GET/POST/DELETE /api/simulation/cases/{caseVersionId}/consent`.
 *
 * - `isGiven` sigue siendo síncrona: consulta lo último que el SERVIDOR dijo de esa versión del caso (al leer con `prime`,
 *   al aceptar, al retirar o al responder 403) y, solo si no lo sabe (la red del GET falló), la marca de la pestaña por
 *   intento, para no pedir el aviso dos veces en la misma sesión.
 * - `record` se cumple SOLO cuando el servidor responde 200 o 201; nada se marca antes ni si algo falla.
 * - El consentimiento es de la persona y de la versión del caso, no de un intento: otro intento del mismo caso lo comparte.
 * - S7-2: el registro es UNO por pestaña y `logout()` navega sin recargar, así que lo que se sabe es de la persona que
 *   estaba en sesión. Si cambia (sale A, entra B), se olvida todo antes de contestar o de preguntar; y `prime` olvida lo del
 *   caso que va a preguntar, para que una lectura que falla o tarda nunca devuelva lo de otra persona.
 */
export class ServerConsentRecorder implements ConsentRecorder {
  /** Lo último que el servidor dijo, por versión del caso: aceptado (`true`) o no (`false`). Ausente: no se sabe. */
  private readonly known = new Map<number, boolean>();
  /** De quién es lo que `known` guarda (S7-2). `undefined`: todavía no se miró quién es. */
  private owner: number | null | undefined;
  /** Cuenta los olvidos totales: una respuesta que salió antes de olvidar no es de quien mira ahora y no se guarda. */
  private epoch = 0;

  constructor(
    private readonly api: Pick<SimulationService, 'getConsent' | 'acceptConsent' | 'withdrawConsent'>,
    private readonly currentPersonId: CurrentPersonId = () => null,
  ) {}

  /**
   * Olvida todo lo que se sabía del servidor, de todos los casos, y descarta lo que esté en camino (S7-2). No toca las
   * marcas de la pestaña: son por intento y el intento de una persona no puede ser el de otra. La llama el propio registro
   * al ver que cambió la persona de la sesión; es pública para quien necesite olvidar a mano.
   */
  reset(): void {
    this.known.clear();
    this.epoch += 1;
  }

  isGiven(key: string): boolean {
    this.followPerson();
    const parsed = parseConsentStorageKey(key);
    if (!parsed) return false;
    return this.known.get(parsed.caseVersionId) ?? this.hasMark(key);
  }

  /**
   * ¿La persona de la sesión ya aceptó el aviso vigente de esta versión del caso? Para la ficha, donde todavía no hay
   * intento (y por eso no mira la marca de la pestaña, que es por intento). Sigue a la persona como `isGiven` (S7-2):
   * en la misma pestaña, B nunca ve el consentimiento de A.
   */
  isGivenForCase(caseVersionId: number): boolean {
    this.followPerson();
    return this.known.get(caseVersionId) === true;
  }

  /**
   * Registra el consentimiento de la versión del caso, sin intento (la ficha, DISENO §4.3). Se cumple solo con el 200/201
   * del servidor y si la persona sigue siendo la misma: si cambió mientras la petición viajaba, se rechaza («la sesión
   * cambió») y nada queda «sabido» para la persona nueva. El 409 de versión vieja se traduce a `ConsentNoticeStaleError`.
   */
  async recordForCase(caseVersionId: number): Promise<void> {
    this.followPerson();
    const epoch = this.epoch;
    try {
      await firstValueFrom(this.api.acceptConsent(caseVersionId, CONTENT_NOTICE_VERSION));
    } catch (cause) {
      const stale = staleNoticeVersionOf(cause);
      if (stale !== undefined) throw new ConsentNoticeStaleError(stale);
      throw new Error('No se pudo registrar el consentimiento en el servidor.', { cause });
    }
    // La cuenta puede cambiar sin que otra operación toque el registro mientras la petición viaja.
    this.followPerson();
    if (epoch !== this.epoch) throw new Error('La sesión cambió mientras se registraba el consentimiento.');
    this.known.set(caseVersionId, true);
  }

  async prime(caseVersionId: number): Promise<void> {
    this.followPerson();
    // S7-2: lo que se sabía de ESTE caso puede ser de otra persona o estar vencido. Se olvida ANTES de preguntar, así una
    // lectura que falla o que nunca responde deja «no se sabe» (se pide el aviso) y no el `true` de otro.
    this.known.delete(caseVersionId);
    const epoch = this.epoch;
    try {
      const state = await firstValueFrom(this.api.getConsent(caseVersionId));
      // Solo un `true` estricto es «aceptado»: una respuesta rara es «sin consentimiento». Si en el camino se olvidó todo
      // (cambió la persona), la respuesta no es de quien mira ahora.
      this.followPerson();
      const accepted = state.accepted === true;
      if (epoch === this.epoch) this.known.set(caseVersionId, accepted);
    } catch {
      // Una lectura que falla no es un error de pantalla: no se sabe nada y se pide el aviso.
    }
  }

  /**
   * Lo mismo que `recordForCase` (una sola implementación de la regla: persona, época y 409) y, después, la marca de la
   * pestaña de ESE intento, que es un respaldo de mejor esfuerzo por si una lectura posterior falla.
   */
  async record(key: string): Promise<void> {
    this.followPerson();
    const parsed = parseConsentStorageKey(key);
    if (!parsed) throw new Error('La clave del consentimiento no es de un intento.');
    await this.recordForCase(parsed.caseVersionId);
    this.writeMark(key);
  }

  forget(key: string): void {
    this.followPerson();
    const parsed = parseConsentStorageKey(key);
    if (!parsed) return;
    this.known.set(parsed.caseVersionId, false);
    this.removeMark(key);
  }

  /** Retira el consentimiento de esa versión del caso en el servidor (idempotente). La interfaz para pedirlo no existe todavía. */
  async withdraw(caseVersionId: number): Promise<void> {
    this.followPerson();
    try {
      await firstValueFrom(this.api.withdrawConsent(caseVersionId));
    } catch (cause) {
      throw new Error('No se pudo retirar el consentimiento en el servidor.', { cause });
    }
    this.known.set(caseVersionId, false);
    this.removeMarksOf(caseVersionId);
  }

  /**
   * Lo que se sabe es de UNA persona: si la de la sesión cambió desde la última vez (sale A, entra B sin recargar la
   * página) se olvida todo. Un lector que lanza cuenta como «sin sesión»: olvidar de más solo vuelve a pedir el aviso,
   * nunca da un consentimiento por registrado.
   */
  private followPerson(): void {
    let person: number | null;
    try {
      person = this.currentPersonId();
    } catch {
      person = null;
    }
    if (this.owner === undefined) {
      this.owner = person;
      return;
    }
    if (Object.is(person, this.owner)) return;
    this.owner = person;
    this.reset();
  }

  private hasMark(key: string): boolean {
    try {
      return sessionStorage.getItem(key) === GIVEN;
    } catch {
      return false;
    }
  }

  private writeMark(key: string): void {
    try {
      sessionStorage.setItem(key, GIVEN);
    } catch {
      // Sin almacenamiento la marca no se guarda: el registro del servidor ya vale. Solo se pierde el respaldo.
    }
  }

  private removeMark(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Lo que se sabe en memoria ya es «no»; una marca que no se pudo borrar no se lee mientras tanto.
    }
  }

  /** Las marcas de todos los intentos de esa versión del caso (el `_` final evita tomar el caso 77 por el 7). */
  private removeMarksOf(caseVersionId: number): void {
    try {
      const prefix = `${KEY_PREFIX}${caseVersionId}_`;
      const marks: string[] = [];
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(prefix)) marks.push(key);
      }
      for (const key of marks) sessionStorage.removeItem(key);
    } catch {
      // Ídem: la memoria ya dice «no».
    }
  }
}

/** Si el error es el 409 `NOTICE_VERSION_STALE`, la versión vigente que trae (o `null` si no la trae); si no, `undefined`. */
function staleNoticeVersionOf(cause: unknown): string | null | undefined {
  if (!(cause instanceof HttpErrorResponse) || cause.status !== 409) return undefined;
  const body = cause.error as { code?: unknown; noticeVersion?: unknown } | null;
  if (body?.code !== NOTICE_VERSION_STALE) return undefined;
  return typeof body.noticeVersion === 'string' ? body.noticeVersion : null;
}

export const CONSENT_RECORDER = new InjectionToken<ConsentRecorder>('CONSENT_RECORDER', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthService);
    // S7-2: el registro vive toda la pestaña y `logout()` no la recarga: sigue a la persona de la sesión (solo la lee, como
    // ya hace `CachedSimulationService`) para que el consentimiento «sabido» de quien salió no valga para quien entra.
    return new ServerConsentRecorder(inject(SimulationService), () => auth.currentUser()?.id ?? null);
  },
});
