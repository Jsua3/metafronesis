/**
 * Robustez del cliente del juego (R1): decisiones puras sobre plazos, reintentos, intención de decidir pendiente y
 * punto de lectura de un diálogo. La pantalla solo las cablea. Nada de esto mira la clasificación ni el puntaje.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

import { isConsentRequiredError } from '../../../core/api/api-error.util';

/** Plazo de toda acción del juego que habla con el servidor: pasado este tiempo la persona ve un aviso y reintenta. */
export const PLAZO_ACCION_MS = 15_000;

/** Intentos de guardar la posición tras un fallo, antes de avisar. */
export const REINTENTOS_DE_POSICION = 4;
const ESPERA_BASE_MS = 600;
const ESPERA_TOPE_MS = 8_000;

/** ¿El error es el plazo vencido de `timeout()`? */
export function esPlazoVencido(err: unknown): boolean {
  return err instanceof TimeoutError || (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError');
}

/** Espera creciente (600, 1200, 2400, … hasta 8 s) antes del reintento número `fallos` (1 = el primer fallo). */
export function esperaDeReintento(fallos: number): number {
  return Math.min(ESPERA_TOPE_MS, ESPERA_BASE_MS * 2 ** Math.max(0, fallos - 1));
}

export type PasoDeGuardado = { accion: 'reintentar'; esperaMs: number } | { accion: 'avisar' };

/** Tras `fallos` fallos seguidos al guardar la posición: reintentar con espera creciente o, agotados, avisar. */
export function pasoTrasFalloDeGuardado(fallos: number): PasoDeGuardado {
  return fallos >= REINTENTOS_DE_POSICION ? { accion: 'avisar' } : { accion: 'reintentar', esperaMs: esperaDeReintento(fallos) };
}

/**
 * Orden de las respuestas de una misma clase de petición: cada envío toma un número y solo la respuesta más nueva
 * que la ya aceptada se aplica; una vieja que llega tarde se descarta.
 */
export class OrdenDeRespuestas {
  private emitido = 0;
  private aceptado = 0;

  emitir(): number {
    return ++this.emitido;
  }

  aceptar(numero: number): boolean {
    if (numero < this.aceptado) return false;
    this.aceptado = numero;
    return true;
  }

  reiniciar(): void {
    this.aceptado = this.emitido;
  }
}

/** ¿Sigue vigente la respuesta que llega? Mismo intento en curso y misma sala que cuando se pidió. */
export function respuestaVigente(
  pedida: { attemptId: string; mapKey?: string | null },
  actual: { attemptId?: string | null; status?: string | null; mapKey?: string | null },
): boolean {
  return actual.attemptId === pedida.attemptId
    && actual.status === 'IN_PROGRESS'
    && (pedida.mapKey === undefined || actual.mapKey === pedida.mapKey);
}

/** Lo que pasa con una decisión cuyo envío falló. */
export type VeredictoDeEnvio = 'plazo' | 'conciliar' | 'conservar';

/**
 * Plazo vencido o fallo de red/servidor: el resultado sigue incierto, la intención se conserva y se reenvía con el mismo
 * `requestId`. Un 4xx no basta para darla por perdida: el primer envío pudo haberse aplicado; se consulta el intento.
 */
export function veredictoDeEnvio(err: unknown): VeredictoDeEnvio {
  if (esPlazoVencido(err)) return 'plazo';
  // Sin consentimiento el servidor rechaza antes de tocar nada: no hay resultado incierto que consultar.
  if (isConsentRequiredError(err)) return 'conservar';
  if (err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500) return 'conciliar';
  return 'conservar';
}

/** La intención de elegir una opción: su `requestId` es idempotente en el servidor. */
export interface IntencionDeDecision {
  attemptId: string;
  nodeId: number;
  decisionOptionId: number;
  requestId: string;
}

/** Visto el intento tal como lo tiene el servidor: ¿la decisión ya se aplicó (avanzó de nodo o cerró) o sigue pendiente? */
export function veredictoDeIntencion(
  intencion: Pick<IntencionDeDecision, 'nodeId'>,
  servidor: { status: string; currentNode: { id: number } },
): 'aplicada' | 'pendiente' {
  return servidor.status === 'COMPLETED' || servidor.currentNode.id !== intencion.nodeId ? 'aplicada' : 'pendiente';
}

/** Lo mínimo del almacenamiento de la sesión; con `try/catch` por fuera de quien lo pasa no hace falta. */
export interface AlmacenSimple {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const claveIntencion = (attemptId: string) => `siep_decision_pendiente_${attemptId}`;
const claveLectura = (attemptId: string) => `siep_punto_lectura_${attemptId}`;

function leerJson(almacen: AlmacenSimple, clave: string): Record<string, unknown> | null {
  try {
    const crudo = almacen.getItem(clave);
    const valor = crudo ? JSON.parse(crudo) : null;
    return valor && typeof valor === 'object' ? valor as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function escribirJson(almacen: AlmacenSimple, clave: string, valor: unknown): void {
  try {
    almacen.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento (modo privado, cuota) la marca no se guarda: el juego sigue y lo pendiente se resuelve en línea.
  }
}

function quitar(almacen: AlmacenSimple, clave: string): void {
  try {
    almacen.removeItem(clave);
  } catch {
    // Ídem.
  }
}

export function guardarIntencion(almacen: AlmacenSimple, intencion: IntencionDeDecision): void {
  escribirJson(almacen, claveIntencion(intencion.attemptId), intencion);
}

export function leerIntencion(almacen: AlmacenSimple, attemptId: string): IntencionDeDecision | null {
  const crudo = leerJson(almacen, claveIntencion(attemptId));
  if (!crudo || crudo['attemptId'] !== attemptId) return null;
  const { nodeId, decisionOptionId, requestId } = crudo;
  if (typeof nodeId !== 'number' || typeof decisionOptionId !== 'number' || typeof requestId !== 'string' || !requestId) return null;
  return { attemptId, nodeId, decisionOptionId, requestId };
}

export function borrarIntencion(almacen: AlmacenSimple, attemptId: string): void {
  quitar(almacen, claveIntencion(attemptId));
}

/** Qué conversación abierta iba, en qué línea y en qué escena (nodo): al recargar con otra escena el punto no se reabre. */
export interface PuntoDeLectura {
  attemptId: string;
  nodeId: number;
  objectKey: string;
  dialogueKey: string;
  line: number;
}

export function guardarLectura(almacen: AlmacenSimple, punto: PuntoDeLectura): void {
  escribirJson(almacen, claveLectura(punto.attemptId), punto);
}

export function leerLectura(almacen: AlmacenSimple, attemptId: string): PuntoDeLectura | null {
  const crudo = leerJson(almacen, claveLectura(attemptId));
  if (!crudo || crudo['attemptId'] !== attemptId) return null;
  const { nodeId, objectKey, dialogueKey, line } = crudo;
  if (typeof nodeId !== 'number' || typeof objectKey !== 'string' || !objectKey || typeof dialogueKey !== 'string'
      || typeof line !== 'number' || !Number.isInteger(line) || line < 0) return null;
  return { attemptId, nodeId, objectKey, dialogueKey, line };
}

export function borrarLectura(almacen: AlmacenSimple, attemptId: string): void {
  quitar(almacen, claveLectura(attemptId));
}

/**
 * ¿Se guarda el punto de lectura de esta conversación? Solo la de un objeto del mundo (se reabre por el servidor): ni la
 * ficha de una herramienta ni una conversación sin líneas.
 */
export function esLecturaRecuperable(
  seleccion: { key: string; type?: string } | null,
  dialogo: { key: string; lines?: readonly unknown[] } | null,
): boolean {
  if (!seleccion || !dialogo || !dialogo.lines?.length) return false;
  return !seleccion.key.startsWith('tool-') && !seleccion.key.startsWith('npc:') && seleccion.type !== 'EXIT';
}

/** La clave del personaje de ambiente de una conversación `npc-<clave>`; `null` si la conversación no es de uno. */
export function claveDeNpc(dialogueKey: string): string | null {
  return dialogueKey.startsWith('npc-') && dialogueKey.length > 4 ? dialogueKey.slice(4) : null;
}

/**
 * Qué se guarda como «objeto» del punto de lectura: la clave del objeto del mundo, o la conversación `npc-<clave>` de un
 * personaje de ambiente (que se reabre en el cliente, sin pedir nada al servidor). `null` si no se guarda.
 */
export function objetoDeLectura(
  seleccion: { key: string; type?: string } | null,
  dialogo: { key: string; lines?: readonly unknown[] } | null,
): string | null {
  if (esLecturaRecuperable(seleccion, dialogo)) return seleccion!.key;
  return dialogo?.lines?.length && claveDeNpc(dialogo.key) ? dialogo.key : null;
}

/** La línea con la que arranca un diálogo: la guardada si es de esa conversación y existe; si no, la primera. */
export function lineaDeArranque(
  inicio: { key: string; line: number } | null,
  dialogo: { key: string; lines?: readonly unknown[] } | null,
): number {
  if (!inicio || !dialogo?.lines?.length || inicio.key !== dialogo.key) return 0;
  return Math.max(0, Math.min(inicio.line, dialogo.lines.length - 1));
}
